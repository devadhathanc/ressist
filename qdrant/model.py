import os
import json
from dotenv import load_dotenv
from pypdf import PdfReader
from fastembed import TextEmbedding
from qdrant_client import QdrantClient, models

load_dotenv()

# --- Environment Variables ---
SESSION_ID = os.getenv("SESSION_ID", "default")
PDF_PATH = os.getenv("PDF_PATH")
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
UNPAYWALL_JSON = os.getenv("UNPAYWALL_JSON")

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

if UNPAYWALL_JSON:
    chunks.append(UNPAYWALL_JSON)

print(f"🧩 Created {len(chunks)} text chunks from PDF.")

# --- Create Embeddings via FastEmbed (C++ ONNX engine) ---
print("⚙️ Generating embeddings via FastEmbed (BAAI/bge-small-en-v1.5)...")
embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
vectors = [v.tolist() for v in embedding_model.embed(chunks)]

# --- Store in Qdrant ---
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)

if not qdrant.collection_exists(SESSION_ID):
    qdrant.create_collection(
        collection_name=SESSION_ID,
        vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE)
    )
    print(f"🆕 Created new Qdrant collection '{SESSION_ID}'")

qdrant.upload_points(
    collection_name=SESSION_ID,
    points=[
        models.PointStruct(
            id=i,
            vector=vectors[i],
            payload={"text": chunks[i]}
        )
        for i in range(len(chunks))
    ]
)

print(f"✅ Successfully stored {len(chunks)} text chunks in Qdrant collection '{SESSION_ID}'.")

if os.path.exists(PDF_PATH):
    os.remove(PDF_PATH)
    print(f"🗑️ Deleted PDF file '{PDF_PATH}' after embedding.")