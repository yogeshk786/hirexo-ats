import os
import re
from typing import List  
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, field_validator
from supabase import create_client, Client, ClientOptions # 🚀 ADDED: ClientOptions for token passing
from dotenv import load_dotenv

# 🚀 1. FIXED: Import the new multi-tenant dependency
from app.api.deps import get_current_user_and_company

load_dotenv()

router = APIRouter(prefix="/api/candidates", tags=["Candidates"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# ==========================================
# 🚀 DATA MODELS
# ==========================================
class CellEditRequest(BaseModel):
    candidate_id: str
    field: str
    value: str

    @field_validator('value')
    @classmethod
    def cell_not_empty(cls, v: str, info):
        if not v.strip():
            raise ValueError(f"The field cannot be empty.")
        return v.strip()

    @field_validator('value')
    @classmethod
    def validate_conditional_fields(cls, v: str, info):
        field_name = info.data.get('field')
        
        if field_name == 'email':
            email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_regex, v):
                raise ValueError("Invalid email address format.")
                
        if field_name == 'phone':
            phone_regex = r'^[\+]?[0-9\s\-]{8,15}$'
            if not re.match(phone_regex, v):
                raise ValueError("Invalid phone number format.")
                
        return v

class NoteCreate(BaseModel):
    author_name: str
    note_text: str

class TagUpdate(BaseModel):
    tags: List[str]


# ==========================================
# 🚀 HELPER: DYNAMIC CLIENT
# ==========================================
def get_user_supabase(token: str) -> Client:
    """Creates a Supabase client authenticated as the specific logged-in user."""
    auth_header = {"Authorization": f"Bearer {token}"}
    return create_client(SUPABASE_URL, SUPABASE_KEY, options=ClientOptions(headers=auth_header))


# ==========================================
# 🚀 ENDPOINTS
# ==========================================

# --- CELL EDITING ---
@router.patch("/update-cell")
async def update_candidate_cell(
    payload: CellEditRequest, 
    auth_data: dict = Depends(get_current_user_and_company) # 🚀 2. FIXED DEPENDENCY
):
    user_id = auth_data["user_id"]
    user_supabase = get_user_supabase(auth_data["token"]) # 🚀 Pass token to bypass firewall
    
    print(f"🔒 Authenticated request from User ID: {user_id}")
    
    ALLOWED_COLUMNS = ["location", "email", "phone", "name"]
    
    if payload.field not in ALLOWED_COLUMNS:
        raise HTTPException(
            status_code=403, 
            detail=f"Security Alert: Modifications to column '{payload.field}' are strictly prohibited via manual override."
        )

    try:
        if payload.field == "email":
            existing = user_supabase.table("candidates") \
                .select("id") \
                .eq("email", payload.value) \
                .neq("id", payload.candidate_id) \
                .execute()
                
            if existing.data:
                raise HTTPException(
                    status_code=400, 
                    detail="Database Collision: This email is already assigned to another candidate."
                )

        update_res = user_supabase.table("candidates") \
            .update({payload.field: payload.value}) \
            .eq("id", payload.candidate_id) \
            .execute()

        if not update_res.data:
            raise HTTPException(status_code=404, detail="Target Candidate record not found.")

        print(f"🔒 BACKEND SUCCESS: Successfully updated '{payload.field}' for Candidate {payload.candidate_id}")
        return {"status": "success", "updated_record": update_res.data[0]}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ BACKEND WRITING EXCEPTION: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal Server Error processing database update.")


# --- HR NOTES ENDPOINTS ---
@router.post("/{candidate_id}/notes")
async def add_candidate_note(
    candidate_id: str, 
    note: NoteCreate, 
    auth_data: dict = Depends(get_current_user_and_company)
):
    user_supabase = get_user_supabase(auth_data["token"])
    
    try:
        res = user_supabase.table("candidate_notes").insert({
            "candidate_id": candidate_id,
            "company_id": auth_data["company_id"], # 🚀 Added company_id for multi-tenancy!
            "author_name": note.author_name,
            "note_text": note.note_text
        }).execute()
        return {"success": True, "note": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save note: {str(e)}")

@router.get("/{candidate_id}/notes")
async def get_candidate_notes(
    candidate_id: str, 
    auth_data: dict = Depends(get_current_user_and_company)
):
    user_supabase = get_user_supabase(auth_data["token"])
    
    try:
        res = user_supabase.table("candidate_notes")\
            .select("*")\
            .eq("candidate_id", candidate_id)\
            .order("created_at", desc=True)\
            .execute()
        return {"notes": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- CUSTOM TAGGING ENDPOINT ---
@router.patch("/{candidate_id}/tags")
async def update_candidate_tags(
    candidate_id: str, 
    tag_data: TagUpdate, 
    auth_data: dict = Depends(get_current_user_and_company)
):
    user_id = auth_data["user_id"]
    user_supabase = get_user_supabase(auth_data["token"])
    
    try:
        print(f"👉 WIRING TEST: Saving tags {tag_data.tags} for candidate {candidate_id} (Requested by user: {user_id})")
        
        res = user_supabase.table("candidates").update({
            "tags": tag_data.tags
        }).eq("id", candidate_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="Candidate not found")
            
        print("✅ TAGS SAVED SUCCESSFULLY!")
        return {"success": True, "tags": res.data[0].get("tags")}
        
    except Exception as e:
        print(f"🚨 SUPABASE REJECTED TAGS: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update tags: {str(e)}")