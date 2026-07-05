/**
 * Shared case↔document reconciliation (P2-1).
 *
 * Appends an uploaded document to a case page's `frontmatter.documents[]` array.
 * Extracted from the byte-for-byte copies that lived in `/api/upload` and the
 * post-upload-drain cron, which each did a single read-modify-write with an
 * explicit "no optimistic locking, last-writer-wins" caveat.
 *
 * The engine exposes no If-Match / CAS on page writes, so two concurrent uploads
 * to the SAME case (scanning a stack, several assistants) could each read the
 * same base array, append their own entry, and write — the last write dropping
 * the other entry. In a busy firm that silently loses documents from a matter's
 * document list.
 *
 * This helper closes the window with a bounded convergence loop: read → (if our
 * slug is already present, done) → append → write → RE-READ to confirm our entry
 * survived. If a concurrent writer overwrote us between write and re-read, we
 * loop: the next read sees the other writer's entry, we re-append ours on top,
 * and both converge. Dedup-by-slug keeps it idempotent, so retried uploads never
 * create phantom duplicates. It is best-effort convergence, not a hard
 * transaction, but it turns "last writer silently wins" into "all writers
 * eventually present" under realistic concurrency.
 */

import { ENGINE_URL, enginePatchPage } from "@/lib/engine";

export interface CaseDocumentEntry {
  id: string;
  slug: string;
  name: string;
  url: string;
  uploadedAt: string;
  size: number;
  kind?: string;
}

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

async function fetchCaseDocuments(
  headers: Record<string, string>,
  caseSlug: string
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`case_fetch_failed_${res.status}`);
  const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
  const docs = page.frontmatter?.documents;
  return Array.isArray(docs) ? (docs as Record<string, unknown>[]) : [];
}

/**
 * Add `docEntry` to the case's documents array, converging under concurrent
 * writers. Idempotent by slug. Throws only if it cannot converge after
 * `maxAttempts` rounds (so the caller can surface / retry via the outbox).
 */
export async function reconcileCaseDocuments(
  headers: Record<string, string>,
  caseSlug: string,
  docEntry: CaseDocumentEntry,
  maxAttempts = 4
): Promise<void> {
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const existing = await fetchCaseDocuments(headers, caseSlug);
    if (existing.some((d) => d.slug === docEntry.slug)) return; // already present

    // merge:true overlays only the keys we send, so passing just `documents`
    // leaves the rest of the case frontmatter untouched.
    const patchRes = await enginePatchPage(headers, {
      slug: caseSlug,
      frontmatter: { documents: [...existing, docEntry] },
    });
    if (!patchRes.ok) {
      lastError = `case_patch_failed_${patchRes.status}`;
      continue; // transient write failure — re-read and retry
    }

    // Confirm our entry survived (a concurrent writer may have overwritten the
    // array between our read and write). If present, we're done; else loop.
    const after = await fetchCaseDocuments(headers, caseSlug);
    if (after.some((d) => d.slug === docEntry.slug)) return;
    lastError = "overwritten_by_concurrent_writer";
  }
  throw new Error(`case_reconcile_convergence_failed: ${lastError}`);
}
