import os
import sys
import asyncio  # 🚀 ADDED: To run the blocking AI model download in a background thread
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --- Wake up the .env file ---
from dotenv import load_dotenv
load_dotenv()

# Ensure Python can find your 'app' folder
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 🚀 Modular Routers
from app.api.search import router as search_router
from app.api.match import router as match_router  
from app.api.jobs import router as jobs_router  
from app.api.candidates import router as candidates_router  
from app.api.communications import router as communications_router 
from app.api.integrations import router as integrations_router
from app.api.outreach import router as outreach_router
# 🚀 ADDED: The Parsing Router for Drag & Drop Resumes!
from app.api.parsing import router as parsing_router

# 🚀 Import the clean AI class we just created
from app.services.embedding.embedding_service import EmbeddingService 

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. 🚀 Load the AI Brain ONCE on startup
    print("🧠 API SERVER: Loading Vector Embedding Engine into RAM...")
    
    # 🚀 THE FIX: Run the blocking model download in a safe background thread
    app.state.embedder = await asyncio.to_thread(EmbeddingService)
    
    print("✅ API SERVER: Engine ready to process searches.")
    
    yield  # --- FastAPI serves React/Electron here ---
    
    # 2. Clean shutdown
    print("🛑 API SERVER: Shutting down.")

# Initialize core FastAPI app
app = FastAPI(title="Talent Vault API Gateway", lifespan=lifespan)

# 🚀 THE FIX: Corrected CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # Allows React and Electron apps to connect from anywhere
    allow_credentials=False, # 👈 MUST BE FALSE when allow_origins is ["*"] to prevent crashes!
    allow_methods=["*"],
    allow_headers=["*"],
)

# Plug in the endpoints
app.include_router(search_router)
app.include_router(match_router, prefix="/api", tags=["Matching"]) 
app.include_router(jobs_router)
app.include_router(candidates_router) 
app.include_router(communications_router) 
app.include_router(integrations_router)
app.include_router(outreach_router)
# 🚀 ADDED: Plugged the parsing endpoint into the API Gateway!
app.include_router(parsing_router, prefix="/api", tags=["Parsing"])

@app.get("/")
def read_root():
    return {"message": "The API Gateway is running smoothly on Supabase!"}