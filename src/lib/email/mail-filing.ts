// Filing a fetched e-mail into its matter.
//
// Attachments take the exact same road as portal uploads: type/size scan,
// duplicate check scoped to the matter, engine upload, entry in the matter's
// document list, durable post-upload analysis. Deadlines found in the mail
// text become `suggested_deadlines` on the matter — suggestions a lawyer
// confirms in "Eingang prüfen", never entries in the Fristenbuch.

import { randomUUID } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { scanUploadWithDuplicateCheck } from "@/lib/upload-pipeline";
import { brainDuplicateStore } from "@/lib/duplicate-store";
import { appendCaseDocument } from "@/lib/portal-fulfillment";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";
import type { DetectedDeadline } from "@/lib/ai-deadline-detect";
import type { DocumentEntry } from "@/lib/legal-types";
import { logger } from "@/lib/logger";

const log = logger("mail-filing");

export interface MailAttachment {
  filename: string | null;
  contentType: string;
  size: number;
  content: Buffer;
  /** Inline images referenced from the HTML body (logos, signatures). */
  inline?: boolean;
}

export interface FilingResult {
  documents: number;
  skipped: number;
  suggestions: number;
}

interface SuggestedDeadline {
  title: string;
  due_date: string;
  urgency: string;
  source: string;
  source_quote: string;
  confirmed: boolean;
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MIN_IMAGE_BYTES = 30 * 1024;

/** Signature logos and tracking pixels are not documents. */
export function isFileableAttachment(
  a: Pick<MailAttachment, "contentType" | "size" | "inline" | "filename">
): boolean {
  if (a.size <= 0 || a.size > MAX_ATTACHMENT_BYTES) return false;
  const isImage = a.contentType.startsWith("image/");
  if (isImage && (a.inline || a.size < MIN_IMAGE_BYTES)) return false;
  if (/^application\/(pkcs7-signature|x-pkcs7-signature|pgp-signature)$/.test(a.contentType))
    return false;
  if (a.contentType === "text/calendar") return false;
  return true;
}

/** Only deadlines with a concrete date can be suggested. */
export function toSuggestedDeadlines(
  deadlines: DetectedDeadline[],
  mailLabel: string
): SuggestedDeadline[] {
  const out: SuggestedDeadline[] = [];
  for (const d of deadlines) {
    const due = d.fristResult?.fristende ?? d.date;
    if (!due || !/^\d{4}-\d{2}-\d{2}/.test(String(due))) continue;
    out.push({
      title: d.description || d.type,
      due_date: String(due).slice(0, 10),
      urgency: d.confidence === "high" ? "high" : "medium",
      source: mailLabel,
      source_quote: d.sourceSnippet.slice(0, 300),
      confirmed: false,
    });
  }
  return out;
}

export function mergeSuggestedDeadlines(
  existing: SuggestedDeadline[] | undefined,
  incoming: SuggestedDeadline[]
): SuggestedDeadline[] {
  const current = Array.isArray(existing) ? existing : [];
  const key = (s: SuggestedDeadline) => `${s.title.toLowerCase()}|${s.due_date}`;
  const seen = new Set(current.map(key));
  return [...current, ...incoming.filter((s) => !seen.has(key(s)) && seen.add(key(s)))];
}

/** Adds stored documents to the matter's document list. */
export async function appendDocumentsToMatter(
  brainId: string,
  caseSlug: string,
  entries: DocumentEntry[]
): Promise<boolean> {
  if (entries.length === 0) return true;
  const page = await getPage(brainId, caseSlug);
  if (!page) return false;
  let documents = (page.frontmatter ?? {}).documents as DocumentEntry[] | undefined;
  for (const e of entries) documents = appendCaseDocument(documents, e);
  const res = await enginePatchPage(engineHeadersForBrain(brainId), {
    slug: page.slug,
    frontmatter: { documents },
  });
  return res.ok;
}

async function getPage(brainId: string, slug: string) {
  const res = await fetch(
    `${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
    { headers: engineHeadersForBrain(brainId), signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return null;
  return (await res.json()) as {
    slug: string;
    title: string;
    frontmatter?: Record<string, unknown>;
  };
}

/**
 * Stores one file in a matter the way the upload page does: type/size scan,
 * duplicate check, engine upload, background analysis. Returns the document
 * entry for the matter's list, or null when the file was not stored. Shared by
 * mail attachments and signed documents.
 */
export async function uploadFileToMatter(
  brainId: string,
  caseSlug: string,
  att: MailAttachment,
  source: "email" | "docusign" = "email"
): Promise<DocumentEntry | null> {
  const name = att.filename?.trim() || `anhang-${randomUUID().slice(0, 8)}`;
  const file = new File([new Uint8Array(att.content)], name, { type: att.contentType });
  const scan = await scanUploadWithDuplicateCheck(
    file,
    brainDuplicateStore(engineHeadersForBrain(brainId), caseSlug)
  );
  if (!scan.ok) return null; // wrong type, too large or already in this matter

  const form = new FormData();
  form.append("file", new File([scan.buffer], scan.cleanName, { type: scan.mimeType }));
  form.append("title", scan.cleanName);
  form.append("source", source);
  form.append("tags", JSON.stringify([caseSlug, source]));
  form.append("case_slug", caseSlug);
  const res = await fetch(`${ENGINE_URL}/api/upload`, {
    method: "POST",
    headers: engineHeadersForBrain(brainId),
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) return null;
  const upload = (await res.json().catch(() => ({}))) as { slug?: string; title?: string };
  if (!upload.slug) return null;

  const now = new Date().toISOString();
  await enginePatchPage(engineHeadersForBrain(brainId), {
    slug: upload.slug,
    frontmatter: { analysis_status: "pending", analysis_queued_at: now },
  });
  await enqueueAllPostUploadTasks({
    doc_slug: upload.slug,
    case_slug: caseSlug,
    brain_id: brainId,
    doc_title: upload.title || scan.cleanName,
    doc_size: scan.buffer.byteLength,
    uploaded_at: now,
  }).catch((err) =>
    log.warn("post-upload enqueue failed", err instanceof Error ? err.message : String(err))
  );

  return {
    id: randomUUID(),
    name: upload.title || scan.cleanName,
    url: upload.slug,
    slug: upload.slug,
    uploadedAt: now,
    size: scan.buffer.byteLength,
    source,
    // Internal until a lawyer releases it to the portal.
    portal_visible: false,
  };
}

export async function fileMailIntoMatter(input: {
  brainId: string;
  caseSlug: string;
  mailLabel: string;
  attachments: MailAttachment[];
  deadlines: DetectedDeadline[];
}): Promise<FilingResult> {
  const result: FilingResult = { documents: 0, skipped: 0, suggestions: 0 };
  const fileable = input.attachments.filter(isFileableAttachment);
  result.skipped = input.attachments.length - fileable.length;

  const entries: DocumentEntry[] = [];
  for (const att of fileable) {
    try {
      const entry = await uploadFileToMatter(input.brainId, input.caseSlug, att);
      if (entry) entries.push(entry);
      else result.skipped += 1;
    } catch (err) {
      result.skipped += 1;
      log.warn("attachment upload failed", err instanceof Error ? err.message : String(err));
    }
  }

  const suggestions = toSuggestedDeadlines(input.deadlines, input.mailLabel);
  if (entries.length === 0 && suggestions.length === 0) return result;

  const page = await getPage(input.brainId, input.caseSlug);
  if (!page) return result;
  const fm = page.frontmatter ?? {};
  let documents = fm.documents as DocumentEntry[] | undefined;
  for (const e of entries) documents = appendCaseDocument(documents, e);
  const before = Array.isArray(fm.suggested_deadlines) ? fm.suggested_deadlines.length : 0;
  const merged = mergeSuggestedDeadlines(
    fm.suggested_deadlines as SuggestedDeadline[] | undefined,
    suggestions
  );

  const patched = await enginePatchPage(engineHeadersForBrain(input.brainId), {
    slug: page.slug,
    frontmatter: { documents, suggested_deadlines: merged },
  });
  if (patched.ok) {
    result.documents = entries.length;
    result.suggestions = merged.length - before;
  }
  return result;
}
