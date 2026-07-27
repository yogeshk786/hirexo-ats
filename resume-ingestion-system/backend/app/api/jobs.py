import os
import json
from fastapi import APIRouter, Request, HTTPException, Depends # 🚀 ADDED: Depends
from pydantic import BaseModel
from supabase import create_client, Client, ClientOptions # 🚀 ADDED: ClientOptions
from dotenv import load_dotenv

# 🚀 IMPORT YOUR AUTH DEPENDENCY
from app.api.deps import get_current_user_and_company

load_dotenv()

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# ==========================================
# 🚀 HELPER: DYNAMIC CLIENT
# ==========================================
def get_user_supabase(token: str) -> Client:
    """Creates a Supabase client authenticated as the specific logged-in user."""
    auth_header = {"Authorization": f"Bearer {token}"}
    return create_client(SUPABASE_URL, SUPABASE_KEY, options=ClientOptions(headers=auth_header))


# Strict Pydantic model for incoming Job data
class JobCreateRequest(BaseModel):
    title: str
    department: str
    location: str
    employment_type: str
    salary_min: float
    salary_max: float
    description: str
    responsibilities: str
    skills: str

@router.post("/api/jobs")
async def create_job(
    request: Request, 
    job: JobCreateRequest, 
    auth_data: dict = Depends(get_current_user_and_company) # 🚀 LOCK DOWN ROUTE
):
    user_supabase = get_user_supabase(auth_data["token"]) # 🚀 Pass token to bypass firewall
    embedder = request.app.state.embedder
    
    search_text = f"{job.description} {job.skills}"
    
    try:
        vector_math = embedder.generate_embedding(search_text) 
        
        if isinstance(vector_math, list) and len(vector_math) > 0 and isinstance(vector_math[0], list):
            vector_math = vector_math[0]
            
        job_payload = job.dict()
        job_payload["embedding"] = json.dumps(vector_math) 
        
        # 🚀 CRITICAL FIX: Stamp the new job with your specific company_id!
        job_payload["company_id"] = auth_data["company_id"]
        
        # Insert directly into Supabase using the authenticated client
        res = user_supabase.table("jobs").insert(job_payload).execute()
        
        return {"status": "success", "job": res.data[0] if res.data else None}
        
    except Exception as e:
        print(f"⚠️ Job Creation Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create job and calculate embeddings.")

# GET route to fetch ALL jobs for your Dashboard Dropdown / Admin Grid
@router.get("/api/jobs")
async def get_all_jobs(auth_data: dict = Depends(get_current_user_and_company)): # 🚀 LOCK
    user_supabase = get_user_supabase(auth_data["token"])
    
    try:
        # 🚀 ADDED .eq("company_id") to ensure they only see their own company's jobs
        res = user_supabase.table("jobs") \
            .select("id, title, department, location, status, created_at") \
            .eq("company_id", auth_data["company_id"]) \
            .order("created_at", desc=True) \
            .execute()
        return {"results": res.data}
    except Exception as e:
        print(f"Error fetching all jobs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch jobs from database.")

# GET route for the Dashboard to pull applicants for a specific job
@router.get("/api/jobs/{job_id}/applications")
async def get_job_applicants(job_id: str, auth_data: dict = Depends(get_current_user_and_company)): # 🚀 LOCK
    user_supabase = get_user_supabase(auth_data["token"])
    
    try:
        res = user_supabase.table("job_applications") \
            .select("*, jobs(title, department)") \
            .eq("job_id", job_id) \
            .eq("company_id", auth_data["company_id"]) \
            .order("match_score", desc=True) \
            .execute()
            
        return {"results": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# GET route for the Candidate Modal to pull all matched jobs for a specific person
@router.get("/api/candidates/{candidate_id}/jobs")
async def get_candidate_jobs(candidate_id: str, auth_data: dict = Depends(get_current_user_and_company)): # 🚀 LOCK
    user_supabase = get_user_supabase(auth_data["token"])
    
    try:
        res = user_supabase.table("job_applications") \
            .select("id, match_score, status, jobs(id, title, department, location)") \
            .eq("candidate_id", candidate_id) \
            .eq("company_id", auth_data["company_id"]) \
            .order("match_score", desc=True) \
            .execute()
            
        return {"results": res.data}
    except Exception as e:
        print(f"Error fetching candidate jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))