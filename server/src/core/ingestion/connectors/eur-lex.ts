/**
 * EurLexConnector — ingest EU court decisions from EUR-Lex (Curia / EUR-Lex API).
 *
 * Sources:
 *   - EUR-Lex WS REST API (search)
 *   - Curia (Court of Justice of the EU) for full texts
 *
 * Court types:
 *   - ECJ / EuGH (Court of Justice)
 *   - GC / EuG (General Court)
 *   - CST (Civil Service Tribunal)
 *
 * Setup:
 *   gbrain connector add eur-lex --query "competition" --court ECJ
 *   gbrain connector sync eur-lex
 */

import { dump as yamlDump } from "js-yaml";
import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";
import { stripHtml } from "./legal-judgements.ts";

interface EurLexItem extends ConnectorItem {
  source: "eur-lex";
  court: string;
  date: string;
  ecli: string;
  caseNumber: string;
  procedureType: string;
  keywords: string[];
  text: string;
  url: string;
  parties: string[];
}

const EURLEX_SEARCH_BASE = "https://eur-lex.europa.eu/europa-webservices/rs/search";
const CURIA_BASE = "https://curia.europa.eu";
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_DETAIL_FETCHES = 10;

export class EurLexConnector extends BaseConnector {
  private searchQuery: string;
  private courtFilter: string;
  private maxPages: number;
  private maxDetailFetches: number;

  constructor(config: ConnectorConfig = {}) {
    super("eur-lex", config);
    this.searchQuery = (config.filters?.query as string) ?? "";
    this.courtFilter = (config.filters?.court as string) ?? ""; // ECJ, GC, CST
    const maxPages = parseInt(String(config.filters?.max_pages ?? ""), 10);
    this.maxPages = Number.isFinite(maxPages) && maxPages > 0 ? maxPages : DEFAULT_MAX_PAGES;
    const maxDetail = parseInt(String(config.filters?.max_detail_fetches ?? ""), 10);
    this.maxDetailFetches =
      Number.isFinite(maxDetail) && maxDetail >= 0 ? maxDetail : DEFAULT_MAX_DETAIL_FETCHES;
  }

  getApiRateLimit() {
    return { capacity: 20, windowMs: 60_000 };
  }

  async refreshToken(): Promise<void> {
    // EUR-Lex is a public API; no token required.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const items: EurLexItem[] = [];
    const windowStart = cursor
      ? new Date(parseInt(cursor, 10))
      : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const syncStartedAt = Date.now();

    let detailBudget = this.maxDetailFetches;
    for (let page = 1; page <= this.maxPages; page++) {
      const pageItems = await this.fetchEurLexPage(windowStart, page);
      if (pageItems.length === 0) break;
      items.push(...pageItems);
      if (pageItems.length < 20) break; // last page
    }

    // Fetch full texts for the first N items via Curia API
    for (const item of items) {
      if (detailBudget > 0 && item.ecli) {
        detailBudget--;
        item.text = await this.fetchCuriaText(item.ecli);
        item.content = item.text;
      }
    }

    return { items, nextCursor: String(syncStartedAt) };
  }

  private async fetchEurLexPage(sinceDate: Date, page: number): Promise<EurLexItem[]> {
    const url = new URL(`${EURLEX_SEARCH_BASE}`);
    // EUR-Lex uses language-specific search
    url.searchParams.set("lang", "de");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "20");
    url.searchParams.set("searchCriteria", "CASE_LAW");

    // Build search query
    const queryParts: string[] = [];
    if (this.searchQuery) queryParts.push(this.searchQuery);
    if (this.courtFilter) queryParts.push(this.courtFilter);

    // Date filter
    const sinceIso = sinceDate.toISOString().split("T")[0];
    queryParts.push(`date>=${sinceIso}`);

