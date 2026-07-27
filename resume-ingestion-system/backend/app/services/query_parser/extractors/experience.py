import re

# Map common text numbers to integers to catch "five years", "two yrs", or "a year"
WORD_TO_NUM = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15
}

# 🚀 CONSOLIDATED SUFFIX: Catches "years", "yrs", "y", and optionally "of experience"
YEAR_SUFFIX = r'(?:years?|yrs?|y)\b(?:\s*of\s*experience)?'

def extract_experience(normalized_query: str) -> int:
    """Extracts minimum years of experience requested from messy text."""
    
    # 1. Handle Ranges first (e.g., "3-5 years", "3 to 5 yrs of experience") -> Returns the lower bound
    range_match = re.search(rf'(\d+)\s*(?:-|to)\s*\d+\s*{YEAR_SUFFIX}', normalized_query)
    if range_match:
        return int(range_match.group(1))

    # 2. Handle "greater than" logic (e.g., "> 3 years", "more than 5 yrs")
    gt_match = re.search(rf'(?:>|greater than|more than)\s*(\d+)\s*{YEAR_SUFFIX}', normalized_query)
    if gt_match:
        return int(gt_match.group(1))

    # 3. Handle standard digits with optional '+' (e.g., "4 years", "4+ yrs", "4yr", "4 y")
    match = re.search(rf'(\d+)\+?\s*{YEAR_SUFFIX}', normalized_query)
    if match:
        return int(match.group(1))

    # 4. Handle written words (e.g., "two years", "five+ yrs", "a year")
    for word, num in WORD_TO_NUM.items():
        if re.search(rf'\b{word}\b\+?\s*{YEAR_SUFFIX}', normalized_query):
            return num

    return 0