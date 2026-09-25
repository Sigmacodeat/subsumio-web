import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

/**
 * Document page types the Dokumentenablage (vault) lists. Loading them by type
 * (paged through the listing) instead of "the newest pages of any type, then
 * filter" is what makes the list complete — a firm's deadlines, time entries
 * and tasks used to crowd the documents out of a single capped listing.
 */
export const VAULT_DOC_TYPES = [
  "document",
  "legal_document",
  "legal_contract",
  "court_decision",
  "evidence",
] as const;

/** Per document type; reaching it means the list is cut (show the notice). */
export const VAULT_TYPE_MAX = 2_000;

export async function listVaultPages(): Promise<{ pages: BrainPage[]; capped: boolean }> {
  const perType = await Promise.all(
    VAULT_DOC_TYPES.map((type) => api.brain.listAllPages({ type, max: VAULT_TYPE_MAX }))
  );
  const seen = new Set<string>();
  const pages: BrainPage[] = [];
  for (const page of perType.flat()) {
    if (seen.has(page.slug)) continue;
    seen.add(page.slug);
    pages.push(page);
  }
  return { pages, capped: perType.some((list) => list.length >= VAULT_TYPE_MAX) };
}
