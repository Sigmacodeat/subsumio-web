export const LEGAL_JURISDICTIONS = ["at", "de", "ch"] as const;
export type LegalJurisdiction = (typeof LEGAL_JURISDICTIONS)[number];

function asLegalJurisdiction(value: string | undefined): LegalJurisdiction | undefined {
  const normalized = value?.trim().toLowerCase();
  return LEGAL_JURISDICTIONS.includes(normalized as LegalJurisdiction)
    ? (normalized as LegalJurisdiction)
    : undefined;
}

/**
 * Resolve the jurisdiction that may be sent to the engine.
 *
 * The request body is deliberately only a hint. The session/case headers are
 * created server-side and therefore remain authoritative for law-corpus
 * access. If neither is present, return undefined (fail closed).
 */
export function trustedLegalJurisdiction(
  headers: Record<string, string | undefined>,
  requested?: string
): LegalJurisdiction | undefined {
  const caseJurisdiction = asLegalJurisdiction(headers["x-subsumio-case-jurisdiction"]);
  if (caseJurisdiction) return caseJurisdiction;

  const userJurisdiction = asLegalJurisdiction(headers["x-subsumio-jurisdiction"]);
  if (userJurisdiction) return userJurisdiction;

  // Keep the argument explicit: requested is intentionally not trusted.
  void requested;
  return undefined;
}
