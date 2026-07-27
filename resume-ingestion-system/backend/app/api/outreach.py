import os
import json
import base64
from email.mime.text import MIMEText
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from supabase import create_client

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Your custom security dependency
from app.api.deps import require_role 

router = APIRouter()

# 1. Define the exact JSON structure React is sending us
class CandidateRecipient(BaseModel):
    id: str
    name: str
    email: str

class BulkOutreachPayload(BaseModel):
    candidates: List[CandidateRecipient]
    subject: str
    body: str

@router.post("/api/send-bulk-outreach")
async def send_bulk_outreach(payload: BulkOutreachPayload, auth_data: dict = Depends(require_role(["admin", "member"]))):
    print(f"🚀 Initiating Bulk Outreach for {len(payload.candidates)} candidates...")
    company_id = auth_data["company_id"]
    
    # 2. Connect to Supabase
    supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
    
    # 3. Fetch the company's active email token from the Vault
    token_res = supabase.table("company_email_integrations").select("*").eq("company_id", company_id).execute()
    
    if not token_res.data:
        raise HTTPException(status_code=400, detail="No email account connected. Please connect Gmail or Outlook in Settings.")
        
    integration = token_res.data[0]
    provider = integration["provider"]
    sent_count = 0

    # 4. ROUTE: GMAIL OUTREACH
    if provider == "gmail":
        try:
            # Reconstruct Google Credentials (auto-refreshes if needed)
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            with open(os.path.join(base_dir, 'client_secret.json'), 'r') as f:
                secrets = json.load(f)['web']
                
            creds = Credentials(
                token=integration["access_token"],
                refresh_token=integration["refresh_token"],
                token_uri=secrets["token_uri"],
                client_id=secrets["client_id"],
                client_secret=secrets["client_secret"]
            )
            
            service = build('gmail', 'v1', credentials=creds)
            
            for candidate in payload.candidates:
                # Personalize the email!
                first_name = candidate.name.split(" ")[0]
                personalized_body = payload.body.replace("[Name]", first_name)
                
                # Format the MIME Email
                message = MIMEText(personalized_body)
                message['to'] = candidate.email
                message['subject'] = payload.subject
                raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
                
                # FIRE THE EMAIL
                service.users().messages().send(userId='me', body={'raw': raw_message}).execute()
                
                # Log it in the CRM
                _log_communication(supabase, candidate.id, company_id, integration["email_address"], payload.subject, "outbound_email")
                sent_count += 1
                
        except Exception as e:
            print(f"🚨 Gmail Send Error: {e}")
            raise HTTPException(status_code=500, detail="Failed to send via Google Workspace.")

    # 5. ROUTE: MICROSOFT OUTLOOK OUTREACH
    elif provider == "outlook":
        try:
            headers = {
                "Authorization": f"Bearer {integration['access_token']}",
                "Content-Type": "application/json"
            }
            
            async with httpx.AsyncClient() as client:
                for candidate in payload.candidates:
                    first_name = candidate.name.split(" ")[0]
                    personalized_body = payload.body.replace("[Name]", first_name)
                    
                    email_payload = {
                        "message": {
                            "subject": payload.subject,
                            "body": {
                                "contentType": "Text",
                                "content": personalized_body
                            },
                            "toRecipients": [{"emailAddress": {"address": candidate.email}}]
                        },
                        "saveToSentItems": "true"
                    }
                    
                    # FIRE THE EMAIL VIA MS GRAPH API
                    resp = await client.post("https://graph.microsoft.com/v1.0/me/sendMail", headers=headers, json=email_payload)
                    
                    if resp.status_code in [200, 202]:
                        _log_communication(supabase, candidate.id, company_id, integration["email_address"], payload.subject, "outbound_email")
                        sent_count += 1
                    else:
                        print(f"⚠️ Outlook API Error: {resp.text}")
                        
        except Exception as e:
            print(f"🚨 Outlook Send Error: {e}")
            raise HTTPException(status_code=500, detail="Failed to send via Microsoft Outlook.")

    return {"status": "success", "sent_count": sent_count}


# Helper function to keep a history of what we sent to candidates
def _log_communication(supabase, candidate_id, company_id, sender_email, subject, comm_type):
    try:
        supabase.table("communications").insert({
            "candidate_id": candidate_id,
            "company_id": company_id,
            "type": comm_type,
            "sender": sender_email,
            "subject": subject
        }).execute()
    except Exception as e:
        print(f"⚠️ Failed to log communication: {e}")