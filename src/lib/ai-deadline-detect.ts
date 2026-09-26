/**
 * KI-gestützte Fristen-Erkennung für Subsumio.
 *
 * Hybrid-Ansatz:
 *   1. Regex-basierte Erkennung (schnell, offline, für 80% der Fälle)
 *   2. KI-API-Fallback für komplexe Formulierungen und juristische Kontexte
 *   3. Deterministische Fristberechnung via frist-engine.ts (berechneFristAuto)
 *
 * Erkennt:
 *   - Absolute Daten ("bis 30.06.2024")
 *   - Relative Fristen ("innerhalb von 14 Tagen")
 *   - Gesetzliche Fristen ("Klageerwiderung", "Berufungsfrist")
 *   - Gerichtstermine
 *   - Beweisaufnahmen
 *   - Rechtsmittelfristen (ZPO, BGB, StPO, AVG, VwGVG, VfGG)
 *
 * Nach Erkennung wird — sofern ein suggestedTemplate und ein Zustellungsdatum
 * extrahierbar sind — die deterministische Frist via berechneFristAuto()
 * berechnet (mit vhfZ-Hemmung, Feiertagsverschiebung, ERV-Zustellfiktion).
 */

import {
  berechneFrist,
  berechneFristAuto,
  parseISODate,
  resolveFristArt,
  zustellungERV,
  type FristAutoErgebnis,
  type FristDauer,
  type FristRegime,
} from "@/lib/legal/frist-engine";
import {
  berechneFristArtDE,
  berechneFristDE,
  fristArtDE,
  type Bundesland,
} from "@/lib/legal/frist-engine-de";

export interface DetectedDeadline {
  type: string;
  description: string;
  date?: string; // ISO 8601 wenn absolut ermittelbar
  daysFromNow?: number; // bei relativen Fristen
  confidence: "high" | "medium" | "low";
  sourceSnippet: string;
  matchedRule: string;
  suggestedTemplate?: string; // z.B. "zpo-klageerwiderung"
  /** Deterministisch berechnetes Fristergebnis (wenn Zustellungsdatum + Template bekannt). */
  fristResult?: FristAutoErgebnis;
  /** Extrahiertes Zustellungsdatum (ISO), das den Fristenlauf auslöst. */
  zustellungsdatum?: string;
  /** Wie das Schriftstück zugegangen ist — "erv": der Text nennt das Einlangen
   *  im ERV, die Zustellung gilt erst am folgenden Werktag (§ 89d Abs 2 GOG). */
  zustellungsart?: "standard" | "erv";
  /** Dauer einer im Text genannten Frist ("binnen vier Wochen"). */
  dauer?: FristDauer;
  /** Einheitliches, rechtsraum-unabhängiges Rechenergebnis der Frist-Engine. */
  berechnung?: FristBerechnung;
  /** Was ein Mensch ergänzen muss, bevor die Frist berechnet werden kann. */
  rueckfrage?: string;
}

/** Ergebnis der deterministischen Berechnung, wie es Akte, Fristenbuch und
 *  Freigabe anzeigen (AT und DE in derselben Form). */
export interface FristBerechnung {
  rechtsraum: "AT" | "DE";
  /** Registry-Key (AT: FRISTEN_REGISTRY, DE: FRISTEN_REGISTRY_DE); fehlt bei
   *  frei formulierten Fristen ohne gesetzliche Fristart. */
  fristArt?: string;
  bezeichnung: string;
  rechtsgrundlage?: string;
  notfrist: boolean;
  /** Tag des Einlangens im ERV, wenn die Zustellfiktion angewendet wurde. */
  eingangsdatum?: string;
  /** Maßgeblicher Zustelltag (Fristbeginn). */
  zustellungsdatum: string;
  fristende: string;
  vorfrist: string;
  /** Nur gesetzt, wenn die verhandlungsfreie Zeit das Ergebnis ändert: das
   *  Fristende OHNE Hemmung (Ferialsache) bzw. MIT Hemmung. */
  fristendeOhneHemmung?: string;
  fristendeMitHemmung?: string;
  ferialsache?: FerialsacheBefund["status"];
  hinweise: string[];
}

export type Rechtsraum = "AT" | "DE" | "CH";

export interface EnrichOpts {
  /** Ausdrücklich bekannt (z.B. aus einer Angabe des Anwalts). Ohne Angabe wird
   *  die Ferialsache aus dem Text erkannt. */
  ferialsache?: boolean;
  vorfristTage?: number;
  /** Rechtsraum der Akte; ohne Angabe Österreich. */
  rechtsraum?: Rechtsraum;
  bundesland?: Bundesland;
}

// --- Regex-basierte Erkennung ---

// Ausgeschriebene deutsche Zahlwörter — für "binnen vier Wochen", "vierzehn Tagen".
const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einem: 1,
  einen: 1,
  einer: 1,
  eines: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  dreizehn: 13,
  vierzehn: 14,
  fünfzehn: 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
  zwanzig: 20,
  dreißig: 30,
};
// Längere Wörter zuerst, damit "vierzehn" vor "vier" greift.
const NUMBER_WORD_ALT = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|");

function parseNumberToken(token: string): number | undefined {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return NUMBER_WORDS[token.toLowerCase()];
}

// Relative Dauer → Tage ab heute. Wochen exakt ×7; Monate/Jahre über echte
// Kalenderarithmetik (nicht ×30/×365), damit z.B. "3 Monate" das korrekte
// Tagesdelta ergibt statt einer groben Näherung.
function periodToDays(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("woche")) return value * 7;
  if (u.startsWith("monat") || u.startsWith("jahr")) {
    const now = new Date();
    const then = new Date(now);
    if (u.startsWith("monat")) then.setMonth(then.getMonth() + value);
    else then.setFullYear(then.getFullYear() + value);
    return Math.round((then.getTime() - now.getTime()) / 86_400_000);
  }
  return value; // Tag(e/en)
}

