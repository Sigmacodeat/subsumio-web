import { createHash, randomUUID } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import type { BrainPage } from "@/lib/types";

export type IntakeStatus =
  | "new"
  | "needs_info"
  | "conflict_check"
  | "accepted"
  | "rejected"
  | "converted";

export type ConflictCheckStatus = "pending" | "clear" | "conflict" | "needs_review";

export interface IntakeRequestFrontmatter {
  type: "intake_request";
  source: "whatsapp" | "portal" | "web" | "email" | "manual";
  status: IntakeStatus;
  client_name?: string;
  phone_hash?: string;
  email?: string;
  legal_area?: string;
  summary: string;
  missing_documents: string[];
  conflict_check_status: ConflictCheckStatus;
  converted_case_slug?: string;
  source_event_slug?: string;
  created_at: string;
  updated_at: string;
}

export interface IntakeRequestInput {
  source: IntakeRequestFrontmatter["source"];
  summary: string;
  clientName?: string;
  phoneHash?: string;
  email?: string;
  legalArea?: string;
  missingDocuments?: string[];
  sourceEventSlug?: string;
  status?: IntakeStatus;
  conflictCheckStatus?: ConflictCheckStatus;
}

function safeSlugPart(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "intake";
}

function inferMissingDocuments(summary: string): string[] {
  const lower = summary.toLowerCase();
  const docs: string[] = [];
  if (/\b(kündigung|kuendigung|bescheid|schreiben|vertrag)\b/.test(lower)) docs.push("ausgangsdokument");
  if (/\bvollmacht\b/.test(lower)) docs.push("vollmacht");
  if (/\bfrist|zugestellt|zustellung|ablauf\b/.test(lower)) docs.push("zustellnachweis");
  return [...new Set(docs)];
}

export function hashContact(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function buildIntakeRequest(input: IntakeRequestInput, at: Date = new Date()): {
  slug: string;
  title: string;
  content: string;
  frontmatter: IntakeRequestFrontmatter;
} {
  const created = at.toISOString();
  const summary = input.summary.trim();
  const suffix = safeSlugPart(input.clientName || input.email || input.phoneHash || summary.slice(0, 48) || randomUUID());
  const slug = `legal/intake/${created.slice(0, 10)}/${suffix}-${at.getTime()}`;
  const missingDocuments = input.missingDocuments ?? inferMissingDocuments(summary);
  const title = `Intake: ${input.clientName || summary.slice(0, 60) || "Neue Anfrage"}`;

  return {
    slug,
    title,
    content: summary,
    frontmatter: {
      type: "intake_request",
      source: input.source,
      status: input.status ?? "new",
      client_name: input.clientName,
      phone_hash: input.phoneHash,
      email: input.email,
      legal_area: input.legalArea,
      summary,
      missing_documents: missingDocuments,
      conflict_check_status: input.conflictCheckStatus ?? "pending",
      source_event_slug: input.sourceEventSlug,
      created_at: created,
      updated_at: created,
    },
  };
}

export async function writeIntakeRequest(
  brainId: string,
  intake: ReturnType<typeof buildIntakeRequest>,
  fetchImpl: typeof fetch = fetch
): Promise<{ slug: string }> {
  const res = await fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
    },
    body: JSON.stringify({
      slug: intake.slug,
      title: intake.title,
      type: "intake_request",
      content: intake.content,
      frontmatter: intake.frontmatter,
      merge: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `intake_write_failed:${res.status}`);
  }

  return { slug: intake.slug };
}

export function intakeFromPage(page: BrainPage): { slug: string; title: string; frontmatter: IntakeRequestFrontmatter; content?: string } | null {
  const fm = page.frontmatter as Partial<IntakeRequestFrontmatter> | undefined;
  if (fm?.type !== "intake_request") return null;
  return {
    slug: page.slug,
    title: page.title,
    content: page.content,
    frontmatter: fm as IntakeRequestFrontmatter,
  };
}
