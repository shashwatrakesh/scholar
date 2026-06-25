# Scholar

A RAG-powered research assistant. Paste or upload a document, ask a question, and get a streamed, token-by-token answer with inline citations showing exactly which parts of the document each claim came from.

> Built to explore the full stack of a modern AI frontend: retrieval-augmented generation, streaming LLM UIs, async state management, and defensive handling of non-deterministic model output — entirely in TypeScript.

**[🔗 Live demo](https://scholar-vert.vercel.app/)** · built with Next.js, TypeScript & the Vercel AI SDK

---

## What it does

- **Grounded answers.** Responses are generated _only_ from the document you provide. Ask something the document doesn't cover and Scholar says so, instead of answering from the model's training data.
- **Inline citations.** The answer references its evidence as `[1]`, `[2]` badges. Click one to see the exact source chunk it came from, with its relevance score.
- **Token-by-token streaming.** The answer types itself out as it's generated, with a stop button to cancel mid-stream (which also halts generation server-side, so it stops the cost — not just the display).
- **Designed states.** Empty, loading, streaming, stopped, and error states are each handled explicitly.

---

## How it works

Scholar is a Retrieval-Augmented Generation (RAG) pipeline. Rather than stuffing an entire document into the prompt (expensive, and often larger than the context window), it retrieves only the most relevant slices and gives the model just those.

```
paste document + question
        │
        ▼
   chunk the document          split into overlapping ~800-char pieces
        │
        ▼
   embed everything            chunks + question → vectors (text-embedding-3-small)
        │
        ▼
   score by similarity         cosine similarity: question vector vs each chunk vector
        │
        ▼
   retrieve top-K              keep the highest-scoring chunks
        │
        ▼
   augment the prompt          inject the retrieved chunks as labelled [Source N] context
        │
        ▼
   generate (streamed)         model answers from the sources, citing them, token by token
        │
        ▼
   render                      Markdown + clickable citations in the browser
```

The core idea is the **embedding**: a function that turns text into a vector positioned so that semantically similar text lands nearby. "Can I get my money back?" and "full refund within 30 days" end up close together even with no shared words. **Cosine similarity** measures that closeness, and that's the entire retrieval mechanism.

---

## Tech stack

| Layer            | Choice                                                                      |
| ---------------- | --------------------------------------------------------------------------- |
| Framework        | Next.js (App Router) + TypeScript                                           |
| Styling          | Tailwind CSS                                                                |
| LLM + embeddings | OpenAI — `gpt-5.4-mini` (generation), `text-embedding-3-small` (embeddings) |
| AI orchestration | Vercel AI SDK (`streamText`, `embed`, `embedMany`, `cosineSimilarity`)      |
| Retrieval        | In-memory cosine similarity (no vector database)                            |
| Markdown         | `react-markdown` + `remark-gfm`                                             |

Everything runs in one Next.js app — the React frontend and the Node API route live together, so the OpenAI key stays server-side and never reaches the browser.

---

## Key design decisions & tradeoffs

These are deliberate choices for a learning/portfolio project. Each notes what it optimizes for and what a production version would do differently.

**Per-request embedding instead of a persistent index.**
The document is chunked and embedded on every question. This is wasteful (it re-embeds the same document repeatedly), but it keeps the system stateless and simple — Next.js route handlers don't reliably hold in-memory state between requests. _Production:_ embed once at ingest time and cache the vectors in a vector database (pgvector, Pinecone, etc.).

**In-memory cosine similarity instead of a vector database.**
With one document and a handful of chunks, a linear scan — score every chunk, sort, take the top-K — is genuinely the right call and is O(n). Cosine similarity is just math; a vector database is an _indexed_ way to run that same math over millions of vectors quickly (closer to O(log n)). That index only pays off at thousands-to-millions of vectors, well past a single document.

**Sources delivered via an HTTP header, not the response body.**
Once the response body is a token stream, there's no JSON envelope left to attach structured data to. The retrieved sources ride in an `x-sources` header (encoded, since headers are ASCII-only) because retrieval finishes before streaming begins. _Tradeoff:_ headers have a size cap (~8–16KB). _Production:_ move sources into the stream itself using the AI SDK's data-stream protocol, which has no such ceiling.

**Manual stream reading instead of the `useChat` hook.**
The client reads the streamed response by hand — `getReader()`, `TextDecoder`, and a functional state update to accumulate tokens — rather than using the AI SDK's `useChat`/`useCompletion` hooks. This was a deliberate choice to understand the streaming primitives directly. The hooks are the production shortcut.

**Grounding via the system prompt.**
The "answer only from the sources, and say so if the answer isn't there" behavior comes entirely from a system prompt instruction, not built-in model behavior — left alone, an LLM answers from everything it knows. This is a strong nudge, not a hard guarantee. _Production:_ add a verification pass that checks the answer's claims actually appear in the retrieved chunks, plus a relevance threshold to drop low-scoring chunks before they reach the model.

**Naive character-based chunking.**
Chunks are fixed-size character windows with overlap, which can cut mid-sentence. _Production:_ split on sentence/paragraph boundaries or use a token-aware splitter.

---

## Getting started

### Prerequisites

- Node.js 20.9+ (the project was built on Node 22 LTS)
- An OpenAI API key with a small prepaid balance ([platform.openai.com](https://platform.openai.com)) — this project costs cents to run

### Setup

```bash
# 1. clone
git clone <your-repo-url>
cd scholar

# 2. install
npm install

# 3. add your API key
echo "OPENAI_API_KEY=sk-..." > .env.local

# 4. run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a document, and ask a question.

> `.env.local` is gitignored by default — your key never gets committed.

---

## Project structure

```
app/
  page.tsx            React UI: input, streaming answer, citations, all states
  api/ask/route.ts    API route: retrieval + streamed generation
  layout.tsx          metadata (title, description)
lib/
  rag.ts              chunkText() and retrieve() — the RAG core
```

---

## Limitations & next steps

- **Single document, single turn.** No conversation history or multi-document search.
- **Re-embeds per request** — see the tradeoffs above; the first thing to fix at scale.
- **Text input only.** No PDF/file parsing yet (the UI takes pasted text).
- **No relevance threshold.** Every top-K chunk is used, even weak matches.
- **Mid-stream model errors** end the stream silently rather than surfacing a clean client-side error — solvable with the AI SDK data-stream protocol.

---

## What I learned

This project was a hands-on follow-up to a RAG concepts course, built to turn theory into something I could ship and explain. The parts that taught me the most: implementing retrieval from scratch (chunking, embeddings, cosine similarity) without a vector database, reading a streamed response by hand to understand the primitives the hooks abstract away, and handling the non-determinism of model output defensively — splitting the error boundary across client and server, distinguishing an intentional stop from a real failure, and degrading gracefully when the model's output doesn't match the format I expected.
