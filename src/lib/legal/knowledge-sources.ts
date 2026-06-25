/**
 * Gap 8: Knowledge Sources — RIS-Connector + Rechtsdatenbank-Integration.
 *
 * Harvey-Feature: "500+ legal data sources across the globe" — kuratierte
 * Rechtsdatenbanken, Fallrecht, Gesetze.
 *
 * Subsumio-Status vor Gap 8: Nur `perplexity_research` als externer Source.
 *
 * Dieser Connector bietet:
 * - RIS-Österreich (Rechtsinformationssystem des Bundes) — Gesetze + Judikatur
 * - RIS-Justiz (Oberster Gerichtshof) — OGH-Entscheidungen
 * - Direkte API-Calls mit Caching + Rate-Limiting
 * - Einheitliches Interface für alle Rechtsquellen
 *
 * Usage:
 *   const connector = new RisConnector();
 *   const laws = await connector.searchLaws("StPO", "110");
 *   const cases = await connector.searchCases("Amtshaftung", "OGH");
 */

const RIS_BASE_URL = "https://www.ris.bka.gv.at";
const RIS_SEARCH_URL = `${RIS_BASE_URL}/Bundesrecht`;
const RIS_JUDIKATUR_URL = `${RIS_BASE_URL}/Judikatur`;

export interface LegalSourceResult {
  source: string;
  title: string;
  paragraph?: string;
  law_abbreviation?: string;
  date?: string;
  url: string;
  snippet: string;
  full_text?: string;
}

export interface LegalSourceConnector {
  name: string;
  isConfigured(): boolean;
  searchLaws(query: string, paragraph?: string): Promise<LegalSourceResult[]>;
  searchCases(query: string, court?: string): Promise<LegalSourceResult[]>;
  getParagraph(law: string, paragraph: string): Promise<LegalSourceResult | null>;
}

interface CacheEntry {
  results: LegalSourceResult[];
  timestamp: number;
}

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const RATE_LIMIT_MS = 500; // 500ms between requests
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * RIS-Connector für österreichisches Bundesrecht + Judikatur.
 * Nutzt die öffentliche RIS-Website (keine offizielle API, aber strukturiert).
 */
export class RisConnector implements LegalSourceConnector {
  name = "RIS-Österreich";
  private cache = new Map<string, CacheEntry>();
  private lastRequest = 0;

  isConfigured(): boolean {
    return true; // RIS ist öffentlich, keine API-Keys nötig
  }

  private async rateLimitedFetch(url: string): Promise<string | null> {
    const now = Date.now();
    const wait = Math.max(0, this.lastRequest + RATE_LIMIT_MS - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequest = Date.now();

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent": "Subsumio-Legal-AI/1.0 (legal research; +https://subsumio.at)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  private getCached(key: string): LegalSourceResult[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.results;
  }

  private setCached(key: string, results: LegalSourceResult[]): void {
    this.cache.set(key, { results, timestamp: Date.now() });
  }

  async searchLaws(query: string, paragraph?: string): Promise<LegalSourceResult[]> {
    const cacheKey = `laws:${query}:${paragraph ?? ""}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // RIS Bundesrecht Suche
    const params = new URLSearchParams({
      Suchbegriff: paragraph ? `${paragraph} ${query}` : query,
      Seite: "1",
      Anzahl: "20",
    });
    const url = `${RIS_SEARCH_URL}?${params.toString()}`;
    const html = await this.rateLimitedFetch(url);
    if (!html) return [];

    const results = this.parseRisLawResults(html);
    this.setCached(cacheKey, results);
    return results;
  }

  async searchCases(query: string, court?: string): Promise<LegalSourceResult[]> {
    const cacheKey = `cases:${query}:${court ?? ""}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      Suchbegriff: query,
      Seite: "1",
      Anzahl: "20",
    });
    if (court) {
      params.set("Gericht", court);
    }
    const url = `${RIS_JUDIKATUR_URL}?${params.toString()}`;
    const html = await this.rateLimitedFetch(url);
    if (!html) return [];

    const results = this.parseRisCaseResults(html);
    this.setCached(cacheKey, results);
    return results;
  }

  async getParagraph(law: string, paragraph: string): Promise<LegalSourceResult | null> {
    const cacheKey = `para:${law}:${paragraph}`;
    const cached = this.getCached(cacheKey);
    if (cached && cached.length > 0) return cached[0]!;

    const results = await this.searchLaws(law, paragraph);
    const exact = results.find(
      (r) => r.law_abbreviation?.toUpperCase() === law.toUpperCase() && r.paragraph === paragraph
    );
    if (exact) {
      this.setCached(cacheKey, [exact]);
      return exact;
    }
    return results[0] ?? null;
  }

