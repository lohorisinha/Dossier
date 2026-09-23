from celery import Celery
from dotenv import load_dotenv
import os
import ssl

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")

celery_app = Celery(
    "dossier",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    redis_backend_use_ssl={
        "ssl_cert_reqs": ssl.CERT_REQUIRED,
    },
    imports=("backend.app.tasks",),
)