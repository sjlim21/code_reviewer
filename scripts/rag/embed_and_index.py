import os
import requests
from supabase import create_client, Client

def load_env():
    env_vars = {}
    if os.path.exists('.env'):
        with open('.env', 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split('=', 1)
                if len(parts) == 2:
                    env_vars[parts[0].strip()] = parts[1].strip()
    return env_vars

def get_embedding(text, gemini_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={gemini_key}"
    headers = {"Content-Type": "application/json"}
    body = {
        "model": "models/text-embedding-004",
        "content": {
            "parts": [{"text": text}]
        }
    }
    try:
        r = requests.post(url, headers=headers, json=body, timeout=10)
        if r.status_code == 200:
            res_data = r.json()
            return res_data.get("embedding", {}).get("values")
        else:
            print(f"Embedding API Error (HTTP {r.status_code}): {r.text}")
            return None
    except Exception as e:
        print(f"Request failed for embedding: {e}")
        return None

def main():
    env = load_env()
    supabase_url = env.get('VITE_SUPABASE_URL')
    supabase_key = env.get('VITE_SUPABASE_ANON_KEY')
    gemini_key = env.get('VITE_GEMINI_API_KEY')
    
    if not supabase_url or not supabase_key:
        print("Error: Supabase config not found in .env")
        return
    if not gemini_key:
        print("Error: Gemini API key not found in .env")
        return

    supabase: Client = create_client(supabase_url, supabase_key)

    print("Fetching records without embeddings...")
    try:
        # Query rows where embedding is null
        res = supabase.table("rag_knowledge").select("id, title, description").is_("embedding", "null").execute()
        records = res.data or []
        print(f"Found {len(records)} records without embeddings.")
    except Exception as e:
        print(f"Failed to fetch records: {e}")
        return

    for rec in records:
        rec_id = rec["id"]
        title = rec["title"]
        description = rec["description"]
        text_to_embed = f"{title}: {description}"
        
        print(f"Generating embedding for: {title[:30]}...")
        emb = get_embedding(text_to_embed, gemini_key)
        if emb:
            try:
                # Update row
                supabase.table("rag_knowledge").update({"embedding": emb}).eq("id", rec_id).execute()
                print(f"Updated embedding for record: {rec_id}")
            except Exception as e:
                print(f"Failed to update database for {rec_id}: {e}")
        else:
            print(f"Could not get embedding for {title}")

if __name__ == "__main__":
    main()
