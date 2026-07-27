# Map slang and abbreviations to standardized terms
SYNONYM_MAP = {
    "jr": "entry-level",
    "junior": "entry-level",
    "fresher": "entry-level",
    "trainee": "entry-level",
    "sr": "senior",
    "lead": "senior",
    "manager": "senior",
    "op": "operator",
    "prog": "programmer",
    "iti": "industrial training institute",
    "dme": "diploma in mechanical",
    "qc": "quality control",
    "qa": "quality control"
}

def apply_synonyms(cleaned_text: str) -> str:
    """Replaces slang with standardized vocabulary."""
    words = cleaned_text.split()
    normalized_words = [SYNONYM_MAP.get(word, word) for word in words]
    return " ".join(normalized_words)