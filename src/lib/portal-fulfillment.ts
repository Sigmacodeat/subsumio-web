import { randomUUID } from "node:crypto";
import type { DocumentRequestFrontmatter, DocumentRequestItem, DocumentRequestStatus } from "@/lib/document-requests";
import type { CommunicationEntry, DocumentEntry } from "@/lib/legal-types";

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(input: string): string[] {
  return normalize(input)
    .split(/\s+/)
    .filter((part) => part.length >= 3);
}

export function findDocumentRequestItemIndex(
  items: DocumentRequestItem[],
  filename: string,
  preferredKey?: string,
): number {
  if (preferredKey) {
    const exact = items.findIndex((item) => item.key === preferredKey);
    if (exact >= 0) return exact;
  }

  const file = normalize(filename);
  const scored = items
    .map((item, index) => {
      const haystack = `${normalize(item.key)} ${normalize(item.label)}`;
      const score = tokens(item.label)
        .concat(tokens(item.key))
        .reduce((sum, token) => sum + (file.includes(token) || haystack.includes(file) ? 1 : 0), 0);
      return { index, score, alreadyReceived: Boolean(item.received_document_slug) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => Number(a.alreadyReceived) - Number(b.alreadyReceived) || b.score - a.score);

  if (scored[0]) return scored[0].index;

  const firstOpenRequired = items.findIndex((item) => item.required && !item.received_document_slug);
  if (firstOpenRequired >= 0) return firstOpenRequired;
  return items.findIndex((item) => !item.received_document_slug);
}

export function fulfillDocumentRequestItems(
  frontmatter: DocumentRequestFrontmatter,
  uploadedDocumentSlug: string,
  filename: string,
  preferredKey?: string,
): {
  items: DocumentRequestItem[];
  status: DocumentRequestStatus;
  matchedItem?: DocumentRequestItem;
} {
  const items = [...frontmatter.items];
  const index = findDocumentRequestItemIndex(items, filename, preferredKey);
  if (index >= 0) {
    items[index] = { ...items[index], received_document_slug: uploadedDocumentSlug };
  }
  const required = items.filter((item) => item.required);
  const fulfilledRequired = required.every((item) => Boolean(item.received_document_slug));
  return {
    items,
    status: fulfilledRequired ? "fulfilled" : "partially_fulfilled",
    matchedItem: index >= 0 ? items[index] : undefined,
  };
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
  };
}

export function appendCaseDocument(documents: DocumentEntry[] | undefined, entry: DocumentEntry): DocumentEntry[] {
  const current = Array.isArray(documents) ? documents : [];
  if (current.some((doc) => (entry.slug && doc.slug === entry.slug) || (entry.url && doc.url === entry.url))) {
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
