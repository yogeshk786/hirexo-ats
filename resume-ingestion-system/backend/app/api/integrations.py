import os
import json
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse

# Google OAuth Libraries
from google_auth_oauthlib.flow import Flow

# Microsoft OAuth Libraries
import msal

# Supabase
from supabase import create_client

# Your custom security dependency
from app.api.deps import require_role 

router = APIRouter()

# ==========================================
# ⚙️ CONFIGURATION & SCOPES
# ==========================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GOOGLE_CLIENT_SECRETS_FILE = os.path.join(BASE_DIR, "client_secret.json")

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1' # Allow HTTP for local testing
GOOGLE_REDIRECT_URI = "http://localhost:8000/api/auth/google/callback"
GOOGLE_SCOPES = [
    'openid', 
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send' # 🚀 THE FIX: Added permission to send emails!
]

# Microsoft Configuration
MS_CLIENT_ID = os.environ.get("MS_CLIENT_ID", "your-azure-client-id")
MS_CLIENT_SECRET = os.environ.get("MS_CLIENT_SECRET", "your-azure-client-secret")
MS_AUTHORITY = "https://login.microsoftonline.com/common"
MS_REDIRECT_URI = "http://localhost:8000/api/auth/outlook/callback"
MS_SCOPES = ["User.Read", "Mail.Read", "Mail.Send", "offline_access"]

def build_msal_app():
    return msal.ConfidentialClientApplication(
        MS_CLIENT_ID, authority=MS_AUTHORITY, client_credential=MS_CLIENT_SECRET
    )

# ==========================================
# 🌐 GOOGLE WORKSPACE (GMAIL) ROUTES
# ==========================================

@router.get("/api/integrations/gmail/connect")
async def connect_gmail(auth_data: dict = Depends(require_role(["admin"]))):
    """Step 1: Redirect the Admin to the Google Consent Screen"""
    flow = Flow.from_client_secrets_file(
        GOOGLE_CLIENT_SECRETS_FILE, scopes=GOOGLE_SCOPES, redirect_uri=GOOGLE_REDIRECT_URI
    )
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        include_granted_scopes='true'
    )

    # Grab the auto-generated code_verifier so Python doesn't forget it!
    code_verifier = flow.code_verifier

    # Pack the user_id, company_id, state, AND the code_verifier into the URL
    custom_state = f"{auth_data['user_id']}|{auth_data['company_id']}|{state}|{code_verifier}"
    authorization_url = authorization_url.replace(state, custom_state)

    return {"url": authorization_url}


@router.get("/api/auth/google/callback")
async def google_callback(request: Request, state: str, code: str):
    """Step 2: Catch the returning Admin and save the Master Company Token"""
    try:
        # Unpack the backpack: Extract our 4 hidden variables
        user_id, company_id, original_state, code_verifier = state.split("|", 3)
        
        flow = Flow.from_client_secrets_file(
            GOOGLE_CLIENT_SECRETS_FILE, scopes=GOOGLE_SCOPES, state=original_state, redirect_uri=GOOGLE_REDIRECT_URI
        )
        
        # Manually inject the forgotten code_verifier back into the library!
        flow.code_verifier = code_verifier
        
        # Now we can safely fetch the token with just the code, completely bypassing the CSRF URL alarms!
        flow.fetch_token(code=code)
        
        credentials = flow.credentials

        # Extract the master email address connected
        session = flow.authorized_session()
        user_info = session.get('https://www.googleapis.com/oauth2/v1/userinfo').json()
        email_address = user_info.get('email')

        # Use Service Role to safely write to the database
        admin_supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))

        token_data = {
            "company_id": company_id,
            "connected_by_user_id": user_id, 
            "email_address": email_address,
            "provider": "gmail",
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "expires_at": credentials.expiry.isoformat() if credentials.expiry else None
        }

        # Upsert to the COMPANY table
        admin_supabase.table("company_email_integrations").upsert(
            token_data, on_conflict="company_id"
        ).execute()

        return RedirectResponse(url="http://localhost:5173/settings?integration=success")

    except Exception as e:
        print(f"❌ Google OAuth Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to connect Google account.")


# ==========================================
# 🟦 MICROSOFT OUTLOOK (OFFICE 365) ROUTES
# ==========================================

@router.get("/api/integrations/outlook/connect")
async def connect_outlook(auth_data: dict = Depends(require_role(["admin"]))):
    """Step 1: Redirect the Admin to the Microsoft Consent Screen"""
    msal_app = build_msal_app()
    
    custom_state = f"{auth_data['user_id']}|{auth_data['company_id']}"
    
    auth_url = msal_app.get_authorization_request_url(
        MS_SCOPES,
        state=custom_state,
        redirect_uri=MS_REDIRECT_URI
    )
    return {"url": auth_url}


@router.get("/api/auth/outlook/callback")
async def outlook_callback(request: Request, state: str, code: str):
    """Step 2: Catch the returning Admin and save the Master Company Token"""
    try:
        user_id, company_id = state.split("|")
        
        msal_app = build_msal_app()
        result = msal_app.acquire_token_by_authorization_code(
            code, scopes=MS_SCOPES, redirect_uri=MS_REDIRECT_URI
        )
        
        if "error" in result:
            raise Exception(result.get("error_description", "Microsoft OAuth failed."))

        # Extract the master email address connected
        email_address = result.get("id_token_claims", {}).get("preferred_username")

        admin_supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))

        token_data = {
            "company_id": company_id,
            "connected_by_user_id": user_id,
            "email_address": email_address,
            "provider": "outlook",
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
            "expires_at": None 
        }

        # Upsert to the COMPANY table
        admin_supabase.table("company_email_integrations").upsert(
            token_data, on_conflict="company_id"
        ).execute()

        return RedirectResponse(url="http://localhost:5173/settings?integration=success")

    except Exception as e:
        print(f"❌ Outlook OAuth Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to connect Microsoft account.")

# ==========================================
# 📡 STATUS CHECK ROUTE
# ==========================================

@router.get("/api/integrations/status")
async def get_integration_status(auth_data: dict = Depends(require_role(["admin", "member"]))):
    """Checks if the company has an active email integration and returns the email address."""
    try:
        company_id = auth_data["company_id"]
        
        admin_supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
        
        # Look for the company's token in the vault
        response = admin_supabase.table("company_email_integrations") \
            .select("email_address, provider, created_at") \
            .eq("company_id", company_id) \
            .execute()
            
        if response.data:
            return {
                "is_connected": True, 
                "data": response.data[0] # Returns the email_address and provider
            }
        else:
            return {"is_connected": False, "data": None}
            
    except Exception as e:
        print(f"❌ Status Check Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch integration status.")

# ==========================================
# 🛑 DISCONNECT ROUTE (THE FIX)
# ==========================================

@router.delete("/api/integrations/disconnect")
async def disconnect_integration(auth_data: dict = Depends(require_role(["admin"]))):
    """Deletes the company's email token from the database, forcing a disconnect."""
    try:
        company_id = auth_data["company_id"]
        
        # Use Service Role to safely delete from the database
        admin_supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
        
        # Delete the specific company's tokens
        admin_supabase.table("company_email_integrations") \
            .delete() \
            .eq("company_id", company_id) \
            .execute()
            
        print(f"✅ Successfully disconnected email integration for company {company_id}")
        return {"status": "success", "message": "Email integration disconnected successfully."}
        
    except Exception as e:
        print(f"❌ Disconnect Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect integration.")