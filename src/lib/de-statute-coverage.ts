/**
 * de-statute-coverage.ts — WP-6.38 Soll-Ist-Abgleich je Gesetz (DE).
 *
 * Soll: `gii-toc.xml` von gesetze-im-internet.de — das amtliche
 * Inhaltsverzeichnis aller geltenden Bundesgesetze des Bundesamts für
 * Justiz (~5.000 Einträge, Format `<item><title>…</title><link>…/
 * <slug>/xml.zip</link></item>`).
 *
 * Ist: die `law-de`-Source im Brain — jede Gesetzes-Page trägt ihren
 * gii-Slug in `frontmatter.source_url` (`…/<slug>/xml.zip`) bzw. im
 * Page-Slug. Der Abgleich meldet, welche Bundesgesetze im Corpus fehlen
 * (z. B. nach einer Novelle, die ein Gesetz neu eingeführt hat).
 */

export interface GiiLaw {
  /** gii-Slug — Pfadsegment vor `/xml.zip` (z. B. "bgb", "ao_1977"). */
  slug: string;
  /** Amtlicher Langtitel. */
  title: string;
}

const ITEM_RE =
  /<item>\s*<title>([\s\S]*?)<\/title>\s*<link>\s*[^<]*?\/([^/<>\s]+)\/xml\.zip\s*<\/link>\s*<\/item>/g;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** Parst das gii-TOC-XML. Tolerant gegen Whitespace und Entities. */
export function parseGiiToc(xml: string): GiiLaw[] {
  const out: GiiLaw[] = [];
  for (const m of xml.matchAll(ITEM_RE)) {
    const title = decodeXmlEntities(m[1]!);
    const slug = m[2]!.toLowerCase();
    if (slug) out.push({ slug, title });
  }
  return out;
}

export const GII_TOC_URL = "https://www.gesetze-im-internet.de/gii-toc.xml";

/** Lädt das amtliche Inhaltsverzeichnis (Timeout 20 s). */
export async function fetchGiiToc(
  fetchImpl: typeof fetch = fetch,
  url: string = GII_TOC_URL
): Promise<GiiLaw[]> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`gii-toc HTTP ${res.status}`);
  return parseGiiToc(await res.text());
}

/**
 * Extrahiert den gii-Slug aus einer law-de-Page: bevorzugt aus
 * `frontmatter.source_url`, sonst aus dem letzten Slug-Segment.
 */
export function pageSlugToGiiSlug(page: {
  slug: string;
  frontmatter?: Record<string, unknown> | null;
}): string | null {
  const url = page.frontmatter?.source_url;
  if (typeof url === "string") {
    const m = /gesetze-im-internet\.de\/([^/\s]+)\/xml\.zip/i.exec(url);
    if (m) return m[1]!.toLowerCase();
  }
  const last = page.slug.split("/").pop()?.toLowerCase();
  return last || null;
}

export interface DeStatuteCoverage {
  upstream_total: number;
  in_corpus: number;
  coverage_pct: number;
  /** Fehlende Gesetze (Slug + Titel), auf `missingCap` begrenzt. */
  missing: GiiLaw[];
  /** Wurde `missing` gekappt? */
  missing_truncated: boolean;
  fetched_at: string;
}

/**
 * Vergleicht das gii-TOC mit den im Corpus vorhandenen gii-Slugs.
 * `missing` wird alphabetisch sortiert und gekappt (Default 300), damit
 * die Admin-Response klein bleibt.
 */
export function auditDeStatutes(
  upstream: GiiLaw[],
  presentSlugs: Set<string>,
  missingCap = 300
): DeStatuteCoverage {
  const missing = upstream
    .filter((law) => !presentSlugs.has(law.slug))
    .sort((a, b) => a.title.localeCompare(b.title, "de"));
  const inCorpus = upstream.length - missing.length;
  return {
    upstream_total: upstream.length,
    in_corpus: inCorpus,
    coverage_pct: upstream.length > 0 ? Math.round((inCorpus / upstream.length) * 1000) / 10 : 100,
    missing: missing.slice(0, missingCap),
    missing_truncated: missing.length > missingCap,
    fetched_at: new Date().toISOString(),
  };
}
