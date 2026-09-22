from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup

from .config import chroma_client, embedder, groq_client, redis_client
from .utils import chunk_text, url_to_collection_name
from .cache import is_url_indexed, mark_url_indexed, get_cached_answer, cache_answer

app = FastAPI(title="dossier api", version="0.1.0")

class ScrapeRequest(BaseModel):
    url: str

class QueryRequest(BaseModel):
    url: str
    question: str

@app.get("/")
def root():
    return {"message": "dossier is alive"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/scrape")
async def scrape(request: ScrapeRequest):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(request.url)
            response.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"failed to fetch url: {str(e)}")

    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)

    return {
        "url": request.url,
        "char_count": len(text),
        "content": text[:3000]
    }

@app.post("/index")
async def index(request: ScrapeRequest):
    collection_name = url_to_collection_name(request.url)

    if is_url_indexed(redis_client, request.url):
        return {
            "url": request.url,
            "collection": collection_name,
            "cached": True,
            "message": "url already indexed, skipped scrape and embedding"
        }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(request.url)
            response.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"failed to fetch url: {str(e)}")

    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)

    chunks = chunk_text(text)

    try:
        chroma_client.delete_collection(name=collection_name)
    except Exception:
        pass

    collection = chroma_client.create_collection(name=collection_name)
    embeddings = embedder.encode(chunks).tolist()
    collection.add(
        documents=chunks,
        embeddings=embeddings,
        ids=[f"chunk_{i}" for i in range(len(chunks))]
    )

    mark_url_indexed(redis_client, request.url)

    return {
        "url": request.url,
        "chunks_indexed": len(chunks),
        "collection": collection_name,
        "cached": False
    }

@app.post("/query")
def query(request: QueryRequest):
    cached_answer = get_cached_answer(redis_client, request.url, request.question)
    if cached_answer is not None:
        return {
            "question": request.question,
            "answer": cached_answer,
            "cached": True
        }

    collection_name = url_to_collection_name(request.url)
    try:
        collection = chroma_client.get_collection(name=collection_name)
    except Exception:
        raise HTTPException(status_code=404, detail="url not indexed yet. call /index first.")

    question_embedding = embedder.encode([request.question]).tolist()
    results = collection.query(query_embeddings=question_embedding, n_results=3)
    retrieved_chunks = "\n\n".join(results['documents'][0])

    prompt = f"""You are a research assistant. Answer the user's question using only the content below. If the answer is not in the content, say "I could not find that in the provided page."
    --- PAGE CONTENT ---
    {retrieved_chunks}
    --- END OF PAGE CONTENT ---
    Question: {request.question}"""

    chat = groq_client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": prompt}]
    )
    answer = chat.choices[0].message.content

    cache_answer(redis_client, request.url, request.question, answer)

    return {
        "question": request.question,
        "answer": answer,
        "chunks_used": results["documents"][0],
        "cached": False
    }