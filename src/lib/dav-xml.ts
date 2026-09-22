/**
 * Minimal DAV XML helpers for the read-only WebDAV/CalDAV bridge
 * (`scripts/dav-server.ts`). Pure functions, unit-testable — the bridge keeps
 * no DAV logic of its own beyond HTTP plumbing.
 */

export interface DavResource {
  /** Absolute href as the client requested it, e.g. `/dokumente/akte-1.pdf`. */
  href: string;
  /** Display name (defaults to last href segment). */
  name?: string;
  /** Collection (folder) or file. */
  collection?: boolean;
  /** RFC-2822/HTTP-date for getlastmodified. */
  lastModified?: string;
  /** Byte length for files. */
  contentLength?: number;
  /** MIME type for files. */
  contentType?: string;
  /** Extra propstat XML fragments (e.g. CalDAV resourcetype). */
  extraProps?: string;
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function resourceXml(r: DavResource): string {
  const name = r.name ?? decodeURIComponent(r.href.split("/").filter(Boolean).pop() ?? "");
  const type = r.collection
    ? "<D:collection/>"
    : `<D:getcontenttype>${xmlEscape(r.contentType ?? "application/octet-stream")}</D:getcontenttype>`;
  const len =
    !r.collection && r.contentLength != null
      ? `<D:getcontentlength>${r.contentLength}</D:getcontentlength>`
      : "";
  const modified = r.lastModified
    ? `<D:getlastmodified>${xmlEscape(r.lastModified)}</D:getlastmodified>`
    : "";
  return (
    `<D:response><D:href>${xmlEscape(r.href)}</D:href>` +
    `<D:propstat><D:prop>` +
    `<D:resourcetype>${r.collection ? "<D:collection/>" : ""}</D:resourcetype>` +
    `<D:displayname>${xmlEscape(name)}</D:displayname>` +
    `${r.collection ? "" : type}${len}${modified}${r.extraProps ?? ""}` +
    `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
  );
}

/** DAV:multistatus body for PROPFIND responses. */
export function multistatus(resources: DavResource[]): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
    resources.map(resourceXml).join("") +
    `</D:multistatus>`
  );
}

/** Ensure an href ends with `/` for collections (DAV clients rely on it). */
export function collectionHref(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

/**
 * CalDAV `calendar-multiget`/simple REPORT body: one response per VEVENT-free
 * calendar resource carrying the full VCALENDAR payload.
 */
export function calendarDataMultistatus(href: string, ics: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
    `<D:response><D:href>${xmlEscape(href)}</D:href>` +
    `<D:propstat><D:prop><C:calendar-data>${xmlEscape(ics)}</C:calendar-data></D:prop>` +
    `<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`
  );
}
