/**
 * LegalJudgementsConnector — ingest court decisions from public legal databases.
 *
 * Supported sources:
 *   - ris-ogd: Austrian courts (RIS-OGD API v2.6, Applikation=Justiz)
 *   - openlegaldata: German courts (openlegaldata.io REST API)
 *
 * Both response shapes are verified against the live APIs (2026-06):
 *   - RIS:   { OgdSearchResult: { OgdDocumentResults: { Hits, OgdDocumentReference: [...] } } }
 *   - OLD:   { count, next, results: [{ id, slug, court: { name }, file_number, date, type, ecli }] }
 *
 * Authentication: none (public APIs).
 *
 * Setup:
 *   gbrain connector add legal-judgements --query "Haftung" --jurisdiction at
 *   gbrain connector sync legal-judgements
 *
 * Security note: court names, keywords, and case texts are external data —
 * frontmatter is serialized via js-yaml so no value can break the YAML block.
 */

import { dump as yamlDump } from "js-yaml";
import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";

interface JudgementItem extends ConnectorItem {
  source: "ris-ogd" | "openlegaldata";
  court: string;
  date: string;
  ecli?: string;
  az?: string; // Aktenzeichen / Geschäftszahl
  legalArea: string;
  keywords: string[];
  normen: string[]; // Cited statute paragraphs (e.g. "ABGB §1295")
  text: string;
  url: string;
  /** Dokumentnummer of the full-text decision (JJT_*), distinct from the
   *  Rechtssatz id (JJR_*) returned by search. Only the JJT id resolves to
   *  real judgment text on ris.bka.gv.at. */
  fullTextDocId?: string;
}

const RIS_OGD_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const OPENLEGALDATA_BASE = "https://de.openlegaldata.io/api";

/** Pages fetched per source per sync (RIS: 100/page, OLD: 50/page).
 *  Override via config for bulk imports: set max_pages=N filter. */
const DEFAULT_MAX_PAGES = 3;
/** openlegaldata full-text detail fetches per sync (list endpoint has no text). */
const DEFAULT_MAX_DETAIL_FETCHES = 25;
/** RIS-OGD full-text detail fetches per sync (search endpoint has no decision body). */
const DEFAULT_MAX_RIS_DETAIL_FETCHES = 25;

export class LegalJudgementsConnector extends BaseConnector {
  private searchQuery: string;
  private jurisdiction: string;
  private maxDetailFetches: number;
  private maxRisDetailFetches: number;
  private maxPages: number;

  constructor(config: ConnectorConfig = {}) {
    super("legal-judgements", config);
    this.searchQuery = (config.filters?.query as string) ?? "";
    this.jurisdiction = (config.filters?.jurisdiction as string) ?? "at"; // at, de, all
    const maxDetail = parseInt(String(config.filters?.max_detail_fetches ?? ""), 10);
    this.maxDetailFetches =
      Number.isFinite(maxDetail) && maxDetail >= 0 ? maxDetail : DEFAULT_MAX_DETAIL_FETCHES;
    const maxRisDetail = parseInt(String(config.filters?.max_ris_detail_fetches ?? ""), 10);
    this.maxRisDetailFetches =
      Number.isFinite(maxRisDetail) && maxRisDetail >= 0
        ? maxRisDetail
        : DEFAULT_MAX_RIS_DETAIL_FETCHES;
    const maxPages = parseInt(String(config.filters?.max_pages ?? ""), 10);
    this.maxPages = Number.isFinite(maxPages) && maxPages > 0 ? maxPages : DEFAULT_MAX_PAGES;
  }

  getApiRateLimit() {
    // Public APIs are generally generous but let's be respectful.
    return { capacity: 30, windowMs: 60_000 };
  }

