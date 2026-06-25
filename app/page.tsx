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

// UNCHANGED from the citations step — one clickable badge with an inline popover.
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
        className="mx-0.5 align-super rounded bg-blue-100 px-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
      >
        {n}
      </button>
      {open && (
        <span className="absolute bottom-full left-0 z-10 mb-1 block w-72 rounded border border-gray-200 bg-white p-3 text-xs shadow-lg">
          <span className="mb-1 block font-semibold text-gray-500">
            Source {n} · score {chunk.score.toFixed(3)}
          </span>
          <span className="block text-gray-800">{chunk.text}</span>
        </span>
      )}
    </span>
  );
}

// Split ONE plain string on [Source N] and swap complete markers for <Citation>.
// (Same logic as before — half-streamed "[Sou" simply won't match and stays text.)
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
    if (!chunk) return part; // out-of-range / not loaded yet → literal text
    return <Citation key={`${keyPrefix}-${i}`} n={n} chunk={chunk} />;
  });
}

// THE NEW PIECE: walk a rendered element's children. Strings get marker-replaced;
// nested elements (a citation inside **bold**, say) get recursed into and cloned
// with their processed children. This is what handles the Markdown TREE instead
// of a flat string.
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
    return child; // already an element with no children, or non-string leaf
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

  // Override how react-markdown renders each element: add light styling, and run
  // text-bearing nodes (p, li) through processChildren so citations appear inside
  // properly-rendered Markdown. Defined here so it closes over the latest `sources`.
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
      return <strong className="font-semibold">{props.children}</strong>;
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
        // user pressed Stop — intentional, show nothing
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
        <div className="mt-6 rounded bg-gray-50 p-4 leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {answer}
          </ReactMarkdown>
        </div>
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
