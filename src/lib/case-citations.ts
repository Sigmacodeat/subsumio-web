/**
 * Austrian case-law citations in answer text: OGH Geschäftszahlen, RIS-Justiz
 * Rechtssätze, VwGH and VfGH Zahlen. Client-safe (pure regex) — the server
 * resolves them against the corpus (case-grounding.ts), the UI links them.
 *
 * A made-up Geschäftszahl is the most damaging hallucination in a legal
 * answer, so every recognised citation is checked, never assumed.
 */

export type CaseCourt = "OGH" | "RIS-Justiz" | "VwGH" | "VfGH";

export interface RawCaseCitation {
  court: CaseCourt;
  /** As written in the answer, whitespace-normalised ("1 Ob 49/01i"). */
  cited: string;
  /** Corpus key — matches the corpus filename after the date prefix. */
  key: string;
  /** RIS full-text search for this citation (fallback when not in the corpus). */
  searchUrl: string;
}

const RIS = "https://www.ris.bka.gv.at/Ergebnis.wxe";

function risSearch(
  abfrage: "Justiz" | "Vwgh" | "Vfgh",
  param: "GZ" | "Rechtssatznummer",
  value: string
): string {
  const u = new URL(RIS);
  u.searchParams.set("Abfrage", abfrage);
  u.searchParams.set(param, value);
  return u.toString();
}

// OGH: "1 Ob 49/01i", "9 ObA 89/05m", "10 ObS 159/88", "14 Os 110/15f".
const OGH_RX =
  /(?<![\p{L}\d])(\d{1,2})\s?(ObA|ObS|Ob|Os|Ns|Nc|Nd|Fsc|Bkd|Ds)\s?(\d{1,4})\/(\d{2})([a-z])?(?![\p{L}\d/])/gu;
// RIS-Justiz Rechtssatz: "RS0115754", "RS 0115754".
const RS_RX = /(?<![\p{L}\d])RS\s?(\d{7})(?!\d)/gu;
// VwGH new style: "Ra 2018/07/0485", "Ro 2022/06/0018".
const VWGH_RX = /(?<![\p{L}\d])(Ra|Ro|Fr|Fe|Ko|Aw)\s?(\d{4})\/(\d{2})\/(\d{4})(?!\d)/gu;
// VwGH old style "92/03/0085", "2005/08/0102" — only shortly after "VwGH"
// (dates like "22.10.1992," may sit in between), never the tail of "Ra 2018/…".
const VWGH_OLD_RX =
  /VwGH[^\n]{0,40}?(?<![\d/])(?<!(?:Ra|Ro|Fr|Fe|Ko|Aw)\s?\d{0,4}\/?)((?:19|20)?\d{2})\/(\d{2})\/(\d{4})(?!\d)/gu;
// VfGH: "G 193/2008", "B 1043/08", "E 1234/2019" — only right after "VfGH".
const VFGH_RX = /VfGH[^\n]{0,40}?(?<![\p{L}\d])([ABEGKUVW])\s?(\d{1,5})\/(\d{2,4})(?!\d)/gu;

export function extractCaseCitations(text: string): RawCaseCitation[] {
  const out: RawCaseCitation[] = [];
  const seen = new Set<string>();
  const push = (c: RawCaseCitation) => {
    const id = `${c.court}#${c.key}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(c);
  };

  for (const m of text.matchAll(OGH_RX)) {
    const [, senat, reg, nr, yy, check = ""] = m;
    const compact = `${senat}${reg}${nr}/${yy}${check}`;
    push({
      court: "OGH",
      cited: `${senat} ${reg} ${nr}/${yy}${check}`,
      key: compact.toLowerCase().replace("/", "-"),
      searchUrl: risSearch("Justiz", "GZ", compact),
    });
  }
  for (const m of text.matchAll(RS_RX)) {
    const rs = `RS${m[1]}`;
    push({
      court: "RIS-Justiz",
      cited: rs,
      key: rs.toLowerCase(),
      searchUrl: risSearch("Justiz", "Rechtssatznummer", rs),
    });
  }
  for (const m of text.matchAll(VWGH_RX)) {
    const [, reg, year, ss, nr] = m;
    push({
      court: "VwGH",
      cited: `${reg} ${year}/${ss}/${nr}`,
      key: `${reg}-${year}-${ss}-${nr}`.toLowerCase(),
      searchUrl: risSearch("Vwgh", "GZ", `${reg} ${year}/${ss}/${nr}`),
    });
  }
  for (const m of text.matchAll(VWGH_OLD_RX)) {
    const [, year, ss, nr] = m;
    push({
      court: "VwGH",
      cited: `${year}/${ss}/${nr}`,
      key: `${year}-${ss}-${nr}`,
      searchUrl: risSearch("Vwgh", "GZ", `${year}/${ss}/${nr}`),
    });
  }
  for (const m of text.matchAll(VFGH_RX)) {
    const [, reg, nr, year] = m;
    push({
      court: "VfGH",
      cited: `${reg} ${nr}/${year}`,
      key: `${reg}${nr}-${year}`.toLowerCase(),
      searchUrl: risSearch("Vfgh", "GZ", `${reg}${nr}/${year}`),
    });
  }
  return out;
}
