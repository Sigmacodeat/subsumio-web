/**
 * Akte sicher anlegen — the one server-side path for creating a matter
 * outside the case wizard (CSV bulk import, WhatsApp intake flow, approved
 * `case_create` actions).
 *
 * A plain engine create (`POST /api/pages` without `merge`) replaces a stored
 * page completely, so every rule here exists to make sure a create can never
 * land on an existing matter:
 *
 *  - The slug is generated on the server: a readable part plus a random
 *    suffix. User input (Aktenzeichen, title) only shapes the readable part.
 *  - The slug is checked before writing, and the write itself is create-only
 *    (`if_absent`): the engine refuses a taken slug in the same statement
 *    that inserts the page, so a matter created in between is never
 *    replaced. A failed check writes nothing (fail closed).
 *  - The conflict check (§ 10 RAO / § 43a BRAO) runs on every party of the
 *    matter; a hit or an unavailable check writes nothing.
 *  - The engine's answer is checked; a rejected write is reported as an
 *    error, never as "created".
 */

import { randomBytes } from "node:crypto";
import { caseNumberKey } from "@/lib/legal/geschaeftszahl";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { readCurrentPage, type CurrentPageRead } from "@/lib/page-write-guards";
import { matterParties, requestConflictCheck, type ConflictSide } from "@/lib/conflict-gate";
import { caseContentWithAktenblatt } from "@/lib/aktenblatt";
import { brainIdFromEngineHeaders, emitCaseCreated } from "@/lib/webhook-dispatch";

export const CASE_SLUG_PREFIX = "legal/cases/";

export type CaseConflictMatch = { name: string; slug: string; type: string };

export type CaseWriteOutcome =
  | { ok: true }
  /** The slug was taken when the page was inserted; nothing was written. */
  | { ok: false; exists: true }
  | { ok: false; status: number; message: string };

export interface SafeCaseCreateDeps {
  /** Existence check for one slug: found / missing / error (unreadable). */
  readPage(slug: string): Promise<CurrentPageRead>;
  /**
   * Conflict check for one party with its side in the NEW matter. Returns only
   * the hits that block the matter (§ 10 RAO: client is an opponent elsewhere
   * or vice versa); throws when the check is unavailable.
   */
  conflictCheck(
    name: string,
    side: ConflictSide,
    ownContactSlugs: string[]
  ): Promise<CaseConflictMatch[]>;
  /**
   * Create the page on the engine — create-only: a taken slug must come back
   * as `exists`, never be replaced — and report the engine's answer.
   */
  writePage(page: {
    slug: string;
    title: string;
    type: "legal_case";
    content: string;
    frontmatter: Record<string, unknown>;
  }): Promise<CaseWriteOutcome>;
}

export interface SafeCaseCreateInput {
  title: string;
  content?: string;
  frontmatter: Record<string, unknown>;
  /** Readable part of the generated slug (Aktenzeichen, title). Never the slug on its own. */
  slugHint?: string;
  /**
   * A slug a reviewed proposal asked for. Used only when it lies under
   * `legal/cases/`, is well-formed and is still free — a taken slug is
   * reported as `exists`, never overwritten.
   */
  requestedSlug?: string;
  now?: Date;
}

export type SafeCaseCreateResult =
  | { status: "created"; slug: string }
  | { status: "exists"; slug: string }
  | { status: "conflict"; matches: CaseConflictMatch[] }
  | { status: "error"; code: string; message: string };

const SLUG_ATTEMPTS = 3;
const REQUESTED_SLUG_RE = /^legal\/cases\/[a-z0-9][a-z0-9._-]{0,159}$/;

