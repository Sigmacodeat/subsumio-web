/**
 * Read-only WebDAV mount for the desktop-sync use case (WP-8.53).
 *
 * Desktop clients (macOS Finder, Windows Explorer, Cyberduck, Nextcloud)
 * speak PROPFIND/GET — methods the Next.js layer cannot dispatch. The engine
 * is Express, so the mount lives here.
 *
 * URL layout:
 *   /webdav/                    → collection: one folder per legal_case + "_allgemein"
 *   /webdav/<case-slug>/        → collection: documents stamped with that case_slug
 *   /webdav/<case-slug>/<f>.md  → the page's markdown content
 *
 * Auth: any non-revoked access_token (the same gbrain_* tokens the MCP
 * endpoint accepts). Clients send it either as Bearer or as the password of
 * an HTTP Basic challenge (Finder/Explorer convention — username ignored).
 * Source isolation + matter scope are taken from the token's permissions
 * row and threaded through invokeOp exactly like the MCP transport.
 */

import type { Application, Request, Response } from "express";
import { createHash } from "crypto";
import type { BrainEngine } from "../core/engine.ts";
import { hashToken } from "../core/utils.ts";
import { parseLegacyTokenScope } from "../mcp/http-transport.ts";

type InvokeFn = (
  engine: BrainEngine,
  name: string,
  params: Record<string, unknown>,
  sourceId?: string,
  allowedSources?: string[],
  matterScope?: string[] | "all",
  aclGroups?: string[] | "all",
  userId?: string
) => Promise<unknown>;

const UNFILED_FOLDER = "_allgemein";
const MAX_ENTRIES = 500;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, b);
  }
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  b.count += 1;
  return b.count > RATE_MAX;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Extract the bearer credential from Bearer or Basic (password field). */
