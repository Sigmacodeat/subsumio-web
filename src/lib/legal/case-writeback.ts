import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { encodeSlugPath } from "@/lib/utils";
import { DEADLINE_CREATE_TIMEOUT, ENGINE_FETCH_TIMEOUT } from "@/lib/legal/analysis-utils";
import {
  buildCaseFieldSuggestions,
  normalizeAnalysisParties,
  resolvePartySides,
  type NormalizedParty,
} from "@/lib/legal/case-suggestions";

import { logger } from "@/lib/logger";
const log = logger("lib/legal/case-writeback");

interface EngineHeaders {
  [key: string]: string;
}

/**
 * Write extracted deadlines, parties and Aktendaten suggestions back to the
 * case frontmatter.
 *
 * Reads the current case page, deduplicates against existing
 * `suggested_deadlines` / `suggested_parties` entries, and merges
 * the new ones via `enginePatchPage` (merge:true).
 *
 * For high-urgency deadlines (high/critical) with a valid due_date,
 * auto-creates `legal_deadline` pages so they appear in the
 * deadline review queue with `review_status: "unreviewed"`.
 *
 * This function is fire-and-forget — errors are logged but never thrown.
 */
export async function writeSuggestedDeadlinesAndParties(
  engineHeaders: EngineHeaders,
  caseSlug: string,
  parsed: Record<string, unknown>,
  documentSlug: string
): Promise<void> {
  try {
    const extractedDeadlines = Array.isArray(parsed.deadlines)
      ? (parsed.deadlines as Array<Record<string, unknown>>)
      : [];
    // Strings (older engine) and objects (party_roles / inline analysis)
    // alike — an object used to arrive here as an empty name.
    const extractedParties = normalizeAnalysisParties(parsed);
    const hasCaseFacts =
      !!parsed.case_facts &&
      typeof parsed.case_facts === "object" &&
      Object.keys(parsed.case_facts as object).length > 0;

    if (extractedDeadlines.length === 0 && extractedParties.length === 0 && !hasCaseFacts) return;

    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(caseSlug)}`, {
      headers: engineHeaders,
      signal: AbortSignal.timeout(ENGINE_FETCH_TIMEOUT),
    });
    if (!caseRes.ok) return;
    const casePage = (await caseRes.json()) as {
      frontmatter?: Record<string, unknown>;
    };
    const caseFm = (casePage.frontmatter ?? {}) as Record<string, unknown>;

    const suggestedDeadlines = deduplicateDeadlines(extractedDeadlines, caseFm, documentSlug);
    const suggestedParties = deduplicateParties(
      resolvePartySides(extractedParties, caseFm),
      caseFm,
      documentSlug
    );
    // Gericht / Geschäftszahl / Streitwert: suggestions only — the matter's
    // own fields change when the lawyer accepts one.
    const suggestedCaseFields = buildCaseFieldSuggestions(
      parsed.case_facts,
      caseFm,
      `KI-Analyse: ${documentSlug}`
    );

    // High-urgency suggestions get an unreviewed legal_deadline page up front
    // (visible in the Fristenbuch with the "ungeprüft" badge). Its slug is
    // stored on the suggestion so the later approval updates THAT page
    // instead of creating a duplicate (src/lib/legal/deadline-decision.ts).
    for (const sd of suggestedDeadlines) {
      if (isAutoCreateCandidate(sd)) sd.deadline_slug = autoDeadlineSlug(sd);
    }

    const mergedFrontmatter: Record<string, unknown> = {};
    if (suggestedDeadlines.length > 0) {
      mergedFrontmatter.suggested_deadlines = [
        ...(Array.isArray(caseFm.suggested_deadlines) ? caseFm.suggested_deadlines : []),
        ...suggestedDeadlines,
      ];
    }
    if (suggestedParties.length > 0) {
      mergedFrontmatter.suggested_parties = [
        ...(Array.isArray(caseFm.suggested_parties) ? caseFm.suggested_parties : []),
        ...suggestedParties,
      ];
    }
    if (suggestedCaseFields.length > 0) {
      mergedFrontmatter.suggested_case_fields = [
        ...(Array.isArray(caseFm.suggested_case_fields) ? caseFm.suggested_case_fields : []),
        ...suggestedCaseFields,
      ];
    }
    if (Object.keys(mergedFrontmatter).length > 0) {
      await enginePatchPage(
        engineHeaders,
        { slug: caseSlug, frontmatter: mergedFrontmatter },
        { timeoutMs: ENGINE_FETCH_TIMEOUT }
      );
    }

    await autoCreateDeadlinePages(engineHeaders, suggestedDeadlines, caseSlug);
  } catch (err) {
    log.error(
      `[analyze] failed to write suggested deadlines to case ${caseSlug}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

function deduplicateDeadlines(
  extracted: Array<Record<string, unknown>>,
  caseFm: Record<string, unknown>,
  documentSlug: string
): Array<Record<string, unknown>> {
  const existingKeys = new Set(
    (Array.isArray(caseFm.suggested_deadlines) ? caseFm.suggested_deadlines : []).map((sd) => {
      const e = sd as Record<string, unknown>;
      return `${String(e.title ?? "")}|${String(e.due_date ?? "")}`;
    })
  );

  return extracted
    .map((d) => ({
      title: String(d.label ?? "Erkannte Frist"),
      due_date: String(d.date ?? ""),
      urgency: String(d.urgency ?? "normal"),
      source: `KI-Analyse: ${documentSlug}`,
      source_quote: String(d.source ?? ""),
      confirmed: false,
      ...engineFacts(d),
    }))
    .filter((sd) => {
      const key = `${sd.title}|${sd.due_date}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
}

/** Facts of the deterministic calculation (analysis-deadlines.ts) travel with
 *  the suggestion, so the reviewer sees Zustellung/Rechtsgrundlage and the
 *  approval can re-check the date against the engine. */
const ENGINE_FACT_KEYS = [
  "engine_computed",
  "rechtsraum",
  "zustellungsdatum",
  "eingangsdatum",
  "frist_art",
  "rechtsgrundlage",
  "vorfrist_date",
  "notfrist",
  "ferialsache",
  "calculation_note",
  "rueckfrage",
  "confidence",
] as const;

function engineFacts(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ENGINE_FACT_KEYS) {
    const v = d[k];
    if (typeof v === "string" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

function deduplicateParties(
  extracted: NormalizedParty[],
  caseFm: Record<string, unknown>,
  documentSlug: string
): Array<Record<string, unknown>> {
  const existingKeys = new Set(
    (Array.isArray(caseFm.suggested_parties) ? caseFm.suggested_parties : []).map((sp) => {
      const e = sp as Record<string, unknown>;
      return `${String(e.name ?? "").toLowerCase()}|${String(e.role ?? "")}`;
    })
  );

  return extracted
    .filter((p) => p.name.trim().length > 0)
    .map((p) => ({
      name: p.name,
      role: p.role,
      source: `KI-Analyse: ${documentSlug}`,
      confirmed: false,
    }))
    .filter((sp) => {
      const key = `${sp.name.toLowerCase()}|${sp.role}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
}

function isAutoCreateCandidate(sd: Record<string, unknown>): boolean {
  const urgency = String(sd.urgency ?? "normal");
  const dueDate = String(sd.due_date ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && (urgency === "high" || urgency === "critical");
}

function autoDeadlineSlug(sd: Record<string, unknown>): string {
  const dueDate = String(sd.due_date ?? "");
  const title = String(sd.title ?? "Frist");
  return `legal/deadlines/${dueDate.replace(/[^0-9-]/g, "")}-${title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}-${Date.now().toString(36)}`;
}

/**
 * Auto-create `legal_deadline` pages for high-urgency suggested deadlines
 * so they appear in the Fristenbuch with `review_status: "unreviewed"`
 * until a lawyer approves or discards the suggestion.
 *
 * Only suggestions that carry a `deadline_slug` (valid ISO date and urgency
 * "high"/"critical") are created. Individual failures are logged, not thrown.
 */
async function autoCreateDeadlinePages(
  engineHeaders: EngineHeaders,
  suggestedDeadlines: Array<Record<string, unknown>>,
  caseSlug: string
): Promise<void> {
  for (const sd of suggestedDeadlines) {
    const dlSlug = typeof sd.deadline_slug === "string" ? sd.deadline_slug : "";
    if (!dlSlug) continue;
    const urgency = String(sd.urgency ?? "normal");
    const dueDate = String(sd.due_date ?? "");
    const title = String(sd.title ?? "Frist");

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...engineHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: dlSlug,
          title,
          type: "legal_deadline",
          content: `Automatisch aus KI-Dokumentanalyse erstellt.\n\nQuelle: ${sd.source}\nBelegstelle: ${sd.source_quote}`,
          frontmatter: {
            type: "legal_deadline",
            case_slug: caseSlug,
            title,
            description: title,
            due_date: dueDate,
            status: "pending",
            review_status: "unreviewed",
            source: "ai_document_analysis",
            urgency,
            ai_confidence: "unverified",
            ...(typeof sd.rechtsgrundlage === "string" ? { law: sd.rechtsgrundlage } : {}),
            ...(typeof sd.vorfrist_date === "string" ? { vorfrist_date: sd.vorfrist_date } : {}),
            ...(typeof sd.zustellungsdatum === "string"
              ? { zustellungsdatum: sd.zustellungsdatum }
              : {}),
            ...(typeof sd.frist_art === "string" ? { frist_art: sd.frist_art } : {}),
            ...(typeof sd.calculation_note === "string"
              ? { calculation_note: sd.calculation_note }
              : {}),
            // Notfristen get the existing Vier-Augen check.
            ...(sd.notfrist === true ? { is_notfrist: true, second_check_required: true } : {}),
          },
        }),
        signal: AbortSignal.timeout(DEADLINE_CREATE_TIMEOUT),
      });
      if (!res.ok) {
        log.error(`[analyze] unreviewed deadline ${dlSlug} not created: HTTP ${res.status}`);
      }
    } catch (err) {
      log.error(
        `[analyze] unreviewed deadline ${dlSlug} not created:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
