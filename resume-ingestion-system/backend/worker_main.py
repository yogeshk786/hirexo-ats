import os
import sys
import asyncio
import uuid
import re 
import json
from supabase import create_client, Client

# --- Wake up the .env file ---
from dotenv import load_dotenv
load_dotenv()

# Ensure Python can find your 'app' folder
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.email.gmail_service import MultiTenantGmailService 
from app.services.parser.text_extractor import TextExtractor
from app.services.parser.resume_parser import ResumeParser
from app.services.parser.worker import RoundRobinWorker, ParsingTask

# ==========================================
# 🚀 INITIALIZE SUPABASE AS ADMIN
# ==========================================
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")

# 🚨 CHECKING FOR THE ADMIN KEY
service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
anon_key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")

if not service_role_key:
    print("\n⚠️ WARNING: 'SUPABASE_SERVICE_ROLE_KEY' is missing from your .env file!")
    print("⚠️ The worker will fall back to the Anon key and may be blocked by Row Level Security (RLS).\n")

# Prioritize the Admin Key
SUPABASE_KEY = service_role_key or anon_key

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("🚨 FATAL BOOT WARNING: Supabase credentials missing from .env file!")
    supabase = None

async def continuous_inbox_watcher(resume_queue):
    """Endless background loop that checks all company inboxes and queues resumes."""
    print("👀 AI WORKER: Multi-Tenant Inbox Watcher initialized. Running 24/7 on Supabase...")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 🚀 THE FIX: Look directly in the root directory for 'raw_resumes'
    raw_dir = os.path.join(base_dir, 'raw_resumes')
    
    ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.doc', '.txt', '.jpg', '.jpeg', '.png'}
    
    while True:
        try:
            print("\n📁 AI WORKER: Syncing global inboxes and scanning local tenant folders...")
            
            # ==========================================
            # 🚀 1. THE MASTER DISPATCHER LOOP
            # ==========================================
            if supabase:
                print("🔍 DEBUG: Querying Supabase for connected companies...")
                companies_res = supabase.table("company_email_integrations").select("company_id").execute()
                active_companies = companies_res.data or []
                
                print(f"📊 DEBUG: Supabase returned {len(active_companies)} connected companies.")
                if len(active_companies) == 0:
                    print("📋 DEBUG: The vault returned empty. (Check your .env for the SERVICE_ROLE_KEY!)")
                
                for comp in active_companies:
                    company_id = comp['company_id']
                    try:
                        # Boot up the downloader strictly for this specific company
                        gmail = MultiTenantGmailService(company_id=company_id)
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, gmail.download_resumes)
                    except Exception as e:
                        print(f"⚠️ Failed to sync inbox for company {company_id}: {e}")
            
            # ==========================================
            # 🚀 2. DEEP FOLDER SCANNING & QUEUEING
            # ==========================================
            if os.path.exists(raw_dir):
                # os.walk automatically searches inside all company sub-folders!
                for root, dirs, files in os.walk(raw_dir):
                    
                    # Sort files so we process the newest ones first
                    files.sort(key=lambda x: os.path.getmtime(os.path.join(root, x)), reverse=True)
                    enqueued_count = 0
                    
                    for file_name in files:
                        file_path = os.path.join(root, file_name)
                        
                        if file_name.endswith('_metadata.json'): continue
                            
                        file_ext = os.path.splitext(file_name)[1].lower()
                        if file_ext not in ALLOWED_EXTENSIONS:
                            try: os.remove(file_path)
                            except OSError: pass
                            continue 
                        
                        already_queued = any(task.file_path == file_path for task in list(resume_queue._queue))
                        safe_filename = re.sub(r'[^\w\s.-]', '_', file_name)
                        
                        # 🚀 Extract company_id from the JSON metadata to isolate the DB check
                        company_id = None
                        meta_path = f"{file_path}_metadata.json"
                        if os.path.exists(meta_path):
                            try:
                                with open(meta_path, 'r', encoding='utf-8') as mf:
                                    meta_data = json.load(mf)
                                    company_id = meta_data.get("company_id")
                            except: pass
                        
                        # 🚀 TENANT-ISOLATED AUTO-HEALING
                        already_in_db = False
                        if supabase is not None and company_id is not None:
                            res = supabase.table("candidates").select("id, ai_status") \
                                .eq("filename", safe_filename) \
                                .eq("company_id", company_id).execute()
                                
                            if res.data:
                                status = res.data[0].get("ai_status")
                                if status == "complete":
                                    already_in_db = True
                                else:
                                    # Purge the crashed row so we can try again
                                    print(f"♻️ Found incomplete DB entry for {safe_filename} (Status: {status}). Purging bad row to restart fresh!")
                                    supabase.table("candidates").delete().eq("id", res.data[0]["id"]).execute()
                        
                        if already_in_db:
                            print(f"🗑️ Skipping {safe_filename} (Already fully processed). Cleaning up local folder.")
                            try:
                                os.remove(file_path)
                                if os.path.exists(meta_path): os.remove(meta_path)
                            except OSError: pass
                            continue 
                        
                        if not already_queued and not already_in_db:
                            task_id = str(uuid.uuid4())[:8]
                            task = ParsingTask(id=task_id, file_path=file_path)
                            await resume_queue.put(task)
                            enqueued_count += 1
                            
                    if enqueued_count > 0:
                        # Extract just the company folder name for clean logging
                        tenant_folder = os.path.basename(root)
                        if tenant_folder != "raw_resumes":
                            print(f"📥 AI WORKER: Enqueued {enqueued_count} new files for tenant {tenant_folder}.")
            
            # The pause before checking the inboxes again
            await asyncio.sleep(60.0)
            
        except asyncio.CancelledError:
            # 🚀 THE FIX: This safely catches the FastAPI shutdown signal!
            print("🛑 AI WORKER: Received shutdown signal. Terminating watcher loop cleanly...")
            break 
            
        except Exception as e:
            print(f"⚠️ AI WORKER Error: {e}")
            try:
                # We also need to be able to catch the cancel signal while it is sleeping after an error!
                await asyncio.sleep(60.0)
            except asyncio.CancelledError:
                print("🛑 AI WORKER: Received shutdown signal during error cooldown. Terminating...")
                break


async def main():
    # 1. Initialize extraction tools & queues
    print("🔌 AI WORKER: Initializing AI Tools & Supabase connection...")
    extractor = TextExtractor()
    resume_parser = ResumeParser() 
    resume_queue = asyncio.Queue()
    worker_engine = RoundRobinWorker(queue=resume_queue)
    worker_engine.resume_parser = resume_parser 

    # 2. Boot up the processing engine
    await worker_engine.start(extractor=extractor)

    # 3. Start the endless loop
    await continuous_inbox_watcher(resume_queue)


if __name__ == "__main__":
    try:
        # Run the asynchronous main function
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 AI WORKER: Shutting down safely.")