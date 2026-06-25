"use client";

import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
  cloneElement,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type ScoredChunk = { text: string; index: number; score: number };

function Citation({ n, chunk }: { n: number; chunk: ScoredChunk }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Source ${n}`}
        className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded align-super text-[10px] font-semibold text-indigo-700 bg-indigo-100 px-1 hover:bg-indigo-200 transition-colors"
      >
        {n}
      </button>
      {open && (
        <span className="absolute bottom-full left-0 z-10 mb-1.5 block w-72 rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-lg">
          <span className="mb-1.5 flex items-center justify-between font-medium text-zinc-500">
            <span>Source {n}</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums">
              {chunk.score.toFixed(3)}
            </span>
          </span>
          <span className="block leading-relaxed text-zinc-700">
            {chunk.text}
          </span>
        </span>
      )}
    </span>
  );
}

function injectCitations(
  text: string,
  sources: ScoredChunk[],
  keyPrefix: string,
): ReactNode[] {
  return text.split(/(\[Source \d+\])/g).map((part, i) => {
    const match = part.match(/^\[Source (\d+)\]$/);
    if (!match) return part;
    const n = Number(match[1]);
    const chunk = sources[n - 1];
    if (!chunk) return part;
    return <Citation key={`${keyPrefix}-${i}`} n={n} chunk={chunk} />;
  });
}

function processChildren(
  children: ReactNode,
  sources: ScoredChunk[],
): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === "string")
      return injectCitations(child, sources, `s${i}`);
    if (isValidElement(child)) {
      const props = child.props as { children?: ReactNode };
      if (props.children) {
        return cloneElement(
          child,
          {},
          processChildren(props.children, sources),
        );
      }
    }
    return child;
  });
}

export default function Home() {
  const [document, setDocument] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<ScoredChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);

  const markdownComponents: Components = {
    p(props) {
      return (
        <p className="mb-3 last:mb-0">
          {processChildren(props.children, sources)}
        </p>
      );
    },
    li(props) {
      return (
        <li className="mb-1">{processChildren(props.children, sources)}</li>
      );
    },
    ul(props) {
      return <ul className="mb-3 list-disc pl-5">{props.children}</ul>;
    },
    ol(props) {
      return <ol className="mb-3 list-decimal pl-5">{props.children}</ol>;
    },
    strong(props) {
      return (
        <strong className="font-semibold text-zinc-900">
          {props.children}
        </strong>
      );
    },
  };

  async function handleSubmit() {
    if (!document.trim() || !question.trim()) return;

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
        signal: controller.signal,
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
      if (err instanceof DOMException && err.name === "AbortError") {
        // user pressed Stop — intentional
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

  const canSubmit = document.trim() && question.trim();

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-900">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Scholar</h1>
          <p className="mt-1 text-zinc-500">
            Ask questions about your documents — answers grounded in cited
            sources.
          </p>
        </header>

        {/* Input card */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            Document
          </label>
          <textarea
            className="mb-4 w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm leading-relaxed placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={8}
            placeholder="Paste a document here..."
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />

          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            Question
          </label>
          <textarea
            className="mb-4 w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 leading-relaxed placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
            placeholder="Ask something about the document..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          {loading ? (
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              <span className="h-2 w-2 rounded-full bg-red-400" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask
            </button>
          )}
        </section>

        {/* Answer area — the hero */}
        <section className="mt-6">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : loading && !answer ? (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
              Thinking…
            </div>
          ) : answer ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Answer
              </h2>
              <div className="leading-relaxed text-zinc-800">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {answer}
                </ReactMarkdown>
                {loading && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-500 align-middle" />
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center text-sm text-zinc-400">
              Paste a document and ask a question to see a cited answer here.
            </div>
          )}
        </section>

        {/* Sources */}
        {sources.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Retrieved sources
            </h2>
            <ul className="space-y-2">
              {sources.map((s) => (
                <li
                  key={s.index}
                  className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700 shadow-sm"
                >
                  <span className="mb-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-500">
                    score {s.score.toFixed(3)}
                  </span>
                  <p className="leading-relaxed">{s.text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
