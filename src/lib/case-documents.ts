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
import { withKeyedLock } from "@/lib/keyed-lock";

/**
 * Every writer of a matter's `documents` list holds this lock (uploads, mail
 * filing, signatures). The convergence loop alone cannot stop a slow writer
 * from overwriting an entry another writer already confirmed.
 */
export function caseDocumentsLockKey(brainOrSource: string, caseSlug: string): string {
  return `case-documents:${brainOrSource}:${caseSlug}`;
}

export interface CaseDocumentEntry {
  id: string;
  slug: string;
  name: string;
  url: string;
  uploadedAt: string;
  size: number;
  kind?: string;
  mime_type?: string;
}

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * The matter is archived (or deleted): its document list is closed and is not
 * written. A permanent condition — callers that retry (the post-upload outbox)
 * must stop instead of retrying; the document itself stays in the brain, it is
 * just not listed on a matter that is no longer active.
 */
export class CaseArchivedError extends Error {
  readonly code = "case_archived";
  constructor(
    readonly caseSlug: string,
    readonly caseStatus: string
  ) {
    super(`case_archived: ${caseSlug} (${caseStatus})`);
    this.name = "CaseArchivedError";
  }
}

const CLOSED_CASE_STATUSES = new Set(["archived", "tombstoned"]);

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
  const status = page.frontmatter?.status;
  if (typeof status === "string" && CLOSED_CASE_STATUSES.has(status)) {
    throw new CaseArchivedError(caseSlug, status);
  }
  const docs = page.frontmatter?.documents;
  return Array.isArray(docs) ? (docs as Record<string, unknown>[]) : [];
}

/**
 * Add `docEntry` to the case's documents array, converging under concurrent
 * writers. Idempotent by slug. Throws if it cannot converge after
 * `maxAttempts` rounds (so the caller can surface / retry via the outbox), and
 * throws CaseArchivedError — without writing — when the matter is archived or
 * deleted (permanent: do not retry).
 */
export async function reconcileCaseDocuments(
  headers: Record<string, string>,
  caseSlug: string,
  docEntry: CaseDocumentEntry,
  maxAttempts = 4
): Promise<void> {
  const key = caseDocumentsLockKey(headers["x-subsumio-source"] ?? "", caseSlug);
  return withKeyedLock(key, () => reconcileUnlocked(headers, caseSlug, docEntry, maxAttempts));
}

async function reconcileUnlocked(
  headers: Record<string, string>,
  caseSlug: string,
  docEntry: CaseDocumentEntry,
  maxAttempts: number
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

function matchesDoc(entry: Record<string, unknown>, docSlug: string): boolean {
  return entry.slug === docSlug || entry.id === docSlug || entry.url === docSlug;
}

/**
 * Remove a document from the matter's `documents` list (the list the matter
 * view and the matter export read). Holds the same lock as every other writer
 * of that list and re-reads to confirm. Returns false when the entry was not
 * listed. Throws on read/write failure and CaseArchivedError for a closed
 * matter (its list is not written).
 */
export async function removeFromCaseDocuments(
  headers: Record<string, string>,
  caseSlug: string,
  docSlug: string,
  maxAttempts = 4
): Promise<boolean> {
  const key = caseDocumentsLockKey(headers["x-subsumio-source"] ?? "", caseSlug);
  return withKeyedLock(key, async () => {
    let removed = false;
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const existing = await fetchCaseDocuments(headers, caseSlug);
      const kept = existing.filter((d) => !matchesDoc(d, docSlug));
      if (kept.length === existing.length) return removed;
      const patchRes = await enginePatchPage(headers, {
        slug: caseSlug,
        frontmatter: { documents: kept },
      });
      if (!patchRes.ok) {
        lastError = `case_patch_failed_${patchRes.status}`;
        continue;
      }
      removed = true;
      const after = await fetchCaseDocuments(headers, caseSlug);
      if (!after.some((d) => matchesDoc(d, docSlug))) return true;
      lastError = "re_added_by_concurrent_writer";
    }
    throw new Error(`case_document_remove_failed: ${lastError}`);
  });
}

/**
 * „Aus Akte entfernen": the document leaves the matter's list and becomes an
 * unassigned inbox item (it is not deleted — it can be reassigned). The
 * matter list is cleaned first, so a failure never leaves a document that
 * claims no matter but still shows up in one.
 */
export async function detachCaseDocument(
  headers: Record<string, string>,
  caseSlug: string,
  docSlug: string
): Promise<{ removedFromList: boolean }> {
  const removedFromList = await removeFromCaseDocuments(headers, caseSlug, docSlug);
  const res = await enginePatchPage(headers, {
    slug: docSlug,
    frontmatter: {
      case_slug: null,
      assignment_status: "unassigned",
      intake_status: "needs_assignment",
      unassigned_at: new Date().toISOString(),
    },
  });
  if (!res.ok) throw new Error(`document_patch_failed_${res.status}`);
  return { removedFromList };
}
