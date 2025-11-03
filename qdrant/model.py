import os
import time
import threading
import shutil
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Qdrant
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

# --- Environment Variables ---
SESSION_ID = os.getenv("SESSION_ID", "default")
PDF_PATH = os.getenv("PDF_PATH")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

if not PDF_PATH or not os.path.exists(PDF_PATH):
    print(f"❌ PDF file not found at {PDF_PATH}")
    exit(1)

print(f"📄 Loading PDF from: {PDF_PATH}")

# --- Load PDF and Split ---
loader = PyPDFLoader(PDF_PATH)
docs = loader.load()

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(docs)

print(f"🧩 Created {len(chunks)} text chunks from PDF.")

# --- Create Embeddings ---
print("⚙️ Using Hugging Face embeddings model...")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# --- Store in Qdrant ---
from qdrant_client import QdrantClient, models

qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False)

# Recreate the collection if it already exists
if SESSION_ID in [c.name for c in qdrant.get_collections().collections]:
    print(f"♻️ Recreating existing collection '{SESSION_ID}'...")
    qdrant.delete_collection(SESSION_ID)

qdrant.recreate_collection(
    collection_name=SESSION_ID,
    vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE)
)

print("⚙️ Generating embeddings and uploading to Qdrant...")
vectors = embeddings.embed_documents([chunk.page_content for chunk in chunks])

qdrant.upload_points(
    collection_name=SESSION_ID,
    points=[
        models.PointStruct(
            id=i,
            vector=vectors[i],
            payload={"text": chunks[i].page_content}
        )
        for i in range(len(chunks))
    ]
)

print(f"✅ Successfully stored {len(chunks)} text chunks in Qdrant collection '{SESSION_ID}'.")

session_dir = os.path.dirname(PDF_PATH)
shutil.rmtree(session_dir)
print(f"🗑️ Deleted session directory '{session_dir}' after successful embedding.")

# --- Auto Delete Session Collection after Time Limit ---

def auto_delete_collection():
    print(f"🕒 Collection '{SESSION_ID}' will be deleted after 3600 seconds...")
    time.sleep(3600)
    qdrant.delete_collection(SESSION_ID)
    print(f"🗑️ Collection '{SESSION_ID}' has been automatically deleted after timeout.")

threading.Thread(target=auto_delete_collection, daemon=True).start()