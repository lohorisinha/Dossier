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

## Overview

Dossier is a retrieval-augmented research agent for internship hunting. It indexes the pages you give it, then answers questions using only that content, and says so when the answer is not there.

| Index | Ask | Grounded |
| --- | --- | --- |
| Paste several links at once and watch each one finish live | One conversation per link, with markdown answers and follow-ups | Answers use only the scraped text, or state that they could not find it |

## Architecture

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

## Indexing flow

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

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/scrape` | Fetch a URL and return clean text |
| POST | `/index` | Queue an indexing job, returns `job_id` |
| GET | `/status/{job_id}` | PENDING, SUCCESS, or FAILURE |
| POST | `/query` | Answer a question about an indexed URL |

## License

Copyright © 2026 [Lohori Sinha](https://github.com/lohorisinha). This project is [MIT](https://github.com/lohorisinha/Dossier/blob/main/LICENSE) licensed.