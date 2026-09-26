/**
 * gz-validate.ts — Austrian Geschäftszahl (GZ) structural validator (Gap I).
 *
 * The ON-Scanner extracts structured Geschäftszahlen (§ 372 GVgo):
 *   [Abteilung] [Gattungszeichen] [Aktenzahl]/[Jahr][Prüfzeichen] [- ON]
 *   e.g. "10 C 125/95t - 2", "99 St 901/22v", "4 Ob 12/24x"
 *
 * This module validates them deterministically AFTER extraction — catching
 * OCR errors (O↔0, l↔1, I↔1) and inconsistencies across ON entries before
 * a wrong Aktenzeichen propagates into drafts, deadline pages, or ERV
 * correspondence.
 *
 * What it checks:
 *   1. Structural parse (regex, component plausibility)
 *   2. Gattungszeichen against the registry (with Verfahrenstyp + court hint)
 *   3. OCR-confusable characters inside numeric components
 *   4. Prüfzeichen presence + form (a single lowercase letter)
 *   5. Cross-entry consistency (every ON of one Akt must carry the same
 *      lead Aktenzeichen)
 *
 * Note: the official Prüfzeichen check-digit algorithm is VJ-internal and not
 * publicly normative; `pruefzeichenAlgorithmus` is a pluggable hook so a
 * verified implementation can be dropped in without touching call sites.
 * Until then the validator checks presence/form only — it never guesses.
 */

export type Verfahrenstyp =
  | "zivil"
  | "straf"
  | "arbeitsrecht"
  | "verwaltungsrecht"
  | "sozialrecht"
  | "insolvenz"
  | "aussersteitig"
  | "exekution"
  | "firmenbuch"
  | "grundbuch"
  | "sonstiges";

export interface GattungszeichenInfo {
  zeichen: string;
  verfahrenstyp: Verfahrenstyp;
  beschreibung: string;
  /** Typische Gerichtsebene(n), informativ. */
  ebene: string;
}

/** Registerzeichen österreichischer Gerichte (Auswahl der praxisrelevanten). */
export const GATTUNGSZEICHEN_REGISTRY: readonly GattungszeichenInfo[] = [
  // Zivil
  { zeichen: "C", verfahrenstyp: "zivil", beschreibung: "Streitige Zivilsache", ebene: "BG" },
  { zeichen: "Cg", verfahrenstyp: "zivil", beschreibung: "Streitige Zivilsache", ebene: "LG" },
  {
    zeichen: "Cga",
    verfahrenstyp: "arbeitsrecht",
    beschreibung: "Arbeitsrechtssache",
    ebene: "LG als ASG",
  },
  {
    zeichen: "Cgs",
    verfahrenstyp: "sozialrecht",
    beschreibung: "Sozialrechtssache",
    ebene: "LG als ASG",
  },
  {
    zeichen: "Nc",
    verfahrenstyp: "aussersteitig",
    beschreibung: "Außerstreitsache (allgemein)",
    ebene: "BG/LG",
  },
  {
    zeichen: "A",
    verfahrenstyp: "aussersteitig",
    beschreibung: "Verlassenschaftssache",
    ebene: "BG",
  },
  { zeichen: "P", verfahrenstyp: "aussersteitig", beschreibung: "Pflegschaftssache", ebene: "BG" },
  {
    zeichen: "Fam",
    verfahrenstyp: "aussersteitig",
    beschreibung: "Familienrechtssache",
    ebene: "BG",
  },
  {
    zeichen: "Msch",
    verfahrenstyp: "aussersteitig",
    beschreibung: "Mietrechtliche Außerstreitsache",
    ebene: "BG",
  },
  { zeichen: "E", verfahrenstyp: "exekution", beschreibung: "Exekutionssache", ebene: "BG" },
  {
    zeichen: "S",
    verfahrenstyp: "insolvenz",
    beschreibung: "Insolvenzsache (Konkurs)",
    ebene: "LG",
  },
  { zeichen: "Se", verfahrenstyp: "insolvenz", beschreibung: "Schuldenregulierung", ebene: "BG" },
  // Straf
  { zeichen: "St", verfahrenstyp: "straf", beschreibung: "Ermittlungsverfahren StA", ebene: "StA" },
  { zeichen: "Vr", verfahrenstyp: "straf", beschreibung: "Voruntersuchung (hist.)", ebene: "LG" },
  { zeichen: "Hv", verfahrenstyp: "straf", beschreibung: "Hauptverhandlung", ebene: "LG" },
  { zeichen: "U", verfahrenstyp: "straf", beschreibung: "Strafsache", ebene: "BG" },
  {
    zeichen: "HR",
    verfahrenstyp: "straf",
    beschreibung: "Haft- und Rechtsschutzrichter",
    ebene: "LG",
  },
  { zeichen: "Bl", verfahrenstyp: "straf", beschreibung: "Beschwerdesache", ebene: "LG/OLG" },
  {
    zeichen: "Bs",
    verfahrenstyp: "straf",
    beschreibung: "Berufungs-/Beschwerdesache Straf",
    ebene: "OLG",
  },
  { zeichen: "Os", verfahrenstyp: "straf", beschreibung: "Strafsache OGH", ebene: "OGH" },
  // Rechtsmittel Zivil
  { zeichen: "R", verfahrenstyp: "zivil", beschreibung: "Rekurs-/Berufungssache", ebene: "LG/OLG" },
  {
    zeichen: "Ra",
    verfahrenstyp: "arbeitsrecht",
    beschreibung: "Rechtsmittel Arbeitsrecht",
    ebene: "OLG",
  },
  {
    zeichen: "Rs",
    verfahrenstyp: "sozialrecht",
    beschreibung: "Rechtsmittel Sozialrecht",
    ebene: "OLG",
  },
  { zeichen: "Ob", verfahrenstyp: "zivil", beschreibung: "Zivilsache OGH", ebene: "OGH" },
  {
    zeichen: "ObA",
    verfahrenstyp: "arbeitsrecht",
    beschreibung: "Arbeitsrechtssache OGH",
    ebene: "OGH",
  },
  {
    zeichen: "ObS",
    verfahrenstyp: "sozialrecht",
    beschreibung: "Sozialrechtssache OGH",
    ebene: "OGH",
  },
  // Register
  { zeichen: "Fr", verfahrenstyp: "firmenbuch", beschreibung: "Firmenbuchsache", ebene: "LG" },
  { zeichen: "Nz", verfahrenstyp: "grundbuch", beschreibung: "Grundbuchsache", ebene: "BG" },
] as const;

