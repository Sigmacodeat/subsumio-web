/**
 * Sigmabrain Web Dashboard REST API.
 *
 * Thin HTTP layer over BrainEngine + operations for the Next.js product UI.
 * Mounted at /api/* by serve-http.ts. Intended for same-machine / trusted-proxy
 * use (default bind 127.0.0.1). Optional GBRAIN_WEB_API_KEY gates access.
 */

import express from "express";
import type { Application, Request, Response, NextFunction } from "express";
import type { BrainEngine } from "../core/engine.ts";
import { dispatchToolCall, buildOperationContext } from "../mcp/dispatch.ts";
import { importFromContent, ocrImageBuffer } from "../core/import-file.ts";
import {
  extractDocumentText,
  synthesizeDocumentMarkdown,
  isDocumentFilePath,
  withUnverifiedBanner,
} from "../core/extract-document.ts";
import { slugifySegment, isImageFilePath } from "../core/sync.ts";
import { loadConfig } from "../core/config.ts";
import { OperationError } from "../core/operations.ts";
import {
  isEngineError,
  NotFoundError as EngineNotFoundError,
  ConnectionError as EngineConnectionError,
} from "../core/engine-errors.ts";
import type { ThinkResult } from "../core/think/index.ts";
import { MinionQueue } from "../core/minions/queue.ts";

export interface WebApiOptions {
  /** When set, require matching X-Sigmabrain-Api-Key or Authorization: Bearer header. */
  apiKey?: string;
  /**
   * Fail-closed multi-tenant mode (SaaS deployments). When true, every
   * request MUST carry a valid `x-sigmabrain-source` header naming a
   * non-default tenant source — requests without one are rejected with 400
   * instead of silently falling back to the all-seeing 'default' scope.
   * Enable via GBRAIN_REQUIRE_TENANT=true (or SIGMABRAIN_REQUIRE_TENANT).
   */
  requireTenant?: boolean;
}

interface ParsedMultipart {
  fields: Record<string, string>;
  file?: { filename: string; data: Buffer; mimeType: string };
}

function requireWebApiKey(apiKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!apiKey) return next();
    const header =
      (req.headers["x-sigmabrain-api-key"] as string | undefined) ??
      req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (header !== apiKey) {
      res.status(401).json({ error: "unauthorized", message: "Invalid or missing API key" });
      return;
    }
    next();
  };
}

function parseMultipart(body: Buffer, contentType: string): ParsedMultipart {
  const boundaryMatch = contentType.match(/boundary=([^;\s]+)/i);
  if (!boundaryMatch) throw new Error("Missing multipart boundary");
  const boundary = boundaryMatch[1].replace(/^"|"$/g, "");
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, delimiter).filter(
    (p) => p.length > 2 && !p.slice(0, 4).equals(Buffer.from("--\r\n"))
  );

  const fields: Record<string, string> = {};
  let file: ParsedMultipart["file"];

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerBlock = part.slice(0, headerEnd).toString("utf8");
    let content = part.slice(headerEnd + 4);
    if (content.slice(-2).equals(Buffer.from("\r\n"))) content = content.slice(0, -2);

    const disposition = headerBlock.match(/Content-Disposition:[^\r\n]*/i)?.[0] ?? "";
    const nameMatch = disposition.match(/name="([^"]+)"/);
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const name = nameMatch?.[1];
    if (!name) continue;

    const mimeType =
      headerBlock.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? "application/octet-stream";

    if (filenameMatch) {
      file = { filename: filenameMatch[1], data: content, mimeType };
    } else {
      fields[name] = content.toString("utf8");
    }
  }

  return { fields, file };
}

function splitBuffer(buf: Buffer, sep: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  let idx = buf.indexOf(sep, start);
  while (idx !== -1) {
    if (idx > start) parts.push(buf.slice(start, idx));
    start = idx + sep.length;
    idx = buf.indexOf(sep, start);
  }
  if (start < buf.length) parts.push(buf.slice(start));
  return parts;
}

function slugFromUpload(source: string, filename: string, title?: string): string {
  const base = title ? slugifySegment(title) : slugifySegment(filename.replace(/\.[^.]+$/, ""));
  const src = slugifySegment(source) || "documents";
  return `${src}/${base || "untitled"}`;
}

/**
 * Office/binary formats a law firm sends that we do NOT yet extract. Reading
 * them as UTF-8 stored mojibake garbage as a "document" (silent corruption).
 * Reject cleanly with an actionable message instead. Native extraction for
 * these (Outlook .msg, multi-page .tiff scans, legacy .doc) is a tracked
 * follow-up — it needs decoder deps verified against `bun build --compile`.
 */
const UNSUPPORTED_UPLOAD_EXTS = new Set([
  ".msg",
  ".tiff",
  ".tif",
  ".doc",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".pages",
  ".key",
  ".numbers",
  ".zip",
  ".rar",
  ".7z",
]);

/** Thrown for a file we recognize but can't ingest yet; the route maps it to a
 *  400 with the actionable message rather than a generic 500. */
class UnsupportedUploadError extends Error {}

/** Heuristic binary sniff: a NUL byte in the first 8 KB means it isn't text.
 *  Guards the UTF-8 fallback from storing garbage for unknown binary types. */
function looksBinary(data: Buffer): boolean {
  const n = Math.min(data.length, 8192);
  for (let i = 0; i < n; i++) if (data[i] === 0) return true;
  return false;
}

async function buildMarkdownFromUpload(
  engine: BrainEngine,
  filename: string,
  data: Buffer,
  title?: string
): Promise<string> {
  const lower = filename.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  const t = title ?? filename.replace(/\.[^.]+$/, "");

  if (isDocumentFilePath(filename)) {
    const extracted = await extractDocumentText(data, ext, { filename });
    if (title) extracted.frontmatter.title = title;
    return synthesizeDocumentMarkdown(filename, extracted);
  }

  // Images (photo/scan of a Schriftsatz): OCR to chattable text. Without this
  // the upload path read image bytes as UTF-8 → garbage. OCR output is tagged
  // unverified (recognized, not read verbatim).
  if (isImageFilePath(filename)) {
    const { text } = await ocrImageBuffer(engine, data, ext);
    if (text.trim()) {
      const body = withUnverifiedBanner(text, "ocr_vision");
      return `---\ntitle: ${JSON.stringify(t)}\ntype: image\nextraction_method: "ocr_vision"\nextraction_unverified: "true"\n---\n\n${body}\n`;
    }
    // OCR off/unavailable/empty: store an honest placeholder, never garbage.
    return `---\ntitle: ${JSON.stringify(t)}\ntype: image\n---\n\n> ⚠️ Bild gespeichert, aber kein Text erkannt (OCR deaktiviert oder kein lesbarer Text). Inhalt ist nicht durchsuchbar — ggf. als PDF mit Textebene erneut hochladen.\n`;
  }

  if (ext === ".json") {
    const parsed = JSON.parse(data.toString("utf8"));
    const body = "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    return `---\ntitle: ${JSON.stringify(t)}\ntype: document\n---\n\n${body}\n`;
  }

  if (UNSUPPORTED_UPLOAD_EXTS.has(ext)) {
    throw new UnsupportedUploadError(
      `Das Format ${ext} wird noch nicht direkt unterstützt. Bitte als PDF oder DOCX hochladen ` +
        `(ein Foto/Scan als JPG/PNG/HEIC geht ebenfalls — es wird per OCR ausgelesen).`
    );
  }

  const text = data.toString("utf8");
  if (text.startsWith("---")) return text;
  // Backstop: an unrecognized binary (no extension match, but NUL bytes) would
  // otherwise be stored as mojibake. Reject with the same actionable message.
  if (looksBinary(data)) {
    throw new UnsupportedUploadError(
      `Diese Datei ist kein Text und wird nicht unterstützt. Bitte als PDF oder DOCX hochladen ` +
        `(Foto/Scan als JPG/PNG/HEIC wird per OCR ausgelesen).`
    );
  }
  return `---\ntitle: ${JSON.stringify(t)}\ntype: document\n---\n\n${text}\n`;
}

function mapStats(raw: Record<string, unknown>) {
  const pagesByType = (raw.pages_by_type ?? {}) as Record<string, number>;
  const entityTypes = ["person", "company", "idea", "event", "place"];
  const totalEntities = entityTypes.reduce((sum, t) => sum + (pagesByType[t] ?? 0), 0);

  return {
    total_pages: Number(raw.page_count ?? 0),
    total_entities: totalEntities,
    total_queries: 0,
    total_edges: Number(raw.link_count ?? 0),
    storage_used_mb: undefined,
    dream_cycle_last: undefined,
    last_synced: undefined,
    _engine: {
      chunk_count: Number(raw.chunk_count ?? 0),
      embedded_count: Number(raw.embedded_count ?? 0),
      tag_count: Number(raw.tag_count ?? 0),
      pages_by_type: pagesByType,
    },
  };
}

function mapSearchResults(results: Array<Record<string, unknown>>) {
  return results.map((r) => ({
    slug: String(r.slug ?? ""),
    title: String(r.title ?? r.slug ?? ""),
    snippet: String(r.chunk_text ?? r.snippet ?? "").slice(0, 300),
    score: Number(r.score ?? 0),
    source: r.source_id ? String(r.source_id) : undefined,
    created_at: undefined,
  }));
}

function mapPage(page: Record<string, unknown>, tags: string[] = []) {
  const body = String(page.compiled_truth ?? page.content ?? "");
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const frontmatter =
    page.frontmatter && typeof page.frontmatter === "object"
      ? (page.frontmatter as Record<string, unknown>)
      : {};
  return {
    slug: String(page.slug ?? ""),
    title: String(page.title ?? page.slug ?? ""),
    content: body,
    created_at: String(page.created_at ?? ""),
    updated_at: String(page.updated_at ?? ""),
    source: page.source_id ? String(page.source_id) : undefined,
    tags,
    word_count: wordCount,
    type: page.type ? String(page.type) : undefined,
    frontmatter,
  };
}

/**
 * Multi-tenant scoping (V1 provisioning): the Next.js dashboard proxies
 * forward the logged-in user's brainId as `x-sigmabrain-source` —
 * server-to-server, never from the browser. Every operation context and
 * every raw query in this module scopes to it; unknown/invalid headers
 * fall back to 'default' (single-tenant/self-hosted behavior unchanged).
 */
const SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function requestSourceId(req: Request): string {
  const h = req.headers["x-sigmabrain-source"];
  const v = Array.isArray(h) ? h[0] : h;
  return v && SOURCE_RE.test(v) ? v : "default";
}

