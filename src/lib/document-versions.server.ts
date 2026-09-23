import { createHash } from "node:crypto";
import { ENGINE_URL } from "@/lib/engine";
import {
  isLockedFor,
  nextVersionNumber,
  readLock,
  versionSlug,
  type DocumentLock,
  type DocumentVersionFrontmatter,
} from "@/lib/document-versions";

export class CheckoutConflictError extends Error {
  constructor(public readonly lock: DocumentLock) {
    super("document_locked");
  }
}

export class VersionError extends Error {}

interface EnginePage {
  slug: string;
  title?: string;
  content?: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

async function getPage(headers: Record<string, string>, slug: string): Promise<EnginePage | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new VersionError(`Engine returned ${res.status}`);
  return (await res.json()) as EnginePage;
}

async function putPage(
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new VersionError(`Engine write failed: ${res.status}`);
}

async function listVersions(
  headers: Record<string, string>,
  docSlug: string
): Promise<DocumentVersionFrontmatter[]> {
  const res = await fetch(
    `${ENGINE_URL}/api/pages?slug_prefix=${encodeURIComponent(`legal/doc-versions/${docSlug}/`)}&limit=200`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new VersionError(`Engine returned ${res.status}`);
  const pages = (await res.json()) as Array<{ frontmatter?: DocumentVersionFrontmatter }>;
  return (Array.isArray(pages) ? pages : [])
    .map((p) => p.frontmatter)
    .filter((f): f is DocumentVersionFrontmatter => !!f && f.doc_slug === docSlug)
    .sort((a, b) => a.version - b.version);
}

/** Sperrt das Dokument für `user`. Wirft CheckoutConflictError bei Fremdsperre. */
export async function checkoutDocument(
  headers: Record<string, string>,
  slug: string,
  user: { id: string; email?: string }
): Promise<DocumentLock> {
  const page = await getPage(headers, slug);
  if (!page) throw new VersionError("Dokument nicht gefunden");
  const foreign = isLockedFor(page.frontmatter, user.id);
  if (foreign) throw new CheckoutConflictError(foreign);

  const lock: DocumentLock = {
    userId: user.id,
    userEmail: user.email ?? "",
    at: new Date().toISOString(),
  };
  await putPage(headers, {
    slug,
    merge: true,
    frontmatter: { ...page.frontmatter, checked_out_by: lock },
  });
  return lock;
}

/**
 * Check-in: Snapshot als neue Version + Sperre aufheben.
 * `content` überschreibt optional den Dokumenttext (mitge-editierte Version).
 */
export async function checkinDocument(
  headers: Record<string, string>,
  slug: string,
  user: { id: string; email?: string },
  opts?: { note?: string; content?: string }
): Promise<{ version: number; lock: DocumentLock | null }> {
  const page = await getPage(headers, slug);
  if (!page) throw new VersionError("Dokument nicht gefunden");
  const foreign = isLockedFor(page.frontmatter, user.id);
  if (foreign) throw new CheckoutConflictError(foreign);
  const lock = readLock(page.frontmatter);
  if (!lock) throw new VersionError("Dokument ist nicht ausgecheckt");

  // Erst den neuen Inhalt persistieren, dann davon den Snapshot ziehen —
  // so ist die Version exakt der eingecheckte Stand.
  const content = opts?.content ?? page.content ?? "";
  if (opts?.content !== undefined) {
    await putPage(headers, { slug, merge: true, content });
  }

  const versions = await listVersions(headers, slug);
  const version = nextVersionNumber(versions.map((v) => v.version));
  const { checked_out_by: _dropped, ...docFrontmatter } = page.frontmatter ?? {};

  await putPage(headers, {
    slug: versionSlug(slug, version),
    title: `Version ${version} — ${page.title ?? slug}`,
    type: "document_version",
    frontmatter: {
      doc_slug: slug,
      version,
      note: opts?.note?.trim() || undefined,
      checked_in_by: user.email ?? user.id,
      checked_in_at: new Date().toISOString(),
      doc_frontmatter: docFrontmatter,
      doc_content: content,
      doc_title: page.title ?? "",
      // Hash + Größe für den Binär-Vergleich im Versions-Panel —
      // Wort-Diff auf PDF/DOCX-Payloads ist sinnlos.
      doc_content_hash: createHash("sha256").update(content, "utf-8").digest("hex"),
      doc_content_size: Buffer.byteLength(content, "utf-8"),
    } satisfies DocumentVersionFrontmatter,
  });

  const { checked_out_by: _cleared, ...restFm } = page.frontmatter ?? {};
  await putPage(headers, {
    slug,
    merge: true,
    frontmatter: { ...restFm, checked_out_by: null },
  });
  return { version, lock };
}

/** Sperre aufheben ohne Snapshot (Freigeben) — nur Inhaber oder Admin. */
export async function releaseDocument(
  headers: Record<string, string>,
  slug: string,
  user: { id: string; role?: string }
): Promise<void> {
  const page = await getPage(headers, slug);
  if (!page) throw new VersionError("Dokument nicht gefunden");
  const lock = readLock(page.frontmatter);
  if (!lock) return;
  if (lock.userId !== user.id && user.role !== "admin") {
    throw new CheckoutConflictError(lock);
  }
  const { checked_out_by: _cleared, ...restFm } = page.frontmatter ?? {};
  await putPage(headers, {
    slug,
    merge: true,
    frontmatter: { ...restFm, checked_out_by: null },
  });
}

export async function listDocumentVersions(
  headers: Record<string, string>,
  slug: string
): Promise<DocumentVersionFrontmatter[]> {
  return listVersions(headers, slug);
}

/**
 * Stellt den Inhalt einer Version wieder her. Der aktuelle Stand wird vorher
 * als neue Version gesichert — Restore ist nie destruktiv.
 */
export async function restoreDocumentVersion(
  headers: Record<string, string>,
  slug: string,
  version: number,
  user: { id: string; email?: string }
): Promise<{ restoredFrom: number; safetyVersion: number }> {
  const page = await getPage(headers, slug);
  if (!page) throw new VersionError("Dokument nicht gefunden");
  const foreign = isLockedFor(page.frontmatter, user.id);
  if (foreign) throw new CheckoutConflictError(foreign);

  const versions = await listVersions(headers, slug);
  const target = versions.find((v) => v.version === version);
  if (!target) throw new VersionError(`Version ${version} nicht gefunden`);

  // Sicherungs-Snapshot des aktuellen Stands (nur wenn Inhalt abweicht).
  let safetyVersion = versions.length;
  if ((page.content ?? "") !== target.doc_content) {
    safetyVersion = nextVersionNumber(versions.map((v) => v.version));
    const { checked_out_by: _d, ...docFrontmatter } = page.frontmatter ?? {};
    await putPage(headers, {
      slug: versionSlug(slug, safetyVersion),
      title: `Version ${safetyVersion} — ${page.title ?? slug} (vor Wiederherstellung)`,
      type: "document_version",
      frontmatter: {
        doc_slug: slug,
        version: safetyVersion,
        note: `Automatisch gesichert vor Wiederherstellung von Version ${version}`,
        checked_in_by: user.email ?? user.id,
        checked_in_at: new Date().toISOString(),
        doc_frontmatter: docFrontmatter,
        doc_content: page.content ?? "",
        doc_title: page.title ?? "",
      } satisfies DocumentVersionFrontmatter,
    });
  }

  await putPage(headers, {
    slug,
    merge: true,
    content: target.doc_content,
    frontmatter: {
      ...page.frontmatter,
      ...target.doc_frontmatter,
      checked_out_by: null,
    },
  });
  return { restoredFrom: version, safetyVersion };
}
