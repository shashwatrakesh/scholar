import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { chunkText, retrieve } from "@/lib/rag";

export async function POST(req: Request) {
  try {
    const { question, document } = await req.json();

    if (!question?.trim() || !document?.trim()) {
      return Response.json(
        { error: "Both a document and a question are required." },
        { status: 400 },
      );
    }

    // Retrieval is unchanged — and notice it still finishes BEFORE we stream.
    // We know the sources up front; only the answer is streamed.
    const chunks = chunkText(document);
    const topChunks = await retrieve(question, chunks);

    const context = topChunks
      .map((c, i) => `[Source ${i + 1}]\n${c.text}`)
      .join("\n\n");

    // streamText, NOT generateText. Critical difference: this is NOT awaited.
    // It returns a result object immediately and streams lazily as the client reads.
    const result = streamText({
      model: openai("gpt-5.4-mini"),
      system:
        "You are a research assistant. Answer the question using ONLY the provided sources. " +
        "If the answer is not in the sources, say you could not find it in the document. " +
        "Cite the sources you used by their [Source N] label. Be concise.",
      prompt: `Sources:\n${context}\n\nQuestion: ${question}`,
      // GOTCHA: streamText does NOT throw on model errors — it puts them INTO the
      // stream so the server can't crash mid-response. So your try/catch below won't
      // catch generation errors. This callback is how you log them server-side.
      abortSignal: req.signal, // client aborts → connection closes → req.signal fires → generation stops
      onError: ({ error }) => console.error("Stream error in /api/ask:", error),
    });

    // Return a streaming HTTP response. The body is plain text tokens.
    // Sources ride along in a header — set before the stream starts, so the client
    // can read them immediately. Headers are ASCII-only, so we encode the JSON
    // (chunk text may contain non-ASCII characters that would corrupt the header).
    return result.toTextStreamResponse({
      headers: {
        "x-sources": encodeURIComponent(JSON.stringify(topChunks)),
      },
    });
  } catch (err) {
    // Catches the throwing parts: bad JSON body, and embedding/retrieval failures
    // (embed/embedMany DO throw — e.g. the quota 429 you saw earlier).
    console.error("Error in /api/ask:", err);
    return Response.json(
      { error: "Something went wrong answering your question." },
      { status: 500 },
    );
  }
}
