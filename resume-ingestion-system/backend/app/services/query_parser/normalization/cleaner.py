import re

def clean_query(raw_query: str) -> str:
    """Standardizes text by removing weird characters and extra spaces."""
    if not raw_query:
        return ""
    
    # Lowercase and remove punctuation except standard characters
    text = raw_query.lower()
    text = re.sub(r'[^a-z0-9\s\.\-\+]', ' ', text)
    
    # Remove extra whitespace
    text = " ".join(text.split())
    return text