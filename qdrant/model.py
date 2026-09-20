import os
import gc
import json
import uuid
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

# --- Load PDF & Extract Text (Page by Page) ---
reader = PdfReader(PDF_PATH)
chunks = []
sample_text_for_dossier = ""
total_pages = len(reader.pages)
print(f"📖 Total pages detected: {total_pages}")

chunk_size = 1000
chunk_overlap = 200

for page_idx, page in enumerate(reader.pages, start=1):
    try:
        page_text = page.extract_text() or ""
    except Exception as e:
        print(f"⚠️ Warning reading page {page_idx}: {e}")
        page_text = ""

    if page_idx <= 4:
        sample_text_for_dossier += f"\n--- Page {page_idx} ---\n" + page_text[:3000]

    if not page_text.strip():
        continue

    start = 0
    while start < len(page_text):
        end = start + chunk_size
        chunk_str = page_text[start:end].strip()
        if chunk_str:
            chunks.append({
                "text": chunk_str,
                "page": page_idx
            })
        start += chunk_size - chunk_overlap

del reader
gc.collect()

if UNPAYWALL_JSON:
    chunks.append({"text": UNPAYWALL_JSON, "page": 1})

print(f"🧩 Created {len(chunks)} page-grounded text chunks from PDF.")

# --- Embed via Gemini REST API ---
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

# --- Store in Qdrant (Single Master Collection with Session Filtering) ---
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "ressist_sessions")
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)

if not qdrant.collection_exists(COLLECTION_NAME):
    qdrant.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=models.VectorParams(size=EMBED_DIM, distance=models.Distance.COSINE)
    )
    print(f"🆕 Created master Qdrant collection '{COLLECTION_NAME}'")
    try:
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="session_id",
            field_schema=models.PayloadSchemaType.KEYWORD
        )
        print(f"⚡ Created keyword payload index on 'session_id' in '{COLLECTION_NAME}'")
    except Exception as e:
        print(f"Payload index creation note: {e}")

print("⚙️ Generating embeddings via Gemini gemini-embedding-001 (REST API)...")
points = []
for batch_start in range(0, len(chunks), BATCH_SIZE):
    batch = chunks[batch_start:batch_start + BATCH_SIZE]
    batch_texts = [item["text"] for item in batch]
    vectors = embed_batch(batch_texts)
    for item, vector in zip(batch, vectors):
        points.append(models.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "session_id": SESSION_ID,
                "text": item["text"],
                "page": item["page"],
                "paper_id": SESSION_ID
            }
        ))
    gc.collect()

qdrant.upload_points(
    collection_name=COLLECTION_NAME,
    points=points,
    batch_size=32
)

print(f"✅ Successfully stored {len(chunks)} text chunks for session '{SESSION_ID}' in master collection '{COLLECTION_NAME}'.")


# --- Auto-Generate Executive Dossier & Suggested Questions ---
dossier_path = f"{os.path.splitext(PDF_PATH)[0]}_dossier.json"
try:
    print("🧠 Generating Executive Dossier via Gemini 2.5 Flash...")
    dossier_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    dossier_prompt = (
        "You are an elite scientific analyst. Analyze this research paper sample and generate an Executive Dossier.\n"
        "Return strictly valid raw JSON without markdown code fences or backticks.\n"
        "The JSON must have this exact structure:\n"
        "{\n"
        '  "core_thesis": "2-3 sentences summarizing the problem, breakthrough, and main conclusion.",\n'
        '  "key_findings": ["Finding 1 with specific metrics/findings", "Finding 2", "Finding 3", "Finding 4"],\n'
        '  "methodology": "Concise summary of dataset, model architecture, or experimental setup.",\n'
        '  "limitations": ["Acknowledged limitation 1", "Limitation 2"],\n'
        '  "suggested_questions": ["Smart question 1 about mechanisms", "Question 2 about benchmarks/results", "Question 3 about limitations", "Question 4 about implementation/reproducibility"]\n'
        "}\n\n"
        f"Paper Excerpt:\n{sample_text_for_dossier[:12000]}"
    )
    d_resp = requests.post(dossier_url, json={"contents": [{"parts": [{"text": dossier_prompt}]}]}, timeout=45)
    if d_resp.status_code == 200:
        raw_text = d_resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        dossier_data = json.loads(raw_text)
        with open(dossier_path, "w", encoding="utf-8") as df:
            json.dump(dossier_data, df, indent=2)
        print(f"📋 Executive Dossier saved to {dossier_path}")
except Exception as e:
    print(f"⚠️ Could not generate dossier: {e}")
    # Fallback default dossier
    fallback_dossier = {
        "core_thesis": "Research paper uploaded successfully and ready for analysis.",
        "key_findings": ["Embeddings indexed into Qdrant", "Page-level citations enabled"],
        "methodology": "Vector retrieval with Gemini 2.5 Flash context augmentation.",
        "limitations": ["Document-specific constraints apply."],
        "suggested_questions": [
            "What is the main objective of this paper?",
            "What methodology and datasets were used?",
            "What are the primary findings and results?",
            "What limitations do the authors mention?"
        ]
    }
    with open(dossier_path, "w", encoding="utf-8") as df:
        json.dump(fallback_dossier, df, indent=2)

print(f"📌 PDF preserved at {PDF_PATH} for side-by-side viewer.")

del chunks, points
gc.collect()