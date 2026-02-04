"""
Google Drive Upload Service
Handles uploading video files to a fixed Google Drive folder using a service account.
"""

import os
import logging
from typing import Optional, Tuple
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

# Local DB imports for faculty list
from database import SessionLocal
from models import Faculty

# Configure logging
logger = logging.getLogger(__name__)

def _extract_folder_id(folder_input: str) -> str:
    """
    Accepts a folder ID or a Drive folder URL and returns the folder ID.
    """
    if not folder_input:
        return ""
    if "/folders/" in folder_input:
        return folder_input.split("/folders/")[-1].split("?")[0].strip()
    return folder_input.strip()


# Target folder ID (can be overridden via env)
# If this ID is invalid/missing, the app will fallback to finding/creating a "Faculty Uploads" folder in Root.
_DEFAULT_FOLDER = "" 
DRIVE_FOLDER_ID = _extract_folder_id(
    os.environ.get("GOOGLE_DRIVE_FOLDER_URL", "")
    or os.environ.get("GOOGLE_DRIVE_FOLDER_ID", _DEFAULT_FOLDER)
)

# Global cache for the resolved root folder ID
_RESOLVED_ROOT_ID = None

# Path to service account credentials JSON file
# This should be placed in the project root and NOT committed to version control
SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")

# Service Account credentials as a JSON string (for deployment environments)
SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")

# User Oath2 Token as JSON string (Preferred for uploading files to prevent quota errors)
TOKEN_JSON_ENV = os.environ.get("GOOGLE_TOKEN_JSON")

# Scopes required for Google Drive API
SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.file"]


def get_drive_service():
    """
    Create and return an authenticated Google Drive service instance.
    Prioritizes User Credentials (token.json) to avoid Service Account quota limits.
    """
    creds = None
    
    # Priority 1: User Auth via Environment Variable (Best for Cloud)
    if TOKEN_JSON_ENV:
        try:
            import json
            info = json.loads(TOKEN_JSON_ENV)
            creds = Credentials.from_authorized_user_info(info, SCOPES)
            logger.info("Authenticated with Google Drive using GOOGLE_TOKEN_JSON")
        except Exception as e:
            logger.error(f"Failed to parse GOOGLE_TOKEN_JSON: {e}")

    # Priority 2: User Auth via Local File (Best for Local Development)
    elif os.path.exists("token.json"):
        try:
            creds = Credentials.from_authorized_user_file("token.json", SCOPES)
            logger.info("Authenticated with Google Drive using token.json")
        except Exception as e:
            logger.error(f"Failed to load token.json: {e}")

    # Priority 3: Service Account via Environment Variable
    elif SERVICE_ACCOUNT_JSON:
        try:
            import json
            info = json.loads(SERVICE_ACCOUNT_JSON)
            creds = service_account.Credentials.from_service_account_info(
                info, scopes=SCOPES
            )
            logger.info("Authenticated with Google Drive using GOOGLE_SERVICE_ACCOUNT_JSON env var")
        except Exception as e:
            logger.error(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: {e}")
    
    # Priority 4: Service Account via Local File
    elif os.path.exists(SERVICE_ACCOUNT_FILE):
        try:
            creds = service_account.Credentials.from_service_account_file(
                SERVICE_ACCOUNT_FILE, scopes=SCOPES
            )
            logger.info(f"Authenticated with Google Drive using {SERVICE_ACCOUNT_FILE}")
        except Exception as e:
            logger.error(f"Failed to load service account file: {e}")
            
    if not creds:
        logger.warning("Google Drive upload will be skipped. credentials not found.")
        return None
    
    try:
        service = build("drive", "v3", credentials=creds)
        return service
    except Exception as e:
        logger.error(f"Failed to initialize Google Drive service: {e}")
        return None


def _get_db_session() -> Session:
    """Return a new DB session."""
    return SessionLocal()


def _get_faculty_names_from_db() -> list:
    """Query the local database and return a list of faculty names."""
    db = None
    try:
        db = _get_db_session()
        faculties = db.query(Faculty).all()
        names = [f.name for f in faculties if f and f.name]
        return names
    except Exception as e:
        logger.warning(f"Could not read faculties from DB: {e}")
        return []
    finally:
        if db:
            try:
                db.close()
            except Exception:
                pass


def get_target_root_id(service) -> Optional[str]:
    """
    Returns the effective root folder ID.
    1. Checks if configured DRIVE_FOLDER_ID is valid.
    2. If not, finds/creates 'Faculty Uploads' in the My Drive root.
    """
    global _RESOLVED_ROOT_ID
    if _RESOLVED_ROOT_ID:
        return _RESOLVED_ROOT_ID

    # 1. Try configured ID if it exists
    if DRIVE_FOLDER_ID:
        try:
            service.files().get(fileId=DRIVE_FOLDER_ID, fields="id").execute()
            logger.info(f"Using configured Drive folder ID: {DRIVE_FOLDER_ID}")
            _RESOLVED_ROOT_ID = DRIVE_FOLDER_ID
            return _RESOLVED_ROOT_ID
        except HttpError:
            logger.warning(f"Configured folder ID '{DRIVE_FOLDER_ID}' not found or inaccessible. Falling back to auto-discovery.")

    # 2. Fallback: Find or Create "Faculty Uploads" in Root
    folder_name = "Faculty Uploads"
    try:
        # Check if it exists in 'root'
        q = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
        results = service.files().list(q=q, spaces='drive', fields='files(id, name)').execute()
        files = results.get('files', [])
        
        if files:
            found_id = files[0]['id']
            logger.info(f"Found existing '{folder_name}' folder: {found_id}")
            _RESOLVED_ROOT_ID = found_id
            return found_id
        
        # Create it
        metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            # no parents = root
        }
        file = service.files().create(body=metadata, fields='id').execute()
        new_id = file.get('id')
        logger.info(f"Created new '{folder_name}' folder: {new_id}")
        _RESOLVED_ROOT_ID = new_id
        return new_id
        
    except Exception as e:
        logger.error(f"Failed to resolve root folder: {e}")
        return None


