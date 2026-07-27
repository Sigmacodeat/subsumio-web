/**
 * v0.43 Embedding Consistency Guard — prevents silent model mixing.
 *
 * The guard checks the current gateway's embedding signature against what's
 * already stamped on pages in the DB. If there's a mismatch, it logs a loud
 * warning so the operator knows existing chunks need re-embedding before
 * new chunks are added with the wrong model.
 *
 * This is a CHECK, not a BLOCK — the caller decides whether to proceed.
 * Import and embed pipelines should warn + continue (the new chunks get
 * the correct signature; stale ones are flagged for re-embed). CLI commands
 * like `gbrain doctor` should surface the mismatch prominently.
 */

import type { BrainEngine } from "./engine.ts";
import { currentEmbeddingSignature } from "./embedding.ts";

export interface SignatureAuditResult {
  /** Signature the gateway is currently configured with. */
  currentSignature: string;
  /** Distinct signatures found in the DB, sorted by frequency (desc). */
  distinctSignatures: { signature: string; page_count: number }[];
  /** Total pages with a non-null signature. */
  totalPagesWithSignature: number;
  /** Total pages with null signature (grandfathered, never stale). */
  totalPagesNull: number;
  /** True if the current signature matches the most common DB signature. */
  isConsistent: boolean;
  /** If inconsistent, the dominant DB signature that mismatches. */
  mismatchedSignature: string | null;
}

export interface ChunkModelAuditResult {
  currentSignature: string;
  models: { model: string; chunk_count: number }[];
  embeddedChunks: number;
  mismatchedChunks: number;
  isConsistent: boolean;
}

/**
 * Query the DB for the distribution of embedding signatures and compare
 * against the current gateway configuration.
 *
 * Fail-open: if the query fails (e.g. column doesn't exist on old brains),
 * returns a synthetic "consistent" result so callers never block on a
 * schema gap.
 */
export async function auditEmbeddingSignatures(
  engine: BrainEngine,
  currentSignatureOverride?: string
): Promise<SignatureAuditResult> {
  const currentSignature = currentSignatureOverride ?? safeCurrentSignature();

  try {
    const rows = await engine.executeRaw<{
      embedding_signature: string | null;
      page_count: string;
    }>(`
      SELECT embedding_signature, COUNT(*)::TEXT as page_count
      FROM pages
      GROUP BY embedding_signature
      ORDER BY COUNT(*) DESC
    `);

    const distinctSignatures: { signature: string; page_count: number }[] = [];
    let totalPagesWithSignature = 0;
    let totalPagesNull = 0;

    for (const row of rows) {
      const count = parseInt(row.page_count, 10);
      if (row.embedding_signature === null) {
        totalPagesNull = count;
      } else {
        distinctSignatures.push({
          signature: row.embedding_signature,
          page_count: count,
        });
        totalPagesWithSignature += count;
      }
    }

    // Every stamped page must belong to the current vector space. The old
    // `dominantSig === currentSignature` rule silently accepted a minority of
    // foreign embeddings, which is precisely the model-mixing failure this
    // guard exists to prevent.
    const isConsistent =
      totalPagesWithSignature === 0 ||
      distinctSignatures.every((row) => row.signature === currentSignature);
    const firstMismatch =
      distinctSignatures.find((row) => row.signature !== currentSignature)?.signature ?? null;

    return {
      currentSignature,
      distinctSignatures,
      totalPagesWithSignature,
      totalPagesNull,
      isConsistent,
      mismatchedSignature: isConsistent ? null : firstMismatch,
    };
  } catch {
    // Schema gap or query error — fail open.
    return {
      currentSignature,
      distinctSignatures: [],
      totalPagesWithSignature: 0,
      totalPagesNull: 0,
      isConsistent: true,
      mismatchedSignature: null,
    };
  }
}

/**
 * Audit the real chunk rows as well as page signatures. Older imports left
 * pages.embedding_signature NULL, so a page-only audit cannot prove that the
 * active vector index contains a single embedding space.
 */
