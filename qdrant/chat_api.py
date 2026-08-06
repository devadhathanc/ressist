import os
import gc
import json
import requests
from qdrant_client import QdrantClient
from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)

EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_API_KEY}"
CHAT_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

def embed_query(text):
    """Embed a single query string using Gemini gemini-embedding-001 via REST."""
    payload = {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": text}]},
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": 768
    }
    resp = requests.post(EMBED_URL, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()["embedding"]["values"]

def generate_answer(prompt):
    """Generate an answer using Gemini 2.5 Flash via REST API."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    resp = requests.post(CHAT_URL, json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

if __name__ == "__main__":
    session_id = os.getenv("SESSION_ID")
    question = os.getenv("QUESTION")
    if not question:
        print(json.dumps({"error": "No question provided"}))
        exit(1)

    # Embed query via REST v1
    question_vector = embed_query(question)

    # Query Qdrant
    search_result = qdrant.query_points(
        collection_name=session_id,
        query=question_vector,
        limit=3
    )

    retrieved_context = "\n\n".join([
        hit.payload.get("text", "") for hit in search_result.points
        if hasattr(hit, "payload") and "text" in hit.payload
    ])

    prompt = f"Context:\n{retrieved_context}\n\nQuestion: {question}\nAnswer:"

    answer = generate_answer(prompt)
    print(json.dumps({"answer": answer}))

    gc.collect()