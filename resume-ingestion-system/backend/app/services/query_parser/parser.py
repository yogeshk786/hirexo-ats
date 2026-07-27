import asyncio
from typing import Dict, Any

from .normalization.cleaner import clean_query
from .normalization.synonyms import apply_synonyms
from .extractors.experience import extract_experience
from .extractors.skills import SkillExtractor
from .extractors.role import RoleExtractor
from .fallback.llm_parser import parse_with_llm

class SearchIntentParser:
    def __init__(self, embedder, db=None):
        print("🧠 Booting up Search Intent Engine (Manufacturing Edition)...")
        self.role_extractor = RoleExtractor(embedder)
        self.skill_extractor = SkillExtractor() 
        self.db = db  # 🚀 This is now your Supabase Client!

    async def parse(self, raw_query: str) -> Dict[str, Any]:
        """Runs the query through the 5-layer pipeline."""
        
        # 🚀 THE FIX: Use hasattr() to safely check if the sync features exist before calling them!
        if hasattr(self.skill_extractor, 'is_synced') and not self.skill_extractor.is_synced:
            if hasattr(self.skill_extractor, 'sync_with_db'):
                await self.skill_extractor.sync_with_db(self.db)
                
        if hasattr(self.role_extractor, 'is_synced') and not self.role_extractor.is_synced:
            if hasattr(self.role_extractor, 'sync_with_db'):
                await self.role_extractor.sync_with_db(self.db)
            
        # LAYER 1 & 2: Normalization
        cleaned_query = clean_query(raw_query)
        normalized_query = apply_synonyms(cleaned_query)
        
        # LAYER 3 & 4: Extraction & Semantic Matching
        intent = {
            "original_query": raw_query,
            "normalized_query": normalized_query,
            "min_exp": extract_experience(normalized_query),
            "skills": self.skill_extractor.extract_skills(normalized_query), 
            "role": self.role_extractor.extract_role(normalized_query),
            "location": None, 
            "requires_fallback": False
        }
        
        # --- 🚀 LAYER 4.5: THE EARLY EXIT (Don't waste LLM on Names/Emails) ---
        is_email = "@" in raw_query
        is_phone = any(char.isdigit() for char in raw_query) and len(raw_query.split()) == 1
        is_name = len(raw_query.split()) <= 2 and not any(char.isdigit() for char in raw_query)
        
        looks_like_direct_lookup = is_email or is_phone or is_name

        if looks_like_direct_lookup and not intent["role"] and not intent["skills"]:
            print(f"⚡ Fast-tracking direct lookup: '{raw_query}'. Bypassing LLM.")
            return intent # Exit immediately, skip Layer 5!

        # LAYER 5: The Fallback
        # If we couldn't find a role AND couldn't find any skills, ask the LLM.
        if not intent["role"] and not intent["skills"]:
            print(f"⚠️ Rules bypassed for query: '{raw_query}'. Engaging LLM fallback...")
            intent["requires_fallback"] = True
            
            llm_data = await parse_with_llm(raw_query)
            
            # --- 🚀 THE UNIVERSAL DISCOVERY ENGINE ---
            if self.db is not None:
                discoveries = []
                
                # 1. Catch New Skills
                llm_skills = llm_data.get("skills", [])
                if isinstance(llm_skills, list) and len(llm_skills) > 0:
                    new_skills = [
                        s for s in llm_skills 
                        if s.lower() not in self.skill_extractor.master_skills 
                    ]
                    if new_skills:
                        # Convert list of skills to a comma-separated string for easy DB storage
                        discoveries.append({
                            "type": "skill",
                            "values": ", ".join(new_skills),
                            "discovered_from_query": raw_query,
                            "status": "pending_review"
                        })
                
                # 2. Catch New Roles (If the LLM found one but our semantic engine missed it)
                llm_role = llm_data.get("role")
                if llm_role:
                    discoveries.append({
                        "type": "role",
                        "values": llm_role,
                        "discovered_from_query": raw_query,
                        "status": "pending_review"
                    })
                    
                # 3. Catch New Locations
                llm_location = llm_data.get("location")
                if llm_location:
                    discoveries.append({
                        "type": "location",
                        "values": llm_location,
                        "discovered_from_query": raw_query,
                        "status": "pending_review"
                    })
                
                # 🚀 THE FIX: Batch Insert safely into Supabase!
                if discoveries:
                    print(f"💡 AI discovered {len(discoveries)} new data points! Saving to Supabase...")
                    try:
                        # Supabase takes the entire list of dicts directly
                        self.db.table("pending_dictionary_additions").insert(discoveries).execute()
                    except Exception as e:
                        print(f"⚠️ Failed to save pending discoveries to DB: {e}")
            
            # --- Merge LLM Data back into the final Intent Object ---
            
            # 🚀 Only hard-filter the role if it matches our exact Master Buckets!
            llm_role = llm_data.get("role")
            if llm_role:
                mapped_bucket = self.role_extractor.extract_role(llm_role)
                if mapped_bucket:
                    intent["role"] = mapped_bucket
                else:
                    intent["role"] = None
                    
            intent["location"] = llm_data.get("location")
            
            if isinstance(llm_data.get("skills"), list):
                intent["skills"] = llm_data.get("skills")
                
            if llm_data.get("min_exp") and isinstance(llm_data.get("min_exp"), int):
                intent["min_exp"] = llm_data.get("min_exp")
            
        return intent