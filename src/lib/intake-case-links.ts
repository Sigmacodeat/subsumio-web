/**
 * Mandatsannahme → Akte: what the conversion carries over besides the
 * matter page itself (server only).
 *
 *  - The Aktenzeichen comes from the firm's one number range
 *    (allocateCaseNumber). It is reserved on the intake BEFORE the matter is
 *    written, so a retry after a half-finished conversion reuses the same
 *    number — and the same matter slug — instead of opening a second matter.
 *  - "Vollmacht unterschrieben" must be backed by a signed, unexpired power
 *    of attorney record, not by a checkbox.
 *  - Power of attorney, fee agreement and engagement letter were created
 *    while only the intake existed; they are moved to the new matter.
 */
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { allocateCaseNumber } from "@/lib/case-numbering";
import { readCurrentPage } from "@/lib/page-write-guards";
import { isPoAValid, type PowerOfAttorney } from "@/lib/power-of-attorney";
import type { IntakeAcceptanceWorkflow } from "@/lib/intake-acceptance";
import { logger } from "@/lib/logger";

const log = logger("lib/intake-case-links");

export class IntakeCaseNumberError extends Error {}

/**
 * The Aktenzeichen of the matter built from this intake: the one asked for,
 * else the one reserved by an earlier attempt, else the next number of the
 * firm's range — reserved on the intake first. Throws when a new number
 * cannot be reserved (the caller must not create the matter then).
 */
export async function resolveIntakeCaseNumber(
  headers: Record<string, string>,
  brainId: string,
  intake: { slug: string; title?: string; frontmatter: { reserved_case_number?: unknown } },
  requested?: string
): Promise<string> {
  const wanted = requested?.trim();
  if (wanted) return wanted;
  const reserved = intake.frontmatter.reserved_case_number;
  if (typeof reserved === "string" && reserved.trim()) return reserved.trim();

  let caseNumber: string;
  try {
    caseNumber = await allocateCaseNumber(headers, brainId);
  } catch (err) {
    throw new IntakeCaseNumberError(
      err instanceof Error ? err.message : "Aktenzeichen konnte nicht vergeben werden"
    );
  }
  const res = await enginePatchPage(
    headers,
    {
      slug: intake.slug,
      ...(intake.title ? { title: intake.title } : {}),
      type: "intake_request",
      frontmatter: { reserved_case_number: caseNumber },
    },
    { timeoutMs: 15_000 }
  ).catch(() => null);
  if (!res?.ok) {
    throw new IntakeCaseNumberError("Aktenzeichen konnte nicht reserviert werden");
  }
  return caseNumber;
}

export type PoaCheck = { ok: true } | { ok: false; code: string; message: string };

/**
 * A power of attorney marked "signed" in the acceptance must point to a
 * power-of-attorney record that is signed and not expired. Unreadable →
 * refused (fail closed).
 */
export async function checkSignedPoa(
  headers: Record<string, string>,
  workflow: Pick<IntakeAcceptanceWorkflow, "poa">,
  now: Date = new Date()
): Promise<PoaCheck> {
  const poa = workflow.poa;
  if (!poa.required || poa.status !== "signed") return { ok: true };
  const refuse = (message: string): PoaCheck => ({
    ok: false,
    code: "poa_not_signed",
    message: `Mandatsannahme unvollständig: ${message}`,
  });
  if (!poa.poa_slug) {
    return refuse("Die unterschriebene Vollmacht ist nicht verknüpft.");
  }
  const read = await readCurrentPage(ENGINE_URL, headers, poa.poa_slug);
  if (read.kind === "error") {
    return {
      ok: false,
      code: "poa_unreadable",
      message: "Die Vollmacht konnte nicht geprüft werden. Akte wurde nicht angelegt.",
    };
  }
  const record =
    read.kind === "found" ? (read.page.frontmatter as unknown as PowerOfAttorney) : null;
  const isPoaPage =
    read.kind === "found" &&
    (read.page.type === "power_of_attorney" || read.page.frontmatter?.type === "power_of_attorney");
  if (!record || !isPoaPage || !isPoAValid(record, now)) {
    return refuse("Die verknüpfte Vollmacht ist nicht unterschrieben oder abgelaufen.");
  }
  return { ok: true };
}

export interface RelinkResult {
  powers_of_attorney: string[];
  fee_agreements: string[];
  documents: string[];
  /** Records that could not be moved (named so the lawyer can fix them). */
  failed: string[];
}

async function moveToCase(
  headers: Record<string, string>,
  page: { slug: string; title?: string; type?: string },
  type: string,
  caseSlug: string
): Promise<boolean> {
  const res = await enginePatchPage(
    headers,
    {
      slug: page.slug,
      ...(page.title ? { title: page.title } : {}),
      type,
      frontmatter: { case_slug: caseSlug, updated_at: new Date().toISOString() },
    },
    { timeoutMs: 15_000 }
  ).catch(() => null);
  return Boolean(res?.ok);
}

/**
 * Move the records filed under the intake to the new matter. Best effort:
 * the matter exists already; what could not be moved is reported, never
 * silently dropped.
 */
export async function relinkIntakeRecords(
  headers: Record<string, string>,
  input: {
    intakeSlug: string;
    caseSlug: string;
    engagementLetterSlug?: string;
  }
): Promise<RelinkResult> {
  const out: RelinkResult = {
    powers_of_attorney: [],
    fee_agreements: [],
    documents: [],
    failed: [],
  };
  for (const [type, bucket] of [
    ["power_of_attorney", out.powers_of_attorney],
    ["fee_agreement", out.fee_agreements],
  ] as const) {
    let pages: Array<{ slug: string; title?: string; frontmatter?: Record<string, unknown> }>;
    try {
      pages = await listEnginePages(headers, type, 1_000, {
        strict: true,
        frontmatter: { case_slug: input.intakeSlug },
      });
    } catch {
      out.failed.push(type);
      continue;
    }
    for (const p of pages) {
      if (p.frontmatter?.case_slug !== input.intakeSlug) continue;
      if (await moveToCase(headers, p, type, input.caseSlug)) bucket.push(p.slug);
      else out.failed.push(p.slug);
    }
  }
  if (input.engagementLetterSlug) {
    const read = await readCurrentPage(ENGINE_URL, headers, input.engagementLetterSlug);
    if (read.kind === "found") {
      const ok = await moveToCase(
        headers,
        { slug: input.engagementLetterSlug, title: read.page.title as string | undefined },
        typeof read.page.type === "string" ? read.page.type : "legal_document",
        input.caseSlug
      );
      if (ok) out.documents.push(input.engagementLetterSlug);
      else out.failed.push(input.engagementLetterSlug);
    } else if (read.kind === "error") {
      out.failed.push(input.engagementLetterSlug);
    }
  }
  if (out.failed.length > 0) {
    log.warn("intake records not moved to the matter", {
      failed: out.failed.length,
    });
  }
  return out;
}
