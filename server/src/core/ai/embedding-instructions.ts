/**
 * Query-side instructions for instruction-tuned embedding models.
 *
 * Qwen3-Embedding encodes queries and documents asymmetrically through a
 * text prefix on the QUERY only ("Instruct: …\nQuery: …"); documents are
 * embedded as-is. Without the prefix its retrieval quality drops noticeably
 * (Qwen3 Embedding paper, §4). Providers that take an `input_type` field
 * instead (Voyage, ZeroEntropy) are handled in dims.ts.
 *
 * The wording is the one the Austrian-law embedding bake-off measured
 * (src/eval/embedding-bakeoff/models.ts); change both together, and re-run
 * the bake-off, because every stored query/document pair depends on it.
 */

const QWEN3_LEGAL_INSTRUCTION =
  "Instruct: Given a legal question about Austrian law, retrieve the statute sections or court decisions that answer it\nQuery: ";

/** The prefix for a query embedded with `modelId`, or null when none is needed. */
export function queryInstructionFor(modelId: string): string | null {
  return /(?:^|\/)qwen3-embedding-/i.test(modelId) ? QWEN3_LEGAL_INSTRUCTION : null;
}