export function caseSlugPart(input: string | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

/** `legal/cases/<readable>-<random>` — the random suffix keeps equal hints apart. */
export function generateCaseSlug(hint: string | undefined): string {
  const readable = caseSlugPart(hint) || "akte";
  return `${CASE_SLUG_PREFIX}${readable}-${randomBytes(4).toString("hex")}`;
}

/** Aktenzeichen compared the way people read them: case and spacing do not matter. */
/** Duplicate key of a case number (shared Geschäftszahl normalisation). */
export function normalizeCaseNumber(value: unknown): string {
  return caseNumberKey(value);
}

/**
 * Every party of the matter through the conflict check. Throws when a check
 * cannot be completed — the caller must not create the matter then.
 */
export async function runCaseConflictCheck(
  deps: Pick<SafeCaseCreateDeps, "conflictCheck">,
  frontmatter: Record<string, unknown>
): Promise<CaseConflictMatch[]> {
  const seen = new Set<string>();
  const matches: CaseConflictMatch[] = [];
  for (const party of matterParties(frontmatter)) {
    const key = `${party.side}:${party.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(...(await deps.conflictCheck(party.name, party.side, party.ownContactSlugs)));
  }
  return matches;
}

export async function createCaseSafely(
  deps: SafeCaseCreateDeps,
  input: SafeCaseCreateInput
): Promise<SafeCaseCreateResult> {
  const at = input.now ?? new Date();

  // 1. Slug: requested (validated, must be free) or generated (must be free).
  let slug: string | null = null;
  if (input.requestedSlug !== undefined) {
    const requested = input.requestedSlug.trim();
    if (!REQUESTED_SLUG_RE.test(requested) || requested.includes("..")) {
      return {
        status: "error",
        code: "invalid_case_slug",
        message: "Die vorgeschlagene Aktenkennung ist ungültig.",
      };
    }
    const read = await deps.readPage(requested);
    if (read.kind === "error") return guardUnavailable();
    if (read.kind === "found") return { status: "exists", slug: requested };
    slug = requested;
  } else {
    for (let attempt = 0; attempt < SLUG_ATTEMPTS && !slug; attempt++) {
      const candidate = generateCaseSlug(input.slugHint ?? input.title);
      const read = await deps.readPage(candidate);
      if (read.kind === "error") return guardUnavailable();
      if (read.kind === "missing") slug = candidate;
    }
    if (!slug) {
      return {
        status: "error",
        code: "case_slug_unavailable",
        message: "Es konnte keine freie Aktenkennung vergeben werden.",
      };
    }
  }

  // 2. Conflict check on every party — fail closed.
  let matches: CaseConflictMatch[];
  try {
    matches = await runCaseConflictCheck(deps, input.frontmatter);
  } catch {
    return {
      status: "error",
      code: "conflict_check_unavailable",
      message: "Kollisionsprüfung nicht verfügbar. Akte wurde nicht angelegt.",
    };
  }
  if (matches.length > 0) return { status: "conflict", matches };

  // 3. Write (create-only) and check the engine's answer. A generated slug
  //    that was taken in the meantime is replaced by a fresh one; a requested
  //    slug is reported as existing.
  const frontmatter: Record<string, unknown> = {
    ...input.frontmatter,
    type: "legal_case",
    conflict_status: "conflict_cleared",
    conflict_checked_at: at.toISOString(),
  };
  const content = caseContentWithAktenblatt(input.content ?? "", input.title, frontmatter);
  for (let attempt = 0; ; attempt++) {
    const outcome = await deps.writePage({
      slug,
      title: input.title,
      type: "legal_case",
      content,
      frontmatter,
    });
    if (outcome.ok) return { status: "created", slug };
    if (!("exists" in outcome)) {
      return {
        status: "error",
        code: "engine_write_failed",
        message: outcome.message || `Engine antwortete mit HTTP ${outcome.status}`,
      };
    }
    if (input.requestedSlug !== undefined) return { status: "exists", slug };
    if (attempt + 1 >= SLUG_ATTEMPTS) {
      return {
        status: "error",
        code: "case_slug_unavailable",
        message: "Es konnte keine freie Aktenkennung vergeben werden.",
      };
    }
    slug = generateCaseSlug(input.slugHint ?? input.title);
  }
}

function guardUnavailable(): SafeCaseCreateResult {
  return {
    status: "error",
    code: "guard_unavailable",
    message: "Bestand konnte vor dem Anlegen nicht geprüft werden. Akte wurde nicht angelegt.",
  };
}

/** Engine-backed dependencies for one request's headers. */
export function engineCaseCreateDeps(headers: Record<string, string>): SafeCaseCreateDeps {
  return {
    readPage: (slug) => readCurrentPage(ENGINE_URL, headers, slug),
    async conflictCheck(name, side, ownContactSlugs) {
      const result = await requestConflictCheck(headers, { name, side, ownContactSlugs });
      return result.matches
        .filter((m) => m.assessment === "critical")
        .map((m) => ({ name: m.matched_name || m.title, slug: m.slug, type: m.quelle ?? "case" }));
    },
    async writePage(page) {
      try {
        const res = await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ ...page, if_absent: true }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          // The matter landed in the brain these headers are scoped to.
          emitCaseCreated(brainIdFromEngineHeaders(headers), page);
          return { ok: true };
        }
        const upstream = (await res.json().catch(() => null)) as {
          error?: unknown;
          message?: unknown;
        } | null;
        if (res.status === 409 && upstream?.error === "page_exists") {
          return { ok: false, exists: true };
        }
        return {
          ok: false,
          status: res.status,
          message:
            typeof upstream?.message === "string" && upstream.message
              ? upstream.message
              : `Engine antwortete mit HTTP ${res.status}`,
        };
      } catch {
        return { ok: false, status: 0, message: "Engine nicht erreichbar" };
      }
    },
  };
}

/**
 * Existing matters by normalized Aktenzeichen (deleted ones left out). Throws
 * when the list cannot be read completely — the caller must not treat that
 * as "no matter exists".
 */
export async function loadCaseNumberIndex(
  headers: Record<string, string>
): Promise<Map<string, string>> {
  const cases = await listEnginePages(headers, "legal_case", 50_000, {
    strict: true,
    timeoutMs: 15_000,
  });
  const index = new Map<string, string>();
  for (const page of cases) {
    const key = normalizeCaseNumber(page.frontmatter?.case_number);
    if (key && !index.has(key)) index.set(key, page.slug);
  }
  return index;
}
