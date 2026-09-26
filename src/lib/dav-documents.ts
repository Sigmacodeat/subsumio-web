/**
 * Document listing of the read-only WebDAV bridge (scripts/dav-server.ts).
 *
 * The listing route (/api/calendar/<token>/dav/documents) pages through every
 * document the token owner may see, up to a safety bound; when that bound is
 * reached it answers `truncated: true` and the `limit`. The bridge must not
 * pass a cut list off as the whole drive: it logs the cut and shows a notice
 * file at the top of the mounted folder.
 */

export interface DavDocumentListing<T> {
  documents: T[];
  truncated: boolean;
  /** The route's safety bound when truncated, else null. */
  limit: number | null;
}

/** Name of the notice file shown in /dokumente/ when the listing is cut. */
export const DAV_TRUNCATION_NOTICE_NAME = "_LISTE_UNVOLLSTAENDIG.txt";

/** Reads the route's JSON answer; anything that is not a listing yields null. */
export function parseDavDocumentListing<T>(data: unknown): DavDocumentListing<T> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { documents?: unknown; truncated?: unknown; limit?: unknown };
  if (!Array.isArray(d.documents)) return null;
  const truncated = d.truncated === true;
  return {
    documents: d.documents as T[],
    truncated,
    limit: truncated && typeof d.limit === "number" ? d.limit : null,
  };
}

/** 100000 → "100.000" — fixed, independent of the runtime's locale data. */
function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Text of the notice file (and of the log line) for a cut listing. */
export function davTruncationNotice(listing: DavDocumentListing<unknown>): string {
  const shown = formatCount(listing.documents.length);
  const bound = listing.limit != null ? ` (Obergrenze ${formatCount(listing.limit)})` : "";
  return (
    `Dieses Laufwerk zeigt nur ${shown} Dokumente${bound} — es gibt weitere, ` +
    `die hier nicht aufgeführt sind.\r\n` +
    `Alle Dokumente sind in Subsumio unter „Dokumente“ bzw. in der jeweiligen Akte verfügbar.\r\n`
  );
}
