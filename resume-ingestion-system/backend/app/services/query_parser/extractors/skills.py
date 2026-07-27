import json
import os

class SkillExtractor:
    def __init__(self):
        # 1. Load the baseline skills from the JSON file immediately
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'skills.json')
        with open(config_path, 'r') as f:
            self.master_skills = set(json.load(f))
            
        self.is_synced = False

    async def sync_with_db(self, db):
        """Pulls newly approved skills from Supabase into active memory."""
        if db is not None:
            try:
                # 🚀 THE FIX: Swapped MongoDB syntax for Supabase PostgreSQL syntax
                response = db.table("system_configs").select("*").eq("id", "master_vocabulary").execute()
                
                if response.data:
                    config = response.data[0]
                    if "skills" in config and config["skills"]:
                        # Add DB skills to the existing JSON skills
                        db_skills = [s.lower() for s in config["skills"]]
                        self.master_skills.update(db_skills)
                        
                self.is_synced = True
                print(f"🔄 Skills Engine Synced! Total active skills in memory: {len(self.master_skills)}")
            except Exception as e:
                print(f"⚠️ Failed to sync skills from DB (using JSON baseline): {e}")

    def extract_skills(self, normalized_query: str) -> list:
        """Finds all known machine/software skills mentioned in the query."""
        found_skills = [skill for skill in self.master_skills if skill in normalized_query]
        return found_skills