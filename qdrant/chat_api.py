
from qdrant_client import QdrantClient
from qdrant_client import models
from qdrant_client.models import Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer
import google.generativeai as genai
import os

from dotenv import load_dotenv
load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Load embeddings model (same as before)
embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Initialize Qdrant
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)


if __name__ == "__main__":
    import json

    session_id = os.getenv("SESSION_ID")
    question = os.getenv("QUESTION")
    if not question:
        print(json.dumps({"error": "No question provided"}))
        exit(1)

    # Generate embedding for the question
    question_vector = embedder.encode(question).tolist()
    # Query Qdrant (modern API syntax)
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