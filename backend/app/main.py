from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup
import chromadb
from sentence_transformers import SentenceTransformer
from groq import Groq
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="dossier api", version="0.1.0")

chroma_client = chromadb.PersistentClient(path="./chroma_db")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class ScrapeRequest(BaseModel):
    url: str
    
class QueryRequest(BaseModel):
    url: str
    question: str
    
def chunk_text(text: str, chunk_size: int=500, overlap:int=50) -> list[str]:
    chunks=[]
    start=0
    while start<len(text):
        end=start+chunk_size
        chunks.append(text[start:end])
        start+=chunk_size-overlap
    return chunks
    
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
    
    collection_name = "".join(c if c.isalnum() else "_" for c in request.url)[:60]
    try:
        chroma_client.delete_collection(name=collection_name)
    except Exception:
        pass
    
    collection = chroma_client.create_collection(name=collection_name)
    embeddigs = embedder.encode(chunks).tolist()
    collection.add(
        documents=chunks,
        embeddings=embeddigs,
        ids=[f"chunk_{i}" for i in range(len(chunks))]
    )
    return {
        "url": request.url,
        "chunks_indexed": len(chunks),
        "collection": collection_name
    }
    
@app.post("/query")
def query(request: QueryRequest):
    collection_name = "".join(c if c.isalnum() else "_" for c in request.url)[:60]
    try:
        collection=chroma_client.get_collection(name=collection_name)
    except Exception:
        raise HTTPException(status_code=404, detail="url not indexed yet. call /index first.")
    
    question_embedding=embedder.encode([request.question]).tolist()
    results=collection.query(query_embeddings=question_embedding, n_results=3)
    retrieved_chunks="\n\n".join(results['documents'][0])
    
    prompt=f"""You are a research assistant. Answer the user's question using only the content below. If the answer is not in the content, say "I could not find that in the provided page."
    --- PAGE CONTENT ---
    {retrieved_chunks}
    --- END OF PAGE CONTENT ---
    Question: {request.question}"""
    chat=groq_client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": prompt}]
    )
    return {
        "question": request.question,
        "answer": chat.choices[0].message.content,
        "chunks_used": results["documents"][0]
    }