/**
 * Client-side Contact Conflict Pre-Flight Check.
 *
 * Fuzzy-Matching auf Kontaktnamen zur lokalen Vorausprüfung bevor
 * der teure Engine-Call (/api/legal/conflict-check) ausgeführt wird.
 *
 * Use cases:
 *   - Beim Anlegen eines neuen Mandanten: Prüfung gegen existierende Kontakte
 *   - Beim Anlegen einer neuen Akte: Prüfung ob Mandant ↔ Gegner overlap
 *   - Beim Editieren von Kontakten: Prüfung auf Rollen-Konflikte
 *
 * § 43a BRAO / § 10 FAO: Interessenkonflikt-Prüfung.
 */

export interface ContactRef {
  slug?: string;
  name: string;
  role: "client" | "opponent" | "court" | "lawyer" | "other";
  company?: string;
}

export interface ConflictHit {
  contact: ContactRef;
  reason: string;
  similarity: number; // 0..1
  matchType: "exact" | "fuzzy" | "company";
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  severity: "critical" | "low" | "none";
  hits: ConflictHit[];
  checkedContacts: number;
  warning?: string;
}

// ── Normalization ──────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[,.;:!?()[\]{}'"\/\\]/g, "")
    .replace(/\b(dr\.?|prof\.?|mag\.?|ba\.\|ma\.)\b/gi, "")
    .replace(/\b(gmbh|ag|kg|ohg|eg|ug|gbr)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t.length > 1);
}

// ── Similarity ─────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

function tokenSetSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) {
    if (tb.has(t)) common++;
  }
  return common / Math.max(ta.size, tb.size);
}

function combinedSimilarity(a: string, b: string): number {
  const lev = similarity(a, b);
  const token = tokenSetSimilarity(a, b);
  return Math.max(lev, token * 0.9);
}

// ── Conflict Detection ─────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.75;
const EXACT_THRESHOLD = 0.95;

/**
 * Prüft einen neuen Kontakt gegen existierende Kontakte.
 * Findet: Namens-Duplikate, Rollen-Konflikte (gleiche Person als Mandant UND Gegner).
 */
export function checkContactConflict(
  newContact: ContactRef,
  existingContacts: ContactRef[]
): ConflictCheckResult {
  const hits: ConflictHit[] = [];

  for (const existing of existingContacts) {
    if (existing.slug && newContact.slug && existing.slug === newContact.slug) continue;

    const sim = combinedSimilarity(newContact.name, existing.name);
    const companySim =
      newContact.company && existing.company
        ? combinedSimilarity(newContact.company, existing.company)
        : 0;

    if (sim >= EXACT_THRESHOLD) {
      const isRollenKonflikt =
        (newContact.role === "client" && existing.role === "opponent") ||
        (newContact.role === "opponent" && existing.role === "client");

      hits.push({
        contact: existing,
        reason: isRollenKonflikt
          ? `Kritischer Rollenkonflikt: "${existing.name}" ist bereits als ${existing.role} registriert`
          : `Exakte Namensübereinstimmung mit existierendem Kontakt (${existing.role})`,
        similarity: sim,
        matchType: "exact",
      });
    } else if (sim >= SIMILARITY_THRESHOLD) {
      hits.push({
        contact: existing,
        reason: `Ähnlicher Name (${Math.round(sim * 100)}% Übereinstimmung, Rolle: ${existing.role})`,
        similarity: sim,
        matchType: "fuzzy",
      });
    } else if (companySim >= SIMILARITY_THRESHOLD && newContact.company && existing.company) {
      hits.push({
        contact: existing,
        reason: `Gleiche Firma erkannt: "${existing.company}" (${existing.role})`,
        similarity: companySim,
        matchType: "company",
      });
    }
  }

  const hasCritical = hits.some(
    (h) =>
      h.matchType === "exact" &&
      ((newContact.role === "client" && h.contact.role === "opponent") ||
        (newContact.role === "opponent" && h.contact.role === "client"))
  );

  const hasHits = hits.length > 0;
  const severity: ConflictCheckResult["severity"] = hasCritical
    ? "critical"
    : hasHits
      ? "low"
      : "none";

  return {
    hasConflict: hasHits,
    severity,
    hits: hits.sort((a, b) => b.similarity - a.similarity),
    checkedContacts: existingContacts.length,
    warning: hasCritical
      ? "§ 43a BRAO: Möglicher Interessenkonflikt — Mandatsübernahme prüfen!"
      : hasHits
        ? "Ähnliche Kontakte gefunden — Bitte Identität bestätigen."
        : undefined,
  };
}

/**
 * Prüft einen Satz von Kontakten auf interne Konflikte
 * (z.B. Mandant und Gegner im selben Fall).
 */
export function checkInternalConflict(contacts: ContactRef[]): ConflictCheckResult {
  const clients = contacts.filter((c) => c.role === "client");
  const opponents = contacts.filter((c) => c.role === "opponent");
  const hits: ConflictHit[] = [];

  for (const client of clients) {
    for (const opponent of opponents) {
      const sim = combinedSimilarity(client.name, opponent.name);
      if (sim >= SIMILARITY_THRESHOLD) {
        hits.push({
          contact: opponent,
          reason: `Mandant "${client.name}" und Gegner "${opponent.name}" sind möglicherweise dieselbe Person`,
          similarity: sim,
          matchType: sim >= EXACT_THRESHOLD ? "exact" : "fuzzy",
        });
      }
    }
  }

  const hasCritical = hits.some((h) => h.matchType === "exact");

  return {
    hasConflict: hits.length > 0,
    severity: hasCritical ? "critical" : hits.length > 0 ? "low" : "none",
    hits,
    checkedContacts: contacts.length,
    warning: hasCritical
      ? "Kritischer Konflikt: Mandant und Gegner scheinen identisch zu sein!"
      : hits.length > 0
        ? "Mandant und Gegner haben ähnliche Namen — Bitte überprüfen."
        : undefined,
  };
}

// ── Exported helpers for testing ───────────────────────────────────────

export { normalizeName, tokenize, similarity, combinedSimilarity, levenshtein };
