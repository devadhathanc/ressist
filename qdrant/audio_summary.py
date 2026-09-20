import os
import gc
import json
import requests
from dotenv import load_dotenv
from qdrant_client import QdrantClient, models

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SESSION_ID = os.getenv("SESSION_ID", "default")
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "ressist_sessions")

CHAT_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

def generate_podcast_script():
    # 1. Try to read from local dossier if available
    dossier_content = ""
    candidate_paths = [
        f"/app/sessions/{SESSION_ID}_dossier.json",
        f"sessions/{SESSION_ID}_dossier.json",
        f"/app/sessions/{SESSION_ID}.pdf_dossier.json",
        f"sessions/{SESSION_ID}.pdf_dossier.json"
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    dossier_content = f.read()
                    break
            except Exception:
                pass

    # 2. If no dossier, retrieve sample text from Qdrant
    sample_text = dossier_content
    if not sample_text:
        try:
            qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False)
            target_collection = COLLECTION_NAME if qdrant.collection_exists(COLLECTION_NAME) else SESSION_ID
            scroll_filter = None
            if target_collection == COLLECTION_NAME:
                scroll_filter = models.Filter(
                    must=[
                        models.FieldCondition(
                            key="session_id",
                            match=models.MatchValue(value=SESSION_ID)
                        )
                    ]
                )

            records, _ = qdrant.scroll(
                collection_name=target_collection,
                scroll_filter=scroll_filter,
                limit=6,
                with_payload=True
            )
            sample_text = "\n\n".join([r.payload.get("text", "") for r in records if r.payload])
        except Exception as e:
            sample_text = "Scientific paper discussing novel findings and computational methodology."


    prompt = (
        "You are an executive podcast producer like Google's NotebookLM Audio Overviews. "
        "Create an engaging, dynamic 2-person audio overview (podcast style) summarizing this research paper.\n"
        "The hosts are:\n"
        "- Host 1 (Alex): An enthusiastic, curious tech journalist who asks great questions and uses relatable analogies.\n"
        "- Host 2 (Dr. Taylor): A knowledgeable, insightful research scientist who explains how things actually work and why it matters.\n\n"
        "Keep the conversation crisp, engaging, and around 5 to 7 dialogue turns total.\n"
        "Return STRICTLY valid JSON without markdown fences:\n"
        "{\n"
        '  "title": "Engaging Episode Title",\n'
        '  "tagline": "One sentence summary hook",\n'
        '  "dialogue": [\n'
        '    {"speaker": "Alex", "voice": "host1", "text": "Welcome in! Today we are looking at this wild new paper..."},\n'
        '    {"speaker": "Dr. Taylor", "voice": "host2", "text": "Right, Alex. What really caught my attention here is..."}\n'
        '  ]\n'
        "}\n\n"
        f"Paper context:\n{sample_text[:10000]}"
    )

    try:
        resp = requests.post(CHAT_URL, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=45)
        resp.raise_for_status()
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        data = json.loads(raw)
        print(json.dumps(data))
    except Exception as e:
        fallback = {
            "title": "Deep Dive: Research Overview",
            "tagline": "A rapid summary of the key findings and breakthroughs.",
            "dialogue": [
                {"speaker": "Alex", "voice": "host1", "text": "Welcome to the research breakdown! We're diving into this newly uploaded paper."},
                {"speaker": "Dr. Taylor", "voice": "host2", "text": "Thanks Alex. The core breakthrough centers on combining rigorous methodology with solid experimental evaluation."},
                {"speaker": "Alex", "voice": "host1", "text": "And the implications for the field seem huge, especially when you look at the benchmark claims."},
                {"speaker": "Dr. Taylor", "voice": "host2", "text": "Exactly. You can ask specific questions in the chat right now to explore equations, figures, and methodology in depth!"}
            ]
        }
        print(json.dumps(fallback))

if __name__ == "__main__":
    generate_podcast_script()
    gc.collect()
