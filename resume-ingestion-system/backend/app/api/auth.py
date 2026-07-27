import os
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token # 🚀 ADDED: To decode the Google profile
from google.auth.transport import requests as google_requests # 🚀 ADDED: Required for verifying the token
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

CLIENT_CONFIG = {
    "web": {
        "client_id": os.getenv("GOOGLE_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "openid", "email", "profile"
]

@router.get("/google/login")
async def google_login(company_id: str):
    """Redirects the client to the Google Consent Screen"""
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = "http://localhost:8000/api/auth/google/callback"
    
    auth_url, state = flow.authorization_url(
        prompt='consent',
        access_type='offline',
        state=company_id 
    )
    
    return {"url": auth_url}

@router.get("/google/callback")
async def google_callback(request: Request, state: str, code: str):
    """Google redirects back here with the authorization code"""
    company_id = state
    
    try:
        flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
        flow.redirect_uri = "http://localhost:8000/api/auth/google/callback"
        
        # Exchange the code for the permanent tokens
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # 🚀 THE FIX: Properly extract the real email address from Google's ID token
        token_request = google_requests.Request()
        id_info = id_token.verify_oauth2_token(
            credentials.id_token, 
            token_request, 
            CLIENT_CONFIG["web"]["client_id"]
        )
        real_email_address = id_info.get('email')
        
        # NOTE: In a real production app, you must ENCRYPT credentials.refresh_token here!
        refresh_token = credentials.refresh_token
        
        # Save to Supabase using the REAL email and REAL company ID
        supabase.table("user_mail_integrations").insert({
            "company_id": company_id,
            "provider": "google",
            "refresh_token": refresh_token, 
            "email_address": real_email_address # 🚀 Now uses their actual Gmail address
        }).execute()
        
        # Redirect back to your React app Settings page
        return RedirectResponse(url="http://localhost:5173/settings?mail_connected=true")
        
    except Exception as e:
        print(f"❌ OAuth Error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"OAuth Failed: {str(e)}")