import { useState } from "react";
import { indexUrl, waitForJob } from "../api";

const STATUS = {
  pending: { label: "Indexing...", className: "tag tag--pending pulse" },
  done: { label: "Done", className: "tag tag--done" },
  failed: { label: "Failed", className: "tag tag--failed" },
};

function parseUrls(text) {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const normalized = tokens.map((token) =>
    /^https?:\/\//i.test(token) ? token : `https://${token}`
  );
  return [...new Set(normalized)];
}

function isValidUrl(value) {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

export default function IndexPage({ onContinue }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);

  function update(url, patch) {
    setItems((prev) =>
      prev.map((item) => (item.url === url ? { ...item, ...patch } : item))
    );
  }

  async function runOne(url) {
    try {
      const { cached, jobId } = await indexUrl(url);
      if (!cached) await waitForJob(jobId);
      update(url, {
        status: "done",
        message: cached ? "Already indexed" : "",
      });
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Could not reach the backend. Is uvicorn running?"
          : err.message;
      update(url, { status: "failed", message });
    }
  }

  async function handleAnalyse() {
    const urls = parseUrls(text);
    if (urls.length === 0) return;

    const initial = urls.map((url) =>
      isValidUrl(url)
        ? { url, status: "pending", message: "" }
        : { url, status: "failed", message: "Not a valid URL" }
    );

    setItems(initial);
    setRunning(true);
    await Promise.all(
      initial.filter((item) => item.status === "pending").map((item) => runOne(item.url))
    );
    setRunning(false);
  }

  const doneUrls = items
    .filter((item) => item.status === "done")
    .map((item) => item.url);
  const canContinue = !running && doneUrls.length > 0;

  return (
    <section className="card">
      <p className="label">Step 1</p>
      <h2>Paste the links</h2>

      <textarea
        className="field"
        rows={5}
        value={text}
        disabled={running}
        onChange={(event) => setText(event.target.value)}
        placeholder={"https://company.com/careers\nhttps://internshala.com/internship/detail/..."}
      />
      <p className="label">One link per line</p>

      <div className="actions">
        <button
          className="btn"
          onClick={handleAnalyse}
          disabled={running || text.trim() === ""}
        >
          {running ? "Analysing..." : "Analyse"}
        </button>

        {canContinue && (
          <button className="btn btn--dark" onClick={() => onContinue(doneUrls)}>
            Continue with {doneUrls.length} indexed
          </button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="url-list">
          {items.map((item) => (
            <li key={item.url} className="url-row">
              <div className="url-info">
                <span className="url-text">{item.url}</span>
                {item.message && (
                  <span className="label url-message">{item.message}</span>
                )}
              </div>
              <span className={STATUS[item.status].className}>
                {STATUS[item.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}