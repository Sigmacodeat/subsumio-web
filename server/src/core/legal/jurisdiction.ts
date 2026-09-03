/** Canonical jurisdiction rules for shared legal reference sources. */

export const LEGAL_JURISDICTIONS = ["at", "de", "ch", "eu"] as const;
export type LegalJurisdiction = (typeof LEGAL_JURISDICTIONS)[number];

export const LEGAL_SOURCE_BY_JURISDICTION: Record<LegalJurisdiction, string> = {
  at: "law-at",
  de: "law-de",
  ch: "law-ch",
  eu: "law-eu",
};

/**
 * v0.46: Granular AT law source IDs. The legacy "law-at" source has 0 pages
 * because the 148.198 AT norms were imported via batch-import-from-disk.ts
 * under granular source IDs. Every read-side op (pipeline, eval, source-router)
 * MUST use this list instead of ["law-at"] — otherwise it searches an empty
 * source and finds no AT statutes.
 *
 * The statute sources contain federal/state/municipal law:
 *   law-at-normen (147.749), law-at-landesrecht (108.297), law-at-gemeinden,
 *   law-at-bezirke, law-at-bmerl, law-at-avsv, law-at-avn, law-at-spg,
 *   law-at-kmger, law-at-staatsvertraege, law-at-literatur
 *
 * The judikatur sources contain court decisions:
 *   law-at-judikatur-* (422.836 total across all courts)
 *
 * EU law is always included for DACH jurisdictions.
 */
export const AT_LAW_SOURCES_STATUTES: string[] = [
  "law-at",
  "law-at-normen",
  "law-at-landesrecht",
  "law-at-gemeinden",
  "law-at-bezirke",
  "law-at-bmerl",
  "law-at-avsv",
  "law-at-avn",
  "law-at-spg",
  "law-at-kmger",
  "law-at-staatsvertraege",
  "law-at-literatur",
];

export const AT_LAW_SOURCES_JUDIKATUR: string[] = [
  "law-at-judikatur",
  "law-at-judikatur-ogh",
  "law-at-judikatur-vwgh",
  "law-at-judikatur-vfgh",
  "law-at-judikatur-lvwg",
  "law-at-judikatur-asylgh",
  "law-at-judikatur-bvwg",
  "law-at-judikatur-dsk",
  "law-at-judikatur-gbk",
  "law-at-judikatur-dok",
  "law-at-judikatur-pvak",
  "law-at-judikatur-ubas",
  "law-at-judikatur-umse",
  "law-at-judikatur-uvs",
];

/** All AT law sources (statutes + judikatur + EU). Use this for "all" queries. */
export const AT_LAW_SOURCES_ALL: string[] = [
  ...AT_LAW_SOURCES_STATUTES,
  ...AT_LAW_SOURCES_JUDIKATUR,
  "law-eu",
];

/** Primary AT statute source — use as `sourceId` for single-source queries. */
export const AT_PRIMARY_STATUTE_SOURCE = "law-at-normen";

export function isLegalJurisdiction(value: string): value is LegalJurisdiction {
  return (LEGAL_JURISDICTIONS as readonly string[]).includes(value.toLowerCase());
}

export function statuteJurisdictionFromSlug(slug: string): LegalJurisdiction | null {
  const match = /^legal\/(?:statutes|judikatur|literatur|materialien)\/([a-z]{2})\//i.exec(slug);
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
      throw new Error(`Legal jurisdiction/slug mismatch: ${jur} does not match ${slug}`);
    }
  }
}
