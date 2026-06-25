"use client";

import { useState } from "react";

type ScoredChunk = { text: string; index: number; score: number };

export default function Home() {
  const [document, setDocument] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<ScoredChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!document.trim() || !question.trim()) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, question }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed.");
      }

      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
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

      <button
        onClick={handleSubmit}
        disabled={loading || !document.trim() || !question.trim()}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Thinking…" : "Ask"}
      </button>

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