/**
 * P0-SECR-002: Parse verified matter scope from a signed identity token.
 *
 * The web-app creates a short-lived HMAC-signed token (server/src/core/identity-token.ts)
 * after verifying the caller's identity (WhatsApp identity DB lookup, session check).
 * The engine verifies the HMAC signature using the shared SUBSUMIO_WEB_API_KEY.
 *
 * This replaces the previous self-asserted header approach — anyone with the
 * API key could set x-sigmabrain-matter-scope: "all" and bypass all filtering.
 *
 * Returns "all" (no filtering) when no token is present (legacy callers, CLI,
 * browser-session callers who don't need matter-scope enforcement).
 */
/**
 * Result of parsing the matter-scope identity token off a request.
 *
 * - `{ present: false }` — no token header at all. Legacy/non-WhatsApp callers
 *   (dashboard session, CLI, cron) never send one; falls back to "all" at the
 *   call site, preserving existing behavior for everyone who isn't matter-scoped.
 * - `{ present: true, valid: false }` — a token WAS presented but failed
 *   signature/expiry verification (tampered, replayed past TTL, wrong secret).
 *   This must be a hard 403, NOT a silent fall-back to "all" — a caller that
 *   claims to be identity-scoped and fails verification is exactly the
 *   scenario the signed token exists to catch.
 * - `{ present: true, valid: true, scope }` — verified scope to enforce.
 */
type MatterScopeResult =
  | { present: false }
  | { present: true; valid: false }
  | { present: true; valid: true; scope: string[] | "all" };

function parseMatterScopeToken(req: Request, apiKey: string | undefined): MatterScopeResult {
  const h = req.headers["x-sigmabrain-identity-token"];
  const token = Array.isArray(h) ? h[0] : h;
  if (!token || typeof token !== "string") return { present: false };
  if (!apiKey) return { present: true, valid: false }; // can't verify without a secret — deny, don't trust
  // Dynamic import to avoid circular dependency at module load time
  // The identity-token module is pure (no engine deps), safe to import eagerly
  const { verifyIdentityToken } = require("../core/identity-token.ts");
  const payload = verifyIdentityToken(token, apiKey);
  if (!payload) return { present: true, valid: false };
  return { present: true, valid: true, scope: payload.matterScope };
}

/**
 * Verified matter scope for filtering, with fail-closed semantics: a
 * presented-but-invalid token throws (caller must 403), only a genuinely
 * absent token defaults to "all" (legacy/non-WhatsApp caller).
 */
function verifiedMatterScope(req: Request, apiKey: string | undefined): string[] | "all" {
  const result = parseMatterScopeToken(req, apiKey);
  if (!result.present) return "all";
  if (!result.valid) {
    throw new OperationError(
      "identity_token_invalid",
      "Identity token failed verification.",
      "The x-sigmabrain-identity-token header was present but invalid, expired, or unverifiable. Refusing to fall back to unrestricted access."
    );
  }
  return result.scope;
}

/**
 * P0-SECR-002: Filter search/think results to only include pages whose slug
 * starts with one of the allowed matter prefixes. When scope is "all" or empty,
 * no filtering is applied (preserves existing behavior for non-WhatsApp callers).
 */
function filterByMatterScope<T extends { slug?: string }>(
  results: T[],
  scope: string[] | "all"
): T[] {
  if (scope === "all" || scope.length === 0) return results;
  return results.filter((r) => {
    const slug = r.slug ?? "";
    return scope.some((prefix) => slug.startsWith(prefix) || slug === prefix);
  });
}

/**
 * Shared, public, READ-ONLY reference sources every tenant may query alongside
 * their own (e.g. the statute corpus imported into `law-at`/`law-de`). Set via
 * `GBRAIN_SHARED_READ_SOURCES=law-at,law-de`. Empty by default → behaviour is
 * unchanged unless a deployment opts in. Statute text is public, so federating
 * it into reads is not a data-isolation concern; writes are unaffected.
 */
const SHARED_READ_SOURCES: string[] = (process.env.GBRAIN_SHARED_READ_SOURCES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s && SOURCE_RE.test(s));

/**
 * The federated READ scope for a request: the tenant's own source plus the
 * shared statute sources. Returns undefined when no shared sources are
 * configured (preserves the scalar-sourceId path). Never used for writes.
 */
function readSourcesFor(req: Request): string[] | undefined {
  if (SHARED_READ_SOURCES.length === 0) return undefined;
  const own = requestSourceId(req);
  return [...new Set([own, ...SHARED_READ_SOURCES])];
}

async function invokeOp(
  engine: BrainEngine,
  name: string,
  params: Record<string, unknown>,
  sourceId: string = "default",
  allowedSources?: string[],
  matterScope?: string[] | "all"
): Promise<unknown> {
  const result = await dispatchToolCall(engine, name, params, {
    remote: false,
    sourceId,
    ...(allowedSources ? { allowedSources } : {}),
    ...(matterScope ? { matterScope } : {}),
  });
  if (result.isError) {
    let msg = "operation_failed";
    let errorKind: string | undefined;
    try {
      const parsed = JSON.parse(result.content[0]?.text ?? "{}");
      msg = parsed.error?.message ?? parsed.message ?? msg;
      errorKind = parsed.error === "not_found" ? "not_found" : undefined;
    } catch {
      /* ignore */
    }
    if (errorKind === "not_found") {
      throw new EngineNotFoundError(msg);
    }
    throw new OperationError("web_api_error", msg);
  }
  try {
    return JSON.parse(result.content[0]?.text ?? "null");
  } catch {
    return result.content[0]?.text;
  }
}

/**
 * Batch-fetch page titles for a set of citation slugs so citation pills in
 * the UI show the real page title instead of the slug path.
 */
async function enrichCitations(
  engine: BrainEngine,
  citations: Array<{ page_slug: string }>,
  sourceId: string,
  allowedSources?: string[]
): Promise<Array<{ slug: string; title: string; quote: string; confidence: number }>> {
  if (citations.length === 0) return [];
  const slugs = [...new Set(citations.map((c) => c.page_slug))];
  // Match the federated read scope used for retrieval, so a cited statute page
  // in a shared source (law-at) resolves its title too — not just tenant pages.
  const scopes = allowedSources && allowedSources.length > 0 ? allowedSources : [sourceId];
  const rows = await engine
    .executeRaw<{ slug: string; title: string }>(
      `SELECT slug, title FROM pages WHERE slug = ANY($1::text[])
       AND deleted_at IS NULL
       AND ($2::text[] @> ARRAY['default'] OR source_id = ANY($2::text[]))`,
      [slugs, scopes]
    )
    .catch(() => [] as Array<{ slug: string; title: string }>);
  const titleMap = new Map(rows.map((r) => [r.slug, r.title]));
  return citations.map((c) => ({
    slug: c.page_slug,
    title: titleMap.get(c.page_slug) ?? c.page_slug.split("/").pop() ?? c.page_slug,
    quote: "",
    confidence: 0.85,
  }));
}

