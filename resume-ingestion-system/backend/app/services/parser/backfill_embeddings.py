import os
import sys
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

# Wake up the .env file
from dotenv import load_dotenv
load_dotenv()

# Ensure Python can find the 'app' folder
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.embedding.embedding_service import semantic_engine

async def backfill():
    print("🚀 Starting AI Embedding Backfill Process...")

    # 1. Connect to MongoDB
    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGO_DB_NAME", "resume_engine")

    client = AsyncIOMotorClient(mongo_uri, tls=True, tlsAllowInvalidCertificates=True)
    db = client[db_name]

    # 2. Find resumes missing the AI embedding
    query = {}
    cursor = db.resumes.find(query)
    resumes_to_update = await cursor.to_list(length=None)

    if not resumes_to_update:
        print("✅ All resumes already have AI embeddings! Nothing to do.")
        client.close()
        return

    print(f"🔍 Found {len(resumes_to_update)} resumes missing AI math. Processing...")

    # 3. Process each resume
    for resume in resumes_to_update:
        name = resume.get("name", "Unknown Candidate")
        print(f"🧠 Generating AI Math for: {name}...")

        # Build a rich text string for the AI to read
        text_chunks = []
        if resume.get("summary"): text_chunks.append(resume["summary"])
        if resume.get("technical_skills"): text_chunks.extend(resume["technical_skills"])
        if resume.get("work_experience"):
            for exp in resume["work_experience"]:
                if exp.get("job_title"): text_chunks.append(exp["job_title"])
                if exp.get("company"): text_chunks.append(exp["company"])
        
        full_text = " ".join(text_chunks)
        
        # Fallback if the resume is empty
        if not full_text.strip():
            full_text = "Candidate profile with no extracted text."

        # Generate the 384-dimensional vector using our HuggingFace service
        vector = semantic_engine.generate_embedding(full_text)

        # Save it back to MongoDB
        await db.resumes.update_one(
            {"_id": resume["_id"]},
            {"$set": {"ai_embedding": vector}}
        )
        print(f"✅ Successfully embedded and saved: {name}")

    print("🎉 Backfill complete! You can now use Semantic Search.")
    client.close()

if __name__ == "__main__":
    # Run the async loop
    asyncio.run(backfill())