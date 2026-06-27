// Geteilte Judikatur-Suche: AT (RIS-OGD v2.6) + DE (openlegaldata.io) + CH (OpenCaseLaw.ch).
// Genutzt von /api/legal/judgements-search (interaktiv) UND vom Cron
// /api/cron/case-law (proaktives Monitoring).

import { withRetry, externalFetchTimeout } from "@/lib/retry";

import { JudgementsSearchError } from "@/lib/errors";

export interface JudgementHit {
  id: string;
  title: string;
  court: string;
  date: string;
  caseNumber: string;
  ecli: string;
  type: string;
  url: string;
  snippet: string;
  summary?: string;
  legalArea?: string;
  keywords?: string[];
  source: "ris-ogd" | "openlegaldata" | "opencaselaw";
}

function risFirstListItem(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const item = (value as Record<string, unknown>).item;
    if (typeof item === "string") return item.split(";")[0]?.trim() ?? "";
    if (Array.isArray(item) && item.length > 0) return String(item[0]);
  }
  return "";
}

export async function searchRisOgd(opts: {
  q: string;
  court?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<JudgementHit[]> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const risUrl = new URL("https://data.bka.gv.at/ris/api/v2.6/judikatur");
  risUrl.searchParams.set("Applikation", "Justiz");
  const terms = [opts.q, opts.court].filter(Boolean).join(" ");
  if (terms) risUrl.searchParams.set("Suchworte", terms);
  if (opts.from) risUrl.searchParams.set("EntscheidungsdatumVon", opts.from);
  if (opts.to) risUrl.searchParams.set("EntscheidungsdatumBis", opts.to);
  const pageSize =
    limit <= 10 ? "Ten" : limit <= 20 ? "Twenty" : limit <= 50 ? "Fifty" : "OneHundred";
  risUrl.searchParams.set("DokumenteProSeite", pageSize);
  risUrl.searchParams.set("Seitennummer", String((opts.page ?? 0) + 1));

  const res = await withRetry(() =>
    fetch(risUrl.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: externalFetchTimeout(15_000),
    })
  );
  if (!res.ok)
    throw new JudgementsSearchError(`RIS-OGD ${res.status}`, {
      code: "RIS_OGD_FETCH_FAILED",
      details: { status: res.status, url: risUrl.toString() },
    });

  const data = (await res.json()) as Record<string, unknown>;
  const result = (data.OgdSearchResult ?? data) as Record<string, unknown>;
  const docResults = result.OgdDocumentResults as Record<string, unknown> | undefined;
  const rawRefs = docResults?.OgdDocumentReference;
  const refs: Array<Record<string, unknown>> = Array.isArray(rawRefs)
    ? (rawRefs as Array<Record<string, unknown>>)
    : rawRefs && typeof rawRefs === "object"
      ? [rawRefs as Record<string, unknown>]
      : [];

  const hits: JudgementHit[] = [];
  for (const ref of refs) {
    const metadaten = ((ref.Data as Record<string, unknown> | undefined)?.Metadaten ??
      {}) as Record<string, unknown>;
    const technisch = (metadaten.Technisch ?? {}) as Record<string, unknown>;
    const allgemein = (metadaten.Allgemein ?? {}) as Record<string, unknown>;
    const judikatur = (metadaten.Judikatur ?? {}) as Record<string, unknown>;
    const justiz = (judikatur.Justiz ?? {}) as Record<string, unknown>;
    const id = String(technisch.ID ?? "");
    if (!id) continue;
    const court = String(justiz.Gericht ?? technisch.Organ ?? "Unbekannt");
    const az = risFirstListItem(judikatur.Geschaeftszahl);
    const ecli = judikatur.EuropeanCaseLawIdentifier
      ? String(judikatur.EuropeanCaseLawIdentifier)
      : "";
    hits.push({
      id: ecli || `ris-${id}`,
      title: `${court} — ${az || id}`,
      court,
      date: String(judikatur.Entscheidungsdatum ?? ""),
      caseNumber: az,
      ecli,
      type: risFirstListItem(justiz.Rechtsgebiete) || "Judikatur",
      url: String(
        allgemein.DokumentUrl ??
          `https://ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${id}`
      ),
      snippet: String(judikatur.Schlagworte ?? ""),
      source: "ris-ogd",
    });
  }
  return hits;
}

