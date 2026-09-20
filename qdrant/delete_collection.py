import sys
import os
import json
from qdrant_client import QdrantClient, models
from dotenv import load_dotenv

load_dotenv()

active_sessions = json.loads(os.getenv("ACTIVE_SESSIONS") or "[]")
print(f"Active session IDs: {active_sessions}")

COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "ressist_sessions")

client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY")
)

try:
    # 1. Clean up points in the master collection
    if client.collection_exists(COLLECTION_NAME):
        if active_sessions:
            # Delete points whose session_id is NOT in active_sessions
            client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must_not=[
                            models.FieldCondition(
                                key="session_id",
                                match=models.MatchAny(any=active_sessions)
                            )
                        ]
                    )
                )
            )
            print(f"🧹 Purged points of expired sessions from master collection '{COLLECTION_NAME}'.")
        else:
            # No active sessions at all, clear all points
            client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=models.FilterSelector(
                    filter=models.Filter()
                )
            )
            print(f"🧹 Master collection '{COLLECTION_NAME}' cleared (0 active sessions).")

    # 2. Backwards compatibility: delete any legacy per-session collections if they exist
    collections = client.get_collections().collections
    for collection in collections:
        if collection.name == COLLECTION_NAME:
            continue
        if collection.name not in active_sessions:
            client.delete_collection(collection.name)
            print(f"🗑️ Deleted legacy per-session collection: {collection.name}")
        else:
            print(f"Retained legacy collection: {collection.name}")
except Exception as e:
    print("Error processing cleanup:", e)