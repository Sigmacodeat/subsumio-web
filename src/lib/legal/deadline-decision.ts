/**
 * Server-side decision on an AI-suggested deadline (`suggested_deadlines[i]`
 * on a legal_case page). This is the ONLY path that turns a suggestion into a
 * Fristenbuch entry — every UI (Review-Inbox, Akte → Fristen, Strategie,
 * MatterReviewInbox) calls it through POST /api/review-inbox/deadline-decision.
 *
 * Invariants (a lost Frist is a malpractice case):
 *  1. The `legal_deadline` page is written FIRST, and its engine response is
 *     checked. Only then is the suggestion marked approved. A failure after
 *     step 1 leaves a real deadline plus a still-open suggestion — the safe
 *     side; a retry is idempotent because the deadline slug is deterministic.
 *  2. The suggestion list is rewritten as a whole ARRAY. The engine merges
 *     frontmatter shallowly, so an index-keyed object patch would replace the
 *     entire list with an object and silently drop every other suggestion.
 *  3. The date the lawyer confirms may differ from the AI's date; both are
 *     kept (`due_date` + `ai_due_date`) for the audit trail.
 */

import { ENGINE_URL } from "@/lib/engine";
import { encodeSlugPath } from "@/lib/utils";
import { berechneFristAuto, resolveFristArt } from "@/lib/legal/frist-engine";
import { berechneFristArtDE, fristArtDE } from "@/lib/legal/frist-engine-de";

export type DeadlineDecisionAction = "approve" | "reject";

export interface DeadlineDecisionInput {
  caseSlug: string;
  index: number;
  action: DeadlineDecisionAction;
  /** Lawyer-confirmed date (YYYY-MM-DD). Defaults to the suggestion's date. */
  dueDate?: string;
  /** Optional edited title. */
  title?: string;
  reviewer: string;
}

export type DeadlineDecisionResult =
  | {
      ok: true;
      deadlineSlug: string | null;
      alreadyDecided: boolean;
      /** Engine re-check of the confirmed date (only when Zustelldatum and
       *  Fristart of the suggestion are known). */
      engineCheck?: EngineCheck;
    }
  | { ok: false; status: number; code: string; message: string };