const GATTUNG_MAP = new Map(GATTUNGSZEICHEN_REGISTRY.map((g) => [g.zeichen, g]));

export function resolveGattungszeichen(zeichen: string): GattungszeichenInfo | null {
  return GATTUNG_MAP.get(zeichen) ?? null;
}

// ── Parsing ─────────────────────────────────────────────────

export interface ParsedGZ {
  abteilung: string;
  gattungszeichen: string;
  aktenzahl: string;
  jahr: string;
  pruefzeichen: string | null;
  on: string | null;
  raw: string;
}

/**
 * "10 C 125/95t - 2" → { abteilung: "10", gattungszeichen: "C",
 *   aktenzahl: "125", jahr: "95", pruefzeichen: "t", on: "2" }
 * Tolerates missing ON suffix and missing Prüfzeichen.
 */
const GZ_RE =
  /^\s*(\d{1,3})\s+([A-Za-z]{1,4})\s+(\d{1,5})\s*\/\s*(\d{2})\s*([a-zA-Z])?\s*(?:-\s*(\d+(?:\.\d+)*))?\s*$/;

export function parseGZ(raw: string): ParsedGZ | null {
  const m = GZ_RE.exec(raw);
  if (!m) return null;
  return {
    abteilung: m[1]!,
    gattungszeichen: m[2]!,
    aktenzahl: m[3]!,
    jahr: m[4]!,
    pruefzeichen: m[5] ?? null,
    on: m[6] ?? null,
    raw: raw.trim(),
  };
}

// ── Validation ──────────────────────────────────────────────

export interface GZBefund {
  schwere: "fehler" | "warnung" | "hinweis";
  code: string;
  meldung: string;
}

export interface GZValidierung {
  raw: string;
  parsed: ParsedGZ | null;
  gattung: GattungszeichenInfo | null;
  verfahrenstyp: Verfahrenstyp | null;
  gueltig: boolean;
  befunde: GZBefund[];
}

/** Pluggable hook for the official check-letter algorithm (VJ-internal). */
export type PruefzeichenAlgorithmus = (gz: ParsedGZ) => boolean;

const OCR_CONFUSABLES: Array<[RegExp, string]> = [
  [/[OQ]/, "O/Q statt 0"],
  [/[Il|]/, "I/l/| statt 1"],
  [/S(?=\d)|(?<=\d)S/, "S statt 5"],
  [/B(?=\d)|(?<=\d)B/, "B statt 8"],
];

