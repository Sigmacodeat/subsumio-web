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

/**
 * EU law sources. `law-eu` holds regulations; directives live in the
 * separate `law-eu-directives` source (import-eu-corpus --type directive);
 * EuGH/EuG judgements in `law-eu-judikatur` (import-judikatur --source eu).
 * All apply to every DACH jurisdiction — omitting them would strand
 * imported directives/judgements unrouted (same failure class as the
 * de/ch-judikatur gap).
 */
export const EU_LAW_SOURCES_STATUTES: string[] = ["law-eu", "law-eu-directives"];

export const EU_LAW_SOURCES_JUDIKATUR: string[] = ["law-eu-judikatur"];

/** All EU law sources (primary law + directives + judikatur). */
export const EU_LAW_SOURCES_ALL: string[] = [
  ...EU_LAW_SOURCES_STATUTES,
  ...EU_LAW_SOURCES_JUDIKATUR,
];

/** All AT law sources (statutes + judikatur + EU). Use this for "all" queries. */
export const AT_LAW_SOURCES_ALL: string[] = [
  ...AT_LAW_SOURCES_STATUTES,
  ...AT_LAW_SOURCES_JUDIKATUR,
  ...EU_LAW_SOURCES_ALL,
];

/** Primary AT statute source — use as `sourceId` for single-source queries. */
export const AT_PRIMARY_STATUTE_SOURCE = "law-at-normen";

/**
 * DE law sources. `law-de` holds the per-§ split federal statutes
 * (import-statutes-split.ts, jurisdiction de). Judikatur lives in the
 * separate `law-de-judikatur` source (74k+ decisions), literature and
 * Gesetzesmaterialien in their own sources — mirroring the granular AT
 * layout so DE queries actually reach the imported corpora instead of
 * searching only the statute source.
 */
export const DE_LAW_SOURCES_STATUTES: string[] = [
  "law-de",
  "law-de-literatur",
  "law-de-materialien",
];

export const DE_LAW_SOURCES_JUDIKATUR: string[] = ["law-de-judikatur"];

/** All DE law sources (statutes + judikatur + EU). Use this for "all" queries. */
export const DE_LAW_SOURCES_ALL: string[] = [
  ...DE_LAW_SOURCES_STATUTES,
  ...DE_LAW_SOURCES_JUDIKATUR,
  ...EU_LAW_SOURCES_ALL,
];

/**
 * CH law sources. Statutes (OR, ZGB, …) live in the main `law-ch` source;
 * judgements in the separate `law-ch-judikatur` source (import-judikatur
 * --source ch, ~4.3k Entscheide). `law-ch-literatur` is routed for parity
 * with AT/DE (dirimport only lands what exists on disk). Licensed
 * literature sub-sources (law-ch-literatur-*) stay adapter-gated until
 * contracts are signed.
 */
export const CH_LAW_SOURCES_STATUTES: string[] = ["law-ch", "law-ch-literatur"];

export const CH_LAW_SOURCES_JUDIKATUR: string[] = ["law-ch-judikatur"];

/** All CH law sources (statutes + judikatur + EU). Use this for "all" queries. */
export const CH_LAW_SOURCES_ALL: string[] = [
  ...CH_LAW_SOURCES_STATUTES,
  ...CH_LAW_SOURCES_JUDIKATUR,
  ...EU_LAW_SOURCES_ALL,
];

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

/**
 * Law sources a jurisdiction's attorneys read. EU law applies to all DACH
 * jurisdictions, so each set includes it.
 */
export const JURISDICTION_LAW_SOURCES: Record<string, string[]> = {
  DE: DE_LAW_SOURCES_ALL,
  AT: AT_LAW_SOURCES_ALL,
  CH: CH_LAW_SOURCES_ALL,
  EU: EU_LAW_SOURCES_ALL,
};

/**
 * The federated READ scope of a request: the tenant's own source plus the
 * shared law sources of ONE jurisdiction — the case's, else the user's.
 * Without a known jurisdiction only the own source (fail-closed: no law
 * corpus rather than a foreign one). `undefined` when no shared sources are
 * configured (no federation).
 */
export function scopedReadSources(
  sharedSources: readonly string[],
  ownSource: string,
  caseJurisdiction?: string,
  userJurisdiction?: string
): string[] | undefined {
  if (sharedSources.length === 0) return undefined;
  const jur = caseJurisdiction?.toUpperCase() ?? userJurisdiction?.toUpperCase();
  if (jur && JURISDICTION_LAW_SOURCES[jur]) {
    const scoped = JURISDICTION_LAW_SOURCES[jur].filter((s) => sharedSources.includes(s));
    return [...new Set([ownSource, ...scoped])];
  }
  return [ownSource];
}
