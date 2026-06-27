/**
 * SwissJudgementsConnector — ingest Swiss court decisions from OpenCaseLaw.ch.
 *
 * Source:
 *   - OpenCaseLaw.ch REST API (https://mcp.opencaselaw.ch/api/)
 *   - Covers: Federal Supreme Court (BGer/BGE), Federal Administrative Court (BVGer),
 *     Federal Criminal Court (BStGer), Federal Patent Court, and all 26 cantonal courts.
 *
 * API characteristics:
 *   - No authentication required (CC0 public domain)
 *   - Rate limit: 30 req/min (self-imposed, be respectful)
 *   - Full-text search + single decision fetch with full text
 *   - Atom feeds per court for incremental sync
 *
 * Setup:
 *   gbrain connector add swiss-judgements --query "Mietrecht" --court bger
 *   gbrain connector sync swiss-judgements
 *
 * Security note: Court names, keywords, and case texts are external data —
 * frontmatter is serialized via js-yaml so no value can break the YAML block.
 */

import { dump as yamlDump } from "js-yaml";
import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";
import { stripHtml } from "./legal-judgements.ts";

interface SwissJudgementItem extends ConnectorItem {
  source: "opencaselaw";
  court: string;
  decision_date: string;
  language: string;
  regeste: string;
  citation_string: string;
  canonical_url: string;
  legal_area: string;
  keywords: string[];
  text: string;
}

const OPENCASELAW_BASE = "https://mcp.opencaselaw.ch/api";
const DEFAULT_MAX_PAGES = 3;
const DEFAULT_MAX_DETAIL_FETCHES = 25;
const DEFAULT_PAGE_SIZE = 50;

export class SwissJudgementsConnector extends BaseConnector {
  private searchQuery: string;
  private courtFilter: string;
  private languageFilter: string;
  private maxPages: number;
  private maxDetailFetches: number;

  constructor(config: ConnectorConfig = {}) {
    super("swiss-judgements", config);
    this.searchQuery = (config.filters?.query as string) ?? "";
    this.courtFilter = (config.filters?.court as string) ?? "bger";
    this.languageFilter = (config.filters?.language as string) ?? "de";
    const maxPages = parseInt(String(config.filters?.max_pages ?? ""), 10);
    this.maxPages = Number.isFinite(maxPages) && maxPages > 0 ? maxPages : DEFAULT_MAX_PAGES;
    const maxDetail = parseInt(String(config.filters?.max_detail_fetches ?? ""), 10);
    this.maxDetailFetches =
      Number.isFinite(maxDetail) && maxDetail >= 0 ? maxDetail : DEFAULT_MAX_DETAIL_FETCHES;
  }

  getApiRateLimit() {
    return { capacity: 30, windowMs: 60_000 };
  }

  async refreshToken(): Promise<void> {
    // OpenCaseLaw is a public API; no token required.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const items: SwissJudgementItem[] = [];
    const windowStart = cursor
      ? new Date(parseInt(cursor, 10))
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const syncStartedAt = Date.now();
    let detailBudget = this.maxDetailFetches;

    const sinceIso = windowStart.toISOString().split("T")[0];

    for (let page = 0; page < this.maxPages; page++) {
      const offset = page * DEFAULT_PAGE_SIZE;
      const url = new URL(`${OPENCASELAW_BASE}/decisions`);
      if (this.searchQuery) url.searchParams.set("q", this.searchQuery);
      if (this.courtFilter) url.searchParams.set("court", this.courtFilter);
      if (this.languageFilter) url.searchParams.set("language", this.languageFilter);
      url.searchParams.set("date_from", sinceIso);
      url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE));
      url.searchParams.set("offset", String(offset));