export async function auditChunkModels(
  engine: BrainEngine,
  currentSignatureOverride?: string
): Promise<ChunkModelAuditResult> {
  const currentSignature = currentSignatureOverride ?? safeCurrentSignature();
  const rows = await engine.executeRaw<{ model: string; chunk_count: string }>(`
    SELECT model, COUNT(*)::TEXT AS chunk_count
    FROM content_chunks
    WHERE embedding IS NOT NULL
    GROUP BY model
    ORDER BY COUNT(*) DESC
  `);

  const models = rows.map((row) => ({
    model: row.model,
    chunk_count: Number.parseInt(row.chunk_count, 10),
  }));
  const embeddedChunks = models.reduce((sum, row) => sum + row.chunk_count, 0);
  const mismatchedChunks = models
    .filter((row) => !modelMatchesSignature(row.model, currentSignature))
    .reduce((sum, row) => sum + row.chunk_count, 0);

  return {
    currentSignature,
    models,
    embeddedChunks,
    mismatchedChunks,
    isConsistent: mismatchedChunks === 0,
  };
}

/** Fail closed before adding more vectors to an already mixed index. */
export async function assertChunkModelConsistency(
  engine: BrainEngine,
  currentSignatureOverride?: string
): Promise<void> {
  const audit = await auditChunkModels(engine, currentSignatureOverride);
  if (audit.isConsistent) return;

  const distribution = audit.models.map((row) => `${row.model}=${row.chunk_count}`).join(", ");
  throw new Error(
    `Embedding index contains ${audit.mismatchedChunks} chunk(s) outside ` +
      `${audit.currentSignature}. Distribution: ${distribution}. ` +
      `Re-embed the foreign model before continuing, or use the explicit ` +
      `repair override for a controlled migration.`
  );
}

export function modelMatchesSignature(model: string, signature: string): boolean {
  if (model === signature) return true;
  const match = signature.match(/^(.*):(\d+)$/);
  return match !== null && model === match[1];
}

/**
 * Format an audit result as a human-readable warning string.
 * Returns null when consistent (no warning needed).
 */
export function formatSignatureWarning(audit: SignatureAuditResult): string | null {
  if (audit.isConsistent) return null;

  const lines: string[] = [
    "⚠️  EMBEDDING MODEL MISMATCH DETECTED",
    "",
    `   Current gateway:  ${audit.currentSignature}`,
    `   Dominant in DB:   ${audit.mismatchedSignature}`,
    `   Pages with sig:   ${audit.totalPagesWithSignature}`,
    `   Pages NULL:       ${audit.totalPagesNull}`,
    "",
    "   Existing chunks were embedded with a DIFFERENT model.",
    "   Cosine similarity across model boundaries is MEANINGLESS.",
    "",
    "   To fix: re-embed stale chunks with the current model:",
    "     gbrain embed --stale",
    "",
  ];

  if (audit.distinctSignatures.length > 2) {
    lines.push("   All signatures in DB:");
    for (const s of audit.distinctSignatures) {
      const marker = s.signature === audit.currentSignature ? " ← current" : "";
      lines.push(`     ${s.signature}: ${s.page_count} pages${marker}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * One-shot warn-on-mismatch helper. Logs to stderr if the DB has chunks
 * stamped under a different embedding signature than the current gateway.
 *
 * Rate-limited to once per process via a module-level flag so import
 * pipelines that call this per-page don't spam.
 */
let _warnedOnce = false;

export async function warnOnEmbeddingMismatch(engine: BrainEngine): Promise<void> {
  if (_warnedOnce) return;
  _warnedOnce = true;

  const audit = await auditEmbeddingSignatures(engine);
  const warning = formatSignatureWarning(audit);
  if (warning) {
    process.stderr.write(warning + "\n");
  }
}

/**
 * Reset the one-shot warning flag. Used by tests.
 */
export function resetEmbeddingMismatchWarning(): void {
  _warnedOnce = false;
}

function safeCurrentSignature(): string {
  try {
    return currentEmbeddingSignature();
  } catch {
    return "unknown:unknown";
  }
}
