/**
 * The EU consolidated financial sanctions list (FSF), the list an Austrian firm
 * has to check against under § 8c RAO. Public XML, about 25 MB.
 *
 * The download needs the Commission's published anonymous token, which is the
 * literal text "token-2017" in base64. It is built here rather than pasted so
 * nobody mistakes it for a credential — it protects nothing and is the same for
 * everyone.
 *
 * Parsed with a scanner rather than a DOM parser: the file is one flat list of
 * <sanctionEntity> blocks and holding 25 MB of DOM per refresh is wasteful.
 */

// base64url-style: the published URL carries the token without "=" padding.
const EU_PUBLIC_TOKEN = Buffer.from("token-2017", "utf8").toString("base64").replace(/=+$/, "");

export const EU_SANCTIONS_URL =
  "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content" +
  `?token=${EU_PUBLIC_TOKEN}`;

export interface SanctionsEntry {
  /** EU reference of the listing, e.g. "EU.27.28". */
  reference: string;
  entityType: "person" | "enterprise" | "unknown";
  /** Longest name of the listing, used for display. */
  primaryName: string;
  /** Every spelling on the list, including aliases. */
  names: string[];
  birthDates: string[];
  countries: string[];
  programmes: string[];
  remark?: string;
}

export interface SanctionsList {
  /** generationDate of the file, shown to the lawyer as the list version. */
  generatedAt: string;
  entries: SanctionsEntry[];
}

function attr(tag: string, name: string): string {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : "";
}

function decodeXml(v: string): string {
  return v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** One <sanctionEntity> block → entry. Exported for tests. */
export function parseEntity(block: string): SanctionsEntry | null {
  const head = /^<sanctionEntity[^>]*>/.exec(block)?.[0] ?? "";
  const reference = attr(head, "euReferenceNumber") || attr(head, "logicalId");
  const subject = /<subjectType[^>]*>/.exec(block)?.[0] ?? "";
  const code = attr(subject, "code");
  const names: string[] = [];
  for (const m of block.matchAll(/<nameAlias[^>]*>/g)) {
    const whole = attr(m[0], "wholeName");
    const composed = [attr(m[0], "firstName"), attr(m[0], "middleName"), attr(m[0], "lastName")]
      .filter(Boolean)
      .join(" ");
    names.push(whole || composed);
  }
  const birthDates: string[] = [];
  for (const m of block.matchAll(/<birthdate[^>]*>/g)) {
    const exact = attr(m[0], "birthdate");
    birthDates.push(exact || attr(m[0], "year"));
  }
  const countries: string[] = [];
  for (const m of block.matchAll(/<(citizenship|address)[^>]*>/g)) {
    countries.push(attr(m[0], "countryIso2Code"));
  }
  const programmes: string[] = [];
  for (const m of block.matchAll(/<regulation[^>]*>/g)) programmes.push(attr(m[0], "programme"));
  const remark = /<remark>([\s\S]*?)<\/remark>/.exec(block)?.[1];

  const cleanNames = uniq(names);
  if (cleanNames.length === 0) return null;
  return {
    reference,
    entityType: code === "person" ? "person" : code === "enterprise" ? "enterprise" : "unknown",
    primaryName: cleanNames.reduce((a, b) => (b.length > a.length ? b : a), cleanNames[0]),
    names: cleanNames,
    birthDates: uniq(birthDates),
    countries: uniq(countries),
    programmes: uniq(programmes),
    remark: remark ? decodeXml(remark).trim() : undefined,
  };
}

export function parseSanctionsXml(xml: string): SanctionsList {
  const generatedAt = attr(/<export[^>]*>/.exec(xml)?.[0] ?? "", "generationDate");
  const entries: SanctionsEntry[] = [];
  for (const m of xml.matchAll(/<sanctionEntity[\s\S]*?<\/sanctionEntity>/g)) {
    const entry = parseEntity(m[0]);
    if (entry) entries.push(entry);
  }
  return { generatedAt: generatedAt || new Date().toISOString(), entries };
}

/** Downloads and parses the current list. */
export async function fetchSanctionsList(
  url = EU_SANCTIONS_URL,
  timeoutMs = 120_000
): Promise<SanctionsList> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`EU-Sanktionsliste nicht abrufbar: HTTP ${res.status}`);
  const xml = await res.text();
  const list = parseSanctionsXml(xml);
  if (list.entries.length < 100) {
    throw new Error(`EU-Sanktionsliste unplausibel klein (${list.entries.length} Einträge)`);
  }
  return list;
}
