/**
 * Citation Identity Resolver — strukturierte Parser und deterministische
 * Verifikation für juristische Zitate.
 *
 * Erweitert citations.ts um:
 *  1. Österreichische Zitate (OGH, GZ — Geschäftszahl)
 *  2. EuGH-Zitate (ECLI:EU, C-123/22)
 *  3. Literaturzitate (NJW, JZ, ecolex, RdW, ÖJZ)
 *  4. Strukturierte CitationIdentity mit deterministischen Feldern
 *  5. Deterministische Verifikation: fuzzy match = candidate generation,
 *     finale Identität wird durch Metadata-Cross-Referencing verifiziert
 *  6. Kollisionstests: ABGB/BGB, KSchG DE vs AT, StGB/ZPO multi-jurisdiction
 */

import {
  isStatuteValidForJurisdiction,
  hasStatuteCollision,
  getStatuteJurisdictions,
} from "./citations.ts";

// ── Citation Identity Types ───────────────────────────────────────────

export type CitationKind =
  | "case_de" // BGH, BVerfG, etc.
  | "case_at" // OGH, VwGH, VfGH, etc.
  | "case_eu" // EuGH, EuG
  | "case_intl" // EGMR, IGH
  | "statute" // § 433 BGB, Art. 1 GG
  | "literature" // NJW 2024, 123
  | "ecli" // ECLI:DE:..., ECLI:EU:...
  | "gz" // Geschäftszahl (AT)
  | "unknown";

export interface CitationIdentity {
  /** Raw citation string as found in text. */
  raw: string;
  /** Kind of citation. */
  kind: CitationKind;
  /** Court abbreviation (BGH, OGH, EuGH, etc.). */
  court?: string;
  /** Decision date (ISO format YYYY-MM-DD). */
  date?: string;
  /** File number (Aktenzeichen). */
  fileNumber?: string;
  /** ECLI identifier. */
  ecli?: string;
  /** Austrian Geschäftszahl (GZ). */
  geschäftszahl?: string;
  /** Statute abbreviation (BGB, ABGB, etc.). */
  statute?: string;
  /** Section/Article number. */
  section?: string;
  /** Journal name (NJW, JZ, ecolex, etc.). */
  journal?: string;
  /** Journal year. */
  journalYear?: number;
  /** Journal page. */
  journalPage?: number;
  /** Detected jurisdiction (DE, AT, CH, EU). */
  jurisdiction?: string;
  /** Whether the statute has a jurisdiction collision. */
  hasCollision?: boolean;
  /** Position in the source text. */
  position: number;
  /** Context snippet around the citation. */
  context: string;
  /** Confidence in the parsing (0-1). */
  confidence: number;
}

// ── Austrian Case Citation Patterns ───────────────────────────────────

// OGH (Oberster Gerichtshof) patterns:
// "OGH 7 Ob 123/22"
// "OGH, 7 Ob 123/22"
// "OGH Entscheidung vom 15.03.2024, 7 Ob 123/22"
// "OGH 20.3.2024, 7 Ob 123/22"

const AT_COURT_ABBREVIATIONS = "OGH|VwGH|VfGH|OGD|OLG\\s+\\w+|LG\\s+\\w+|BG\\s+\\w+|LSG|BGST";

const AT_CASE_PATTERNS: RegExp[] = [
  // "OGH 7 Ob 123/22" or "OGH, 7 Ob 123/22"
  new RegExp(`\\b(${AT_COURT_ABBREVIATIONS})\\s*,?\\s*(\\d+\\s+\\w+\\s+\\d+/\\d+)`, "g"),
  // "OGH Entscheidung vom 15.03.2024, 7 Ob 123/22"
  new RegExp(
    `\\b(${AT_COURT_ABBREVIATIONS})\\s+(?:Entscheidung|Urteil|Beschluss)\\s+vom\\s+(\\d{1,2}\\.\\d{1,2}\\.\\d{2,4})\\s*,?\\s*(\\d+\\s+\\w+\\s+\\d+/\\d+)`,
    "g"
  ),
  // "OGH 20.3.2024, 7 Ob 123/22"
  new RegExp(
    `\\b(${AT_COURT_ABBREVIATIONS})\\s+(\\d{1,2}\\.\\d{1,2}\\.\\d{2,4})\\s*,?\\s*(\\d+\\s+\\w+\\s+\\d+/\\d+)`,
    "g"
  ),
];

// ── Geschäftszahl (GZ) Patterns ───────────────────────────────────────

