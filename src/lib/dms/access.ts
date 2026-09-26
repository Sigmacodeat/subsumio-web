/**
 * Access rules for documents of a firm's DMS.
 *
 * The DMS itself knows nothing about Subsumio's matters, ethical walls or
 * roles. Content is therefore only served for DMS documents this firm has
 * imported into its own brain (the import page `dms/import/<id>` is the
 * proof, read through the caller's engine headers — so brain and matter
 * scope apply), and only when the user may read the matter that document is
 * linked to.
 */

import { ENGINE_URL } from "@/lib/engine";
import { blockedCasesForUser, caseAccessAllowed, caseAccessForUser } from "@/lib/email/case-link";
import type { DMSDocument } from "./index";
import { dmsImportSlug } from "./index";

export interface DmsAccessCaller {
  headers: Record<string, string>;
  user: { id: string; role?: string | null };
}

export interface DmsImportRecord {
  slug: string;
  caseSlug: string | null;
}

export type DmsContentAccess = "ok" | "not_imported" | "blocked";

/** Staff roles only — a client_viewer never reaches the firm's DMS. */
export function isDmsStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "lawyer" || role === "assistant";
}

function slugPath(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * The import record of a DMS document in the caller's brain, or null when
 * this firm never imported it (or it is deleted / not visible to the caller).
 */
export async function loadDmsImport(
  headers: Record<string, string>,
  docId: string
): Promise<DmsImportRecord | null> {
  const slug = dmsImportSlug(docId);
  const res = await fetch(`${ENGINE_URL}/api/pages/${slugPath(slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const page = (await res.json().catch(() => null)) as {
    type?: string;
    status?: string;
    frontmatter?: Record<string, unknown>;
  } | null;
  if (!page) return null;
  const fm = page.frontmatter ?? {};
  if (page.status === "tombstoned" || fm.status === "tombstoned") return null;
  // The page must really be the import of THIS document.
  if (fm.dms_document_id !== docId) return null;
  const caseSlug = typeof fm.case_slug === "string" && fm.case_slug.trim() ? fm.case_slug : null;
  return { slug, caseSlug };
}

/**
 * Whether the caller may open the content of this DMS document: staff role,
 * imported by this firm, and — when linked to a matter — the matter passes the
 * matter scope and its ethical wall. Everything else is denied.
 */
export async function dmsContentAccess(
  caller: DmsAccessCaller,
  docId: string
): Promise<DmsContentAccess> {
  if (!isDmsStaffRole(caller.user.role)) return "blocked";
  const record = await loadDmsImport(caller.headers, docId);
  if (!record) return "not_imported";
  if (!record.caseSlug) return "ok";
  const access = await caseAccessForUser(caller.headers, record.caseSlug, caller.user.id).catch(
    () => "not_found" as const
  );
  return caseAccessAllowed(access) ? "ok" : "blocked";
}

const IMPORT_LOOKUP_CONCURRENCY = 10;

/**
 * Search hits the caller may see. Hits without a matter link are shown to
 * staff only; hits whose import is linked to a matter the caller may not
 * read are removed. client_viewer → nothing.
 */
export async function filterDmsSearchHits<T extends Pick<DMSDocument, "id">>(
  caller: DmsAccessCaller,
  docs: T[]
): Promise<T[]> {
  if (!isDmsStaffRole(caller.user.role)) return [];
  const caseOf = new Map<string, string>();
  for (let i = 0; i < docs.length; i += IMPORT_LOOKUP_CONCURRENCY) {
    const batch = docs.slice(i, i + IMPORT_LOOKUP_CONCURRENCY);
    const records = await Promise.all(
      batch.map((d) => loadDmsImport(caller.headers, d.id).catch(() => null))
    );
    records.forEach((r, j) => {
      if (r?.caseSlug) caseOf.set(batch[j].id, r.caseSlug);
    });
  }
  if (caseOf.size === 0) return docs;
  const blocked = await blockedCasesForUser(caller.headers, [...caseOf.values()], caller.user.id);
  return docs.filter((d) => {
    const c = caseOf.get(d.id);
    return !c || !blocked.has(c);
  });
}
