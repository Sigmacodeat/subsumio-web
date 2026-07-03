import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { encodeSlugPath } from "@/lib/utils";
import { DEADLINE_CREATE_TIMEOUT, ENGINE_FETCH_TIMEOUT } from "@/lib/legal/analysis-utils";

interface EngineHeaders {
  [key: string]: string;
}

/**
 * Write extracted deadlines and parties back to the case frontmatter.
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
    const extractedParties = Array.isArray(parsed.parties)
      ? (parsed.parties as Array<Record<string, unknown>>)
      : [];

    if (extractedDeadlines.length === 0 && extractedParties.length === 0) return;

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
    const suggestedParties = deduplicateParties(extractedParties, caseFm, documentSlug);

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
    if (Object.keys(mergedFrontmatter).length > 0) {
      await enginePatchPage(
        engineHeaders,
        { slug: caseSlug, frontmatter: mergedFrontmatter },
        { timeoutMs: ENGINE_FETCH_TIMEOUT }
      );
    }

    await autoCreateDeadlinePages(engineHeaders, suggestedDeadlines, caseSlug);
  } catch (err) {
    console.error(
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
    }))
    .filter((sd) => {
      const key = `${sd.title}|${sd.due_date}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
}

function deduplicateParties(
  extracted: Array<Record<string, unknown>>,
  caseFm: Record<string, unknown>,
  documentSlug: string
): Array<Record<string, unknown>> {
  const existingKeys = new Set(
    (Array.isArray(caseFm.suggested_parties) ? caseFm.suggested_parties : []).map((sp) => {
      const e = sp as Record<string, unknown>;
      return `${String(e.name ?? "")}|${String(e.role ?? "")}`;
    })
  );

  return extracted
    .map((p) => ({
      name: String(p.name ?? ""),
      role: String(p.role ?? "sonstige"),
      source: `KI-Analyse: ${documentSlug}`,
      confirmed: false,
    }))
    .filter((sp) => {
      const key = `${sp.name}|${sp.role}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
}

/**
 * Auto-create `legal_deadline` pages for high-confidence suggested deadlines
 * so they appear in the deadline review queue with `review_status: "unreviewed"`.
 *
 * Only deadlines with a valid due_date and urgency "high" or "critical"
 * are auto-created. Individual failures are non-blocking.
 */
async function autoCreateDeadlinePages(
  engineHeaders: EngineHeaders,
  suggestedDeadlines: Array<Record<string, unknown>>,
  caseSlug: string
): Promise<void> {
  for (const sd of suggestedDeadlines) {
    const urgency = String(sd.urgency ?? "normal");
    const dueDate = String(sd.due_date ?? "");
    if (!dueDate || (urgency !== "high" && urgency !== "critical")) continue;

    try {
      const title = String(sd.title ?? "Frist");
      const dlSlug = `legal/deadlines/${dueDate.replace(/[^0-9-]/g, "")}-${title
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48)}-${Date.now().toString(36)}`;

      await fetch(`${ENGINE_URL}/api/pages`, {
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
            due_date: dueDate,
            status: "pending",
            review_status: "unreviewed",
            source: "ai_document_analysis",
            urgency,
            ai_confidence: "high",
          },
        }),
        signal: AbortSignal.timeout(DEADLINE_CREATE_TIMEOUT),
      });
    } catch {
      // Non-blocking — einzelne Fehler nicht abbrechen
    }
  }
}