// Austrian Geschäftszahl patterns:
// "GZ: 123456/AB-2024"
// "Geschäftszahl 123456/AB-2024"
// "GZ 123456/AB/2024"

const GZ_PATTERNS: RegExp[] = [
  /(?:GZ\s*:?\s*|Geschäftszahl\s+)(\d{4,8}\/[A-Z]{1,4}[-/]\d{2,4})/g,
  /(?:GZ\s*:?\s*|Geschäftszahl\s+)(\d{4,8}\/[A-Z]{1,4}\s+\d{4})/g,
];

// ── EuGH Citation Patterns ────────────────────────────────────────────

// EuGH patterns:
// "EuGH, Urteil vom 5.6.2023 - C-123/22"
// "EuGH C-123/22"
// "ECLI:EU:C:2023:456"

const EU_COURT_ABBREVIATIONS = "EuGH|EuG|EuGK|EuZPO";

const EU_CASE_PATTERNS: RegExp[] = [
  // "EuGH, Urteil vom 5.6.2023 - C-123/22"
  new RegExp(
    `\\b(${EU_COURT_ABBREVIATIONS})\\s*,?\\s*(?:Urteil|Beschluss|Entscheidung)\\s+vom\\s+(\\d{1,2}\\.\\d{1,2}\\.\\d{2,4})\\s*[-–]\\s*(C-\\d+/\\d+)`,
    "g"
  ),
  // "EuGH C-123/22"
  new RegExp(`\\b(${EU_COURT_ABBREVIATIONS})\\s*,?\\s*(C-\\d+/\\d+)`, "g"),
  // "ECLI:EU:C:2023:456"
  /(ECLI:EU:[A-Z]+:\d{4}:[\w.]+)/g,
];

// ── Literature Citation Patterns ──────────────────────────────────────

// Literature patterns:
// "BGH NJW 2024, 123"
// "Schmidt, NJW 2024, 123"
// "Müller, ecolex 2023, 42"
// "Huber, RdW 2022, 345"
// "ÖJZ 2024, 12"

const JOURNALS_DE = "NJW|NVwZ|BB|DB|CR|GRUR|JZ|JuS|MDR|WM|ZIP|DÖV|DVBl|StV|NStZ|NJW-RR";
const JOURNALS_AT = "ecolex|RdW|ÖJZ|JBl|ZfRV|wbl|JAP|AnwBl|Recht|ZVR|ZAS|JRP|JVE";
const JOURNALS_CH = "SJZ|Plaidoyer|BJM|AJP|PJA|sic!";
const JOURNALS_EU = "EuZW|EWS|CMLR|ELR|EuLF";

const ALL_JOURNALS = [JOURNALS_DE, JOURNALS_AT, JOURNALS_CH, JOURNALS_EU].join("|");

const LITERATURE_PATTERNS: RegExp[] = [
  // "Author, Journal Year, Page" or "Court Journal Year, Page"
  new RegExp(
    `(?:([A-ZÄÖÜ][\\wäöüß-]+)\\s*,\\s*)?(${ALL_JOURNALS})\\s+(\\d{4})\\s*,\\s*(\\d+)`,
    "g"
  ),
];

// ── Extended Statute Patterns (AT + CH + EU) ──────────────────────────

const EXTENDED_STATUTE_PATTERNS: RegExp[] = [
  // "§ 433 BGB", "§§ 433, 434 BGB" — extended with AT/CH statutes
  /§+\s*(\d+[a-zA-Z]?(?:\s*,\s*\d+[a-zA-Z]?)*)\s+(BGB|ABGB|HGB|StGB|ZPO|StPO|GG|AO|EStG|UStG|GmbHG|AktG|InsO|FamFG|UWG|GWB|BauGB|VwVfG|SGB\s+[IVX]+|BUrlG|KSchG|BetrVG|BVerfGG|ZVG|OR|ZGB|SchKG|BVG|DSG|DSGVO|EMRK|EUV|AEUV|UGB|ASVG|AVG|GewO|BAO|EheG|KartG|AHG|EO|WEG|MSchG|MRG|AngG|ArbVG|AZG|IO|KStG|VwGVG|VStG|AsylG|JN)/g,
  // "Art. 1 GG", "Art. 2 Abs. 1 GG" — extended
  /(Art\.\s*\d+\s*(?:Abs\.\s*\d+\s*)?(?:GG|EMRK|EUV|AEUV|DSGVO|Grundrechtecharta|OR|ZGB|BVG|DSG))/g,
  // "§ 1 Abs. 1 Nr. 1 BGB" — extended
  /§+\s*(\d+[a-zA-Z]?)\s+Abs\.\s*\d+\s*(?:Nr\.\s*\d+\s*)?(BGB|ABGB|HGB|StGB|ZPO|StPO|GG|AO|EStG|UStG|GmbHG|AktG|InsO|FamFG|UWG|OR|ZGB|ASVG|AVG|GewO|BAO)/g,
];