  private parseRisLawResults(html: string): LegalSourceResult[] {
    const results: LegalSourceResult[] = [];
    // Parse RIS HTML — look for result entries
    // RIS uses <div class="result"> or similar structures
    const resultRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null && results.length < 20) {
      const block = match[1]!;
      const title = this.extractText(block, /<h[23][^>]*>(.*?)<\/h[23]>/i);
      const url = this.extractHref(block);
      const snippet = this.extractText(block, /<p[^>]*>(.*?)<\/p>/i);
      const lawMatch = block.match(/\(([^)]+)\)/);
      const paraMatch = block.match(/§\s*(\d+[a-z]?(?:\s*Abs\.\s*\d+)?)\s*([A-Z]+)/i);

      results.push({
        source: "RIS-Bundesrecht",
        title: title || "Unbenannt",
        paragraph: paraMatch?.[1],
        law_abbreviation: paraMatch?.[2] ?? lawMatch?.[1],
        url: url ? `${RIS_BASE_URL}${url}` : RIS_SEARCH_URL,
        snippet: snippet || "",
      });
    }
    return results;
  }

  private parseRisCaseResults(html: string): LegalSourceResult[] {
    const results: LegalSourceResult[] = [];
    const resultRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null && results.length < 20) {
      const block = match[1]!;
      const title = this.extractText(block, /<h[23][^>]*>(.*?)<\/h[23]>/i);
      const url = this.extractHref(block);
      const snippet = this.extractText(block, /<p[^>]*>(.*?)<\/p>/i);
      const dateMatch = block.match(/(\d{2}\.\d{2}\.\d{4})/);
      const _courtMatch = block.match(/(OGH|VwGH|VfGH|EuGH|LG|BG|OLG|OAG)/);

      results.push({
        source: "RIS-Judikatur",
        title: title || "Unbenannt",
        date: dateMatch?.[1],
        url: url ? `${RIS_BASE_URL}${url}` : RIS_JUDIKATUR_URL,
        snippet: snippet || "",
      });
    }
    return results;
  }

  private extractText(html: string, regex: RegExp): string | null {
    const match = html.match(regex);
    if (!match) return null;
    return match[1]!.replace(/<[^>]+>/g, "").trim();
  }

  private extractHref(html: string): string | null {
    const match = html.match(/href="([^"]+)"/i);
    return match?.[1] ?? null;
  }
}

/**
 * Perplexity-Connector als Fallback/Supplement für nicht-AT Recht.
 * Nutzt die bestehende perplexity_research-Infrastruktur.
 */
export class PerplexityLegalConnector implements LegalSourceConnector {
  name = "Perplexity-Legal";

  isConfigured(): boolean {
    return Boolean(process.env.PERPLEXITY_API_KEY);
  }

  async searchLaws(_query: string, _paragraph?: string): Promise<LegalSourceResult[]> {
    // Perplexity wird als Tool im Specialist-Loop aufgerufen,
    // nicht als direkte API. Hier nur Interface-Kompatibilität.
    return [];
  }

  async searchCases(_query: string, _court?: string): Promise<LegalSourceResult[]> {
    return [];
  }

  async getParagraph(_law: string, _paragraph: string): Promise<LegalSourceResult | null> {
    return null;
  }
}

/**
 * Unified Knowledge Sources Manager — kombiniert alle verfügbaren Connectors.
 */
export class KnowledgeSourcesManager {
  private connectors: LegalSourceConnector[] = [];

  constructor() {
    this.connectors.push(new RisConnector());
    this.connectors.push(new PerplexityLegalConnector());
  }

  getAvailableSources(): Array<{ name: string; configured: boolean }> {
    return this.connectors.map((c) => ({ name: c.name, configured: c.isConfigured() }));
  }

  async searchLaws(query: string, paragraph?: string): Promise<LegalSourceResult[]> {
    const allResults: LegalSourceResult[] = [];
    for (const connector of this.connectors) {
      if (!connector.isConfigured()) continue;
      try {
        const results = await connector.searchLaws(query, paragraph);
        allResults.push(...results);
      } catch (err) {
        console.warn(`[knowledge-sources] ${connector.name} searchLaws failed:`, err);
      }
    }
    return allResults;
  }

  async searchCases(query: string, court?: string): Promise<LegalSourceResult[]> {
    const allResults: LegalSourceResult[] = [];
    for (const connector of this.connectors) {
      if (!connector.isConfigured()) continue;
      try {
        const results = await connector.searchCases(query, court);
        allResults.push(...results);
      } catch (err) {
        console.warn(`[knowledge-sources] ${connector.name} searchCases failed:`, err);
      }
    }
    return allResults;
  }

  async getParagraph(law: string, paragraph: string): Promise<LegalSourceResult | null> {
    for (const connector of this.connectors) {
      if (!connector.isConfigured()) continue;
      try {
        const result = await connector.getParagraph(law, paragraph);
        if (result) return result;
      } catch (err) {
        console.warn(`[knowledge-sources] ${connector.name} getParagraph failed:`, err);
      }
    }
    return null;
  }
}

/**
 * Singleton instance for app-wide use.
 */
let _manager: KnowledgeSourcesManager | null = null;
export function getKnowledgeSources(): KnowledgeSourcesManager {
  if (!_manager) _manager = new KnowledgeSourcesManager();
  return _manager;
}