/** Validate one Geschäftszahl. Deterministic, no I/O. */
export function validiereGZ(
  raw: string,
  opts?: {
    erwarteterVerfahrenstyp?: Verfahrenstyp;
    pruefzeichenAlgorithmus?: PruefzeichenAlgorithmus;
  }
): GZValidierung {
  const befunde: GZBefund[] = [];
  const parsed = parseGZ(raw);
  if (!parsed) {
    // OCR-confusable scan on the raw string: digits mangled into letters
    // often make the parse itself fail — surface the likely cause.
    for (const [re, desc] of OCR_CONFUSABLES) {
      if (re.test(raw)) {
        befunde.push({
          schwere: "hinweis",
          code: "ocr_verdacht",
          meldung: `Mögliches OCR-Artefakt (${desc}) in "${raw}"`,
        });
      }
    }
    befunde.push({
      schwere: "fehler",
      code: "parse_fehler",
      meldung: `Geschäftszahl "${raw}" entspricht nicht dem Muster [Abt] [Gattung] [Zahl]/[Jahr][Prüfzeichen]`,
    });
    return { raw, parsed: null, gattung: null, verfahrenstyp: null, gueltig: false, befunde };
  }

  const gattung = resolveGattungszeichen(parsed.gattungszeichen) ?? null;
  if (!gattung) {
    befunde.push({
      schwere: "warnung",
      code: "gattung_unbekannt",
      meldung: `Gattungszeichen "${parsed.gattungszeichen}" nicht in der Registry — prüfen (evtl. OCR-Fehler oder Spezialregister)`,
    });
  } else if (
    opts?.erwarteterVerfahrenstyp &&
    gattung.verfahrenstyp !== opts.erwarteterVerfahrenstyp
  ) {
    befunde.push({
      schwere: "warnung",
      code: "verfahrenstyp_abweichung",
      meldung: `Gattungszeichen "${parsed.gattungszeichen}" ist ${gattung.verfahrenstyp}, erwartet war ${opts.erwarteterVerfahrenstyp}`,
    });
  }

  // Jahr plausibility: two digits; 00–29 → 2000er, 30–99 → 1900er.
  // Akten älter als ~1950 sind in laufenden Verfahren unplausibel.
  const jahrNum = Number(parsed.jahr);
  const jahrVoll = jahrNum <= 29 ? 2000 + jahrNum : 1900 + jahrNum;
  if (jahrVoll < 1950) {
    befunde.push({
      schwere: "warnung",
      code: "jahr_unplausibel",
      meldung: `Anfalljahr ${jahrVoll} unplausibel für ein laufendes Verfahren`,
    });
  }

  if (!parsed.pruefzeichen) {
    befunde.push({
      schwere: "hinweis",
      code: "pruefzeichen_fehlt",
      meldung: "Kein Prüfzeichen vorhanden (bei StA-/Altakten möglich, sonst prüfen)",
    });
  } else if (parsed.pruefzeichen !== parsed.pruefzeichen.toLowerCase()) {
    befunde.push({
      schwere: "warnung",
      code: "pruefzeichen_grossbuchstabe",
      meldung: `Prüfzeichen "${parsed.pruefzeichen}" ist ein Großbuchstabe — Prüfzeichen sind Kleinbuchstaben (OCR-Verdacht)`,
    });
  } else if (opts?.pruefzeichenAlgorithmus && !opts.pruefzeichenAlgorithmus(parsed)) {
    befunde.push({
      schwere: "fehler",
      code: "pruefzeichen_falsch",
      meldung: `Prüfzeichen "${parsed.pruefzeichen}" besteht die Prüfziffernrechnung nicht`,
    });
  }

  const gueltig = !befunde.some((b) => b.schwere === "fehler");
  return {
    raw,
    parsed,
    gattung,
    verfahrenstyp: gattung?.verfahrenstyp ?? null,
    gueltig,
    befunde,
  };
}

// ── Cross-entry consistency (one Akt, many ONs) ─────────────

export interface KonsistenzErgebnis {
  /** Führendes Aktenzeichen (häufigste Variante ohne ON-Suffix). */
  leitzahl: string | null;
  einheitlich: boolean;
  abweichungen: Array<{ raw: string; grund: string }>;
  befundeProGZ: GZValidierung[];
}

function leadKey(p: ParsedGZ): string {
  return `${p.abteilung} ${p.gattungszeichen} ${p.aktenzahl}/${p.jahr}${p.pruefzeichen ?? ""}`;
}

/**
 * Prüft, ob alle ON-Einträge eines Akts dieselbe führende Geschäftszahl
 * tragen. OCR-bedingte Einzelabweichungen ("125/95t" vs "125/95l") fallen
 * hier sofort auf.
 */