    if (queryParts.length > 0) {
      url.searchParams.set("q", queryParts.join(" AND "));
    }

    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        this._ctx?.logger.warn(`[eur-lex] HTTP ${res.status} from EUR-Lex`);
        return [];
      }

      const data = (await res.json()) as Record<string, unknown>;
      const results = data.results as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results)) return [];

      return results
        .map((r): EurLexItem | null => {
          const work = (r.work as Record<string, unknown> | undefined) ?? {};
          const ecli = String(work.ecli ?? "");
          if (!ecli) return null;

          const court = this.inferCourtFromEcli(ecli);
          const date = String(work.dateDocument ?? "");
          const caseNumberVal = work.caseNumber as Record<string, unknown> | string | undefined;
          const caseNumber =
            typeof caseNumberVal === "object" && caseNumberVal
              ? String(caseNumberVal.value ?? "")
              : String(caseNumberVal ?? "");
          const titleVal = work.title as Record<string, unknown> | string | undefined;
          const title =
            typeof titleVal === "object" && titleVal
              ? String(titleVal.value ?? "EU-Urteil")
              : String(titleVal ?? "EU-Urteil");
          const keywords = this.extractKeywords(work);
          const parties = this.extractParties(work);
          const url = `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=${encodeURIComponent(ecli)}`;

          return {
            id: ecli,
            title: `${court} — ${caseNumber || title}`,
            modified_at: date || new Date().toISOString(),
            content: "",
            content_type: "text/markdown",
            url,
            source: "eur-lex",
            court,
            date: date || new Date().toISOString(),
            ecli,
            caseNumber,
            procedureType: String(
              (work.procedureType as Record<string, unknown> | undefined)?.value ?? ""
            ),
            keywords,
            text: "",
            parties,
          };
        })
        .filter(Boolean) as EurLexItem[];
    } catch (err) {
      this._ctx?.logger.warn(
        `[eur-lex] Fetch error: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  }

  private inferCourtFromEcli(ecli: string): string {
    // ECLI:EU:C:2023:123 (ECJ), ECLI:EU:T:2023:456 (GC)
    const parts = ecli.split(":");
    if (parts.length >= 3) {
      const courtCode = parts[2];
      switch (courtCode) {
        case "C":
          return "EuGH (ECJ)";
        case "T":
          return "EuG (General Court)";
        case "F":
          return "EuG (General Court)";
        default:
          return "EuGH/EuG";
      }
    }
    return "EuGH/EuG";
  }

  private extractKeywords(work: Record<string, unknown>): string[] {
    const kw = work.keywords;
    if (Array.isArray(kw)) {
      return kw
        .map((k) =>
          typeof k === "string" ? k : String((k as Record<string, unknown>)?.value ?? "")
        )
        .filter(Boolean);
    }
    if (typeof kw === "string")
      return kw
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    return [];
  }

  private extractParties(work: Record<string, unknown>): string[] {
    const parties = work.parties;
    if (Array.isArray(parties)) {
      return parties
        .map((p) =>
          typeof p === "string" ? p : String((p as Record<string, unknown>)?.value ?? "")
        )
        .filter(Boolean);
    }
    return [];
  }

  private async fetchCuriaText(ecli: string): Promise<string> {
    try {
      // Curia provides a simple HTML view for decisions
      const url = `${CURIA_BASE}/juris/document/document.jsf?text=&docid=${encodeURIComponent(ecli)}&pageIndex=0&doclang=DE&mode=lst&dir=&occ=first&part=1&cid=`;
      const res = await fetch(url, {
        headers: { Accept: "text/html" },
      });
      if (!res.ok) return "";
      const html = await res.text();
      return stripHtml(html);
    } catch {
      return "";
    }
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const j = item as EurLexItem;
    const slugDate = j.date.split("T")[0];
    const slugCourt = slugify(j.court);
    const slugId = slugify(j.ecli);

    const frontmatter = yamlDump(
      {
        type: "eu_court_decision",
        court: j.court,
        date: j.date,
        ecli: j.ecli,
        case_number: j.caseNumber,
        procedure_type: j.procedureType,
        keywords: j.keywords,
        parties: j.parties,
        source: j.source,
        source_url: j.url,
      },
      { lineWidth: -1, noRefs: true }
    ).trimEnd();

    const content = `---
${frontmatter}
---

# ${j.court} — ${j.caseNumber || "EU-Urteil"}

${j.parties.length > 0 ? `**Parteien:** ${j.parties.join(", ")}\n` : ""}
**Datum:** ${j.date}
**ECLI:** ${j.ecli}

${j.text || `*Volltext nicht abgerufen — siehe Quelle bei EUR-Lex.*`}

---
*Quelle: [EUR-Lex](${j.url})*
`;

    return {
      source_id: this.id,
      source_kind: "connector",
      source_uri: j.url || `legal/eu-judgements/${slugDate}-${slugCourt}-${slugId}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content,
      content_hash: this.hashContent(content),
      metadata: {
        slug: `legal/eu-judgements/${slugDate}-${slugCourt}-${slugId}`,
        title: `${j.court} — ${j.caseNumber || j.ecli}`,
      },
    };
  }
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
