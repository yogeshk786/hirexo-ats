import os
import re
import base64
import json
import uuid 
from email.message import EmailMessage 
from email.utils import parsedate_to_datetime # 🚀 Added for date formatting
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.exceptions import RefreshError
from supabase import create_client, Client
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

class MultiTenantGmailService:
    def __init__(self, company_id: str, explicit_base_dir=None):
        """Initializes the Gmail API connection for a specific company."""
        self.company_id = company_id
        # 🚀 UPDATED: Added 'gmail.send' and 'gmail.modify' scopes 
        self.scopes = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send']

        # Dynamically find the backend root folder 
        if explicit_base_dir:
            self.base_dir = explicit_base_dir
        else:
            self.base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            
        self.client_secrets_path = os.path.join(self.base_dir, 'client_secret.json')
        
        # Safely grab Supabase credentials whether they have the VITE_ prefix or not
        supabase_url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("🚨 Missing Supabase credentials in .env file! Gmail Service cannot connect.")
            
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.service = self._authenticate()

    def _authenticate(self):
        """Fetches tokens from Supabase, auto-refreshes if expired, and connects to Gmail."""
        # 1. Fetch the company's tokens from the database vault
        response = self.supabase.table("company_email_integrations").select("*").eq("company_id", self.company_id).execute()
        
        if not response.data:
            raise Exception(f"No active email integration found for company {self.company_id}")
        
        integration = response.data[0]
        access_token = integration['access_token']
        refresh_token = integration['refresh_token']
        
        # 2. Extract Google App configurations from client_secret.json
        with open(self.client_secrets_path, 'r') as f:
            secrets = json.load(f)['web']
            
        client_id = secrets['client_id']
        client_secret = secrets['client_secret']
        token_uri = secrets['token_uri']

        # 3. Build the Google Credentials object directly from memory
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri=token_uri,
            client_id=client_id,
            client_secret=client_secret,
            scopes=self.scopes
        )
        
        # 4. Check if the token expired. If yes, refresh it and save the new key to Supabase!
        if not creds.valid:
            if creds.expired and creds.refresh_token:
                try:
                    print(f"⏳ Refreshing Google API access token for company {self.company_id}...")
                    creds.refresh(Request())
                    
                    # Update Supabase with the freshly generated access token
                    self.supabase.table("company_email_integrations").update({
                        "access_token": creds.token,
                        "expires_at": creds.expiry.isoformat() if creds.expiry else None
                    }).eq("company_id", self.company_id).execute()
                    
                except RefreshError:
                    print(f"🚨 Refresh Token revoked by user for company {self.company_id}.")
                    raise Exception("Integration disconnected. Admin must re-authenticate in settings.")
            else:
                raise Exception("Token invalid and no refresh token available.")
        
        return build('gmail', 'v1', credentials=creds)

    def send_message(self, to: str, subject: str, body: str):
        """Constructs and sends an email via the connected Gmail account."""
        try:
            # 1. Construct the email message
            message = EmailMessage()
            message.set_content(body)
            message['To'] = to
            message['Subject'] = subject
            
            # 2. Encode the message as base64url (required by Gmail API)
            encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            create_message = {'raw': encoded_message}

            # 3. Fire it through Google's servers
            send_request = self.service.users().messages().send(
                userId="me", 
                body=create_message
            ).execute()
            
            print(f"✅ Email physically sent via Google! Message ID: {send_request['id']}")
            return send_request
            
        except Exception as e:
            print(f"🚨 Error sending email via Google API: {e}")
            raise e

    def _extract_parts_recursively(self, payload):
        """Recursively extracts all attachment components regardless of structural nesting."""
        parts_list = []
        
        if payload.get('filename') and payload.get('body', {}).get('attachmentId'):
            parts_list.append(payload)
            
        if 'parts' in payload:
            for part in payload['parts']:
                parts_list.extend(self._extract_parts_recursively(part))
                
        return parts_list

    def download_resumes(self):
        """Searches for ANY emails with document attachments in the Inbox and archives them after downloading."""
        print(f"🔍 Syncing with Gmail API Ingestion Layer for Company: {self.company_id}...")
        
        save_dir = os.path.join(self.base_dir, 'raw_resumes', self.company_id)
        os.makedirs(save_dir, exist_ok=True)

        try:
            query = "in:inbox has:attachment (filename:pdf OR filename:doc OR filename:docx)"
            results = self.service.users().messages().list(userId='me', q=query, maxResults=100).execute()
            messages = results.get('messages', [])

            if not messages:
                return 0

            total_downloaded = 0

            for message in messages:
                msg = self.service.users().messages().get(userId='me', id=message['id']).execute()
                
                headers = msg['payload'].get('headers', [])
                sender_email = "Unknown Sender"
                email_subject = "No Subject"
                email_date = "Unknown Date"

                for header in headers:
                    if header['name'] == 'From':
                        sender_email = header['value']
                    elif header['name'] == 'Subject':
                        email_subject = header['value']
                    elif header['name'] == 'Date':
                        email_date = header['value']

                all_attachments = self._extract_parts_recursively(msg['payload'])
                
                if not all_attachments and 'body' in msg['payload'] and 'attachmentId' in msg['payload']['body']:
                     all_attachments = [msg['payload']]
                     
                for part in all_attachments:
                    attachment_id = part['body']['attachmentId']
                    original_file_name = part.get('filename', '').strip()
                    
                    if not original_file_name.lower().endswith(('.pdf', '.doc', '.docx')):
                        continue

                    safe_file_name = re.sub(r'[<>:"/\\|?*]', '_', original_file_name)
                    file_path = os.path.join(save_dir, safe_file_name)
                    
                    if os.path.exists(file_path):
                        name, ext = os.path.splitext(safe_file_name)
                        safe_file_name = f"{name}_{uuid.uuid4().hex[:6]}{ext}"
                        file_path = os.path.join(save_dir, safe_file_name)

                    attachment = self.service.users().messages().attachments().get(
                        userId='me', messageId=message['id'], id=attachment_id
                    ).execute()

                    file_data = base64.urlsafe_b64decode(attachment['data'].encode('UTF-8'))

                    with open(file_path, 'wb') as f:
                        f.write(file_data)
                        
                    metadata = {
                        "company_id": self.company_id,
                        "sender": sender_email,
                        "subject": email_subject,
                        "date": email_date,
                        "original_filename": original_file_name
                    }
                    
                    metadata_path = os.path.join(save_dir, f"{safe_file_name}_metadata.json")
                    with open(metadata_path, 'w', encoding='utf-8') as mf:
                        json.dump(metadata, mf, indent=4)

                    print(f"📥 Downloaded Attachment: {safe_file_name}")
                    total_downloaded += 1

                self.service.users().messages().modify(
                    userId='me', 
                    id=message['id'], 
                    body={'removeLabelIds': ['INBOX']}
                ).execute()
                print(f"📦 Message processed and safely archived.")

            if total_downloaded > 0:
                print(f"✅ Ingestion cycle complete. Total downloaded profiles: {total_downloaded}")
                
            return total_downloaded

        except Exception as e:
            print(f"🚨 Ingestion loop exception caught: {e}")
            return 0

    def sync_inbound_replies(self):
        """Fetches unread emails, matches them to candidates, and logs them to the ATS."""
        print(f"🔄 Syncing inbound replies for company: {self.company_id}...")
        try:
            results = self.service.users().messages().list(userId='me', q="in:inbox is:unread", maxResults=10).execute()
            messages = results.get('messages', [])

            if not messages:
                print("No new unread messages.")
                return 0

            processed_count = 0
            for msg_ref in messages:
                msg_id = msg_ref['id']

                # 🚀 FIX 1: THE DE-DUPLICATOR
                # Check if this exact message is already in the database
                existing = self.supabase.table("communications").select("id").eq("message_id", msg_id).execute()
                if existing.data:
                    print(f"♻️ Skipping duplicate message. Already saved in ATS.")
                    # Still mark it as read so it clears out of the inbox queue
                    self.service.users().messages().modify(userId='me', id=msg_id, body={'removeLabelIds': ['UNREAD']}).execute()
                    continue

                msg = self.service.users().messages().get(userId='me', id=msg_id, format='full').execute()
                
                # 2. Extract Headers (Sender, Subject, AND Date for the database)
                headers = msg['payload'].get('headers', [])
                sender_raw = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown Sender')
                subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
                email_date = next((h['value'] for h in headers if h['name'] == 'Date'), None)
                thread_id = msg.get('threadId')
                
                # 🚀 FIX 2: DATE FORMATTING
                # Convert the messy string into a clean database timestamp
                clean_date = None
                if email_date:
                    try:
                        dt = parsedate_to_datetime(email_date)
                        clean_date = dt.isoformat()
                    except Exception:
                        clean_date = None # Fallback to null if parsing fails

                sender_email_match = re.search(r'<([^>]+)>', sender_raw)
                sender_email = sender_email_match.group(1).lower() if sender_email_match else sender_raw.lower()

                # 3. Verify if this sender is actually a candidate in our ATS
                candidate_res = self.supabase.table("candidates").select("id").eq("email", sender_email).execute()
                
                if not candidate_res.data:
                    print(f"⚠️ Ignored email from {sender_email} (Not a registered candidate).")
                    self.service.users().messages().modify(userId='me', id=msg_id, body={'removeLabelIds': ['UNREAD']}).execute()
                    continue
                
                candidate_id = candidate_res.data[0]['id']

                # 🚀 4. NEW LOGIC: FIND THE JOB ID CONTEXT (Fixed syntax crash)
                detected_job_id = None
                
                # Attempt A: Match by Thread ID safely using pure python to filter
                existing_thread = self.supabase.table("communications").select("job_id").eq("thread_id", thread_id).execute()
                
                # Filter out nulls in python to avoid the `.not_()` Supabase-py crash
                valid_jobs = [row['job_id'] for row in existing_thread.data if row.get('job_id')]
                
                if valid_jobs:
                    detected_job_id = valid_jobs[0]
                else:
                    # Attempt B: Fallback to their most recent job application
                    recent_app = self.supabase.table("job_applications").select("job_id").eq("candidate_id", candidate_id).order("created_at", desc=True).limit(1).execute()
                    if recent_app.data:
                        detected_job_id = recent_app.data[0]['job_id']

                # 5. Extract the actual text body of the email
                body = "No text body found."
                parts = msg['payload'].get('parts', [])
                
                if not parts and 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                    body = base64.urlsafe_b64decode(msg['payload']['body']['data'].encode('UTF-8')).decode('utf-8')
                else:
                    for part in parts:
                        if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                            body = base64.urlsafe_b64decode(part['body']['data'].encode('UTF-8')).decode('utf-8')
                            break

                # 🚀 FIX 3: THE CHAT CLEANER (Regex - Bulletproof)
                # (?is) matches across line breaks, handling hidden newlines
                body = re.split(r'(?is)\n\s*On\s+.*?wrote:', body)[0]
                body = re.split(r'(?is)_-+\s*Original Message\s*_-+', body)[0] # Outlook/Yahoo fallback
                body = re.sub(r'(?m)^>.*$', '', body).strip()

                # 6. Insert the reply with ALL correct metadata mapping AND JOB CONTEXT
                self.supabase.table("communications").insert({
                    "candidate_id": candidate_id,
                    "job_id": detected_job_id,  # 🚀 CONTEXT LOCKED TO PIPELINE!
                    "company_id": self.company_id,
                    "type": "inbound_email",
                    "sender": sender_raw,
                    "subject": subject,
                    "content": body,
                    "message_id": msg_id,
                    "thread_id": thread_id,
                    "received_at": clean_date  
                }).execute()

                # 7. Mark the email as READ in Gmail so we don't sync it twice
                self.service.users().messages().modify(
                    userId='me', 
                    id=msg_id, 
                    body={'removeLabelIds': ['UNREAD']}
                ).execute()

                print(f"✅ Successfully logged clean reply from {sender_email} into ATS (Job ID: {detected_job_id})")
                processed_count += 1

            return processed_count

        except Exception as e:
            print(f"🚨 Error syncing replies: {e}")
            return 0