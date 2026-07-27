import asyncio
import os
import time
import httpx
import json
import re
import spacy
import hashlib
import uuid  
from pydantic import BaseModel
from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client
from sentence_transformers import SentenceTransformer 

# --- ENVIRONMENT & SUPABASE INITIALIZATION ---
load_dotenv(find_dotenv())

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
# 🚀 THE FIX: Use the Admin Service Role Key so the AI Worker can bypass RLS and save candidates!
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("🚨 FATAL BOOT WARNING: Supabase credentials missing from .env file!")
    print("Ensure you have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    supabase = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("☁️ Supabase Cloud Storage safely linked!")

# --- LOAD LOCAL AI MODELS ---
print("⏳ Loading local AI NLP model (spaCy Large). This might take a few seconds...")
try:
    nlp = spacy.load("en_core_web_lg")
    print("✅ Local NLP Model loaded successfully!")
    
    print("⏳ Loading Vector Embedding Model (all-MiniLM-L6-v2)...")
    embedder = SentenceTransformer('all-MiniLM-L6-v2') 
    print("✅ Vector Model loaded successfully!")
except OSError:
    print("❌ Model not found. Please check your installations.")
    raise

class ParsingTask(BaseModel):
    id: str
    file_path: str
    retry_count: int = 0
    max_retries: int = 3
    last_attempt_time: float = 0.0

class RoundRobinWorker:
    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
        self.is_running = False
        self.extractor = None
        self.resume_parser = None  
        
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.url = "https://openrouter.ai/api/v1/chat/completions"

    async def start(self, extractor, mongodb=None): 
        self.extractor = extractor
        self.is_running = True
        asyncio.create_task(self._process_loop())
        print("🚀 Level 99 Multi-Tenant AI Orchestration Pipeline Started.")

    async def _process_loop(self):
        while self.is_running:
            task: ParsingTask = await self.queue.get()
            
            current_time = time.time()
            if current_time - task.last_attempt_time < 6.0 and self.queue.qsize() > 0:
                await self.queue.put(task)
                self.queue.task_done()
                await asyncio.sleep(0.5)
                continue

            original_filename = os.path.basename(task.file_path)
            safe_filename = re.sub(r'[^\w\s.-]', '_', original_filename)
            safe_path = os.path.join(os.path.dirname(task.file_path), safe_filename)
            
            if task.file_path != safe_path and os.path.exists(task.file_path):
                try:
                    os.rename(task.file_path, safe_path)
                    
                    old_meta_path = f"{task.file_path}_metadata.json"
                    new_meta_path = f"{safe_path}_metadata.json"
                    if os.path.exists(old_meta_path):
                        os.rename(old_meta_path, new_meta_path)
                        
                    task.file_path = safe_path
                except OSError as e:
                    print(f"⚠️ Could not rename file {original_filename}: {e}")

            print(f"\n🔄 Processing Task {task.id} ({os.path.basename(task.file_path)})")
            task.last_attempt_time = current_time

            try:
                # ==========================================
                # 🚀 MULTI-TENANT UPGRADE: LOAD METADATA EARLY
                # ==========================================
                meta = {}
                metadata_path = f"{task.file_path}_metadata.json"
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, 'r', encoding='utf-8') as mf:
                            meta = json.load(mf)
                    except Exception as e:
                        print(f"⚠️ Could not load metadata: {e}")

                company_id = meta.get("company_id")
                if not company_id:
                    print(f"🚨 FATAL: No company_id found in metadata for {safe_filename}. Dropping task.")
                    if os.path.exists(task.file_path): os.remove(task.file_path)
                    if os.path.exists(metadata_path): os.remove(metadata_path)
                    self.queue.task_done()
                    continue

                raw_text = self.extractor.extract_text(task.file_path)
                
                if not raw_text or not raw_text.strip():
                    print(f"❌ Task {task.id} has no readable text. Skipping and deleting.")
                    if os.path.exists(task.file_path):
                        try:
                            os.remove(task.file_path)
                            if os.path.exists(metadata_path): os.remove(metadata_path)
                        except OSError:
                            pass
                    self.queue.task_done()
                    continue 

                cleaned_text = " ".join(raw_text.split())
                text_hash = hashlib.sha256(cleaned_text.encode('utf-8')).hexdigest()
                
                # 🚀 UPGRADE: Isolate duplicate checking by company_id!
                existing_doc = None
                if supabase:
                    res = supabase.table("candidates").select("id, ai_status, resume_url")\
                        .eq("document_hash", text_hash)\
                        .eq("company_id", company_id).execute()
                        
                    if res.data:
                        existing_doc = res.data[0]
                        
                        if existing_doc.get("ai_status") == "complete" and existing_doc.get("resume_url"):
                            print(f"🛑 [DUPLICATE BLOCKED] Candidate already applied to this specific company. Skipping.")
                            if os.path.exists(task.file_path):
                                try:
                                    os.remove(task.file_path)
                                    if os.path.exists(metadata_path): os.remove(metadata_path)
                                except OSError:
                                    pass
                            self.queue.task_done()
                            continue

                if not self._stage1_local_gatekeeper(cleaned_text):
                    if os.path.exists(task.file_path):
                        try:
                            os.remove(task.file_path)
                            if os.path.exists(metadata_path): os.remove(metadata_path)
                        except OSError:
                            pass
                    self.queue.task_done()
                    continue

                if len(cleaned_text) > 15000:
                    cleaned_text = cleaned_text[:15000]

                is_human_resume = await self._stage2_fast_classifier(cleaned_text)
                if not is_human_resume:
                    print(f"🤖 [STAGE 2 FAILED] Task flagged as NON-RESUME. Dropping.")
                    if os.path.exists(task.file_path):
                        try:
                            os.remove(task.file_path)
                            if os.path.exists(metadata_path): os.remove(metadata_path)
                        except OSError:
                            pass
                    self.queue.task_done()
                    continue
                
                print(f"✅ [STAGE 2 PASSED] Task {task.id} confirmed as human resume.")

                # ==========================================
                # 🚀 STAGE 3: MULTI-TENANT SECURE STORAGE
                # ==========================================
                filename = os.path.basename(task.file_path)
                # Store it inside a company-specific folder in Supabase
                unique_remote_path = f"{company_id}/{task.id}_{filename}"
                resume_web_url = None

                needs_supabase_upload = not existing_doc or (existing_doc and not existing_doc.get("resume_url"))

                if needs_supabase_upload:
                    if supabase is None: # 🚀 THIS IS THE TYPO WE FIXED!
                        print("🚨 PIPELINE HALTED: Supabase is NOT connected! The script cannot upload the file.")
                    else:
                        try:
                            with open(task.file_path, 'rb') as f:
                                supabase.storage.from_('resumes').upload(
                                    path=unique_remote_path,
                                    file=f,
                                    file_options={"content-type": "application/pdf"}
                                )
                            resume_web_url = supabase.storage.from_('resumes').get_public_url(unique_remote_path)
                            print(f"☁️ Uploaded to Supabase! Link: {resume_web_url}")
                        except Exception as upload_error:
                            print(f"🚨 Supabase Upload Failed: {upload_error}")
                else:
                    resume_web_url = existing_doc.get("resume_url")
                    print(f"🔄 Retrying AI extraction for '{filename}'...")

                # ==========================================
                # 🚀 STAGE 4: THE HEAVY AI EXTRACTION
                # ==========================================
                candidate_id = None 
                try:
                    if self.resume_parser is None:
                        raise Exception("Engine Error: ResumeParser component not linked.")
                    
                    # 🚀 UPGRADE: Pass the company_id to the parser so it correctly creates the database row!
                    parsed_data, candidate_id = await self.resume_parser.parse(task.file_path, cleaned_text, resume_web_url, company_id)

                    # 🚀 LOG THE RESULTS TO THE TERMINAL SO YOU CAN SEE THE MAGIC!
                    print(f"\n🧠 AI PARSED RESULTS FOR {filename}:")
                    print(json.dumps(parsed_data, indent=4))

                    # 2. Generate Vector Math
                    skills_string = " ".join(parsed_data.get("technical_skills", []))
                    search_text = f"{parsed_data.get('summary', '')} {skills_string}"
                    if len(search_text.strip()) < 10:
                        search_text = cleaned_text[:2000]
                        
                    print(f"🧮 Calculating Vector Embeddings for {filename}...")
                    vector_math = embedder.encode(search_text).tolist()
                    
                    if supabase and candidate_id:
                        update_res = supabase.table("candidates").update({
                            "ai_embedding": json.dumps(vector_math),
                            "document_hash": text_hash,
                            "ai_status": "complete",
                            "resume_url": resume_web_url,
                            "raw_text": cleaned_text
                        }).eq("id", candidate_id).execute()

                        print(f"✅ AI Processing fully complete and vectorized for {parsed_data.get('name', filename)}!")

                        # 🚀 CRM ARCHITECTURE: Log the communication strictly for this company
                        communication_record = {
                            "candidate_id": candidate_id,
                            "company_id": company_id, # Link it to the tenant
                            "type": "inbound_email",
                            "sender": meta.get("sender"),
                            "subject": meta.get("subject"),
                            "received_at": meta.get("date"),
                            "original_filename": filename
                        }
                        
                        supabase.table("communications").insert(communication_record).execute()
                        print(f"📬 Communication log officially linked to Candidate ID: {candidate_id}")

                except Exception as deep_ai_error:
                    print(f"🚨 AI Extractor Failed: {deep_ai_error}")
                    if supabase and candidate_id:
                        supabase.table("candidates").update({"ai_status": "failed"}).eq("id", candidate_id).execute()
                    raise deep_ai_error

            except Exception as e:
                task.retry_count += 1
                print(f"⚠️ Task {task.id} rotation alert: {e}")
                
                if "429" in str(e) or "403" in str(e) or "temporarily rate-limited" in str(e):
                    backoff_time = min(60 * (2 ** (task.retry_count - 1)), 600)
                    print(f"🛑 API Limit hit. Backing off for {backoff_time} seconds...")
                    await asyncio.sleep(backoff_time) 
                
                if task.retry_count < task.max_retries:
                    await self.queue.put(task)
                    self.queue.task_done()
                    continue 
                else:
                    print(f"❌ Task {task.id} dropped into Dead-Letter-Log after exceeding max retries.")
                    if os.path.exists(task.file_path):
                        try:
                            os.remove(task.file_path)
                            meta_drop = f"{task.file_path}_metadata.json"
                            if os.path.exists(meta_drop): os.remove(meta_drop)
                        except OSError:
                            pass
            
            else:
                if os.path.exists(task.file_path):
                    try:
                        os.remove(task.file_path)
                        meta_drop = f"{task.file_path}_metadata.json"
                        if os.path.exists(meta_drop): os.remove(meta_drop)
                        print(f"🧹 Cleaned up local files for: {os.path.basename(task.file_path)}")
                    except OSError:
                        pass

            finally:
                try:
                    self.queue.task_done()
                except ValueError:
                    pass 
                await asyncio.sleep(1.5)

    def _stage1_local_gatekeeper(self, text: str) -> bool:
        text_lower = text.lower()
        
        has_email = bool(re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text))
        has_phone = bool(re.search(r'[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]', text))
        
        if not has_email and not has_phone:
            print("📉 [GATEKEEPER REJECTED] No Email or Phone found. Dropping document.")
            return False

        score = 0
        if has_email: score += 30 
        if has_phone: score += 30 
        if re.search(r'linkedin\.com/in/', text_lower): score += 40 

        pro_keywords = ["education", "experience", "skills", "summary", "university", "bachelor", "cgpa", "projects", "objective"]
        for word in pro_keywords:
            if word in text_lower:
                score += 10

        anti_keywords = [
            "company profile", "established in", "leading manufacturer", "invoice", 
            "quotation", "about us", "our services", "annual general meeting", 
            "shareholders", "notice is hereby given", "board of directors", "financial statements"
        ]
        for word in anti_keywords:
            if word in text_lower:
                score -= 40

        if len(text_lower) > 20000:
            score -= 50

        if score < 50:
            print(f"📉 [GATEKEEPER REJECTED] Score: {score}/50. Failed heuristic scan.")
            return False

        header_text = text[:1000]
        if header_text.isupper():
            header_text = header_text.title()
            
        doc = nlp(header_text)
        human_found = False

        for entity in doc.ents:
            if entity.label_ == "PERSON":
                human_found = True
                print(f"🕵️‍♂️ spaCy detected human name: {entity.text}")
                break

        if not human_found:
            if score >= 70:
                print(f"⚠️ [GATEKEEPER OVERRIDE] Massive Score ({score}). spaCy missed name, but bypassing!")
                return True
            else:
                print(f"🤖 [GATEKEEPER REJECTED] Score: {score}/50, but local AI found NO Human Name.")
                return False

        print(f"📈 [GATEKEEPER PASSED] Score: {score}. Human verified by local AI!")
        return True

    async def _stage2_fast_classifier(self, text: str) -> bool:
        model_sequence = [
            "google/gemini-1.5-flash",  
            "meta-llama/llama-3.1-8b-instruct",  
            "qwen/qwen-2.5-7b-instruct"          
        ]
        
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        
        for model in model_sequence:
            payload = {
                "model": model, 
                "messages": [
                    {"role": "system", "content": "You are a routing agent. Read the user's document. If it is a human being's resume or CV, reply with exactly the word TRUE. If it is a company profile, job description, article, or anything else, reply with exactly the word FALSE. Do not explain your reasoning."},
                    {"role": "user", "content": f"Document text:\n{text[:5000]}"} 
                ]
            }

            async with httpx.AsyncClient() as client:
                try:
                    response = await client.post(self.url, headers=headers, json=payload, timeout=15.0)
                    if response.status_code == 200:
                        decision = response.json()["choices"][0]["message"]["content"].strip().upper()
                        return "TRUE" in decision
                    else:
                        print(f"⚠️ Model {model} returned status {response.status_code}. Shifting to backup...")
                except Exception as e:
                    print(f"⚠️ Model {model} encountered an error: {e}. Shifting to backup...")
                    continue 

        raise Exception("Stage 2 Classification Failed: All fallback models exhausted or rate-limited.")