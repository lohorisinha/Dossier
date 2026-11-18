import json

from .utils import make_query_cache_key, query_cache_prefix

def is_url_indexed(redis_client, url: str) -> bool:
    return redis_client.exists(f"indexed:{url}") == 1

def mark_url_indexed(redis_client, url: str) -> None:
    redis_client.set(f"indexed:{url}", "1")

def unmark_url_indexed(redis_client, url: str) -> None:
    redis_client.delete(f"indexed:{url}")

def clear_url_cache(redis_client, url: str) -> int:
    keys = list(redis_client.scan_iter(match=f"{query_cache_prefix(url)}*", count=100))
    if keys:
        redis_client.delete(*keys)
    return len(keys)

def get_cached_answer(redis_client, url: str, question: str) -> dict | None:
    key = make_query_cache_key(url, question)
    raw = redis_client.get(key)
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    return data

def cache_answer(
    redis_client,
    url: str,
    question: str,
    answer: str,
    chunks: list[str],
    ttl_seconds: int = 3600,
) -> None:
    key = make_query_cache_key(url, question)
    payload = json.dumps({"answer": answer, "chunks": chunks})
    redis_client.set(key, payload, ex=ttl_seconds)