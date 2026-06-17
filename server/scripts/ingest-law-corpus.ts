/**
 * Law-corpus ingestion v1 — Germany + Austria, from OFFICIAL sources only.
 *
 *   bun scripts/ingest-law-corpus.ts [--only stgb,abgb] [--out ../law-corpus]
 *
 * Sources & licensing:
 * - DE: gesetze-im-internet.de XML (Bundesamt für Justiz). Amtliche Werke,
 *   § 5 UrhG — public domain. The XML carries `builddate` = the consolidation
 *   version stamp we persist.
 * - AT: RIS GeltendeFassung (Bundeskanzleramt, OGD). Konsolidierte Fassung
 *   zum Abrufdatum; we stamp the retrieval date as the version anchor and
 *   attribute RIS as required by the OGD terms.
 *
 * Output: one markdown file per law in <out>/{de,at}/, frontmatter-stamped
 * (type: law, jurisdiction, abbreviation, version_date, retrieved_at,
 * source_url, license). Import into a dedicated source afterwards:
 *
 *   gbrain sources add law-de <out>/de && gbrain import <out>/de --source-id law-de
 *   gbrain sources add law-at <out>/at && gbrain import <out>/at --source-id law-at
 *
 * HONESTY SCOPE (mirrors /compare): this gives the brain CITABLE STATUTE
 * TEXT with a version stamp. It is not legal research à la beck-online
 * (no Kommentare, no Rechtsprechungsketten, no editorial consolidation
 * guarantees) and the brain still never computes legal conclusions —
 * answers cite §§ so the professional can verify.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';

interface DeLaw {
  slug: string; // gesetze-im-internet.de/<slug>/xml.zip
  abbr: string;
  title: string;
}

interface AtLaw {
  /** Title term for the RIS BrKons API search query. The Gesetzesnummer is
   *  resolved dynamically (hardcoded numbers proved wrong in testing). */
  searchTitle: string;
  /** Exact RIS Kurztitel to match a result on, when it differs from the search
   *  query term (e.g. query "Gesetz über Gesellschaften mit beschränkter
   *  Haftung" → Kurztitel "GmbH-Gesetz"; query "Aktiengesetz 1965" → "Aktiengesetz").
   *  Defaults to searchTitle. */
  matchTitle?: string;
  abbr: string;
  title: string;
}

// Starter set — the load-bearing codes for our legal + tax verticals.
// Extend deliberately; every entry costs corpus size and sync time.
const DE_LAWS: DeLaw[] = [
  { slug: 'gg', abbr: 'GG', title: 'Grundgesetz für die Bundesrepublik Deutschland' },
  { slug: 'bgb', abbr: 'BGB', title: 'Bürgerliches Gesetzbuch' },
  { slug: 'stgb', abbr: 'StGB', title: 'Strafgesetzbuch' },
  { slug: 'zpo', abbr: 'ZPO', title: 'Zivilprozessordnung' },
  { slug: 'stpo', abbr: 'StPO', title: 'Strafprozeßordnung' },
  { slug: 'hgb', abbr: 'HGB', title: 'Handelsgesetzbuch' },
  { slug: 'uwg_2004', abbr: 'UWG', title: 'Gesetz gegen den unlauteren Wettbewerb' },
  { slug: 'ao_1977', abbr: 'AO', title: 'Abgabenordnung' },
  { slug: 'estg', abbr: 'EStG', title: 'Einkommensteuergesetz' },
  { slug: 'ustg_1980', abbr: 'UStG', title: 'Umsatzsteuergesetz' },
  { slug: 'famfg', abbr: 'FamFG', title: 'Gesetz über das Verfahren in Familiensachen und in den Angelegenheiten der freiwilligen Gerichtsbarkeit' },
  { slug: 'gmbhg', abbr: 'GmbHG', title: 'Gesetz betreffend die Gesellschaften mit beschränkter Haftung' },
  { slug: 'inso', abbr: 'InsO', title: 'Insolvenzordnung' },
];

