import hashlib

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def url_to_collection_name(url: str) -> str:
    readable = "".join(c if c.isalnum() else "_" for c in url)[:40].strip("_")
    digest = hashlib.sha256(url.encode()).hexdigest()[:12]
    return f"{readable}_{digest}" if readable else digest

def make_query_cache_key(url: str, question: str) -> str:
    raw = f"{url}::{question}"
    return "query:" + hashlib.sha256(raw.encode()).hexdigest()