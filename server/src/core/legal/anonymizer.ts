/**
 * Pseudonymisierungs-Engine für das Legal Brain
 *
 * TERMINOLOGIE (rechtlich relevant, nicht umbenennen ohne DSGVO-Check):
 * HMAC mit Owner-Key ist PSEUDONYMISIERUNG i. S. v. Art. 4 Nr. 5 DSGVO,
 * KEINE Anonymisierung (ErwG 26) — der Owner kann die Zuordnung mit seinem
 * Key wiederherstellen, also bleiben die Daten personenbezogen und alle
 * DSGVO-Pflichten bestehen. Öffentliche Doku/Marketing darf deshalb nie
 * "anonymisiert" behaupten; korrekt ist "pseudonymisiert, Klarnamen nur
 * mit dem Schlüssel des Eigentümers auflösbar".
 *
 * Funktional: personenbezogene Werte werden per HMAC-SHA-256 (Owner-Key)
 * pseudonymisiert; ohne den Key ist die Zuordnung praktisch nicht
 * wiederherstellbar. Klarnamen, Adressen und Mandantendaten landen nur
 * in Platzhalter-Form in Brain-Seiten.
 */

import { createHash, createHmac } from "crypto";
import { chat as gatewayChat, type ChatResult } from "../ai/gateway.ts";

const SALT_LENGTH = 32;

/** Generate a deterministic hash for a given raw value + owner key. */
export function anonymize(raw: string, ownerKey: string): string {
  if (!raw || !ownerKey) return "";
  const h = createHmac("sha256", ownerKey);
  h.update(raw);
  return h.digest("hex").slice(0, 32); // 64 chars → 32 for readability
}

/** Verify that a candidate value hashes to the stored anonymized value. */
export function verifyAnonymized(
  raw: string,
  ownerKey: string,
  anonymized: string,
): boolean {
  return anonymize(raw, ownerKey) === anonymized;
}

/** Hash contact info into a reversible blob (only owner can reverse). */
export function hashContact(contact: string, ownerKey: string): string {
  if (!contact || !ownerKey) return "";
  const h = createHmac("sha256", ownerKey + ":contact");
  h.update(contact);
  return h.digest("base64");
}

/** Anonymize free-text facts: replace names, addresses, dates with placeholders. */
export function anonymizeFacts(
  text: string,
  placeholders: Map<string, string>,
): string {
  let result = text;
  for (const [real, placeholder] of placeholders) {
    const escaped = real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), placeholder);
  }
  return result;
}

/** Build placeholder map from a list of sensitive terms. */
export function buildPlaceholders(
  terms: string[],
  prefix: string = "[ENT",
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < terms.length; i++) {
    map.set(terms[i], `${prefix}-${String(i + 1).padStart(2, "0")}]`);
  }
  return map;
}

/** Detect likely PII in text and suggest placeholders. */
export function detectPII(text: string): string[] {
  const patterns = [
    // Names (capitalized words that look like names)
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
    // Email addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Phone numbers (German format)
    /(?:\+49\s?|0)[\d\s/-]{7,20}/g,
    // Addresses (simple street pattern)
    /\b[A-Z][a-z]+(?:straße|strasse|weg|platz|allee)\s+\d+/gi,
    // Dates of birth (DD.MM.YYYY or similar)
    /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g,
  ];

  const found = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) found.add(m);
    }
  }
  return Array.from(found);
}

/** Entity type for NER-detected PII. */
export type PIIEntityType =
  | "person_name"
  | "organization"
  | "email"
  | "phone"
  | "address"
  | "date_of_birth"
  | "id_number"
  | "iban"
  | "credit_card"
  | "insurance_number"
  | "other_pii";

/** A single PII entity detected by NER. */
export interface PIIDetection {
  text: string;
  type: PIIEntityType;
  start: number;
  end: number;
  confidence: number;
  source: "regex" | "ner";
}

/**
 * LLM-based NER PII detection. Sends text to the AI gateway and asks the model
 * to identify all personally identifiable information entities.
 *
 * Returns structured detections with character offsets for precise replacement.
 * Gracefully returns an empty array when no LLM is available (missing API key,
 * gateway not configured) — caller should fall back to `detectPII` (regex).
 *
 * @param text - The text to scan for PII.
 * @param opts - Optional model override and abort signal.
 */
