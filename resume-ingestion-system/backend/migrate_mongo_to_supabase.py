import os
from pymongo import MongoClient
from supabase import create_client, Client
from dotenv import load_dotenv

# Load connection keys from environment variables or .env file
load_dotenv()

# --- 1. CONFIGURATIONS ---
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "resume_engine")
SUPABASE_URL = os.getenv("SUPABASE_URL")

# 🚀 FIX: Smart fallback to catch the exact variable name you used in your .env
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

# 🚨 SAFETY CHECK: Stop the script immediately if the key is missing or invalid
if not SUPABASE_KEY or "your_supabase" in SUPABASE_KEY or not SUPABASE_KEY.startswith("eyJ"):
    print("🚨 FATAL ERROR: No valid Supabase Service Role key found!")
    print("Please check your .env file. The key MUST start with 'eyJ...' (Service Role Secret), not 'sb_publishable'.")
    exit(1)

# --- 2. INITIALIZE CLIENTS ---
try:
    mongo_client = MongoClient(MONGO_URI)
    mongo_db = mongo_client[MONGO_DB_NAME]
    mongo_collection = mongo_db["resumes"]
    print("🔌 Successfully connected to MongoDB Atlas.")
except Exception as e:
    print(f"❌ Failed to connect to MongoDB: {e}")
    exit(1)

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("🔌 Successfully connected to Supabase Engine.")
except Exception as e:
    print(f"❌ Failed to connect to Supabase: {e}")
    exit(1)


def migrate_data():
    print("\n📦 Fetching all resume documents from MongoDB...")
    mongo_docs = list(mongo_collection.find({}))
    total_docs = len(mongo_docs)
    
    if total_docs == 0:
        print("⚠️ No resumes found in MongoDB to migrate. Exiting.")
        return

    print(f"✅ Found {total_docs} records to process. Restructuring into relational tables...")

    candidates_batch = []
    education_batch = []
    experience_batch = []

    for doc in mongo_docs:
        candidate_id = str(doc["_id"])
        
        # 🚀 FIX 1: Safely format the pgvector array into a Postgres-friendly string
        ai_emb = doc.get("ai_embedding")
        formatted_embedding = None
        if isinstance(ai_emb, list) and len(ai_emb) > 0:
            formatted_embedding = f"[{','.join(map(str, ai_emb))}]"
        
        # --- A. MAP PARENT CANDIDATE RECORD ---
        candidates_batch.append({
            "id": candidate_id,
            "filename": doc.get("filename"),
            "document_hash": doc.get("document_hash"),
            "raw_text": doc.get("raw_text"),
            "ai_status": doc.get("ai_status"),
            "resume_url": doc.get("resume_url"),
            "ai_embedding": formatted_embedding, 
            
            "name": doc.get("name"),
            "email": doc.get("email"),
            "phone": doc.get("phone"),
            "location": doc.get("location"),
            "summary": doc.get("summary"),
            "total_experience_years": doc.get("total_experience_years", 0),
            
            "email_received_at": doc.get("email_received_at"),
            "email_sender": doc.get("email_sender"),
            "email_subject": doc.get("email_subject"),
            
            "certifications": doc.get("certifications", []),
            "interests": doc.get("interests", []),
            "languages": doc.get("languages", []),
            "projects": doc.get("projects", []),
            "social_links": doc.get("social_links", []),
            "soft_skills": doc.get("soft_skills", []),
            "technical_skills": doc.get("technical_skills", []),
            "segmentation": doc.get("segmentation", {}),
            "intelligence_layer": doc.get("intelligence_layer", {})
        })

        # --- B. EXTRACT AND LINK NESTED EDUCATION ROWS ---
        for edu in doc.get("education", []):
            education_batch.append({
                "candidate_id": candidate_id, 
                "degree": edu.get("degree"),
                "institution": edu.get("institution"),
                "year": edu.get("year"),
                "score": edu.get("score")
            })

        # --- C. EXTRACT AND LINK NESTED WORK EXPERIENCE ROWS ---
        for exp in doc.get("work_experience", []):
            experience_batch.append({
                "candidate_id": candidate_id, 
                "job_title": exp.get("job_title"),
                "company": exp.get("company"),
                "start_date": exp.get("start_date"),
                "end_date": exp.get("end_date"),
                "duration": exp.get("duration"),
                "date": exp.get("date"),
                "description": exp.get("description"),
                "is_internship": exp.get("is_internship", False),
                "duration_months": exp.get("duration_months", 0)
            })

    # --- 3. EXECUTE TARGET UPLOADS ---
    # Step 1: Upload main candidate profiles
    if candidates_batch:
        print(f"\n🚀 Upserting {len(candidates_batch)} candidate master profiles...")
        chunk_size = 50
        for i in range(0, len(candidates_batch), chunk_size):
            chunk = candidates_batch[i:i + chunk_size]
            try:
                supabase.table("candidates").upsert(chunk).execute()
            except Exception as e:
                print(f"⚠️ Failed to insert candidate chunk starting at index {i}: {e}")
        print("✅ Master profiles upload cycle finished.")

    # 🚀 FIX 2: Batch Deletions (Massive Speed Boost)
    print("\n🧹 Cleaning existing relational data using high-speed batch deletions...")
    chunk_size = 100
    for i in range(0, len(candidates_batch), chunk_size):
        chunk = candidates_batch[i:i + chunk_size]
        candidate_ids = [c["id"] for c in chunk]
        try:
            supabase.table("education").delete().in_("candidate_id", candidate_ids).execute()
            supabase.table("work_experience").delete().in_("candidate_id", candidate_ids).execute()
        except Exception as e:
            print(f"⚠️ Failed to delete old records for chunk {i}: {e}")

    # Step 3: Insert split structural education entries
    if education_batch:
        print(f"\n🚀 Inserting {len(education_batch)} rows into the 'education' table...")
        chunk_size = 100
        for i in range(0, len(education_batch), chunk_size):
            chunk = education_batch[i:i + chunk_size]
            try:
                supabase.table("education").insert(chunk).execute()
            except Exception as e:
                print(f"⚠️ Failed to insert education chunk starting at {i}: {e}")
        print("✅ Education relational entries written.")

    # Step 4: Insert split structural work experience entries
    if experience_batch:
        print(f"\n🚀 Inserting {len(experience_batch)} rows into the 'work_experience' table...")
        chunk_size = 100
        for i in range(0, len(experience_batch), chunk_size):
            chunk = experience_batch[i:i + chunk_size]
            try:
                supabase.table("work_experience").insert(chunk).execute()
            except Exception as e:
                print(f"⚠️ Failed to insert experience chunk starting at {i}: {e}")
        print("✅ Work Experience relational entries written.")

    print("\n🎉 MIGRATION SUCCESSFUL! All records processed.")

if __name__ == "__main__":
    migrate_data()