const AT_LAWS: AtLaw[] = [
  { searchTitle: 'Allgemeines bürgerliches Gesetzbuch', abbr: 'ABGB', title: 'Allgemeines bürgerliches Gesetzbuch' },
  { searchTitle: 'Strafgesetzbuch', abbr: 'StGB-AT', title: 'Strafgesetzbuch (Österreich)' },
  { searchTitle: 'Amtshaftungsgesetz', abbr: 'AHG', title: 'Amtshaftungsgesetz' },
  { searchTitle: 'Zivilprozessordnung', abbr: 'ZPO-AT', title: 'Zivilprozessordnung (Österreich)' },
  { searchTitle: 'Unternehmensgesetzbuch', abbr: 'UGB', title: 'Unternehmensgesetzbuch' },
  { searchTitle: 'Bundesabgabenordnung', abbr: 'BAO', title: 'Bundesabgabenordnung' },
  { searchTitle: 'Exekutionsordnung', abbr: 'EO', title: 'Exekutionsordnung' },
  { searchTitle: 'Strafprozeßordnung 1975', abbr: 'StPO-AT', title: 'Strafprozeßordnung 1975 (Österreich)' },
  // Tax (AT-specific — the DE EStG/UStG do NOT apply in Austria).
  { searchTitle: 'Einkommensteuergesetz 1988', abbr: 'EStG-AT', title: 'Einkommensteuergesetz 1988 (Österreich)' },
  { searchTitle: 'Körperschaftsteuergesetz 1988', abbr: 'KStG-AT', title: 'Körperschaftsteuergesetz 1988 (Österreich)' },
  { searchTitle: 'Umsatzsteuergesetz 1994', abbr: 'UStG-AT', title: 'Umsatzsteuergesetz 1994 (Österreich)' },
  // Labour + social insurance.
  { searchTitle: 'Allgemeines Sozialversicherungsgesetz', abbr: 'ASVG', title: 'Allgemeines Sozialversicherungsgesetz' },
  { searchTitle: 'Arbeitsverfassungsgesetz', abbr: 'ArbVG', title: 'Arbeitsverfassungsgesetz' },
  { searchTitle: 'Angestelltengesetz', abbr: 'AngG', title: 'Angestelltengesetz' },
  // Consumer + tenancy.
  { searchTitle: 'Konsumentenschutzgesetz', abbr: 'KSchG', title: 'Konsumentenschutzgesetz' },
  { searchTitle: 'Mietrechtsgesetz', abbr: 'MRG', title: 'Mietrechtsgesetz' },
  // Corporate + insolvency.
  { searchTitle: 'Gesetz über Gesellschaften mit beschränkter Haftung', matchTitle: 'GmbH-Gesetz', abbr: 'GmbHG-AT', title: 'GmbH-Gesetz (Österreich)' },
  { searchTitle: 'Aktiengesetz 1965', matchTitle: 'Aktiengesetz', abbr: 'AktG-AT', title: 'Aktiengesetz (Österreich)' },
  { searchTitle: 'Insolvenzordnung', abbr: 'IO', title: 'Insolvenzordnung (Österreich)' },
  // Administrative + traffic + data protection.
  { searchTitle: 'Allgemeines Verwaltungsverfahrensgesetz 1991', abbr: 'AVG', title: 'Allgemeines Verwaltungsverfahrensgesetz 1991' },
  { searchTitle: 'Straßenverkehrsordnung 1960', abbr: 'StVO-AT', title: 'Straßenverkehrsordnung 1960 (Österreich)' },
  { searchTitle: 'Datenschutzgesetz', abbr: 'DSG-AT', title: 'Datenschutzgesetz (Österreich)' },
];

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx !== -1 ? new Set(args[onlyIdx + 1].split(',').map((s) => s.trim().toLowerCase())) : null;
const outIdx = args.indexOf('--out');
const OUT = outIdx !== -1 ? args[outIdx + 1] : join(import.meta.dir, '..', '..', 'law-corpus');

const RETRIEVED_AT = new Date().toISOString().slice(0, 10);