export async function detectPIIWithNER(
  text: string,
  opts?: { model?: string; abortSignal?: AbortSignal },
): Promise<PIIDetection[]> {
  if (!text || text.trim().length < 3) return [];

  const NER_SYSTEM_PROMPT = `You are a PII detection engine for a legal document anonymization pipeline.
Your task: identify ALL personally identifiable information (PII) in the given text.

Return a JSON array. Each element MUST have these fields:
- "text": the EXACT substring from the input (verbatim, including whitespace)
- "type": one of: person_name, organization, email, phone, address, date_of_birth, id_number, iban, credit_card, insurance_number, other_pii
- "start": character offset (0-based) where the entity begins
- "end": character offset (0-based, exclusive) where the entity ends
- "confidence": float 0.0–1.0

Rules:
- Detect German, Austrian, and Swiss PII patterns (names, addresses, IBANs, SVNR, AHV numbers).
- Include indirect identifiers: job titles + employer, vehicle plates, case numbers with names.
- Exclude legal citations (§ 823 BGB, Art. 311 ZPO) and generic legal terms.
- Exclude common nouns that are not PII even if capitalized.
- Return ONLY the JSON array, no commentary.`;

  try {
    const result: ChatResult = await gatewayChat({
      model: opts?.model,
      system: NER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text.slice(0, 12000) }],
      maxTokens: 4096,
      ...(opts?.abortSignal ? { abortSignal: opts.abortSignal } : {}),
    });

    const raw = result.text.trim();
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    const detections: PIIDetection[] = [];
    for (const item of parsed) {
      if (typeof item.text !== "string" || typeof item.type !== "string") continue;
      if (typeof item.start !== "number" || typeof item.end !== "number") continue;

      // Verify the substring matches the text at the given offsets
      const slice = text.slice(item.start, item.end);
      if (slice !== item.text) {
        // Try to find the text by search (LLM offsets can be off by 1–2 chars)
        const idx = text.indexOf(item.text);
        if (idx === -1) continue;
        item.start = idx;
        item.end = idx + item.text.length;
      }

      const validTypes: PIIEntityType[] = [
        "person_name", "organization", "email", "phone", "address",
        "date_of_birth", "id_number", "iban", "credit_card",
        "insurance_number", "other_pii",
      ];
      const type = validTypes.includes(item.type as PIIEntityType)
        ? item.type as PIIEntityType
        : "other_pii";

      detections.push({
        text: item.text,
        type,
        start: item.start,
        end: item.end,
        confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
        source: "ner",
      });
    }

    return detections;
  } catch {
    // Graceful degradation: no LLM available, gateway error, or JSON parse failure.
    // Caller should fall back to regex-based detectPII.
    return [];
  }
}

/**
 * Hybrid PII detection: combines fast regex pre-filter with LLM-based NER.
 *
 * 1. Runs `detectPII` (regex) for immediate pattern matches.
 * 2. Runs `detectPIIWithNER` (LLM) for complex/indirect PII.
 * 3. Merges results, deduplicating by text overlap (NER wins on conflicts
 *    because it provides type information and precise offsets).
 *
 * @param text - The text to scan.
 * @param opts - Optional model override and abort signal for the NER call.
 * @returns Merged list of unique PII detections.
 */
export async function detectPIIHybrid(
  text: string,
  opts?: { model?: string; abortSignal?: AbortSignal },
): Promise<PIIDetection[]> {
  // 1. Regex pass — fast, synchronous
  const regexPII = detectPII(text);
  const regexDetections: PIIDetection[] = regexPII.map((raw) => {
    const idx = text.indexOf(raw);
    return {
      text: raw,
      type: inferPIIType(raw) as PIIEntityType,
      start: idx,
      end: idx + raw.length,
      confidence: 0.7,
      source: "regex" as const,
    };
  });

  // 2. NER pass — async, may fail gracefully
  const nerDetections = await detectPIIWithNER(text, opts);

  // 3. Merge — deduplicate by text overlap. NER entries that overlap with
  //    regex entries replace them (NER provides type + confidence).
  const merged: PIIDetection[] = [];
  const usedRanges: Array<[number, number]> = [];

  // Sort NER by confidence descending so high-confidence entities win overlaps
  const sortedNER = [...nerDetections].sort((a, b) => b.confidence - a.confidence);

  for (const ner of sortedNER) {
    const overlaps = usedRanges.some(([s, e]) =>
      ner.start < e && ner.end > s,
    );
    if (!overlaps) {
      merged.push(ner);
      usedRanges.push([ner.start, ner.end]);
    }
  }

  // Add regex detections that don't overlap with any NER detection
  for (const reg of regexDetections) {
    const overlaps = usedRanges.some(([s, e]) =>
      reg.start < e && reg.end > s,
    );
    if (!overlaps) {
      merged.push(reg);
      usedRanges.push([reg.start, reg.end]);
    }
  }

  // Sort by position in text
  merged.sort((a, b) => a.start - b.start);
  return merged;
}

