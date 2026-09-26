/**
 * case-facts — Aktendaten aus einem Schriftstück: Gericht, Geschäftszahl,
 * Streitwert und die Parteien mit ihrer Verfahrensrolle (+ Vertreter).
 *
 * Deterministic first: Austrian Schriftsätze and gerichtliche Erledigungen
 * carry these in a fixed header ("Klagende Partei: …", "vertreten durch: …",
 * "GZ 12 Cg 34/25x", "wegen EUR 8.450,-- s.A."). Regex wins where it finds a
 * value; the model only fills gaps, and every model value must appear
 * verbatim in the document (same anti-hallucination rule as issues and key
 * dates). The output is a SUGGESTION for the matter — the lawyer accepts it;
 * nothing here writes to a case.
 *
 * Which side is "our" client is not in the document; the web app resolves
 * Kläger/Beklagter to Mandant/Gegner against the matter's client.
 */
import { findeGZImText, formatiereGZ, GATTUNGSZEICHEN_REGISTRY } from "./gz-validate.ts";

export type ProceduralRole =
  | "klagende_partei"
  | "beklagte_partei"
  | "antragsteller"
  | "antragsgegner"
  | "beschwerdefuehrer"
  | "behoerde"
  | "gericht"
  | "vertreter"
  | "sonstige";

const ROLES: ReadonlySet<string> = new Set<ProceduralRole>([
  "klagende_partei",
  "beklagte_partei",
  "antragsteller",
  "antragsgegner",
  "beschwerdefuehrer",
  "behoerde",
  "gericht",
  "vertreter",
  "sonstige",
]);

export type FactMethod = "regex" | "llm";

export interface ExtractedParty {
  name: string;
  role: ProceduralRole;
  /** Representative named for this party ("vertreten durch …"), if any. */
  vertreter?: string;
  method: FactMethod;
}

export interface CaseFactValue<T> {
  value: T;
  /** Verbatim span of the document the value was read from. */
  quote: string;
  method: FactMethod;
}

export interface CaseFacts {
  gericht?: CaseFactValue<string>;
  geschaeftszahl?: CaseFactValue<string>;
  /** Streitwert in EUR. */
  streitwert?: CaseFactValue<number>;
  parteien: ExtractedParty[];
}

const HEADER_CHARS = 4000;

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function inText(needle: string, haystackNormalized: string): boolean {
  const n = normalize(needle);
  return n.length >= 2 && haystackNormalized.includes(n);
}

// ── Geschäftszahl ───────────────────────────────────────────

function knownGattung(g: string): boolean {
  const lower = g.toLowerCase();
  return GATTUNGSZEICHEN_REGISTRY.some((r) => r.zeichen.toLowerCase() === lower);
}

function extractGeschaeftszahl(head: string): CaseFactValue<string> | undefined {
  // Labelled first ("GZ", "Geschäftszahl", "Aktenzeichen", "Az"), then the
  // first Geschäftszahl with a known Gattungszeichen in the header.
  const labelled = /(?:^|[\s(])(?:gz|geschäftszahl|geschaeftszahl|aktenzeichen|az)\.?\s*:?\s*/giu;
  const finds = findeGZImText(head);
  for (const m of head.matchAll(labelled)) {
    const at = (m.index ?? 0) + m[0].length;
    const f = finds.find((g) => g.index === at);
    if (f && knownGattung(f.gattung))
      return { value: formatiereGZ(f), quote: f.raw, method: "regex" };
  }
  const first = finds.find((g) => knownGattung(g.gattung));
  return first ? { value: formatiereGZ(first), quote: first.raw, method: "regex" } : undefined;
}

// ── Gericht / Behörde ───────────────────────────────────────

const COURT_PREFIX =
  "(?:Bezirksgericht(?:\\s+für\\s+Handelssachen)?|Landesgericht(?:\\s+für\\s+(?:Zivilrechtssachen|ZRS|Strafsachen))?|Handelsgericht|Arbeits-\\s+und\\s+Sozialgericht|Oberlandesgericht|Landesverwaltungsgericht|Verwaltungsgericht|Bundesverwaltungsgericht|Bundesfinanzgericht|Oberster\\s+Gerichtshof|Verwaltungsgerichtshof|Verfassungsgerichtshof)";
const COURT_RE = new RegExp(`${COURT_PREFIX}((?:[ \\t]+[^\\s,;:]+){0,5})`, "u");
const PLACE_CONNECTORS = new Set(["an", "der", "im", "am", "in", "bei", "a.d."]);

function extractGericht(head: string): CaseFactValue<string> | undefined {
  const m = COURT_RE.exec(head);
  if (!m) return undefined;
  const prefix = m[0].slice(0, m[0].length - (m[1]?.length ?? 0)).replace(/\s+/g, " ");
  const tokens = (m[1] ?? "")
    .trim()
    .split(/[ \t]+/)
    .filter(Boolean);
  const place: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (/^[A-ZÄÖÜ]/.test(t) && !/^(GZ|Az|AZ|Geschäftszahl|Klagende|Beklagte)$/.test(t)) {
      if (/(?:straße|gasse|platz|weg|ring)$/i.test(t)) break;
      place.push(t);
    } else if (PLACE_CONNECTORS.has(t) && /^[A-ZÄÖÜ]/.test(tokens[i + 1] ?? "")) {
      place.push(t);
    } else {
      break;
    }
  }
  const value = [prefix, ...place].join(" ").replace(/[.,]$/, "").trim();
  return { value, quote: value, method: "regex" };
}

