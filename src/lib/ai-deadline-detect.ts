/**
 * KI-gestützte Fristen-Erkennung für SigmaBrain.
 *
 * Hybrid-Ansatz:
 *   1. Regex-basierte Erkennung (schnell, offline, für 80% der Fälle)
 *   2. KI-API-Fallback für komplexe Formulierungen und juristische Kontexte
 *
 * Erkennt:
 *   - Absolute Daten ("bis 30.06.2024")
 *   - Relative Fristen ("innerhalb von 14 Tagen")
 *   - Gesetzliche Fristen ("Klageerwiderung", "Berufungsfrist")
 *   - Gerichtstermine
 *   - Beweisaufnahmen
 *   - Rechtsmittelfristen (ZPO, BGB, StPO)
 */

export interface DetectedDeadline {
  type: string;
  description: string;
  date?: string; // ISO 8601 wenn absolut ermittelbar
  daysFromNow?: number; // bei relativen Fristen
  confidence: "high" | "medium" | "low";
  sourceSnippet: string;
  matchedRule: string;
  suggestedTemplate?: string; // z.B. "zpo-klageerwiderung"
}

// --- Regex-basierte Erkennung ---

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
    regex: /(?:bis|frist|fristen|termin|beweisaufnahme)[\s:]*(\d{1,2})[.\s]\s*(\d{1,2}|Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)[.\s]\s*(\d{4})/i,
    type: "absolute_deadline",
    extractDate: (m) => {
      const day = parseInt(m[1], 10);
      let month: number;
      const m2 = m[2];
      if (/^\d+$/.test(m2)) month = parseInt(m2, 10);
      else {
        const months: Record<string, number> = { jan: 1, feb: 2, mär: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
        month = months[m2.toLowerCase()] || 1;
      }
      const year = parseInt(m[3], 10);
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    },
  },
  // Absolute AT-Datum: "bis 30. 6. 2024"
  {
    name: "absolute_date_at",
    regex: /(?:bis|frist|termin)[\s:]*(\d{1,2})[.\s]\s*(\d{1,2})[.\s]\s*(\d{4})/i,
    type: "absolute_deadline",
    extractDate: (m) => {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    },
  },
  // Relative: "innerhalb von 14 Tagen"
  {
    name: "relative_days",
    regex: /(?:innerhalb|binnen|innerhalb von|spätestens in)[\s]+(\d+)[\s]+(?:Tagen|Wochen|Woche|Tag)/i,
    type: "relative_deadline",
    extractDate: (m) => {
      const num = parseInt(m[1], 10);
      return { daysFromNow: num };
    },
  },
  // Gesetzliche Fristen mit Template-Mapping
  {
    name: "zpo_klageerwiderung",
    regex: /(?:Klageerwiderung|Erwiderung auf die Klage)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "zpo-klageerwiderung",
  },
  {
    name: "zpo_berufung",
    regex: /(?:Berufung|berufen|Rechtsmittel|Beschwerde)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "zpo-berufung",
  },
  {
    name: "zpo_wiedereinsetzung",
    regex: /(?:Wiedereinsetzung|Wiederherstellung)[\s\S]{0,30}(?:frist|fristen|termin)/i,
    type: "legal_deadline",
    template: "zpo-wiedereinsetzung",
  },
  {
    name: "bgb_verjaehrung",
    regex: /(?:Verjährung|verjährt|Verjährungsfrist)[\s\S]{0,30}(?:3 Jahre|10 Jahre|30 Jahre)/i,
    type: "legal_deadline",
    template: "abgb-verjaehrung",
  },
  {
    name: "stpo_beschwerde",
    regex: /(?:Sofortige Beschwerde|Beschwerde)[\s\S]{0,30}(?:frist|fristen|1 Woche|7 Tage)/i,
    type: "legal_deadline",
    template: "stpo-beschwerde",
  },
  // Gerichtstermine
  {
    name: "court_date",
    regex: /(?:Verhandlung|Hauptverhandlung|Beweisaufnahme|Gerichtstag)[\s\S]{0,50}?(\d{1,2})[.\s]\s*(\d{1,2}|Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)[.\s]\s*(\d{4})/i,
    type: "court_hearing",
    extractDate: (m) => {
      const day = parseInt(m[1], 10);
      let month: number;
      const m2 = m[2];
      if (/^\d+$/.test(m2)) month = parseInt(m2, 10);
      else {
        const months: Record<string, number> = { jan: 1, feb: 2, mär: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
        month = months[m2.toLowerCase()] || 1;
      }
      const year = parseInt(m[3], 10);
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    },
  },
  // "Mahnfrist" / "Zahlungsfrist"
  {
    name: "payment_deadline",
    regex: /(?:Zahlungsfrist|Mahnfrist|fristgerecht)[\s\S]{0,30}?(\d{1,2})[.\s]\s*(\d{1,2})[.\s]\s*(\d{4})/i,
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
    const matches = text.matchAll(rule.regex.global ? rule.regex : new RegExp(rule.regex.source, "gi"));
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
  rule: typeof RULES[0],
  match: RegExpMatchArray,
  date?: string,
  daysFromNow?: number
): string {
  if (rule.template) {
    const map: Record<string, string> = {
      "zpo-klageerwiderung": "Klageerwiderungsfrist (§ 167 ZPO)",
      "zpo-berufung": "Berufungsfrist (§ 517 ZPO)",
      "zpo-wiedereinsetzung": "Wiedereinsetzungsfrist (§ 233 ZPO)",
      "abgb-verjaehrung": "Verjährungsfrist (§ 1488 ABGB / § 195 BGB)",
      "stpo-beschwerde": "Beschwerdefrist (§ 295 StPO)",
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
