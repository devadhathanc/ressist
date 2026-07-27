# Ressist

🚀 **Live Application:** [https://ressist.vercel.app/](https://ressist.vercel.app/)

An AI-powered research assistant that lets you upload or fetch open-access research papers (via DOI) and chat with them using Gemini. Papers are embedded into a vector database (Qdrant) for semantic search, enabling context-aware Q&A.

## Architecture

```
┌──────────────┐     HTTP      ┌──────────────┐   exec / docker   ┌────────────────┐
│              │  ──────────►  │              │  ────────────►    │                │
│   Client     │               │   Server     │                   │  qdrant-worker │
│  (React 19)  │  ◄──────────  │   (Go)       │  ◄────────────    │   (Python)     │
│  :5173       │     JSON      │   :8080      │     JSON          │                │
└──────────────┘               └──────┬───────┘                   └───────┬────────┘
                                      │                                   │
                                      │ Redis (sessions)                  │ Qdrant (vectors)
                                      ▼                                   │ Gemini (LLM)
                               ┌──────────────┐                           ▼
                               │   Upstash    │                     ┌──────────────┐
                               │   Redis      │                     │  Qdrant DB   │
                               │  (cloud)     │                     │   :6333      │
                               └──────────────┘                     └──────────────┘
```

## Application Flow

### 1. Create a Session (DOI or PDF Upload)

```
User enters DOI
    → Go server fetches metadata from Unpaywall API
    → Downloads the open-access PDF
    → Validates the file is a real PDF (checks %PDF magic bytes)
    → Saves PDF to shared session storage
    → Calls Python worker script (model.py)
        → Extracts text from PDF with PyPDF
        → Splits into ~1000-char text chunks (with 200-char overlap)
        → Generates 384-dim dense vector embeddings using FastEmbed (BAAI/bge-small-en-v1.5)
        → Stores vectors in a Qdrant collection named by session ID
        → Deletes the temporary PDF file after embedding
    → Stores session metadata (title, journal, DOI) in Redis with 1-hour TTL
    → Returns session ID to the client
```

### 2. Chat with the Paper

```
User sends a question
    → Go server calls Python worker script (chat_api.py)
        → chat_api.py encodes the question into a 384-dim vector using FastEmbed
        → Queries Qdrant for the top 3 most similar text chunks
        → Builds prompt: retrieved context + user question
        → Sends prompt to Gemini 2.5 Flash
        → Returns the answer as JSON
    → Go server stores the Q&A in Redis (chat history)
    → Returns the answer to the client
```

### 3. Session Lifecycle

```
Sessions expire after 1 hour (Redis TTL)
    → A background goroutine runs every 5 minutes
    → Compares active Redis sessions with Qdrant collections
    → Deletes orphaned Qdrant collections to free resources
```

## Tools & Technologies

### Backend (Go Server)
| Tool | Purpose |
|---|---|
| **Go net/http** | High-performance HTTP server & API router |
| **redis (go-redis)** | Redis client for session state & chat history tracking |
| **Unpaywall API** | Fetches open-access PDF URLs from DOIs |
| **os/exec** | Executes Python ML scripts via `docker exec` (local) or direct `python3` (Render) |

### ML / AI (Python Worker)
| Tool | Purpose |
|---|---|
| **FastEmbed** | High-performance, lightweight ONNX C++ engine for 384-dim vector embeddings (`BAAI/bge-small-en-v1.5`) |
| **PyPDF** | PDF text extraction |
| **qdrant-client** | Python SDK for storing and querying vector collections in Qdrant |
| **Google Generative AI** | Calls Gemini 2.5 Flash for context-augmented Q&A synthesis |

### Infrastructure
| Tool | Purpose |
|---|---|
| **Docker Compose** | Orchestrates 4 microservice containers (client, server, worker, vector DB) |
| **Qdrant** | Vector database — stores document embeddings & handles cosine similarity search |
| **Redis (Upstash)** | Cloud session store with TTL — tracks active sessions and chat history |
| **Gemini 2.5 Flash** | Large language model for answering questions with retrieved context |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A [Gemini API key](https://aistudio.google.com/apikey)
- An [Upstash Redis](https://console.upstash.com) database (free tier works)

## How to Run

### 1. Clone the repository

```bash
git clone <repo-url>
cd ressist
```

### 2. Create the `.env` file in the project root

```env
REDIS_URL=rediss://default:<password>@<your-endpoint>.upstash.io:6379
GEMINI_API_KEY=<your-gemini-api-key>
```

> **Note:** The `REDIS_URL` must use `rediss://` (double-s) for Upstash TLS.

### 3. Start the application

```bash
docker compose up --build
```

The container build takes seconds due to lightweight FastEmbed dependencies (~50MB RAM footprint).

### 4. Open the app

Go to [http://localhost:5173](http://localhost:5173)

### 5. Stop the application

```bash
docker compose down
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/create-session` | Create a session (multipart: `doi` or `pdf` file) |
| `POST` | `/api/join-session` | Join an existing session by ID |
| `POST` | `/api/chat` | Send a question (`session_id`, `question`) |
| `GET` | `/api/chat-history?session_id=` | Get chat history for a session |
| `GET` | `/api/active-sessions` | List all active sessions with TTLs |

## Project Structure

```
ressist/
├── client/                    # React 19 frontend
│   ├── src/
│   │   ├── home.jsx           # Session creation / joining UI
│   │   ├── chat.jsx           # Chat interface
│   │   ├── config.js          # Dynamic API endpoint configuration
│   │   ├── header.jsx         # Navigation header
│   │   ├── footer.jsx         # Page footer
│   │   └── about.jsx          # About page
│   ├── Dockerfile
│   └── package.json
├── server/                    # Go backend
│   ├── main.go                # HTTP handlers, PDF fetching, session lifecycle
│   ├── Dockerfile             # Multi-stage build (golang → alpine)
│   ├── go.mod / go.sum
│   └── sessions/              # Temporary PDF storage
├── qdrant/                    # Python ML worker
│   ├── model.py               # PDF → text chunks → FastEmbed vectors → Qdrant
│   ├── chat_api.py            # Question → FastEmbed vector search → Gemini → answer
│   ├── delete_collection.py   # Cleanup expired session collections
│   ├── requirements.txt       # Lightweight Python dependencies (FastEmbed, PyPDF)
│   └── Dockerfile             # python:3.11-slim
├── Dockerfile.render          # Combined production image for Render PaaS
├── compose.yaml               # Docker Compose (4 services + volumes + network)
├── .env                       # Environment variables (not committed)
└── README.md
```

## Production Deployment

- **Live Application:** [https://ressist.vercel.app/](https://ressist.vercel.app/)
- **Frontend:** Deployed on **Vercel**
- **Backend API:** Deployed on **Render** (`https://ressist.onrender.com` using `Dockerfile.render`)
- **Vector Storage:** Qdrant Cloud (Free Tier)
- **Session Cache:** Upstash Redis

## Tech Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 4
- **Backend:** Go 1.24 (net/http, go-redis)
- **ML/AI:** FastEmbed (`BAAI/bge-small-en-v1.5`), PyPDF, Google Gemini 2.5 Flash
- **Vector DB:** Qdrant
- **Sessions:** Redis (Upstash)
- **Containerization:** Docker Compose / Render
