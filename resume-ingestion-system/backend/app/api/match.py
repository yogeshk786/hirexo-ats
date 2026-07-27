from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
import os
import json
import requests 
from supabase import create_client, Client, ClientOptions
from openai import AsyncOpenAI
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

# 🚀 1. IMPORT OUR SECURITY GATEKEEPER
from app.api.deps import get_current_user_and_company 

router = APIRouter()

# 2. Initialize Supabase (Global Variables)
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Needed for webhooks!

# 3. Initialize OpenRouter
aclient = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY"),
)

class MatchRequest(BaseModel):
    job_id: str
    force_refresh: bool = False  

@router.post("/match-candidates")
async def match_candidates(
    req: Request, 
    payload: MatchRequest,
    auth_data: dict = Depends(get_current_user_and_company) # 🚀 INJECTED THE GATEKEEPER
):
    try:
        # 🚀 CREATE SECURE USER CLIENT
        auth_header = {"Authorization": f"Bearer {auth_data['token']}"}
        user_supabase = create_client(url, key, options=ClientOptions(headers=auth_header))
        client_company_id = auth_data["company_id"]

        print(f"🔍 MATCH ENGINE: Searching for job {payload.job_id}...")
        
        # 🚀 Now using user_supabase and filtering by company_id
        job_response = user_supabase.table("jobs").select("*").eq("id", payload.job_id).eq("company_id", client_company_id).execute()
        
        if not job_response.data:
            raise HTTPException(status_code=404, detail="Job not found or access denied")
        
        job = job_response.data[0]

        # =================================================================
        # 🚀 THE CACHE LOGIC: Instantly return matches if we already ran them!
        # =================================================================
        if not payload.force_refresh and job.get("cached_matches"):
            print("⚡ CACHE HIT: Returning saved AI matches instantly without spending API credits!")
            return {"candidates": job["cached_matches"]}
        # =================================================================

        print("🔄 REFRESH TRIGGERED/NO CACHE: Running fresh Vector Search & LLM grading...")
        job_text = f"{job['title']} {job['description']} {job['skills']}"

        try:
            job_vector = req.app.state.embedder.generate_embedding(job_text)
        except Exception as e:
            print("⚠️ Notice: Using fallback embedding method.", e)
            job_vector = get_384d_embedding_fallback(job_text)

        if isinstance(job_vector, list) and len(job_vector) > 0 and isinstance(job_vector[0], list):
            job_vector = job_vector[0]
            
        print(f"📐 MATH CHECK: Vector generated with {len(job_vector)} dimensions.")

        print("⚡ SEARCH: Running Vector Search in Supabase...")
        try:
            match_res = user_supabase.rpc(
                "match_candidates_v2",
                {
                    "query_embedding": job_vector,
                    "match_threshold": 0.0, 
                    "match_count": 15
                }
            ).execute()
            top_candidates = match_res.data or []
        except Exception as e:
            print(f"⚠️ Vector Match Error: {e}")
            top_candidates = []

        print(f"🎯 RESULTS: Vector Search found {len(top_candidates)} matches.")

        if len(top_candidates) == 0:
            print("⚠️ WARNING: Vector search returned 0. Falling back to standard database query.")
            fallback_res = user_supabase.table("candidates").select("*, work_experience(*), education(*)").eq("company_id", client_company_id).limit(5).execute()
            top_candidates = fallback_res.data or []

        if not top_candidates:
            return {"candidates": []}

        ai_model = "openai/gpt-4o-mini"
        
        batch_candidates_input = []
        for idx, candidate in enumerate(top_candidates):
            batch_candidates_input.append({
                "batch_index": idx,
                "name": candidate.get("name", "Unknown"),
                "resume_text": candidate.get("raw_text", "")[:1200] 
            })

        prompt = f"""You are an expert technical recruiter.
        Job Details: {job['title']} - {job['skills']}
        
        Evaluate the following candidates against the job details.
        
        Candidates List:
        {json.dumps(batch_candidates_input)}
        
        Evaluate every candidate. Respond strictly with a JSON object containing an "evaluations" array matching the batch_index:
        {{
          "evaluations": [
            {{
              "batch_index": <number>,
              "match_score": <number 0-100>,
              "note": "<A single 15-word sentence explaining exactly why they match or fall short>"
            }}
          ]
        }}"""

        print(f"🤖 AI AGENT: Batch grading {len(top_candidates)} candidates in ONE request using {ai_model}...")

        chat_res = await aclient.chat.completions.create(
            model=ai_model, 
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2 
        )
        
        batch_analysis = json.loads(chat_res.choices[0].message.content)
        evaluations_list = batch_analysis.get("evaluations", [])
        
        eval_lookup = {item["batch_index"]: item for item in evaluations_list if "batch_index" in item}

        scored_candidates = []
        for idx, candidate in enumerate(top_candidates):
            ai_eval = eval_lookup.get(idx, {})
            
            role = "Professional"
            work_history = candidate.get("work_experience") or []
            if len(work_history) > 0:
                role = work_history[0].get("job_title", "Professional")

            scored_candidates.append({
                "id": candidate.get("id"), 
                "name": candidate.get("name", "Unknown"),
                "role": role,
                "exp": f"{candidate.get('total_experience_years', 0)} Years Exp",
                "technical_skills": candidate.get("technical_skills", []),
                "match": ai_eval.get("match_score", int(candidate.get("similarity", 0) * 100)), 
                "note": ai_eval.get("note", "No analysis provided."),
                "jobs": {
                    "title": job.get("title", "Unknown Job"),
                    "department": job.get("department", "General")
                },
                "status": "AI Matched", 
                "resume_url": candidate.get("resume_url", ""),
                "summary": candidate.get("summary", ""),
                "work_experience": work_history,
                "education": candidate.get("education", []),
                "filename": candidate.get("filename", ""),
                "email": candidate.get("email", "") or "update-email@example.com",
                "phone": candidate.get("phone", ""),
                "social_links": candidate.get("social_links", []),
                "projects": candidate.get("projects", [])
            })

        scored_candidates.sort(key=lambda x: x["match"], reverse=True)
        
        # 🚀 Save back to the database using the secure user client
        user_supabase.table("jobs").update({"cached_matches": scored_candidates}).eq("id", payload.job_id).execute()

        print("✅ SUCCESS: Saved to cache and sending batch-matched candidates to React UI.")
        return {"candidates": scored_candidates}

    except Exception as e:
        print(f"❌ MATCHING ENGINE CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class EmailRequest(BaseModel):
    candidate_name: str
    candidate_summary: str
    job_title: str

@router.post("/generate-outreach")
async def generate_outreach_email(
    payload: EmailRequest,
    auth_data: dict = Depends(get_current_user_and_company) # Secured
):
    try:
        print(f"✍️ AI AGENT: Drafting outreach email for {payload.candidate_name}...")
        prompt = f"""You are an expert technical recruiter. 
        Write a short, highly personalized, and engaging cold outreach email to a candidate named {payload.candidate_name} for a {payload.job_title} role.
        
        Use this summary of their background to personalize the email: {payload.candidate_summary}
        
        Keep it under 3 short paragraphs. Do not use generic placeholders like [Company Name], just end it with "Best regards, The Hiring Team". 
        Output ONLY the body of the email text, nothing else."""

        chat_res = await aclient.chat.completions.create(
            model="openai/gpt-4o-mini", 
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7 
        )
        
        email_body = chat_res.choices[0].message.content.strip()
        print("✅ SUCCESS: Draft complete!")
        return {"email_body": email_body}

    except Exception as e:
        print(f"❌ EMAIL GENERATOR CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str

@router.post("/send-outreach")
async def send_outreach_email(
    payload: SendEmailRequest,
    auth_data: dict = Depends(get_current_user_and_company) # Secured
):
    try:
        print(f"📧 SENDGRID: Preparing to send email to {payload.to_email}...")
        
        from_email = os.environ.get("SENDGRID_FROM_EMAIL") 
        api_key = os.environ.get("SENDGRID_API_KEY")

        if not from_email or not api_key:
            raise Exception("Missing SendGrid credentials in .env file. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.")

        html_body = payload.body.replace('\n', '<br>')

        message = Mail(
            from_email=from_email,
            to_emails=payload.to_email,
            subject=payload.subject,
            html_content=html_body
        )
        
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        
        print(f"✅ SENDGRID SUCCESS: Email delivered. Status Code: {response.status_code}")
        return {"status": "success", "message": "Email sent successfully!"}

    except Exception as e:
        print(f"❌ SENDGRID CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class BulkEmailRequest(BaseModel):
    candidates: list[dict]
    subject: str
    body: str

@router.post("/send-bulk-outreach")
async def send_bulk_outreach(
    payload: BulkEmailRequest,
    auth_data: dict = Depends(get_current_user_and_company) # Secured
):
    try:
        print(f"📧 SENDGRID: Starting bulk send to {len(payload.candidates)} candidates...")
        
        from_email = os.environ.get("SENDGRID_FROM_EMAIL") 
        api_key = os.environ.get("SENDGRID_API_KEY")

        if not from_email or not api_key:
            raise Exception("Missing SendGrid credentials in .env file.")

        sg = SendGridAPIClient(api_key)
        sent_count = 0

        for candidate in payload.candidates:
            email = candidate.get("email")
            name = candidate.get("name", "").split(" ")[0] 

            if not email or email == "update-email@example.com":
                print(f"⚠️ Skipped {name} (No valid email)")
                continue

            personalized_body = payload.body.replace("[Name]", name)
            html_body = personalized_body.replace('\n', '<br>')

            message = Mail(
                from_email=from_email,
                to_emails=email,
                subject=payload.subject,
                html_content=html_body
            )
            
            sg.send(message)
            sent_count += 1
            
        print(f"✅ SENDGRID BULK SUCCESS: Delivered {sent_count} emails.")
        return {"status": "success", "sent_count": sent_count}

    except Exception as e:
        print(f"❌ SENDGRID BULK CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class AssessmentInvite(BaseModel):
    candidate_name: str
    candidate_email: str
    job_title: str
    assessment_link: str

@router.post("/send-assessment-invite")
async def send_assessment_invite(
    payload: AssessmentInvite,
    auth_data: dict = Depends(get_current_user_and_company) # Secured
):
    try:
        print(f"📧 SENDGRID: Sending assessment invite to {payload.candidate_email}...")
        
        from_email = os.environ.get("SENDGRID_FROM_EMAIL") 
        api_key = os.environ.get("SENDGRID_API_KEY")

        if not from_email or not api_key:
            raise Exception("Missing SendGrid credentials in .env file.")

        first_name = payload.candidate_name.split(" ")[0]
        subject = f"Next Steps: Assessment for {payload.job_title}"
        
        html_body = f"""
        <p>Hi {first_name},</p>
        <p>Thank you for your interest in the <strong>{payload.job_title}</strong> role! We were highly impressed by your profile and would like to invite you to the next stage of our evaluation process.</p>
        <p>Please complete the following assessment at your earliest convenience. It should take approximately 45 minutes.</p>
        <p><strong>Your secure assessment link:</strong> <a href="{payload.assessment_link}">{payload.assessment_link}</a></p>
        <p>If you have any questions, please reply directly to this email.</p>
        <p>Best regards,<br>The Hiring Team</p>
        """

        message = Mail(
            from_email=from_email,
            to_emails=payload.candidate_email,
            subject=subject,
            html_content=html_body
        )

        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        
        print(f"✅ SENDGRID SUCCESS: Assessment sent. Status Code: {response.status_code}")
        return {"status": "success", "message": "Assessment invitation sent."}

    except Exception as e:
        print(f"❌ SENDGRID CRASH (Assessment): {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email via SendGrid")

def get_384d_embedding_fallback(text: str) -> list[float]:
    api_url = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"
    headers = {}
    hf_token = os.environ.get("HUGGINGFACE_API_KEY")
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token}"
    response = requests.post(api_url, headers=headers, json={"inputs": text})
    if response.status_code != 200:
        raise Exception(f"Embedding failed. Error: {response.text}")
    return response.json()

# ============================================================================
# 🚀 WEBHOOK ROUTE (Unprotected by user token, but uses Admin Key to bypass RLS)
# ============================================================================
@router.post("/webhooks/assessment")
async def assessment_webhook(request: Request):
    try:
        payload = await request.json()
        print(f"🎣 WEBHOOK RECEIVED: {payload}")

        candidate_email = payload.get("email") 
        final_score = payload.get("score")

        if not candidate_email or final_score is None:
            raise HTTPException(status_code=400, detail="Webhook payload missing 'email' or 'score'")

        # 🚀 THE FIX: Use Admin Client here so webhooks don't get blocked by RLS
        admin_supabase = create_client(url, service_role_key)

        update_data = {
            "assessment_status": "Graded",
            "assessment_score": int(final_score)
        }

        result = admin_supabase.table("job_applications").update(update_data).eq("email", candidate_email).execute()

        if not result.data:
            print(f"⚠️ WEBHOOK WARNING: No candidate found with email {candidate_email}")
            return {"status": "ignored", "message": "Candidate not found in pipeline"}

        print(f"✅ WEBHOOK SUCCESS: Automatically graded {candidate_email} with score {final_score}%")
        return {"status": "success", "message": "Candidate assessment correctly updated"}

    except Exception as e:
        print(f"❌ WEBHOOK CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))