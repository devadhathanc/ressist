import os
import gc
import json
import requests
from qdrant_client import QdrantClient, models
from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "ressist_sessions")

qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)


EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_API_KEY}"
CHAT_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

PERSONAS = {
    "default": (
        "You are Ressist, a precise, helpful, and objective AI scientific research assistant."
    ),
    "reviewer_2": (
        "You are 'Reviewer #2', a notoriously rigorous, skeptical academic peer reviewer. "
        "Scrutinize the claims, critique the methodology and statistical baselines, probe potential biases, "
        "and challenge unproven assertions while remaining intellectually rigorous."
    ),
    "layman": (
        "You are a gifted science communicator explaining complex research to a beginner (ELI5 mode). "
        "Eliminate dense academic jargon; use vivid real-world analogies, straightforward metaphors, and simple takeaways."
    ),
    "engineer": (
        "You are a Principal AI & Research Implementation Engineer. "
        "Focus on practical mechanics, math formulations, data pipelines, and how to actually code and reproduce this in Python/PyTorch. Provide runnable, clean code snippets."
    ),
    "socratic": (
        "You are a Socratic Research Mentor. "
        "Guide the reader step-by-step toward deep comprehension by explaining mechanisms, and end with one insightful follow-up question to test their understanding."
    )
}

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

def generate_answer(prompt, system_instruction=""):
    """Generate an answer using Gemini 2.5 Flash via REST API."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
    resp = requests.post(CHAT_URL, json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

if __name__ == "__main__":
    session_id = os.getenv("SESSION_ID")
    question = os.getenv("QUESTION")
    persona_key = os.getenv("PERSONA", "default").lower().strip()
    if persona_key not in PERSONAS:
        persona_key = "default"

    if not question:
        print(json.dumps({"error": "No question provided"}))
        exit(1)

    # Embed query
    question_vector = embed_query(question)

    # Determine collection (master or fallback to legacy session_id)
    target_collection = COLLECTION_NAME if qdrant.collection_exists(COLLECTION_NAME) else session_id
    query_filter = None
    if target_collection == COLLECTION_NAME:
        query_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="session_id",
                    match=models.MatchValue(value=session_id)
                )
            ]
        )

    # Query Qdrant with session-level filter
    search_result = qdrant.query_points(
        collection_name=target_collection,
        query=question_vector,
        query_filter=query_filter,
        limit=5
    )


    context_blocks = []
    citations = []

    for hit in search_result.points:
        if hasattr(hit, "payload") and "text" in hit.payload:
            page = hit.payload.get("page", 1)
            text = hit.payload["text"]
            context_blocks.append(f"[Source Page {page}]:\n{text}")
            citations.append({
                "page": page,
                "snippet": text[:150]
            })

    retrieved_context = "\n\n---\n\n".join(context_blocks)

    system_instruction = (
        f"{PERSONAS[persona_key]}\n\n"
        "FORMATTING & CITATION RULES:\n"
        "1. Ground your answers directly in the provided paper context.\n"
        "2. When citing facts, findings, benchmarks, or figures, ALWAYS cite the page number using `[Page X]` syntax (e.g. `[Page 3]` or `[Page 5]`).\n"
        "3. Format mathematical formulas in standard LaTeX using $inline$ or $$block$$ syntax.\n"
        "4. If describing architectures, workflows, algorithms, or processes, generate a clear Mermaid diagram inside a ```mermaid code block.\n"
        "5. If the question cannot be answered from the context, state that clearly."
    )

    prompt = f"Context from Paper:\n{retrieved_context}\n\nUser Question:\n{question}\n\nAnswer:"

    answer = generate_answer(prompt, system_instruction)
    print(json.dumps({
        "answer": answer,
        "citations": citations,
        "persona": persona_key
    }))

    gc.collect()