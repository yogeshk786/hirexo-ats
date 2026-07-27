import os
import json
import uuid
import asyncio
import httpx
import base64
from io import BytesIO
from datetime import datetime
from pdf2image import convert_from_bytes 
from pydantic import BaseModel, Field, model_validator, field_validator
from typing import List, Optional
from dotenv import load_dotenv

# 🚀 NEW: Import Supabase
from supabase import create_client, Client

load_dotenv()

# ==========================================
# 🛑 SMART PATHING & DB SETUP
# ==========================================
POPPLER_PATH = os.getenv("POPPLER_PATH", r'C:\Program Files\poppler-25.12.0\Library\bin')

# Initialize Supabase
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") 
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("⚠️ Supabase credentials missing. DB insertion will fail.")

# --- 1. Define the Strict JSON Schema ---
class Education(BaseModel):
    degree: Optional[str] = Field(None, description="The degree or diploma title.")
    institution: Optional[str] = Field(None, description="The school or organization name.")
    year: Optional[str] = Field(None, description="Passing year or duration.")
    score: Optional[str] = Field(None, description="CGPA, percentage, or grade (e.g., 7.39/10, 70.2%).")

class Experience(BaseModel):
    job_title: str = Field(description="The role or title.")
    company: str = Field(description="The name of the company.")
    start_date: Optional[str] = Field(None, description="Start date (e.g., 'May 2021').")
    end_date: Optional[str] = Field(None, description="End date (e.g., 'August 2023' or 'Present').")
    is_internship: bool = Field(description="True ONLY if the role is a short-term 'Intern' or 'Student' role. DO NOT flag long-term 'Trainee' or 'Apprentice' roles as internships if they lasted more than 11 months.")
    duration_months: int = Field(default=0, description="Calculate the exact number of months worked in this specific role.")
    description: Optional[str] = Field(None, description="Short summary of duties.")

class Certification(BaseModel):
    name: str = Field(description="Name of the certificate (e.g., MS-CIT).")
    issuer: Optional[str] = Field(None, description="Organization that issued it.")
    date: Optional[str] = Field(None, description="Date or duration.")

class SocialLink(BaseModel):
    platform: str = Field(description="The name of the platform (e.g., 'LinkedIn', 'GitHub', 'Portfolio', 'Twitter', 'Website').")
    url: str = Field(description="The actual URL or link.")

class RoleSegmentation(BaseModel):
    department: str = Field(
        default="Uncategorized",
        description="CRITICAL: You MUST classify the candidate into exactly ONE department bucket based heavily on their MOST RECENT role: 'Technical & Engineering', 'Operations & Floor', 'HR & Administration', 'Quality Control & Safety', 'Sales & Marketing', 'Executive & Management', or 'Uncategorized'."
    )
    seniority_level: str = Field(
        default="Entry-Level",
        description="Classify the candidate's career level based on total experience and titles: 'Entry-Level' (0-2 yrs), 'Mid-Level' (3-6 yrs), 'Senior' (7-10 yrs), or 'Lead/Executive' (Management/Director titles)."
    )
    standardized_title: str = Field(
        description="Provide a clean, industry-standard job title that summarizes this candidate's profile (e.g., 'CNC Machinist', 'Full Stack Developer', 'HR Generalist'), regardless of what weird title their previous company used."
    )

class CandidateIntelligence(BaseModel):
    career_trajectory: str = Field(
        default="Entry Level",
        description="Analyze the progression of job titles. Classify as: 'Upward' (e.g., Junior -> Senior), 'Lateral' (same level different companies), 'Declining', or 'Entry Level'."
    )
    average_tenure_months: float = Field(
        default=0.0,
        description="Calculate the average number of months spent at each non-internship job. Divide total non-internship months by the number of non-internship roles. Default to 0 if no experience."
    )
    job_switching_pattern: str = Field(
        default="Unknown",
        description="Classify their loyalty/switching behavior based on tenure. E.g., 'Job Hopper' (< 1.5 yrs average), 'Stable' (1.5 - 3 yrs), 'Highly Loyal' (> 3 yrs), or 'Newcomer'."
    )
    learning_agility_score: int = Field(
        default=5,
        description="Score from 1 to 10 based on evidence of continuous learning (e.g., recent certifications, a wide variety of modern tools, side projects, or frequent upskilling)."
    )
    leadership_potential: bool = Field(
        default=False,
        description="True if they have managed teams, led projects, mentored others, or held titles like 'Lead', 'Manager', or 'Principal'."
    )

