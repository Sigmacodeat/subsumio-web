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
  berechneFristAuto,
  type FristAutoErgebnis,
} from "@/lib/legal/frist-engine";

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
}

// --- Regex-basierte Erkennung ---

// Ausgeschriebene deutsche Zahlwörter — für "binnen vier Wochen", "vierzehn Tagen".
const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einem: 1,
  einen: 1,
  einer: 1,
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
    regex: /(?:Klagebeantwortung|Klageerwiderung|Erwiderung auf die Klage)[\s\S]{0,30}(?:frist|fristen|termin)/i,
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
    regex: /(?:Einspruch[\s\S]{0,10}gegen[\s\S]{0,10}Zahlungsbefehl|Einspruchsfrist[\s\S]{0,20}Zahlungsbefehl)/i,
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
    regex: /(?:Sofortige Beschwerde|Beschwerde)[\s\S]{0,30}(?:frist|fristen|1 Woche|7 Tage|14 Tage)/i,
    type: "legal_deadline",
    template: "beschwerde_stpo",
  },
  {
    name: "avg_beschwerde_vwgvg",
    regex: /(?:Bescheidbeschwerde|Beschwerde[\s\S]{0,10}gegen[\s\S]{0,10}Bescheid|Beschwerde an das Verwaltungsgericht)[\s\S]{0,30}(?:frist|fristen|termin)/i,
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
    regex: /(?:Revision an den VwGH|Verwaltungsgerichtshof-Revision|VwGH-Revision)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "revision_vwgh",
  },
  {
    name: "vfg_beschwerde",
    regex: /(?:Beschwerde an den VfGH|Verfassungsgerichtshof-Beschwerde|VfGH-Beschwerde)[\s\S]{0,30}(?:frist|fristen|termin)/i,
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

      results.push({
        type: rule.type,
        description: describeDeadline(rule, match, date, daysFromNow),
        date,
        daysFromNow,
        confidence,
        sourceSnippet: snippet,
        matchedRule: rule.name,
        suggestedTemplate: rule.template,
      });
    }
  }

  return results;
}

