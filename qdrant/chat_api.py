#
# from fastapi import FastAPI
# from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client import models
from qdrant_client.models import Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer
import google.generativeai as genai
import os
#
# from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()

#
# app = FastAPI()
#
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Load embeddings model (same as before)
embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Initialize Qdrant
qdrant = QdrantClient(url=os.getenv("QDRANT_URL", "http://localhost:6333"))

#
# class ChatRequest(BaseModel):
#     session_id: str
#     question: str
#
# @app.post("/chat")
# async def chat(req: ChatRequest):
#     # Generate embedding for the user’s question
#     question_vector = embedder.encode(req.question).tolist()
#
#     # Query Qdrant for the top 3 most relevant chunks
#     search_result = qdrant.search(
#         collection_name=req.session_id,
#         query_vector=question_vector,
#         limit=3
#     )
#
#     # Combine retrieved text chunks
#     retrieved_context = "\n\n".join(
#         [hit.payload.get("text", "") for hit in search_result]
#     )
#     print("🔍 Retrieved hits:", len(search_result))
#     for hit in search_result:
#         print("Score:", hit.score, "| Text snippet:", hit.payload.get("text", "")[:100])
#     # Create the prompt for Gemini
#     prompt = f"Context:\n{retrieved_context}\n\nQuestion: {req.question}\nAnswer:"
#
#     # Use Gemini to answer based on retrieved context
#     model = genai.GenerativeModel("gemini-2.5-flash")
#     response = model.generate_content(prompt)
#
#     return {"answer": response.text}


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