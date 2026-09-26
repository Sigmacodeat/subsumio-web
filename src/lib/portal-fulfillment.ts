import { randomUUID } from "node:crypto";
import type {
  DocumentRequestFrontmatter,
  DocumentRequestItem,
  DocumentRequestStatus,
} from "@/lib/document-requests";
import type { CommunicationEntry, DocumentEntry } from "@/lib/legal-types";

/**
 * The item a portal upload belongs to: only the one the client explicitly
 * chose (its key). There is no guessing from the file name and no fallback
 * to "the first open item" — an unrelated file must never tick off a
 * requested document.
 */
export function findDocumentRequestItemIndex(
  items: DocumentRequestItem[],
  preferredKey?: string
): number {
  if (!preferredKey) return -1;
  return items.findIndex((item) => item.key === preferredKey);
}

/**
 * Records a client upload against the chosen item as SUBMITTED, not received.
 * Only the firm confirms an item as received (after checking the file); the
 * request status therefore does not change here.
 */
export function submitDocumentRequestItem(
  frontmatter: DocumentRequestFrontmatter,
  uploadedDocumentSlug: string,
  preferredKey: string | undefined,
  at: string = new Date().toISOString()
): {
  items: DocumentRequestItem[];
  status: DocumentRequestStatus;
  matchedItem?: DocumentRequestItem;
} {
  const items = [...frontmatter.items];
  const index = findDocumentRequestItemIndex(items, preferredKey);
  if (index >= 0 && !items[index].received_document_slug) {
    items[index] = {
      ...items[index],
      submitted_document_slug: uploadedDocumentSlug,
      submitted_at: at,
    };
    return { items, status: frontmatter.status, matchedItem: items[index] };
  }
  return { items, status: frontmatter.status };
}

export function buildPortalDocumentEntry(input: {
  slug: string;
  name: string;
  size?: number;
  matchedKind?: string;
  uploadedAt?: string;
}): DocumentEntry {
  return {
    id: randomUUID(),
    name: input.name,
    url: input.slug,
    slug: input.slug,
    uploadedAt: input.uploadedAt ?? new Date().toISOString(),
    size: input.size,
    source: "portal",
    kind: input.matchedKind,
    // The client uploaded it — they may keep seeing it in the portal.
    portal_visible: true,
  };
}

export function appendCaseDocument(
  documents: DocumentEntry[] | undefined,
  entry: DocumentEntry
): DocumentEntry[] {
  const current = Array.isArray(documents) ? documents : [];
  if (
    current.some(
      (doc) => (entry.slug && doc.slug === entry.slug) || (entry.url && doc.url === entry.url)
    )
  ) {
    return current;
  }
  return [...current, entry];
}

export function buildPortalUploadCommunication(input: {
  documentSlug: string;
  documentName: string;
  at?: string;
}): CommunicationEntry {
  return {
    id: randomUUID(),
    channel: "portal",
    direction: "incoming",
    subject: "Dokument hochgeladen",
    summary: input.documentName,
    timestamp: input.at ?? new Date().toISOString(),
    counterpart: "Mandant",
    attachment_slugs: [input.documentSlug],
  };
}
