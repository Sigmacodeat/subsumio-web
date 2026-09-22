/**
 * UN Security Council Consolidated List (WP-4.18).
 *
 * Quelle: https://scsanctions.un.org/resources/xml/en/consolidated.xml
 * Format: <INDIVIDUALS>/<INDIVIDUAL> und <ENTITIES>/<ENTITY> mit
 * FIRST_NAME..FOURTH_NAME, NAME_ALIAS, INDIVIDUAL_DATE_OF_BIRTH,
 * UN_LIST_TYPE und REFERENCE_NUMBER.
 */

import type { SanctionsEntry, SanctionsList } from "./eu-list";

export const UN_SANCTIONS_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";

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

function fullName(block: string): string {
  return [1, 2, 3, 4]
    .map((i) => tag(block, `${["FIRST", "SECOND", "THIRD", "FOURTH"][i - 1]}_NAME`))
    .filter(Boolean)
    .join(" ");
}

/** Ein <INDIVIDUAL>- oder <ENTITY>-Block → Eintrag. Exported for tests. */
export function parseUnEntry(
  block: string,
  entityType: SanctionsEntry["entityType"]
): SanctionsEntry | null {
  const reference = tag(block, "REFERENCE_NUMBER") || tag(block, "DATAID");
  const names: string[] = [fullName(block)];
  for (const m of block.matchAll(/<ALIAS_NAME>([\s\S]*?)<\/ALIAS_NAME>/g)) {
    names.push(decodeXml(m[1]));
  }
  const birthDates: string[] = [];
  for (const m of block.matchAll(
    /<INDIVIDUAL_DATE_OF_BIRTH>([\s\S]*?)<\/INDIVIDUAL_DATE_OF_BIRTH>/g
  )) {
    const d = tag(m[1], "DATE") || tag(m[1], "YEAR");
    if (d) birthDates.push(d);
  }
  const countries: string[] = [];
  for (const m of block.matchAll(/<COUNTRY>([\s\S]*?)<\/COUNTRY>/g)) {
    countries.push(decodeXml(m[1]));
  }
  const programme = tag(block, "UN_LIST_TYPE");
  const cleanNames = uniq(names);
  if (cleanNames.length === 0) return null;
  return {
    reference: reference || cleanNames[0],
    entityType,
    primaryName: cleanNames.reduce((a, b) => (b.length > a.length ? b : a), cleanNames[0]),
    names: cleanNames,
    birthDates: uniq(birthDates),
    countries: uniq(countries),
    programmes: programme ? [programme] : [],
    remark: tag(block, "COMMENTS1") || undefined,
  };
}

export function parseUnSanctionsXml(xml: string): SanctionsList {
  const dateAttr = /dateGenerated="([^"]+)"/.exec(xml)?.[1] ?? "";
  const entries: SanctionsEntry[] = [];
  for (const m of xml.matchAll(/<INDIVIDUAL>[\s\S]*?<\/INDIVIDUAL>/g)) {
    const e = parseUnEntry(m[0], "person");
    if (e) entries.push(e);
  }
  for (const m of xml.matchAll(/<ENTITY>[\s\S]*?<\/ENTITY>/g)) {
    const e = parseUnEntry(m[0], "enterprise");
    if (e) entries.push(e);
  }
  return {
    generatedAt: dateAttr || new Date().toISOString(),
    entries,
  };
}

export async function fetchUnSanctionsList(
  url = UN_SANCTIONS_URL,
  timeoutMs = 120_000
): Promise<SanctionsList> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`UN-Sanktionsliste nicht abrufbar: HTTP ${res.status}`);
  const list = parseUnSanctionsXml(await res.text());
  if (list.entries.length < 100) {
    throw new Error(`UN-Sanktionsliste unplausibel klein (${list.entries.length} Einträge)`);
  }
  return list;
}
