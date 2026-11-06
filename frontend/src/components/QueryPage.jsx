import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { askQuestion } from "../api";

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

export default function QueryPage({ urls, onBack }) {
  const [activeUrl, setActiveUrl] = useState(urls[0]);
  const [threads, setThreads] = useState({});
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  const messages = threads[activeUrl] ?? EMPTY;
  const busy = messages.some((message) => message.status === "loading");

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

    const url = activeUrl;
    const id = crypto.randomUUID();

    setThreads((prev) => ({
      ...prev,
      [url]: [
        ...(prev[url] ?? []),
        { id, question, status: "loading", answer: "", error: "" },
      ],
    }));
    setInput("");

    try {
      const answer = await askQuestion(url, question);
      patch(url, id, { status: "done", answer });
    } catch (err) {
      const error =
        err instanceof TypeError
          ? "Could not reach the backend. Is uvicorn running?"
          : err.message;
      patch(url, id, { status: "failed", error });
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      handleSubmit(event);
    }
  }

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
                className={`chip ${url === activeUrl ? "chip--active" : ""}`}
                aria-pressed={url === activeUrl}
                onClick={() => setActiveUrl(url)}
              >
                {shortLabel(url)}
              </button>
            ))}
          </div>
        ) : (
          <p className="label">{shortLabel(activeUrl)}</p>
        )}

        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Index more links
        </button>
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
                <div className="prose">
                  <ReactMarkdown>{message.answer}</ReactMarkdown>
                </div>
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