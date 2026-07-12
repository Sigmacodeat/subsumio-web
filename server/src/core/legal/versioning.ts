/** Stable identity for one retrieved legal source version. */
export function legalVersionId(jurisdiction: string, statute: string, versionDate: string): string {
  return `${jurisdiction.toLowerCase()}:${statute.toLowerCase()}:${versionDate}`;
}