export function extractDavToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const bearer = auth.match(/^Bearer\s+(\S+)$/i);
  if (bearer) return bearer[1];
  const basic = auth.match(/^Basic\s+(\S+)$/i);
  if (basic) {
    try {
      const decoded = Buffer.from(basic[1], "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      const password = idx >= 0 ? decoded.slice(idx + 1) : decoded;
      return password.trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** DAV-safe path segments: no traversal, no reserved/control chars. */
export function parseDavPath(rawPath: string): string[] | null {
  const decoded = decodeURIComponent(rawPath);
  const segments = decoded.split("/").filter((s) => s.length > 0);
  for (const seg of segments) {
    if (seg === "." || seg === "..") return null;
    if (/[<>:"|?\x00-\x1f*]/.test(seg)) return null;
    if (seg.length > 255) return null;
  }
  return segments;
}

/** Slugs may contain `/`; flatten to a filesystem-safe unique-ish name. */
export function davFileName(slug: string): string {
  return `${slug.replace(/\//g, "_").replace(/[<>:"|?\x00-\x1f*]/g, "-")}.md`;
}

/** Reverse lookup: find the doc whose davFileName matches the request. */
export function davSlugForFile(fileName: string, slugs: string[]): string | null {
  const stem = fileName.toLowerCase().endsWith(".md") ? fileName.slice(0, -3) : fileName;
  for (const slug of slugs) {
    if (davFileName(slug) === fileName || slug === stem) return slug;
    if (davFileName(slug).toLowerCase() === fileName.toLowerCase()) return slug;
  }
  return null;
}

interface DavAuth {
  tokenId: string;
  sourceId: string;
  allowedSources?: string[];
  matterScope?: string[] | "all";
}

async function authenticate(req: Request, engine: BrainEngine): Promise<DavAuth | null> {
  const token = extractDavToken(req);
  if (!token) return null;
  const hash = hashToken(token);
  const rows = await engine.executeRaw<{
    id: string;
    name: string;
    permissions: unknown;
  }>(
    `SELECT id, name, permissions FROM access_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL LIMIT 1`,
    [hash]
  );
  const row = rows[0];
  if (!row) return null;
  const perms = (row.permissions as { source_id?: unknown; matter_scope?: unknown } | null) ?? {};
  const { sourceId, allowedSources } = parseLegacyTokenScope(perms.source_id);
  let matterScope: string[] | "all" | undefined;
  if (perms.matter_scope === "all") matterScope = "all";
  else if (Array.isArray(perms.matter_scope)) {
    const s = perms.matter_scope.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (s.length > 0) matterScope = s;
  }
  return { tokenId: row.id, sourceId, allowedSources, matterScope };
}

interface PageRow {
  slug: string;
  title: string;
  updated_at?: string;
  frontmatter?: Record<string, unknown>;
}

function propstatXml(
  href: string,
  displayName: string,
  isCollection: boolean,
  updatedAt?: string,
  contentLength?: number
): string {
  const lastmod = updatedAt ? new Date(updatedAt).toUTCString() : new Date().toUTCString();
  const props = [
    `<D:displayname>${escapeXml(displayName)}</D:displayname>`,
    isCollection ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>",
    `<D:getlastmodified>${lastmod}</D:getlastmodified>`,
    ...(isCollection
      ? []
      : [
          `<D:getcontentlength>${contentLength ?? 0}</D:getcontentlength>`,
          "<D:getcontenttype>text/markdown; charset=utf-8</D:getcontenttype>",
        ]),
  ].join("");
  return `<D:response><D:href>${escapeXml(href)}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}

function multistatus(res: Response, responses: string[]): void {
  res
    .status(207)
    .set("Content-Type", "application/xml; charset=utf-8")
    .send(
      `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join("")}</D:multistatus>`
    );
}

async function listCases(engine: BrainEngine, auth: DavAuth): Promise<PageRow[]> {
  const raw = await invokeRef(
    engine,
    "list_pages",
    { type: "legal_case", limit: MAX_ENTRIES, include_frontmatter: true },
    auth.sourceId,
    auth.allowedSources,
    auth.matterScope
  );
  return (Array.isArray(raw) ? raw : []) as PageRow[];
}

async function listDocs(
  engine: BrainEngine,
  auth: DavAuth,
  caseSlug: string | null
): Promise<PageRow[]> {
  const raw = await invokeRef(
    engine,
    "list_pages",
    { type: "document", limit: MAX_ENTRIES, include_frontmatter: true },
    auth.sourceId,
    auth.allowedSources,
    auth.matterScope
  );
  const docs = (Array.isArray(raw) ? raw : []) as PageRow[];
  return docs.filter((d) => {
    const cs = d.frontmatter?.case_slug;
    const csStr = typeof cs === "string" ? cs : null;
    return caseSlug === null ? !csStr : csStr === caseSlug;
  });
}

// Injected by mountWebApi to avoid a runtime import cycle.
let invokeRef: InvokeFn;

export function mountWebDav(app: Application, engine: BrainEngine, invoke: InvokeFn): void {
  invokeRef = invoke;

  app.use("/webdav", async (req: Request, res: Response) => {
    try {
      const auth = await authenticate(req, engine);
      if (!auth) {
        res
          .status(401)
          .set("WWW-Authenticate", 'Basic realm="Subsumio WebDAV"')
          .send("Unauthorized");
        return;
      }
      if (rateLimit(auth.tokenId)) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      const base = "/webdav";
      const segments = parseDavPath(req.path || "/");
      if (segments === null) {
        res.status(400).json({ error: "invalid_path" });
        return;
      }
      const method = req.method.toUpperCase();

      if (method === "OPTIONS") {
        res
          .status(200)
          .set("DAV", "1")
          .set("Allow", "OPTIONS, PROPFIND, GET, HEAD")
          .set("MS-Author-Via", "DAV")
          .end();
        return;
      }

      if (method === "PROPFIND") {
        const depth = String(req.headers.depth ?? "1");
        if (depth === "infinity") {
          res.status(403).json({ error: "depth_infinity_denied" });
          return;
        }
        const selfHref = `${base}${req.path === "/" ? "/" : req.path}`;
        const responses: string[] = [];

        if (segments.length === 0) {
          // Root collection
          responses.push(propstatXml(`${base}/`, "Subsumio", true));
          if (depth === "1") {
            const cases = await listCases(engine, auth);
            for (const c of cases) {
              responses.push(
                propstatXml(
                  `${base}/${encodeURIComponent(c.slug)}/`,
                  c.title || c.slug,
                  true,
                  c.updated_at
                )
              );
            }
            responses.push(propstatXml(`${base}/${UNFILED_FOLDER}/`, "Allgemein", true));
          }
        } else if (segments.length === 1) {
          const folder = segments[0];
          const cases = await listCases(engine, auth);
          const isUnfiled = folder === UNFILED_FOLDER;
          const casePage = isUnfiled ? null : cases.find((c) => c.slug === folder);
          if (!isUnfiled && !casePage) {
            res.status(404).json({ error: "collection_not_found" });
            return;
          }
          responses.push(
            propstatXml(
              `${selfHref.replace(/\/$/, "")}/`,
              isUnfiled ? "Allgemein" : casePage!.title || folder,
              true,
              casePage?.updated_at
            )
          );
          if (depth === "1") {
            const docs = await listDocs(engine, auth, isUnfiled ? null : folder);
            for (const d of docs) {
              const fname = davFileName(d.slug);
              responses.push(
                propstatXml(
                  `${base}/${encodeURIComponent(folder)}/${encodeURIComponent(fname)}`,
                  d.title || d.slug,
                  false,
                  d.updated_at
                )
              );
            }
          }
        } else if (segments.length === 2) {
          // File propfind — report it exists (metadata only).
          const [folder, file] = segments;
          const docs = await listDocs(engine, auth, folder === UNFILED_FOLDER ? null : folder);
          const slug = davSlugForFile(
            file,
            docs.map((d) => d.slug)
          );
          const doc = slug ? docs.find((d) => d.slug === slug) : undefined;
          if (!doc) {
            res.status(404).json({ error: "not_found" });
            return;
          }
          responses.push(propstatXml(selfHref, doc.title || doc.slug, false, doc.updated_at));
        } else {
          res.status(404).json({ error: "not_found" });
          return;
        }
        multistatus(res, responses);
        return;
      }

      if (method === "GET" || method === "HEAD") {
        if (segments.length !== 2) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        const [folder, file] = segments;
        const docs = await listDocs(engine, auth, folder === UNFILED_FOLDER ? null : folder);
        const slug = davSlugForFile(
          file,
          docs.map((d) => d.slug)
        );
        if (!slug) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        const page = (await invokeRef(
          engine,
          "get_page",
          { slug },
          auth.sourceId,
          auth.allowedSources,
          auth.matterScope
        )) as { content?: string; updated_at?: string } | null;
        if (!page || typeof page.content !== "string") {
          res.status(404).json({ error: "not_found" });
          return;
        }
        const body = page.content;
        const etag = `"${createHash("sha256")
          .update(`${slug}:${page.updated_at ?? ""}`)
          .digest("hex")
          .slice(0, 32)}"`;
        res
          .status(200)
          .set("Content-Type", "text/markdown; charset=utf-8")
          .set("ETag", etag)
          .set("Last-Modified", new Date(page.updated_at ?? Date.now()).toUTCString());
        if (method === "HEAD") res.end();
        else res.send(body);
        return;
      }

      // Read-only mount: every write verb fails closed.
      res.status(405).set("Allow", "OPTIONS, PROPFIND, GET, HEAD").json({
        error: "read_only",
        message: "WebDAV-Mount ist schreibgeschützt.",
      });
    } catch (e) {
      res.status(500).json({
        error: "webdav_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
