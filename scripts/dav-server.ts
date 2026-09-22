#!/usr/bin/env tsx
/**
 * Read-only WebDAV/CalDAV bridge for Subsumio.
 *
 * Next.js route handlers cannot serve DAV methods (PROPFIND/REPORT), so the
 * mount point lives in this standalone process. It proxies to the web app's
 * token-authenticated feed endpoints — no session cookie, no new credential
 * type: the same `<userId>.<secret>` link that powers the calendar
 * subscription also unlocks the drive.
 *
 * Auth (Basic): username = anything, password = the feed token.
 * Or no auth at all with the token embedded: clients may put the token in the
 * URL path as `/<token>/…` is NOT supported — use Basic auth (standard for
 * CalDAV clients like iOS/macOS Kalender, Thunderbird, Windows WebDAV).
 *
 * Mount points:
 *   /            → collections: /fristen/ (CalDAV), /dokumente/ (WebDAV)
 *   /fristen/    → CalDAV calendar collection; REPORT/GET serves the ICS feed
 *   /dokumente/  → WebDAV file listing; GET serves originals or markdown
 *
 * Config:
 *   SUBSUMIO_WEB_URL   web app base URL (default http://localhost:3000)
 *   DAV_PORT           listen port (default 4080)
 *   DAV_BIND           bind address (default 127.0.0.1 — put TLS/SSO in front)
 *
 * Usage: bun x tsx scripts/dav-server.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { multistatus, collectionHref, calendarDataMultistatus } from "../src/lib/dav-xml";

const WEB_URL = (process.env.SUBSUMIO_WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
const PORT = parseInt(process.env.DAV_PORT || "4080", 10);
const BIND = process.env.DAV_BIND || "127.0.0.1";

const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8" } as const;
const DAV_HEADER = "1, 2, calendar-access";

interface DavDoc {
  slug: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number | null;
  updated: string;
  hasFile: boolean;
}

/** Extract the feed token from HTTP Basic auth (password field). */
function tokenFromAuth(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    // Token may be in the password (standard) or username field.
    const token = colon >= 0 ? decoded.slice(colon + 1) : decoded;
    return token.includes(".") ? token.trim() : null;
  } catch {
    return null;
  }
}

function reply(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  headers: Record<string, string> = {}
) {
  res.writeHead(status, headers);
  res.end(body);
}

function denyAuth(res: ServerResponse) {
  reply(res, 401, "Unauthorized", {
    "WWW-Authenticate": 'Basic realm="Subsumio DAV", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8",
  });
}

async function fetchDocuments(token: string): Promise<DavDoc[] | null> {
  try {
    const res = await fetch(`${WEB_URL}/api/calendar/${encodeURIComponent(token)}/dav/documents`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404 || res.status === 429) return null;
    if (!res.ok) throw new Error(`documents ${res.status}`);
    const data = (await res.json()) as { documents?: DavDoc[] };
    return data.documents ?? [];
  } catch {
    return null;
  }
}

