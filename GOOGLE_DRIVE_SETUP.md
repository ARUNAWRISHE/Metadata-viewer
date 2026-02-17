# Google Drive Integration Setup

This guide explains how to set up Google Drive integration for storing uploaded videos.

## Overview

After a faculty member uploads a video and it passes validation:
1. The video is uploaded to a fixed Google Drive folder
2. The local copy is deleted
3. A shareable Drive link is stored in the database
4. The link is displayed on admin/faculty dashboards

## Prerequisites

- Google Cloud Project with Drive API enabled
- Service Account with Drive API access
- The service account must have Editor/Writer access to the target Drive folder

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Drive API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### 2. Create a Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in:
   - Service account name: `metaview-drive-uploader`
   - Service account ID: (auto-generated)
4. Click "Create and Continue"
5. Grant the role: "Basic" > "Editor" (or skip)
6. Click "Done"

### 3. Generate Service Account Key

1. In the Service Accounts list, click on the newly created account
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select **JSON** format
5. Click "Create" — this downloads a JSON file
6. **Rename** the downloaded file to `service_account.json`
7. **Move** it to the project root directory:
   ```
   /Users/test/Documents/Metadata-viewer/service_account.json
   ```

### 4. Share the Target Google Drive Folder

1. Open Google Drive and navigate to the target folder:
   https://drive.google.com/drive/folders/1nYpYSI8XGNk46uiXN9vspM1LkNq3xlAv

2. Right-click the folder > "Share"
3. Add the **service account email** (found in the JSON file under `client_email`):
   ```
   metaview-drive-uploader@your-project-id.iam.gserviceaccount.com
   ```
4. Set permission to **Editor**
5. Click "Send" or "Share"

### 5. Install Python Dependencies

```bash
source env/bin/activate
pip install -r requirements.txt
```

This installs:
- `google-api-python-client`
- `google-auth`
- `google-auth-oauthlib`
- `google-auth-httplib2`

### 6. Verify Setup

Start the backend server and check Drive connection:

```bash
# Start server
python main.py

# In another terminal, test the connection (requires admin auth):
curl -X GET "http://localhost:8000/api/admin/drive-status" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Expected response if configured correctly:
```json
{
  "connected": true,
  "message": "Connected to Google Drive folder: FolderName"
}
```

## Environment Variables (Optional)

You can customize the service account file location:

```bash
export GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/your/service_account.json
```

Default location: `./service_account.json` (project root)

## Security Notes

⚠️ **IMPORTANT**: Never commit `service_account.json` to version control!

Add to `.gitignore`:
```
service_account.json
```

## Troubleshooting

### "invalid_scope: Bad Request"
- This means your existing `token.json` was created with different OAuth scopes.
- Delete `token.json` and regenerate it using:
   - `python setup_drive_token.py`
- Then restart backend and retry upload.
- If you deploy via environment variables, regenerate and update `GOOGLE_TOKEN_JSON` as well.

### "Service account file not found"
- Ensure `service_account.json` is in the project root
- Check the filename is exactly `service_account.json`

### "Target folder not found or not accessible"
- Verify the folder ID in `drive_service.py` matches your target folder
- Ensure the service account email has Editor access to the folder

### "Google Drive API error"
- Check if Google Drive API is enabled in your Cloud project
- Verify the service account has the correct permissions

### Upload succeeds but no link stored
- Check server logs for any Drive-related errors
- Verify the service account can create files in the target folder

## Files Modified

- `models.py` — Added `drive_url` column to `VideoUpload`
- `main.py` — Integrated Drive upload after validation
- `drive_service.py` — New module for Google Drive operations
- `requirements.txt` — Added Google API dependencies
- `client/src/pages/ManagePage.tsx` — Display Drive links in UI

## Database Migration

If you have existing data, run this SQL to add the new column:

```sql
ALTER TABLE video_uploads ADD COLUMN drive_url VARCHAR(500);
```

Or simply delete `metaview.db` and restart (tables are auto-created).
