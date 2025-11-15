import sys
import os
import json
from qdrant_client import QdrantClient
from dotenv import load_dotenv
load_dotenv()

active_sessions = json.loads(sys.argv[1])
print(f"Active session IDs: {active_sessions}")

client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY")
)

try:
    collections = client.get_collections().collections
    print(f"Found {len(collections)} collections in Qdrant.")
    for collection in collections:
        if collection.name not in active_sessions:
            client.delete_collection(collection.name)
            print(f"Deleted Qdrant collection: {collection.name}")
        else:
            print(f"Retained collection: {collection.name}")
except Exception as e:
    print("Error processing collections:", e)