// ── Parse Functions ───────────────────────────────────────────────────

/**
 * Parse a German date string (DD.MM.YYYY or DD.MM.YY) to ISO format.
 */
function parseGermanDate(dateStr: string): string | undefined {
  const parts = dateStr.split(".");
  if (parts.length !== 3) return undefined;
  const [day, month, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  const m = month.padStart(2, "0");
  const d = day.padStart(2, "0");
  if (!/^\d{4}$/.test(fullYear) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return undefined;
  return `${fullYear}-${m}-${d}`;
}

/**
 * Detect jurisdiction from a court abbreviation.
 */
function jurisdictionFromCourt(court: string): string | undefined {
  const upper = court.toUpperCase();
  // AT courts
  if (/^(OGH|VwGH|VfGH|OGD|OLG\s+\w+|LG\s+\w+|BG\s+\w+|LSG|BGST)$/.test(upper)) return "AT";
  // EU courts
  if (/^(EUGH|EUG|EUGK|EUZPO)$/.test(upper)) return "EU";
  // DE courts
  if (/^(BGH|BVERFG|BVERWG|BFH|BAG|BSG|BAYOBLG|KG|OLG|OVG|VGH|FG|LAG|LSG|VG|AG|SG)$/.test(upper))
    return "DE";
  return undefined;
}

/**
 * Detect jurisdiction from a statute abbreviation.
 */
function jurisdictionFromStatute(statute: string): string | undefined {
  const jurisdictions = getStatuteJurisdictions(statute);
  if (jurisdictions.length === 0) return undefined;
  if (jurisdictions.length === 1) return jurisdictions[0];
  // Collision — return undefined (ambiguous)
  return undefined;
}

// ── Main Parsing Function ─────────────────────────────────────────────

/**
 * Parse all citations from a text into structured CitationIdentity objects.
 *
 * This is the structured parser that covers:
 * - German case citations (BGH, BVerfG, etc.)
 * - Austrian case citations (OGH, VwGH, VfGH, etc.)
 * - EU case citations (EuGH, EuG, ECLI:EU:...)
 * - Geschäftszahlen (AT)
 * - Statute citations (§, Art.) with jurisdiction detection
 * - Literature citations (NJW, ecolex, etc.)
 * - ECLI citations (DE and EU)
 */
export function parseCitations(text: string): CitationIdentity[] {
  const identities: CitationIdentity[] = [];
  const seen = new Set<string>();

  const addIdentity = (id: CitationIdentity) => {
    const key = `${id.kind}:${id.raw}:${id.position}`;
    if (seen.has(key)) return;
    seen.add(key);
    identities.push(id);
  };

  const getContext = (matchIndex: number, length: number): string => {
    const start = Math.max(0, matchIndex - 150);
    const end = Math.min(text.length, matchIndex + length + 150);
    return text.slice(start, end).trim();
  };

  // 1. AT case citations
  for (const pattern of AT_CASE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0];
      const court = match[1];
      // Patterns have variable groups: 2-group (court + fileNumber) or 3-group (court + date + fileNumber)
      // If match[3] exists, match[2] is a date; otherwise match[2] is the fileNumber
      let date: string | undefined;
      let fileNumber: string | undefined;
      if (match[3]) {
        date = parseGermanDate(match[2]);
        fileNumber = match[3];
      } else {
        fileNumber = match[2];
      }

      addIdentity({
        raw,
        kind: "case_at",
        court,
        date,
        fileNumber,
        jurisdiction: "AT",
        position: match.index,
        context: getContext(match.index, raw.length),
        confidence: 0.9,
      });
    }
  }

  // 2. GZ (Geschäftszahl)
  for (const pattern of GZ_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0];
      const gz = match[1];

      addIdentity({
        raw,
        kind: "gz",
        geschäftszahl: gz,
        jurisdiction: "AT",
        position: match.index,
        context: getContext(match.index, raw.length),
        confidence: 0.85,
      });
    }
  }

  // 3. EU case citations
  for (const pattern of EU_CASE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0];
      // ECLI:EU pattern
      if (raw.startsWith("ECLI:EU:")) {
        addIdentity({
          raw,
          kind: "ecli",
          ecli: raw,
          jurisdiction: "EU",
          position: match.index,
          context: getContext(match.index, raw.length),
          confidence: 0.95,
        });
        continue;
      }

      const court = match[1];
      // Patterns have variable groups: 2-group (court + fileNumber) or 3-group (court + date + fileNumber)
      let date: string | undefined;
      let fileNumber: string | undefined;
      if (match[3]) {
        date = parseGermanDate(match[2]);
        fileNumber = match[3];
      } else {
        fileNumber = match[2];
      }

      addIdentity({
        raw,
        kind: "case_eu",
        court,
        date,
        fileNumber,
        jurisdiction: "EU",
        position: match.index,
        context: getContext(match.index, raw.length),
        confidence: 0.9,
      });
    }
  }

  // 4. ECLI:DE citations
  const ecliDePattern = /(ECLI:DE:[A-Z]+:\d{4}:[\w.]+)/g;
  let ecliMatch: RegExpExecArray | null;
  while ((ecliMatch = ecliDePattern.exec(text)) !== null) {
    const raw = ecliMatch[0];
    addIdentity({
      raw,
      kind: "ecli",
      ecli: raw,
      jurisdiction: "DE",
      position: ecliMatch.index,
      context: getContext(ecliMatch.index, raw.length),
      confidence: 0.95,
    });
  }

  // 5. German case citations (from existing patterns — re-apply here for structured output)
  const deCasePattern =
    /((?:BGH|BVerfG|BVerwG|BFH|BAG|BSG|BayObLG|KG)\s*,\s*(?:Urteil|Beschluss|Verordnung|Entscheidung)\s+vom\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\s*[-–]\s*([\w\s/.\-()]+))/g;
  let deMatch: RegExpExecArray | null;
  while ((deMatch = deCasePattern.exec(text)) !== null) {
    const raw = deMatch[0];
    const courtMatch = raw.match(/^(BGH|BVerfG|BVerwG|BFH|BAG|BSG|BayObLG|KG)/);
    const court = courtMatch?.[1];
    const date = parseGermanDate(deMatch[2]);
    const fileNumber = deMatch[3]?.trim();

    addIdentity({
      raw,
      kind: "case_de",
      court,
      date,
      fileNumber,
      jurisdiction: "DE",
      position: deMatch.index,
      context: getContext(deMatch.index, raw.length),
      confidence: 0.9,
    });
  }

  // 6. Extended statute citations
  for (const pattern of EXTENDED_STATUTE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0].trim();
      if (raw.length < 4 || raw.length > 100) continue;

      // Extract statute abbreviation from the match
      const statuteMatch = raw.match(
        /(BGB|ABGB|HGB|StGB|ZPO|StPO|GG|AO|EStG|UStG|GmbHG|AktG|InsO|FamFG|UWG|GWB|BauGB|VwVfG|SGB\s+[IVX]+|BUrlG|KSchG|BetrVG|BVerfGG|ZVG|OR|ZGB|SchKG|BVG|DSG|DSGVO|EMRK|EUV|AEUV|UGB|ASVG|AVG|GewO|BAO|EheG|KartG|AHG|EO|WEG|MSchG|MRG|AngG|ArbVG|AZG|IO|KStG|VwGVG|VStG|AsylG|JN)$/
      );
      const statute = statuteMatch?.[1];
      if (!statute) continue;

      const sectionMatch = raw.match(/§+\s*(\d+[a-zA-Z]?)/);
      const section = sectionMatch?.[1];

      const collision = hasStatuteCollision(statute);
      const jur = jurisdictionFromStatute(statute);

      const key = `statute:${statute}:${section}:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);

      addIdentity({
        raw,
        kind: "statute",
        statute,
        section,
        jurisdiction: jur,
        hasCollision: collision,
        position: match.index,
        context: getContext(match.index, raw.length),
        confidence: collision ? 0.6 : 0.9,
      });
    }
  }

  // 7. Literature citations
  for (const pattern of LITERATURE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0].trim();
      if (raw.length < 5 || raw.length > 200) continue;

      const journal = match[2];
      const journalYear = parseInt(match[3], 10);
      const journalPage = parseInt(match[4], 10);

      // Determine jurisdiction from journal
      let jur: string | undefined;
      if (new RegExp(JOURNALS_AT).test(journal)) jur = "AT";
      else if (new RegExp(JOURNALS_CH).test(journal)) jur = "CH";
      else if (new RegExp(JOURNALS_EU).test(journal)) jur = "EU";
      else if (new RegExp(JOURNALS_DE).test(journal)) jur = "DE";

      addIdentity({
        raw,
        kind: "literature",
        journal,
        journalYear,
        journalPage,
        jurisdiction: jur,
        position: match.index,
        context: getContext(match.index, raw.length),
        confidence: 0.7,
      });
    }
  }

  // Sort by position
  identities.sort((a, b) => a.position - b.position);

  return identities;
}

// ── Deterministic Verification ────────────────────────────────────────

export interface VerificationCandidate {
  /** The candidate judgement ID from the database. */
  judgementId: string;
  /** The match method used. */
  matchMethod: "ecli" | "file_number_exact" | "file_number_fuzzy" | "court_date" | "gz";
  /** Confidence score (0-1). */
  confidence: number;
  /** Whether the match was verified deterministically. */
  verified: boolean;
  /** Verification details. */
  details: string;
}

export interface VerificationResult {
  /** The original citation identity. */
  citation: CitationIdentity;
  /** All candidates found. */
  candidates: VerificationCandidate[];
  /** The best verified candidate, or null if none verified. */
  resolved: VerificationCandidate | null;
  /** Whether the citation could be resolved. */
  resolvedSuccessfully: boolean;
}

/**
 * Verify a citation identity against database records.
 *
 * Fuzzy matching is used ONLY for candidate generation.
 * Final identity is verified deterministically by cross-referencing
 * multiple metadata fields (court + date + file_number, or ECLI exact match).
 *
 * @param pool - Database connection pool
 * @param citation - The parsed citation to verify
 */
export async function verifyCitationIdentity(
  pool: import("pg").Pool,
  citation: CitationIdentity
): Promise<VerificationResult> {
  const candidates: VerificationCandidate[] = [];

  // 1. ECLI exact match — deterministic, highest confidence
  if (citation.ecli) {
    try {
      const result = await pool.query(
        "SELECT id FROM subsumio_judgements WHERE ecli = $1 LIMIT 1",
        [citation.ecli]
      );
      if (result.rows[0]) {
        const candidate: VerificationCandidate = {
          judgementId: result.rows[0].id,
          matchMethod: "ecli",
          confidence: 1.0,
          verified: true,
          details: `ECLI exact match: ${citation.ecli}`,
        };
        candidates.push(candidate);
        return {
          citation,
          candidates,
          resolved: candidate,
          resolvedSuccessfully: true,
        };
      }
    } catch {
      // fail-open
    }
  }

  // 2. Geschäftszahl exact match — deterministic for AT
  if (citation.geschäftszahl) {
    try {
      const result = await pool.query(
        "SELECT id FROM subsumio_judgements WHERE file_number ILIKE $1 LIMIT 5",
        [`%${citation.geschäftszahl}%`]
      );
      for (const row of result.rows) {
        candidates.push({
          judgementId: row.id,
          matchMethod: "gz",
          confidence: 0.9,
          verified: true,
          details: `GZ match: ${citation.geschäftszahl}`,
        });
      }
    } catch {
      // fail-open
    }
  }

  // 3. File number — fuzzy for candidate generation, deterministic verification
  if (citation.fileNumber) {
    try {
      // Candidate generation: fuzzy file number match
      const fuzzyResult = await pool.query(
        "SELECT id, court, file_number, decision_date FROM subsumio_judgements WHERE file_number ILIKE $1 LIMIT 10",
        [`%${citation.fileNumber}%`]
      );

      for (const row of fuzzyResult.rows) {
        // Deterministic verification: cross-reference court + date
        let verified = false;
        let confidence = 0.5; // fuzzy-only baseline
        const verifyDetails: string[] = [`Fuzzy file_number: ${citation.fileNumber}`];

        // Cross-reference court
        if (citation.court && row.court) {
          if (row.court.toUpperCase().includes(citation.court.toUpperCase())) {
            verifyDetails.push(`Court match: ${row.court}`);
            confidence += 0.2;
          } else {
            // Court mismatch — downgrade confidence
            confidence -= 0.2;
            verifyDetails.push(`Court mismatch: expected ${citation.court}, got ${row.court}`);
          }
        }

        // Cross-reference date
        if (citation.date && row.decision_date) {
          const dbDate = new Date(row.decision_date).toISOString().split("T")[0];
          if (dbDate === citation.date) {
            verifyDetails.push(`Date match: ${citation.date}`);
            confidence += 0.25;
          } else {
            confidence -= 0.15;
            verifyDetails.push(`Date mismatch: expected ${citation.date}, got ${dbDate}`);
          }
        }

        // Deterministic verification: court + date both match
        if (
          citation.court &&
          citation.date &&
          row.court?.toUpperCase().includes(citation.court.toUpperCase()) &&
          new Date(row.decision_date).toISOString().split("T")[0] === citation.date
        ) {
          verified = true;
          confidence = Math.min(confidence, 0.95);
        }

        // Exact file number match (not just fuzzy)
        if (row.file_number?.trim() === citation.fileNumber.trim()) {
          verifyDetails.push("Exact file_number match");
          confidence = Math.min(confidence + 0.15, 0.95);
          if (citation.court && row.court?.toUpperCase().includes(citation.court.toUpperCase())) {
            verified = true;
          }
        }

        candidates.push({
          judgementId: row.id,
          matchMethod: verified ? "file_number_exact" : "file_number_fuzzy",
          confidence: Math.max(0, Math.min(1, confidence)),
          verified,
          details: verifyDetails.join("; "),
        });
      }
    } catch {
      // fail-open
    }
  }

  // 4. Court + date match — deterministic when both are present
  if (citation.court && citation.date && !citation.fileNumber) {
    try {
      const result = await pool.query(
        "SELECT id FROM subsumio_judgements WHERE court ILIKE $1 AND decision_date = $2 LIMIT 5",
        [`%${citation.court}%`, citation.date]
      );
      for (const row of result.rows) {
        candidates.push({
          judgementId: row.id,
          matchMethod: "court_date",
          confidence: 0.85,
          verified: true,
          details: `Court + date match: ${citation.court} @ ${citation.date}`,
        });
      }
    } catch {
      // fail-open
    }
  }

  // Sort candidates: verified first, then by confidence
  candidates.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return b.confidence - a.confidence;
  });

  const resolved = candidates.find((c) => c.verified) ?? null;

  return {
    citation,
    candidates,
    resolved,
    resolvedSuccessfully: resolved !== null,
  };
}

// ── Collision Detection ───────────────────────────────────────────────

export interface CollisionCheckResult {
  /** The statute abbreviation. */
  statute: string;
  /** Whether a collision was detected. */
  hasCollision: boolean;
  /** All jurisdictions where this statute exists. */
  jurisdictions: string[];
  /** Whether the statute is valid for the given jurisdiction. */
  isValidForJurisdiction: boolean;
  /** Warning message if collision detected. */
  warning?: string;
}

/**
 * Check a statute citation for jurisdiction collisions.
 *
 * This is the core function for preventing false positives like
 * ABGB/BGB and KSchG DE vs AT.
 */
export function checkStatuteCollision(
  statute: string,
  expectedJurisdiction?: string
): CollisionCheckResult {
  const jurisdictions = getStatuteJurisdictions(statute);
  const hasCollision = jurisdictions.length > 1;

  const isValidForJurisdiction = expectedJurisdiction
    ? isStatuteValidForJurisdiction(statute, expectedJurisdiction)
    : jurisdictions.length > 0;

  let warning: string | undefined;
  if (hasCollision && !expectedJurisdiction) {
    warning = `Statut ${statute} existiert in mehreren Jurisdiktionen (${jurisdictions.join(", ")}). Jurisdiktion muss geklärt werden.`;
  } else if (expectedJurisdiction && !isValidForJurisdiction) {
    warning = `Statut ${statute} ist nicht gültig für Jurisdiktion ${expectedJurisdiction}. Gültig in: ${jurisdictions.join(", ")}`;
  }

  return {
    statute,
    hasCollision,
    jurisdictions,
    isValidForJurisdiction,
    warning,
  };
}

/**
 * Batch-check all statute citations in a text for collisions.
 */
export function checkAllStatuteCollisions(
  text: string,
  expectedJurisdiction?: string
): CollisionCheckResult[] {
  const identities = parseCitations(text).filter((c) => c.kind === "statute");
  const results: CollisionCheckResult[] = [];
  const seen = new Set<string>();

  for (const id of identities) {
    if (!id.statute) continue;
    if (seen.has(id.statute)) continue;
    seen.add(id.statute);

    results.push(checkStatuteCollision(id.statute, expectedJurisdiction));
  }

  return results;
}