  async refreshToken(): Promise<void> {
    // Public APIs — no token needed.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const items: JudgementItem[] = [];
    const windowStart = cursor
      ? new Date(parseInt(cursor, 10))
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const syncStartedAt = Date.now();
    let allSucceeded = true;

    if (this.jurisdiction === "at" || this.jurisdiction === "all") {
      try {
        items.push(...(await this.fetchRisOgd(windowStart)));
      } catch (err) {
        allSucceeded = false;
        this._ctx?.logger.warn(
          `[${this.id}] RIS-OGD fetch failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (this.jurisdiction === "de" || this.jurisdiction === "all") {
      try {
        items.push(...(await this.fetchOpenLegalData(windowStart)));
      } catch (err) {
        allSucceeded = false;
        this._ctx?.logger.warn(
          `[${this.id}] openlegaldata fetch failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Only advance the window when every source succeeded — a failed source
    // would otherwise silently lose its delta until someone resets the cursor.
    const nextCursor = allSucceeded ? String(syncStartedAt) : cursor;
    return { items, nextCursor };
  }

  // ── RIS-OGD (Österreich) ──────────────────────────────────

  private async fetchRisOgd(sinceDate: Date): Promise<JudgementItem[]> {
    const items: JudgementItem[] = [];
    const sinceIso = sinceDate.toISOString().split("T")[0];

    for (let page = 1; page <= this.maxPages; page++) {
      const url = new URL(`${RIS_OGD_BASE}/judikatur`);
      url.searchParams.set("Applikation", "Justiz");
      if (this.searchQuery) url.searchParams.set("Suchworte", this.searchQuery);
      url.searchParams.set("EntscheidungsdatumVon", sinceIso);
      url.searchParams.set("DokumenteProSeite", "OneHundred");
      url.searchParams.set("Seitennummer", String(page));

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`RIS-OGD HTTP ${res.status}`);

      const data = (await res.json()) as Record<string, unknown>;
      const refs = extractRisReferences(data);
      if (refs.length === 0) break;

      let detailBudget = this.maxRisDetailFetches;
      for (const ref of refs) {
        const item = mapRisReference(ref, sinceDate);
        if (!item) continue;
        // Fetch full text for the first N items per sync. The Rechtssatz
        // search hit never carries the decision body — only the nested
        // fullTextDocId (a JJT_* document) resolves to real text.
        if (detailBudget > 0 && item.fullTextDocId) {
          detailBudget--;
          item.text = await this.fetchRisOgdText(item.fullTextDocId);
          item.content = item.text;
        }
        items.push(item);
      }

      // Stop paging once a page comes back smaller than the page size.
      if (refs.length < 100) break;
    }

    return items;
  }

  /**
   * The RIS-OGD v2.6 JSON API has no single-document lookup: both
   * `?Dokumentnummer=X` and `/judikatur/X` are silently ignored and return
   * the default search listing (verified live against data.bka.gv.at,
   * 2026-09-15). Full decision text is only published on the human-facing
   * ris.bka.gv.at page, so it must be scraped from there.
   */
  private async fetchRisOgdText(fullTextDocId: string): Promise<string> {
    try {
      const url = `https://ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${encodeURIComponent(fullTextDocId)}`;
      const res = await fetch(url);
      if (!res.ok) return "";
      const html = await res.text();
      return extractRisDocumentText(html);
    } catch {
      return "";
    }
  }

  // ── openlegaldata (Deutschland) ───────────────────────────

  private async fetchOpenLegalData(sinceDate: Date): Promise<JudgementItem[]> {
    const items: JudgementItem[] = [];
    let detailBudget = this.maxDetailFetches;
    let nextUrl: string | null = (() => {
      const url = new URL(`${OPENLEGALDATA_BASE}/cases/`);
      if (this.searchQuery) url.searchParams.set("search", this.searchQuery);
      url.searchParams.set("date_after", sinceDate.toISOString().split("T")[0]);
      url.searchParams.set("page_size", "50");
      return url.toString();
    })();

    for (let page = 1; page <= this.maxPages && nextUrl; page++) {
      const res = await fetch(nextUrl);
      if (!res.ok) throw new Error(`openlegaldata HTTP ${res.status}`);

      const data = (await res.json()) as {
        next?: string | null;
        results?: Array<Record<string, unknown>>;
      };

      for (const result of data.results ?? []) {
        const id = result.id != null ? String(result.id) : "";
        if (!id) continue; // no stable identity — skip rather than re-import forever

        const court = (result.court as Record<string, unknown> | undefined)?.name;
        const slug = result.slug ? String(result.slug) : id;
        const caseUrl = `https://de.openlegaldata.io/case/${slug}/`;

        // The list endpoint carries no decision text — fetch details for the
        // first N cases per sync so the brain has searchable content.
        let text = "";
        if (detailBudget > 0) {
          detailBudget--;
          text = await this.fetchOpenLegalDataText(id);
        }

        items.push({
          id: `old-${id}`,
          title: `${court ?? "Unbekannt"} — ${result.file_number ?? id}`,
          modified_at: String(result.date ?? sinceDate.toISOString()),
          content: text,
          content_type: "text/markdown",
          url: caseUrl,
          source: "openlegaldata",
          court: String(court ?? "Unbekannt"),
          date: String(result.date ?? sinceDate.toISOString()),
          ecli: result.ecli ? String(result.ecli) : undefined,
          az: result.file_number ? String(result.file_number) : undefined,
          legalArea: String(result.type ?? "Allgemein"),
          keywords: [],
          normen: [],
          text,
        });
      }

      nextUrl = data.next ?? null;
    }

    return items;
  }

  private async fetchOpenLegalDataText(id: string): Promise<string> {
    try {
      const res = await fetch(`${OPENLEGALDATA_BASE}/cases/${id}/`);
      if (!res.ok) return "";
      const detail = (await res.json()) as { content?: string };
      return stripHtml(String(detail.content ?? ""));
    } catch {
      return "";
    }
  }

  // ── Ingestion mapping ─────────────────────────────────────

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const j = item as JudgementItem;
    const slugDate = j.date.split("T")[0];
    const slugCourt = slugify(j.court);
    const slugId = j.ecli ? slugify(j.ecli) : slugify(j.id);

    const frontmatter = yamlDump(
      {
        type: "court_decision",
        court: j.court,
        date: j.date,
        ecli: j.ecli ?? "",
        case_number: j.az ?? "",
        legal_area: j.legalArea,
        keywords: j.keywords,
        normen: j.normen,
        source: j.source,
        source_url: j.url,
      },
      { lineWidth: -1, noRefs: true }
    ).trimEnd();

    const content = `---
${frontmatter}
---

# ${j.court} — ${slugDate}

${j.text || `*Volltext nicht abgerufen — siehe Quelle.*`}

---
*Quelle: [${j.source}](${j.url})*
`;

    return {
      source_id: this.id,
      source_kind: "connector",
      source_uri: j.url || `legal/judgements/${slugDate}-${slugCourt}-${slugId}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content,
      content_hash: this.hashContent(content),
      metadata: {
        slug: `legal/judgements/${slugDate}-${slugCourt}-${slugId}`,
        title: `${j.court} — ${j.az || j.ecli || "Urteil"}`,
      },
    };
  }
}

// ── RIS response mapping (pure, testable) ─────────────────────

/** Pull the OgdDocumentReference array out of the (deeply nested) RIS response. */
export function extractRisReferences(
  data: Record<string, unknown>
): Array<Record<string, unknown>> {
  const result = (data.OgdSearchResult ?? data) as Record<string, unknown>;
  const docResults = result.OgdDocumentResults as Record<string, unknown> | undefined;
  if (!docResults) return [];
  const refs = docResults.OgdDocumentReference;
  if (Array.isArray(refs)) return refs as Array<Record<string, unknown>>;
  if (refs && typeof refs === "object") return [refs as Record<string, unknown>]; // single hit
  return [];
}

/** Map one RIS OgdDocumentReference to a JudgementItem. Returns null on garbage. */
export function mapRisReference(
  ref: Record<string, unknown>,
  fallbackDate: Date
): JudgementItem | null {
  const metadaten = ((ref.Data as Record<string, unknown> | undefined)?.Metadaten ?? {}) as Record<
    string,
    unknown
  >;
  const technisch = (metadaten.Technisch ?? {}) as Record<string, unknown>;
  const allgemein = (metadaten.Allgemein ?? {}) as Record<string, unknown>;
  const judikatur = (metadaten.Judikatur ?? {}) as Record<string, unknown>;
  const justiz = (judikatur.Justiz ?? {}) as Record<string, unknown>;

  const id = String(technisch.ID ?? "");
  if (!id) return null;

  const court = String(justiz.Gericht ?? technisch.Organ ?? "Unbekannt");
  const rawDate = String(judikatur.Entscheidungsdatum ?? "");
  const parsed = rawDate ? new Date(rawDate) : fallbackDate;
  const date = isNaN(parsed.getTime()) ? fallbackDate.toISOString() : parsed.toISOString();

  const az = firstListItem(judikatur.Geschaeftszahl);
  const ecli = judikatur.EuropeanCaseLawIdentifier
    ? String(judikatur.EuropeanCaseLawIdentifier)
    : undefined;
  const keywords = String(judikatur.Schlagworte ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const normen = listItems(judikatur.Normen);
  const legalArea = firstListItem(justiz.Rechtsgebiete) || "Allgemein";
  const url = String(
    allgemein.DokumentUrl ??
      `https://ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${id}`
  );

  // The search hit's own ID (JJR_*) is a Rechtssatz id — it never resolves to
  // decision text. The real full-text document (JJT_*) is nested under
  // Justiz.Entscheidungstexte.item[].DokumentUrl; take the first one.
  const entscheidungstexte = justiz.Entscheidungstexte as Record<string, unknown> | undefined;
  const firstText = firstListEntry(entscheidungstexte?.item);
  const fullTextUrl =
    firstText && typeof firstText === "object"
      ? String((firstText as Record<string, unknown>).DokumentUrl ?? "")
      : "";
  const fullTextDocId = fullTextUrl.match(/Dokumentnummer=([^&]+)/)?.[1];

  // Search results carry metadata, not the decision body — filled in later
  // by fetchRisOgdText() using fullTextDocId, when a detail-fetch slot is available.
  const text = "";

  return {
    id: `ris-${id}`,
    title: `${court} — ${az || id}`,
    modified_at: date,
    content: text,
    content_type: "text/markdown",
    url,
    source: "ris-ogd",
    court,
    date,
    ecli,
    az: az || undefined,
    legalArea,
    keywords,
    normen,
    text,
    fullTextDocId,
  };
}

/** RIS encodes lists as { item: string | string[] } — return every entry. */
function listItems(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "object") {
    const item = (value as Record<string, unknown>).item;
    if (typeof item === "string") return [item];
    if (Array.isArray(item)) return item.map((s) => String(s));
  }
  return [];
}

/** RIS encodes lists as { item: T | T[] } — return the first entry, raw (not stringified). */
function firstListEntry(item: unknown): unknown {
  if (Array.isArray(item)) return item[0];
  return item;
}

/** RIS encodes lists as { item: string | string[] } — return the first entry. */
function firstListItem(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const item = (value as Record<string, unknown>).item;
    if (typeof item === "string") return item.split(";")[0]?.trim() ?? "";
    if (Array.isArray(item) && item.length > 0) return String(item[0]);
  }
  return "";
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

/**
 * Extract the decision body from a ris.bka.gv.at Dokument.wxe page.
 * The real text lives inside `id="MainContent_DocumentRepeater..."`
 * (Kopf/Spruch/Gründe sections); everything from `id="footer"` on is site
 * chrome. Verified live against ris.bka.gv.at, 2026-09-15.
 */
export function extractRisDocumentText(html: string): string {
  const start = html.indexOf('id="MainContent_DocumentRepeater');
  if (start === -1) return "";
  const footerIdx = html.indexOf('id="footer"', start);
  const trailerIdx = html.indexOf("Textnummer", start);
  const end =
    [footerIdx, trailerIdx].filter((i) => i !== -1).sort((a, b) => a - b)[0] ?? html.length;
  return stripHtml(html.slice(start, end)).trim();
}

/** Crude but dependency-free: openlegaldata content is simple HTML. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
