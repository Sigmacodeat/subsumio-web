/**
 * Dokumentversionen + Check-in/Check-out für das Akten-DMS.
 *
 * Modell: die Sperre lebt im Frontmatter der Dokument-Seite
 * (`checked_out_by`), Versionen sind `document_version`-Seiten unter
 * `legal/doc-versions/<docSlug>/v<N>` — Snapshot aus Content + Frontmatter
 * zum Check-in-Zeitpunkt. Enforcement: /api/pages POST lehnt Schreibzugriffe
 * anderer Nutzer auf gesperrte Dokumente mit 409 ab.
 */

export interface DocumentLock {
  userId: string;
  userEmail: string;
  at: string;
}

export interface DocumentVersionFrontmatter {
  doc_slug: string;
  version: number;
  note?: string;
  checked_in_by: string;
  checked_in_at: string;
  /** Snapshot des Frontmatter zum Check-in (ohne Lock-Feld). */
  doc_frontmatter: Record<string, unknown>;
  /** Snapshot des Inhalts zum Check-in. */
  doc_content: string;
  doc_title: string;
}

export function readLock(frontmatter: Record<string, unknown> | undefined): DocumentLock | null {
  const raw = frontmatter?.checked_out_by;
  if (!raw || typeof raw !== "object") return null;
  const lock = raw as Partial<DocumentLock>;
  return typeof lock.userId === "string" && typeof lock.at === "string"
    ? { userId: lock.userId, userEmail: lock.userEmail ?? "", at: lock.at }
    : null;
}

export function isDocumentLock(value: unknown): value is DocumentLock {
  if (!value || typeof value !== "object") return false;
  const lock = value as Partial<DocumentLock>;
  return typeof lock.userId === "string" && typeof lock.at === "string";
}

export function isLockedFor(
  frontmatter: Record<string, unknown> | undefined,
  userId: string
): DocumentLock | null {
  const lock = readLock(frontmatter);
  return lock && lock.userId !== userId ? lock : null;
}

/** `legal/doc-versions/<docSlug>/v<N>` — Slugs enthalten `/`, erlaubt. */
export function versionSlug(docSlug: string, version: number): string {
  return `legal/doc-versions/${docSlug}/v${version}`;
}

export function nextVersionNumber(existing: number[]): number {
  return existing.reduce((max, n) => Math.max(max, n), 0) + 1;
}
