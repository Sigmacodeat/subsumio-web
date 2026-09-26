/**
 * Server-side decision on an AI suggestion for a matter: a party
 * (`suggested_parties[i]`) or an Aktendatum (`suggested_case_fields[i]`).
 * Same discipline as deadline-decision.ts — the only path from a suggestion
 * into the matter's real fields.
 *
 * Party approval:
 *  1. Mandant/Gegner go through the firm's conflict check (§ 10 Abs 1 RAO)
 *     BEFORE anything is written — the existing gate (conflict-gate.ts), same
 *     rules as a party change on the matter: a check that cannot run blocks
 *     (503), a blocking hit needs a lawyer's/admin's justified waiver.
 *  2. A legal_contact is linked (the one the user chose, or an existing
 *     contact of that name) or created.
 *  3. The party is placed into the matter without overwriting: an existing
 *     client/opponent/court stays, a further opponent is added.
 *  4. The suggestion list is rewritten as a whole array with the decision.
 *
 * Aktendatum approval sets exactly the field the lawyer accepted.
 */
import { ENGINE_URL } from "@/lib/engine";
import { encodeSlugPath } from "@/lib/utils";
import {
  canWaiveConflict,
  checkPartiesConflicts,
  type ConflictSide,
  type MatterConflictOutcome,
} from "@/lib/conflict-gate";
import { normalizeName, RESOLVED_PARTY_ROLES } from "@/lib/legal/case-suggestions";

type FetchFn = typeof fetch;

export type SuggestionDecisionResult =
  | {
      ok: true;
      alreadyDecided: boolean;
      contactSlug?: string | null;
      /** Matter fields that were set (empty when e.g. a client already existed). */
      applied: string[];
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      conflictWarning?: MatterConflictOutcome;
    };

function fail(
  status: number,
  code: string,
  message: string,
  conflictWarning?: MatterConflictOutcome
): SuggestionDecisionResult {
  return { ok: false, status, code, message, ...(conflictWarning ? { conflictWarning } : {}) };
}

interface LoadedCase {
  fm: Record<string, unknown>;
}

