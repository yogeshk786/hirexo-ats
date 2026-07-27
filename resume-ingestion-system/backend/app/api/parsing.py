import os
import shutil
import hashlib
import uuid
import re
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException
from supabase import create_client, Client
from dotenv import load_dotenv

from app.services.parser import text_extractor
from app.services.parser import resume_parser

load_dotenv()

router = APIRouter()

# Initialize Supabase for the duplicate check & storage upload
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
# Use Service Role Key to bypass RLS for uploads!
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("⚠️ Supabase credentials missing in parsing.py. Duplicate check and file uploads will fail.")
    supabase = None

@router.post("/upload-resumes")
async def upload_and_parse_resumes(files: List[UploadFile] = File(...)):
    """
    Accepts multiple PDF/DOCX files from the React frontend, extracts text, 
    uploads the file to Supabase storage, and parses them using the LLM parser.
    """
    parsed_candidates = []

    for file in files:
        # 1. Calculate the digital fingerprint (Hash) of the file
        content = await file.read()
        file_hash = hashlib.sha256(content).hexdigest()
        
        # Reset the file pointer so we can still save/read it later
        await file.seek(0)
        
        # 2. 🛑 DUPLICATE CHECK (Exact File Match)
        if supabase:
            try:
                duplicate_check = supabase.table("candidates").select("id, name").eq("document_hash", file_hash).execute()
                if duplicate_check.data and len(duplicate_check.data) > 0:
                    existing_name = duplicate_check.data[0].get("name", "an existing candidate")
                    print(f"🛑 Exact Duplicate skipped: {file.filename} is identical to {existing_name}.")
                    parsed_candidates.append({
                        "filename": file.filename,
                        "error": f"Duplicate Resume! This exact file matches {existing_name} in your database.",
                        "status": "Skipped"
                    })
                    continue 
            except Exception as e:
                print(f"⚠️ Warning: Duplicate hash check failed: {e}")

        # 3. 🚀 UPLOAD PDF TO SUPABASE STORAGE
        resume_web_url = None
        if supabase:
            try:
                safe_filename = re.sub(r'[^\w\s.-]', '_', file.filename)
                unique_path = f"manual_uploads/{uuid.uuid4().hex[:8]}_{safe_filename}"
                
                file_bytes = await file.read()
                await file.seek(0) 
                
                supabase.storage.from_('resumes').upload(
                    path=unique_path,
                    file=file_bytes,
                    file_options={"content-type": file.content_type or "application/pdf"}
                )
                resume_web_url = supabase.storage.from_('resumes').get_public_url(unique_path)
                print(f"☁️ Uploaded PDF to Storage: {resume_web_url}")
            except Exception as upload_error:
                print(f"🚨 Storage Upload Failed: {upload_error}")

        # 4. Save the file temporarily to the server for text extraction
        temp_file_path = f"temp_{file.filename}"
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        try:
            # 5. Extract Text
            raw_text = text_extractor.extract_from_file(temp_file_path)

            if not raw_text or len(raw_text.strip()) == 0:
                raise ValueError("No text could be extracted from the file.")

            # 6. Parse with LLM
            structured_data = await resume_parser.parse_resume(
                raw_text=raw_text, 
                file_path=temp_file_path
            )

            # 🚀 7. IDENTITY TRIANGULATION (Check Email or Phone for existing records)
            is_update = False
            existing_candidate_id = None
            
            if supabase:
                email = structured_data.get('email')
                phone = structured_data.get('phone')
                
                or_conditions = []
                if email:
                    or_conditions.append(f"email.eq.{email}")
                if phone:
                    or_conditions.append(f"phone.eq.{phone}")
                
                if len(or_conditions) > 0:
                    or_query = ",".join(or_conditions)
                    try:
                        match_check = supabase.table("candidates").select("id, name").or_(or_query).execute()
                        if match_check.data and len(match_check.data) > 0:
                            existing_match = match_check.data[0]
                            is_update = True
                            existing_candidate_id = existing_match.get("id")
                            print(f"🔄 Triangulation Match Found! '{structured_data.get('name')}' matches DB record '{existing_match.get('name')}'.")
                    except Exception as e:
                        print(f"⚠️ Triangulation query failed: {e}")

            # 8. Add tracking metadata, the storage URL, and the Identity Flags!
            structured_data['filename'] = file.filename
            structured_data['document_hash'] = file_hash
            structured_data['resume_url'] = resume_web_url
            
            # Flags for the React Frontend to handle merges
            structured_data['is_update'] = is_update
            structured_data['existing_id'] = existing_candidate_id
            
            parsed_candidates.append(structured_data)

        except Exception as e:
            print(f"Error parsing {file.filename}: {str(e)}")
            parsed_candidates.append({
                "filename": file.filename,
                "error": str(e),
                "status": "Failed"
            })
        
        finally:
            # 9. Clean up the temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    return {"parsed_results": parsed_candidates}