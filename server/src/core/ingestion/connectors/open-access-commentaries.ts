/**
 * OpenAccessCommentaryConnector — ingest open-access legal commentaries
 * from public legal information systems.
 *
 * Supported sources:
 *   - RIS-OGD (Austria): Bundesrecht commentary documents from the
 *     Austrian legal information system. RIS provides free access to
 *     federal law including explanatory notes and some commentary content.
 *   - openlegaldata.io (Germany): Open legal data including case summaries
 *     and statute explanations.
 *
 * Both sources are public APIs with no authentication required.
 *
 * Setup:
 *   gbrain connector add open-access-commentaries --jurisdiction at
 *   gbrain connector sync open-access-commentaries
 *
 * The connector fetches commentary-style content (explanatory notes,
 * legislative materials, decision summaries) and stores them as
 * `legal_commentary` pages with commentary_type = 'open_access'.
 *
 * Security note: All content is external data — frontmatter is serialized
 * via js-yaml so no value can break the YAML block.
 */

import { dump as yamlDump } from "js-yaml";
import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";

interface CommentaryItem extends ConnectorItem {
  source: "ris-ogd" | "openlegaldata";
  statute_abbr: string;
  section_num: string;
  jurisdiction: string;
  title: string;
  text: string;
  url: string;
  commentary_subtype: "commentary" | "explanatory_note" | "legislative_material";
}

const RIS_OGD_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const OPENLEGALDATA_BASE = "https://de.openlegaldata.io/api";

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_DETAIL_FETCHES = 30;

export class OpenAccessCommentaryConnector extends BaseConnector {
  private jurisdiction: string;
  private maxPages: number;
  private maxDetailFetches: number;

