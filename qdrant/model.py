import os
import time
import threading
import shutil
import json
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
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
UNPAYWALL_JSON = os.getenv("UNPAYWALL_JSON")

if not PDF_PATH or not os.path.exists(PDF_PATH):
    print(f"❌ PDF file not found at {PDF_PATH}")
    exit(1)

print(f"📄 Loading PDF from: {PDF_PATH}")

# --- Load PDF and Split ---
loader = PyPDFLoader(PDF_PATH)
docs = loader.load()

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(docs)
chunks.append(
    # Add Unpaywall JSON as a separate chunk if provided
    type('Doc', (object,), {'page_content': UNPAYWALL_JSON})()
) if UNPAYWALL_JSON else None


print(f"🧩 Created {len(chunks)} text chunks from PDF.")

# --- Create Embeddings ---
print("⚙️ Using Hugging Face embeddings model...")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# --- Store in Qdrant ---
from qdrant_client import QdrantClient, models

# qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False)
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)

if not qdrant.collection_exists(SESSION_ID):
    qdrant.create_collection(
        collection_name=SESSION_ID,
        vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE)
    )
    print(f"🆕 Created new Qdrant collection '{SESSION_ID}'")

print("⚙️ Generating embeddings and uploading to Qdrant...")
vectors = embeddings.embed_documents([chunk.page_content for chunk in chunks])


# if UNPAYWALL_JSON:
#     myPoints.append(
#         models.PointStruct(
#             id=len(chunks),  # unique ID
#             vector=[0.0]*384,  # dummy vector (or some special vector)
#             payload={"text": json.loads(UNPAYWALL_JSON)}
#         )
#     )

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

os.remove(PDF_PATH)
print(f"🗑️ Deleted PDF file '{PDF_PATH}' after embedding.")


# --- Auto Delete Session Collection after Time Limit ---

# def auto_delete_collection():
#     print(f"🕒 Collection '{SESSION_ID}' will be deleted after 3600 seconds...")
#     time.sleep(3600)
#     qdrant.delete_collection(SESSION_ID)
#     print(f"🗑️ Collection '{SESSION_ID}' has been automatically deleted after timeout.")

# threading.Thread(target=auto_delete_collection, daemon=True).start()