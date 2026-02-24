import os.path
import json
import tempfile
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/drive"]

def main():
    """
    Generates a token.json file for Google Drive API using OAuth 2.0.
    This solves the "storageQuotaExceeded" error by using your personal account's storage.
    """
    creds = None
    # The file token.json stores the user's access and refresh tokens
    if os.path.exists("token.json"):
        try:
            creds = Credentials.from_authorized_user_file("token.json", SCOPES)
        except Exception:
            print("Existing token.json is invalid. Regenerating...")
            creds = None

    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                print("Token expired and refresh failed. Re-authenticating...")
                creds = None

        if not creds:
            client_secret_json_env = os.environ.get("GOOGLE_CLIENT_SECRET_JSON", "").strip()
            client_secret_file = "client_secret.json"

            if client_secret_json_env:
                try:
                    data = json.loads(client_secret_json_env)
                    temp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
                    with temp:
                        json.dump(data, temp)
                    client_secret_file = temp.name
                except Exception:
                    print("GOOGLE_CLIENT_SECRET_JSON is set but invalid JSON. Falling back to client_secret.json file...")

            if not os.path.exists(client_secret_file):
                print("\nCRITICAL ERROR: 'client_secret.json' not found!")
                print("---------------------------------------------------")
                print("1. Go to Google Cloud Console > APIs & Services > Credentials")
                print("2. Click 'Create Credentials' > 'OAuth client ID'")
                print("3. Choose 'Desktop app'")
                print("4. Download the JSON file and rename it to 'client_secret.json'")
                print("5. Place it in this folder and run this script again.")
                return

            print("Launching browser for authentication...")
            flow = InstalledAppFlow.from_client_secrets_file(
                client_secret_file, SCOPES
            )
            creds = flow.run_local_server(port=0)

        # Save the credentials for the next run
        with open("token.json", "w") as token:
            token.write(creds.to_json())
            print("\nSUCCESS: 'token.json' has been created!")
            print("1. Your backend will now use this file automatically.")
            print("2. For deployment, copy the contents of 'token.json' into a GOOGLE_TOKEN_JSON environment variable.")

if __name__ == "__main__":
    main()