export function mountWebApi(app: Application, engine: BrainEngine, options: WebApiOptions = {}) {
  // SUBSUMIO_WEB_API_KEY is the canonical name (matches .env.example and the
  // signing key documented in identity-token.ts). The GBRAIN_/SIGMABRAIN_
  // variants are pre-rebrand fallbacks ONLY — a deployment that sets just
  // SUBSUMIO_WEB_API_KEY (as documented) must still resolve the same secret
  // here, or the API-key gate silently opens AND every identity-token HMAC
  // verification silently fails closed-to-open (verifiedMatterScope treats
  // an unverifiable token as "no token" → unrestricted access).
  const apiKey =
    options.apiKey ??
    process.env.SUBSUMIO_WEB_API_KEY ??
    process.env.GBRAIN_WEB_API_KEY ??
    process.env.SIGMABRAIN_WEB_API_KEY;
  const guard = requireWebApiKey(apiKey);
  const requireTenant =
    options.requireTenant ??
    (process.env.GBRAIN_REQUIRE_TENANT === "true" ||
      process.env.SIGMABRAIN_REQUIRE_TENANT === "true");
  const config = loadConfig() || { engine: "pglite" as const };
  const ctx = (req: Request) =>
    buildOperationContext(engine, {}, { remote: false, sourceId: requestSourceId(req) });

  // pages.source_id has a FK on sources(id) — lazily provision the source
  // row the first time a tenant writes. Cached per process.
  const ensuredSources = new Set<string>(["default"]);
  async function ensureSource(sourceId: string): Promise<void> {
    if (ensuredSources.has(sourceId)) return;
    await engine.executeRaw(
      `INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
      [sourceId]
    );
    ensuredSources.add(sourceId);
  }

  app.use("/api", guard);

  // Fail-closed tenant gate: in SaaS mode a missing/invalid tenant header
  // must NEVER silently widen to the all-seeing 'default' scope.
  if (requireTenant) {
    app.use("/api", (req: Request, res: Response, next: NextFunction) => {
      if (requestSourceId(req) === "default") {
        res.status(400).json({
          error: "tenant_required",
          message: "This deployment requires a valid x-sigmabrain-source tenant header.",
        });
        return;
      }
      next();
    });
    console.error("[web-api] fail-closed tenant mode active (GBRAIN_REQUIRE_TENANT)");
  }

  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const sourceId = requestSourceId(req);
      let mapped;
      if (sourceId === "default") {
        const raw = await engine.getStats();
        mapped = mapStats(raw as unknown as Record<string, unknown>);
      } else {
        // Tenant view: engine.getStats() is brain-global; compute the
        // source-scoped numbers directly so no cross-tenant counts leak.
        const [row] = await engine.executeRaw<{
          page_count: number;
          entity_count: number;
          link_count: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM pages WHERE source_id = $1 AND deleted_at IS NULL) as page_count,
             (SELECT count(*)::int FROM pages WHERE source_id = $1 AND deleted_at IS NULL
                AND type IN ('person','company','idea','event','place')) as entity_count,
             (SELECT count(*)::int FROM links l
                JOIN pages fp ON fp.id = l.from_page_id
               WHERE fp.source_id = $1) as link_count`,
          [sourceId]
        );
        mapped = mapStats({
          page_count: row?.page_count ?? 0,
          link_count: row?.link_count ?? 0,
          pages_by_type: {},
        });
        mapped.total_entities = row?.entity_count ?? 0;
      }
      if (sourceId === "default") {
        const [queriesToday] = await engine
          .executeRaw<{ count: number }>(
            `SELECT count(*)::int as count FROM mcp_request_log
           WHERE operation IN ('think', 'web_think', 'search', 'web_search')
             AND created_at > now() - interval '24 hours'`
          )
          .catch(() => [{ count: 0 }]);
        mapped.total_queries = queriesToday?.count ?? 0;
      }
      // Tenant view keeps total_queries at 0: mcp_request_log has no source
      // column, and a global count would leak cross-tenant activity volume.
      res.json(mapped);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(503).json({ error: "service_unavailable", message: msg });
    }
  });

  app.get("/api/search", async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? "");
      const limit = Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50);
      if (!q.trim()) {
        res.json([]);
        return;
      }
      // P0-SECR-002: Filter results by verified matter scope from signed identity token
      const scope = verifiedMatterScope(req, apiKey);
      const raw = await invokeOp(
        engine,
        "search",
        { query: q, limit },
        requestSourceId(req),
        readSourcesFor(req),
        scope
      );
      const filtered = filterByMatterScope(
        Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [],
        scope
      );
      res.json(mapSearchResults(filtered));
    } catch (e) {
      if (e instanceof OperationError && e.code === "identity_token_invalid") {
        res.status(403).json(e.toJSON());
        return;
      }
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "search_failed", message: msg });
    }
  });

  app.post("/api/think", express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const rawQuery = String(body?.query ?? body?.question ?? "");
    if (!rawQuery.trim()) {
      res.status(400).json({ error: "missing_query" });
      return;
    }

    // P0-SEC-001: Engine-side prompt sanitization — strip injection patterns
    // before the query enters the think pipeline. Direct callers (CLI, MCP)
    // bypass the web-app's sanitizeObjectStrings layer.
    const { sanitizeTakeForPrompt } = await import("../core/think/sanitize.ts");
    const { text: query } = sanitizeTakeForPrompt(rawQuery);

    const rawMode = String(body?.mode ?? "balanced");
    const searchMode = (["conservative", "balanced", "tokenmax"] as const).includes(
      rawMode as "conservative" | "balanced" | "tokenmax"
    )
      ? (rawMode as "conservative" | "balanced" | "tokenmax")
      : "balanced";

    const sourceId = requestSourceId(req);

    // Start SSE immediately so the browser can render the streaming response.
    // Headers must be set before any async work that could throw — if runThink
    // throws after headers are sent, we emit an SSE error event instead of
    // a JSON 500 (which would be silently ignored after headers are flushed).
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const { runThink } = await import("../core/think/index.ts");

      // P0-SECR-002: Parse verified matter scope from signed identity token.
      // WhatsApp callers receive this token after identity verification;
      // the engine verifies the HMAC signature before trusting the scope.
      const matterScope = verifiedMatterScope(req, apiKey);

      const result = await runThink(engine, {
        question: query,
        remote: false,
        sourceId,
        // Federate reads across the tenant's source + shared statute corpus so
        // the answer can retrieve and cite the actual law, not just the firm's docs.
        ...(readSourcesFor(req) ? { allowedSources: readSourcesFor(req) } : {}),
        searchMode,
        // Real-time token streaming: each text delta fires an SSE chunk event.
        onStreamChunk: (text) => {
          res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
        },
      });

      // P0-SECR-002: Filter citations by matter_scope — only include
      // citations whose slug falls within the caller's allowed matters.
      const allCitations = await enrichCitations(
        engine,
        result.citations ?? [],
        sourceId,
        readSourcesFor(req)
      );
      const citations = filterByMatterScope(allCitations, matterScope);
      const gaps =
        matterScope !== "all"
          ? (result.gaps ?? []).filter((g) => {
              const gSlug =
                typeof g === "object" && g !== null
                  ? ((g as Record<string, unknown>)?.slug as string | undefined)
                  : undefined;
              return !gSlug || matterScope.some((p) => gSlug.startsWith(p) || gSlug === p);
            })
          : (result.gaps ?? []);
      res.write(`data: ${JSON.stringify({ citations, gaps })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (res.headersSent) {
        // SSE already open — deliver error as a structured event then close.
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        res.status(500).json({ error: "think_failed", message: msg });
      }
    }
  });

  // Proactive issue-spotting over one uploaded document. The brain reads the
  // document and returns a structured brief (type, parties, dates, issues with
  // severity, relevant §§, next steps) — every issue grounded in a verbatim
  // quote, ungrounded ones dropped. Federates reads over the shared statute
  // corpus so the analysis can cite the actual law.
  app.post(
    "/api/legal/analyze",
    express.json({ limit: "256kb" }),
    async (req: Request, res: Response) => {
      try {
        const slug = String((req.body as Record<string, unknown>)?.slug ?? "");
        if (!slug) {
          res.status(400).json({ error: "missing_slug" });
          return;
        }
        const { analyzeDocument } = await import("../core/legal/analyze-document.ts");
        const federated = readSourcesFor(req);
        const analysis = await analyzeDocument(engine, {
          slug,
          sourceId: requestSourceId(req),
          ...(federated ? { sourceIds: federated } : {}),
        });
        res.json(analysis);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        const status = e instanceof EngineNotFoundError ? 404 : /not found/i.test(msg) ? 404 : 500;
        res.status(status).json({ error: "analyze_failed", message: msg });
      }
    }
  );

  // ── Legal assistant suite (document-review, summarize, memo, risk-analysis,
  //    contract-draft, contract-redline, due-diligence) ─────────────────────
  // Each is source-scoped (requestSourceId + federated readSourcesFor) and
  // backed by a core/legal/* module. The web app proxies to these 1:1.
  const legalScope = (req: Request) => {
    const federated = readSourcesFor(req);
    return {
      sourceId: requestSourceId(req),
      ...(federated ? { sourceIds: federated } : {}),
    } as { sourceId?: string; sourceIds?: string[] };
  };
  const legalErr = (res: Response, name: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof EngineNotFoundError ? 404 : /not found/i.test(msg) ? 404 : 500;
    res.status(status).json({ error: `${name}_failed`, message: msg });
  };

  app.post(
    "/api/legal/document-review",
    express.json({ limit: "512kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const slug = typeof b.document_slug === "string" ? b.document_slug : "";
        const text = typeof b.text === "string" ? b.text : "";
        if (!slug && !text.trim()) {
          res.status(400).json({ error: "document_slug_or_text_required" });
          return;
        }
        const { reviewDocument } = await import("../core/legal/document-review.ts");
        const result = await reviewDocument(engine, {
          ...legalScope(req),
          ...(slug ? { slug } : {}),
          ...(text ? { text } : {}),
          questions: Array.isArray(b.questions)
            ? (b.questions as unknown[]).filter((q): q is string => typeof q === "string")
            : [],
          focus: (["clauses", "risks", "compliance", "general"].includes(String(b.focus))
            ? b.focus
            : "general") as "clauses" | "risks" | "compliance" | "general",
          jurisdiction: typeof b.jurisdiction === "string" ? b.jurisdiction : "all",
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "document_review", e);
      }
    }
  );

  app.post(
    "/api/legal/summarize",
    express.json({ limit: "512kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const slug = typeof b.document_slug === "string" ? b.document_slug : "";
        const text = typeof b.text === "string" ? b.text : "";
        if (!slug && !text.trim()) {
          res.status(400).json({ error: "document_slug_or_text_required" });
          return;
        }
        const { summarizeDocument } = await import("../core/legal/summarize.ts");
        const result = await summarizeDocument(engine, {
          ...legalScope(req),
          ...(slug ? { slug } : {}),
          ...(text ? { text } : {}),
          type: (["document", "case", "judgement", "contract", "general"].includes(String(b.type))
            ? b.type
            : "general") as "document" | "case" | "judgement" | "contract" | "general",
          depth: (["brief", "standard", "detailed"].includes(String(b.depth))
            ? b.depth
            : "standard") as "brief" | "standard" | "detailed",
          ...(typeof b.focus === "string" ? { focus: b.focus } : {}),
          language: b.language === "en" ? "en" : "de",
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "summarize", e);
      }
    }
  );

  app.post(
    "/api/legal/memo",
    express.json({ limit: "256kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const question = typeof b.question === "string" ? b.question.trim() : "";
        const facts = typeof b.facts === "string" ? b.facts.trim() : "";
        const jurisdiction = String(b.jurisdiction);
        if (!question) {
          res.status(400).json({ error: "question_required" });
          return;
        }
        if (!facts) {
          res.status(400).json({ error: "facts_required" });
          return;
        }
        if (!["at", "de", "ch"].includes(jurisdiction)) {
          res.status(400).json({ error: "invalid_jurisdiction" });
          return;
        }
        const { generateMemo } = await import("../core/legal/memo.ts");
        const result = await generateMemo(engine, {
          ...legalScope(req),
          question,
          facts,
          jurisdiction: jurisdiction as "at" | "de" | "ch",
          ...(typeof b.legal_area === "string" ? { legal_area: b.legal_area } : {}),
          ...(typeof b.case_slug === "string" ? { case_slug: b.case_slug } : {}),
          language: b.language === "en" ? "en" : "de",
          depth: (["brief", "standard", "comprehensive"].includes(String(b.depth))
            ? b.depth
            : "standard") as "brief" | "standard" | "comprehensive",
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "memo", e);
      }
    }
  );

  app.post(
    "/api/legal/risk-analysis",
    express.json({ limit: "512kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const slug = typeof b.document_slug === "string" ? b.document_slug : "";
        const text = typeof b.text === "string" ? b.text : "";
        if (!slug && !text.trim()) {
          res.status(400).json({ error: "document_slug_or_text_required" });
          return;
        }
        const { analyzeRisk } = await import("../core/legal/risk-analysis.ts");
        const result = await analyzeRisk(engine, {
          ...legalScope(req),
          ...(slug ? { slug } : {}),
          ...(text ? { text } : {}),
          ...(typeof b.contract_type === "string" ? { contract_type: b.contract_type } : {}),
          jurisdiction: typeof b.jurisdiction === "string" ? b.jurisdiction : "all",
          perspective: (["party_a", "party_b", "neutral"].includes(String(b.perspective))
            ? b.perspective
            : "neutral") as "party_a" | "party_b" | "neutral",
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "risk_analysis", e);
      }
    }
  );

  app.post(
    "/api/legal/contract-draft",
    express.json({ limit: "256kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const type = typeof b.type === "string" ? b.type.trim() : "";
        const jurisdiction = String(b.jurisdiction);
        const parties =
          b.parties && typeof b.parties === "object" ? (b.parties as Record<string, string>) : null;
        if (!type) {
          res.status(400).json({ error: "type_required" });
          return;
        }
        if (!["at", "de", "ch"].includes(jurisdiction)) {
          res.status(400).json({ error: "invalid_jurisdiction" });
          return;
        }
        if (!parties?.a || !parties?.b) {
          res.status(400).json({ error: "parties_required" });
          return;
        }
        const { draftContract } = await import("../core/legal/contract-draft.ts");
        const result = await draftContract(engine, {
          ...legalScope(req),
          type,
          jurisdiction: jurisdiction as "at" | "de" | "ch",
          parties: { a: String(parties.a), b: String(parties.b) },
          ...(typeof b.instructions === "string" ? { instructions: b.instructions } : {}),
          ...(typeof b.template_slug === "string" ? { template_slug: b.template_slug } : {}),
          language: b.language === "en" ? "en" : "de",
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "contract_draft", e);
      }
    }
  );

  app.post(
    "/api/legal/contract-redline",
    express.json({ limit: "512kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const original_text = typeof b.original_text === "string" ? b.original_text : "";
        if (!original_text.trim()) {
          res.status(400).json({ error: "original_text_required" });
          return;
        }
        const { redlineContract } = await import("../core/legal/contract-redline.ts");
        const result = await redlineContract(engine, {
          ...legalScope(req),
          original_text,
          ...(typeof b.counterparty_text === "string"
            ? { counterparty_text: b.counterparty_text }
            : {}),
          ...(typeof b.playbook_slug === "string" ? { playbook_slug: b.playbook_slug } : {}),
          ...(typeof b.contract_type === "string" ? { contract_type: b.contract_type } : {}),
          jurisdiction: typeof b.jurisdiction === "string" ? b.jurisdiction : "all",
          perspective: (["client", "counterparty", "neutral"].includes(String(b.perspective))
            ? b.perspective
            : "client") as "client" | "counterparty" | "neutral",
          language: b.language === "en" ? "en" : "de",
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "contract_redline", e);
      }
    }
  );

  app.post(
    "/api/legal/due-diligence",
    express.json({ limit: "256kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const case_slug = typeof b.case_slug === "string" ? b.case_slug : "";
        const document_slugs = Array.isArray(b.document_slugs)
          ? (b.document_slugs as unknown[]).filter((s): s is string => typeof s === "string")
          : [];
        if (!case_slug && document_slugs.length === 0) {
          res.status(400).json({ error: "case_slug_or_document_slugs_required" });
          return;
        }
        const { runDueDiligence } = await import("../core/legal/due-diligence.ts");
        const result = await runDueDiligence(engine, {
          ...legalScope(req),
          ...(case_slug ? { case_slug } : {}),
          ...(document_slugs.length > 0 ? { document_slugs } : {}),
          category: (["m_and_a", "real_estate", "financing", "general"].includes(String(b.category))
            ? b.category
            : "general") as "m_and_a" | "real_estate" | "financing" | "general",
          jurisdiction: (["at", "de", "ch"].includes(String(b.jurisdiction))
            ? b.jurisdiction
            : "de") as "at" | "de" | "ch",
          ...(Array.isArray(b.checklist)
            ? {
                checklist: (b.checklist as unknown[]).filter(
                  (s): s is string => typeof s === "string"
                ),
              }
            : {}),
          language: b.language === "en" ? "en" : "de",
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "due_diligence", e);
      }
    }
  );

  // ── Legal Translation: jurisdiction-aware translation preserving legal
  //    terminology, statute references, and formatting. ──
  app.post(
    "/api/legal/translate",
    express.json({ limit: "512kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const slug = typeof b.document_slug === "string" ? b.document_slug : "";
        const text = typeof b.text === "string" ? b.text : "";
        const targetLang = typeof b.target_language === "string" ? b.target_language : "";
        if (!slug && !text.trim()) {
          res.status(400).json({ error: "document_slug_or_text_required" });
          return;
        }
        if (!targetLang) {
          res.status(400).json({ error: "target_language_required" });
          return;
        }
        const { translateDocument } = await import("../core/legal/translate.ts");
        const result = await translateDocument(engine, {
          ...legalScope(req),
          ...(slug ? { slug } : {}),
          ...(text ? { text } : {}),
          target_language: targetLang,
          ...(typeof b.source_language === "string" ? { source_language: b.source_language } : {}),
          legal_terminology: b.legal_terminology !== false,
          preserve_formatting: b.preserve_formatting !== false,
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "translate", e);
      }
    }
  );

  // ── Obligation Extraction: extract contractual obligations, deadlines,
  //    renewal triggers, payment terms, and notice periods from contracts. ──
  app.post(
    "/api/legal/obligation-extract",
    express.json({ limit: "512kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const slug = typeof b.document_slug === "string" ? b.document_slug : "";
        const text = typeof b.text === "string" ? b.text : "";
        if (!slug && !text.trim()) {
          res.status(400).json({ error: "document_slug_or_text_required" });
          return;
        }
        const { extractObligations } = await import("../core/legal/obligation-extract.ts");
        const result = await extractObligations(engine, {
          ...legalScope(req),
          ...(slug ? { slug } : {}),
          ...(text ? { text } : {}),
          ...(typeof b.jurisdiction === "string"
            ? { jurisdiction: b.jurisdiction as "at" | "de" | "ch" | "all" }
            : {}),
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "obligation_extract", e);
      }
    }
  );

  // ── Precedent Search: keyword + vector search over legal_case pages with
  //    legal-specific relevance scoring (area match, recency, outcome). ──
  app.post(
    "/api/legal/precedent-search",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const query = typeof b.query === "string" ? b.query.trim() : "";
        if (!query) {
          res.status(400).json({ error: "query_required" });
          return;
        }
        const result = await invokeOp(
          engine,
          "legal_precedent_search",
          {
            query,
            ...(typeof b.jurisdiction === "string" ? { jurisdiction: b.jurisdiction } : {}),
            ...(typeof b.legal_area === "string" ? { legal_area: b.legal_area } : {}),
            ...(typeof b.limit === "number" ? { limit: b.limit } : {}),
          },
          requestSourceId(req)
        );
        res.json(result);
      } catch (e) {
        legalErr(res, "precedent_search", e);
      }
    }
  );

  // ── P31-SB-001: Temporal Memory, Connector Coverage, Entity Resolution ──
  // These endpoints expose the engine-side Matter Context extensions that
  // complete the Kanzlei Superbrain / Legal Context Graph.

  // Temporal: mark a page as superseded by a newer version
  app.post(
    "/api/temporal/supersede",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const oldSlug = typeof b.old_slug === "string" ? b.old_slug : "";
        const newSlug = typeof b.new_slug === "string" ? b.new_slug : "";
        if (!oldSlug || !newSlug) {
          res.status(400).json({ error: "old_slug_and_new_slug_required" });
          return;
        }
        const { markSuperseded } = await import("../core/matter-scope.ts");
        await markSuperseded(engine, oldSlug, newSlug, requestSourceId(req));
        res.json({ success: true });
      } catch (e) {
        legalErr(res, "temporal_supersede", e);
      }
    }
  );

  // Temporal: mark a contradiction between two pages
  app.post(
    "/api/temporal/contradict",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const slugA = typeof b.slug_a === "string" ? b.slug_a : "";
        const slugB = typeof b.slug_b === "string" ? b.slug_b : "";
        if (!slugA || !slugB) {
          res.status(400).json({ error: "slug_a_and_slug_b_required" });
          return;
        }
        const { markContradiction } = await import("../core/matter-scope.ts");
        await markContradiction(engine, slugA, slugB, requestSourceId(req));
        res.json({ success: true });
      } catch (e) {
        legalErr(res, "temporal_contradict", e);
      }
    }
  );

  // Temporal: query temporal relations for a page
  app.get("/api/temporal/relations/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug ?? "");
      if (!slug) {
        res.status(400).json({ error: "slug_required" });
        return;
      }
      const { getTemporalRelations } = await import("../core/matter-scope.ts");
      const result = await getTemporalRelations(engine, slug, requestSourceId(req));
      res.json(result);
    } catch (e) {
      legalErr(res, "temporal_relations", e);
    }
  });

  // Connector Coverage: query which connectors have contributed pages for a case
  app.get("/api/connector-coverage/:caseSlug", async (req: Request, res: Response) => {
    try {
      const caseSlug = String(req.params.caseSlug ?? "");
      if (!caseSlug) {
        res.status(400).json({ error: "case_slug_required" });
        return;
      }
      const { getConnectorCoverage } = await import("../core/matter-scope.ts");
      const result = await getConnectorCoverage(engine, caseSlug, requestSourceId(req));
      res.json(result);
    } catch (e) {
      legalErr(res, "connector_coverage", e);
    }
  });

  // Entity Resolution: resolve an entity mention to a canonical slug
  app.post(
    "/api/entity/resolve",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const mention = typeof b.mention === "string" ? b.mention.trim() : "";
        if (!mention) {
          res.status(400).json({ error: "mention_required" });
          return;
        }
        const { resolveEntity } = await import("../core/matter-scope.ts");
        const result = await resolveEntity(engine, mention, requestSourceId(req));
        res.json(result);
      } catch (e) {
        legalErr(res, "entity_resolve", e);
      }
    }
  );

  // Entity Resolution: batch resolve multiple mentions
  app.post(
    "/api/entity/resolve-batch",
    express.json({ limit: "256kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const mentions = Array.isArray(b.mentions)
          ? b.mentions.filter((s): s is string => typeof s === "string")
          : [];
        if (mentions.length === 0) {
          res.status(400).json({ error: "mentions_required" });
          return;
        }
        const { resolveEntities } = await import("../core/matter-scope.ts");
        const result = await resolveEntities(engine, mentions, requestSourceId(req));
        res.json(result);
      } catch (e) {
        legalErr(res, "entity_resolve_batch", e);
      }
    }
  );

  app.get("/api/pages", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      const type = req.query.type ? String(req.query.type) : undefined;
      const tag = req.query.tag ? String(req.query.tag) : undefined;
      const raw = await invokeOp(
        engine,
        "list_pages",
        {
          limit,
          ...(type ? { type } : {}),
          ...(tag ? { tag } : {}),
          sort: "updated_desc",
          include_frontmatter: true,
        },
        requestSourceId(req)
      );
      const pages = (Array.isArray(raw) ? raw : []).map((p) => {
        const pg = p as Record<string, unknown>;
        const fm =
          pg.frontmatter && typeof pg.frontmatter === "object"
            ? (pg.frontmatter as Record<string, unknown>)
            : {};
        return {
          slug: String(pg.slug ?? ""),
          title: String(pg.title ?? pg.slug ?? ""),
          content: "",
          created_at: "",
          updated_at: String(pg.updated_at ?? ""),
          source: undefined,
          tags: Array.isArray(fm.tags) ? fm.tags : [],
          word_count: undefined,
          type: pg.type ? String(pg.type) : "document",
          frontmatter: fm,
        };
      });
      res.json(pages);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "list_pages_failed", message: msg });
    }
  });

  app.get("/api/pages/{*slug}", async (req: Request, res: Response) => {
    try {
      const slugParam = req.params.slug;
      const slug = Array.isArray(slugParam) ? slugParam.join("/") : String(slugParam ?? "");
      const pageRaw = await invokeOp(
        engine,
        "get_page",
        { slug },
        requestSourceId(req),
        readSourcesFor(req)
      );
      const page = pageRaw as Record<string, unknown>;
      const tags = Array.isArray(page.tags) ? (page.tags as string[]) : [];
      res.json(mapPage(page, tags));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const status =
        e instanceof EngineNotFoundError
          ? 404
          : msg.includes("not found") || msg.includes("page_not_found")
            ? 404
            : 500;
      res.status(status).json({ error: "get_page_failed", message: msg });
    }
  });

  // DSGVO Art. 20 (Datenübertragbarkeit): vollständiger Export aller Seiten
  // der Tenant-Source inkl. Volltext + Frontmatter + Tags. Streng auf die
  // anfragende Source gescopt — auch im lokalen 'default'-Modus.
  app.get("/api/export", async (req: Request, res: Response) => {
    try {
      const sourceId = requestSourceId(req);
      const rows = await engine.executeRaw<{
        slug: string;
        title: string;
        type: string;
        frontmatter: Record<string, unknown> | null;
        compiled_truth: string | null;
        timeline: string | null;
        created_at: string;
        updated_at: string;
        tags: string[] | null;
      }>(
        `SELECT p.slug, p.title, p.type, p.frontmatter, p.compiled_truth, p.timeline,
                p.created_at::text, p.updated_at::text,
                (SELECT array_agg(t.tag) FROM tags t WHERE t.page_id = p.id) as tags
         FROM pages p
         WHERE p.source_id = $1 AND p.deleted_at IS NULL
         ORDER BY p.slug
         LIMIT 10000`,
        [sourceId]
      );

      res.json({
        format: "sigmabrain-export-v1",
        exported_at: new Date().toISOString(),
        source: sourceId,
        page_count: rows.length,
        truncated: rows.length === 10000,
        pages: rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          type: r.type,
          frontmatter: r.frontmatter ?? {},
          content: r.compiled_truth ?? "",
          timeline: r.timeline ?? "",
          tags: r.tags ?? [],
          created_at: r.created_at,
          updated_at: r.updated_at,
        })),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "export_failed", message: msg });
    }
  });

  app.post("/api/pages", express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const slug = String(body.slug ?? "");
      if (!slug) {
        res.status(400).json({ error: "missing_slug" });
        return;
      }
      const title = body.title ? String(body.title) : undefined;
      const type = body.type ? String(body.type) : undefined;
      const bodyFrontmatter =
        body.frontmatter && typeof body.frontmatter === "object"
          ? (body.frontmatter as Record<string, unknown>)
          : {};
      const merge = body.merge === true;
      const sourceId = requestSourceId(req);
      // First write of a fresh tenant: pages.source_id has an FK on
      // sources(id) — provision the source row or the INSERT fails.
      await ensureSource(sourceId);

      // merge:true — partial update: load the existing page, overlay the
      // provided frontmatter keys, and keep the existing body when the
      // caller didn't send content. Without this, a metadata-only update
      // would wipe the page body (put_page replaces the whole page).
      let existingFrontmatter: Record<string, unknown> = {};
      let existingContent: string | undefined;
      let existingTitle: string | undefined;
      let existingType: string | undefined;
      if (merge) {
        try {
          const existingRaw = await invokeOp(engine, "get_page", { slug }, sourceId);
          const existing = existingRaw as Record<string, unknown>;
          if (existing && typeof existing === "object") {
            if (existing.frontmatter && typeof existing.frontmatter === "object") {
              existingFrontmatter = existing.frontmatter as Record<string, unknown>;
            }
            existingContent = String(existing.compiled_truth ?? existing.content ?? "");
            // type/title are table columns, NOT part of the returned
            // frontmatter (parseMarkdown strips them). Without re-injecting
            // them here, every merge update would reset the page type to the
            // slug-inferred default and the title to the slug — a legal_case
            // would silently become `concept` on its first time entry.
            if (typeof existing.title === "string" && existing.title)
              existingTitle = existing.title;
            if (typeof existing.type === "string" && existing.type) existingType = existing.type;
          }
        } catch {
          // page doesn't exist yet — merge degrades to create
        }
      }

      const content =
        body.content !== undefined && body.content !== null
          ? String(body.content)
          : (existingContent ?? "");

      // title/type are first-class page attributes — fold them into the
      // frontmatter so put_page's inference picks them up. Explicit body
      // values win over merged-in existing values.
      const frontmatter: Record<string, unknown> = {
        ...existingFrontmatter,
        ...bodyFrontmatter,
        ...(title ? { title } : existingTitle ? { title: existingTitle } : {}),
        ...(type ? { type } : existingType ? { type: existingType } : {}),
      };
      for (const key of Object.keys(frontmatter)) {
        if (frontmatter[key] === undefined || frontmatter[key] === null) delete frontmatter[key];
      }

      let markdown = content;
      if (Object.keys(frontmatter).length > 0) {
        // js-yaml handles quoting/escaping (colons, newlines, unicode) so
        // user-supplied values can't break out of the frontmatter block.
        const { dump } = await import("js-yaml");
        const yamlBlock = dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd();
        markdown = `---\n${yamlBlock}\n---\n\n${content}`;
      }

      const result = await invokeOp(engine, "put_page", { slug, content: markdown }, sourceId);
      res.json({ slug, success: true, ...(result && typeof result === "object" ? result : {}) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "put_page_failed", message: msg });
    }
  });

  app.get("/api/graph", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 500);
      const sourceId = requestSourceId(req);
      const rows = await engine.executeRaw<{
        from_slug: string;
        from_title: string;
        from_type: string;
        to_slug: string;
        to_title: string;
        to_type: string;
        link_type: string;
      }>(
        `SELECT
           fp.slug as from_slug, fp.title as from_title, fp.type as from_type,
           tp.slug as to_slug, tp.title as to_title, tp.type as to_type,
           l.link_type
         FROM links l
         JOIN pages fp ON fp.id = l.from_page_id AND fp.deleted_at IS NULL
         JOIN pages tp ON tp.id = l.to_page_id AND tp.deleted_at IS NULL
         WHERE fp.source_id = $2 AND tp.source_id = $2
         ORDER BY l.id DESC
         LIMIT $1`,
        [limit, sourceId]
      );

      const nodeMap = new Map<
        string,
        { id: string; name: string; type: string; connections: number }
      >();
      const links: Array<{ source: string; target: string; type: string }> = [];

      const entityTypes = new Set(["person", "company", "idea", "document", "event", "place"]);

      for (const row of rows) {
        for (const [slug, title, type] of [
          [row.from_slug, row.from_title, row.from_type],
          [row.to_slug, row.to_title, row.to_type],
        ] as const) {
          if (!nodeMap.has(slug)) {
            nodeMap.set(slug, {
              id: slug,
              name: title || slug.split("/").pop() || slug,
              type: entityTypes.has(type) ? type : "document",
              connections: 0,
            });
          }
        }
        links.push({ source: row.from_slug, target: row.to_slug, type: row.link_type });
        nodeMap.get(row.from_slug)!.connections += 1;
        nodeMap.get(row.to_slug)!.connections += 1;
      }

      res.json({ nodes: [...nodeMap.values()], links });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "graph_failed", message: msg });
    }
  });

  app.get("/api/queries/recent", async (req: Request, res: Response) => {
    try {
      // mcp_request_log has no source column — for tenant sources return
      // an empty list rather than leaking other tenants' query texts.
      if (requestSourceId(req) !== "default") {
        res.json([]);
        return;
      }
      const limit = Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50);
      const rows = await engine
        .executeRaw<{
          id: number;
          operation: string;
          params: Record<string, unknown> | string | null;
          created_at: string;
        }>(
          `SELECT id, operation, params, created_at::text
         FROM mcp_request_log
         WHERE operation IN ('think', 'web_think', 'search', 'web_search')
         ORDER BY created_at DESC
         LIMIT $1`,
          [limit]
        )
        .catch(() => []);

      const queries = rows.map((row) => {
        let queryText = "";
        const params =
          typeof row.params === "string"
            ? (() => {
                try {
                  return JSON.parse(row.params);
                } catch {
                  return {};
                }
              })()
            : (row.params ?? {});
        queryText = String(
          (params as Record<string, unknown>).query ??
            (params as Record<string, unknown>).question ??
            ((params as Record<string, unknown>).declared_keys as unknown[] | undefined)?.[0] ??
            row.operation
        );
        return {
          id: String(row.id),
          query: queryText,
          answer_preview: "",
          citations_count: 0,
          created_at: row.created_at,
        };
      });

      res.json(queries);
    } catch (e) {
      res.status(500).json({ error: "recent_queries_failed" });
    }
  });

  app.post(
    "/api/upload",
    express.raw({ type: () => true, limit: "50mb" }),
    async (req: Request, res: Response) => {
      try {
        const contentType = String(req.headers["content-type"] ?? "");
        if (!contentType.includes("multipart/form-data")) {
          res.status(400).json({ error: "expected_multipart" });
          return;
        }
        if (!Buffer.isBuffer(req.body)) {
          res.status(400).json({ error: "empty_body" });
          return;
        }

        const { fields, file } = parseMultipart(req.body, contentType);
        if (!file) {
          res.status(400).json({ error: "missing_file" });
          return;
        }

        const source = fields.source || "documents";
        const title = fields.title || undefined;
        let tagList: string[] = [];
        if (fields.tags) {
          try {
            const parsed = JSON.parse(fields.tags);
            tagList = Array.isArray(parsed)
              ? parsed.map(String)
              : fields.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);
          } catch {
            tagList = fields.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
        }

        const opCtx = ctx(req);
        const tenantSource = opCtx.sourceId ?? "default";
        await ensureSource(tenantSource);

        // Same embedding posture as put_page: skip embedding when no
        // provider is configured instead of failing the whole upload.
        const { isAvailable } = await import("../core/ai/gateway.ts");
        const noEmbed = !isAvailable("embedding");

        // beA-Export (XML): route through the beA parser so the message
        // becomes a structured bea_message page (sender, recipient, subject,
        // Aktenzeichen) in the TENANT's source — the directory-watcher
        // connector is install-global and unusable per tenant in SaaS mode.
        if (file.filename.toLowerCase().endsWith(".xml")) {
          try {
            const { BeaImportConnector } =
              await import("../core/ingestion/connectors/bea-import.ts");
            const connector = new BeaImportConnector({});
            const item = connector.parseBeaXmlContent(file.data.toString("utf8"), file.filename);
            if (item) {
              const event = await connector.toIngestionEvent(item);
              const beaSlug =
                String((event.metadata as Record<string, unknown> | undefined)?.slug ?? "") ||
                slugFromUpload(source, file.filename, title);
              await importFromContent(engine, beaSlug, event.content, {
                noEmbed,
                sourceId: tenantSource,
                filename: file.filename,
                source_kind: "web_upload",
                source_uri: `sigmabrain-upload:${beaSlug}`,
              });
              const beaPage = await engine.getPage(beaSlug, { sourceId: opCtx.sourceId });
              res.json({ slug: beaSlug, title: beaPage?.title ?? item.title });
              return;
            }
            // Not a beA export — fall through to generic document import.
          } catch (err) {
            console.error(
              `[web-api] beA XML parse failed, falling back to generic import: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        const slug = slugFromUpload(source, file.filename, title);
        const markdown = await buildMarkdownFromUpload(engine, file.filename, file.data, title);

        await importFromContent(engine, slug, markdown, {
          noEmbed,
          sourceId: tenantSource,
          filename: file.filename,
          source_kind: "web_upload",
          source_uri: `sigmabrain-upload:${slug}`,
        });

        if (tagList.length > 0) {
          for (const tag of tagList) {
            try {
              await invokeOp(engine, "add_tag", { slug, tag }, tenantSource);
            } catch {
              /* best effort */
            }
          }
        }

        const page = await engine.getPage(slug, { sourceId: opCtx.sourceId });
        res.json({
          slug,
          title: page?.title ?? title ?? slug.split("/").pop() ?? slug,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        // A recognized-but-unsupported format is a client problem, not a server
        // error — return 415 with the actionable guidance so the UI can show it.
        if (e instanceof UnsupportedUploadError) {
          res.status(415).json({ error: "unsupported_format", message: msg });
          return;
        }
        res.status(500).json({ error: "upload_failed", message: msg });
      }
    }
  );

  // ============================================================
  // v0.43 — Agent DAG API
  // ============================================================
  //
  // Tenant isolation: minion_jobs has no source_id column, so every job
  // submitted through this API is stamped with `data._source_id` and every
  // read/action filters on it. The supervisor handler propagates the stamp
  // to its children. `default` (local/admin, no tenant header) sees
  // everything — that matches the trusted-local posture of this module.

  /** SQL fragment + params for tenant scoping on minion_jobs.data. */
  function agentScopeClause(
    sourceId: string,
    paramOffset: number
  ): { clause: string; params: string[] } {
    if (sourceId === "default") return { clause: "", params: [] };
    return { clause: ` AND data->>'_source_id' = $${paramOffset}`, params: [sourceId] };
  }

  /** Returns true when the job exists AND belongs to the caller's tenant. */
  async function agentJobInScope(jobId: number, sourceId: string): Promise<boolean> {
    const scope = agentScopeClause(sourceId, 2);
    const rows = await engine.executeRaw<{ id: number }>(
      `SELECT id FROM minion_jobs
       WHERE id = $1 AND name IN ('subagent', 'subagent_aggregator', 'supervisor')${scope.clause}`,
      [jobId, ...scope.params]
    );
    return rows.length > 0;
  }

  app.get("/api/agents", async (req: Request, res: Response) => {
    try {
      const sourceId = requestSourceId(req);
      const scope = agentScopeClause(sourceId, 1);
      const rows = await engine.executeRaw<{
        id: number;
        name: string;
        status: string;
        queue: string;
        data: Record<string, unknown> | null;
        progress: Record<string, unknown> | null;
        tokens_input: number;
        tokens_output: number;
        tokens_cache_read: number;
        parent_job_id: number | null;
        created_at: string;
        started_at: string | null;
        finished_at: string | null;
        error_text: string | null;
      }>(
        `SELECT id, name, status, queue, data, progress,
                tokens_input, tokens_output, tokens_cache_read,
                parent_job_id, created_at::text, started_at::text, finished_at::text, error_text
         FROM minion_jobs
         WHERE name IN ('subagent', 'subagent_aggregator', 'supervisor')${scope.clause}
         ORDER BY created_at DESC
         LIMIT 200`,
        scope.params
      );

      const jobs = rows.map((row) => {
        const data = (row.data ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          name: row.name,
          status: row.status,
          queue: row.queue,
          prompt: String(data.prompt ?? ""),
          subagent_def: data.subagent_def ? String(data.subagent_def) : undefined,
          supervisor_model: data.supervisor_model ? String(data.supervisor_model) : undefined,
          model: data.model ? String(data.model) : undefined,
          progress: row.progress ?? undefined,
          tokens: {
            input: row.tokens_input,
            output: row.tokens_output,
            cache: row.tokens_cache_read,
          },
          parentId: row.parent_job_id ?? undefined,
          createdAt: row.created_at,
          startedAt: row.started_at ?? undefined,
          finishedAt: row.finished_at ?? undefined,
          error: row.error_text ?? undefined,
        };
      });

      res.json({ jobs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "agents_list_failed", message: msg });
    }
  });

  app.get("/api/agents/:id", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      const sourceId = requestSourceId(req);
      const scope = agentScopeClause(sourceId, 2);

      const [row] = await engine.executeRaw<{
        id: number;
        name: string;
        status: string;
        queue: string;
        data: Record<string, unknown> | null;
        progress: Record<string, unknown> | null;
        result: Record<string, unknown> | null;
        tokens_input: number;
        tokens_output: number;
        tokens_cache_read: number;
        parent_job_id: number | null;
        created_at: string;
        started_at: string | null;
        finished_at: string | null;
        error_text: string | null;
        stacktrace: string[];
      }>(
        `SELECT id, name, status, queue, data, progress, result,
                tokens_input, tokens_output, tokens_cache_read,
                parent_job_id, created_at::text, started_at::text, finished_at::text,
                error_text, stacktrace
         FROM minion_jobs
         WHERE id = $1 AND name IN ('subagent', 'subagent_aggregator', 'supervisor')${scope.clause}`,
        [jobId, ...scope.params]
      );

      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const data = (row.data ?? {}) as Record<string, unknown>;
      res.json({
        id: row.id,
        name: row.name,
        status: row.status,
        queue: row.queue,
        prompt: String(data.prompt ?? ""),
        subagent_def: data.subagent_def ? String(data.subagent_def) : undefined,
        supervisor_model: data.supervisor_model ? String(data.supervisor_model) : undefined,
        model: data.model ? String(data.model) : undefined,
        progress: row.progress ?? undefined,
        result: row.result ?? undefined,
        tokens: {
          input: row.tokens_input,
          output: row.tokens_output,
          cache: row.tokens_cache_read,
        },
        parentId: row.parent_job_id ?? undefined,
        createdAt: row.created_at,
        startedAt: row.started_at ?? undefined,
        finishedAt: row.finished_at ?? undefined,
        error: row.error_text ?? undefined,
        stacktrace: row.stacktrace,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "agent_get_failed", message: msg });
    }
  });

  app.post("/api/agents/:id/pause", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      if (!(await agentJobInScope(jobId, requestSourceId(req)))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const queue = new MinionQueue(engine);
      const job = await queue.pauseJob(jobId);
      res.json({ success: true, status: job?.status ?? "unknown" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "pause_failed", message: msg });
    }
  });

  app.post("/api/agents/:id/resume", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      if (!(await agentJobInScope(jobId, requestSourceId(req)))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const queue = new MinionQueue(engine);
      const job = await queue.resumeJob(jobId);
      res.json({ success: true, status: job?.status ?? "unknown" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "resume_failed", message: msg });
    }
  });

  app.post("/api/agents/:id/cancel", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      if (!(await agentJobInScope(jobId, requestSourceId(req)))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const queue = new MinionQueue(engine);
      const job = await queue.cancelJob(jobId);
      res.json({ success: true, status: job?.status ?? "unknown" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "cancel_failed", message: msg });
    }
  });

  app.post("/api/agents/:id/replay", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      if (!(await agentJobInScope(jobId, requestSourceId(req)))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const queue = new MinionQueue(engine);
      const job = await queue.replayJob(jobId);
      res.json({ success: true, newJobId: job?.id ?? null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "replay_failed", message: msg });
    }
  });

  app.post(
    "/api/agents/supervisor",
    express.json({ limit: "1mb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const rawPrompt = String(body.prompt ?? "");
        if (!rawPrompt.trim()) {
          res.status(400).json({ error: "missing_prompt" });
          return;
        }

        // P0-SEC-001: Engine-side prompt sanitization — strip injection patterns
        // before the prompt enters the agent pipeline. The web-app layer already
        // sanitizes via sanitizeObjectStrings in createEngineProxy, but direct
        // callers (CLI, MCP) bypass that path. This is the engine's last line
        // of defense against prompt injection.
        const { sanitizeTakeForPrompt } = await import("../core/think/sanitize.ts");
        const { text: sanitizedPrompt } = sanitizeTakeForPrompt(rawPrompt);

        const queue = new MinionQueue(engine);
        const sourceId = requestSourceId(req);
        // Tenant agents write into their source via brain tools — make sure
        // the source row exists before the first child put_page fires.
        await ensureSource(sourceId);
        const data: Record<string, unknown> = { prompt: sanitizedPrompt, _source_id: sourceId };
        if (body.supervisor_model) data.supervisor_model = String(body.supervisor_model);
        if (body.skip_critic) data.skip_critic = true;
        if (Array.isArray(body.force_specialists)) data.force_specialists = body.force_specialists;

        const job = await queue.add(
          "supervisor",
          data,
          {
            max_stalled: 3,
          },
          { allowProtectedSubmit: true }
        );

        res.json({ success: true, jobId: job.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        res.status(500).json({ error: "supervisor_submit_failed", message: msg });
      }
    }
  );

  // ============================================================
  // v0.43 — Agent Inbox API (bidirectional user ↔ agent messaging)
  // ============================================================

  /** GET /api/agents/:id/inbox — list all messages for a job.
   *  User-facing: does NOT mark messages as read (that is the worker's
   *  readInbox() fence). Ordered newest-last so the client appends. */
  app.get("/api/agents/:id/inbox", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      const sourceId = requestSourceId(req);
      if (!(await agentJobInScope(jobId, sourceId))) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const rows = await engine.executeRaw<{
        id: number;
        job_id: number;
        sender: string;
        payload: unknown;
        sent_at: string;
        read_at: string | null;
      }>(
        `SELECT id, job_id, sender, payload, sent_at::text, read_at::text
         FROM minion_inbox
         WHERE job_id = $1
         ORDER BY sent_at ASC`,
        [jobId]
      );

      res.json({
        messages: rows.map((r) => ({
          id: r.id,
          job_id: r.job_id,
          sender: r.sender,
          payload: r.payload,
          sent_at: r.sent_at,
          read_at: r.read_at,
        })),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "inbox_list_failed", message: msg });
    }
  });

  /** POST /api/agents/:id/inbox — send a message to a running job.
   *  The worker reads it via readInbox() on its next iteration. */
  app.post(
    "/api/agents/:id/inbox",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const jobId = parseInt(String(req.params.id), 10);
        if (isNaN(jobId) || jobId <= 0) {
          res.status(400).json({ error: "invalid_id" });
          return;
        }
        const sourceId = requestSourceId(req);
        if (!(await agentJobInScope(jobId, sourceId))) {
          res.status(404).json({ error: "not_found" });
          return;
        }

        const body = req.body as Record<string, unknown>;
        const payload = body.payload ?? body.message ?? body.text;
        if (payload == null) {
          res.status(400).json({ error: "missing_payload" });
          return;
        }

        const queue = new MinionQueue(engine);
        const msg = await queue.sendMessage(jobId, payload, "user");
        if (!msg) {
          res
            .status(409)
            .json({
              error: "job_not_messageable",
              message: "Job does not exist or is in a terminal state.",
            });
          return;
        }

        res.json({
          success: true,
          message: {
            id: msg.id,
            job_id: msg.job_id,
            sender: msg.sender,
            payload: msg.payload,
            sent_at: msg.sent_at instanceof Date ? msg.sent_at.toISOString() : msg.sent_at,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        res.status(500).json({ error: "inbox_send_failed", message: msg });
      }
    }
  );

  // ============================================================
  // v0.43 — Legal endpoints (Kollisionsprüfung, Judgements-Sync)
  // ============================================================

  // Anonymisierung (§ 203 StGB / § 43e BRAO): entfernt identifizierende Daten
  // aus einem Text, bevor er geteilt oder an ein Cloud-LLM gegeben wird.
  // Regex-Schicht läuft offline; Namens-Schicht nur, wenn ein Chat-Provider
  // konfiguriert ist (sonst regex-only, ehrlich im Flag llm_used gemeldet).
  app.post(
    "/api/legal/anonymize",
    express.json({ limit: "1mb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const text = String(body.text ?? "");
        if (!text.trim()) {
          res.status(400).json({ error: "missing_text" });
          return;
        }
        const types = Array.isArray(body.types) ? (body.types as string[]) : undefined;

        const { anonymizeText } = await import("../core/anonymize.ts");
        const { isAvailable, chat } = await import("../core/ai/gateway.ts");

        // LLM-Namensdetektor nur, wenn ein Chat-Provider verfügbar ist.
        const detectNames = isAvailable("chat")
          ? async (input: string) => {
              const result = await chat({
                system:
                  "Du extrahierst aus deutschem Rechtstext NUR Eigennamen von natürlichen Personen und " +
                  "Unternehmen/Organisationen. Antworte ausschließlich als JSON-Array von Objekten " +
                  '{"text": "<exakter Name im Text>", "type": "person"|"organization"}. Keine Gattungsbegriffe ' +
                  "(Kläger, Gericht, Mandant), keine Behörden-Gattungen. Wenn keine Namen: [].",
                messages: [{ role: "user", content: input.slice(0, 12000) }],
                maxTokens: 1500,
              });
              try {
                const m = result.text.match(/\[[\s\S]*\]/);
                const parsed = m ? JSON.parse(m[0]) : [];
                return (Array.isArray(parsed) ? parsed : [])
                  .filter(
                    (e) =>
                      e &&
                      typeof e.text === "string" &&
                      (e.type === "person" || e.type === "organization")
                  )
                  .map((e) => ({
                    text: String(e.text),
                    type: e.type as "person" | "organization",
                  }));
              } catch {
                return [];
              }
            }
          : undefined;

        const result = await anonymizeText(text, {
          types: types as never,
          detectNames,
        });

        res.json({
          anonymized: result.text,
          replacements: result.replacements,
          stats: result.stats,
          llm_used: result.llmUsed,
          count: result.replacements.length,
          disclaimer:
            "Automatische Anonymisierung ist ein Hilfsmittel und kann Treffer übersehen. Vor Weitergabe " +
            "an Dritte oder Cloud-Dienste manuell prüfen (§ 203 StGB).",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        res.status(500).json({ error: "anonymize_failed", message: msg });
      }
    }
  );

  // Tabular Review (Legora-Style): Zeilen = Dokumente, Spalten = Fragen, jede
  // Zelle mit Quellbezug. Effizient: EINE LLM-Anfrage pro Dokument beantwortet
  // alle Fragen gemeinsam (N statt N×M Calls). Streng source-gescoped.
  app.post(
    "/api/legal/tabular-review",
    express.json({ limit: "256kb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const questions = (Array.isArray(body.questions) ? body.questions : [])
          .map((q) => String(q).trim())
          .filter(Boolean)
          .slice(0, 8); // Spalten-Cap
        if (questions.length === 0) {
          res.status(400).json({ error: "missing_questions" });
          return;
        }
        const sourceId = requestSourceId(req);
        const explicitSlugs = Array.isArray(body.slugs) ? body.slugs.map((s) => String(s)) : null;
        const type = body.type ? String(body.type) : undefined;
        const limit = Math.min(Number(body.limit) || 25, 50); // Zeilen-Cap

        const { isAvailable, chat } = await import("../core/ai/gateway.ts");
        if (!isAvailable("chat")) {
          res.status(503).json({
            error: "llm_unavailable",
            message:
              "Tabular Review benötigt einen konfigurierten Chat-Provider (z. B. ANTHROPIC_API_KEY).",
          });
          return;
        }

        // 1. Dokumente auflösen.
        let docs: Array<{ slug: string; title: string }> = [];
        if (explicitSlugs && explicitSlugs.length > 0) {
          docs = explicitSlugs.slice(0, limit).map((s) => ({ slug: s, title: s }));
        } else {
          const raw = await invokeOp(
            engine,
            "list_pages",
            {
              limit,
              ...(type ? { type } : {}),
              sort: "updated_desc",
            },
            sourceId
          );
          docs = (Array.isArray(raw) ? raw : [])
            .map((p) => {
              const pg = p as Record<string, unknown>;
              return { slug: String(pg.slug ?? ""), title: String(pg.title ?? pg.slug ?? "") };
            })
            .filter((d) => d.slug);
        }
        const truncated = docs.length >= limit;

        // 2. Pro Dokument eine LLM-Anfrage über alle Fragen.
        const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
        const runOne = async (doc: { slug: string; title: string }) => {
          try {
            const pageRaw = await invokeOp(engine, "get_page", { slug: doc.slug }, sourceId);
            const page = pageRaw as Record<string, unknown>;
            const title = String(page.title ?? doc.title);
            const content = String(page.compiled_truth ?? page.content ?? "").slice(0, 16000);
            if (!content.trim()) {
              return {
                slug: doc.slug,
                title,
                cells: questions.map(() => ({ answer: "—", citations: [] })),
              };
            }
            const result = await chat({
              system:
                "Du beantwortest Fragen ausschließlich auf Basis des bereitgestellten Dokuments. " +
                'Antworte knapp und faktisch. Wenn das Dokument eine Frage nicht beantwortet, schreibe genau "nicht im Dokument". ' +
                "Antworte als JSON-Array von Strings, je ein Eintrag pro Frage in Reihenfolge.",
              messages: [
                {
                  role: "user",
                  content: `DOKUMENT "${title}":\n\n${content}\n\nFRAGEN:\n${numbered}`,
                },
              ],
              maxTokens: 1200,
            });
            let answers: string[] = [];
            try {
              const m = result.text.match(/\[[\s\S]*\]/);
              const parsed = m ? JSON.parse(m[0]) : [];
              answers = Array.isArray(parsed) ? parsed.map((a) => String(a)) : [];
            } catch {
              /* fällt unten auf '—' */
            }
            const cells = questions.map((_, i) => {
              const answer = answers[i] ?? "—";
              const grounded = answer && answer !== "—" && !/^nicht im dokument$/i.test(answer);
              return { answer, citations: grounded ? [{ slug: doc.slug, title }] : [] };
            });
            return { slug: doc.slug, title, cells };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "unknown";
            return {
              slug: doc.slug,
              title: doc.title,
              cells: questions.map(() => ({ answer: `Fehler: ${msg}`, citations: [] })),
            };
          }
        };

        // Concurrency-Limit 4, damit Rate-Limits/Pools nicht überlaufen.
        const rows: Array<{
          slug: string;
          title: string;
          cells: { answer: string; citations: { slug: string; title: string }[] }[];
        }> = [];
        const queue = [...docs];
        const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
          for (;;) {
            const doc = queue.shift();
            if (!doc) break;
            rows.push(await runOne(doc));
          }
        });
        await Promise.all(workers);
        // Reihenfolge wie die Eingangsliste (Worker laufen out-of-order).
        const order = new Map(docs.map((d, i) => [d.slug, i]));
        rows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));

        res.json({ questions, rows, document_count: rows.length, truncated });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        res.status(500).json({ error: "tabular_review_failed", message: msg });
      }
    }
  );

  // Kollisionsprüfung (§ 43a BRAO): scans EVERY legal_case page of the
  // tenant server-side — no client-side 200-row cap, no frontmatter
  // round-trip. Matching is case-insensitive substring (catches "Müller
  // GmbH" vs "Müller GmbH & Co. KG"); exact matches are flagged separately.
  app.post(
    "/api/legal/conflict-check",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const name = String((req.body as Record<string, unknown>).name ?? "").trim();
        if (!name) {
          res.status(400).json({ error: "missing_name" });
          return;
        }
        const sourceId = requestSourceId(req);
        const sourceClause = sourceId === "default" ? "" : `AND source_id = $2`;
        const params: string[] = sourceId === "default" ? [`%${name}%`] : [`%${name}%`, sourceId];

        const rows = await engine.executeRaw<{
          slug: string;
          title: string;
          client_name: string | null;
          opponent_name: string | null;
          status: string | null;
        }>(
          `SELECT slug, title,
                frontmatter->>'client_name' as client_name,
                frontmatter->>'opponent_name' as opponent_name,
                frontmatter->>'status' as status
         FROM pages
         WHERE type = 'legal_case' AND deleted_at IS NULL ${sourceClause}
           AND (frontmatter->>'client_name' ILIKE $1 OR frontmatter->>'opponent_name' ILIKE $1)
         ORDER BY updated_at DESC`,
          params
        );

        const lowerName = name.toLowerCase();
        const matches = rows.map((r) => {
          const clientMatch = (r.client_name ?? "").toLowerCase().includes(lowerName);
          const role: "client" | "opponent" = clientMatch ? "client" : "opponent";
          const matchedName = clientMatch ? (r.client_name ?? "") : (r.opponent_name ?? "");
          return {
            slug: r.slug,
            title: r.title,
            role,
            status: r.status ?? "open",
            matched_name: matchedName,
            exact: matchedName.toLowerCase() === lowerName,
          };
        });

        const asClient = matches.filter((m) => m.role === "client");
        const asOpponent = matches.filter((m) => m.role === "opponent");

        let severity: "critical" | "low" | "none";
        let explanation: string;
        if (asClient.length > 0 && asOpponent.length > 0) {
          severity = "critical";
          explanation = `"${name}" erscheint sowohl als Mandant als auch als Gegner in verschiedenen Akten. Direkter Interessenkonflikt gemäß § 43a Abs. 4 BRAO — anwaltlich prüfen.`;
        } else if (asClient.length > 1 || asOpponent.length > 1) {
          severity = "low";
          explanation =
            asClient.length > 1
              ? `"${name}" ist Mandant in ${asClient.length} Akten. Kein direkter Konflikt, aber auf gegensätzliche Interessen prüfen.`
              : `"${name}" ist Gegner in ${asOpponent.length} Akten. Kein direkter Konflikt, aber Wissensnutzung zwischen den Akten beachten.`;
        } else if (matches.length === 1) {
          severity = "none";
          explanation = `"${name}" ist in einer Akte bekannt (${matches[0]!.role === "client" ? "Mandant" : "Gegner"}). Kein Konflikt erkennbar.`;
        } else {
          severity = "none";
          explanation = `"${name}" ist in keiner Akte bekannt. Kein Konflikt im Brain erkennbar.`;
        }

        res.json({
          name,
          severity,
          explanation,
          matches,
          checked_cases: rows.length,
          disclaimer:
            "Diese Prüfung ersetzt nicht die anwaltliche Pflicht zur Kollisionsprüfung nach § 43a BRAO.",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        res.status(500).json({ error: "conflict_check_failed", message: msg });
      }
    }
  );

  // Rechtsprechungs-Sync: runs the legal-judgements connector inline and
  // writes the results into the caller's source. The cursor is persisted
  // per source so repeated syncs are deltas, not full re-imports.
  app.post(
    "/api/legal/judgements-sync",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const jurisdiction = ["at", "de", "all"].includes(String(body.jurisdiction))
          ? String(body.jurisdiction)
          : "all";
        const query = body.query ? String(body.query) : "";
        const sourceId = requestSourceId(req);
        await ensureSource(sourceId);

        const { LegalJudgementsConnector } =
          await import("../core/ingestion/connectors/legal-judgements.ts");
        const connector = new LegalJudgementsConnector({
          filters: {
            jurisdiction,
            query,
            // HTTP path stays responsive: cap the per-case full-text fetches.
            max_detail_fetches: "10",
          },
        });

        const cursorKey = `legal_judgements.cursor.${sourceId}.${jurisdiction}`;
        const cursor = (await engine.getConfig(cursorKey)) ?? undefined;
        const { items, nextCursor } = await connector.fetchDelta(cursor);

        let imported = 0;
        const errors: string[] = [];
        for (const item of items) {
          try {
            const event = await connector.toIngestionEvent(item);
            const slug = String(
              (event.metadata as Record<string, unknown> | undefined)?.slug ?? ""
            );
            if (!slug) continue;
            await invokeOp(engine, "put_page", { slug, content: event.content }, sourceId);
            imported++;
          } catch (e) {
            errors.push(e instanceof Error ? e.message : "unknown");
          }
        }

        if (nextCursor) await engine.setConfig(cursorKey, nextCursor);

        res.json({
          success: true,
          jurisdiction,
          fetched: items.length,
          imported,
          ...(errors.length > 0 ? { errors: errors.slice(0, 5) } : {}),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        res.status(500).json({ error: "judgements_sync_failed", message: msg });
      }
    }
  );

  // ============================================================
  // v0.43 — Connector API for the dashboard
  // ============================================================
  //
  // The admin server already exposes connector controls. The Vercel-hosted
  // dashboard talks to this web API instead, so expose a source-scoped,
  // non-secret status view plus safe lifecycle triggers here as well.

  app.get("/api/connectors", async (_req: Request, res: Response) => {
    try {
      const { ConnectorManager, SUPPORTED_CONNECTORS } =
        await import("../core/ingestion/connectors/manager.ts");
      const mgr = new ConnectorManager();
      const configured = await mgr.list();
      const enabled = await mgr.loadEnabled();
      const runningIds = new Set(enabled.map((c) => c.id));
      const configuredByService = new Map(configured.map((c) => [c.service, c]));

      const connectors = await Promise.all(
        SUPPORTED_CONNECTORS.map(async (service) => {
          const entry = configuredByService.get(service);
          return {
            service,
            configured: Boolean(entry),
            enabled: entry?.enabled ?? false,
            connected: entry ? runningIds.has(service) : false,
            hasCredentials: entry?.hasCredentials ?? false,
            last_sync_at: entry ? await mgr.getLastSync(service) : null,
          };
        })
      );

      res.json({ connectors });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "connectors_list_failed", message: msg });
    }
  });

  // ── Legal Case Scanner (Nacht-Agent-Cron) ─────────────────────
  app.post(
    "/api/legal/case-scanner",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const lookAhead = typeof body.look_ahead_days === "number" ? body.look_ahead_days : 7;
        const evidenceThreshold =
          typeof body.evidence_threshold === "number" ? body.evidence_threshold : 1;
        const maxCases = typeof body.max_cases === "number" ? body.max_cases : 50;

        const queue = new MinionQueue(engine);
        const sourceId = requestSourceId(req);

        const job = await queue.add(
          "legal-case-scanner",
          {
            look_ahead_days: lookAhead,
            evidence_threshold: evidenceThreshold,
            max_cases: maxCases,
            ...(sourceId ? { _source_id: sourceId } : {}),
          } as Record<string, unknown>,
          { timeout_ms: 300_000, max_attempts: 1 }
        );

        res.json({
          success: true,
          job_id: job.id,
          status: "queued",
          look_ahead_days: lookAhead,
          evidence_threshold: evidenceThreshold,
          max_cases: maxCases,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        res.status(500).json({ error: "case_scanner_failed", message: msg });
      }
    }
  );

  // Connector lifecycle is INSTALL-GLOBAL (writes land in the host source,
  // config lives in the host DB). In fail-closed tenant mode these actions
  // are host-operator-only — a tenant-scoped caller gets a clear 403 instead
  // of silently mutating shared state.
  const rejectConnectorActionsInTenantMode = (req: Request, res: Response): boolean => {
    if (!requireTenant) return false;
    res.status(403).json({
      error: "host_admin_only",
      message:
        "Connector-Verwaltung ist installationsweit und in Multi-Tenant-Deployments dem Host-Betreiber (CLI/Admin-Server) vorbehalten.",
    });
    return true;
  };

  app.post("/api/connectors/:service/sync", async (req: Request, res: Response) => {
    if (rejectConnectorActionsInTenantMode(req, res)) return;
    try {
      const service = String(req.params.service);
      const { ConnectorManager, SUPPORTED_CONNECTORS, CONNECTOR_REGISTRY } =
        await import("../core/ingestion/connectors/manager.ts");
      if (!SUPPORTED_CONNECTORS.includes(service)) {
        res
          .status(400)
          .json({ error: "unsupported_service", message: `Service "${service}" is not supported` });
        return;
      }

      const mgr = new ConnectorManager();
      const entries = await mgr.list();
      const entry = entries.find((e) => e.service === service);
      if (!entry) {
        res
          .status(404)
          .json({ error: "not_configured", message: `Connector "${service}" is not configured` });
        return;
      }
      if (!entry.enabled) {
        res.status(409).json({ error: "disabled", message: `Connector "${service}" is disabled` });
        return;
      }

      const config = (await mgr.getConfig(service)) ?? {};
      const Ctor = CONNECTOR_REGISTRY[service];
      if (!Ctor) {
        res.status(500).json({ error: "internal", message: "Connector registry inconsistency" });
        return;
      }

      const connector = new Ctor(config);
      void connector.sync().catch((err: unknown) => {
        console.error(
          `[web-api] Manual connector sync failed for ${service}: ${err instanceof Error ? err.message : String(err)}`
        );
      });

      res.json({ success: true, status: "sync_triggered", service });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "connector_sync_failed", message: msg });
    }
  });

  app.post("/api/connectors/:service/toggle", async (req: Request, res: Response) => {
    if (rejectConnectorActionsInTenantMode(req, res)) return;
    try {
      const service = String(req.params.service);
      const { ConnectorManager, SUPPORTED_CONNECTORS } =
        await import("../core/ingestion/connectors/manager.ts");
      if (!SUPPORTED_CONNECTORS.includes(service)) {
        res
          .status(400)
          .json({ error: "unsupported_service", message: `Service "${service}" is not supported` });
        return;
      }

      const mgr = new ConnectorManager();
      const entries = await mgr.list();
      const entry = entries.find((e) => e.service === service);
      if (!entry) {
        res
          .status(404)
          .json({ error: "not_configured", message: `Connector "${service}" is not configured` });
        return;
      }

      const nextEnabled = !entry.enabled;
      await mgr.setEnabled(service, nextEnabled);
      res.json({ success: true, service, enabled: nextEnabled });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "connector_toggle_failed", message: msg });
    }
  });

  console.error(
    `[web-api] Sigmabrain dashboard REST API mounted at /api/* (engine: ${config.engine})`
  );
}
