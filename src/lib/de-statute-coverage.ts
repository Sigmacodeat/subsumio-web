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

// ── Persistenter TOC-Cache ────────────────────────────────────────────
// Das TOC ändert sich selten (Novellen/Konsolidierungen); ohne Cache würde
// jeder Audit-Request und jeder Prozess-Neustart ~1 MB von gii ziehen.
// Zweistufig: In-Memory für die Prozesslaufzeit, tmpdir-Datei über
// Neustarts hinweg (24 h TTL). Fail-open: Cache-Fehler → direkter Fetch.

const GII_TOC_TTL_MS = 24 * 60 * 60 * 1000;
let memCache: { laws: GiiLaw[]; fetchedAt: number } | null = null;

async function cacheFilePath(): Promise<string | null> {
  try {
    // node:os/tmpdir existiert nur serverseitig — die Lib wird auch
    // clientseitig für Typen importiert, daher dynamisch + guarded.
    if (typeof process === "undefined" || !process.versions?.node) return null;
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    return join(tmpdir(), "subsumio-gii-toc.json");
  } catch {
    return null;
  }
}

async function readTocFileCache(): Promise<GiiLaw[] | null> {
  const file = await cacheFilePath();
  if (!file) return null;
  try {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(file, "utf-8")) as {
      fetchedAt?: number;
      laws?: GiiLaw[];
    };
    if (
      typeof raw.fetchedAt !== "number" ||
      Date.now() - raw.fetchedAt > GII_TOC_TTL_MS ||
      !Array.isArray(raw.laws)
    ) {
      return null;
    }
    return raw.laws;
  } catch {
    return null;
  }
}

async function writeTocFileCache(laws: GiiLaw[]): Promise<void> {
  const file = await cacheFilePath();
  if (!file) return;
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), laws }));
  } catch {
    /* Cache-Schreibfehler sind unkritisch */
  }
}

/**
 * Lädt das gii-TOC mit 24-h-Cache (Memory + tmpdir-Datei). Nur für
 * Server-Routen gedacht — der Audit darf nicht bei jedem Dashboard-
 * Aufruf das Bundesamt für Justiz belasten.
 */
export async function fetchGiiTocCached(): Promise<GiiLaw[]> {
  if (memCache && Date.now() - memCache.fetchedAt < GII_TOC_TTL_MS) {
    return memCache.laws;
  }
  const fromFile = await readTocFileCache();
  if (fromFile) {
    memCache = { laws: fromFile, fetchedAt: Date.now() };
    return fromFile;
  }
  const laws = await fetchGiiToc();
  memCache = { laws, fetchedAt: Date.now() };
  await writeTocFileCache(laws);
  return laws;
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

export interface DeStatuteTargetCoverage {
  /** Anzahl konfigurierter Ziel-Gesetze (de-law-targets.ts). */
  total: number;
  in_corpus: number;
  /** Ziel-Gesetze, die im Corpus fehlen (unkappt — Liste ist klein). */
  missing: GiiLaw[];
}

export interface DeStatuteCoverage {
  upstream_total: number;
  in_corpus: number;
  coverage_pct: number;
  /** Fehlende Gesetze (Slug + Titel), auf `missingCap` begrenzt. */
  missing: GiiLaw[];
  /** Wurde `missing` gekappt? */
  missing_truncated: boolean;
  /**
   * Konfiguriertes Ziel-Set (`DE_LAW_TARGETS`) gegen den Ist-Bestand —
   * das ist die Zusage „diese Kerngesetze sind vollständig", getrennt
   * vom Gesamtkatalog (~6.100 Einträge, den wir bewusst nicht komplett
   * spiegeln).
   */
  target: DeStatuteTargetCoverage;
  fetched_at: string;
}

/**
 * Vergleicht das gii-TOC mit den im Corpus vorhandenen gii-Slugs.
 * `missing` wird alphabetisch sortiert und gekappt (Default 300), damit
 * die Admin-Response klein bleibt. `targetSlugs` markiert das
 * konfigurierte Pflicht-Set — fehlt eines davon, ist das ein echter
 * Corpus-Defekt, nicht nur fehlende Gesamt-Abdeckung.
 */
export function auditDeStatutes(
  upstream: GiiLaw[],
  presentSlugs: Set<string>,
  targetSlugs: readonly string[] = [],
  missingCap = 300
): DeStatuteCoverage {
  const missing = upstream
    .filter((law) => !presentSlugs.has(law.slug))
    .sort((a, b) => a.title.localeCompare(b.title, "de"));
  const inCorpus = upstream.length - missing.length;

  // Ziel-Gesetze, die es im amtlichen TOC gar nicht gibt (Tippfehler im
  // Slug, umbenanntes Gesetz), zählen ebenfalls als fehlend — der Titel
  // fällt dann auf den Slug zurück.
  const upstreamBySlug = new Map(upstream.map((l) => [l.slug, l]));
  const targetMissing: GiiLaw[] = targetSlugs
    .filter((s) => !presentSlugs.has(s))
    .map((s) => upstreamBySlug.get(s) ?? { slug: s, title: s });

  return {
    upstream_total: upstream.length,
    in_corpus: inCorpus,
    coverage_pct: upstream.length > 0 ? Math.round((inCorpus / upstream.length) * 1000) / 10 : 100,
    missing: missing.slice(0, missingCap),
    missing_truncated: missing.length > missingCap,
    target: {
      total: targetSlugs.length,
      in_corpus: targetSlugs.length - targetMissing.length,
      missing: targetMissing,
    },
    fetched_at: new Date().toISOString(),
  };
}