def _get_or_create_folder(service, folder_name: str, parent_id: str) -> Optional[str]:
    """Find a folder with `folder_name` under `parent_id`; create it if missing.

    Returns the folder ID or None on failure.
    """
    try:
        # Query for folder with given name under parent
        q = (
            "mimeType='application/vnd.google-apps.folder' and "
            f"name = '{folder_name.replace("'", "\\'")}' and '{parent_id}' in parents and trashed = false"
        )
        res = service.files().list(q=q, spaces='drive', fields='files(id, name)').execute()
        files = res.get('files', [])
        if files:
            return files[0].get('id')

        # Create folder
        metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id]
        }
        created = service.files().create(body=metadata, fields='id').execute()
        return created.get('id')
    except HttpError as e:
        logger.error(f"Drive API error while finding/creating folder '{folder_name}': {e}")
        return None
    except Exception as e:
        logger.error(f"Error while finding/creating folder '{folder_name}': {e}")
        return None


def ensure_faculty_folders(service) -> dict:
    """Ensure a folder exists for every faculty in the DB under the root folder.

    Returns a mapping of faculty name -> folder id (only for successfully found/created folders).
    """
    mapping = {}
    if service is None:
        logger.warning("No Drive service available to ensure faculty folders")
        return mapping

    root_id = get_target_root_id(service)
    if not root_id:
        logger.error("Could not determine root folder for faculty folders")
        return mapping

    faculty_names = _get_faculty_names_from_db()
    logger.info(f"Syncing {len(faculty_names)} faculty folders on Drive")
    for name in faculty_names:
        fid = _get_or_create_folder(service, name, root_id)
        if fid:
            mapping[name] = fid
    return mapping