class ResumeSchema(BaseModel):
    name: str = Field(description="The full name of the candidate.")
    email: Optional[str] = Field(None, description="The candidate's email address.")
    phone: Optional[str] = Field(None, description="The candidate's phone number.")
    location: Optional[str] = Field(None, description="The candidate's city, state, or address.")
    
    email_received_at: Optional[str] = Field(default=None, description="The exact date and time the resume was received via email.")
    email_sender: Optional[str] = Field(default=None, description="The sender email address from the original email.")
    email_subject: Optional[str] = Field(default=None, description="The subject line of the original email.")

    social_links: list[SocialLink] = Field(default=[], description="List of all URLs, websites, portfolios, and social profiles mentioned in the resume.")
    segmentation: RoleSegmentation = Field(description="Categorizes the candidate into standard business departments and seniority levels for ATS dashboard filtering.")
    intelligence_layer: CandidateIntelligence = Field(description="AI-derived behavioral and career metrics based on the candidate's history. You MUST generate this.")
    
    work_experience: list[Experience] = Field(default=[], description="List of all work history, including internships.")
    total_experience_years: int = Field(default=0, description="Placeholder. Python will calculate this dynamically.")
    technical_skills: list[str] = Field(default=[], description="Hard technical skills, tools, and software.")
    soft_skills: list[str] = Field(default=[], description="Interpersonal skills like leadership, teamwork, etc.")
    interests: list[str] = Field(default=[], description="Fields of interest, elective subjects, or professional focus areas.")
    
    education: list[Education]
    certifications: list[Certification] = Field(default=[])
    
    projects: list[str] = Field(
        default=[], 
        description="CRITICAL: This MUST be an array of simple plain text strings. DO NOT output an array of objects or dictionaries. Example: ['Project 1: Built a CRM in React', 'Project 2: Designed a motor']."
    )
    
    @field_validator('projects', mode='before')
    @classmethod
    def parse_projects_safely(cls, v):
        if not v: return []
        safe_projects = []
        for p in v:
            if isinstance(p, dict):
                title = p.get('title', p.get('name', 'Project'))
                desc = p.get('description', '')
                safe_projects.append(f"{title}: {desc}".strip())
            elif isinstance(p, str):
                safe_projects.append(p)
        return safe_projects

    languages: list[str] = Field(default=[], description="List of languages spoken.")
    summary: str = Field(description="Write a brief 2-3 sentence professional summary based strictly on the work_experience array.")

    @model_validator(mode='after')
    def calculate_true_experience(self):
        total_months = 0
        if self.work_experience:
            for exp in self.work_experience:
                if not exp.is_internship:
                    total_months += exp.duration_months
                    
        self.total_experience_years = total_months // 12
        return self