const RULES: Array<{
  name: string;
  regex: RegExp;
  type: string;
  template?: string;
  extractDate?: (match: RegExpExecArray) => { date?: string; daysFromNow?: number };
}> = [
  // Absolute DE-Datum: "bis 30.06.2024", "Frist: 15. März 2024"
  {
    name: "absolute_date_de",
    regex:
      /(?:bis|frist|fristen|termin|beweisaufnahme)[\s:]*(\d{1,2})[.\s]\s*(\d{1,2}|Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)[.\s]\s*(\d{4})/i,
    type: "absolute_deadline",
    extractDate: (m) => {
      const day = parseInt(m[1], 10);
      let month: number;
      const m2 = m[2];
      if (/^\d+$/.test(m2)) month = parseInt(m2, 10);
      else {
        const months: Record<string, number> = {
          jan: 1,
          feb: 2,
          mär: 3,
          apr: 4,
          mai: 5,
          jun: 6,
          jul: 7,
          aug: 8,
          sep: 9,
          okt: 10,
          nov: 11,
          dez: 12,
        };
        month = months[m2.toLowerCase()] || 1;
      }
      const year = parseInt(m[3], 10);
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    },
  },
  // Absolute AT-Datum: "bis 30. 6. 2024", "längstens 31.12.2024", "spätestens 15. März 2024"
  {
    name: "absolute_date_at",
    regex:
      /(?:bis|frist|fristen|termin|längstens|spätestens|bis zum|bis spätestens)[\s:]*(\d{1,2})[.\s]\s*(\d{1,2}|Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)[.\s]\s*(\d{4})/i,
    type: "absolute_deadline",
    extractDate: (m) => {
      const day = parseInt(m[1], 10);
      let month: number;
      const m2 = m[2];
      if (/^\d+$/.test(m2)) month = parseInt(m2, 10);
      else {
        const months: Record<string, number> = {
          jan: 1,
          feb: 2,
          mär: 3,
          apr: 4,
          mai: 5,
          jun: 6,
          jul: 7,
          aug: 8,
          sep: 9,
          okt: 10,
          nov: 11,
          dez: 12,
        };
        month = months[m2!.toLowerCase()] || 1;
      }
      const year = parseInt(m[3], 10);
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    },
  },
  // Relative: "innerhalb von 14 Tagen", "binnen vier Wochen", "innert 3 Monaten",
  // "mit Frist von 4 Wochen". Erkennt Ziffern + ausgeschriebene Zahlwörter und
  // rechnet Wochen/Monate/Jahre korrekt in Tage um. "innert" deckt CH ab.
  {
    name: "relative_days",
    regex: new RegExp(
      `(?:innerhalb(?:\\s+von)?|binnen|innert|spätestens\\s+(?:in|binnen)|(?:mit\\s+(?:einer\\s+)?)?frist\\s+von)\\s+(\\d{1,4}|${NUMBER_WORD_ALT})\\s+(Tage?n?|Wochen?|Monate?n?|Jahre?n?)`,
      "i"
    ),
    type: "relative_deadline",
    extractDate: (m) => {
      const value = parseNumberToken(m[1]);
      if (value === undefined) return {};
      return { daysFromNow: periodToDays(value, m[2]) };
    },
  },
  // Gesetzliche Fristen mit Template-Mapping
  {
    name: "zpo_klagebeantwortung",
    regex:
      /(?:Klagebeantwortung|Klageerwiderung|Erwiderung auf die Klage)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "klagebeantwortung",
  },
  {
    name: "zpo_berufung",
    regex: /(?:Berufung|berufen)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "berufung",
  },
  {
    name: "zpo_revision",
    regex: /(?:Revision|revisionsfrist)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "revision",
  },
  {
    name: "zpo_rekurs",
    regex: /(?:Rekurs|rekursfrist)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "rekurs",
  },
  {
    name: "zpo_wiedereinsetzung",
    regex: /(?:Wiedereinsetzung|Wiederherstellung)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "wiedereinsetzung",
  },
  {
    name: "zpo_einspruch_zahlungsbefehl",
    regex:
      /(?:Einspruch[\s\S]{0,10}gegen[\s\S]{0,10}Zahlungsbefehl|Einspruchsfrist[\s\S]{0,20}Zahlungsbefehl)/i,
    type: "legal_deadline",
    template: "einspruch_zahlungsbefehl",
  },
  {
    name: "abgb_verjaehrung_kurz",
    regex: /(?:Verjährung|verjährt|Verjährungsfrist)[\s\S]{0,30}(?:3 Jahre|drei Jahre)/i,
    type: "legal_deadline",
    template: "verjaehrung_kurz",
  },
  {
    name: "abgb_verjaehrung_lang",
    regex: /(?:Verjährung|verjährt|Verjährungsfrist)[\s\S]{0,30}(?:30 Jahre|dreißig Jahre)/i,
    type: "legal_deadline",
    template: "verjaehrung_lang",
  },
  {
    name: "stpo_beschwerde",
    regex:
      /(?:Sofortige Beschwerde|Beschwerde)[\s\S]{0,30}(?:frist|fristen|1 Woche|7 Tage|14 Tage)/i,
    type: "legal_deadline",
    template: "beschwerde_stpo",
  },
  {
    name: "avg_beschwerde_vwgvg",
    regex:
      /(?:Bescheidbeschwerde|Beschwerde[\s\S]{0,10}gegen[\s\S]{0,10}Bescheid|Beschwerde an das Verwaltungsgericht)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "beschwerde_vwgvg",
  },
  {
    name: "avg_vorstellung",
    regex: /(?:Vorstellung|Vorstellungsfrist)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "vorstellung_avg",
  },
  {
    name: "vwgh_revision",
    regex:
      /(?:Revision an den VwGH|Verwaltungsgerichtshof-Revision|VwGH-Revision)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "revision_vwgh",
  },
  {
    name: "vfg_beschwerde",
    regex:
      /(?:Beschwerde an den VfGH|Verfassungsgerichtshof-Beschwerde|VfGH-Beschwerde)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "beschwerde_vfgh",
  },
  // Gerichtstermine
  {
    name: "court_date",
    regex:
      /(?:Verhandlung|Hauptverhandlung|Beweisaufnahme|Gerichtstag)[\s\S]{0,50}?(\d{1,2})[.\s]\s*(\d{1,2}|Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)[.\s]\s*(\d{4})/i,
    type: "court_hearing",
    extractDate: (m) => {
      const day = parseInt(m[1], 10);
      let month: number;
      const m2 = m[2];
      if (/^\d+$/.test(m2)) month = parseInt(m2, 10);
      else {
        const months: Record<string, number> = {
          jan: 1,
          feb: 2,
          mär: 3,
          apr: 4,
          mai: 5,
          jun: 6,
          jul: 7,
          aug: 8,
          sep: 9,
          okt: 10,
          nov: 11,
          dez: 12,
        };
        month = months[m2.toLowerCase()] || 1;
      }
      const year = parseInt(m[3], 10);
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    },
  },
  // "Mahnfrist" / "Zahlungsfrist"
  {
    name: "payment_deadline",
    regex:
      /(?:Zahlungsfrist|Mahnfrist|fristgerecht)[\s\S]{0,30}?(\d{1,2})[.\s]\s*(\d{1,2})[.\s]\s*(\d{4})/i,
    type: "payment_deadline",
    extractDate: (m) => {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    },
  },
];

