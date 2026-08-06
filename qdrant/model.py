import os
import gc
import json
import requests
from dotenv import load_dotenv
from pypdf import PdfReader
from qdrant_client import QdrantClient, models

load_dotenv()

# --- Environment Variables ---
SESSION_ID = os.getenv("SESSION_ID", "default")
PDF_PATH = os.getenv("PDF_PATH")
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
UNPAYWALL_JSON = os.getenv("UNPAYWALL_JSON")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not PDF_PATH or not os.path.exists(PDF_PATH):
    print(f"❌ PDF file not found at {PDF_PATH}")
    exit(1)

print(f"📄 Loading PDF from: {PDF_PATH}")

# --- Load PDF & Extract Text ---
reader = PdfReader(PDF_PATH)
full_text = ""
for page in reader.pages:
    text = page.extract_text()
    if text:
        full_text += text + "\n"

del reader
gc.collect()

# --- Text Chunking (1000 chars with 200 char overlap) ---
chunk_size = 1000
chunk_overlap = 200
chunks = []
start = 0
while start < len(full_text):
    end = start + chunk_size
    chunk = full_text[start:end]
    if chunk.strip():
        chunks.append(chunk.strip())
    start += chunk_size - chunk_overlap

del full_text
gc.collect()

if UNPAYWALL_JSON:
    chunks.append(UNPAYWALL_JSON)

print(f"🧩 Created {len(chunks)} text chunks from PDF.")

# --- Embed via Gemini REST API (bypasses SDK version quirks) ---
EMBED_DIM = 768
BATCH_SIZE = 100
EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key={GEMINI_API_KEY}"

def embed_batch(texts):
    """Batch embed texts using Gemini gemini-embedding-001 via direct REST API."""
    payload = {
        "requests": [
            {
                "model": "models/gemini-embedding-001",
                "content": {"parts": [{"text": t}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBED_DIM
            }
            for t in texts
        ]
    }
    resp = requests.post(EMBED_URL, json=payload, timeout=60)
    resp.raise_for_status()
    return [e["values"] for e in resp.json()["embeddings"]]

# --- Store in Qdrant ---
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)

if not qdrant.collection_exists(SESSION_ID):
    qdrant.create_collection(
        collection_name=SESSION_ID,
        vectors_config=models.VectorParams(size=EMBED_DIM, distance=models.Distance.COSINE)
    )
    print(f"🆕 Created new Qdrant collection '{SESSION_ID}'")

print("⚙️ Generating embeddings via Gemini gemini-embedding-001 (REST API)...")
points = []
for batch_start in range(0, len(chunks), BATCH_SIZE):
    batch = chunks[batch_start:batch_start + BATCH_SIZE]
    vectors = embed_batch(batch)
    for i, (chunk, vector) in enumerate(zip(batch, vectors)):
        points.append(models.PointStruct(
            id=batch_start + i,
            vector=vector,
            payload={"text": chunk}
        ))
    gc.collect()

qdrant.upload_points(
    collection_name=SESSION_ID,
    points=points,
    batch_size=32
)

print(f"✅ Successfully stored {len(chunks)} text chunks in Qdrant collection '{SESSION_ID}'.")

if os.path.exists(PDF_PATH):
    os.remove(PDF_PATH)
    print(f"🗑️ Deleted PDF file '{PDF_PATH}' after embedding.")

del chunks, points
gc.collect()