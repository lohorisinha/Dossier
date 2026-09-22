from .utils import make_query_cache_key

def is_url_indexed(redis_client, url: str) -> bool:
    return redis_client.exists(f"indexed:{url}") == 1

def mark_url_indexed(redis_client, url: str) -> None:
    redis_client.set(f"indexed:{url}", "1")

def get_cached_answer(redis_client, url: str, question: str) -> str | None:
    key = make_query_cache_key(url, question)
    return redis_client.get(key)

def cache_answer(redis_client, url: str, question: str, answer: str, ttl_seconds: int = 3600) -> None:
    key = make_query_cache_key(url, question)
    redis_client.set(key, answer, ex=ttl_seconds)