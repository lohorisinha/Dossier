const BASE_URL = "http://127.0.0.1:8000";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150;

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch {
      detail = `Request failed with status ${response.status}`;
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function indexUrl(url) {
  const data = await request("/index", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return { cached: data.cached, jobId: data.job_id ?? null };
}

export async function waitForJob(jobId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const data = await request(`/status/${jobId}`);

    if (data.status === "SUCCESS") return data;
    if (data.status === "FAILURE") {
      throw new Error(data.error || "Indexing failed");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Indexing timed out. Is the Celery worker running?");
}

export async function askQuestion(url, question) {
  const data = await request("/query", {
    method: "POST",
    body: JSON.stringify({ url, question }),
  });
  return { answer: data.answer, chunks: data.chunks_used ?? [] };
}