async function fetchIcs(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${WEB_URL}/api/calendar/${encodeURIComponent(token)}/fristen.ics`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Derive a filesystem-safe member name for a document. */
function docMemberName(doc: DavDoc): string {
  if (doc.hasFile && doc.fileName) return doc.fileName.replace(/[/\\]/g, "_");
  const base = (doc.title || doc.slug).replace(/[/\\]/g, "_").slice(0, 120);
  return `${base}.md`;
}

const server = createServer(async (req, res) => {
  const method = (req.method ?? "GET").toUpperCase();
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://dav").pathname);

  // Unauthenticated liveness probe for Docker/Caddy healthchecks — exposes
  // nothing beyond process aliveness.
  if (path === "/health" && (method === "GET" || method === "HEAD")) {
    return reply(res, 200, JSON.stringify({ ok: true }), {
      "Content-Type": "application/json",
    });
  }

  // CORS-style preflight + DAV discovery.
  if (method === "OPTIONS") {
    res.writeHead(204, {
      DAV: DAV_HEADER,
      Allow: "OPTIONS, PROPFIND, GET, HEAD, REPORT",
      "Content-Length": "0",
    });
    res.end();
    return;
  }

  if (!["PROPFIND", "GET", "HEAD", "REPORT"].includes(method)) {
    reply(res, 405, "Read-only DAV", { Allow: "OPTIONS, PROPFIND, GET, HEAD, REPORT" });
    return;
  }

  const token = tokenFromAuth(req);
  if (!token) return denyAuth(res);

  // ---- CalDAV: /fristen/ ------------------------------------------------
  if (path === "/fristen" || path.startsWith("/fristen/")) {
    if (method === "PROPFIND") {
      const depth = req.headers.depth ?? "1";
      const resources = [
        {
          href: "/fristen/",
          name: "Subsumio Fristen",
          collection: true,
          extraProps:
            `<C:supported-calendar-component-set>` +
            `<C:comp name="VEVENT"/></C:supported-calendar-component-set>`,
        },
      ];
      if (depth !== "0") {
        resources.push({
          href: "/fristen/fristen.ics",
          name: "fristen.ics",
          contentType: "text/calendar",
        });
      }
      return reply(res, 207, multistatus(resources), XML_HEADERS);
    }
    if (method === "REPORT") {
      const ics = await fetchIcs(token);
      if (ics == null) return reply(res, 502, "Calendar unavailable");
      return reply(res, 207, calendarDataMultistatus("/fristen/fristen.ics", ics), XML_HEADERS);
    }
    // GET /fristen/fristen.ics (or the collection itself) → raw ICS.
    const ics = await fetchIcs(token);
    if (ics == null) return reply(res, 404, "Not found");
    return reply(res, 200, ics, { "Content-Type": "text/calendar; charset=utf-8" });
  }

  // ---- WebDAV: /dokumente/ ----------------------------------------------
  if (path === "/dokumente" || path.startsWith("/dokumente/")) {
    if (method === "PROPFIND") {
      const docs = await fetchDocuments(token);
      if (docs == null) return denyAuth(res);
      const depth = req.headers.depth ?? "1";
      const resources = [{ href: "/dokumente/", name: "Subsumio Dokumente", collection: true }];
      if (depth !== "0") {
        for (const d of docs) {
          resources.push({
            href: `/dokumente/${encodeURIComponent(docMemberName(d))}`,
            name: docMemberName(d),
            contentType: d.hasFile ? d.mimeType || "application/octet-stream" : "text/markdown",
            contentLength: d.size ?? undefined,
            lastModified: d.updated ? new Date(d.updated).toUTCString() : undefined,
          } as never);
        }
      }
      return reply(res, 207, multistatus(resources), XML_HEADERS);
    }

    if (method === "GET" || method === "HEAD") {
      const member = path.slice("/dokumente/".length).replace(/\/+$/, "");
      if (!member) return reply(res, 404, "Not found");
      const docs = await fetchDocuments(token);
      if (docs == null) return denyAuth(res);
      const doc = docs.find((d) => docMemberName(d) === member);
      if (!doc) return reply(res, 404, "Not found");
      const upstream = await fetch(
        `${WEB_URL}/api/calendar/${encodeURIComponent(token)}/dav/documents/${encodeURIComponent(doc.slug)}`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (!upstream.ok) return reply(res, upstream.status === 404 ? 404 : 502, "Unavailable");
      const headers: Record<string, string> = {
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      };
      const cl = upstream.headers.get("content-length");
      if (cl) headers["Content-Length"] = cl;
      if (method === "HEAD") {
        res.writeHead(200, headers);
        return res.end();
      }
      res.writeHead(200, headers);
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    return reply(res, 405, "Read-only");
  }

  // ---- Root collection ---------------------------------------------------
  if (method === "PROPFIND" && (path === "/" || path === "")) {
    const resources = [
      { href: "/", name: "Subsumio", collection: true },
      ...(req.headers.depth === "0"
        ? []
        : [
            { href: "/fristen/", name: "Fristen", collection: true },
            { href: "/dokumente/", name: "Dokumente", collection: true },
          ]),
    ];
    return reply(res, 207, multistatus(resources), XML_HEADERS);
  }

  reply(res, 404, "Not found");
});

server.listen(PORT, BIND, () => {
  console.log(`[dav-server] read-only WebDAV/CalDAV bridge on http://${BIND}:${PORT}`);
  console.log(`[dav-server] proxying ${WEB_URL} — Basic auth password = feed token`);
  console.log(`[dav-server] mount: /dokumente/ (WebDAV), /fristen/ (CalDAV)`);
});
