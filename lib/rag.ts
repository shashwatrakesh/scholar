import { embed, embedMany, cosineSimilarity } from "ai";
import { openai } from "@ai-sdk/openai";

// One shared embedding model. text-embedding-3-small is the RAG default:
// 1536-dimensional vectors, ~$0.02 per million tokens — basically free at this scale.
const embeddingModel = openai.embedding("text-embedding-3-small");

/**
 * Split raw text into overlapping chunks.
 *
 * WHY chunk at all: you embed and retrieve *pieces*, not whole documents. Smaller
 * pieces = more precise retrieval (you pull the one relevant paragraph, not 10 pages).
 *
 * WHY overlap: a naive hard split can slice a sentence — or the answer — across a
 * boundary, so it's half in chunk A and half in chunk B and whole in neither. Overlap
 * (each chunk repeats the last ~150 chars of the previous one) guarantees any short
 * span lands intact in at least one chunk.
 *
 * This is deliberately naive — it cuts mid-sentence. A production splitter would break
 * on sentence/paragraph boundaries or count tokens, not characters. Good enough to learn on.
 */
export function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 150,
): string[] {
  const clean = text.replace(/\s+/g, " ").trim(); // collapse whitespace
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start += chunkSize - overlap; // advance, but leave an overlap behind
  }
  return chunks;
}

export type ScoredChunk = { text: string; index: number; score: number };

/**
 * Embed every chunk + the question, then rank chunks by similarity to the question.
 * Returns the top K most relevant chunks.
 */
export async function retrieve(
  question: string,
  chunks: string[],
  topK = 4,
): Promise<ScoredChunk[]> {
  // embedMany returns vectors in the SAME ORDER as the input array — that's why we can
  // line them back up with chunks by index below.
  const { embeddings: chunkEmbeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });

  const { embedding: questionEmbedding } = await embed({
    model: embeddingModel,
    value: question,
  });

  // Score each chunk: how close is its vector to the question's vector? (1 = identical
  // direction, 0 = unrelated). This loop IS the vector search — no database needed.
  const scored: ScoredChunk[] = chunks.map((text, index) => ({
    text,
    index,
    score: cosineSimilarity(questionEmbedding, chunkEmbeddings[index]),
  }));

  // Highest similarity first, keep the best K.
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
