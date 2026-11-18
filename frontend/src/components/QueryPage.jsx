import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { askQuestion, refreshUrl, removeUrl } from "../api";
import useLocalStorage from "../useLocalStorage";

const EMPTY = [];

function shortLabel(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname === "/" ? "" : pathname;
    const label = `${hostname.replace(/^www\./, "")}${path}`;
    return label.length > 38 ? `${label.slice(0, 38)}...` : label;
  } catch {
    return url;
  }
}

function reviveThreads(saved) {
  const revived = {};
  for (const [url, messages] of Object.entries(saved)) {
    revived[url] = messages.map((message) =>
      message.status === "loading"
        ? { ...message, status: "failed", error: "Interrupted by a page refresh. Ask again." }
        : message
    );
  }
  return revived;
}

function describeError(err) {
  return err instanceof TypeError
    ? "Could not reach the backend. Is uvicorn running?"
    : err.message;
}

export default function QueryPage({ urls, onBack, onRemove }) {
  const [activeUrl, setActiveUrl] = useState(urls[0]);
  const [threads, setThreads] = useLocalStorage("dossier:threads", {}, reviveThreads);
  const [input, setInput] = useState("");
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState(null);
  const endRef = useRef(null);

  const current = urls.includes(activeUrl) ? activeUrl : urls[0];
  const messages = threads[current] ?? EMPTY;
  const busy = working !== "" || messages.some((message) => message.status === "loading");

  useEffect(() => {
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function patch(url, id, changes) {
    setThreads((prev) => ({
      ...prev,
      [url]: (prev[url] ?? []).map((message) =>
        message.id === id ? { ...message, ...changes } : message
      ),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    const url = current;
    const id = crypto.randomUUID();

    setThreads((prev) => ({
      ...prev,
      [url]: [
        ...(prev[url] ?? []),
        { id, question, status: "loading", answer: "", chunks: [], error: "" },
      ],
    }));
    setInput("");

    try {
      const { answer, chunks } = await askQuestion(url, question);
      patch(url, id, { status: "done", answer, chunks });
    } catch (err) {
      patch(url, id, { status: "failed", error: describeError(err) });
    }
  }

  async function handleRefresh() {
    const url = current;
    setWorking("refresh");
    setNotice(null);
    try {
      await refreshUrl(url);
      setNotice({ url, kind: "done", text: "Re-scraped. New questions use the fresh page." });
    } catch (err) {
      setNotice({ url, kind: "failed", text: describeError(err) });
    } finally {
      setWorking("");
    }
  }

  async function handleRemove() {
    const url = current;
    const confirmed = window.confirm(
      `Remove ${shortLabel(url)}? This deletes its index and its chat history.`
    );
    if (!confirmed) return;

    setWorking("remove");
    setNotice(null);
    try {
      await removeUrl(url);
      setThreads((prev) => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
      onRemove(url);
    } catch (err) {
      setNotice({ url, kind: "failed", text: describeError(err) });
    } finally {
      setWorking("");
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      handleSubmit(event);
    }
  }

  const visibleNotice = notice && notice.url === current ? notice : null;

  return (
    <section className="query">
      <div className="card card--dolphin">
        <p className="label">Step 2</p>
        <h2>Ask anything about this company</h2>

        {urls.length > 1 ? (
          <div className="chips">
            {urls.map((url) => (
              <button
                key={url}
                type="button"
                className={`chip ${url === current ? "chip--active" : ""}`}
                aria-pressed={url === current}
                onClick={() => setActiveUrl(url)}
              >
                {shortLabel(url)}
              </button>
            ))}
          </div>
        ) : (
          <p className="label">{shortLabel(current)}</p>
        )}

        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={onBack}>
            Index more links
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleRefresh}
            disabled={busy}
          >
            {working === "refresh" ? "Refreshing..." : "Refresh page"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleRemove}
            disabled={busy}
          >
            {working === "remove" ? "Removing..." : "Remove"}
          </button>
        </div>

        {visibleNotice && (
          <p className={visibleNotice.kind === "failed" ? "tag tag--failed" : "tag tag--done"}>
            {visibleNotice.text}
          </p>
        )}
      </div>

      <div className="thread">
        {messages.length === 0 && (
          <p className="label thread-empty">
            Try: what is the stipend, who is eligible, what is the deadline
          </p>
        )}

        {messages.map((message) => (
          <div key={message.id} className="exchange">
            <div className="bubble bubble--question">
              <p className="label">You</p>
              <p>{message.question}</p>
            </div>

            <div className="bubble bubble--answer">
              <p className="label">Dossier</p>
              {message.status === "loading" && (
                <span className="tag tag--pending pulse">Thinking...</span>
              )}
              {message.status === "failed" && (
                <>
                  <span className="tag tag--failed">Failed</span>
                  <p className="url-message label">{message.error}</p>
                </>
              )}
              {message.status === "done" && (
                <>
                  <div className="prose">
                    <ReactMarkdown>{message.answer}</ReactMarkdown>
                  </div>
                  {message.chunks.length > 0 && (
                    <details className="sources">
                      <summary className="label">
                        Sources ({message.chunks.length})
                      </summary>
                      <ol className="sources-list">
                        {message.chunks.map((chunk, index) => (
                          <li key={index} className="source-chunk">
                            {chunk}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        <div ref={endRef} style={{ scrollMarginBottom: "12rem" }} />
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          className="field"
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about this company"
        />
        <button className="btn" type="submit" disabled={busy || input.trim() === ""}>
          Send
        </button>
      </form>
    </section>
  );
}