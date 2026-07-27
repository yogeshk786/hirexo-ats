import os
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client

security = HTTPBearer()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
# 🚀 GRAB THE ADMIN KEY
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Standard client for verifying the token securely
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 🚀 ADMIN CLIENT: Safely bypasses RLS on the backend to read the user profile
admin_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def get_current_user_and_company(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    Verifies the Supabase token natively via the Supabase Auth API, 
    looks up the user's company_id and role using the Admin key, 
    and returns the credentials needed for the rest of the routes.
    """
    token = credentials.credentials
    
    try:
        # 1. Ask Supabase directly if this token is valid (Security Check)
        auth_response = supabase.auth.get_user(token)
        
        if not auth_response or not auth_response.user:
            raise HTTPException(status_code=401, detail="Invalid authentication token.")
            
        user_id = auth_response.user.id
        
        # 2. 🚀 UPGRADE: We now select BOTH company_id and role from the database!
        profile = admin_supabase.table("user_profiles").select("company_id, role").eq("id", user_id).execute()
        
        if not profile.data or not profile.data[0].get("company_id"):
            print(f"🚨 PROFILE EMPTY: The database returned {profile.data} for user {user_id}")
            raise HTTPException(status_code=403, detail="User is not assigned to a company workspace.")
            
        # 3. Return the exact payload needed by your FastAPI routes
        return {
            "user_id": user_id,
            "company_id": profile.data[0]["company_id"],
            "role": profile.data[0].get("role", "admin"), # 🚀 Pass the role forward (defaults to admin if missing)
            "token": token 
        }
    
    # Catch our own 401/403 errors so they pass through cleanly to React
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"🚨 SUPABASE AUTH CRASH: {str(e)}") 
        raise HTTPException(status_code=401, detail="Your session is invalid or expired. Please log in again.")


# ==========================================
# 🛡️ ROLE-BASED ACCESS CONTROL (RBAC)
# ==========================================
def require_role(allowed_roles: list[str]):
    """
    A security dependency that checks if the logged-in user has the correct role.
    It relies on your existing get_current_user_and_company function.
    """
    def dependency(auth_data: dict = Depends(get_current_user_and_company)):
        # Extract the role we packed in the function above
        user_role = auth_data.get("role", "admin") 
        
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied. This action requires one of the following roles: {allowed_roles}"
            )
        return auth_data
        
    return dependency