"use client";

import { useState, useRef } from "react";

type ScoredChunk = { text: string; index: number; score: number };

export default function Home() {
  const [document, setDocument] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<ScoredChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Holds the live AbortController so the Stop button can reach it.
  // A ref (not state) because it's an imperative handle we don't render —
  // and updating it shouldn't trigger a re-render.
  const abortControllerRef = useRef<AbortController | null>(null);

  async function handleSubmit() {
    if (!document.trim() || !question.trim()) return;

    // Fresh controller for THIS request.
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, question }),
        signal: controller.signal, // ← wire abort into the fetch
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed.");
      }

      const sourcesHeader = res.headers.get("x-sources");
      if (sourcesHeader) {
        setSources(JSON.parse(decodeURIComponent(sourcesHeader)));
      }

      if (!res.body) throw new Error("No response body to stream.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      // Pressing Stop rejects with an AbortError. That's INTENTIONAL — keep
      // whatever streamed in so far and show NO error. Only real failures
      // (network drop mid-stream, bad response) get surfaced in red.
      if (err instanceof DOMException && err.name === "AbortError") {
        // user-initiated stop — do nothing
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Scholar</h1>

      <label className="mb-1 block text-sm font-medium">Document</label>
      <textarea
        className="mb-4 w-full rounded border border-gray-300 p-3 font-mono text-sm"
        rows={8}
        placeholder="Paste a document here..."
        value={document}
        onChange={(e) => setDocument(e.target.value)}
      />

      <label className="mb-1 block text-sm font-medium">Question</label>
      <textarea
        className="mb-3 w-full rounded border border-gray-300 p-3"
        rows={2}
        placeholder="Ask something about the document..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      {/* Swap Ask ↔ Stop based on whether a stream is in flight */}
      {loading ? (
        <button
          onClick={handleStop}
          className="rounded bg-red-600 px-4 py-2 text-white"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!document.trim() || !question.trim()}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          Ask
        </button>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {answer && (
        <div className="mt-6 whitespace-pre-wrap rounded  p-4">{answer}</div>
      )}

      {sources.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">
            Retrieved sources
          </h2>
          <ul className="space-y-2">
            {sources.map((s) => (
              <li
                key={s.index}
                className="rounded border border-gray-200 p-3 text-sm"
              >
                <span className="text-gray-400">
                  score {s.score.toFixed(3)}
                </span>
                <p className="mt-1">{s.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
