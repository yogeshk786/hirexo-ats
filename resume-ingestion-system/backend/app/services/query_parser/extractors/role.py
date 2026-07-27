import json
import os
import torch # 🚀 ADDED: Required to handle the math vectors
from sentence_transformers import util

# Load roles configuration safely
CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config', 'roles.json')
with open(CONFIG_PATH, 'r') as f:
    MASTER_ROLES = json.load(f)

class RoleExtractor:
    def __init__(self, embedder):
        self.embedder = embedder
        
        # 🚀 THE FIX: Use your custom 'generate_embedding' method instead of 'encode'
        # We loop through the master roles, embed them, and convert them to a math Tensor
        raw_vectors = [self.embedder.generate_embedding(role) for role in MASTER_ROLES]
        self.role_vectors = torch.tensor(raw_vectors)

    def extract_role(self, normalized_query: str) -> str:
        """Uses Semantic AI to map weird job titles to our standard buckets."""
        
        # 🚀 THE FIX: Use generate_embedding for the user query as well
        raw_query_vector = self.embedder.generate_embedding(normalized_query)
        query_tensor = torch.tensor([raw_query_vector])
        
        # Calculate Cosine Similarity instantly
        cosine_scores = util.cos_sim(query_tensor, self.role_vectors)[0]
        best_match_index = cosine_scores.argmax().item()
        best_score = cosine_scores[best_match_index].item()
        
        # If the semantic match is higher than 40%, accept it
        if best_score > 0.40:
            return MASTER_ROLES[best_match_index]
        return None