def upload_to_drive(
    file_path: str,
    filename: str,
    faculty_name: str = "",
    period: Optional[int] = None
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Upload a video file to the configured Google Drive folder.
    """
    service = get_drive_service()
    
    if service is None:
        return False, None, "Google Drive service not configured"
    
    if not os.path.exists(file_path):
        return False, None, f"File not found: {file_path}"
    
    try:
        # Determine root folder
        root_id = get_target_root_id(service)
        if not root_id:
            return False, None, "Could not find or create destination folder on Drive"

        # Determine target parent (faculty folder or root)
        target_parents = [root_id]

        if faculty_name:
            # ensure faculty folder exists (create if missing)
            faculty_folder_id = _get_or_create_folder(service, faculty_name, root_id)
            if faculty_folder_id:
                target_parents = [faculty_folder_id]

        # Create a descriptive filename for Drive using format: date_period
        from datetime import datetime
        date_str = datetime.now().strftime("%Y%m%d")
        extension = os.path.splitext(filename)[1] or ""
        if period is not None:
            drive_filename = f"{date_str}_{period}{extension}"
        else:
            drive_filename = f"{date_str}{extension}"

        # Clean up filename (remove special characters that might cause issues)
        drive_filename = "".join(c for c in drive_filename if c.isalnum() or c in "._- ")
        
        # Determine MIME type based on extension
        extension = os.path.splitext(filename)[1].lower()
        mime_types = {
            ".mp4": "video/mp4",
            ".avi": "video/x-msvideo",
            ".mov": "video/quicktime",
            ".mkv": "video/x-matroska",
            ".webm": "video/webm",
            ".wmv": "video/x-ms-wmv",
            ".flv": "video/x-flv",
        }
        mime_type = mime_types.get(extension, "video/mp4")
        
        # File metadata for Google Drive
        file_metadata = {
            "name": drive_filename,
            "parents": target_parents
        }
        
        # Create media upload object with resumable upload for large files
        media = MediaFileUpload(
            file_path,
            mimetype=mime_type,
            resumable=True,
            chunksize=10 * 1024 * 1024  # 10MB chunks for resumable upload
        )
        
        logger.info(f"Uploading {filename} to Google Drive as {drive_filename}...")
        
        # Execute the upload
        request = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, webViewLink, webContentLink",
            supportsAllDrives=True
        )
        
        # Handle resumable upload with progress
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                logger.info(f"Upload progress: {int(status.progress() * 100)}%")
        
        file_id = response.get("id")
        web_view_link = response.get("webViewLink")
        
        logger.info(f"Upload successful! File ID: {file_id}")
        logger.info(f"Web View Link: {web_view_link}")
        
        # Make the file accessible via link (anyone with link can view)
        try:
            service.permissions().create(
                fileId=file_id,
                body={
                    "type": "anyone",
                    "role": "reader"
                },
                supportsAllDrives=True
            ).execute()
            logger.info("File permissions set to 'anyone with link can view'")
        except HttpError as perm_error:
            logger.warning(f"Could not set file permissions: {perm_error}")
            # Continue anyway - the file is uploaded
        
        return True, web_view_link, None
        
    except HttpError as error:
        error_msg = f"Google Drive API error: {error}"
        logger.error(error_msg)
        return False, None, error_msg
    except Exception as e:
        error_msg = f"Unexpected error during upload: {e}"
        logger.error(error_msg)
        return False, None, error_msg


def delete_from_drive(file_id: str) -> bool:
    """
    Delete a file from Google Drive by its file ID.
    
    Args:
        file_id: The Google Drive file ID
    
    Returns:
        True if deletion was successful, False otherwise
    """
    service = get_drive_service()
    
    if service is None:
        return False
    
    try:
        service.files().delete(fileId=file_id).execute()
        logger.info(f"Deleted file from Google Drive: {file_id}")
        return True
    except HttpError as error:
        logger.error(f"Failed to delete file from Drive: {error}")
        return False


def check_drive_connection() -> Tuple[bool, str]:
    """
    Check if Google Drive service is properly configured and accessible.
    """
    # Simply check if we can get a service object (Token or Service Account)
    service = get_drive_service()
    if service is None:
        if os.path.exists("token.json") or os.environ.get("GOOGLE_TOKEN_JSON"):
             return False, "Failed to initialize Drive service with Token."
        if os.path.exists(SERVICE_ACCOUNT_FILE) or SERVICE_ACCOUNT_JSON:
             return False, "Failed to initialize Drive service with Service Account."
        return False, "No credentials found (token.json or service_account.json)."
    
    try:
        # Try to resolve or create the root folder
        root_id = get_target_root_id(service)
        if not root_id:
             return False, "Connected, but failed to find or create 'Faculty Uploads' folder."

        # Get folder details for msg
        folder = service.files().get(fileId=root_id, fields="name").execute()
        folder_name = folder.get('name', 'Unknown')
        
        logger.info(f"Connected to Google Drive folder: {folder_name} ({root_id})")

        # Ensure faculty subfolders exist
        created = ensure_faculty_folders(service)
        return True, f"Connected to Google Drive folder: '{folder_name}'; synced {len(created)} faculty folders"

    except Exception as e:
        return False, f"Connection check failed: {e}"