export function pruefeGZKonsistenz(
  raws: string[],
  opts?: { erwarteterVerfahrenstyp?: Verfahrenstyp }
): KonsistenzErgebnis {
  const befundeProGZ = raws.map((r) => validiereGZ(r, opts));
  const counts = new Map<string, number>();
  for (const v of befundeProGZ) {
    if (v.parsed) {
      const key = leadKey(v.parsed);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let leitzahl: string | null = null;
  let max = 0;
  for (const [key, n] of counts) {
    if (n > max) {
      leitzahl = key;
      max = n;
    }
  }
  const abweichungen: Array<{ raw: string; grund: string }> = [];
  for (const v of befundeProGZ) {
    if (!v.parsed) {
      abweichungen.push({ raw: v.raw, grund: "nicht parsebar" });
    } else if (leitzahl && leadKey(v.parsed) !== leitzahl) {
      abweichungen.push({
        raw: v.raw,
        grund: `weicht von der Leitzahl "${leitzahl}" ab (OCR-Verdacht oder Fremdakt)`,
      });
    }
  }
  return {
    leitzahl,
    einheitlich: abweichungen.length === 0 && leitzahl !== null,
    abweichungen,
    befundeProGZ,
  };
}

// ── Zuordnung: tolerant normalisation + text search ─────────
//
// Same rules as the web app's src/lib/legal/geschaeftszahl.ts (a parity test
// there imports this file): whitespace and case do not matter, the
// Prüfbuchstabe is kept, a number written without it still matches the same
// number with it, and text search takes whole tokens only ("11 Cg 3/25a"
// never contains "1 Cg 3/25a"). File names may use "-" or "_" instead of "/".

export interface GZTeile {
  abteilung: string;
  gattung: string;
  aktenzahl: string;
  jahr: string;
  pruefzeichen: string | null;
}

export interface GZFund extends GZTeile {
  raw: string;
  index: number;
  formatted: string;
}

const GZ_CORE =
  "(\\d{1,4})\\s*([A-Za-zÄÖÜäöü]{1,4})\\s*(\\d{1,6})\\s*[/_-]\\s*(\\d{4}|\\d{2})([A-Za-z])?";
const GZ_FULL_TOLERANT = new RegExp(`^\\s*${GZ_CORE}\\s*(?:-\\s*\\d+(?:\\.\\d+)*)?\\s*$`);
const GZ_SEARCH = new RegExp(`(?<![\\p{L}\\p{N}])${GZ_CORE}(?![\\p{L}\\p{N}])`, "gu");

function gzTeile(m: RegExpExecArray | RegExpMatchArray): GZTeile {
  return {
    abteilung: String(Number(m[1])),
    gattung: m[2]!,
    aktenzahl: String(Number(m[3])),
    jahr: m[4]!,
    pruefzeichen: m[5] ? m[5].toLowerCase() : null,
  };
}

/** Tolerant parse of a whole value ("1Cg3/25a", "12 CG 34 / 25 X"). */
export function normalisiereGZ(raw: unknown): GZTeile | null {
  if (typeof raw !== "string") return null;
  const m = GZ_FULL_TOLERANT.exec(raw);
  return m ? gzTeile(m) : null;
}

export function formatiereGZ(t: GZTeile): string {
  return `${t.abteilung} ${t.gattung} ${t.aktenzahl}/${t.jahr}${t.pruefzeichen ?? ""}`;
}

function gzStamm(t: GZTeile): string {
  return `${t.abteilung}${t.gattung.toLowerCase()}${t.aktenzahl}/${t.jahr}`;
}

/** "12cg34/25x" — key incl. Prüfbuchstabe. */
export function gzSchluessel(t: GZTeile): string {
  return `${gzStamm(t)}${t.pruefzeichen ?? ""}`;
}

export function gleicheGZ(a: GZTeile, b: GZTeile): boolean {
  if (gzStamm(a) !== gzStamm(b)) return false;
  if (a.pruefzeichen && b.pruefzeichen) return a.pruefzeichen === b.pruefzeichen;
  return true;
}

/** Every Geschäftszahl in a text as whole tokens, in order of appearance. */
export function findeGZImText(text: string): GZFund[] {
  if (!text) return [];
  const out: GZFund[] = [];
  for (const m of text.matchAll(GZ_SEARCH)) {
    const t = gzTeile(m);
    out.push({ ...t, raw: m[0], index: m.index ?? 0, formatted: formatiereGZ(t) });
  }
  return out;
}
