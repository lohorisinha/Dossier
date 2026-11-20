import { useEffect, useState } from "react";
import { indexUrl, waitForJob } from "../api";

const STATUS = {
  queued: { label: "Queued", className: "tag" },
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

export default function IndexPage({ onContinue, removed }) {
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!removed) return;
    setItems((prev) => prev.filter((item) => item.url !== removed.url));
  }, [removed]);

  function update(url, patch) {
    setItems((prev) =>
      prev.map((item) => (item.url === url ? { ...item, ...patch } : item))
    );
  }

  function addUrls(text) {
    const urls = parseUrls(text);
    if (urls.length === 0) return;
    setItems((prev) => {
      const known = new Set(prev.map((item) => item.url));
      const fresh = urls
        .filter((url) => !known.has(url))
        .map((url) =>
          isValidUrl(url)
            ? { url, status: "queued", message: "" }
            : { url, status: "failed", message: "Not a valid URL" }
        );
      return [...prev, ...fresh];
    });
  }

  function handleAdd() {
    addUrls(draft);
    setDraft("");
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData("text");
    if (!/\s/.test(pasted.trim())) return;
    event.preventDefault();
    addUrls(pasted);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
  }

  function removeItem(url) {
    setItems((prev) => prev.filter((item) => item.url !== url));
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
    const queued = items
      .filter((item) => item.status === "queued")
      .map((item) => item.url);
    if (queued.length === 0) return;

    setItems((prev) =>
      prev.map((item) =>
        item.status === "queued" ? { ...item, status: "pending" } : item
      )
    );
    setRunning(true);
    await Promise.all(queued.map((url) => runOne(url)));
    setRunning(false);
  }

  const queuedCount = items.filter((item) => item.status === "queued").length;
  const doneUrls = items
    .filter((item) => item.status === "done")
    .map((item) => item.url);
  const canContinue = !running && doneUrls.length > 0;

  return (
    <section className="card">
      <p className="label">Step 1</p>
      <h2>Add the links</h2>

      <div className="link-entry">
        <input
          className="field"
          type="text"
          value={draft}
          disabled={running}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="https://company.com/careers"
        />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={handleAdd}
          disabled={running || draft.trim() === ""}
        >
          Add
        </button>
      </div>
      <p className="label">Press Enter to add. Paste several links at once and each gets its own row.</p>

      {items.length > 0 && (
        <ul className="url-list">
          {items.map((item, index) => (
            <li key={item.url} className="url-row">
              <div className="url-row-main">
                <span className="url-index">{index + 1}</span>
                <div className="url-info">
                  <span className="url-text">{item.url}</span>
                  {item.message && (
                    <span className="label url-message">{item.message}</span>
                  )}
                </div>
              </div>
              <div className="url-row-end">
                <span className={STATUS[item.status].className}>
                  {STATUS[item.status].label}
                </span>
                <button
                  type="button"
                  className="url-remove"
                  aria-label={`Remove ${item.url} from the list`}
                  title="Remove from this list"
                  onClick={() => removeItem(item.url)}
                  disabled={running}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button
          className="btn"
          onClick={handleAnalyse}
          disabled={running || queuedCount === 0}
        >
          {running ? "Analysing..." : `Analyse ${queuedCount > 0 ? queuedCount : ""}`.trim()}
        </button>

        {canContinue && (
          <button className="btn btn--dark" onClick={() => onContinue(doneUrls)}>
            Continue with {doneUrls.length} indexed
          </button>
        )}
      </div>
    </section>
  );
}