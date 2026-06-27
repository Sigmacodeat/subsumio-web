/**
 * Dokument-Anonymisierung für Berufsgeheimnisträger (§ 203 StGB, § 43e BRAO).
 *
 * Zweck: personenbezogene/identifizierende Daten aus einem Text entfernen oder
 * pseudonymisieren, BEVOR der Text an ein Cloud-LLM geht — oder um eine
 * teilbare, geschwärzte Fassung zu erzeugen.
 *
 * Design:
 *  - Deterministische Regex-Schicht (offline, ohne LLM): IBAN/BIC, E-Mail,
 *    Telefon, Aktenzeichen, USt-IdNr/Steuernummer, IP, Kreditkarte, PLZ+Ort.
 *  - Optionale LLM-Schicht (nur wenn ein Chat-Provider konfiguriert ist):
 *    Personen- und Unternehmensnamen, die Regex nicht zuverlässig findet.
 *  - Konsistente Pseudonyme: gleicher Wert → gleicher Platzhalter
 *    ([PERSON 1], [UNTERNEHMEN 2], [IBAN], …). Ein Mapping erlaubt die
 *    spätere Re-Identifikation durch den Berechtigten.
 *
 * Reine Funktionen, damit testbar ohne DB/Netz.
 */

export type AnonEntityType =
  | "person"
  | "organization"
  | "iban"
  | "bic"
  | "email"
  | "phone"
  | "aktenzeichen"
  | "tax_id"
  | "address"
  | "ip"
  | "credit_card";

export interface AnonReplacement {
  type: AnonEntityType;
  original: string;
  placeholder: string;
}

export interface AnonymizeResult {
  text: string;
  replacements: AnonReplacement[];
  /** Count per type for a quick UI summary. */
  stats: Record<string, number>;
  /** True when the LLM name layer ran (vs. regex-only). */
  llmUsed: boolean;
}

const TYPE_LABEL: Record<AnonEntityType, string> = {
  person: "PERSON",
  organization: "UNTERNEHMEN",
  iban: "IBAN",
  bic: "BIC",
  email: "E-MAIL",
  phone: "TELEFON",
  aktenzeichen: "AKTENZEICHEN",
  tax_id: "STEUER-ID",
  address: "ADRESSE",
  ip: "IP",
  credit_card: "KARTENNUMMER",
};