function describeDeadline(
  rule: (typeof RULES)[0],
  match: RegExpMatchArray,
  date?: string,
  daysFromNow?: number
): string {
  if (rule.template) {
    const map: Record<string, string> = {
      klagebeantwortung: "Klagebeantwortungsfrist (§ 230 Abs 1 ZPO)",
      berufung: "Berufungsfrist (§ 464 Abs 1 ZPO)",
      revision: "Revisionsfrist (§ 505 Abs 2 ZPO)",
      rekurs: "Rekursfrist (§ 521 Abs 1 ZPO)",
      wiedereinsetzung: "Wiedereinsetzungsfrist (§ 148 Abs 2 ZPO)",
      einspruch_zahlungsbefehl: "Einspruchsfrist gegen Zahlungsbefehl (§ 248 Abs 2 ZPO)",
      verjaehrung_kurz: "Kurze Verjährungsfrist (§ 1489 ABGB — 3 Jahre)",
      verjaehrung_lang: "Lange Verjährungsfrist (§ 1489 Satz 2 ABGB — 30 Jahre)",
      beschwerde_stpo: "Beschwerdefrist (§ 88 Abs 1 StPO)",
      beschwerde_vwgvg: "Bescheidbeschwerdefrist (§ 7 Abs 4 VwGVG)",
      vorstellung_avg: "Vorstellungsfrist (§ 57 Abs 2 AVG)",
      revision_vwgh: "Revisionsfrist an den VwGH (§ 26 Abs 1 VwGG)",
      beschwerde_vfgh: "Beschwerdefrist an den VfGH (§ 82 Abs 1 VfGG)",
    };
    return map[rule.template] || rule.template;
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

// ── Zustellungsdatum-Extraktion ─────────────────────────────

/**
 * Regex-Muster um das Zustellungsdatum aus einem Text zu extrahieren.
 * Erkennt:
 *   - "zugestellt am 15.03.2024"
 *   - "Zustellung am 15. März 2024"
 *   - "zugestellt am 2024-03-15"
 *   - "Zustelldatum: 15.03.2024"
 *   - "am 15.03.2024 zugestellt"
 *   - "per ERV zugestellt am 15.03.2024"
 */
const ZUSTELLUNG_REGEXES: Array<{ re: RegExp; name: string }> = [
  // "zugestellt am DD.MM.YYYY" / "Zustellung am DD.MM.YYYY"
  {
    re: /(?:zugestellt|Zustellung|Zustelldatum)[\s:]*am\s+(\d{1,2})[.\s]\s*(\d{1,2}|Jan(?:uar)?|Feb(?:ruar)?|Mär(?:z)?|Apr(?:il)?|Mai|Jun(?:i)?|Jul(?:i)?|Aug(?:ust)?|Sep(?:tember)?|Okt(?:ober)?|Nov(?:ember)?|Dez(?:ember)?)[.\s]\s*(\d{4})/i,
    name: "zustellung_de",
  },
  // "zugestellt am YYYY-MM-DD" (ISO)
  {
    re: /(?:zugestellt|Zustellung|Zustelldatum)[\s:]*am\s+(\d{4})-(\d{2})-(\d{2})/i,
    name: "zustellung_iso",
  },
  // "am DD.MM.YYYY zugestellt" (reversed)
  {
    re: /am\s+(\d{1,2})[.\s]\s*(\d{1,2}|Jan(?:uar)?|Feb(?:ruar)?|Mär(?:z)?|Apr(?:il)?|Mai|Jun(?:i)?|Jul(?:i)?|Aug(?:ust)?|Sep(?:tember)?|Okt(?:ober)?|Nov(?:ember)?|Dez(?:ember)?)[.\s]\s*(\d{4})\s+(?:zugestellt|zustellig)/i,
    name: "zustellung_reversed",
  },
];

const MONTH_MAP: Record<string, number> = {
  jan: 1, januar: 1,
  feb: 2, februar: 2,
  mär: 3, märz: 3, mar: 3, marz: 3,
  apr: 4, april: 4,
  mai: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  okt: 10, oktober: 10,
  nov: 11, november: 11,
  dez: 12, dezember: 12,
};

function parseDateParts(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10);
  let m: number;
  if (/^\d+$/.test(month)) m = parseInt(month, 10);
  else m = MONTH_MAP[month.toLowerCase()] ?? 1;
  const y = parseInt(year, 10);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Extrahiert das Zustellungsdatum aus einem Text.
 * @returns ISO-Datum (YYYY-MM-DD) oder null
 */
export function extractZustellungsdatum(text: string): string | null {
  for (const { re } of ZUSTELLUNG_REGEXES) {
    const m = re.exec(text);
    if (m) {
      // ISO format: YYYY-MM-DD
      if (m.length === 4 && m[1]!.length === 4) {
        return `${m[1]}-${m[2]}-${m[3]}`;
      }
      // DE format: DD.MM.YYYY or DD. Month YYYY
      return parseDateParts(m[1]!, m[2]!, m[3]!);
    }
  }
  return null;
}

/**
 * Mappt template-Namen auf FRISTEN_REGISTRY Keys.
 * Die alten template-Namen (z.B. "zpo-klageerwiderung") werden auf die
 * neuen Registry-Keys (z.B. "klagebeantwortung") gemappt.
 */
const TEMPLATE_TO_REGISTRY: Record<string, string> = {
  "zpo-klageerwiderung": "klagebeantwortung",
  "zpo-berufung": "berufung",
  "zpo-wiedereinsetzung": "wiedereinsetzung",
  "abgb-verjaehrung": "verjaehrung_kurz",
  "stpo-beschwerde": "beschwerde_stpo",
  // Neue direkten Registry-Keys (kein Mapping nötig):
  klagebeantwortung: "klagebeantwortung",
  berufung: "berufung",
  revision: "revision",
  rekurs: "rekurs",
  wiedereinsetzung: "wiedereinsetzung",
  einspruch_zahlungsbefehl: "einspruch_zahlungsbefehl",
  verjaehrung_kurz: "verjaehrung_kurz",
  verjaehrung_lang: "verjaehrung_lang",
  beschwerde_stpo: "beschwerde_stpo",
  beschwerde_vwgvg: "beschwerde_vwgvg",
  vorstellung_avg: "vorstellung_avg",
  revision_vwgh: "revision_vwgh",
  beschwerde_vfgh: "beschwerde_vfgh",
};

/**
 * Reichert eine erkannte Frist mit deterministischer Berechnung an.
 *
 * Wenn ein suggestedTemplate vorhanden ist und ein Zustellungsdatum
 * extrahiert werden kann, wird berechneFristAuto() aufgerufen.
 * Das Ergebnis (fristende, vorfrist, hinweise) wird in den DetectedDeadline
 * eingetragen.
 *
 * @param dd  Der erkannte Deadline
 * @param fullText  Der vollständige Text (für Zustellungsdatum-Extraktion)
 * @param opts  Optional: ferialsache, vorfristTage
 */
export function enrichDetectedDeadline(
  dd: DetectedDeadline,
  fullText: string,
  opts?: { ferialsache?: boolean; vorfristTage?: number }
): DetectedDeadline {
  if (!dd.suggestedTemplate) return dd;

  const registryKey = TEMPLATE_TO_REGISTRY[dd.suggestedTemplate];
  if (!registryKey) return dd;

  // Zustellungsdatum aus dem Text extrahieren
  let zustellung = dd.zustellungsdatum ?? extractZustellungsdatum(fullText);

  // Wenn kein Zustellungsdatum gefunden, aber dd.date vorhanden (absolute Frist)
  // — für materiellrechtliche Fristen (Verjährung) nutzen wir dd.date als Auslöser
  if (!zustellung && dd.date) {
    // Für Verjährung: dd.date ist das Datum der Kenntniserlangung
    // Für absolute Fristen: dd.date ist das Fristende selbst
    const art = TEMPLATE_TO_REGISTRY[dd.suggestedTemplate];
    if (art === "verjaehrung_kurz" || art === "verjaehrung_lang") {
      zustellung = dd.date;
    }
  }

  if (!zustellung) return dd;

  try {
    const result = berechneFristAuto(registryKey, zustellung, opts);
    return {
      ...dd,
      fristResult: result,
      zustellungsdatum: zustellung,
      date: result.fristende, // Überschreibe mit deterministisch berechnetem Ende
      confidence: "high", // Deterministisch berechnet → high confidence
    };
  } catch {
    // Wenn die Berechnung fehlschlägt, behalte die ursprüngliche Erkennung
    return { ...dd, zustellungsdatum: zustellung };
  }
}

/**
 * Verarbeitet alle erkannten Fristen und reichert sie mit deterministischen
 * Berechnungen an.
 *
 * @param detected  Die Liste der erkannten Deadlines
 * @param fullText  Der vollständige Text (für Zustellungsdatum-Extraktion)
 * @param opts  Optional: ferialsache, vorfristTage
 */
export function enrichAllDeadlines(
  detected: DetectedDeadline[],
  fullText: string,
  opts?: { ferialsache?: boolean; vorfristTage?: number }
): DetectedDeadline[] {
  return detected.map((dd) => enrichDetectedDeadline(dd, fullText, opts));
}