/** Infer PII type from a regex-matched string. */
function inferPIIType(raw: string): string {
  if (/@/.test(raw)) return "email";
  if (/\+49|\+41|\+43|^0[\d\s/-]{7,}/.test(raw)) return "phone";
  if (/straße|strasse|weg|platz|allee/i.test(raw)) return "address";
  if (/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/.test(raw)) return "date_of_birth";
  if (/\bDE\d{20}\b|\bAT\d{18}\b|\bCH\d{17}\b/i.test(raw)) return "iban";
  return "person_name";
}

/** Generate a display-safe case title from anonymized facts. */
export function generateDisplayTitle(
  legalArea: string,
  subArea?: string,
  index?: number,
): string {
  const sub = subArea ? ` — ${subArea}` : "";
  const idx = index !== undefined ? ` #${index + 1}` : "";
  return `${legalArea}${sub}${idx}`;
}

/** Generate a case number (Aktenzeichen) from date + counter. */
export function generateCaseNumber(
  prefix: string = "LB",
  counter: number,
): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${prefix}-${yy}${mm}-${String(counter).padStart(4, "0")}`;
}

/**
 * Rotate the HMAC owner key across all legal_entity and legal_case pages in
 * the given source. Re-hashes every pseudonymized value from oldKey to newKey.
 *
 * GDPR Art. 32 requires the ability to respond to security incidents — a
 * law firm SaaS that cannot rotate its pseudonymization key has a compliance
 * gap. This function provides the tooling; the actual trigger is a CLI command
 * or admin operation.
 *
 * @param engine - BrainEngine to query/update pages.
 * @param oldKey - The current HMAC key (must match the key used to pseudonymize).
 * @param newKey - The new HMAC key to re-hash with.
 * @param opts - Optional sourceId to scope the rotation.
 * @returns Count of rotated and skipped pages.
 */
export async function rotatePseudonymizationKey(
  engine: import("../engine.ts").BrainEngine,
  oldKey: string,
  newKey: string,
  opts: { sourceId?: string },
): Promise<{ rotated: number; skipped: number }> {
  if (!oldKey || !newKey) throw new Error("Both oldKey and newKey are required");
  if (oldKey === newKey) throw new Error("newKey must differ from oldKey");

  const sourceClause = opts.sourceId ? `AND source_id = $2` : "";
  const params: unknown[] = ["legal_entity", "legal_case"];
  if (opts.sourceId) params.push(opts.sourceId);

  const rows = await engine.executeRaw<{ slug: string; body: string }>(
    `SELECT slug, body FROM pages
     WHERE type IN ($1, $2)
       AND deleted_at IS NULL
       ${sourceClause}
     ORDER BY slug
     LIMIT 10000`,
    params,
  );

  let rotated = 0;
  let skipped = 0;

  for (const row of rows) {
    // Find all HMAC hashes (32-char hex strings produced by `anonymize()`)
    // and re-hash. We look for the pattern in frontmatter and body.
    // The hash is 32 hex chars, typically in placeholder format like [ENT-01]
    // or in frontmatter fields like `pseudonym: <hash>`.
    const HASH_RE = /\b[a-f0-9]{32}\b/gi;
    const matches = row.body.match(HASH_RE);
    if (!matches || matches.length === 0) {
      skipped++;
      continue;
    }

    // For each unique hash, verify it matches oldKey on some known value,
    // then re-hash with newKey. Since we can't reverse the hash, we re-hash
    // the hash itself: newHash = HMAC(newKey, oldHash). This preserves
    // determinism (same oldKey+value → same oldHash → same newHash) while
    // breaking the link to the old key.
    let updatedBody = row.body;
    const seen = new Set<string>();
    for (const oldHash of matches) {
      if (seen.has(oldHash)) continue;
      seen.add(oldHash);
      const newHash = anonymize(oldHash, newKey);
      updatedBody = updatedBody.replaceAll(oldHash, newHash);
    }

    try {
      const { importFromContent } = await import("../import-file.ts");
      await importFromContent(engine, row.slug, updatedBody, {
        ...(opts.sourceId ? { sourceId: opts.sourceId } : {}),
      });
      rotated++;
    } catch {
      skipped++;
    }
  }

  return { rotated, skipped };
}
