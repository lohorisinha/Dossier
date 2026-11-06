<p align="center">
  <img src="docs/banner.svg" alt="Dossier" width="100%">
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.12-AB92BF?style=flat-square&labelColor=1B1623&logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-API-AB92BF?style=flat-square&labelColor=1B1623&logo=fastapi&logoColor=white">
  <img alt="Celery" src="https://img.shields.io/badge/Celery-workers-AB92BF?style=flat-square&labelColor=1B1623&logo=celery&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-queue_and_cache-AB92BF?style=flat-square&labelColor=1B1623&logo=redis&logoColor=white">
  <img alt="ChromaDB" src="https://img.shields.io/badge/ChromaDB-vectors-AB92BF?style=flat-square&labelColor=1B1623">
  <img alt="React" src="https://img.shields.io/badge/React-Vite-AB92BF?style=flat-square&labelColor=1B1623&logo=react&logoColor=white">
</p>

<p align="center">
  <b>Paste company and internship links. Ask questions. Get answers grounded in the real pages.</b>
</p>

| 🔗 Index | 💬 Ask | 🧾 Stay grounded |
| --- | --- | --- |
| Paste several links at once and watch each one finish live | One conversation per link, with markdown answers and follow-ups | Answers use only the scraped text, or say they could not find it |

## 🧭 Architecture

```mermaid
flowchart LR
    UI[React frontend]
    API[FastAPI]
    Q[(Redis)]
    W[Celery worker]
    DB[(ChromaDB)]
    LLM[Groq]

    UI -->|POST /index| API
    API -->|queue job| Q
    Q --> W
    W -->|scrape, chunk, embed| DB
    UI -->|poll /status| API
    UI -->|POST /query| API
    API -->|top 5 chunks| DB
    API -->|prompt with chunks| LLM

    classDef ui fill:#AB92BF,stroke:#1B1623,stroke-width:3px,color:#1B1623
    classDef core fill:#655A7C,stroke:#1B1623,stroke-width:3px,color:#FDF1E2
    classDef store fill:#FDF1E2,stroke:#1B1623,stroke-width:3px,color:#1B1623
    class UI,LLM ui
    class API,W core
    class Q,DB store
```

## ⏱️ What happens when you hit Analyse

```mermaid
sequenceDiagram
    participant U as Browser
    participant A as FastAPI
    participant R as Redis
    participant W as Celery worker

    U->>A: POST /index with a URL
    A->>R: already indexed?
    alt cached
        A-->>U: cached = true, no polling needed
    else new URL
        A->>R: queue job
        A-->>U: job_id
        R->>W: deliver job
        loop every 2 seconds
            U->>A: GET /status/job_id
            A-->>U: PENDING
        end
        W->>R: store SUCCESS
        U->>A: GET /status/job_id
        A-->>U: SUCCESS
    end
```

## ⚙️ Under the hood

- Pages are fetched with httpx and cleaned with BeautifulSoup, then split into 500 character chunks with a 50 character overlap
- Chunks are embedded with `all-MiniLM-L6-v2` and stored in one ChromaDB collection per URL
- Collection names combine a readable prefix with a hash of the full URL, so long URLs never collide
- A question is embedded the same way, the 5 closest chunks are retrieved, and Groq (`openai/gpt-oss-20b`) answers using only those chunks
- Redis remembers which URLs are indexed and caches answers for 1 hour

## 🎨 Design

The frontend is neo-brutalist: thick ink borders, hard offset shadows, flat color blocks, and monospace labels.

![Linen](https://img.shields.io/badge/Linen_FDF1E2-FDF1E2?style=for-the-badge)
![Dolphin](https://img.shields.io/badge/Dolphin_655A7C-655A7C?style=for-the-badge)
![Amethyst](https://img.shields.io/badge/Amethyst_AB92BF-AB92BF?style=for-the-badge)
![Ink](https://img.shields.io/badge/Ink_1B1623-1B1623?style=for-the-badge)

## 🚀 Run locally

Requires Python 3.12, Node 20.19 or newer, an Upstash Redis database, and a Groq API key.

```bash
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```
GROQ_API_KEY=your_key
REDIS_URL=rediss://default:your_password@your_host.upstash.io:6379
```

Start the backend in two terminals from the repo root:

```bash
uvicorn backend.app.main:app --reload
celery -A backend.app.celery_app worker --loglevel=info --pool=solo
```

Start the frontend in a third:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## 🔌 API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/scrape` | Fetch a URL and return clean text |
| POST | `/index` | Queue an indexing job, returns `job_id` |
| GET | `/status/{job_id}` | PENDING, SUCCESS, or FAILURE |
| POST | `/query` | Answer a question about an indexed URL |

## 📝 Notes

- Pages are fetched without running JavaScript, so sites that render their content in the browser may return little text
- Free Upstash databases are deleted after 14 days of inactivity