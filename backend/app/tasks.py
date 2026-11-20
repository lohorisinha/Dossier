import httpx
from bs4 import BeautifulSoup

from .celery_app import celery_app
from .config import chroma_client, embedder, redis_client
from .utils import chunk_text, url_to_collection_name
from .cache import mark_url_indexed, clear_url_cache
from .render import render_pages

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
}

MIN_TEXT_CHARS = 800


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)


def merge_texts(texts: list[str]) -> str:
    seen_lines = set()
    merged = []
    for text in texts:
        for line in text.split("\n"):
            key = line.strip()
            if not key or key in seen_lines:
                continue
            seen_lines.add(key)
            merged.append(key)
    return "\n".join(merged)


@celery_app.task
def index_url_task(url: str) -> dict:
    collection_name = url_to_collection_name(url)

    text = ""
    try:
        with httpx.Client(timeout=10, headers=BROWSER_HEADERS, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
        text = html_to_text(response.text)
    except httpx.HTTPError:
        text = ""

    rendered = False
    if len(text) < MIN_TEXT_CHARS:
        pages = render_pages(url)
        text = merge_texts([html_to_text(html) for html in pages])
        rendered = True

    if not text.strip():
        raise ValueError("no readable text found on this page")

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
    clear_url_cache(redis_client, url)

    return {
        "url": url,
        "chunks_indexed": len(chunks),
        "collection": collection_name,
        "rendered": rendered,
    }