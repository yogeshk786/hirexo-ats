import os
import asyncio
from fastapi import APIRouter, Request, Depends
from supabase import create_client, Client, ClientOptions 
from dotenv import load_dotenv

from app.api.deps import get_current_user_and_company 
from app.services.query_parser.parser import SearchIntentParser

load_dotenv()

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def calculate_rrf(vector_results, keyword_results, parsed_intent, k=60):
    fused_scores = {}
    master_doc_map = {}

    for rank, doc in enumerate(vector_results):
        doc_id = str(doc.get("id") or doc.get("candidate_id")) 
        master_doc_map[doc_id] = doc
        fused_scores[doc_id] = fused_scores.get(doc_id, 0.0) + (1.0 / (k + rank + 1))

    for rank, doc in enumerate(keyword_results):
        doc_id = str(doc.get("id") or doc.get("candidate_id"))
        if doc_id not in master_doc_map:
            master_doc_map[doc_id] = doc
        fused_scores[doc_id] = fused_scores.get(doc_id, 0.0) + (1.0 / (k + rank + 1))

    required_skills = [s.lower() for s in parsed_intent.get("skills", [])]
    
    fused_results = []
    for doc_id, score in fused_scores.items():
        doc = master_doc_map[doc_id]
        final_score = score * 3000
        
        candidate_skills = [s.lower() for s in doc.get("technical_skills", [])] if doc.get("technical_skills") else []
        
        bonus = 0
        if required_skills:
            for req_skill in required_skills:
                if any(req_skill in c_skill for c_skill in candidate_skills):
                    bonus += 15 
                    
        doc["match_score"] = round(final_score + bonus, 1)
        fused_results.append(doc)

    fused_results.sort(key=lambda x: x["match_score"], reverse=True)
    return fused_results


@router.get("/api/search")
async def search_candidates(
    request: Request, 
    query: str = None, 
    auth_data: dict = Depends(get_current_user_and_company)
):
    embedder = request.app.state.embedder 
    client_company_id = auth_data["company_id"]
    
    auth_header = {"Authorization": f"Bearer {auth_data['token']}"}
    user_supabase = create_client(
        SUPABASE_URL, 
        SUPABASE_KEY, 
        options=ClientOptions(headers=auth_header)
    )

    if not hasattr(request.app.state, 'intent_parser'):
        request.app.state.intent_parser = SearchIntentParser(embedder, user_supabase)
    intent_parser = request.app.state.intent_parser

    final_results = []

    # --- SCENARIO 1: Empty search bar ---
    if not query or not query.strip():
        res = user_supabase.table("candidates") \
            .select("*") \
            .eq("company_id", client_company_id) \
            .order("email_received_at", desc=True) \
            .limit(100).execute() 
        final_results = res.data or []

    # --- SCENARIO 2: Hybrid Search ---
    else:
        parsed_intent = await intent_parser.parse(query)
        min_exp = parsed_intent.get("min_exp") or 0
        query_vector = embedder.generate_embedding(query)
        
        def fetch_vector():
            try:
                res = user_supabase.rpc('match_candidates_v2', {'query_embedding': query_vector, 'match_threshold': 0.0, 'match_count': 50}).execute()
                return res.data or []
            except Exception as e:
                print(f"❌ Vector search error: {e}")
                return []

        def fetch_keyword():
            try:
                # 🚀 ADVANCED UPGRADE: Dual-pass keyword search
                safe_query = query.strip()
                
                # Pass 1: Try for a direct phrase match first
                res = user_supabase.table("candidates") \
                    .select("*") \
                    .eq("company_id", client_company_id) \
                    .ilike("raw_text", f"%{safe_query}%") \
                    .limit(50).execute()
                
                # Pass 2: If exact phrase fails, dynamically build a broad "OR" token search
                if not res.data:
                    tokens = [word for word in safe_query.replace("@", " ").replace(",", " ").replace("/", " ").split() if len(word) > 1]
                    if tokens:
                        pg_search_query = " | ".join(tokens) 
                        res = user_supabase.table("candidates") \
                            .select("*") \
                            .eq("company_id", client_company_id) \
                            .textSearch("raw_text", pg_search_query) \
                            .limit(50).execute()
                            
                return res.data or []
            except Exception as e:
                print(f"❌ Keyword search error: {e}")
                return []

        vector_results, keyword_results = await asyncio.gather(
            asyncio.to_thread(fetch_vector),
            asyncio.to_thread(fetch_keyword)
        )
        
        # 🚀 ULTIMATE FAILSAFE: If no direct matches, grab recent candidates and let RRF rank them
        if not vector_results and not keyword_results:
            fallback_res = user_supabase.table("candidates").select("*").eq("company_id", client_company_id).limit(50).execute()
            keyword_results = fallback_res.data or []

        def apply_filters(results):
            filtered = []
            for doc in results:
                # Strictly enforce tenant isolation
                c_id = doc.get("company_id")
                if c_id and str(c_id) != str(client_company_id): 
                    continue
                
                # Safely cast experience to avoid Python math crashes
                try:
                    candidate_exp = float(doc.get("total_experience_years") or 0)
                    required_exp = float(min_exp)
                    if candidate_exp < required_exp:
                        continue 
                except Exception:
                    pass 

                # 🚀 ADVANCED UPGRADE: Removed strict role dropping. We let calculate_rrf score them!
                filtered.append(doc)
            return filtered

        vector_results = apply_filters(vector_results)
        keyword_results = apply_filters(keyword_results)
        
        master_ranked_list = calculate_rrf(vector_results, keyword_results, parsed_intent)
        final_results = master_ranked_list[:50]

    # --- DATA MERGE ---
    if len(final_results) > 0:
        uuids = [c.get("id") for c in final_results if c.get("id")]
        mongo_ids = [c.get("candidate_id") for c in final_results if c.get("candidate_id")]
        all_ids = list(set([str(i) for i in uuids + mongo_ids if i]))

        if all_ids:
            try:
                pipeline_res = user_supabase.table("job_applications").select("candidate_id, status, match_score, jobs!fk_job_id(title, department)").in_("candidate_id", all_ids).execute()
                work_res = user_supabase.table("work_experience").select("*").in_("candidate_id", all_ids).execute()
                edu_res = user_supabase.table("education").select("*").in_("candidate_id", all_ids).execute()

                applications = pipeline_res.data or []
                work_history = work_res.data or []
                education_data = edu_res.data or []

                for candidate in final_results:
                    c_uuid = str(candidate.get("id"))
                    c_mongo = str(candidate.get("candidate_id"))
                    
                    # 🚀 ADVANCED UPGRADE: Hard-cast to string to ensure relations map perfectly
                    candidate["job_applications"] = [a for a in applications if str(a.get("candidate_id")) in (c_uuid, c_mongo)]
                    candidate["work_experience"] = [w for w in work_history if str(w.get("candidate_id")) in (c_uuid, c_mongo)]
                    candidate["education"] = [e for e in education_data if str(e.get("candidate_id")) in (c_uuid, c_mongo)]

            except Exception as e:
                print(f"⚠️ Data Merge Error: {e}")
                for candidate in final_results:
                    if "job_applications" not in candidate: candidate["job_applications"] = []
                    if "work_experience" not in candidate: candidate["work_experience"] = []
                    if "education" not in candidate: candidate["education"] = []

    return {"results": final_results}