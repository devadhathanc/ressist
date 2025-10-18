import sys
import argparse
import pdfplumber
import redis
import time
import os

parser = argparse.ArgumentParser()
parser.add_argument("--session", required=True)
parser.add_argument("--file", required=True)
args = parser.parse_args()

session_id = args.session
pdf_path = args.file

print(f"🔍 Processing session {session_id}: {pdf_path}")

text = ""
with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        text += page.extract_text() or ""

summary = text[:1000] + "..." if len(text) > 1000 else text

r = redis.Redis(host="redis", port=6379)
r.set(f"summary:{session_id}", summary)

print(f"✅ Stored summary for {session_id} in Redis.")