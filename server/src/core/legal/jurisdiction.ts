/** Canonical jurisdiction rules for shared legal reference sources. */

export const LEGAL_JURISDICTIONS = ["at", "de", "ch", "eu"] as const;
export type LegalJurisdiction = (typeof LEGAL_JURISDICTIONS)[number];

export const LEGAL_SOURCE_BY_JURISDICTION: Record<LegalJurisdiction, string> = {
  at: "law-at",
  de: "law-de",
  ch: "law-ch",
  eu: "law-eu",
};

export function isLegalJurisdiction(value: string): value is LegalJurisdiction {
  return (LEGAL_JURISDICTIONS as readonly string[]).includes(value.toLowerCase());
}

export function statuteJurisdictionFromSlug(slug: string): LegalJurisdiction | null {
  const match = /^legal\/(?:statutes|judikatur)\/([a-z]{2})\//i.exec(slug);
  if (!match) return null;
  const value = match[1].toLowerCase();
  return isLegalJurisdiction(value) ? value : null;
}

/** Throws when a legal corpus item is about to enter a foreign source. */
export function assertLegalSourceJurisdiction(
  jurisdiction: string,
  sourceId: string,
  slug?: string
): void {
  const jur = jurisdiction.toLowerCase();
  if (!isLegalJurisdiction(jur)) {
    throw new Error(`Unsupported legal jurisdiction: ${jurisdiction}`);
  }

  const expectedSource = LEGAL_SOURCE_BY_JURISDICTION[jur];
  if (sourceId !== expectedSource) {
    throw new Error(
      `Legal jurisdiction/source mismatch: ${jur} material must use ${expectedSource}, got ${sourceId}`
    );
  }

  if (slug) {
    const slugJurisdiction = statuteJurisdictionFromSlug(slug);
    if (slugJurisdiction && slugJurisdiction !== jur) {
      throw new Error(
        `Legal jurisdiction/slug mismatch: ${jur} does not match ${slug}`
      );
    }
  }
}
