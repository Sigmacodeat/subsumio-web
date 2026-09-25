import type { SearchResult } from "@/lib/types";

/** Page type from the slug, for hits of engines that do not send one. */
export function inferTypeFromSlug(slug: string): string {
  if (slug.includes("legal/case") || slug.includes("cases/")) return "legal_case";
  if (slug.includes("legal/document") || slug.includes("documents/")) return "legal_document";
  if (slug.includes("legal/deadline") || slug.includes("deadlines/")) return "legal_deadline";
  if (slug.includes("invoice")) return "invoice";
  if (slug.includes("chat/whatsapp")) return "chat_inbox";
  if (slug.includes("contact") || slug.includes("client")) return "contact";
  if (slug.includes("note")) return "note";
  return "page";
}

/**
 * The page type of a search hit. The engine's `source` is the tenant/corpus
 * id (e.g. the firm or "law-at"), never a type — using it emptied every area
 * filter of the search page.
 */
export function searchHitType(hit: Pick<SearchResult, "slug" | "type">): string {
  return hit.type || inferTypeFromSlug(hit.slug);
}
