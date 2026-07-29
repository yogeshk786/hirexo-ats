import os
from functools import lru_cache
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

security = HTTPBearer()

# --- Helper function to sanitize environment variables ---

def _clean_env(val: str | None) -> str:
    """Strips whitespace, newlines, and surrounding quotes from env variables."""
    if not val:
        return ""
    return val.strip().strip('"').strip("'")


# --- Lazy Client Factories (Prevents startup crashes when env vars are missing/malformed) ---

@lru_cache()
def get_supabase() -> Client:
    url = _clean_env(os.getenv("SUPABASE_URL"))
    key = _clean_env(os.getenv("SUPABASE_KEY"))

    if not url or not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_URL or SUPABASE_KEY is missing."
        )

    if not (url.startswith("https://") or url.startswith("http://")):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server configuration error: SUPABASE_URL must start with 'https://'. Current value: '{url}'"
        )

    return create_client(url, key)


@lru_cache()
def get_admin_supabase() -> Client:
    url = _clean_env(os.getenv("SUPABASE_URL"))
    service_key = _clean_env(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

    if not url or not service_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
        )

    if not (url.startswith("https://") or url.startswith("http://")):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server configuration error: SUPABASE_URL must start with 'https://'. Current value: '{url}'"
        )

    return create_client(url, service_key)


# --- Auth & Context Dependency ---

def get_current_user_and_company(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """
    Verifies the Supabase token natively, looks up user profile (company_id & role)
    using the admin client to bypass RLS, and returns the context dictionary.
    """
    token = credentials.credentials
    supabase = get_supabase()
    admin_supabase = get_admin_supabase()
    
    try:
        # 1. Verify token with Supabase Auth
        auth_response = supabase.auth.get_user(token)
        
        if not auth_response or not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token."
            )
            
        user_id = auth_response.user.id
        
        # 2. Fetch profile using admin client (bypasses RLS safely on backend)
        profile_res = (
            admin_supabase.table("user_profiles")
            .select("company_id, role")
            .eq("id", user_id)
            .execute()
        )
        
        if not profile_res.data or not profile_res.data[0].get("company_id"):
            print(f"🚨 PROFILE EMPTY: No company linked for user {user_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not assigned to a company workspace."
            )
            
        profile_data = profile_res.data[0]
        
        # 3. Secure role fallback (defaults to 'member' instead of 'admin')
        user_role = profile_data.get("role") or "member"
        
        return {
            "user_id": user_id,
            "company_id": profile_data["company_id"],
            "role": user_role,
            "token": token
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"🚨 SUPABASE AUTH CRASH: {str(e)}") 
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or expired. Please log in again."
        )


# --- Role-Based Access Control (RBAC) ---

def require_role(allowed_roles: list[str]):
    """
    Dependency factory to enforce allowed roles on specific route handlers.
    Usage: @app.get("/admin-only", dependencies=[Depends(require_role(["admin"]))])
    """
    def dependency(auth_data: dict = Depends(get_current_user_and_company)):
        user_role = auth_data.get("role", "member")
        
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Access denied. Required role: {allowed_roles}"
            )
        return auth_data
        
    return dependency