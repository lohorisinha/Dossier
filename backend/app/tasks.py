import httpx
from bs4 import BeautifulSoup

from .celery_app import celery_app
from .config import chroma_client, embedder, redis_client
from .utils import chunk_text, url_to_collection_name
from .cache import mark_url_indexed

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
}


@celery_app.task
def index_url_task(url: str) -> dict:
    collection_name = url_to_collection_name(url)

    with httpx.Client(timeout=10, headers=BROWSER_HEADERS) as client:
        response = client.get(url)
        response.raise_for_status()

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

    mark_url_indexed(redis_client, url)

    return {
        "url": url,
        "chunks_indexed": len(chunks),
        "collection": collection_name,
    }