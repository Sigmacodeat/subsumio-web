import { randomUUID } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { signPortalToken } from "@/lib/portal-token";
import type { BrainPage } from "@/lib/types";

export type DocumentRequestStatus =
  | "draft"
  | "sent"
  | "partially_fulfilled"
  | "fulfilled"
  | "expired";

export interface DocumentRequestItem {
  key: string;
  label: string;
  required: boolean;
  received_document_slug?: string;
}

export interface DocumentRequestFrontmatter {
  type: "document_request";
  case_slug: string;
  recipient_role: "client" | "lawyer" | "assistant" | "other";
  channel: "whatsapp" | "portal" | "email" | "manual";
  status: DocumentRequestStatus;
  items: DocumentRequestItem[];
  portal_token_id?: string;
  portal_url?: string;
  source_event_slug?: string;
  message_draft?: string;
  created_at: string;
  sent_at?: string;
  updated_at: string;
}

export interface DocumentRequestInput {
  brainId?: string;
  caseSlug: string;
  items: Array<string | Partial<DocumentRequestItem>>;
  channel?: DocumentRequestFrontmatter["channel"];
  recipientRole?: DocumentRequestFrontmatter["recipient_role"];
  status?: DocumentRequestStatus;
  sourceEventSlug?: string;
  messageDraft?: string;
  includePortalLink?: boolean;
}

function safeSlugPart(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || "document-request"
  );
}

function normalizeItem(item: string | Partial<DocumentRequestItem>): DocumentRequestItem {
  if (typeof item === "string") {
    const label = item.trim();
    return { key: safeSlugPart(label), label, required: true };
  }
  const label = item.label?.trim() || item.key?.trim() || "Unterlage";
  return {
    key: safeSlugPart(item.key || label),
    label,
    required: item.required ?? true,
    received_document_slug: item.received_document_slug,
  };
}

export function extractRequestedDocumentItems(text: string): DocumentRequestItem[] {
  const lower = text.toLowerCase();
  const candidates: Array<[RegExp, string, string]> = [
    [/\bvollmacht\b/, "vollmacht", "Vollmacht"],
    [/\bbescheid\b/, "bescheid", "Bescheid"],
    [/\bkündigung|\bkuendigung/, "kuendigung", "Kündigung"],
    [/\bvertrag\b/, "vertrag", "Vertrag"],
    [/\bzustell(?:nachweis|ung)?\b/, "zustellnachweis", "Zustellnachweis"],
    [/\b(?:ausweis|id)\b/, "ausweis", "Ausweis"],
  ];
  const items = candidates
    .filter(([re]) => re.test(lower))
    .map(([, key, label]) => ({ key, label, required: true }));
  return items.length ? items : [{ key: "unterlagen", label: "Unterlagen", required: true }];
}

export async function buildDocumentRequest(
  input: DocumentRequestInput,
  at: Date = new Date()
): Promise<{
  slug: string;
  title: string;
  content: string;
  frontmatter: DocumentRequestFrontmatter;
}> {
  const created = at.toISOString();
  const items = input.items.map(normalizeItem);
  const stamp = at.getTime();
  const casePart = safeSlugPart(input.caseSlug.split("/").pop() || input.caseSlug || randomUUID());
  const slug = `legal/document-requests/${casePart}-${stamp}`;
  let portalUrl: string | undefined;
  let portalTokenId: string | undefined;

  if (input.includePortalLink) {
    const token = await signPortalToken(input.caseSlug, undefined, input.brainId);
    portalTokenId = token.slice(-12);
    portalUrl = `/portal/${token}`;
  }

  const itemList = items
    .map((item) => `- ${item.label}${item.required ? " (erforderlich)" : ""}`)
    .join("\n");
  const messageDraft =
    input.messageDraft ?? `Bitte laden Sie folgende Unterlagen hoch:\n${itemList}`;

  return {
    slug,
    title: `Dokumentenanfrage: ${input.caseSlug}`,
    content: messageDraft,
    frontmatter: {
      type: "document_request",
      case_slug: input.caseSlug,
      recipient_role: input.recipientRole ?? "client",
      channel: input.channel ?? "whatsapp",
      status: input.status ?? "draft",
      items,
      portal_token_id: portalTokenId,
      portal_url: portalUrl,
      source_event_slug: input.sourceEventSlug,
      message_draft: messageDraft,
      created_at: created,
      updated_at: created,
    },
  };
}

export async function writeDocumentRequest(
  brainId: string,
  request: Awaited<ReturnType<typeof buildDocumentRequest>>,
  fetchImpl: typeof fetch = fetch
): Promise<{ slug: string }> {
  const res = await fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
    },
    body: JSON.stringify({
      slug: request.slug,
      title: request.title,
      type: "document_request",
      content: request.content,
      frontmatter: request.frontmatter,
      merge: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `document_request_write_failed:${res.status}`);
  }

  return { slug: request.slug };
}

export function documentRequestFromPage(page: BrainPage): {
  slug: string;
  title: string;
  frontmatter: DocumentRequestFrontmatter;
  content?: string;
} | null {
  const fm = page.frontmatter as Partial<DocumentRequestFrontmatter> | undefined;
  if (fm?.type !== "document_request") return null;
  return {
    slug: page.slug,
    title: page.title,
    content: page.content,
    frontmatter: fm as DocumentRequestFrontmatter,
  };
}