async function loadCase(
  headers: Record<string, string>,
  caseSlug: string,
  fetchFn: FetchFn
): Promise<LoadedCase | SuggestionDecisionResult> {
  const res = await fetchFn(`${ENGINE_URL}/api/pages/${encodeSlugPath(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return fail(404, "case_not_found", "Akte nicht gefunden.");
  if (!res.ok) return fail(502, "engine_unavailable", "Akte konnte nicht geladen werden.");
  const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
  const fm = page.frontmatter ?? {};
  if (fm.status === "archived") return fail(409, "case_archived", "Die Akte ist archiviert.");
  return { fm };
}

async function writeCase(
  headers: Record<string, string>,
  caseSlug: string,
  frontmatter: Record<string, unknown>,
  fetchFn: FetchFn
): Promise<boolean> {
  const res = await fetchFn(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ slug: caseSlug, merge: true, frontmatter }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

function nextVersion(fm: Record<string, unknown>): number {
  const v = Number(fm.version);
  return (Number.isFinite(v) ? v : 0) + 1;
}

function translit(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function hash36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

type ContactRole = "client" | "opponent" | "lawyer" | "court" | "other";

const CONTACT_ROLE: Record<string, ContactRole> = {
  mandant: "client",
  gegner: "opponent",
  gegnervertreter: "lawyer",
  vertreter: "lawyer",
  gericht: "court",
  behoerde: "court",
  sonstige: "other",
};

const CONFLICT_SIDE: Record<string, ConflictSide | undefined> = {
  mandant: "client",
  gegner: "opponent",
};

async function getPage(
  headers: Record<string, string>,
  slug: string,
  fetchFn: FetchFn
): Promise<{
  status: number;
  page?: { type?: string; title?: string; frontmatter?: Record<string, unknown> };
}> {
  const res = await fetchFn(`${ENGINE_URL}/api/pages/${encodeSlugPath(slug)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { status: res.status };
  return { status: 200, page: (await res.json()) as never };
}

/** Link the chosen contact, reuse one of that name, or create it. */
async function linkOrCreateContact(
  headers: Record<string, string>,
  input: {
    name: string;
    role: ContactRole;
    caseSlug: string;
    contactSlug?: string;
    reviewer: string;
  },
  fetchFn: FetchFn
): Promise<{ slug: string } | SuggestionDecisionResult> {
  if (input.contactSlug) {
    const got = await getPage(headers, input.contactSlug, fetchFn);
    const type = got.page?.type ?? got.page?.frontmatter?.type;
    if (got.status !== 200 || (type !== "legal_contact" && type !== "contact")) {
      return fail(404, "contact_not_found", "Der gewählte Kontakt wurde nicht gefunden.");
    }
    return { slug: input.contactSlug };
  }
  const base = `legal/contacts/${translit(input.name) || "kontakt"}`;
  for (const slug of [base, `${base}-${hash36(normalizeName(input.name))}`]) {
    const got = await getPage(headers, slug, fetchFn);
    if (got.status === 200) {
      const existingName = got.page?.frontmatter?.name ?? got.page?.title;
      if (normalizeName(existingName) === normalizeName(input.name)) return { slug };
      continue; // same slug, different person → try the hashed slug
    }
    if (got.status !== 404) {
      return fail(502, "engine_unavailable", "Kontakt konnte nicht geprüft werden.");
    }
    const res = await fetchFn(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        slug,
        title: input.name,
        type: "legal_contact",
        content: "",
        frontmatter: {
          type: "legal_contact",
          role: input.role,
          name: input.name,
          source: "ai_document_analysis",
          source_case_slug: input.caseSlug,
          created_by: input.reviewer,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return fail(502, "contact_write_failed", "Kontakt konnte nicht angelegt werden.");
    return { slug };
  }
  return fail(409, "contact_slug_taken", "Für diesen Namen existieren bereits andere Kontakte.");
}

function opponentNames(fm: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof fm.opponent_name === "string" && fm.opponent_name.trim()) out.push(fm.opponent_name);
  if (Array.isArray(fm.additional_opponents)) {
    for (const o of fm.additional_opponents) {
      if (typeof o === "string") out.push(o);
      else if (o && typeof (o as { name?: unknown }).name === "string")
        out.push((o as { name: string }).name);
    }
  }
  return out;
}

/** Matter fields for the accepted party — never overwriting what is set. */
export function partyPlacement(
  fm: Record<string, unknown>,
  role: string,
  name: string,
  contactSlug: string
): { patch: Record<string, unknown>; applied: string[] } {
  const patch: Record<string, unknown> = {};
  const empty = (k: string) => typeof fm[k] !== "string" || !(fm[k] as string).trim();
  if (role === "mandant" && empty("client_name")) {
    patch.client_name = name;
    patch.client_slug = contactSlug;
  } else if (role === "gegner") {
    if (empty("opponent_name")) {
      patch.opponent_name = name;
      const slugs = Array.isArray(fm.opponent_slugs) ? (fm.opponent_slugs as string[]) : [];
      patch.opponent_slugs = [...new Set([...slugs, contactSlug])];
    } else if (!opponentNames(fm).some((n) => normalizeName(n) === normalizeName(name))) {
      const extra = Array.isArray(fm.additional_opponents) ? fm.additional_opponents : [];
      patch.additional_opponents = [...extra, { name, slug: contactSlug }];
    }
  } else if (
    (role === "gegnervertreter" || role === "vertreter") &&
    empty("opposing_counsel_name")
  ) {
    patch.opposing_counsel_name = name;
    patch.opposing_counsel_slug = contactSlug;
  } else if ((role === "gericht" || role === "behoerde") && empty("court_name")) {
    patch.court_name = name;
    patch.court_slug = contactSlug;
  }
  return {
    patch,
    applied: Object.keys(patch).filter((k) => !k.endsWith("_slug") && !k.endsWith("_slugs")),
  };
}

export interface PartyDecisionInput {
  caseSlug: string;
  index: number;
  action: "approve" | "reject";
  reviewer: string;
  reviewerId?: string;
  reviewerRole?: string | null;
  /** Side chosen by the lawyer; needed when the analysis only knows Kläger/Beklagter. */
  role?: string;
  /** Contact the lawyer created/chose in the dialog. */
  contactSlug?: string;
  conflictWaiverReason?: string;
}

export async function decideSuggestedParty(
  headers: Record<string, string>,
  input: PartyDecisionInput,
  deps: { fetchFn?: FetchFn; conflictCheck?: typeof checkPartiesConflicts } = {}
): Promise<SuggestionDecisionResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const conflictCheck = deps.conflictCheck ?? checkPartiesConflicts;
  const loaded = await loadCase(headers, input.caseSlug, fetchFn);
  if ("ok" in loaded) return loaded;
  const { fm } = loaded;
  const list = Array.isArray(fm.suggested_parties)
    ? (fm.suggested_parties as Array<Record<string, unknown>>)
    : null;
  if (!list) return fail(409, "suggestions_corrupt", "Die Parteivorschläge sind nicht lesbar.");
  const suggestion = list[input.index];
  if (!suggestion || typeof suggestion !== "object") {
    return fail(
      404,
      "suggestion_not_found",
      "Parteivorschlag nicht gefunden (evtl. bereits bearbeitet)."
    );
  }
  const prior = suggestion.review_status;
  if (prior === "approved" || prior === "rejected") {
    if ((prior === "approved") === (input.action === "approve")) {
      return {
        ok: true,
        alreadyDecided: true,
        contactSlug: typeof suggestion.contact_slug === "string" ? suggestion.contact_slug : null,
        applied: [],
      };
    }
    return fail(409, "already_decided", "Dieser Vorschlag wurde bereits anders entschieden.");
  }

  const now = new Date().toISOString();
  const rewrite = (entry: Record<string, unknown>) =>
    list.map((sp, i) => (i === input.index ? entry : sp));

  if (input.action === "reject") {
    const ok = await writeCase(
      headers,
      input.caseSlug,
      {
        suggested_parties: rewrite({
          ...suggestion,
          confirmed: true,
          review_status: "rejected",
          reviewed_by: input.reviewer,
          reviewed_at: now,
        }),
        version: nextVersion(fm),
      },
      fetchFn
    );
    if (!ok)
      return fail(502, "case_write_failed", "Die Entscheidung konnte nicht gespeichert werden.");
    return { ok: true, alreadyDecided: false, applied: [] };
  }

  const name = String(suggestion.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return fail(400, "name_missing", "Der Vorschlag enthält keinen Namen.");
  const role = String(input.role ?? suggestion.role ?? "");
  if (!RESOLVED_PARTY_ROLES.has(role)) {
    return fail(
      400,
      "role_required",
      "Bitte festlegen, ob die Partei Mandant oder Gegner ist, bevor sie übernommen wird."
    );
  }

  // 1. Conflict check before any write (Mandant/Gegner only).
  let conflict: MatterConflictOutcome | undefined;
  const side = CONFLICT_SIDE[role];
  const waiver = input.conflictWaiverReason?.trim() ?? "";
  if (side) {
    try {
      conflict = await conflictCheck(
        headers,
        [{ name, side, ownContactSlugs: input.contactSlug ? [input.contactSlug] : [] }],
        { selfCaseSlug: input.caseSlug }
      );
    } catch {
      return fail(
        503,
        "conflict_check_unavailable",
        "Kollisionsprüfung nicht verfügbar. Die Partei wurde nicht übernommen."
      );
    }
    if (conflict.blocking.length > 0) {
      if (!waiver) {
        return fail(
          409,
          "conflict_detected",
          "Interessenkonflikt: Die Partei steht in einer bestehenden Akte auf der Gegenseite. Sie wurde nicht übernommen.",
          conflict
        );
      }
      if (!canWaiveConflict(input.reviewerRole)) {
        return fail(
          403,
          "conflict_waiver_unauthorized",
          "Konflikt-Freigabe erfordert die Rolle Anwalt oder Admin."
        );
      }
    }
  }

  // 2. Contact.
  const contact = await linkOrCreateContact(
    headers,
    {
      name,
      role: CONTACT_ROLE[role] ?? "other",
      caseSlug: input.caseSlug,
      contactSlug: input.contactSlug,
      reviewer: input.reviewer,
    },
    fetchFn
  );
  if ("ok" in contact) return contact;

  // 3. Placement + 4. decision, one write.
  const { patch, applied } = partyPlacement(fm, role, name, contact.slug);
  const conflictStamps: Record<string, unknown> = {};
  if (conflict?.checked) {
    if (conflict.blocking.length > 0) {
      Object.assign(conflictStamps, {
        conflict_status: "conflict_waived",
        conflict_waiver_reason: waiver,
        conflict_waived_by: input.reviewer,
        ...(input.reviewerId ? { conflict_waived_by_id: input.reviewerId } : {}),
        conflict_waived_by_role: input.reviewerRole ?? undefined,
        conflict_waived_at: now,
      });
    } else if (fm.conflict_status !== "conflict_waived") {
      conflictStamps.conflict_status = "conflict_cleared";
    }
  }
  const ok = await writeCase(
    headers,
    input.caseSlug,
    {
      ...patch,
      ...conflictStamps,
      suggested_parties: rewrite({
        ...suggestion,
        role,
        confirmed: true,
        review_status: "approved",
        contact_slug: contact.slug,
        reviewed_by: input.reviewer,
        reviewed_at: now,
        ...(conflict?.checked
          ? {
              conflict_check: { severity: conflict.severity, waived: conflict.blocking.length > 0 },
            }
          : {}),
      }),
      version: nextVersion(fm),
    },
    fetchFn
  );
  if (!ok) {
    return fail(
      502,
      "case_write_failed",
      "Der Kontakt wurde angelegt, die Akte konnte aber nicht aktualisiert werden. Bitte erneut versuchen."
    );
  }
  return { ok: true, alreadyDecided: false, contactSlug: contact.slug, applied };
}

// ── Aktendaten ─────────────────────────────────────────────────────────

const CASE_FIELDS = new Set(["court_name", "case_number", "dispute_value"]);

export interface CaseFieldDecisionInput {
  caseSlug: string;
  index: number;
  action: "approve" | "reject";
  reviewer: string;
  /** Value corrected by the lawyer; defaults to the suggested value. */
  value?: string | number;
}

export async function decideSuggestedCaseField(
  headers: Record<string, string>,
  input: CaseFieldDecisionInput,
  fetchFn: FetchFn = fetch
): Promise<SuggestionDecisionResult> {
  const loaded = await loadCase(headers, input.caseSlug, fetchFn);
  if ("ok" in loaded) return loaded;
  const { fm } = loaded;
  const list = Array.isArray(fm.suggested_case_fields)
    ? (fm.suggested_case_fields as Array<Record<string, unknown>>)
    : null;
  if (!list)
    return fail(409, "suggestions_corrupt", "Die Aktendaten-Vorschläge sind nicht lesbar.");
  const suggestion = list[input.index];
  if (!suggestion || typeof suggestion !== "object") {
    return fail(
      404,
      "suggestion_not_found",
      "Vorschlag nicht gefunden (evtl. bereits bearbeitet)."
    );
  }
  const field = String(suggestion.field ?? "");
  if (!CASE_FIELDS.has(field)) return fail(409, "suggestions_corrupt", "Unbekanntes Aktenfeld.");
  const prior = suggestion.review_status;
  if (prior === "approved" || prior === "rejected") {
    if ((prior === "approved") === (input.action === "approve")) {
      return { ok: true, alreadyDecided: true, applied: [] };
    }
    return fail(409, "already_decided", "Dieser Vorschlag wurde bereits anders entschieden.");
  }
  const now = new Date().toISOString();
  const rewrite = (entry: Record<string, unknown>) =>
    list.map((s, i) => (i === input.index ? entry : s));

  if (input.action === "reject") {
    const ok = await writeCase(
      headers,
      input.caseSlug,
      {
        suggested_case_fields: rewrite({
          ...suggestion,
          confirmed: true,
          review_status: "rejected",
          reviewed_by: input.reviewer,
          reviewed_at: now,
        }),
        version: nextVersion(fm),
      },
      fetchFn
    );
    if (!ok)
      return fail(502, "case_write_failed", "Die Entscheidung konnte nicht gespeichert werden.");
    return { ok: true, alreadyDecided: false, applied: [] };
  }

  const raw = input.value ?? suggestion.value;
  let value: string | number;
  if (field === "dispute_value") {
    const n =
      typeof raw === "number" ? raw : Number(String(raw).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      return fail(400, "value_invalid", "Bitte einen gültigen Streitwert angeben.");
    }
    value = Math.round(n * 100) / 100;
  } else {
    value = String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!value || value.length > 200)
      return fail(400, "value_invalid", "Bitte einen gültigen Wert angeben.");
  }
  const ok = await writeCase(
    headers,
    input.caseSlug,
    {
      [field]: value,
      suggested_case_fields: rewrite({
        ...suggestion,
        confirmed: true,
        review_status: "approved",
        accepted_value: value,
        previous_value: fm[field] ?? null,
        reviewed_by: input.reviewer,
        reviewed_at: now,
      }),
      version: nextVersion(fm),
    },
    fetchFn
  );
  if (!ok) return fail(502, "case_write_failed", "Die Akte konnte nicht aktualisiert werden.");
  return { ok: true, alreadyDecided: false, applied: [field] };
}