export function detectDeadlines(text: string): DetectedDeadline[] {
  const results: DetectedDeadline[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const matches = text.matchAll(
      rule.regex.global ? rule.regex : new RegExp(rule.regex.source, "gi")
    );
    for (const match of matches) {
      const snippet = match[0].slice(0, 120);
      const key = `${rule.name}:${snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let date: string | undefined;
      let daysFromNow: number | undefined;
      if (rule.extractDate) {
        const extracted = rule.extractDate(match as RegExpExecArray);
        date = extracted.date;
        daysFromNow = extracted.daysFromNow;
      }

      let confidence: DetectedDeadline["confidence"] = "medium";
      if (date) confidence = "high";
      else if (daysFromNow) confidence = "medium";
      else if (rule.template) confidence = "high";

      // "binnen vier Wochen … Berufung": the Fristart stands next to the
      // duration, not in a "…frist" word — read it from the surrounding text.
      let template = rule.template;
      let dauer: FristDauer | undefined;
      let description = describeDeadline(rule, match, date, daysFromNow);
      if (rule.name === "relative_days") {
        dauer = parseDauer(match[1] ?? "", match[2] ?? "");
        const kontext = fristartAusKontext(text, match.index ?? 0, match[0].length);
        if (kontext?.key) {
          template = kontext.key;
          description = TEMPLATE_DESCRIPTIONS[kontext.key] ?? description;
        } else if (kontext?.bezeichnung) {
          description = kontext.bezeichnung;
        }
      }

      results.push({
        type: rule.type,
        description,
        date,
        daysFromNow,
        confidence,
        sourceSnippet: snippet,
        matchedRule: rule.name,
        suggestedTemplate: template,
        ...(dauer ? { dauer } : {}),
      });
    }
  }

  return results;
}

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  klagebeantwortung: "Klagebeantwortungsfrist (§ 230 Abs 1 ZPO)",
  berufung: "Berufungsfrist (§ 464 Abs 1 ZPO)",
  berufungsbeantwortung: "Berufungsbeantwortungsfrist (§ 468 Abs 2 ZPO)",
  revision: "Revisionsfrist (§ 505 Abs 2 ZPO)",
  rekurs: "Rekursfrist (§ 521 Abs 1 ZPO)",
  revisionsrekurs: "Revisionsrekursfrist (§ 528 ZPO iVm § 521 ZPO)",
  widerspruch_versaeumungsurteil: "Widerspruchsfrist gegen Versäumungsurteil (§ 397a Abs 1 ZPO)",
  wiedereinsetzung: "Wiedereinsetzungsfrist (§ 148 Abs 2 ZPO)",
  einspruch_zahlungsbefehl: "Einspruchsfrist gegen Zahlungsbefehl (§ 248 Abs 2 ZPO)",
  verjaehrung_kurz: "Kurze Verjährungsfrist (§ 1489 ABGB — 3 Jahre)",
  verjaehrung_lang: "Lange Verjährungsfrist (§ 1489 Satz 2 ABGB — 30 Jahre)",
  beschwerde_stpo: "Beschwerdefrist (§ 88 Abs 1 StPO)",
  beschwerde_vwgvg: "Bescheidbeschwerdefrist (§ 7 Abs 4 VwGVG)",
  vorstellung_avg: "Vorstellungsfrist (§ 57 Abs 2 AVG)",
  revision_vwgh: "Revisionsfrist an den VwGH (§ 26 Abs 1 VwGG)",
  beschwerde_vfgh: "Beschwerdefrist an den VfGH (§ 82 Abs 1 VfGG)",
  steuer_berufung_at: "Bescheidbeschwerdefrist gegen Abgabenbescheid (§ 245 Abs 1 BAO)",
};

function describeDeadline(
  rule: (typeof RULES)[0],
  match: RegExpMatchArray,
  date?: string,
  daysFromNow?: number
): string {
  if (rule.template) {
    return TEMPLATE_DESCRIPTIONS[rule.template] || rule.template;
  }
  if (date) return `Frist: ${new Date(date).toLocaleDateString("de-DE")}`;
  if (daysFromNow) return `Frist: innerhalb ${daysFromNow} Tage`;
  return "Erkannte Frist";
}

/** Berechnet das Datum aus einer relativen Frist (Tage ab heute). */
export function resolveRelativeDeadline(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Dauer und Fristart aus dem Umfeld ───────────────────────

function parseDauer(numToken: string, unit: string): FristDauer | undefined {
  const value = parseNumberToken(numToken);
  if (!value) return undefined;
  const u = unit.toLowerCase();
  if (u.startsWith("woche")) return { wochen: value };
  if (u.startsWith("monat")) return { monate: value };
  if (u.startsWith("jahr")) return { jahre: value };
  return { tage: value };
}

function dauerGleich(a: FristDauer, b: FristDauer): boolean {
  const tage = (d: FristDauer) => (d.tage ?? 0) + (d.wochen ?? 0) * 7;
  const monate = (d: FristDauer) => (d.monate ?? 0) + (d.jahre ?? 0) * 12;
  return tage(a) === tage(b) && monate(a) === monate(b);
}

function dauerText(d: FristDauer): string {
  const teile: string[] = [];
  if (d.jahre) teile.push(`${d.jahre} ${d.jahre === 1 ? "Jahr" : "Jahre"}`);
  if (d.monate) teile.push(`${d.monate} ${d.monate === 1 ? "Monat" : "Monate"}`);
  if (d.wochen) teile.push(`${d.wochen} ${d.wochen === 1 ? "Woche" : "Wochen"}`);
  if (d.tage) teile.push(`${d.tage} ${d.tage === 1 ? "Tag" : "Tage"}`);
  return teile.join(" ");
}

export type Verfahrenskontext = "zivil" | "straf" | "verwaltung" | "abgaben";

/** Grobe Einordnung des Schriftstücks — entscheidet, welches Fristenregime
 *  (ZPO / StPO / AVG / BAO) eine frei formulierte Frist bekommt. */
export function verfahrensKontext(text: string): Verfahrenskontext {
  if (/\bBAO\b|Finanzamt|Abgabenbescheid|Bundesfinanzgericht/i.test(text)) return "abgaben";
  if (
    /\bStPO\b|Staatsanwaltschaft|Strafsache|\bBeschuldigte[nr]?\b|\bAngeklagte[nr]?\b/i.test(text)
  )
    return "straf";
  if (
    /\bBescheid\b|\bAVG\b|VwGVG|Verwaltungsgericht|Bezirkshauptmannschaft|Magistrat|\bBehörde\b/i.test(
      text
    )
  )
    return "verwaltung";
  return "zivil";
}

interface KontextTreffer {
  key?: string;
  bezeichnung?: string;
}

/** Stichwort → Fristart; die Reihenfolge entscheidet bei gleichem Abstand
 *  (spezifischere Begriffe zuerst). */
const KONTEXT_STICHWORTE: Array<{
  re: RegExp;
  resolve: (kontext: Verfahrenskontext, text: string) => KontextTreffer | undefined;
}> = [
  { re: /Revisionsrekurs/gi, resolve: () => ({ key: "revisionsrekurs" }) },
  {
    re: /Berufungsbeantwortung|Berufung\s+zu\s+beantworten/gi,
    resolve: () => ({ key: "berufungsbeantwortung" }),
  },
  {
    re: /Berufung/gi,
    resolve: (k) => (k === "straf" ? undefined : { key: "berufung" }),
  },
  {
    re: /Revision/gi,
    resolve: (k) =>
      k === "verwaltung" || k === "abgaben"
        ? { key: "revision_vwgh" }
        : k === "straf"
          ? undefined
          : { key: "revision" },
  },
  { re: /Rekurs/gi, resolve: (k) => (k === "zivil" ? { key: "rekurs" } : undefined) },
  {
    re: /Klagebeantwortung|Klage[^.]{0,80}?zu\s+beantworten/gi,
    resolve: () => ({ key: "klagebeantwortung" }),
  },
  {
    re: /Einspruch/gi,
    resolve: (_k, text) =>
      /Zahlungsbefehl/i.test(text) ? { key: "einspruch_zahlungsbefehl" } : undefined,
  },
  {
    re: /Widerspruch/gi,
    resolve: (_k, text) =>
      /Versäumungsurteil/i.test(text) ? { key: "widerspruch_versaeumungsurteil" } : undefined,
  },
  {
    re: /Vorstellung/gi,
    resolve: (k) => (k === "verwaltung" ? { key: "vorstellung_avg" } : undefined),
  },
  {
    re: /Beschwerde/gi,
    resolve: (k) =>
      k === "abgaben"
        ? { key: "steuer_berufung_at" }
        : k === "verwaltung"
          ? { key: "beschwerde_vwgvg" }
          : k === "straf"
            ? { key: "beschwerde_stpo" }
            : undefined,
  },
  {
    re: /Verbesserung|verbessern/gi,
    resolve: () => ({ bezeichnung: "Verbesserungsfrist (richterliche Frist)" }),
  },
];

/**
 * Sucht im Umfeld einer Dauerangabe ("binnen vier Wochen") das nächstgelegene
 * Stichwort, das die Fristart benennt ("… Berufung erhoben werden"). Das Umfeld
 * endet an Absatzgrenzen, damit eine Belehrung nicht die nächste färbt.
 */
export function fristartAusKontext(
  text: string,
  index: number,
  length: number
): KontextTreffer | undefined {
  let start = Math.max(0, index - 160);
  let end = Math.min(text.length, index + length + 200);
  const absatzDavor = text.lastIndexOf("\n\n", index);
  if (absatzDavor >= start) start = absatzDavor;
  const absatzDanach = text.indexOf("\n\n", index + length);
  if (absatzDanach !== -1 && absatzDanach < end) end = absatzDanach;
  const fenster = text.slice(start, end);
  const kontext = verfahrensKontext(text);
  const mStart = index - start;
  const mEnd = mStart + length;

  let best: { dist: number; order: number; treffer: KontextTreffer } | undefined;
  KONTEXT_STICHWORTE.forEach((sw, order) => {
    for (const m of fenster.matchAll(sw.re)) {
      const kStart = m.index ?? 0;
      const kEnd = kStart + m[0].length;
      const dist = kEnd <= mStart ? mStart - kEnd : kStart >= mEnd ? kStart - mEnd : 0;
      const treffer = sw.resolve(kontext, text);
      if (!treffer) continue;
      if (!best || dist < best.dist || (dist === best.dist && order < best.order)) {
        best = { dist, order, treffer };
      }
    }
  });
  return best?.treffer;
}

// ── Zustellungsdatum-Extraktion ─────────────────────────────

const MONAT_ALT =
  "Jän(?:ner)?|Jan(?:uar)?|Feb(?:ruar)?|Feber|Mär(?:z)?|Apr(?:il)?|Mai|Jun(?:i)?|Jul(?:i)?|Aug(?:ust)?|Sep(?:tember)?|Okt(?:ober)?|Nov(?:ember)?|Dez(?:ember)?";
const DATUM_DE = `(\\d{1,2})[.\\s]\\s*(\\d{1,2}|${MONAT_ALT})[.\\s]\\s*(\\d{4})`;
const ERV = "(?:ERV|elektronischen\\s+Rechtsverkehr|elektronisch)";

/**
 * Muster für das fristauslösende Ereignis. Reihenfolge = Vorrang:
 * ausdrückliche Zustellung vor dem Einlangen im ERV.
 */
const ZUSTELLUNG_REGEXES: Array<{ re: RegExp; name: string; art: "standard" | "erv" }> = [
  // "zugestellt am DD.MM.YYYY" / "Zustellung am …" / "Zustelldatum: …"
  {
    re: new RegExp(
      `(?:zugestellt|Zustellung|Zustelldatum)[\\s:]*(?:(?:am|vom)\\s+)?${DATUM_DE}`,
      "i"
    ),
    name: "zustellung_de",
    art: "standard",
  },
  // "zugestellt am YYYY-MM-DD" (ISO)
  {
    re: /(?:zugestellt|Zustellung|Zustelldatum)[\s:]*(?:(?:am|vom)\s+)?(\d{4})-(\d{2})-(\d{2})/i,
    name: "zustellung_iso",
    art: "standard",
  },
  // "am DD.MM.YYYY zugestellt"
  {
    re: new RegExp(`am\\s+${DATUM_DE}\\s+(?:zugestellt|zustellig)`, "i"),
    name: "zustellung_reversed",
    art: "standard",
  },
  // "am 02.10.2026 im ERV eingelangt"
  {
    re: new RegExp(
      `am\\s+${DATUM_DE}\\s+(?:im|per|über\\s+den)\\s+${ERV}\\s+(?:eingelangt|eingegangen)`,
      "i"
    ),
    name: "erv_reversed",
    art: "erv",
  },
  // "im ERV eingelangt am …", "Einlangen im ERV: …"
  {
    re: new RegExp(
      `${ERV}[^.\\n]{0,40}?(?:eingelangt|Einlangen|Eingang)[^.\\n]{0,15}?(?:am|:)\\s*${DATUM_DE}`,
      "i"
    ),
    name: "erv_eingelangt",
    art: "erv",
  },
  // "eingelangt im ERV am …"
  {
    re: new RegExp(
      `(?:eingelangt|Einlangen|Eingang)[^.\\n]{0,40}?${ERV}[^.\\n]{0,15}?(?:am|:)\\s*${DATUM_DE}`,
      "i"
    ),
    name: "erv_eingelangt_2",
    art: "erv",
  },
];

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  januar: 1,
  jän: 1,
  jänner: 1,
  feb: 2,
  februar: 2,
  feber: 2,
  mär: 3,
  märz: 3,
  mar: 3,
  marz: 3,
  apr: 4,
  april: 4,
  mai: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dez: 12,
  dezember: 12,
};

/** Baut ein ISO-Datum und prüft, dass es den Kalendertag gibt. */
function parseDateParts(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10);
  const m = /^\d+$/.test(month) ? parseInt(month, 10) : MONTH_MAP[month.toLowerCase()];
  if (!m) return null;
  const iso = `${parseInt(year, 10)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  try {
    parseISODate(iso);
    return iso;
  } catch {
    return null;
  }
}

/** ISO ("2026-04-03") oder DACH-Schreibweise ("03.04.2026", "3. April 2026"). */
function parseLooseDate(value: string): string | null {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return parseDateParts(iso[3]!, iso[2]!, iso[1]!);
  const de = new RegExp(`^${DATUM_DE}`, "i").exec(v);
  return de ? parseDateParts(de[1]!, de[2]!, de[3]!) : null;
}

export interface Zustellung {
  /** Datum laut Text (bei ERV: Tag des Einlangens). */
  datum: string;
  art: "standard" | "erv";
}

/** Erkennt das fristauslösende Ereignis im Text. */
export function extractZustellung(text: string): Zustellung | null {
  for (const { re, art } of ZUSTELLUNG_REGEXES) {
    const m = re.exec(text);
    if (!m) continue;
    const datum =
      m[1]!.length === 4
        ? parseDateParts(m[3]!, m[2]!, m[1]!)
        : parseDateParts(m[1]!, m[2]!, m[3]!);
    if (datum) return { datum, art };
  }
  return null;
}

/**
 * Extrahiert das Zustellungsdatum aus einem Text (bei ERV das Einlangen —
 * die Zustellfiktion rechnet die Frist-Engine).
 * @returns ISO-Datum (YYYY-MM-DD) oder null
 */
export function extractZustellungsdatum(text: string): string | null {
  return extractZustellung(text)?.datum ?? null;
}

/** Zustellung aus den (im Text belegten) Stichtagen der Dokumentanalyse. */
export function zustellungAusKeyDates(
  keyDates: Array<{ date?: unknown; what?: unknown }> | undefined
): Zustellung | null {
  for (const k of keyDates ?? []) {
    const what = typeof k?.what === "string" ? k.what : "";
    if (!/zugestellt|Zustellung|Zustelldatum|eingelangt|Einlangen|zugegangen/i.test(what)) continue;
    const datum = typeof k.date === "string" ? parseLooseDate(k.date) : null;
    if (!datum) continue;
    return { datum, art: /ERV|elektronisch|eingelangt|Einlangen/i.test(what) ? "erv" : "standard" };
  }
  return null;
}

// ── Ferialsache (§ 222 Abs 2 ZPO) ───────────────────────────

export interface FerialsacheBefund {
  /** ja: Katalogsache erkannt · zweifel: Hinweis auf eine mögliche Ferialsache
   *  oder ein Verfahren ohne Hemmung · unbekannt: nichts erkannt · nein: vom
   *  Menschen ausdrücklich verneint. */
  status: "ja" | "zweifel" | "unbekannt" | "nein";
  grund?: string;
}

const FERIAL_JA: Array<[RegExp, string]> = [
  [
    /einstweilig\w*\s+Verfügung|\bEV-Antrag|Sicherungsantrag/i,
    "einstweilige Verfügung (§ 222 Abs 2 Z 6 ZPO)",
  ],
  [/Besitzstörung/i, "Besitzstörung (§ 222 Abs 2 Z 3 ZPO)"],
  [
    /Wechsel(?:zahlungsauftrag|mandat|klage|streit|sache)/i,
    "Wechselstreitigkeit (§ 222 Abs 2 Z 1 ZPO)",
  ],
  [/Fortsetzung\s+eines\s+angefangenen\s+Baue?s/i, "Fortsetzung eines Baues (§ 222 Abs 2 Z 2 ZPO)"],
  [
    /Oppositionsklage|Impugnationsklage|Exszindierungsklage|§§?\s*3[567]\s*EO/i,
    "Klage nach §§ 35–37 EO (§ 222 Abs 2 Z 5 ZPO)",
  ],
];

const FERIAL_ZWEIFEL: Array<[RegExp, string]> = [
  [/Versäumungsurteil|Anerkenntnisurteil/i, "Versäumungs- oder Anerkenntnisurteil"],
  [/Unterhalt/i, "Unterhaltssache (§ 222 Abs 2 Z 4 ZPO)"],
  [/Verfahrenshilfe/i, "Verfahrenshilfe (§ 222 Abs 2 Z 7 ZPO)"],
  [/Beweissicherung/i, "Beweissicherung (§ 222 Abs 2 Z 8 ZPO)"],
  [/Wiedereinsetzung/i, "Wiedereinsetzung (§ 222 Abs 2 Z 9 ZPO)"],
  [
    /Ablehnungsantrag|Befangenheit|Ablehnung\s+(?:des|der)\s+(?:Richter|Sachverständig)/i,
    "Ablehnung (§ 222 Abs 2 Z 10 ZPO)",
  ],
  [/Exekution|\bEO\b|Zwangsversteigerung|Fahrnis/i, "Exekutionssache"],
  [/Räumung|Bestandvertrag|Bestandsache|Aufkündigung|Mietzins/i, "Bestand-/Räumungssache"],
  [
    /Arbeitsrechtssache|Sozialrechtssache|Arbeits-\s+und\s+Sozialgericht|\bASGG?\b/i,
    "Arbeits-/Sozialrechtssache",
  ],
  [/Außerstreit|AußStrG|Pflegschaft|Obsorge/i, "Außerstreitsache"],
  [/Insolvenz|Konkurs|Sanierungsverfahren/i, "Insolvenzsache"],
];

/**
 * Erkennt Hinweise auf eine Ferialsache. Die sichere Richtung ist die frühere
 * Frist: schon ein Zweifel schaltet die Hemmung durch die verhandlungsfreie
 * Zeit aus — ein Mensch bestätigt, ob die spätere Frist gilt.
 */
export function erkenneFerialsache(text: string): FerialsacheBefund {
  for (const [re, grund] of FERIAL_JA) if (re.test(text)) return { status: "ja", grund };
  for (const [re, grund] of FERIAL_ZWEIFEL) if (re.test(text)) return { status: "zweifel", grund };
  return { status: "unbekannt" };
}

// ── Anreicherung über die Frist-Engine ──────────────────────

/**
 * Mappt template-Namen auf FRISTEN_REGISTRY Keys.
 * Die alten template-Namen (z.B. "zpo-klageerwiderung") werden auf die
 * neuen Registry-Keys (z.B. "klagebeantwortung") gemappt; Registry-Keys
 * gelten direkt.
 */
const TEMPLATE_TO_REGISTRY: Record<string, string> = {
  "zpo-klageerwiderung": "klagebeantwortung",
  "zpo-berufung": "berufung",
  "zpo-wiedereinsetzung": "wiedereinsetzung",
  "abgb-verjaehrung": "verjaehrung_kurz",
  "stpo-beschwerde": "beschwerde_stpo",
};

function registryKeyFor(template: string | undefined): string | undefined {
  if (!template) return undefined;
  const mapped = TEMPLATE_TO_REGISTRY[template] ?? template;
  return resolveFristArt(mapped) ? mapped : undefined;
}

/**
 * AT-Fristart → FRISTEN_REGISTRY_DE-Key für Akten im deutschen Rechtsraum.
 * AT-spezifische Arten (VwGH/VfGH/AVG) haben bewusst kein Pendant.
 */
export const DE_TEMPLATE_MAP: Record<string, string> = {
  klagebeantwortung: "klageerwiderung_de",
  berufung: "berufung_de",
  revision: "revision_de",
  wiedereinsetzung: "wiedereinsetzung_de",
  einspruch_zahlungsbefehl: "widerspruch_mahnbescheid_de",
  beschwerde_stpo: "sofortige_beschwerde_stpo_de",
  rekurs: "sofortige_beschwerde_de",
};

const RUECKFRAGE_ZUSTELLDATUM =
  "Zustelldatum fehlt — bitte eintragen (z. B. „zugestellt am TT.MM.JJJJ“), dann wird die Frist berechnet.";

function capConfidence(
  c: DetectedDeadline["confidence"],
  max: "medium" | "low"
): DetectedDeadline["confidence"] {
  if (max === "low") return "low";
  return c === "high" ? "medium" : c;
}

function vhfzHinweis(befund: FerialsacheBefund, alt: string): string | undefined {
  if (befund.status === "ja") {
    return `Ferialsache erkannt: ${befund.grund} — keine Hemmung durch die verhandlungsfreie Zeit. Wäre es keine Ferialsache, endete die Frist erst am ${alt}.`;
  }
  if (befund.status === "zweifel") {
    return `Ferialsache prüfen (${befund.grund}): Frist OHNE Hemmung durch die verhandlungsfreie Zeit berechnet (frühere, sichere Frist). Liegt keine Ferialsache vor, endet sie erst am ${alt} (§ 222 Abs 1 ZPO).`;
  }
  if (befund.status === "unbekannt") {
    return `Ferialsache prüfen: Die verhandlungsfreie Zeit verlängert diese Frist nur, wenn keine Ferialsache vorliegt (§ 222 Abs 2 ZPO). In einer Ferialsache endet sie bereits am ${alt}.`;
  }
  return undefined;
}

function enrichAT(
  dd: DetectedDeadline,
  registryKey: string | undefined,
  zustellung: Zustellung,
  fullText: string,
  opts: EnrichOpts | undefined
): DetectedDeadline {
  const befund: FerialsacheBefund =
    opts?.ferialsache === true
      ? { status: "ja", grund: "vom Anwalt angegeben" }
      : opts?.ferialsache === false
        ? { status: "nein" }
        : erkenneFerialsache(fullText);
  const ohneHemmung = befund.status === "ja" || befund.status === "zweifel";
  const erv = zustellung.art === "erv";
  const ausloeser = erv ? zustellungERV(zustellung.datum) : zustellung.datum;
  const ervHinweis = erv
    ? [
        `ERV-Zustellungsfiktion (§ 89d Abs 2 GOG): eingelangt am ${zustellung.datum}, zugestellt am ${ausloeser}`,
      ]
    : [];

  if (!registryKey) {
    const dauer = dd.dauer ?? (dd.daysFromNow ? { tage: dd.daysFromNow } : undefined);
    if (!dauer) return dd;
    const kontext = verfahrensKontext(fullText);
    const regime: FristRegime =
      kontext === "verwaltung"
        ? "avg"
        : kontext === "abgaben"
          ? "bao"
          : kontext === "straf"
            ? "stpo"
            : "zpo";
    const r = berechneFrist({
      ausloeser,
      dauer,
      regime,
      gehemmtInVhfz: false,
      vorfristTage: opts?.vorfristTage,
    });
    const hinweise = [
      ...ervHinweis,
      ...r.hinweise,
      "Frist ohne gesetzliche Fristart erkannt (z. B. richterliche Frist) — berechnet ab Zustellung, Ende an Sa/So/Feiertag auf den nächsten Werktag verschoben; keine Hemmung durch die verhandlungsfreie Zeit angenommen.",
    ];
    return {
      ...dd,
      zustellungsdatum: ausloeser,
      zustellungsart: zustellung.art,
      date: r.fristende,
      confidence: capConfidence(dd.confidence, "medium"),
      rueckfrage: undefined,
      berechnung: {
        rechtsraum: "AT",
        bezeichnung: dd.description,
        notfrist: false,
        ...(erv ? { eingangsdatum: zustellung.datum } : {}),
        zustellungsdatum: ausloeser,
        fristende: r.fristende,
        vorfrist: r.vorfrist,
        hinweise,
      },
    };
  }

  const art = resolveFristArt(registryKey)!;
  const textDauer =
    dd.dauer && art.regime !== "materiell" && !dauerGleich(dd.dauer, art.dauer)
      ? dd.dauer
      : undefined;
  const rechne = (ferialsache: boolean): FristAutoErgebnis => {
    if (!textDauer) {
      return berechneFristAuto(registryKey, zustellung.datum, {
        ferialsache,
        vorfristTage: opts?.vorfristTage,
        zustellungsTrigger: erv ? "erv" : undefined,
      });
    }
    const r = berechneFrist({
      ausloeser,
      dauer: textDauer,
      regime: art.regime,
      gehemmtInVhfz: art.gehemmtInVhfz,
      ferialsache,
      vorfristTage: opts?.vorfristTage,
    });
    return { ...r, hinweise: [...ervHinweis, ...r.hinweise], art };
  };

  const main = rechne(ohneHemmung);
  let alt: string | undefined;
  if (art.regime === "zpo" && art.gehemmtInVhfz) {
    const other = rechne(!ohneHemmung);
    if (other.fristende !== main.fristende) alt = other.fristende;
  }

  const hinweise = [...main.hinweise];
  let confidence: DetectedDeadline["confidence"] = "high";
  if (textDauer) {
    hinweise.push(
      `Dauer laut Schriftstück (${dauerText(textDauer)}) weicht von der Regelfrist (${dauerText(art.dauer)}) ab — berechnet mit der Angabe im Schriftstück, bitte prüfen.`
    );
    confidence = "medium";
  }
  if (alt) {
    const h = vhfzHinweis(befund, alt);
    if (h) hinweise.push(h);
    if (befund.status === "zweifel" || befund.status === "unbekannt") confidence = "medium";
  }

  const berechnung: FristBerechnung = {
    rechtsraum: "AT",
    fristArt: art.key,
    bezeichnung: art.bezeichnung,
    rechtsgrundlage: art.rechtsgrundlage,
    notfrist: art.notfrist,
    ...(erv ? { eingangsdatum: zustellung.datum } : {}),
    zustellungsdatum: main.fristbeginn,
    fristende: main.fristende,
    vorfrist: main.vorfrist,
    ...(alt && !ohneHemmung ? { fristendeOhneHemmung: alt } : {}),
    ...(alt && ohneHemmung ? { fristendeMitHemmung: alt } : {}),
    ...(alt ? { ferialsache: befund.status } : {}),
    hinweise,
  };
  return {
    ...dd,
    fristResult: { ...main, hinweise },
    zustellungsdatum: main.fristbeginn,
    zustellungsart: zustellung.art,
    date: main.fristende,
    confidence,
    rueckfrage: undefined,
    berechnung,
  };
}

function enrichDE(
  dd: DetectedDeadline,
  registryKey: string | undefined,
  zustellung: Zustellung,
  opts: EnrichOpts | undefined
): DetectedDeadline {
  const hinweise: string[] = [];
  if (zustellung.art === "erv") {
    hinweise.push(
      "Eingang im ERV nach österreichischem Recht erkannt, Akte im deutschen Rechtsraum — Zustelltag bitte prüfen."
    );
  }
  if (registryKey) {
    const deKey =
      DE_TEMPLATE_MAP[registryKey] ?? (fristArtDE(registryKey) ? registryKey : undefined);
    const artDE = deKey ? fristArtDE(deKey) : undefined;
    if (!deKey || !artDE) {
      return {
        ...dd,
        date: undefined,
        confidence: capConfidence(dd.confidence, "medium"),
        rueckfrage:
          "Fristart nach deutschem Recht nicht zuordenbar — Frist bitte manuell berechnen.",
      };
    }
    const r = berechneFristArtDE(deKey, zustellung.datum, opts?.bundesland, opts?.vorfristTage);
    hinweise.push(...r.hinweise);
    if (dd.dauer && !dauerGleich(dd.dauer, artDE.dauer)) {
      hinweise.push(
        `Dauer laut Schriftstück (${dauerText(dd.dauer)}) weicht von der Regelfrist (${dauerText(artDE.dauer)}) ab — bitte prüfen.`
      );
    }
    return {
      ...dd,
      description: `${artDE.bezeichnung} (${artDE.rechtsgrundlage})`,
      zustellungsdatum: zustellung.datum,
      zustellungsart: zustellung.art,
      date: r.fristende,
      confidence: dd.dauer && !dauerGleich(dd.dauer, artDE.dauer) ? "medium" : "high",
      rueckfrage: undefined,
      berechnung: {
        rechtsraum: "DE",
        fristArt: artDE.key,
        bezeichnung: artDE.bezeichnung,
        rechtsgrundlage: artDE.rechtsgrundlage,
        notfrist: artDE.notfrist,
        zustellungsdatum: r.fristbeginn,
        fristende: r.fristende,
        vorfrist: r.vorfrist,
        hinweise,
      },
    };
  }
  const dauer = dd.dauer ?? (dd.daysFromNow ? { tage: dd.daysFromNow } : undefined);
  if (!dauer) return dd;
  const r = berechneFristDE({
    ausloeser: zustellung.datum,
    dauer,
    regime: "zpo",
    bundesland: opts?.bundesland,
    vorfristTage: opts?.vorfristTage,
  });
  hinweise.push(...r.hinweise, "Frist ohne gesetzliche Fristart — nach §§ 187 ff. BGB berechnet.");
  return {
    ...dd,
    zustellungsdatum: zustellung.datum,
    zustellungsart: zustellung.art,
    date: r.fristende,
    confidence: capConfidence(dd.confidence, "medium"),
    rueckfrage: undefined,
    berechnung: {
      rechtsraum: "DE",
      bezeichnung: dd.description,
      notfrist: false,
      zustellungsdatum: r.fristbeginn,
      fristende: r.fristende,
      vorfrist: r.vorfrist,
      hinweise,
    },
  };
}

/**
 * Reichert eine erkannte Frist mit der deterministischen Berechnung an.
 *
 * Grundregeln (eine versäumte Frist ist ein Haftungsfall):
 *  - Fristbeginn ist immer die Zustellung aus dem Text (bzw. aus dem Vorschlag)
 *    — nie ein im Text genanntes Fristende.
 *  - Ohne Zustelldatum gibt es kein berechnetes Datum und keine „high“-
 *    Konfidenz, sondern eine Rückfrage.
 *  - Frei formulierte Fristen ("binnen 14 Tagen") laufen ebenfalls über die
 *    Engine (Endtag-Verschiebung), nie als bloße Tagesaddition.
 *  - Der Rechtsraum der Akte bestimmt die Engine (AT / DE; CH: keine
 *    automatische Berechnung).
 */
export function enrichDetectedDeadline(
  dd: DetectedDeadline,
  fullText: string,
  opts?: EnrichOpts
): DetectedDeadline {
  const registryKey = registryKeyFor(dd.suggestedTemplate);
  const relativ = !registryKey && !dd.date && (dd.dauer || dd.daysFromNow);
  // Absolute dates, hearings, payment dates: literal, nothing to compute.
  if (!registryKey && !relativ) return dd;

  let zustellung: Zustellung | null = dd.zustellungsdatum
    ? { datum: dd.zustellungsdatum, art: dd.zustellungsart ?? "standard" }
    : extractZustellung(fullText);

  // Verjährung: the regex/manual path may carry the date of knowledge as dd.date.
  if (
    !zustellung &&
    dd.date &&
    dd.matchedRule !== "llm_fallback" &&
    (registryKey === "verjaehrung_kurz" || registryKey === "verjaehrung_lang")
  ) {
    zustellung = { datum: dd.date, art: "standard" };
  }

  const rechtsraum = opts?.rechtsraum ?? "AT";
  if (rechtsraum === "CH") {
    return {
      ...dd,
      date: registryKey ? undefined : dd.date,
      confidence: capConfidence(dd.confidence, "medium"),
      rueckfrage:
        "Für Akten im Schweizer Rechtsraum wird die Frist nicht automatisch berechnet — bitte manuell berechnen.",
    };
  }

  if (!zustellung) {
    if (dd.date) {
      // A named end date ("Berufung bis 04.05.2026") is the Fristende itself,
      // never the start of a new period.
      return {
        ...dd,
        confidence: capConfidence(dd.confidence, "medium"),
        rueckfrage:
          "Fristende aus dem Schriftstück übernommen, nicht berechnet — Zustelldatum fehlt, bitte gegen die Zustellung prüfen.",
      };
    }
    return {
      ...dd,
      confidence: capConfidence(dd.confidence, "medium"),
      rueckfrage: RUECKFRAGE_ZUSTELLDATUM,
    };
  }

  try {
    return rechtsraum === "DE"
      ? enrichDE(dd, registryKey, zustellung, opts)
      : enrichAT(dd, registryKey, zustellung, fullText, opts);
  } catch {
    // Not computable (invalid date etc.): keep the recognition, ask a human.
    return {
      ...dd,
      date: registryKey ? undefined : dd.date,
      confidence: capConfidence(dd.confidence, "medium"),
      rueckfrage: "Frist konnte nicht berechnet werden — bitte manuell prüfen.",
    };
  }
}

/** Gleiche Fristart mit gleichem Ende nur einmal; eine Rückfrage entfällt,
 *  wenn dieselbe Fristart schon berechnet wurde. */
function dedupeDeadlines(list: DetectedDeadline[]): DetectedDeadline[] {
  const berechnet = new Set(
    list.filter((d) => d.berechnung?.fristArt).map((d) => d.berechnung!.fristArt!)
  );
  const seen = new Set<string>();
  const out: DetectedDeadline[] = [];
  for (const d of list) {
    const key = registryKeyFor(d.suggestedTemplate);
    if (d.rueckfrage && !d.berechnung && key && berechnet.has(key)) continue;
    const k = d.berechnung
      ? `b|${d.berechnung.fristArt ?? d.berechnung.bezeichnung}|${d.berechnung.fristende}`
      : d.rueckfrage && key
        ? `r|${key}`
        : null;
    if (k) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(d);
  }
  return out;
}

/**
 * Verarbeitet alle erkannten Fristen und reichert sie mit deterministischen
 * Berechnungen an.
 */
export function enrichAllDeadlines(
  detected: DetectedDeadline[],
  fullText: string,
  opts?: EnrichOpts
): DetectedDeadline[] {
  const kontext = verfahrensKontext(fullText);
  const adjusted = detected.map((dd) =>
    // "Beschwerdefrist" in a Bescheid is the VwGVG/BAO appeal, not the StPO one.
    dd.suggestedTemplate === "beschwerde_stpo" &&
    (kontext === "verwaltung" || kontext === "abgaben")
      ? {
          ...dd,
          suggestedTemplate: kontext === "abgaben" ? "steuer_berufung_at" : "beschwerde_vwgvg",
          description:
            TEMPLATE_DESCRIPTIONS[
              kontext === "abgaben" ? "steuer_berufung_at" : "beschwerde_vwgvg"
            ]!,
        }
      : dd
  );
  return dedupeDeadlines(adjusted.map((dd) => enrichDetectedDeadline(dd, fullText, opts)));
}

// ── Gesamtweg für Schriftstücke ─────────────────────────────

/** Fristart, die ein Schriftstück dieses Typs typischerweise auslöst. */
export function fristartAusDokumenttyp(
  documentType: string | undefined,
  text: string
): { key: string; label: string; ohneZustellung: boolean } | undefined {
  const kontext = verfahrensKontext(text);
  const typ = (documentType ?? "").toLowerCase();
  const kopf = text.slice(0, 600);
  const ist = (wort: string, kopfRe: RegExp) => typ.includes(wort) || (!typ && kopfRe.test(kopf));
  if (ist("zahlungsbefehl", /ZAHLUNGSBEFEHL/)) {
    return { key: "einspruch_zahlungsbefehl", label: "Zahlungsbefehl", ohneZustellung: true };
  }
  if (typ.includes("versäumungsurteil") || typ.includes("anerkenntnisurteil")) return undefined;
  if (ist("urteil", /\bURTEIL\b|IM NAMEN DER REPUBLIK/)) {
    return kontext === "straf"
      ? undefined
      : { key: "berufung", label: "Urteil", ohneZustellung: true };
  }
  if (ist("bescheid", /\bBESCHEID\b/)) {
    return kontext === "abgaben"
      ? { key: "steuer_berufung_at", label: "Abgabenbescheid", ohneZustellung: true }
      : { key: "beschwerde_vwgvg", label: "Bescheid", ohneZustellung: true };
  }
  if (ist("beschluss", /\bBESCHLUSS\b/)) {
    return kontext === "zivil"
      ? { key: "rekurs", label: "Beschluss", ohneZustellung: false }
      : undefined;
  }
  if (/\bklage\b/.test(typ)) {
    return { key: "klagebeantwortung", label: "Klage", ohneZustellung: false };
  }
  return undefined;
}

export interface RecognizeOpts extends EnrichOpts {
  /** Dokumenttyp aus der Analyse (z.B. "Urteil", "Zahlungsbefehl"). */
  documentType?: string;
  /** Im Text belegte Stichtage der Analyse ([{date, what}]). */
  keyDates?: Array<{ date?: unknown; what?: unknown }>;
}

/**
 * Fristen eines Schriftstücks: Texterkennung + Zustellung + Frist-Engine,
 * ergänzt um die Fristart, die der Dokumenttyp auslöst, wenn der Text selbst
 * keine nennt. Alles Ergebnis ist Vorschlag — ein Mensch bestätigt.
 */
export function recognizeDeadlines(text: string, opts: RecognizeOpts = {}): DetectedDeadline[] {
  const detected = detectDeadlines(text);
  const ausText = extractZustellung(text);
  const zustellung = ausText ?? zustellungAusKeyDates(opts.keyDates);
  const mitZustellung = (d: DetectedDeadline): DetectedDeadline =>
    !ausText &&
    zustellung &&
    !d.zustellungsdatum &&
    (d.suggestedTemplate || d.dauer || d.daysFromNow)
      ? { ...d, zustellungsdatum: zustellung.datum, zustellungsart: zustellung.art }
      : d;

  const list = detected.map(mitZustellung);
  const typ = fristartAusDokumenttyp(opts.documentType, text);
  const hatFristart = list.some((d) => registryKeyFor(d.suggestedTemplate));
  if (typ && !hatFristart && (zustellung || typ.ohneZustellung)) {
    list.push(
      mitZustellung({
        type: "legal_deadline",
        description: TEMPLATE_DESCRIPTIONS[typ.key] ?? typ.key,
        confidence: "medium",
        sourceSnippet: `Dokumenttyp: ${typ.label}`,
        matchedRule: "document_type",
        suggestedTemplate: typ.key,
      })
    );
  }

  return enrichAllDeadlines(list, text, opts).map((d) => {
    if (d.matchedRule !== "document_type") return d;
    const hinweis = `Fristart aus dem Dokumenttyp abgeleitet — bitte prüfen, ob das Schriftstück anfechtbar ist und welche Frist gilt.`;
    return {
      ...d,
      confidence: capConfidence(d.confidence, "medium"),
      ...(d.berechnung
        ? { berechnung: { ...d.berechnung, hinweise: [...d.berechnung.hinweise, hinweis] } }
        : {}),
    };
  });
}
