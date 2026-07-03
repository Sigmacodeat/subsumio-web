import { searchJudgements, type JudgementHit } from "@/lib/judgements";

export interface SuggestedPrecedent {
  id: string;
  title: string;
  court: string;
  date: string;
  case_number: string;
  ecli: string;
  legal_area: string;
  url: string;
  snippet: string;
  source: string;
  relevance_reason: string;
}

/**
 * Extract search keywords from the AI analysis result and query
 * external judgement databases for relevant court decisions.
 *
 * Strategy:
 *   1. Build a search query from cited statutes + document type + risk keywords
 *   2. Search RIS-OGD (AT), openlegaldata (DE), OpenCaseLaw (CH) in parallel
 *   3. Map hits to SuggestedPrecedent with a relevance reason
 *   4. Return top 10 results sorted by relevance
 */
export async function findRelevantPrecedents(
  parsed: Record<string, unknown>,
  jurisdiction: string
): Promise<SuggestedPrecedent[]> {
  const searchTerms: string[] = [];

  const citedStatutes = Array.isArray(parsed.cited_statutes)
    ? (parsed.cited_statutes as Array<Record<string, unknown>>)
    : [];
  for (const cite of citedStatutes.slice(0, 5)) {
    const code = String(cite.code ?? "").trim();
    const paragraph = String(cite.paragraph ?? "")
      .replace(/^§\s*/, "")
      .trim();
    if (code && paragraph) {
      searchTerms.push(`${paragraph} ${code}`);
    }
  }

  const docType = String(parsed.document_type ?? "").trim();
  if (docType && docType !== "sonstiges" && docType !== "unknown") {
    searchTerms.push(docType);
  }

  const risks = Array.isArray(parsed.risks) ? (parsed.risks as Array<Record<string, unknown>>) : [];
  for (const risk of risks.slice(0, 3)) {
    const desc = String(risk.description ?? "").trim();
    if (desc) {
      const keywords = desc.split(/\s+/).slice(0, 4).join(" ");
      if (keywords.length > 3) searchTerms.push(keywords);
    }
  }

  if (searchTerms.length === 0) return [];

  const jur =
    jurisdiction === "at"
      ? "at"
      : jurisdiction === "de"
        ? "de"
        : jurisdiction === "ch"
          ? "ch"
          : "all";

  const seenIds = new Set<string>();
  const allHits: Array<{ hit: JudgementHit; reason: string }> = [];

  for (const term of searchTerms.slice(0, 6)) {
    try {
      const { results } = await searchJudgements({
        q: term,
        jurisdiction: jur as "at" | "de" | "ch" | "all",
        limit: 10,
      });
      for (const hit of results) {
        if (seenIds.has(hit.id)) continue;
        seenIds.add(hit.id);
        allHits.push({
          hit,
          reason:
            term.includes(" ") && /\d+/.test(term)
              ? `Relevant zitierte Norm: ${term}`
              : `Relevant für Dokumenttyp: ${docType}`,
        });
      }
    } catch (err) {
      console.error(
        `[analyze] precedent search for "${term}" failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    if (allHits.length >= 15) break;
  }

  return allHits.slice(0, 10).map(({ hit, reason }) => ({
    id: hit.id,
    title: hit.title,
    court: hit.court,
    date: hit.date,
    case_number: hit.caseNumber,
    ecli: hit.ecli,
    legal_area: hit.legalArea || hit.type || "Allgemein",
    url: hit.url,
    snippet: hit.snippet || hit.summary || "",
    source: hit.source,
    relevance_reason: reason,
  }));
}
