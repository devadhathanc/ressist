import sys
import os
from qdrant_client import QdrantClient
from dotenv import load_dotenv
load_dotenv()
# if len(sys.argv) < 2:
#     print("No collection ID provided")
#     exit()

collection = sys.argv[1]
print(f"Deleting Qdrant collection: {collection}")

client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY")
)

try:
    if client.collection_exists(collection):
        client.delete_collection(collection)
        print(f"Deleted Qdrant collection: {collection}")
    else:
        print(f"Collection not found: {collection}")
except Exception as e:
    print("Error deleting collection:", e)