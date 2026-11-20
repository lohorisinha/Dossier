import { useState } from "react";
import IndexPage from "./components/IndexPage";
import QueryPage from "./components/QueryPage";
import useLocalStorage from "./useLocalStorage";
import "./App.css";

function Header({ step }) {
  return (
    <header className="header">
      <div>
        <span className="label">Internship research agent</span>
        <h1>Dossier</h1>
      </div>
      <div className="steps">
        <span className={`tag ${step === "index" ? "tag--pending" : "tag--done"}`}>
          01 Index
        </span>
        <span className={`tag ${step === "query" ? "tag--pending" : ""}`}>
          02 Ask
        </span>
      </div>
    </header>
  );
}

export default function App() {
  const [indexedUrls, setIndexedUrls] = useLocalStorage("dossier:urls", []);
  const [step, setStep] = useState(indexedUrls.length > 0 ? "query" : "index");
  const [removed, setRemoved] = useState(null);

  function handleContinue(urls) {
    setIndexedUrls((prev) => [...new Set([...prev, ...urls])]);
    setStep("query");
  }

  function handleRemove(url) {
    const remaining = indexedUrls.filter((item) => item !== url);
    setIndexedUrls(remaining);
    setRemoved({ url });
    if (remaining.length === 0) setStep("index");
  }

  return (
    <main className="shell">
      <Header step={step} />

      <div hidden={step !== "index"}>
        <IndexPage onContinue={handleContinue} removed={removed} />
      </div>

      {indexedUrls.length > 0 && (
        <div hidden={step !== "query"}>
          <QueryPage
            urls={indexedUrls}
            onBack={() => setStep("index")}
            onRemove={handleRemove}
          />
        </div>
      )}
    </main>
  );
}