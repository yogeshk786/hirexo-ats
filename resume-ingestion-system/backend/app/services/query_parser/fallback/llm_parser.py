import os
import httpx

async def parse_with_llm(raw_query: str) -> dict:
    """Uses OpenRouter to deeply analyze complex, messy queries."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    url = "https://openrouter.ai/api/v1/chat/completions"
    
    system_prompt = """
    You are an elite manufacturing recruitment query parser for the Indian industrial sector. 
    Extract the following JSON strictly from the user's search query:
    { "role": string or null, "skills": [strings], "min_exp": integer, "location": string or null }
    """
    
    payload = {
        "model": "openai/gpt-4o-mini",
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Extract intent from this query: {raw_query}"}
        ]
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers={"Authorization": f"Bearer {api_key}"}, json=payload, timeout=5.0)
            if response.status_code == 200:
                import json
                return json.loads(response.json()["choices"][0]["message"]["content"])
        except Exception as e:
            print(f"⚠️ LLM Fallback failed: {e}")
            
        return {}