// ── Regex-Muster (DACH-Kontext) ──────────────────────────────
// Reihenfolge ist wichtig: spezifischere/längere Muster zuerst, damit z. B.
// eine IBAN nicht teilweise als Telefonnummer erfasst wird.
const PATTERNS: { type: AnonEntityType; re: RegExp }[] = [
  // IBAN: DE + generisch. Optional gruppiert mit Leerzeichen.
  { type: "iban", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  // Kreditkarte (13–16 Ziffern, optional in 4er-Gruppen)
  { type: "credit_card", re: /\b(?:\d[ -]?){13,16}\b/g },
  { type: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // USt-IdNr (DE/AT) + deutsche Steuernummer
  { type: "tax_id", re: /\b(?:DE\d{9}|ATU\d{8}|\d{2,3}\/\d{3}\/\d{5})\b/g },
  // Aktenzeichen: z. B. "4 O 123/26", "1 BvR 1234/20", "VIII ZR 1/23", "AN 13b D 24.1173"
  {
    type: "aktenzeichen",
    re: /\b(?:[IVXLC]{1,5}|\d{1,3})[ ][A-Za-zÄÖÜ]{1,5}[ ]?\d{0,3}[ ]?\d{1,5}[/.]\d{1,4}\b/g,
  },
  // BIC bewusst NICHT auto-erkannt: ein nacktes 8–11-Großbuchstaben-Muster
  // träfe jedes ALLCAPS-Wort (und gesetzte Platzhalter) falsch-positiv.
  // IPv4
  { type: "ip", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  // Telefon (DE/AT/intl., +, Klammern, Bindestriche, Leerzeichen)
  {
    type: "phone",
    re: /(?:(?:\+|00)\d{1,3}[ -]?)?(?:\(0?\d{2,5}\)|0?\d{2,5})[ /-]?\d{3,9}(?:[ -]?\d{2,6})?/g,
  },
  // PLZ + Ort (5-stellige PLZ gefolgt von einem Ortsnamen)
  { type: "address", re: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+(?:[ -][A-ZÄÖÜ][a-zäöüß]+)?\b/g },
];

/** Minimale Plausibilität, um Falsch-Positive (z. B. lange Ziffernfolgen) zu dämpfen. */
function looksValid(type: AnonEntityType, value: string): boolean {
  const v = value.trim();
  if (type === "credit_card") {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 16;
  }
  if (type === "phone") {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 6 && digits.length <= 15;
  }
  if (type === "iban") {
    return v.replace(/\s/g, "").length >= 15;
  }
  return true;
}

/** Stabile Platzhalter-Vergabe: gleicher Originalwert → gleicher Platzhalter. */
class PlaceholderRegistry {
  private byValue = new Map<string, string>();
  private counters = new Map<AnonEntityType, number>();
  readonly replacements: AnonReplacement[] = [];

  assign(type: AnonEntityType, original: string): string {
    const key = `${type}:${original.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const existing = this.byValue.get(key);
    if (existing) return existing;
    // Für singuläre Typen (E-Mail, IBAN, …) ohne Nummerierung lesbarer:
    const numbered = type === "person" || type === "organization" || type === "address";
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    const placeholder = numbered ? `[${TYPE_LABEL[type]} ${n}]` : `[${TYPE_LABEL[type]}]`;
    this.byValue.set(key, placeholder);
    this.replacements.push({ type, original, placeholder });
    return placeholder;
  }
}

export interface NameEntity {
  text: string;
  type: "person" | "organization";
}

/** Optionaler LLM-Detektor für Namen. Liefert [] wenn kein Provider verfügbar. */
export type NameDetector = (text: string) => Promise<NameEntity[]>;

export interface AnonymizeOpts {
  /** Welche Typen anonymisiert werden. Default: alle. */
  types?: AnonEntityType[];
  /** Optionaler LLM-Namensdetektor (person/organization). */
  detectNames?: NameDetector;
}

/**
 * Anonymisiert `text`. Regex-Schicht läuft immer; Namens-Schicht nur, wenn
 * `detectNames` übergeben wird und Treffer liefert.
 */
export async function anonymizeText(
  text: string,
  opts: AnonymizeOpts = {}
): Promise<AnonymizeResult> {
  const enabled = new Set<AnonEntityType>(
    opts.types ?? (Object.keys(TYPE_LABEL) as AnonEntityType[])
  );
  const registry = new PlaceholderRegistry();
  let out = text;
  let llmUsed = false;

  // 1. Namens-Schicht zuerst (längste, kontextabhängige Treffer), damit
  //    Regex-Muster nicht in bereits gesetzte Platzhalter hineinschneiden.
  if (opts.detectNames && (enabled.has("person") || enabled.has("organization"))) {
    try {
      const names = await opts.detectNames(text);
      llmUsed = names.length > 0;
      // Längste zuerst ersetzen, damit Teilstrings nicht zuerst greifen.
      const sorted = [...names].sort((a, b) => b.text.length - a.text.length);
      for (const n of sorted) {
        if (!enabled.has(n.type)) continue;
        const needle = n.text.trim();
        if (needle.length < 2) continue;
        if (!out.includes(needle)) continue;
        const placeholder = registry.assign(n.type, needle);
        out = out.split(needle).join(placeholder);
      }
    } catch {
      // LLM-Schicht ist best-effort; Regex-Schicht reicht als Fallback.
    }
  }

  // 2. Deterministische Regex-Schicht.
  // Gesetzte Platzhalter ([PERSON 1], [IBAN], …) vor der Regex-Schicht durch
  // Sentinels aus dem Unicode-Private-Use-Bereich maskieren, damit kein Muster
  // versehentlich IN einen Platzhalter schneidet. Nach der Schicht restaurieren.
  const sentinels: string[] = [];
  out = out.replace(/\[[A-ZÄÖÜ]+(?: \d+)?\]/g, (ph) => {
    const token = `${sentinels.length}`;
    sentinels.push(ph);
    return token;
  });

  for (const { type, re } of PATTERNS) {
    if (!enabled.has(type)) continue;
    out = out.replace(re, (match) => {
      if (!looksValid(type, match)) return match;
      return registry.assign(type, match.trim());
    });
  }

  // Sentinels zurücksetzen.
  out = out.replace(/(\d+)/g, (_m, i) => sentinels[Number(i)] ?? "");

  const stats: Record<string, number> = {};
  for (const r of registry.replacements) {
    stats[r.type] = (stats[r.type] ?? 0) + 1;
  }

  return { text: out, replacements: registry.replacements, stats, llmUsed };
}