  constructor(config: ConnectorConfig = {}) {
    super("open-access-commentaries", config);
    this.jurisdiction = (config.filters?.jurisdiction as string) ?? "at";
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
    // Public APIs — no token needed.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const items: CommentaryItem[] = [];
    const windowStart = cursor
      ? new Date(parseInt(cursor, 10))
      : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // 180 days default
    const syncStartedAt = Date.now();
    let allSucceeded = true;

    if (this.jurisdiction === "at" || this.jurisdiction === "all") {
      try {
        items.push(...(await this.fetchRisOgdCommentaries(windowStart)));
      } catch (err) {
        allSucceeded = false;
        this._ctx?.logger.warn(
          `[${this.id}] RIS-OGD commentary fetch failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (this.jurisdiction === "de" || this.jurisdiction === "all") {
      try {
        items.push(...(await this.fetchOpenLegalDataCommentaries(windowStart)));
      } catch (err) {
        allSucceeded = false;
        this._ctx?.logger.warn(
          `[${this.id}] openlegaldata commentary fetch failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const nextCursor = allSucceeded ? String(syncStartedAt) : cursor;
    return { items, nextCursor };
  }

  // ── RIS-OGD (Austria) — Bundesrecht with explanatory notes ──

  private async fetchRisOgdCommentaries(sinceDate: Date): Promise<CommentaryItem[]> {
    const items: CommentaryItem[] = [];
    const sinceIso = sinceDate.toISOString().split("T")[0];
    let detailBudget = this.maxDetailFetches;

    for (let page = 1; page <= this.maxPages; page++) {
      const url = new URL(`${RIS_OGD_BASE}/bundesrecht`);
      url.searchParams.set("Applikation", "BrKons");
      url.searchParams.set("DokumenteProSeite", "OneHundred");
      url.searchParams.set("Seitennummer", String(page));
      // Fetch documents with explanatory notes (Erläuterungen)
      url.searchParams.set("Dokumenttyp", "OGD_Dokument");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`RIS-OGD HTTP ${res.status}`);

      const data = (await res.json()) as Record<string, unknown>;
      const refs = extractRisDocumentReferences(data);
      if (refs.length === 0) break;

      for (const ref of refs) {
        const item = mapRisCommentary(ref, sinceDate);
        if (!item) continue;

        // Fetch full text for the first N items
        if (detailBudget > 0 && item.id) {
          detailBudget--;
          const risId = item.id.replace(/^ris-commentary-/, "");
          item.text = await this.fetchRisOgdDetail(risId);
        }

        items.push(item);
      }

      if (refs.length < 100) break;
    }

    return items;
  }

  private async fetchRisOgdDetail(documentNumber: string): Promise<string> {
    try {
      const url = new URL(`${RIS_OGD_BASE}/bundesrecht`);
      url.searchParams.set("Applikation", "BrKons");
      url.searchParams.set("Dokumentnummer", documentNumber);
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return "";
      const data = (await res.json()) as Record<string, unknown>;
      const refs = extractRisDocumentReferences(data);
      if (refs.length === 0) return "";
      const ref = refs[0] as Record<string, unknown>;
      const content = ref.Content as Record<string, unknown> | undefined;
      if (!content) return "";
      const dataContent = (content.Data as Record<string, unknown> | undefined) ?? {};
      const text = String(dataContent.Text ?? "");
      return stripHtml(text);
    } catch {
      return "";
    }
  }

  // ── openlegaldata.io (Germany) — statute explanations ───────

  private async fetchOpenLegalDataCommentaries(sinceDate: Date): Promise<CommentaryItem[]> {
    const items: CommentaryItem[] = [];
    let detailBudget = this.maxDetailFetches;

    for (let page = 1; page <= this.maxPages; page++) {
      const url = new URL(`${OPENLEGALDATA_BASE}/statutes/`);
      url.searchParams.set("page_size", "50");
      url.searchParams.set("page", String(page));

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`openlegaldata HTTP ${res.status}`);

      const data = (await res.json()) as {
        next?: string | null;
        results?: Array<Record<string, unknown>>;
      };

      for (const result of data.results ?? []) {
        const id = result.id != null ? String(result.id) : "";
        if (!id) continue;

        const slug = result.slug ? String(result.slug) : id;
        const title = String(result.title ?? result.name ?? id);
        const abbr = String(result.abbreviation ?? slug);

        // Fetch sections with explanatory content
        if (detailBudget > 0) {
          detailBudget--;
          const sections = await this.fetchOpenLegalDataSections(id, abbr);
          items.push(...sections);
        }
      }

      if (!data.next) break;
    }

    return items;
  }

  private async fetchOpenLegalDataSections(
    statuteId: string,
    statuteAbbr: string
  ): Promise<CommentaryItem[]> {
    try {
      const res = await fetch(`${OPENLEGALDATA_BASE}/statutes/${statuteId}/sections/`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        results?: Array<Record<string, unknown>>;
      };

      return (data.results ?? []).map((section) => {
        const sectionId = String(section.id ?? "");
        const sectionNum = String(section.section_number ?? section.order ?? sectionId);
        const text = String(section.content ?? section.text ?? "");
        const url = String(
          section.url ?? `https://de.openlegaldata.io/statutes/${statuteId}/sections/${sectionId}/`
        );

        return {
          id: `old-commentary-${statuteId}-${sectionId}`,
          title: `§ ${sectionNum} ${statuteAbbr.toUpperCase()}`,
          modified_at: new Date().toISOString(),
          content: stripHtml(text),
          content_type: "text/markdown" as const,
          url,
          source: "openlegaldata" as const,
          statute_abbr: statuteAbbr.toUpperCase(),
          section_num: sectionNum,
          jurisdiction: "de",
          text: stripHtml(text),
          commentary_subtype: "commentary" as const,
        } as CommentaryItem;
      });
    } catch {
      return [];
    }
  }

  // ── Ingestion mapping ─────────────────────────────────────

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const c = item as CommentaryItem;
    const commentaryId = `${c.jurisdiction}/${c.statute_abbr}/§-${c.section_num.replace(/\s+/g, "-")}`;

    const frontmatter = yamlDump(
      {
        type: "legal_commentary",
        commentary_type: "open_access",
        jurisdiction: c.jurisdiction,
        statute_abbr: c.statute_abbr,
        section_num: c.section_num,
        source: c.source,
        source_url: c.url,
        commentary_subtype: c.commentary_subtype,
      },
      { lineWidth: -1, noRefs: true }
    ).trimEnd();

    const content = `---
${frontmatter}
---

# ${c.title}

${c.text || "*Kein Volltext verfügbar — siehe Quelle.*"}

---
*Quelle: [${c.source}](${c.url})*
`;

    return {
      source_id: this.id,
      source_kind: "connector",
      source_uri: c.url || `legal/commentaries/${commentaryId}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content,
      content_hash: this.hashContent(content),
      metadata: {
        slug: `legal/commentaries/${commentaryId}`,
        title: c.title,
        commentary_type: "open_access",
        jurisdiction: c.jurisdiction,
        statute_abbr: c.statute_abbr,
        section_num: c.section_num,
      },
    };
  }
}

// ── RIS response mapping (pure, testable) ─────────────────────

function extractRisDocumentReferences(
  data: Record<string, unknown>
): Array<Record<string, unknown>> {
  const result = (data.OgdSearchResult ?? data) as Record<string, unknown>;
  const docResults = result.OgdDocumentResults as Record<string, unknown> | undefined;
  if (!docResults) return [];
  const refs = docResults.OgdDocumentReference;
  if (Array.isArray(refs)) return refs as Array<Record<string, unknown>>;
  if (refs && typeof refs === "object") return [refs as Record<string, unknown>];
  return [];
}

function mapRisCommentary(ref: Record<string, unknown>, sinceDate: Date): CommentaryItem | null {
  const documentNumber = String(ref.Dokumentnummer ?? "");
  if (!documentNumber) return null;

  const title = String(ref.Titel ?? "Unbekannt");
  const art = ref.Art ?? ref.Artikel ?? null;

  // Try to parse statute abbreviation and section from title
  // RIS titles often look like: "§ 1 ABGB" or "Art 1 GG"
  const titleMatch = title.match(/(?:§\s*(\d+)|Art\.?\s*(\d+))\s+([A-Z]+)/i);
  const sectionNum = titleMatch ? (titleMatch[1] ?? titleMatch[2] ?? "") : String(art ?? "");
  const statuteAbbr = titleMatch ? (titleMatch[3] ?? "") : "";

  if (!sectionNum || !statuteAbbr) return null;

  const content = ref.Content as Record<string, unknown> | undefined;
  const dataContent = (content?.Data as Record<string, unknown> | undefined) ?? {};
  const text = stripHtml(String(dataContent.Text ?? ""));

  return {
    id: `ris-commentary-${documentNumber}`,
    title,
    modified_at: new Date().toISOString(),
    content: text,
    content_type: "text/markdown",
    url: `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BrKons&Dokumentnummer=${documentNumber}`,
    source: "ris-ogd",
    statute_abbr: statuteAbbr.toUpperCase(),
    section_num: sectionNum,
    jurisdiction: "at",
    text,
    commentary_subtype: "explanatory_note",
  } as CommentaryItem;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