export async function searchOpenLegalData(opts: {
  q: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<JudgementHit[]> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const url = new URL("https://de.openlegaldata.io/api/cases/");
  url.searchParams.set("search", opts.q);
  if (opts.from) url.searchParams.set("date_after", opts.from);
  if (opts.to) url.searchParams.set("date_before", opts.to);
  url.searchParams.set("page_size", String(limit));
  if ((opts.page ?? 0) > 0) url.searchParams.set("page", String((opts.page ?? 0) + 1));

  const res = await withRetry(() =>
    fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: externalFetchTimeout(15_000),
    })
  );
  if (!res.ok)
    throw new JudgementsSearchError(`openlegaldata ${res.status}`, {
      code: "OPENLEGALDATA_FETCH_FAILED",
      details: { status: res.status, url: url.toString() },
    });

  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).map((entry): JudgementHit => {
    const court = (entry.court as Record<string, unknown> | undefined)?.name;
    const slug = entry.slug ? String(entry.slug) : String(entry.id ?? "");
    return {
      id: entry.ecli ? String(entry.ecli) : `old-${entry.id ?? slug}`,
      title: `${court ?? "Unbekannt"} — ${entry.file_number ?? entry.id ?? ""}`,
      court: String(court ?? "Unbekannt"),
      date: String(entry.date ?? ""),
      caseNumber: entry.file_number ? String(entry.file_number) : "",
      ecli: entry.ecli ? String(entry.ecli) : "",
      type: String(entry.type ?? ""),
      url: slug ? `https://de.openlegaldata.io/case/${slug}/` : "",
      snippet: "",
      source: "openlegaldata",
    };
  });
}

export async function searchOpenCaseLaw(opts: {
  q: string;
  court?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<JudgementHit[]> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const url = new URL("https://mcp.opencaselaw.ch/api/decisions");
  url.searchParams.set("q", opts.q);
  if (opts.court) url.searchParams.set("court", opts.court);
  if (opts.from) url.searchParams.set("date_from", opts.from);
  if (opts.to) url.searchParams.set("date_to", opts.to);
  url.searchParams.set("language", "de");
  url.searchParams.set("limit", String(limit));
  if ((opts.page ?? 0) > 0) url.searchParams.set("offset", String((opts.page ?? 0) * limit));

  const res = await withRetry(() =>
    fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: externalFetchTimeout(15_000),
    })
  );
  if (!res.ok)
    throw new JudgementsSearchError(`OpenCaseLaw ${res.status}`, {
      code: "OPENCASELAW_FETCH_FAILED",
      details: { status: res.status, url: url.toString() },
    });

  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).map((entry): JudgementHit => {
    const decisionId = String(entry.decision_id ?? "");
    const court = String(entry.court ?? "bger");
    const citation = String(entry.citation_string_de ?? entry.citation_string ?? "");
    return {
      id: decisionId || `swiss-${entry.decision_id ?? ""}`,
      title: String(entry.title ?? `${court} — ${decisionId}`),
      court,
      date: String(entry.decision_date ?? ""),
      caseNumber: citation,
      ecli: "",
      type: String(entry.legal_area ?? ""),
      url: String(entry.canonical_url ?? `https://opencaselaw.ch/entscheid/${decisionId}`),
      snippet: String(entry.regeste ?? ""),
      source: "opencaselaw",
    };
  });
}

/** Sucht in allen Quellen je nach Jurisdiktion und vereint die Treffer. */
export async function searchJudgements(opts: {
  q: string;
  jurisdiction: "at" | "de" | "ch" | "all";
  court?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{ results: JudgementHit[]; errors: string[] }> {
  const tasks: Array<Promise<JudgementHit[]>> = [];
  if (opts.jurisdiction === "at" || opts.jurisdiction === "all") tasks.push(searchRisOgd(opts));
  if (opts.jurisdiction === "de" || opts.jurisdiction === "all")
    tasks.push(searchOpenLegalData(opts));
  if (opts.jurisdiction === "ch" || opts.jurisdiction === "all")
    tasks.push(searchOpenCaseLaw(opts));
  const settled = await Promise.allSettled(tasks);
  const results: JudgementHit[] = [];
  const errors: string[] = [];
  for (const o of settled) {
    if (o.status === "fulfilled") results.push(...o.value);
    else errors.push(o.reason instanceof Error ? o.reason.message : String(o.reason));
  }
  return { results, errors };
}
