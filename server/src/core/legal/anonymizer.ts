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
    // Simple global replace; for production use a proper NER pipeline
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
