import os
os.environ["ORT_LOGGING_LEVEL"] = "3"
import gc
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

# Clear reader from memory
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

# --- Create Embeddings via FastEmbed (C++ ONNX engine) ---
print("⚙️ Generating embeddings via FastEmbed (BAAI/bge-small-en-v1.5)...")
embedding_model = TextEmbedding(
    model_name="BAAI/bge-small-en-v1.5",
    providers=["CPUExecutionProvider"],
    threads=1
)

# --- Store in Qdrant ---
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)

if not qdrant.collection_exists(SESSION_ID):
    qdrant.create_collection(
        collection_name=SESSION_ID,
        vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE)
    )
    print(f"🆕 Created new Qdrant collection '{SESSION_ID}'")

# Stream vectors & points in mini-batches to keep memory < 30MB
def generate_points():
    for i, (chunk, vector) in enumerate(zip(chunks, embedding_model.embed(chunks))):
        yield models.PointStruct(
            id=i,
            vector=vector.tolist(),
            payload={"text": chunk}
        )

qdrant.upload_points(
    collection_name=SESSION_ID,
    points=generate_points(),
    batch_size=16
)

print(f"✅ Successfully stored {len(chunks)} text chunks in Qdrant collection '{SESSION_ID}'.")

if os.path.exists(PDF_PATH):
    os.remove(PDF_PATH)
    print(f"🗑️ Deleted PDF file '{PDF_PATH}' after embedding.")

del embedding_model, chunks
gc.collect()