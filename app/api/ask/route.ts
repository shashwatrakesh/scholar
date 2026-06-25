import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { chunkText, retrieve } from "@/lib/rag";

export async function POST(req: Request) {
  try {
    const { question, document } = await req.json();

    // RAG needs both a question AND something to retrieve from.
    if (!question?.trim() || !document?.trim()) {
      return Response.json(
        { error: "Both a document and a question are required." },
        { status: 400 },
      );
    }

    // 1. chunk  2. embed + retrieve the most relevant slices
    const chunks = chunkText(document);
    const topChunks = await retrieve(question, chunks);

    // 3. augment: stitch the retrieved chunks into a labelled context block.
    //    The [Source N] labels are what we'll turn into clickable citations in Step 5.
    const context = topChunks
      .map((c, i) => `[Source ${i + 1}]\n${c.text}`)
      .join("\n\n");

    // 4. generate. The SYSTEM PROMPT is the heart of RAG: it forces the model to answer
    //    from the retrieved sources only, and to admit when the answer isn't there.
    //    Without this line, the model happily falls back on its training data and
    //    "hallucinates" — which defeats the entire purpose of grounding it in YOUR doc.
    const { text } = await generateText({
      model: openai("gpt-5.4-mini"),
      system:
        "You are a research assistant. Answer the question using ONLY the provided sources. " +
        "If the answer is not in the sources, say you could not find it in the document. " +
        "Cite the sources you used by their [Source N] label. Be concise.",
      prompt: `Sources:\n${context}\n\nQuestion: ${question}`,
    });

    // Return the answer AND the chunks we retrieved, so the UI can show its work.
    return Response.json({ answer: text, sources: topChunks });
  } catch (err) {
    console.error("Error in /api/ask:", err);
    return Response.json(
      { error: "Something went wrong answering your question." },
      { status: 500 },
    );
  }
}