# --- 2. The Extraction & DB Ingestion Engine ---
class ResumeParser:
    def __init__(self):
        self.api_key = os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("🚨 OPENROUTER_API_KEY is missing from your .env file!")
        
        self.url = "https://openrouter.ai/api/v1/chat/completions"
        print("🚀 Initializing OpenRouter Vision AI & Supabase Engine")

    def _convert_pdf_to_base64(self, file_path: str) -> list:
        try:
            with open(file_path, "rb") as f:
                pdf_bytes = f.read()
            
            images = convert_from_bytes(
                pdf_bytes, 
                poppler_path=POPPLER_PATH if os.path.exists(POPPLER_PATH) else None
            )
            
            base64_images = []
            for img in images:
                buffered = BytesIO()
                img.save(buffered, format="JPEG", quality=85)
                img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
                base64_images.append(img_str)
            return base64_images
        except Exception as e:
            print(f"🚨 Failed to convert PDF to image: {e}")
            return []

    async def save_to_supabase(self, data: dict, original_filename: str, cloud_url: str = None, company_id: str = None):
        print(f"💾 Saving candidate to Supabase relational tables for Company ID: {company_id}...")
        
        # 1. Generate a master ID for the candidate
        candidate_id = str(uuid.uuid4())

        work_experience_arr = data.get("work_experience", [])
        education_arr = data.get("education", [])

        # 2. Format the main Candidates Table payload
        candidate_payload = {
            "id": candidate_id,
            "company_id": company_id,
            "filename": original_filename,
            "ai_status": "New", 
            
            "name": data.get("name"),
            "email": data.get("email"),
            "phone": data.get("phone"),
            "location": data.get("location"),
            "summary": data.get("summary"),
            "total_experience_years": data.get("total_experience_years", 0),
            
            "resume_url": cloud_url, 
            
            "email_received_at": data.get("email_received_at"),
            "email_sender": data.get("email_sender"),
            "email_subject": data.get("email_subject"),
            
            "work_experience": work_experience_arr,
            "education": education_arr,
            "certifications": data.get("certifications", []),
            "interests": data.get("interests", []),
            "languages": data.get("languages", []),
            "projects": data.get("projects", []),
            "social_links": data.get("social_links", []),
            "soft_skills": data.get("soft_skills", []),
            "technical_skills": data.get("technical_skills", []),
            "segmentation": data.get("segmentation", {}),
            "intelligence_layer": data.get("intelligence_layer", {})
        }

        # 3. ASYNC ARCHITECTURE: Wrap blocking DB calls in a separate thread
        def perform_db_inserts():
            try:
                supabase.table("candidates").insert(candidate_payload).execute()
            except Exception as e:
                print(f"❌ Failed to insert Candidate: {e}")
                return None

            try:
                # Insert Education with company_id tracking
                if education_arr:
                    edu_payloads = [
                        {
                            "candidate_id": candidate_id,
                            "company_id": company_id, 
                            "degree": edu.get("degree"),
                            "institution": edu.get("institution"),
                            "year": edu.get("year"),
                            "score": edu.get("score")
                        } for edu in education_arr
                    ]
                    supabase.table("education").insert(edu_payloads).execute()

                # Insert Work Experience with company_id tracking
                if work_experience_arr:
                    exp_payloads = [
                        {
                            "candidate_id": candidate_id,
                            "company_id": company_id, 
                            "job_title": exp.get("job_title"),
                            "company": exp.get("company"),
                            "start_date": exp.get("start_date"),
                            "end_date": exp.get("end_date"),
                            "description": exp.get("description"),
                            "is_internship": exp.get("is_internship", False),
                            "duration_months": exp.get("duration_months", 0)
                        } for exp in work_experience_arr
                    ]
                    supabase.table("work_experience").insert(exp_payloads).execute()
            except Exception as e:
                print(f"⚠️ Note: Relational tables skipped or threw an error: {e}")

            return candidate_id

        # Execute DB insert in a separate thread to prevent freezing async server
        inserted_id = await asyncio.to_thread(perform_db_inserts)
        
        if inserted_id:
            print(f"✅ Successfully inserted {candidate_payload.get('name', 'Candidate')} and linked relational data!")
        return inserted_id

    # 🚀 THE FIX: Added `auto_save: bool = True` to the parameters
    async def parse(self, file_path: str, raw_text: str, cloud_url: str = None, company_id: str = None, auto_save: bool = True):
        print(f"☁️ Preparing {os.path.basename(file_path)} for OpenRouter Vision extraction...")
        
        metadata_path = f"{file_path}_metadata.json"
        email_metadata = {}
        
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r', encoding='utf-8') as mf:
                    meta = json.load(mf)
                    email_metadata["email_received_at"] = meta.get("date")
                    email_metadata["email_sender"] = meta.get("sender")
                    email_metadata["email_subject"] = meta.get("subject")
            except Exception as e:
                print(f"⚠️ Could not parse sidecar metadata file: {e}")

        base64_images = await asyncio.to_thread(self._convert_pdf_to_base64, file_path)
        current_date = datetime.now().strftime("%B %Y")
        schema_instructions = json.dumps(ResumeSchema.model_json_schema(), indent=2)
        
        system_prompt = f"""
        You are an elite ATS (Applicant Tracking System) AI data extractor.
        Extract candidate data with 100% precision from the provided resume images.

        --- CRITICAL EXTRACTION RULES ---
        1. TODAY'S DATE: {current_date}. 
        2. EXPERIENCE CALCULATION: If "Present" or "Current", use {current_date} to calculate `duration_months`. Trust ONLY actual dates in the work experience section, not the candidate's summary claims.
        3. OVERLAPPING TIMELINES: If a candidate was working while in school, do not penalize or truncate work experience.
        4. SOCIAL LINKS: Extract only the underlying URL (e.g., "linkedin.com/in/name"). Do not include display text.
        5. CATEGORIZATION: You MUST force every candidate into one of the following departments: 'Technical & Engineering', 'Operations & Floor', 'HR & Administration', 'Quality Control & Safety', 'Sales & Marketing', 'Executive & Management', or 'Uncategorized'.

        --- SKILL EXTRACTION MANDATE (NO HALLUCINATION) ---
        6. TECHNICAL SKILLS: You MUST populate this array. Scan for:
           - Tools & Software (e.g., Oracle, SAP, Python, SQL, CRM, MS Office, HRIS, CNC, AutoCAD).
           - Industry-specific equipment or technical methodologies.
           - If a tool or software is mentioned anywhere in work experience, projects, or certifications, it MUST be extracted and placed in 'technical_skills'.
        7. SOFT SKILLS: Extract only interpersonal traits (e.g., Leadership, Teamwork, Communication, Employee Relations, Change Management). Do not place software or hard tools here.

        --- OUTPUT FORMAT ---
        - Output ONLY valid JSON matching the provided schema.
        - NEVER include markdown blocks (no ```json).
        - NEVER include preamble text.
        - If data is missing for a field, use 'null' or '[]' as specified in the schema. Do not invent details.

        --- TARGET SCHEMA ---
        {schema_instructions}
        """

        user_prompt_text = "Please extract the resume data into JSON based on these attached images."
        if raw_text and raw_text.strip():
            truncated_fallback = raw_text[:8000]
            user_prompt_text += f"\n\n[Fallback Raw Text if images are unreadable]:\n{truncated_fallback}"

        user_content = [{"type": "text", "text": user_prompt_text}]
        for b64_img in base64_images:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}
            })

        vision_models = [
            "openai/gpt-4o-mini",                            
            "google/gemini-flash-1.5",                       
            "meta-llama/llama-3.2-11b-vision-instruct",      
            "google/gemini-pro-1.5"                          
        ]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient() as client:
            for model_id in vision_models:
                print(f"🔄 Attempting Vision Extraction with: {model_id}...")
                
                payload = {
                    "model": model_id, 
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content}
                    ]
                }
                
                if "llama" not in model_id:
                    payload["response_format"] = {"type": "json_object"}
                
                try:
                    response = await client.post(self.url, headers=headers, json=payload, timeout=60.0)
                    
                    if response.status_code == 200:
                        content = response.json()["choices"][0]["message"]["content"]
                        content = content.replace("```json", "").replace("```", "").strip()
                        raw_data = json.loads(content)
                        
                        # Merge metadata
                        if email_metadata:
                            raw_data.update(email_metadata)
                        
                        # Validate
                        validated_data = ResumeSchema(**raw_data).model_dump()
                        
                        print(f"✅ Success! Extracted data using {model_id} for: {validated_data.get('name', 'Unknown')}")
                        
                        # 🚀 THE FIX: Conditionally save based on the auto_save flag
                        candidate_id = None
                        if auto_save:
                            candidate_id = await self.save_to_supabase(validated_data, os.path.basename(file_path), cloud_url, company_id)
                        
                        return validated_data, candidate_id
                    
                    else:
                        print(f"⚠️ {model_id} failed with status {response.status_code}: {response.text}. Trying backup...")
                        
                except Exception as e:
                    print(f"⚠️ Network/Parsing error with {model_id}: {e}. Trying next backup model...")
                
            raise Exception("🚨 FATAL: All Vision models on OpenRouter failed or are currently unavailable.")


# ==========================================
# 🚀 THE FIX: Helper function for the API
# ==========================================
async def parse_resume(raw_text: str, file_path: str = "unknown_file.pdf"):
    """
    Bridge function for the drag-and-drop API.
    Because the parser uses OpenRouter Vision, it is async and needs `await`.
    """
    parser = ResumeParser()
    # 🚀 Passing auto_save=False so manual uploads wait for frontend approval!
    data, candidate_id = await parser.parse(file_path=file_path, raw_text=raw_text, auto_save=False)
    return data