      try {
        const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        if (!res.ok) {
          this._ctx?.logger.warn(`[swiss-judgements] HTTP ${res.status} from OpenCaseLaw`);
          break;
        }

        const data = (await res.json()) as {
          total: number;
          returned: number;
          results: Array<Record<string, unknown>>;
          has_more: boolean;
          next_offset: number;
        };

        if (!data.results || data.results.length === 0) break;

        for (const result of data.results) {
          const decisionId = String(result.decision_id ?? "");
          if (!decisionId) continue;

          const court = String(result.court ?? "bger");
          const decisionDate = String(result.decision_date ?? "");
          const language = String(result.language ?? "de");
          const title = String(result.title ?? `${court} — ${decisionId}`);
          const regeste = String(result.regeste ?? "");
          const citationString = String(result.citation_string_de ?? result.citation_string ?? "");
          const canonicalUrl = String(result.canonical_url ?? "");

          // Fetch full text for the first N items per sync
          let text = "";
          if (detailBudget > 0) {
            detailBudget--;
            text = await this.fetchDecisionText(decisionId);
          }

          items.push({
            id: `swiss-${decisionId}`,
            title,
            modified_at: decisionDate || new Date().toISOString(),
            content: text || regeste,
            content_type: "text/markdown",
            url: canonicalUrl,
            source: "opencaselaw",
            court,
            decision_date: decisionDate,
            language,
            regeste,
            citation_string: citationString,
            canonical_url: canonicalUrl,
            legal_area: String(result.legal_area ?? ""),
            keywords: Array.isArray(result.keywords)
              ? (result.keywords as string[]).map(String)
              : [],
            text,
          });
        }

        if (!data.has_more) break;
      } catch (err) {
        this._ctx?.logger.warn(
          `[swiss-judgements] Fetch error: ${err instanceof Error ? err.message : String(err)}`
        );
        break;
      }
    }

    return { items, nextCursor: String(syncStartedAt) };
  }

  private async fetchDecisionText(decisionId: string): Promise<string> {
    try {
      const url = `${OPENCASELAW_BASE}/decisions/${encodeURIComponent(decisionId)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return "";
      const data = (await res.json()) as Record<string, unknown>;
      // The full decision text may be in 'text', 'content', or 'body' field
      const text = String(data.text ?? data.content ?? data.body ?? "");
      if (text) return stripHtml(text);
      // Fall back to regeste + erwagungen if available
      const regeste = String(data.regeste ?? "");
      const erwagungen = Array.isArray(data.erwagungen)
        ? (data.erwagungen as Array<Record<string, unknown>>)
            .map((e) => String(e.text ?? ""))
            .join("\n\n")
        : String(data.erwagungen ?? "");
      return [regeste, erwagungen].filter(Boolean).join("\n\n");
    } catch {
      return "";
    }
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const j = item as SwissJudgementItem;
    const slugDate = j.decision_date
      ? j.decision_date.split("T")[0]
      : new Date().toISOString().split("T")[0];
    const slugCourt = slugify(j.court);
    const slugId = slugify(j.citation_string || j.id);

    const frontmatter = yamlDump(
      {
        type: "court_decision",
        court: j.court,
        date: j.decision_date,
        language: j.language,
        citation: j.citation_string,
        legal_area: j.legal_area,
        keywords: j.keywords,
        source: j.source,
        source_url: j.canonical_url,
      },
      { lineWidth: -1, noRefs: true }
    ).trimEnd();

    const content = `---
${frontmatter}
---

# ${j.title}

${j.regeste ? `**Regeste:** ${j.regeste}\n` : ""}
**Datum:** ${j.decision_date}
**Zitat:** ${j.citation_string}

${j.text || `*Volltext nicht abgerufen — siehe [OpenCaseLaw](${j.canonical_url}).*`}

---
*Quelle: [OpenCaseLaw.ch](${j.canonical_url})*
`;

    return {
      source_id: this.id,
      source_kind: "connector",
      source_uri: j.canonical_url || `legal/swiss-judgements/${slugDate}-${slugCourt}-${slugId}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content,
      content_hash: this.hashContent(content),
      metadata: {
        slug: `legal/swiss-judgements/${slugDate}-${slugCourt}-${slugId}`,
        title: j.title,
      },
    };
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
