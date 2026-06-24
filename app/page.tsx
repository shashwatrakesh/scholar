"use client"; // required: this component uses state + event handlers

import { useState } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!question.trim()) return;

    setLoading(true);
    setError(""); // clear stale error from a previous attempt
    setAnswer(""); // clear stale answer so the user isn't looking at the old one

    console.log("question:", question);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      // fetch only throws on network failure, NOT on 4xx/5xx — check res.ok yourself
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed.");
      }

      const data = await res.json();
      setAnswer(data.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false); // runs whether we succeeded or threw — button never sticks
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">Scholar</h1>

      <textarea
        className="mb-3 w-full rounded border border-gray-300 p-3"
        rows={3}
        placeholder="Ask a question..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !question.trim()}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Thinking…" : "Ask"}
      </button>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {answer && (
        <div className="mt-6 whitespace-pre-wrap rounded p-4">{answer}</div>
      )}
    </main>
  );
}