function yamlEscape(v: string): string {
  return JSON.stringify(v);
}

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${yamlEscape(v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** All text content of a node, paragraphs separated. */
function nodeText(node: Node | null): string {
  if (!node) return '';
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      parts.push(n.nodeValue ?? '');
      return;
    }
    const name = n.nodeName.toUpperCase();
    if (name === 'P' || name === 'BR') parts.push('\n');
    for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  };
  walk(node);
  return parts.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function firstByTag(el: Element | Document, tag: string): Element | null {
  const list = el.getElementsByTagName(tag);
  return list.length > 0 ? (list.item(0) as Element) : null;
}

async function fetchDe(law: DeLaw): Promise<{ markdown: string; versionDate: string } | null> {
  const url = `https://www.gesetze-im-internet.de/${law.slug}/xml.zip`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  [de:${law.abbr}] HTTP ${res.status} for ${url}`);
    return null;
  }
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const xmlName = Object.keys(zip.files).find((f) => f.endsWith('.xml'));
  if (!xmlName) {
    console.error(`  [de:${law.abbr}] no XML in zip`);
    return null;
  }
  const xml = await zip.files[xmlName].async('string');
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(xml, 'text/xml');

  const dokumente = firstByTag(doc, 'dokumente');
  const builddate = dokumente?.getAttribute('builddate') ?? '';
  // builddate format: YYYYMMDDhhmmss → YYYY-MM-DD
  const versionDate = builddate
    ? `${builddate.slice(0, 4)}-${builddate.slice(4, 6)}-${builddate.slice(6, 8)}`
    : RETRIEVED_AT;

  const norms = doc.getElementsByTagName('norm');
  const sections: string[] = [];
  for (let i = 0; i < norms.length; i++) {
    const norm = norms.item(i) as Element;
    const enbez = nodeText(firstByTag(norm, 'enbez'));
    const titel = nodeText(firstByTag(norm, 'titel'));
    const textEl = firstByTag(norm, 'textdaten');
    const body = nodeText(textEl ? firstByTag(textEl, 'text') : null);
    if (!enbez && !body) continue; // structural norms (TOC containers)
    const heading = [enbez, titel].filter(Boolean).join(' — ');
    if (heading && body) sections.push(`## ${heading}\n\n${body}`);
    else if (body) sections.push(body);
  }
  if (sections.length === 0) {
    console.error(`  [de:${law.abbr}] parsed 0 norms — format change?`);
    return null;
  }

  const fm = frontmatter({
    title: `${law.abbr} — ${law.title}`,
    type: 'law',
    jurisdiction: 'de',
    abbreviation: law.abbr,
    version_date: versionDate,
    retrieved_at: RETRIEVED_AT,
    source_url: url,
    license: 'Amtliches Werk, § 5 UrhG (gemeinfrei). Quelle: gesetze-im-internet.de, Bundesamt für Justiz.',
  });
  return { markdown: `${fm}\n${sections.join('\n\n')}\n`, versionDate };
}

const RIS_UA = { 'User-Agent': 'sigmabrain-law-corpus/1.0 (corpus build; contact: hello@sigmabrain.com)' };

/** Resolve the RIS Gesetzesnummer via the OGD API + one norm page (the
 *  API search result links the norm; the norm page carries the number). */
