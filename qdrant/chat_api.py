import os
os.environ["ORT_LOGGING_LEVEL"] = "3"
import gc
import json
import google.generativeai as genai
from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)
embedding_model = TextEmbedding(
    model_name="BAAI/bge-small-en-v1.5",
    providers=["CPUExecutionProvider"],
    threads=1
)

if __name__ == "__main__":
    session_id = os.getenv("SESSION_ID")
    question = os.getenv("QUESTION")
    if not question:
        print(json.dumps({"error": "No question provided"}))
        exit(1)

    # Generate query vector via FastEmbed
    question_vector = list(embedding_model.embed([question]))[0].tolist()

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

    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)
    print(json.dumps({"answer": response.text}))
    
    del embedding_model
    gc.collect()