// ── Streitwert ──────────────────────────────────────────────

/** "8.450,00" / "8.450,--" / "8450" / "25.000" → number (EUR). */
export function parseEuroBetrag(raw: string): number | null {
  const cleaned = raw.replace(/,-+$/, "").replace(/\s/g, "");
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const AMOUNT = "(?:EUR|€)\\s*([\\d.]+(?:,(?:\\d{1,2}|-+))?)";
const STREITWERT_RES = [
  new RegExp(
    `(?:Streitwert|Wert\\s+des\\s+Streitgegenstandes|Bemessungsgrundlage)\\s*:?\\s*${AMOUNT}`,
    "iu"
  ),
  new RegExp(`(?:^|\\n)\\s*wegen\\s*:?\\s*${AMOUNT}`, "iu"),
];

function extractStreitwert(head: string): CaseFactValue<number> | undefined {
  for (const re of STREITWERT_RES) {
    const m = re.exec(head);
    if (!m) continue;
    const value = parseEuroBetrag(m[1]!);
    if (value !== null) return { value, quote: m[0].trim(), method: "regex" };
  }
  return undefined;
}

// ── Parteien ────────────────────────────────────────────────

const PARTY_LINE =
  /^[ \t]*(klagende\s+partei(?:en)?|kläger(?:in)?|beklagte\s+partei(?:en)?|beklagte[r]?|antragsteller(?:in)?|antragsgegner(?:in)?|beschwerdeführer(?:in)?|revisionswerber(?:in)?)[ \t]*:[ \t]*(.+)$/gimu;

function roleOf(label: string): ProceduralRole {
  const l = label.toLowerCase();
  if (l.startsWith("klagend") || l.startsWith("kläger")) return "klagende_partei";
  if (l.startsWith("beklagt")) return "beklagte_partei";
  if (l.startsWith("antragsteller")) return "antragsteller";
  if (l.startsWith("antragsgegner")) return "antragsgegner";
  return "beschwerdefuehrer";
}

/** Name part of "Anna Beispiel, geb. …, Adresse" — up to the first comma. */
function nameFrom(segment: string): string {
  return segment
    .split(/,|\s+vertreten\s+durch\b|\s+FN\s+\d/i)[0]!
    .replace(/\s+/g, " ")
    .trim();
}

function extractParteien(head: string): ExtractedParty[] {
  const lines = head.split(/\r?\n/);
  const out: ExtractedParty[] = [];
  for (let i = 0; i < lines.length; i++) {
    PARTY_LINE.lastIndex = 0;
    const m = PARTY_LINE.exec(lines[i]!);
    if (!m) continue;
    const name = nameFrom(m[2]!);
    if (!name || name.length < 2) continue;
    let vertreter: string | undefined;
    const inline = /vertreten\s+durch\s*:?\s*(.+)$/i.exec(m[2]!);
    if (inline) vertreter = nameFrom(inline[1]!);
    for (let j = i + 1; !vertreter && j <= i + 3 && j < lines.length; j++) {
      PARTY_LINE.lastIndex = 0;
      if (PARTY_LINE.test(lines[j]!)) break;
      const v = /^\s*vertreten\s+durch\s*:?\s*(.+)$/i.exec(lines[j]!);
      if (v) vertreter = nameFrom(v[1]!);
    }
    out.push({
      name,
      role: roleOf(m[1]!),
      ...(vertreter ? { vertreter } : {}),
      method: "regex",
    });
  }
  return out;
}

/** Deterministic extraction from the document header. */
export function extractCaseFactsDeterministic(text: string): CaseFacts {
  const head = text.slice(0, HEADER_CHARS);
  const gericht = extractGericht(head);
  const geschaeftszahl = extractGeschaeftszahl(head);
  const streitwert = extractStreitwert(head);
  return {
    ...(gericht ? { gericht } : {}),
    ...(geschaeftszahl ? { geschaeftszahl } : {}),
    ...(streitwert ? { streitwert } : {}),
    parteien: extractParteien(head),
  };
}

// ── Model output → grounded facts ───────────────────────────

/**
 * Parties from the model: accepts strings ("Anna Beispiel") and objects
 * ({name, role, vertreter}). Only names that appear in the document survive.
 */
export function groundLlmParties(raw: unknown, documentText: string): ExtractedParty[] {
  if (!Array.isArray(raw)) return [];
  const hay = normalize(documentText);
  const out: ExtractedParty[] = [];
  for (const item of raw) {
    const o =
      typeof item === "string"
        ? { name: item }
        : item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : null;
    if (!o) continue;
    const name = typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim() : "";
    if (!name || !inText(name, hay)) continue;
    const role =
      typeof o.role === "string" && ROLES.has(o.role) ? (o.role as ProceduralRole) : "sonstige";
    const vertreterRaw = typeof o.vertreter === "string" ? o.vertreter.trim() : "";
    out.push({
      name,
      role,
      ...(vertreterRaw && inText(vertreterRaw, hay) ? { vertreter: vertreterRaw } : {}),
      method: "llm",
    });
  }
  return out;
}

/** Court / Geschäftszahl / Streitwert from the model, kept only if verbatim in the text. */
export function groundLlmCaseFacts(raw: unknown, documentText: string): CaseFacts {
  const facts: CaseFacts = { parteien: [] };
  if (!raw || typeof raw !== "object") return facts;
  const o = raw as Record<string, unknown>;
  const hay = normalize(documentText);
  if (typeof o.gericht === "string" && inText(o.gericht, hay)) {
    const v = o.gericht.replace(/\s+/g, " ").trim();
    facts.gericht = { value: v, quote: v, method: "llm" };
  }
  if (typeof o.geschaeftszahl === "string" && inText(o.geschaeftszahl, hay)) {
    const gz = findeGZImText(o.geschaeftszahl)[0];
    if (gz)
      facts.geschaeftszahl = {
        value: formatiereGZ(gz),
        quote: o.geschaeftszahl.trim(),
        method: "llm",
      };
  }
  if (typeof o.streitwert === "string" && inText(o.streitwert, hay)) {
    const amount = /([\d.]+(?:,(?:\d{1,2}|-+))?)/.exec(o.streitwert);
    const value = amount ? parseEuroBetrag(amount[1]!) : null;
    if (value !== null) facts.streitwert = { value, quote: o.streitwert.trim(), method: "llm" };
  }
  return facts;
}

/** Deterministic values win; the model only fills what regex did not find. */
export function mergeCaseFacts(det: CaseFacts, llm: CaseFacts): CaseFacts {
  const seen = new Set(det.parteien.map((p) => normalize(p.name)));
  const parteien = [...det.parteien];
  for (const p of llm.parteien) {
    const k = normalize(p.name);
    if (seen.has(k)) continue;
    seen.add(k);
    parteien.push(p);
  }
  return {
    ...((det.gericht ?? llm.gericht) ? { gericht: det.gericht ?? llm.gericht } : {}),
    ...((det.geschaeftszahl ?? llm.geschaeftszahl)
      ? { geschaeftszahl: det.geschaeftszahl ?? llm.geschaeftszahl }
      : {}),
    ...((det.streitwert ?? llm.streitwert) ? { streitwert: det.streitwert ?? llm.streitwert } : {}),
    parteien,
  };
}
