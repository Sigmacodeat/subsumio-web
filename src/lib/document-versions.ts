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
  /** SHA-256 über `doc_content` — Grundlage des Binär-Vergleichs. */
  doc_content_hash?: string;
  /** Byte-Größe von `doc_content` (UTF-8). */
  doc_content_size?: number;
}

/** Text-ähnliche MIME-Typen, für die ein Wort-Diff sinnvoll ist. */
const TEXT_MIME_RE =
  /^(text\/|application\/(json|xml|javascript|x-yaml|rtf|xhtml\+xml|atom\+xml))/i;

/**
 * Ist die Version ein Binärdokument (PDF, DOCX, Bild, …)? Dann ist ein
 * Wort-Diff des gespeicherten Inhalts sinnlos — die UI zeigt stattdessen
 * den Hash-/Größen-Vergleich.
 */
export function isBinaryVersion(v: DocumentVersionFrontmatter): boolean {
  const mime = String(v.doc_frontmatter?.mime_type ?? v.doc_frontmatter?.content_type ?? "").trim();
  if (mime) return !TEXT_MIME_RE.test(mime);
  // Kein MIME-Typ: Heuristik auf dem Inhalt — NUL-Bytes oder
  // Base64-Daten-URLs verraten Binärdaten.
  const head = v.doc_content.slice(0, 512);
  return head.includes("\u0000") || head.startsWith("data:");
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

/**
 * Frontmatter-Felder, die eine Seite an eine Akte binden — Spiegel von
 * MATTER_BINDING_FIELDS der Engine (server/src/core/matter-binding.ts).
 */
export const MATTER_BINDING_FIELDS = [
  "case_slug",
  "case_ref",
  "matter_slug",
  "case",
  "legal_case",
  "assigned_case_slug",
  "converted_case_slug",
  "case_slugs",
  "linked_cases",
  "related_case_slugs",
  "matter",
  "case_number",
  "case_title",
  "case_reference",
  "matter_reference",
  "assigned_case_number",
  "aktenzeichen",
] as const;

/**
 * Die Aktenbindung des Dokuments für seinen Versions-Snapshot: der Snapshot
 * gehört zur selben Akte wie das Dokument und darf nie sichtbarer sein.
 */
export function versionBindingFields(
  docFrontmatter: Record<string, unknown> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of MATTER_BINDING_FIELDS) {
    const value = docFrontmatter?.[key];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/** `legal/doc-versions/<docSlug>/v<N>` — Slugs enthalten `/`, erlaubt. */
export function versionSlug(docSlug: string, version: number): string {
  return `legal/doc-versions/${docSlug}/v${version}`;
}

export function nextVersionNumber(existing: number[]): number {
  return existing.reduce((max, n) => Math.max(max, n), 0) + 1;
}
