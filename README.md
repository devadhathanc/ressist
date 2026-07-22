# Ressist

An AI-powered research assistant that lets you upload or fetch open-access research papers (via DOI) and chat with them using Gemini. Papers are embedded into a vector database (Qdrant) for semantic search, enabling context-aware Q&A.

## Architecture

```
┌──────────────┐     HTTP      ┌──────────────┐   docker exec   ┌────────────────┐
│              │  ──────────►  │              │  ────────────►  │                │
│   Client     │               │   Server     │                 │  qdrant-worker │
│  (React)     │  ◄──────────  │   (Go)       │  ◄────────────  │   (Python)     │
│  :5173       │     JSON      │   :8080      │     JSON        │                │
└──────────────┘               └──────┬───────┘                 └───────┬────────┘
                                      │                                 │
                                      │ Redis (sessions)                │ Qdrant (vectors)
                                      ▼                                 │ Gemini (LLM)
                               ┌──────────────┐                         ▼
                               │   Upstash    │                   ┌──────────────┐
                               │   Redis      │                   │  Qdrant DB   │
                               │  (cloud)     │                   │   :6333      │
                               └──────────────┘                   └──────────────┘
```

## Application Flow

### 1. Create a Session (DOI or PDF Upload)

```
User enters DOI
    → Go server fetches metadata from Unpaywall API
    → Downloads the open-access PDF
    → Validates the file is a real PDF (checks %PDF magic bytes)
    → Saves PDF to shared Docker volume
    → Calls `docker exec qdrant-worker python model.py`
        → model.py loads the PDF with PyPDFLoader
        → Splits into ~1000-char text chunks (with 200-char overlap)
        → Generates vector embeddings using all-MiniLM-L6-v2
        → Stores vectors in a Qdrant collection named by session ID
        → Deletes the PDF file after embedding
    → Stores session metadata (title, journal, DOI) in Redis with 1-hour TTL
    → Returns session ID to the client
```

### 2. Chat with the Paper

```
User sends a question
    → Go server calls `docker exec qdrant-worker python chat_api.py`
        → chat_api.py encodes the question into a vector
        → Queries Qdrant for the 3 most similar text chunks
        → Builds a prompt: retrieved context + user question
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
| **Go net/http** | HTTP server — no external framework needed |
| **redis** | Redis client for session storage and chat history |
| **Unpaywall API** | Fetches open-access PDF URLs from DOIs |
| **os/exec** | Runs Python scripts inside the qdrant-worker container via `docker exec` |

### ML / AI (Python Worker)
| Tool | Purpose |
|---|---|
| **LangChain** | Document loading (PyPDFLoader) and text splitting |
| **Sentence Transformers** | Generates vector embeddings using `all-MiniLM-L6-v2` (384-dim) |
| **PyTorch (CPU)** | ML inference backend for the embedding model |
| **qdrant-client** | Python SDK for storing and querying vectors in Qdrant |
| **Google Generative AI** | Calls Gemini 2.5 Flash for generating answers |
| **pypdf** | PDF parsing and text extraction |

### Infrastructure
| Tool | Purpose |
|---|---|
| **Docker Compose** | Orchestrates all 4 containers with networking and shared volumes |
| **Qdrant** | Vector database — stores document embeddings, supports similarity search |
| **Redis (Upstash)** | Session store with TTL — tracks active sessions and chat history |
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

> **Note:** The `REDIS_URL` must use `rediss://` (double-s) for Upstash TLS. Copy the full connection string from the Upstash dashboard.

### 3. Start the application

```bash
docker compose up --build
```

The first build takes a few minutes (downloads Python ML dependencies including PyTorch). Subsequent builds use Docker layer caching and take seconds.

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
├── client/                    # React frontend
│   ├── src/
│   │   ├── home.jsx           # Session creation / joining UI
│   │   ├── chat.jsx           # Chat interface
│   │   ├── header.jsx         # Navigation header
│   │   ├── footer.jsx         # Page footer
│   │   ├── about.jsx          # About page
│   │   └── example.jsx        # Example DOIs
│   ├── Dockerfile
│   └── package.json
├── server/                    # Go backend
│   ├── main.go                # All HTTP handlers, PDF fetching, session management
│   ├── Dockerfile             # Multi-stage build (golang → alpine)
│   ├── go.mod / go.sum
│   └── sessions/              # (runtime) temporary PDF storage
├── qdrant/                    # Python ML worker
│   ├── model.py               # PDF → text chunks → embeddings → Qdrant
│   ├── chat_api.py            # Question → vector search → Gemini → answer
│   ├── delete_collection.py   # Cleanup expired session collections
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile             # python:3.11-slim + CPU-only PyTorch
├── compose.yaml               # Docker Compose (4 services + volumes + network)
├── .env                       # Environment variables (not committed)
└── README.md
```

## Running Without Docker (Local Development)

For faster iteration, you can run services locally without Docker:

### Prerequisites
- Node.js 20+
- Go 1.24+
- Python 3.11+

### Setup

```bash
# 1. Set up Python virtual environment (one-time)
cd qdrant
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Switch main.go to local mode:
#    - Uncomment lines marked "//local version"
#    - Comment out the "docker exec" blocks

# 3. Run the Go server (Terminal 1)
cd server
go run main.go

# 4. Run the React client (Terminal 2)
cd client
npm install
npm run dev
```

> **Note:** In local mode, the Go server calls Python scripts directly using the venv interpreter instead of `docker exec`. You still need a local or remote Qdrant instance running.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | Yes | Upstash Redis connection string (`rediss://...`) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for chat responses |
| `QDRANT_URL` | Auto | Set automatically in Docker (`http://qdrant:6333`) |
| `QDRANT_API_KEY` | No | Qdrant Cloud API key (empty for local instance) |

## Tech Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 4
- **Backend:** Go 1.24 (net/http, go-redis)
- **ML/AI:** LangChain, Sentence Transformers, PyTorch (CPU), Google Gemini 2.5 Flash
- **Vector DB:** Qdrant
- **Sessions:** Redis (Upstash)
- **Containerization:** Docker Compose
