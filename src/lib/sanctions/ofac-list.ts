/**
 * OFAC SDN List (WP-4.18) — US-Sanktionsliste des Office of Foreign Assets
 * Control. Relevant für Kanzleien mit US-Bezug (§ 8c RAO deckt EU ab;
 * internationale Mandate verlangen oft OFAC-Prüfung).
 *
 * Quelle: https://www.treasury.gov/ofac/downloads/sdn.xml
 * Format: <sdnList><sdnEntry> mit uid, firstName/lastName, sdnType,
 * programList, akaList, dateOfBirthList, addressList.
 */

import type { SanctionsEntry, SanctionsList } from "./eu-list";

export const OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";

function decodeXml(v: string): string {
  return v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? decodeXml(m[1]).trim() : "";
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** Ein <sdnEntry>-Block → Eintrag. Exported for tests. */
export function parseSdnEntry(block: string): SanctionsEntry | null {
  const uid = tag(block, "uid");
  const primary = [tag(block, "firstName"), tag(block, "lastName")].filter(Boolean).join(" ");
  const names: string[] = [primary];
  for (const m of block.matchAll(/<aka>[\s\S]*?<\/aka>/g)) {
    const aka = [tag(m[0], "firstName"), tag(m[0], "lastName")].filter(Boolean).join(" ");
    if (aka) names.push(aka);
  }
  const birthDates: string[] = [];
  for (const m of block.matchAll(/<dateOfBirth>([\s\S]*?)<\/dateOfBirth>/g)) {
    const d = decodeXml(m[1]).trim();
    if (d) birthDates.push(d);
  }
  const countries: string[] = [];
  for (const m of block.matchAll(/<nationality>[\s\S]*?<\/nationality>/g)) {
    const c = tag(m[0], "country");
    if (c) countries.push(c);
  }
  for (const m of block.matchAll(/<address>[\s\S]*?<\/address>/g)) {
    const c = tag(m[0], "country");
    if (c) countries.push(c);
  }
  const programmes: string[] = [];
  for (const m of block.matchAll(/<program>([\s\S]*?)<\/program>/g)) {
    programmes.push(decodeXml(m[1]));
  }
  const sdnType = tag(block, "sdnType");
  const cleanNames = uniq(names);
  if (cleanNames.length === 0) return null;
  return {
    reference: uid ? `OFAC.${uid}` : cleanNames[0],
    entityType:
      sdnType === "Individual" ? "person" : sdnType === "Entity" ? "enterprise" : "unknown",
    primaryName: cleanNames.reduce((a, b) => (b.length > a.length ? b : a), cleanNames[0]),
    names: cleanNames,
    birthDates: uniq(birthDates),
    countries: uniq(countries),
    programmes: uniq(programmes),
    remark: tag(block, "remarks") || undefined,
  };
}

export function parseSdnXml(xml: string): SanctionsList {
  const publishDate = tag(xml, "Publish_Date");
  const entries: SanctionsEntry[] = [];
  for (const m of xml.matchAll(/<sdnEntry>[\s\S]*?<\/sdnEntry>/g)) {
    const e = parseSdnEntry(m[0]);
    if (e) entries.push(e);
  }
  return { generatedAt: publishDate || new Date().toISOString(), entries };
}

export async function fetchOfacSdnList(
  url = OFAC_SDN_URL,
  timeoutMs = 180_000
): Promise<SanctionsList> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OFAC-SDN-Liste nicht abrufbar: HTTP ${res.status}`);
  const list = parseSdnXml(await res.text());
  if (list.entries.length < 100) {
    throw new Error(`OFAC-SDN-Liste unplausibel klein (${list.entries.length} Einträge)`);
  }
  return list;
}