async function resolveGesetzesnummer(law: AtLaw): Promise<string | null> {
  // Title search ranks related laws first ("Einführungsgesetz zur
  // Exekutionsordnung" beats "Exekutionsordnung" on page 1) — paginate
  // until the EXACT Kurztitel shows up.
  for (let pageNo = 1; pageNo <= 8; pageNo++) {
    const api = `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Titel=${encodeURIComponent(law.searchTitle)}&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}`;
    const res = await fetch(api, { headers: RIS_UA });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    try {
      const result = (data.OgdSearchResult as Record<string, unknown>).OgdDocumentResults as Record<string, unknown>;
      let refs = result.OgdDocumentReference as Array<Record<string, unknown>> | Record<string, unknown> | undefined;
      if (!refs) return null; // past the last page
      if (!Array.isArray(refs)) refs = [refs];
      for (const ref of refs as Array<Record<string, unknown>>) {
        const meta = (ref.Data as Record<string, unknown>)?.Metadaten as Record<string, unknown> | undefined;
        const bund = meta?.Bundesrecht as Record<string, unknown> | undefined;
        if (bund?.Kurztitel !== (law.matchTitle ?? law.searchTitle)) continue;
        const docUrl = (meta?.Allgemein as Record<string, unknown> | undefined)?.DokumentUrl as string | undefined;
        if (!docUrl) continue;
        const page = await fetch(docUrl, { headers: RIS_UA, redirect: 'follow' });
        if (!page.ok) continue;
        const m = (await page.text()).match(/Gesetzesnummer=(\d+)/);
        if (m) return m[1];
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchAt(law: AtLaw): Promise<{ markdown: string; versionDate: string } | null> {
  const nr = await resolveGesetzesnummer(law);
  if (!nr) {
    console.error(`  [at:${law.abbr}] could not resolve Gesetzesnummer via RIS API`);
    return null;
  }

  // The GeltendeFassung page links the OFFICIAL whole-law PDF
  // ("…, Fassung vom DD.MM.YYYY.pdf") — one fetch, clean text via our own
  // PDF extractor, and the link text doubles as the consolidation stamp.
  const pageUrl = `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${nr}`;
  const pageRes = await fetch(pageUrl, { headers: RIS_UA });
  if (!pageRes.ok) {
    console.error(`  [at:${law.abbr}] HTTP ${pageRes.status} for ${pageUrl}`);
    return null;
  }
  const pageHtml = await pageRes.text();
  const pdfMatch = pageHtml.match(/href="(\/GeltendeFassung\/Bundesnormen\/\d+\/[^"]*Fassung%20vom%20([\d.]+)\.pdf)"/);
  if (!pdfMatch) {
    console.error(`  [at:${law.abbr}] no whole-law PDF link found on GeltendeFassung page`);
    return null;
  }
  const pdfUrl = `https://www.ris.bka.gv.at${pdfMatch[1]}`;
  // DD.MM.YYYY → YYYY-MM-DD
  const [dd, mm, yyyy] = pdfMatch[2].split('.');
  const versionDate = `${yyyy}-${mm}-${dd}`;

  const pdfRes = await fetch(pdfUrl, { headers: RIS_UA });
  if (!pdfRes.ok) {
    console.error(`  [at:${law.abbr}] HTTP ${pdfRes.status} for ${pdfUrl}`);
    return null;
  }
  const { extractDocumentText } = await import('../src/core/extract-document.ts');
  const extracted = await extractDocumentText(Buffer.from(await pdfRes.arrayBuffer()), '.pdf');
  let text = extracted.text;
  if (text.length < 5_000 || !text.includes('§')) {
    console.error(`  [at:${law.abbr}] suspicious extraction (${text.length} chars) — skipped`);
    return null;
  }
  if (text.length > 4_000_000) text = text.slice(0, 4_000_000);

  const fm = frontmatter({
    title: `${law.abbr} — ${law.title}`,
    type: 'law',
    jurisdiction: 'at',
    abbreviation: law.abbr,
    version_date: versionDate,
    retrieved_at: RETRIEVED_AT,
    source_url: pdfUrl,
    license: 'Quelle: RIS (ris.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung.',
  });
  return { markdown: `${fm}\n${text}\n`, versionDate };
}

async function main() {
  mkdirSync(join(OUT, 'de'), { recursive: true });
  mkdirSync(join(OUT, 'at'), { recursive: true });

  let ok = 0;
  let failed = 0;

  for (const law of DE_LAWS) {
    if (only && !only.has(law.slug) && !only.has(law.abbr.toLowerCase())) continue;
    process.stderr.write(`[de] ${law.abbr} …\n`);
    try {
      const result = await fetchDe(law);
      if (!result) {
        failed++;
        continue;
      }
      const file = join(OUT, 'de', `${law.abbr.toLowerCase()}.md`);
      writeFileSync(file, result.markdown, 'utf-8');
      console.error(`  [de:${law.abbr}] ok — Stand ${result.versionDate}, ${(result.markdown.length / 1024).toFixed(0)} KB`);
      ok++;
    } catch (err) {
      console.error(`  [de:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  for (const law of AT_LAWS) {
    if (only && !only.has(law.abbr.toLowerCase())) continue;
    process.stderr.write(`[at] ${law.abbr} …\n`);
    try {
      const result = await fetchAt(law);
      if (!result) {
        failed++;
        continue;
      }
      const file = join(OUT, 'at', `${law.abbr.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.md`);
      writeFileSync(file, result.markdown, 'utf-8');
      console.error(`  [at:${law.abbr}] ok — Fassung vom ${result.versionDate}, ${(result.markdown.length / 1024).toFixed(0)} KB`);
      ok++;
    } catch (err) {
      console.error(`  [at:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.error(`\nDone: ${ok} ok, ${failed} failed → ${OUT}`);
  console.error(`Import:\n  gbrain sources add law-de ${join(OUT, 'de')} && gbrain import ${join(OUT, 'de')} --source-id law-de`);
  console.error(`  gbrain sources add law-at ${join(OUT, 'at')} && gbrain import ${join(OUT, 'at')} --source-id law-at`);
  if (failed > 0) process.exit(1);
}

main();