type FetchFn = typeof fetch;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Deterministic, so a retried approval never creates a second deadline. */
export function deadlineSlugForSuggestion(
  caseSlug: string,
  suggestion: Record<string, unknown>,
  index: number
): string {
  const tail = (caseSlug.split("/").pop() ?? "akte").replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
  const basis = `${caseSlug}|${index}|${String(suggestion.title ?? "")}|${String(
    suggestion.suggested_at ?? suggestion.source ?? ""
  )}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `legal/deadlines/${tail.toLowerCase()}-sd${index}-${(h >>> 0).toString(36)}`;
}

export interface EngineCheck {
  /** Fristende as the deterministic engine computes it. */
  engineDueDate: string;
  /** The confirmed date equals the engine's date. */
  matches: boolean;
  /** Human-readable result, stored with the deadline and shown as warning. */
  message: string;
  rechtsgrundlage?: string;
  notfrist: boolean;
  vorfrist?: string;
}

/**
 * Gegenrechnung: recomputes the suggestion's deadline from its Zustelldatum
 * and Fristart with the engine and compares it with the confirmed date. The
 * suggestion's Zustelldatum is the effective service day (ERV fiction already
 * applied). Returns null when the suggestion carries no such facts.
 */
export function engineGegenrechnung(
  suggestion: Record<string, unknown>,
  confirmedDate: string
): EngineCheck | null {
  const zustellung =
    typeof suggestion.zustellungsdatum === "string" ? suggestion.zustellungsdatum : "";
  const art = typeof suggestion.frist_art === "string" ? suggestion.frist_art : "";
  if (!art || !isValidIsoDate(zustellung)) return null;
  try {
    if (suggestion.rechtsraum === "DE") {
      const artDE = fristArtDE(art);
      if (!artDE) return null;
      const r = berechneFristArtDE(art, zustellung);
      const matches = r.fristende === confirmedDate;
      return {
        engineDueDate: r.fristende,
        matches,
        rechtsgrundlage: artDE.rechtsgrundlage,
        notfrist: artDE.notfrist,
        vorfrist: r.vorfrist,
        message: matches
          ? `Frist-Engine bestätigt ${r.fristende} (ab Zustellung ${zustellung}, ${artDE.rechtsgrundlage}).`
          : `Abweichung: Die Frist-Engine errechnet ${r.fristende} (ab Zustellung ${zustellung}, ${artDE.rechtsgrundlage}); bestätigt wurde ${confirmedDate}.`,
      };
    }
    const fristArt = resolveFristArt(art);
    if (!fristArt) return null;
    // The suggestion was computed without the vhfZ suspension when the text
    // hinted at a Ferialsache; recompute under the same assumption.
    const ohneHemmung = suggestion.ferialsache === "ja" || suggestion.ferialsache === "zweifel";
    const main = berechneFristAuto(art, zustellung, { ferialsache: ohneHemmung });
    const alt = fristArt.gehemmtInVhfz
      ? berechneFristAuto(art, zustellung, { ferialsache: !ohneHemmung }).fristende
      : main.fristende;
    const basis = `ab Zustellung ${zustellung}, ${fristArt.rechtsgrundlage}`;
    if (main.fristende === confirmedDate) {
      return {
        engineDueDate: main.fristende,
        matches: true,
        rechtsgrundlage: fristArt.rechtsgrundlage,
        notfrist: fristArt.notfrist,
        vorfrist: main.vorfrist,
        message: `Frist-Engine bestätigt ${main.fristende} (${basis}).`,
      };
    }
    const message =
      alt !== main.fristende && alt === confirmedDate
        ? `Hinweis: ${confirmedDate} gilt nur ${
            ohneHemmung ? "wenn KEINE Ferialsache vorliegt" : "in einer Ferialsache"
          } (§ 222 ZPO); die Frist-Engine errechnet sonst ${main.fristende} (${basis}).`
        : `Abweichung: Die Frist-Engine errechnet ${main.fristende} (${basis}); bestätigt wurde ${confirmedDate}.`;
    return {
      engineDueDate: main.fristende,
      matches: false,
      rechtsgrundlage: fristArt.rechtsgrundlage,
      notfrist: fristArt.notfrist,
      message,
    };
  } catch {
    return null;
  }
}

function fail(status: number, code: string, message: string): DeadlineDecisionResult {
  return { ok: false, status, code, message };
}

export async function decideSuggestedDeadline(
  headers: Record<string, string>,
  input: DeadlineDecisionInput,
  fetchFn: FetchFn = fetch
): Promise<DeadlineDecisionResult> {
  const caseRes = await fetchFn(`${ENGINE_URL}/api/pages/${encodeSlugPath(input.caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (caseRes.status === 404) return fail(404, "case_not_found", "Akte nicht gefunden.");
  if (!caseRes.ok) {
    return fail(
      502,
      "engine_unavailable",
      "Akte konnte nicht geladen werden. Bitte erneut versuchen."
    );
  }
  const casePage = (await caseRes.json()) as {
    title?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  };
  const fm = casePage.frontmatter ?? {};
  if (fm.status === "archived") {
    return fail(409, "case_archived", "Die Akte ist archiviert.");
  }
  const list = Array.isArray(fm.suggested_deadlines)
    ? (fm.suggested_deadlines as Array<Record<string, unknown>>)
    : null;
  if (!list) {
    return fail(409, "suggestions_corrupt", "Die Fristvorschläge dieser Akte sind nicht lesbar.");
  }
  const suggestion = list[input.index];
  if (!suggestion || typeof suggestion !== "object") {
    return fail(
      404,
      "suggestion_not_found",
      "Fristvorschlag nicht gefunden (evtl. bereits bearbeitet)."
    );
  }

  const prior = suggestion.review_status;
  if (prior === "approved" || prior === "rejected") {
    const sameAction = (prior === "approved") === (input.action === "approve");
    if (sameAction) {
      return {
        ok: true,
        deadlineSlug:
          typeof suggestion.deadline_slug === "string" ? suggestion.deadline_slug : null,
        alreadyDecided: true,
      };
    }
    return fail(409, "already_decided", "Dieser Fristvorschlag wurde bereits anders entschieden.");
  }

  const now = new Date().toISOString();
  const aiDueDate = typeof suggestion.due_date === "string" ? suggestion.due_date : "";
  const title = (input.title?.trim() || String(suggestion.title ?? "Frist")).slice(0, 300);
  let deadlineSlug: string | null =
    typeof suggestion.deadline_slug === "string" && suggestion.deadline_slug
      ? suggestion.deadline_slug
      : null;

  let engineCheck: EngineCheck | null = null;
  if (input.action === "approve") {
    const dueDate = (input.dueDate ?? aiDueDate).trim();
    if (!isValidIsoDate(dueDate)) {
      return fail(
        400,
        "due_date_required",
        "Bitte ein gültiges Fristdatum (TT.MM.JJJJ) angeben, bevor die Frist übernommen wird."
      );
    }
    engineCheck = engineGegenrechnung(suggestion, dueDate);
    deadlineSlug ??= deadlineSlugForSuggestion(input.caseSlug, suggestion, input.index);
    const sourceQuote = typeof suggestion.source_quote === "string" ? suggestion.source_quote : "";
    const writeRes = await fetchFn(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        slug: deadlineSlug,
        title,
        type: "legal_deadline",
        merge: true,
        content: [
          `Frist aus KI-Vorschlag, anwaltlich bestätigt am ${now.slice(0, 10)} (${input.reviewer}).`,
          "",
          `Quelle: ${String(suggestion.source ?? "KI")}`,
          sourceQuote ? `Belegstelle: ${sourceQuote}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        frontmatter: {
          type: "legal_deadline",
          case_slug: input.caseSlug,
          title,
          due_date: dueDate,
          ai_due_date: aiDueDate || null,
          status: "pending",
          urgency: String(suggestion.urgency ?? "medium"),
          source: String(suggestion.source ?? "ai"),
          source_quote: sourceQuote || null,
          review_status: "approved",
          reviewed_by: input.reviewer,
          reviewed_at: now,
          from_suggestion: true,
          ...(typeof suggestion.zustellungsdatum === "string"
            ? { zustellungsdatum: suggestion.zustellungsdatum }
            : {}),
          ...(typeof suggestion.frist_art === "string" ? { frist_art: suggestion.frist_art } : {}),
          ...(engineCheck
            ? {
                engine_due_date: engineCheck.engineDueDate,
                engine_check: engineCheck.matches ? "match" : "abweichung",
                engine_check_note: engineCheck.message,
                ...(engineCheck.rechtsgrundlage ? { law: engineCheck.rechtsgrundlage } : {}),
                ...(engineCheck.vorfrist ? { vorfrist_date: engineCheck.vorfrist } : {}),
                // Notfristen get the existing Vier-Augen check.
                ...(engineCheck.notfrist ? { is_notfrist: true, second_check_required: true } : {}),
              }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!writeRes.ok) {
      return fail(
        502,
        "deadline_write_failed",
        "Die Frist konnte nicht ins Fristenbuch geschrieben werden. Der Vorschlag bleibt offen — bitte erneut versuchen."
      );
    }
  } else if (deadlineSlug) {
    // A pre-created unreviewed deadline (case-writeback) must not keep
    // triggering reminders once the lawyer discarded the suggestion.
    const rejectRes = await fetchFn(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        slug: deadlineSlug,
        merge: true,
        frontmatter: {
          review_status: "rejected",
          status: "dismissed",
          reviewed_by: input.reviewer,
          reviewed_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!rejectRes.ok) {
      return fail(
        502,
        "deadline_write_failed",
        "Der Fristvorschlag konnte nicht verworfen werden."
      );
    }
  }

  const updated = list.map((sd, i) =>
    i === input.index
      ? {
          ...sd,
          title,
          ...(input.action === "approve"
            ? {
                due_date: (input.dueDate ?? aiDueDate).trim(),
                ai_due_date: aiDueDate || null,
                ...(engineCheck
                  ? {
                      engine_due_date: engineCheck.engineDueDate,
                      engine_check: engineCheck.matches ? "match" : "abweichung",
                    }
                  : {}),
              }
            : {}),
          confirmed: true,
          review_status: input.action === "approve" ? "approved" : "rejected",
          reviewed_by: input.reviewer,
          reviewed_at: now,
          ...(deadlineSlug ? { deadline_slug: deadlineSlug } : {}),
        }
      : sd
  );
  const patchRes = await fetchFn(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      slug: input.caseSlug,
      merge: true,
      frontmatter: { suggested_deadlines: updated },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!patchRes.ok) {
    return fail(
      502,
      "suggestion_update_failed",
      input.action === "approve"
        ? "Die Frist steht im Fristenbuch, der Vorschlag konnte aber nicht abgehakt werden. Bitte die Ansicht neu laden."
        : "Der Fristvorschlag konnte nicht aktualisiert werden."
    );
  }
  return {
    ok: true,
    deadlineSlug,
    alreadyDecided: false,
    ...(engineCheck ? { engineCheck } : {}),
  };
}
