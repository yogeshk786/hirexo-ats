import numpy as np
from sentence_transformers import SentenceTransformer

class EmbeddingService:
    def __init__(self):
        print("🧠 Initializing HuggingFace Semantic Engine...")
        # Loads once when the service is instantiated
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

    def generate_embedding(self, text: str) -> list[float]:
        """Converts text into a 384-dimensional vector array."""
        return self.model.encode(text).tolist()

    def calculate_similarity(self, query_vector: list[float], doc_vector: list[float]) -> float:
        """Calculates cosine similarity between two vectors (returns 0.0 to 1.0)."""
        q_vec = np.array(query_vector)
        d_vec = np.array(doc_vector)
        
        # The Math: dot product / (magnitude * magnitude)
        similarity = np.dot(q_vec, d_vec) / (np.linalg.norm(q_vec) * np.linalg.norm(d_vec))
        return float(similarity)

# Create a single global instance to be imported elsewhere
semantic_engine = EmbeddingService()