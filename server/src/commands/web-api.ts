/**
 * Subsumio Web Dashboard REST API.
 *
 * Thin HTTP layer over BrainEngine + operations for the Next.js product UI.
 * Mounted at /api/* by serve-http.ts. Intended for same-machine / trusted-proxy
 * use (default bind 127.0.0.1). Optional GBRAIN_WEB_API_KEY gates access.
 */

import express from "express";
import type { Application, Request, Response, NextFunction } from "express";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import { safeStringEqual } from "../core/timing-safe.ts";
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
  /** When set, require matching X-Subsumio-Api-Key or Authorization: Bearer header. */
  apiKey?: string;
  /**
   * Fail-closed multi-tenant mode (SaaS deployments). When true, every
   * request MUST carry a valid `x-subsumio-source` header naming a
   * non-default tenant source — requests without one are rejected with 400
   * instead of silently falling back to the all-seeing 'default' scope.
   * Enable via GBRAIN_REQUIRE_TENANT=true (or SUBSUMIO_REQUIRE_TENANT).
   */
  requireTenant?: boolean;
}

/** Resolve fail-closed SaaS tenant mode from the explicit option or env.
 * SUBSUMIO_REQUIRE_TENANT is the canonical deployment variable; the GBRAIN and
 * SIGMABRAIN names remain supported for existing self-hosted installations. */
export function tenantModeRequired(options: Pick<WebApiOptions, "requireTenant"> = {}): boolean {
  return (
    options.requireTenant ??
    (process.env.SUBSUMIO_REQUIRE_TENANT === "true" ||
      process.env.GBRAIN_REQUIRE_TENANT === "true" ||
      process.env.SIGMABRAIN_REQUIRE_TENANT === "true")
  );
}

/**
 * P0-SECR-002: Express Request augmentation for the verified matter scope.
 * Every /api request gets `matterScope` attached by the middleware below.
 * "all" = unrestricted; string[] = only pages under these slug prefixes.
 */
declare global {
  namespace Express {
    interface Request {
      matterScope?: string[] | "all";
      /**
       * Subsumio R3: Document-level ACL groups for this caller.
       * "all" / undefined = no ACL filtering (trusted admin).
       * string[] = only pages accessible to these group UUIDs.
       */
      aclGroups?: string[] | "all";
    }
  }
}

/**
 * Build a StorageConfig from environment variables.
 * Supports Cloudflare R2, Hetzner Object Storage, MinIO, or any S3-compatible backend.
 * Returns undefined when the required vars are not set (falls back to local disk).
 *
 * Required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Optional: R2_ENDPOINT (default: AWS S3), R2_REGION (default: auto)
 */
function storageConfigFromEnv(): import("../core/storage.ts").StorageConfig | undefined {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) return undefined;
  return {
    backend: "s3",
    bucket,
    accessKeyId,
    secretAccessKey,
    ...(process.env.R2_ENDPOINT ? { endpoint: process.env.R2_ENDPOINT } : {}),
    ...(process.env.R2_REGION ? { region: process.env.R2_REGION } : {}),
  };
}

/**
 * Max accepted upload size for the web /api/upload endpoint. Agency-level
 * deployments (self-hosted, no platform body cap) default to 1 GB. Override with
 * GBRAIN_MAX_UPLOAD_BYTES. The body is buffered once (parseMultipart works on
 * Buffer views, not copies), and the web client staggers large uploads (1-2 at a
 * time), so peak RAM stays ~one file in flight.
 */
function maxUploadBytes(): number {
  const raw = process.env.GBRAIN_MAX_UPLOAD_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1024 * 1024 * 1024;
}

/**
 * Persist the original upload bytes through the binary-storage SSOT
 * (`persistFileBuffer` → `files` table + StorageBackend). Best-effort: a storage
 * failure must not fail the upload, since the extracted markdown already landed.
 * Returns a result so the caller can surface persistence failures in the API
 * response — a silent GoBD-original loss is a compliance violation (§ 147 AO).
 */
interface PersistResult {
  ok: boolean;
  error?: string;
}

async function persistUploadBytes(
  file: { filename: string; data: Buffer; mimeType?: string },
  pageSlug: string,
  sourceId: string,
  storageConfig: unknown
): Promise<PersistResult> {
  try {
    const { persistFileBuffer } = await import("../core/file-store.ts");
    // Prefer caller-supplied config (from ctx.config.storage), then fall back
    // to env-var-driven S3 config (R2_ACCESS_KEY_ID etc.), then local disk.
    const effectiveConfig = storageConfig ?? storageConfigFromEnv();
    await persistFileBuffer({
      data: file.data,
      filename: file.filename,
      pageSlug,
      mimeType: file.mimeType,
      sourceId,
      storageConfig: effectiveConfig,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[web-api] original-file persistence failed for ${pageSlug}: ${msg}`);
    return { ok: false, error: msg };
  }
}

interface ParsedMultipart {
  fields: Record<string, string>;
  file?: { filename: string; data: Buffer; mimeType: string };
}

function requireWebApiKey(apiKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!apiKey) return next();
    const header =
      (req.headers["x-subsumio-api-key"] as string | undefined) ??
      (req.headers["x-sigmabrain-api-key"] as string | undefined) ??
      req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!header || !safeStringEqual(header, apiKey)) {
      res.status(401).json({ error: "unauthorized", message: "Invalid or missing API key" });
      return;
    }
    next();
  };
}

function parseMultipart(body: Buffer, contentType: string): ParsedMultipart {
  // RFC 2046: boundary can be quoted and followed by parameters.
  // Match: boundary="something" or boundary=something; charset=utf-8
  const boundaryMatch = contentType.match(/boundary=("([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) throw new Error("Missing multipart boundary");
  const boundary = (boundaryMatch[2] ?? boundaryMatch[3]).trim();
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, delimiter).filter(
    (p) => p.length > 2 && !p.slice(0, 4).equals(Buffer.from("--\r\n"))
  );

  const fields: Record<string, string> = {};
  let file: ParsedMultipart["file"];

  for (const part of parts) {
    // Skip the preamble (text before the first boundary) and the closing boundary.
    if (part.length === 0 || part.equals(Buffer.from("--\r\n"))) continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerBlock = part.slice(0, headerEnd).toString("utf8");
    let content = part.slice(headerEnd + 4);
    // RFC 2046: the content is followed by \r\n before the next boundary.
    if (content.slice(-2).equals(Buffer.from("\r\n"))) content = content.slice(0, -2);

    const disposition = headerBlock.match(/Content-Disposition:\s*([^\r\n]+)/i)?.[1] ?? "";
    const nameMatch = disposition.match(/name="([^"]+)"/);
    const name = nameMatch?.[1];
    if (!name) continue;

    // RFC 5987: filename*="UTF-8''Mietvertrag-M%C3%BCller.pdf" (non-ASCII filenames).
    // Prefer filename* over filename for correct Unicode handling.
    const filenameStarMatch = disposition.match(/filename\*="([^"]+)"/i);
    const filenameMatch = disposition.match(/filename="([^"]+)"/i);
    let filename: string | undefined;
    if (filenameStarMatch) {
      // RFC 5987 format: charset'language'value
      const raw = filenameStarMatch[1];
      const tickIdx = raw.indexOf("'");
      const tickIdx2 = tickIdx >= 0 ? raw.indexOf("'", tickIdx + 1) : -1;
      if (tickIdx2 >= 0) {
        filename = decodeURIComponent(raw.slice(tickIdx2 + 1));
      } else {
        filename = raw;
      }
    } else if (filenameMatch) {
      filename = filenameMatch[1];
    }

    const mimeType =
      headerBlock.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? "application/octet-stream";

    if (filename) {
      // Last file wins (matches browser behavior for multiple file inputs).
      file = { filename, data: content, mimeType };
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
  title?: string,
  extraFrontmatter: Record<string, unknown> = {}
): Promise<string> {
  const lower = filename.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  const t = title ?? filename.replace(/\.[^.]+$/, "");

  if (isDocumentFilePath(filename)) {
    const extracted = await extractDocumentText(data, ext, { filename });
    if (title) extracted.frontmatter.title = title;
    Object.assign(extracted.frontmatter, extraFrontmatter);
    return synthesizeDocumentMarkdown(filename, extracted);
  }

  // Images (photo/scan of a Schriftsatz): OCR to chattable text. Without this
  // the upload path read image bytes as UTF-8 → garbage. OCR output is tagged
  // unverified (recognized, not read verbatim).
  if (isImageFilePath(filename)) {
    const { text } = await ocrImageBuffer(engine, data, ext);
    if (text.trim()) {
      const body = withUnverifiedBanner(text, "ocr_vision");
      return withUploadFrontmatter(body, {
        title: t,
        type: "image",
        extraction_method: "ocr_vision",
        extraction_unverified: "true",
        ...extraFrontmatter,
      });
    }
    // OCR off/unavailable/empty: store an honest placeholder, never garbage.
    return withUploadFrontmatter(
      "> ⚠️ Bild gespeichert, aber kein Text erkannt (OCR deaktiviert oder kein lesbarer Text). Inhalt ist nicht durchsuchbar — ggf. als PDF mit Textebene erneut hochladen.\n",
      { title: t, type: "image", ...extraFrontmatter }
    );
  }

  if (ext === ".json") {
    const parsed = JSON.parse(data.toString("utf8"));
    const body = "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    return withUploadFrontmatter(body, { title: t, type: "document", ...extraFrontmatter });
  }

  if (UNSUPPORTED_UPLOAD_EXTS.has(ext)) {
    throw new UnsupportedUploadError(
      `Das Format ${ext} wird noch nicht direkt unterstützt. Bitte als PDF oder DOCX hochladen ` +
        `(ein Foto/Scan als JPG/PNG/HEIC geht ebenfalls — es wird per OCR ausgelesen).`
    );
  }

  const text = data.toString("utf8");
  if (text.startsWith("---")) return mergeUploadFrontmatter(text, extraFrontmatter);
  // Backstop: an unrecognized binary (no extension match, but NUL bytes) would
  // otherwise be stored as mojibake. Reject with the same actionable message.
  if (looksBinary(data)) {
    throw new UnsupportedUploadError(
      `Diese Datei ist kein Text und wird nicht unterstützt. Bitte als PDF oder DOCX hochladen ` +
        `(Foto/Scan als JPG/PNG/HEIC wird per OCR ausgelesen).`
    );
  }
  return withUploadFrontmatter(`${text}\n`, { title: t, type: "document", ...extraFrontmatter });
}

// ── Large Document Splitting ───────────────────────────────────────────
// When extracted text exceeds SPLIT_THRESHOLD bytes, we split it into
// multiple sub-pages (slug/part-001, slug/part-002, …). Each part gets
// its own chunks + embeddings, staying well under all size limits.
// A parent index page links all parts for unified retrieval.
const SPLIT_THRESHOLD = 4_000_000; // 4MB — safe margin below 50MB limits
const SPLIT_TARGET = 3_500_000; // Target ~3.5MB per part

interface SplitPart {
  slug: string;
  title: string;
  body: string;
  partIndex: number;
  partTotal: number;
}

/**
 * Split extracted text into parts at natural boundaries (###***### page
 * separators from PDF extraction, or paragraph boundaries). Each part is
 * roughly SPLIT_TARGET bytes. Returns [] when the text is small enough
 * to import as a single page.
 */
function splitExtractedText(text: string, baseSlug: string, baseTitle: string): SplitPart[] {
  const byteLength = Buffer.byteLength(text, "utf-8");
  if (byteLength <= SPLIT_THRESHOLD) return [];

  // PDF extraction uses ###***### as page separators
  const PAGE_SEP = "###***###";
  const segments = text
    .split(PAGE_SEP)
    .map((s) => s.trim())
    .filter(Boolean);

  // Group segments into parts of ~SPLIT_TARGET bytes
  const parts: SplitPart[] = [];
  let currentBody = "";
  let currentBytes = 0;

  for (const seg of segments) {
    const segBytes = Buffer.byteLength(seg, "utf-8");
    if (currentBytes + segBytes > SPLIT_TARGET && currentBody) {
      parts.push({ body: currentBody } as SplitPart);
      currentBody = "";
      currentBytes = 0;
    }
    currentBody += (currentBody ? "\n\n" + PAGE_SEP + "\n\n" : "") + seg;
    currentBytes += segBytes;
  }
  if (currentBody.trim()) parts.push({ body: currentBody } as SplitPart);

  // If splitting produced only 1 part (segments too large), force-split by chars
  if (parts.length <= 1) {
    parts.length = 0;
    const chunkSize = SPLIT_TARGET;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      if (chunk.trim()) parts.push({ body: chunk } as SplitPart);
    }
  }

  const total = parts.length;
  return parts.map((p, i) => ({
    slug: `${baseSlug}/part-${String(i + 1).padStart(3, "0")}`,
    title: `${baseTitle} (Teil ${i + 1}/${total})`,
    body: p.body,
    partIndex: i + 1,
    partTotal: total,
  }));
}

/**
 * Import a large document by splitting it into sub-pages. Each part gets
 * its own chunks + embeddings. A parent index page is created that links
 * all parts and contains a summary. Returns the parent slug.
 */
async function splitAndImportLargeDocument(
  engine: BrainEngine,
  slug: string,
  title: string,
  markdown: string,
  frontmatter: Record<string, unknown>,
  opts: {
    noEmbed?: boolean;
    sourceId: string;
    filename: string;
  }
): Promise<{ parentSlug: string; partSlugs: string[] }> {
  // Extract body from markdown (strip frontmatter)
  const closeIdx = markdown.indexOf("\n---", 3);
  const body =
    closeIdx === -1 ? markdown : markdown.slice(closeIdx + "\n---".length).replace(/^\s*\n/, "");

  const parts = splitExtractedText(body, slug, title);
  if (parts.length === 0) {
    // Not large enough to split — import as single page
    await importFromContent(engine, slug, markdown, {
      noEmbed: opts.noEmbed,
      sourceId: opts.sourceId,
      filename: opts.filename,
      source_kind: "web_upload",
      source_uri: `subsumio-upload:${slug}`,
    });
    return { parentSlug: slug, partSlugs: [] };
  }

  const partSlugs: string[] = [];
  for (const part of parts) {
    const partFrontmatter: Record<string, unknown> = {
      ...frontmatter,
      title: part.title,
      type: "document",
      part_of: slug,
      part_index: part.partIndex,
      part_total: part.partTotal,
    };
    const partMarkdown = await withUploadFrontmatter(part.body, partFrontmatter);
    await importFromContent(engine, part.slug, partMarkdown, {
      noEmbed: opts.noEmbed,
      sourceId: opts.sourceId,
      filename: opts.filename,
      source_kind: "web_upload",
      source_uri: `subsumio-upload:${part.slug}`,
    });
    partSlugs.push(part.slug);
  }

  // Create parent index page with links to all parts
  const indexBody = parts.map((p) => `- [[${p.slug}|${p.title}]]`).join("\n");
  const parentFrontmatter: Record<string, unknown> = {
    ...frontmatter,
    title,
    type: "document",
    is_split_parent: true,
    part_count: parts.length,
  };
  const parentMarkdown = await withUploadFrontmatter(
    `> 📄 Dieses Dokument wurde in ${parts.length} Teile aufgeteilt für optimale Durchsuchbarkeit.\n\n${indexBody}\n`,
    parentFrontmatter
  );
  await importFromContent(engine, slug, parentMarkdown, {
    noEmbed: opts.noEmbed,
    sourceId: opts.sourceId,
    filename: opts.filename,
    source_kind: "web_upload",
    source_uri: `subsumio-upload:${slug}`,
  });

  return { parentSlug: slug, partSlugs };
}

function cleanFrontmatter(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

async function dumpFrontmatter(frontmatter: Record<string, unknown>): Promise<string> {
  const { dump } = await import("js-yaml");
  return dump(cleanFrontmatter(frontmatter), { lineWidth: -1, noRefs: true }).trimEnd();
}

async function withUploadFrontmatter(
  body: string,
  frontmatter: Record<string, unknown>
): Promise<string> {
  const yamlBlock = await dumpFrontmatter(frontmatter);
  return `---\n${yamlBlock}\n---\n\n${body}`;
}

async function mergeUploadFrontmatter(
  markdown: string,
  extraFrontmatter: Record<string, unknown>
): Promise<string> {
  if (Object.keys(cleanFrontmatter(extraFrontmatter)).length === 0) return markdown;
  const close = markdown.indexOf("\n---", 3);
  if (close === -1) return withUploadFrontmatter(markdown, extraFrontmatter);

  const rawYaml = markdown.slice(3, close).trim();
  const body = markdown.slice(close + "\n---".length).replace(/^\s*\n/, "");
  let existing: Record<string, unknown> = {};
  try {
    const { load } = await import("js-yaml");
    const parsed = load(rawYaml);
    existing =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    existing = {};
  }
  return withUploadFrontmatter(body, { ...existing, ...extraFrontmatter });
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

function readCaseSlug(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const obj = record as Record<string, unknown>;
  if (typeof obj.case_slug === "string" && obj.case_slug.length > 0) {
    return obj.case_slug;
  }
  const frontmatter = obj.frontmatter;
  if (frontmatter && typeof frontmatter === "object") {
    const raw = (frontmatter as Record<string, unknown>).case_slug;
    if (typeof raw === "string" && raw.length > 0) return raw;
  }
  return undefined;
}

function mapSearchResults(results: Array<Record<string, unknown>>) {
  return results.map((r) => ({
    slug: String(r.slug ?? ""),
    title: String(r.title ?? r.slug ?? ""),
    snippet: String(r.chunk_text ?? r.snippet ?? "").slice(0, 300),
    score: Number(r.score ?? 0),
    source: r.source_id ? String(r.source_id) : undefined,
    case_slug: readCaseSlug(r),
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
 * forward the logged-in user's brainId as `x-subsumio-source` —
 * server-to-server, never from the browser. The engine still accepts the
 * legacy `x-sigmabrain-source` header for backward compatibility. Every
 * operation context and every raw query in this module scopes to the
 * resolved source; unknown/invalid headers fall back to 'default'
 * (single-tenant/self-hosted behavior unchanged).
 */
const SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Resolve the tenant source from the incoming request headers.
 *
 * Canonical header (Subsumio rebrand): `x-subsumio-source`.
 * Legacy header (pre-rebrand): `x-sigmabrain-source`.
 *
 * Accepting both prevents a silent source-scoping failure: the Next.js
 * dashboard proxies send `x-subsumio-source`, while older engines
 * only read `x-sigmabrain-source`. Without this fallback older dashboard
 * requests landed on the `default` source, breaking multi-tenant isolation.
 */
function requestSourceId(req: Request): string {
  const h = req.headers["x-subsumio-source"] ?? req.headers["x-sigmabrain-source"];
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
  const h = req.headers["x-subsumio-identity-token"] ?? req.headers["x-sigmabrain-identity-token"];
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
      "The x-subsumio-identity-token header was present but invalid, expired, or unverifiable. Refusing to fall back to unrestricted access."
    );
  }
  return result.scope;
}

/**
 * P0-SECR-002: Filter search/think results to only include pages whose slug
 * is exactly in scope or below an in-scope matter path. Empty arrays deny all:
 * callers with a verified-but-empty scope must not silently widen to "all".
 */
function isMatterScoped(
  scope: string[] | "all" | undefined,
  slug: string,
  caseSlug?: string
): boolean {
  if (scope === undefined || scope === "all") return true;
  if (scope.length === 0) return false;
  return scope.some((prefix) => {
    const matches = (candidate: string) =>
      candidate === prefix || candidate.startsWith(`${prefix}/`);
    return matches(slug) || (caseSlug !== undefined && matches(caseSlug));
  });
}

function filterByMatterScope<
  T extends { slug?: string; case_slug?: string; frontmatter?: Record<string, unknown> },
>(results: T[], scope: string[] | "all"): T[] {
  if (scope === "all") return results;
  if (scope.length === 0) return [];
  return results.filter((r) => {
    const slug = r.slug ?? "";
    const caseSlug = r.case_slug ?? readCaseSlug(r as Record<string, unknown>);
    return isMatterScoped(scope, slug, caseSlug);
  });
}

/**
 * P0-SECR-002: Fail-closed single-slug check. Throws a not-found style error
 * so callers cannot distinguish "does not exist" from "exists but out of scope".
 */
function assertMatterScope(
  scope: string[] | "all" | undefined,
  slug: string,
  caseSlug?: string
): void {
  if (!isMatterScoped(scope, slug, caseSlug)) {
    throw new EngineNotFoundError(
      `Page ${slug} is outside the caller's matter scope. This is intentionally indistinguishable from not found.`
    );
  }
}

/**
 * P0-SECR-002: Middleware that attaches the verified matter scope to every request.
 * Invalid identity tokens are rejected with 403; absent tokens default to "all".
 */
function matterScopeMiddleware(apiKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.matterScope = verifiedMatterScope(req, apiKey);
      next();
    } catch (e) {
      if (e instanceof OperationError) {
        res.status(403).json({ error: e.code, message: e.message });
        return;
      }
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "matter_scope_error", message: msg });
    }
  };
}

/**
 * Subsumio R3: Middleware that resolves the caller's document-level ACL groups.
 * Reads the user_id from the identity token, queries access_group_members for
 * the caller's source, and attaches the group UUIDs to req.aclGroups.
 * "all" = no ACL filtering (admin or no groups configured).
 */
export function aclGroupsMiddleware(engine: BrainEngine) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Admin role bypasses ACL filtering
      const h =
        req.headers["x-subsumio-identity-token"] ?? req.headers["x-sigmabrain-identity-token"];
      const token = Array.isArray(h) ? h[0] : h;
      if (!token || typeof token !== "string") {
        req.aclGroups = "all";
        next();
        return;
      }
      // Extract user_id from the verified token
      const apiKey = process.env.SUBSUMIO_WEB_API_KEY ?? process.env.SIGMABRAIN_WEB_API_KEY;
      if (!apiKey) {
        req.aclGroups = "all";
        next();
        return;
      }
      const { verifyIdentityToken } = await import("../core/identity-token.ts");
      const payload = verifyIdentityToken(token, apiKey);
      if (!payload || !payload.userId) {
        req.aclGroups = "all";
        next();
        return;
      }
      // Admin users get unrestricted access
      if (payload.role === "admin") {
        req.aclGroups = "all";
        next();
        return;
      }
      const sourceId = requestSourceId(req);
      const { getUserGroups } = await import("../core/acl.ts");
      const groupIds = await getUserGroups(engine, payload.userId, sourceId);
      req.aclGroups = groupIds.length > 0 ? groupIds : "all";
      next();
    } catch (e) {
      // Fail-closed: if ACL resolution fails, do NOT widen to "all".
      // Treating a broken ACL lookup as "no ACL filtering" would expose
      // restricted pages when the database is unreachable or the lookup throws.
      // The matter-scope middleware provides matter isolation, but ACL is a
      // separate document-level gate and must fail closed.
      const msg = e instanceof Error ? e.message : "acl_resolution_failed";
      console.error(`[aclGroupsMiddleware] ACL resolution failed: ${msg}`);
      res.status(500).json({
        error: "acl_resolution_failed",
        message: "Document access control could not be resolved.",
      });
      return;
    }
  };
}

/**
 * Shared, public, READ-ONLY reference sources every tenant may query alongside
 * their own (e.g. the statute corpus imported into `law-at`/`law-de`). Set via
 * `GBRAIN_SHARED_READ_SOURCES=law-at,law-de`. Empty by default → behaviour is
 * unchanged unless a deployment opts in. Statute text is public, so federating
 * it into reads is not a data-isolation concern; writes are unaffected.
 */
const SHARED_READ_SOURCES: string[] = (
  process.env.SUBSUMIO_SHARED_READ_SOURCES ??
  process.env.GBRAIN_SHARED_READ_SOURCES ??
  ""
)
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
  matterScope?: string[] | "all",
  aclGroups?: string[] | "all"
): Promise<unknown> {
  const result = await dispatchToolCall(engine, name, params, {
    remote: false,
    sourceId,
    ...(allowedSources ? { allowedSources } : {}),
    ...(matterScope ? { matterScope } : {}),
    ...(aclGroups ? { aclGroups } : {}),
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
 * Batch-fetch page titles + chunk-level passage data for a set of citation
 * slugs so citation pills in the UI show the real page title, a text snippet
 * from the actual chunk, and — for PDF documents — the page number in the
 * source PDF.
 *
 * Passage grounding (Harvey-parity): every citation carries the exact text
 * excerpt the LLM saw, plus a page_number when the source document was a
 * paginated PDF. The page number is derived from the `###***###` separator
 * pattern that extract-document.ts inserts between PDF pages.
 */
async function enrichCitations(
  engine: BrainEngine,
  citations: Array<{ page_slug: string; row_num?: number | null }>,
  sourceId: string,
  allowedSources?: string[]
): Promise<
  Array<{
    slug: string;
    title: string;
    quote: string;
    confidence: number;
    case_slug?: string;
    chunk_index?: number;
    page_number?: number;
    char_offset_start?: number;
    char_offset_end?: number;
  }>
> {
  if (citations.length === 0) return [];
  const slugs = [...new Set(citations.map((c) => c.page_slug))];
  // Match the federated read scope used for retrieval, so a cited statute page
  // in a shared source (law-at) resolves its title too — not just tenant pages.
  const scopes = allowedSources && allowedSources.length > 0 ? allowedSources : [sourceId];

  // Fetch page metadata (title, case_slug, frontmatter pages count, compiled_truth for page-derivation)
  const pageRows = await engine
    .executeRaw<{
      slug: string;
      title: string;
      case_slug?: string;
      page_count?: number;
      compiled_truth?: string;
    }>(
      `SELECT slug, title,
              frontmatter->>'case_slug' AS case_slug,
              (frontmatter->>'pages')::int AS page_count,
              compiled_truth
       FROM pages WHERE slug = ANY($1::text[])
       AND deleted_at IS NULL
       AND ($2::text[] @> ARRAY['default'] OR source_id = ANY($2::text[]))`,
      [slugs, scopes]
    )
    .catch(
      () =>
        [] as Array<{
          slug: string;
          title: string;
          case_slug?: string;
          page_count?: number;
          compiled_truth?: string;
        }>
    );

  const titleMap = new Map(pageRows.map((r) => [r.slug, r.title]));
  const caseSlugMap = new Map<string, string>();
  const pageCountMap = new Map<string, number>();
  const truthMap = new Map<string, string>();
  for (const row of pageRows) {
    if (typeof row.case_slug === "string" && row.case_slug.length > 0) {
      caseSlugMap.set(row.slug, row.case_slug);
    }
    if (typeof row.page_count === "number" && row.page_count > 0) {
      pageCountMap.set(row.slug, row.page_count);
    }
    if (typeof row.compiled_truth === "string" && row.compiled_truth.length > 0) {
      truthMap.set(row.slug, row.compiled_truth);
    }
  }

  // Fetch the best-matching chunk for each cited page so we have a real
  // text excerpt (passage) rather than an empty quote. We pick the chunk
  // with the highest chunk_index (closest to the cited passage) or chunk 0
  // as fallback. For take citations (row_num set), we don't have a chunk
  // equivalent — the quote comes from the take claim itself.
  const chunkRows = await engine
    .executeRaw<{
      page_slug: string;
      chunk_index: number;
      chunk_text: string;
    }>(
      `SELECT p.slug AS page_slug, cc.chunk_index, cc.chunk_text
       FROM content_chunks cc
       JOIN pages p ON p.id = cc.page_id
       WHERE p.slug = ANY($1::text[])
         AND p.deleted_at IS NULL
         AND ($2::text[] @> ARRAY['default'] OR p.source_id = ANY($2::text[]))
       ORDER BY p.slug, cc.chunk_index`,
      [slugs, scopes]
    )
    .catch(() => [] as Array<{ page_slug: string; chunk_index: number; chunk_text: string }>);

  // Build a map: slug → best chunk (first chunk = most representative)
  const chunkMap = new Map<string, { chunk_index: number; chunk_text: string }>();
  for (const cr of chunkRows) {
    if (!chunkMap.has(cr.page_slug)) {
      chunkMap.set(cr.page_slug, { chunk_index: cr.chunk_index, chunk_text: cr.chunk_text });
    }
  }

  return citations.map((c) => {
    const slug = c.page_slug;
    const title = titleMap.get(slug) ?? slug.split("/").pop() ?? slug;
    const chunk = chunkMap.get(slug);
    const truth = truthMap.get(slug);
    const pageCount = pageCountMap.get(slug);

    // Derive page_number from the chunk_text position within the compiled_truth.
    // The PDF extractor inserts `###***###` between pages. By counting how many
    // separators appear before the chunk_text's position in the full document,
    // we can determine which PDF page this chunk came from.
    let pageNumber: number | undefined;
    let charOffsetStart: number | undefined;
    let charOffsetEnd: number | undefined;
    let quote = "";

    if (chunk) {
      // Use up to 200 chars of the chunk as the passage quote
      quote = chunk.chunk_text.slice(0, 200).trim();

      if (truth && chunk.chunk_text.length > 20) {
        const offset = truth.indexOf(chunk.chunk_text.slice(0, 50));
        if (offset >= 0) {
          charOffsetStart = offset;
          charOffsetEnd = offset + chunk.chunk_text.length;

          // Count page separators before this offset to derive page number
          if (pageCount && pageCount > 1) {
            const PAGE_SEP = "###***###";
            const before = truth.slice(0, offset);
            const sepCount = before.split(PAGE_SEP).length - 1;
            pageNumber = sepCount + 1; // 1-based page number
          }
        }
      }
    }

    return {
      slug,
      title,
      quote,
      confidence: chunk ? 0.9 : 0.7,
      ...(caseSlugMap.has(slug) ? { case_slug: caseSlugMap.get(slug)! } : {}),
      ...(chunk ? { chunk_index: chunk.chunk_index } : {}),
      ...(pageNumber !== undefined ? { page_number: pageNumber } : {}),
      ...(charOffsetStart !== undefined ? { char_offset_start: charOffsetStart } : {}),
      ...(charOffsetEnd !== undefined ? { char_offset_end: charOffsetEnd } : {}),
    };
  });
}

// ── Direct-to-Engine Upload Token ──────────────────────────────────────
//
// When the web app runs on a platform with a body-size cap (Vercel: 4.5–100 MB),
// the browser uploads directly to the engine, bypassing the platform. The web
// app issues a short-lived signed token (HMAC-SHA256 with SUBSUMIO_INTERNAL_SECRET)
// that the engine validates without requiring the API key (which must never be
// exposed to the browser).
//
// Token format: base64url(JSON_payload).base64url(HMAC_signature)

interface UploadTokenPayload {
  brain_id: string;
  user_id: string;
  case_slug?: string;
  source: string;
  title?: string;
  tags?: string;
  exp: number; // Unix seconds
}

function signUploadToken(payload: UploadTokenPayload): string {
  const secret = process.env.SUBSUMIO_INTERNAL_SECRET ?? "";
  const data = Buffer.from(JSON.stringify(payload));
  const b64 = data.toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyUploadToken(token: string): UploadTokenPayload | null {
  const secret = process.env.SUBSUMIO_INTERNAL_SECRET ?? "";
  if (!secret || !token) return null;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const b64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", secret).update(b64).digest("base64url");
  // Timing-safe comparison
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return null;
  if (!cryptoTimingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString()) as UploadTokenPayload;
    if (Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── CORS for direct-to-engine browser uploads ──────────────────────────

function parseEngineCorsAllowlist(): Set<string> | null {
  const v = process.env.GBRAIN_HTTP_CORS_ORIGIN;
  if (!v) return null;
  return new Set(
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function engineCorsMiddleware(allowlist: Set<string> | null) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowlist && allowlist.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-upload-token");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

export function mountWebApi(app: Application, engine: BrainEngine, options: WebApiOptions = {}) {
  // SUBSUMIO_WEB_API_KEY is the canonical name (matches .env.example and the
  // signing key documented in identity-token.ts). The GBRAIN_/SIGMABRAIN_
  // variants are legacy fallbacks ONLY — a deployment that sets just
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
  const requireTenant = tenantModeRequired(options);
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

  // ── CORS for direct-to-engine browser uploads ────────────────────────
  // Applied BEFORE the guard so OPTIONS preflight doesn't get 401'd.
  const corsAllowlist = parseEngineCorsAllowlist();
  app.use("/api/direct-upload", engineCorsMiddleware(corsAllowlist));

  // ── Direct-to-Engine Upload ───────────────────────────────────────────
  // Bypasses the API key guard — authenticates via a short-lived signed
  // token issued by the web app. This lets the browser upload large files
  // directly to the engine, avoiding platform body-size caps (Vercel).
  // MUST be registered before app.use("/api", guard) so Express doesn't
  // run the API key middleware on this route.
  app.post(
    "/api/direct-upload",
    express.raw({ type: () => true, limit: maxUploadBytes() }),
    async (req: Request, res: Response) => {
      try {
        // Validate upload token
        const token = req.headers["x-upload-token"] as string | undefined;
        const payload = verifyUploadToken(token ?? "");
        if (!payload) {
          res.status(401).json({
            error: "invalid_upload_token",
            message: "Upload token is missing, expired, or invalid.",
          });
          return;
        }

        // Content-Length pre-check
        const declaredLength = parseInt(String(req.headers["content-length"] ?? "0"), 10);
        if (declaredLength > maxUploadBytes()) {
          res.status(413).json({
            error: "file_too_large",
            message: `Datei überschreitet das Limit von ${Math.round(maxUploadBytes() / 1024 / 1024 / 1024)} GB.`,
          });
          return;
        }

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

        // MIME-type allowlist (same as regular upload)
        const ALLOWED_ENGINE_MIMES = new Set([
          "application/pdf",
          "text/markdown",
          "text/plain",
          "text/html",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.oasis.opendocument.text",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.oasis.opendocument.spreadsheet",
          "application/rtf",
          "image/png",
          "image/jpeg",
          "image/tiff",
          "application/json",
          "application/xml",
          "application/octet-stream",
        ]);
        if (file.mimeType && !ALLOWED_ENGINE_MIMES.has(file.mimeType)) {
          res.status(415).json({
            error: "unsupported_file_type",
            message: `Dateityp ${file.mimeType} ist nicht erlaubt.`,
          });
          return;
        }

        // Use token payload for routing
        const source = payload.source || fields.source || "documents";
        const title = payload.title || fields.title || undefined;

        let tagList: string[] = [];
        if (payload.tags) {
          try {
            const parsed = JSON.parse(payload.tags);
            tagList = Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            tagList = [];
          }
        } else if (fields.tags) {
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

        // Use the brain_id from the token as the source (tenant scoping)
        const tenantSource = payload.brain_id;
        await ensureSource(tenantSource);

        const { isAvailable } = await import("../core/ai/gateway.ts");
        const noEmbed = !isAvailable("embedding");

        const opCtx = buildOperationContext(engine, {}, { remote: false, sourceId: tenantSource });

        // beA-Export (XML)
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
                source_uri: `subsumio-upload:${beaSlug}`,
              });
              const persistRes = await persistUploadBytes(
                file,
                beaSlug,
                tenantSource,
                opCtx.config.storage
              );
              const beaPage = await engine.getPage(beaSlug, { sourceId: tenantSource });
              const beaWebUrl = process.env.SUBSUMIO_WEB_URL?.replace(/\/$/, "");
              const beaInternalSecret = process.env.SUBSUMIO_INTERNAL_SECRET;
              if (beaWebUrl && beaInternalSecret) {
                setImmediate(() => {
                  fetch(`${beaWebUrl}/api/internal/post-upload`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-internal-secret": beaInternalSecret,
                    },
                    body: JSON.stringify({
                      doc_slug: beaSlug,
                      case_slug: payload.case_slug?.trim() || fields.case_slug?.trim() || undefined,
                      brain_id: tenantSource,
                      doc_title: beaPage?.title ?? item.title,
                      doc_size: file.data.byteLength,
                      uploaded_at: new Date().toISOString(),
                    }),
                    signal: AbortSignal.timeout(60_000),
                  }).catch((err) => {
                    console.error(
                      "[direct-upload] beA post-upload callback failed (non-fatal):",
                      err instanceof Error ? err.message : String(err)
                    );
                  });
                });
              }
              res.json({
                slug: beaSlug,
                title: beaPage?.title ?? item.title,
                original_persisted: persistRes.ok,
                ...(persistRes.ok ? {} : { persist_error: persistRes.error }),
              });
              return;
            }
          } catch (err) {
            console.error(
              `[direct-upload] beA XML parse failed, falling back to generic import: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        const slug = slugFromUpload(source, file.filename, title);
        const caseSlug = payload.case_slug?.trim() || fields.case_slug?.trim();

        const uploadFrontmatter: Record<string, unknown> = {
          source: "upload",
          source_format: extname(file.filename).replace(/^\./, "").toLowerCase() || undefined,
          uploaded_by: payload.user_id,
          upload_source: "direct",
          ...(caseSlug ? { case_slug: caseSlug, assignment_status: "assigned" } : {}),
        };
        const markdown = await buildMarkdownFromUpload(
          engine,
          file.filename,
          file.data,
          title,
          uploadFrontmatter
        );

        const { parentSlug, partSlugs } = await splitAndImportLargeDocument(
          engine,
          slug,
          title ?? file.filename.replace(/\.[^.]+$/, ""),
          markdown,
          uploadFrontmatter,
          { noEmbed, sourceId: tenantSource, filename: file.filename }
        );

        // Persist original bytes (GoBD § 147 AO)
        const persistRes = await persistUploadBytes(file, slug, tenantSource, opCtx.config.storage);

        // Stamp case_slug via invokeOp (same as regular upload route)
        if (caseSlug) {
          try {
            await invokeOp(
              engine,
              "put_page",
              {
                slug,
                frontmatter: { case_slug: caseSlug, assignment_status: "assigned" },
                merge: true,
              },
              tenantSource
            );
          } catch {
            /* best effort — the document is imported, stamping is enrichment */
          }
        }

        // Tag the page (and all parts if split)
        const allSlugs = [slug, ...partSlugs];
        if (tagList.length > 0) {
          for (const s of allSlugs) {
            for (const tag of tagList) {
              try {
                await invokeOp(engine, "add_tag", { slug: s, tag }, tenantSource);
              } catch {
                /* best effort */
              }
            }
          }
        }

        // ── v0.44: Auto-trigger Legal Agent Pipeline for large documents ──
        if (partSlugs.length > 0) {
          try {
            const { MinionQueue } = await import("../core/minions/queue.ts");
            const queue = new MinionQueue(engine);
            await queue.add(
              "legal-pipeline",
              {
                case_slug: slug,
                part_slugs: partSlugs,
                ...(tenantSource !== "default" ? { source_id: tenantSource } : {}),
                trigger: "post_upload",
              },
              { timeout_ms: 60 * 60 * 1000, max_attempts: 1 },
              { allowProtectedSubmit: true }
            );
          } catch (pipelineErr) {
            console.error(
              `[web-api] legal-pipeline auto-trigger failed for ${slug}: ` +
                (pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr))
            );
          }
        }

        const page = await engine.getPage(slug, { sourceId: tenantSource });

        // ── Post-upload callback to web app ──────────────────────────────
        // Fire reconcileCaseDocuments + contradiction probe on the web app
        // so direct uploads get the same bookkeeping as same-origin uploads.
        // Non-blocking: we send the response first, then fire the callback.
        const webUrl = process.env.SUBSUMIO_WEB_URL?.replace(/\/$/, "");
        const internalSecret = process.env.SUBSUMIO_INTERNAL_SECRET;
        if (webUrl && internalSecret) {
          setImmediate(() => {
            fetch(`${webUrl}/api/internal/post-upload`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-secret": internalSecret,
              },
              body: JSON.stringify({
                doc_slug: slug,
                case_slug: caseSlug || undefined,
                brain_id: tenantSource,
                doc_title: page?.title ?? title ?? slug.split("/").pop() ?? slug,
                doc_size: file.data.byteLength,
                uploaded_at: new Date().toISOString(),
              }),
              signal: AbortSignal.timeout(60_000),
            }).catch((err) => {
              console.error(
                "[direct-upload] post-upload callback failed (non-fatal):",
                err instanceof Error ? err.message : String(err)
              );
            });
          });
        }

        res.json({
          ok: true,
          slug,
          title: page?.title ?? title ?? slug.split("/").pop() ?? slug,
          original_persisted: persistRes.ok,
          ...(partSlugs.length > 0
            ? { split: true, part_count: partSlugs.length, part_slugs: partSlugs }
            : {}),
          ...(persistRes.ok ? {} : { persist_error: persistRes.error }),
        });
      } catch (err) {
        console.error("[direct-upload] error:", err instanceof Error ? err.message : String(err));
        res.status(500).json({ error: "upload_failed", message: "Upload fehlgeschlagen." });
      }
    }
  );

  // API key guard — applied AFTER the direct-upload route so that
  // direct uploads bypass API key auth (they use upload tokens instead).
  app.use("/api", guard);

  // Fail-closed tenant gate: in SaaS mode a missing/invalid tenant header
  // must NEVER silently widen to the all-seeing 'default' scope.
  if (requireTenant) {
    app.use("/api", (req: Request, res: Response, next: NextFunction) => {
      if (requestSourceId(req) === "default") {
        res.status(400).json({
          error: "tenant_required",
          message:
            "This deployment requires a valid x-subsumio-source (or legacy x-sigmabrain-source) tenant header.",
        });
        return;
      }
      next();
    });
    console.error("[web-api] fail-closed tenant mode active");
  }

  // P0-SECR-002: attach verified matter scope to every request. Invalid
  // identity tokens are rejected; absent tokens default to "all".
  app.use("/api", matterScopeMiddleware(apiKey));
  // Subsumio R3: resolve document-level ACL groups for every /api request.
  app.use("/api", aclGroupsMiddleware(engine));

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
      const scope = req.matterScope ?? "all";
      const aclGroups = req.aclGroups ?? "all";
      const raw = await invokeOp(
        engine,
        "search",
        { query: q, limit },
        requestSourceId(req),
        readSourcesFor(req),
        scope,
        aclGroups
      );
      const filtered = filterByMatterScope(
        Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [],
        scope
      );
      res.json(mapSearchResults(filtered));
    } catch (e) {
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

      // P0-SECR-002: Verified matter scope is attached by the global middleware.
      // It is also passed to runThink via its own options so retrieval can
      // reject out-of-scope pages before citations are even generated.
      const matterScope = req.matterScope ?? "all";
      const aclGroups = req.aclGroups ?? "all";

      const result = await runThink(engine, {
        question: query,
        remote: false,
        sourceId,
        // Federate reads across the tenant's source + shared statute corpus so
        // the answer can retrieve and cite the actual law, not just the firm's docs.
        ...(readSourcesFor(req) ? { allowedSources: readSourcesFor(req) } : {}),
        searchMode,
        matterScope,
        aclGroups,
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
              return !gSlug || isMatterScoped(matterScope, gSlug);
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
        const pageForScope = await engine.getPage(slug, { sourceId: requestSourceId(req) });
        assertMatterScope(req.matterScope, slug, readCaseSlug(pageForScope));
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
        if (slug) assertMatterScope(req.matterScope, slug);
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
        if (slug) assertMatterScope(req.matterScope, slug);
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
        if (typeof b.case_slug === "string" && b.case_slug) {
          assertMatterScope(req.matterScope, b.case_slug);
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
        if (slug) assertMatterScope(req.matterScope, slug);
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
        if (typeof b.template_slug === "string" && b.template_slug) {
          assertMatterScope(req.matterScope, b.template_slug);
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
        if (typeof b.playbook_slug === "string" && b.playbook_slug) {
          assertMatterScope(req.matterScope, b.playbook_slug);
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
        if (case_slug) assertMatterScope(req.matterScope, case_slug);
        for (const docSlug of document_slugs) assertMatterScope(req.matterScope, docSlug);
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
        if (slug) assertMatterScope(req.matterScope, slug);
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
        if (slug) assertMatterScope(req.matterScope, slug);
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
          requestSourceId(req),
          undefined,
          req.matterScope ?? "all",
          req.aclGroups ?? "all"
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
        assertMatterScope(req.matterScope, oldSlug);
        assertMatterScope(req.matterScope, newSlug);
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
        assertMatterScope(req.matterScope, slugA);
        assertMatterScope(req.matterScope, slugB);
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
      assertMatterScope(req.matterScope, slug);
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
      assertMatterScope(req.matterScope, caseSlug);
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
        const scope = req.matterScope ?? "all";
        const inScope = !result.resolved_slug || isMatterScoped(scope, result.resolved_slug);
        res.json(
          inScope ? result : { mention, resolved_slug: null, confidence: 0, entity_type: null }
        );
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
        const results = await resolveEntities(engine, mentions, requestSourceId(req));
        const scope = req.matterScope ?? "all";
        const scoped = results.map((r) => {
          if (!r.resolved_slug) return r;
          const inScope = isMatterScoped(scope, r.resolved_slug);
          return inScope
            ? r
            : { mention: r.mention, resolved_slug: null, confidence: 0, entity_type: null };
        });
        res.json(scoped);
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
        requestSourceId(req),
        undefined,
        req.matterScope ?? "all",
        req.aclGroups ?? "all"
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
        readSourcesFor(req),
        req.matterScope ?? "all",
        req.aclGroups ?? "all"
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

  // Download the ORIGINAL uploaded file (unaltered bytes) for a document page.
  // Tenant- and matter-scoped: a caller may only fetch files for cases inside
  // their matterScope, mirroring the upload-side confidentiality check.
  app.get("/api/files/{*slug}", async (req: Request, res: Response) => {
    try {
      const slugParam = req.params.slug;
      const slug = Array.isArray(slugParam) ? slugParam.join("/") : String(slugParam ?? "");
      if (!slug) {
        res.status(400).json({ error: "missing_slug" });
        return;
      }
      const pageForScope = await engine.getPage(slug, { sourceId: requestSourceId(req) });
      assertMatterScope(req.matterScope, slug, readCaseSlug(pageForScope));

      const { readStoredFile } = await import("../core/file-store.ts");
      const stored = await readStoredFile(slug, requestSourceId(req), ctx(req).config.storage);
      if (!stored) {
        res.status(404).json({ error: "file_not_found" });
        return;
      }

      res.setHeader("Content-Type", stored.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", String(stored.data.byteLength));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${stored.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`
      );
      res.end(stored.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      // Out-of-scope throws EngineNotFoundError — intentionally indistinguishable
      // from a missing file (don't reveal that the document exists).
      const status = e instanceof EngineNotFoundError ? 404 : 500;
      res.status(status).json({ error: "file_download_failed", message: msg });
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
        format: "subsumio-export-v1",
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
          const existingRaw = await invokeOp(
            engine,
            "get_page",
            { slug },
            sourceId,
            undefined,
            req.matterScope ?? "all",
            req.aclGroups ?? "all"
          );
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

      assertMatterScope(req.matterScope, slug);
      const result = await invokeOp(
        engine,
        "put_page",
        { slug, content: markdown },
        sourceId,
        undefined,
        req.matterScope ?? "all",
        req.aclGroups ?? "all"
      );
      res.json({ slug, success: true, ...(result && typeof result === "object" ? result : {}) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "put_page_failed", message: msg });
    }
  });

  // ── Subsumio R3: Document-Level ACL REST Endpoints ──

  // List all access groups for the tenant
  app.get("/api/acls/groups", async (req: Request, res: Response) => {
    try {
      const { listAccessGroups } = await import("../core/acl.ts");
      const groups = await listAccessGroups(engine, requestSourceId(req));
      res.json(groups);
    } catch (e) {
      res
        .status(500)
        .json({ error: "acl_list_failed", message: e instanceof Error ? e.message : "unknown" });
    }
  });

  // Create a new access group
  app.post(
    "/api/acls/groups",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const name = typeof b.name === "string" ? b.name.trim() : "";
        if (!name) {
          res.status(400).json({ error: "name_required" });
          return;
        }
        const { createAccessGroup } = await import("../core/acl.ts");
        const group = await createAccessGroup(engine, requestSourceId(req), name);
        res.json(group);
      } catch (e) {
        res.status(500).json({
          error: "acl_create_failed",
          message: e instanceof Error ? e.message : "unknown",
        });
      }
    }
  );

  // Delete an access group
  app.delete("/api/acls/groups/:groupId", async (req: Request, res: Response) => {
    try {
      const groupId = String(req.params.groupId ?? "");
      if (!groupId) {
        res.status(400).json({ error: "group_id_required" });
        return;
      }
      const { deleteAccessGroup } = await import("../core/acl.ts");
      const ok = await deleteAccessGroup(engine, groupId);
      res.json({ success: ok });
    } catch (e) {
      res
        .status(500)
        .json({ error: "acl_delete_failed", message: e instanceof Error ? e.message : "unknown" });
    }
  });

  // List members of a group
  app.get("/api/acls/groups/:groupId/members", async (req: Request, res: Response) => {
    try {
      const groupId = String(req.params.groupId ?? "");
      const { listGroupMembers } = await import("../core/acl.ts");
      const members = await listGroupMembers(engine, groupId);
      res.json(members);
    } catch (e) {
      res.status(500).json({
        error: "acl_list_members_failed",
        message: e instanceof Error ? e.message : "unknown",
      });
    }
  });

  // Add a member to a group
  app.post(
    "/api/acls/groups/:groupId/members",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const groupId = String(req.params.groupId ?? "");
        const b = req.body as Record<string, unknown>;
        const userId = typeof b.user_id === "string" ? b.user_id.trim() : "";
        if (!userId) {
          res.status(400).json({ error: "user_id_required" });
          return;
        }
        const { addGroupMember } = await import("../core/acl.ts");
        await addGroupMember(engine, groupId, userId, requestSourceId(req));
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({
          error: "acl_add_member_failed",
          message: e instanceof Error ? e.message : "unknown",
        });
      }
    }
  );

  // Remove a member from a group
  app.delete("/api/acls/groups/:groupId/members/:userId", async (req: Request, res: Response) => {
    try {
      const groupId = String(req.params.groupId ?? "");
      const userId = String(req.params.userId ?? "");
      const { removeGroupMember } = await import("../core/acl.ts");
      const ok = await removeGroupMember(engine, groupId, userId);
      res.json({ success: ok });
    } catch (e) {
      res.status(500).json({
        error: "acl_remove_member_failed",
        message: e instanceof Error ? e.message : "unknown",
      });
    }
  });

  // Get page permissions for a slug
  app.get("/api/acls/permissions/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug ?? "");
      assertMatterScope(req.matterScope, slug);
      const page = await engine.getPage(slug, { sourceId: requestSourceId(req) });
      if (!page) {
        res.status(404).json({ error: "page_not_found" });
        return;
      }
      const { getPagePermissions } = await import("../core/acl.ts");
      const permissions = await getPagePermissions(engine, page.id);
      res.json(permissions);
    } catch (e) {
      res.status(500).json({
        error: "acl_get_permissions_failed",
        message: e instanceof Error ? e.message : "unknown",
      });
    }
  });

  // Set a page permission
  app.post(
    "/api/acls/permissions",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const slug = typeof b.slug === "string" ? b.slug : "";
        const groupId = typeof b.group_id === "string" ? b.group_id : "";
        const permission = b.permission === "write" ? "write" : "read";
        if (!slug || !groupId) {
          res.status(400).json({ error: "slug_and_group_id_required" });
          return;
        }
        assertMatterScope(req.matterScope, slug);
        const page = await engine.getPage(slug, { sourceId: requestSourceId(req) });
        if (!page) {
          res.status(404).json({ error: "page_not_found" });
          return;
        }
        const { setPagePermission } = await import("../core/acl.ts");
        await setPagePermission(engine, page.id, groupId, permission as "read" | "write");
        res.json({ success: true, page_id: page.id, permission });
      } catch (e) {
        res.status(500).json({
          error: "acl_set_permission_failed",
          message: e instanceof Error ? e.message : "unknown",
        });
      }
    }
  );

  // Remove a page permission
  app.delete("/api/acls/permissions/:slug/:groupId", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug ?? "");
      const groupId = String(req.params.groupId ?? "");
      assertMatterScope(req.matterScope, slug);
      const page = await engine.getPage(slug, { sourceId: requestSourceId(req) });
      if (!page) {
        res.status(404).json({ error: "page_not_found" });
        return;
      }
      const { removePagePermission } = await import("../core/acl.ts");
      const ok = await removePagePermission(engine, page.id, groupId);
      res.json({ success: ok });
    } catch (e) {
      res.status(500).json({
        error: "acl_remove_permission_failed",
        message: e instanceof Error ? e.message : "unknown",
      });
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
    express.raw({ type: () => true, limit: maxUploadBytes() }),
    async (req: Request, res: Response) => {
      try {
        // Pre-check Content-Length before the body is fully buffered by
        // express.raw. This rejects oversized requests early (413) instead of
        // wasting RAM buffering a body that will be rejected anyway.
        const declaredLength = parseInt(String(req.headers["content-length"] ?? "0"), 10);
        if (declaredLength > maxUploadBytes()) {
          res.status(413).json({
            error: "file_too_large",
            message: `Datei überschreitet das Limit von ${Math.round(maxUploadBytes() / 1024 / 1024 / 1024)} GB.`,
          });
          return;
        }

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

        // Defense-in-depth: validate MIME type on the engine side too, so a
        // direct caller bypassing the web layer can't inject arbitrary MIME
        // types. Aligned with the web-layer allowlist in upload-validation.ts.
        const ALLOWED_ENGINE_MIMES = new Set([
          "application/pdf",
          "text/markdown",
          "text/plain",
          "text/html",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.oasis.opendocument.text",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.oasis.opendocument.spreadsheet",
          "application/rtf",
          "image/png",
          "image/jpeg",
          "image/tiff",
          "application/json",
          "application/xml",
          "application/octet-stream",
        ]);
        if (file.mimeType && !ALLOWED_ENGINE_MIMES.has(file.mimeType)) {
          res.status(415).json({
            error: "unsupported_file_type",
            message: `Dateityp ${file.mimeType} ist nicht erlaubt.`,
          });
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
                source_uri: `subsumio-upload:${beaSlug}`,
              });
              const persistRes = await persistUploadBytes(
                file,
                beaSlug,
                tenantSource,
                opCtx.config.storage
              );
              assertMatterScope(req.matterScope, beaSlug);
              const beaPage = await engine.getPage(beaSlug, { sourceId: opCtx.sourceId });
              res.json({
                slug: beaSlug,
                title: beaPage?.title ?? item.title,
                original_persisted: persistRes.ok,
                ...(persistRes.ok ? {} : { persist_error: persistRes.error }),
              });
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

        // P0-SECR-002: case uploads require the caller to be scoped to the target case.
        const caseSlug = fields.case_slug?.trim();
        if (caseSlug) assertMatterScope(req.matterScope, caseSlug);

        const uploadFrontmatter: Record<string, unknown> = {
          source: "upload",
          source_format: extname(file.filename).replace(/^\./, "").toLowerCase() || undefined,
          ...(caseSlug ? { case_slug: caseSlug, assignment_status: "assigned" } : {}),
        };
        const markdown = await buildMarkdownFromUpload(
          engine,
          file.filename,
          file.data,
          title,
          uploadFrontmatter
        );

        const { parentSlug, partSlugs } = await splitAndImportLargeDocument(
          engine,
          slug,
          title ?? file.filename.replace(/\.[^.]+$/, ""),
          markdown,
          uploadFrontmatter,
          { noEmbed, sourceId: tenantSource, filename: file.filename }
        );

        // Persist the ORIGINAL bytes via the binary-storage SSOT so the document
        // can be downloaded unaltered later (§ 147 AO / GoBD). Best-effort: the
        // extracted markdown is the searchable record; byte retention is additive.
        // The result is surfaced in the response so the caller knows if the
        // original was retained — a silent GoBD loss is a compliance violation.
        const persistRes = await persistUploadBytes(file, slug, tenantSource, opCtx.config.storage);

        // Defense-in-depth: case_slug is already part of the initial markdown
        // import above. This merge keeps older engine versions/routes aligned
        // if they imported before atomic upload frontmatter existed.
        if (caseSlug) {
          for (const s of [slug, ...partSlugs]) {
            try {
              await invokeOp(
                engine,
                "put_page",
                {
                  slug: s,
                  frontmatter: { case_slug: caseSlug, assignment_status: "assigned" },
                  merge: true,
                },
                tenantSource,
                undefined,
                req.matterScope ?? "all",
                req.aclGroups ?? "all"
              );
            } catch {
              /* best effort — the document is imported, stamping is enrichment */
            }
          }
        }

        // Tag the page (and all parts if split)
        const allSlugs = [slug, ...partSlugs];
        if (tagList.length > 0) {
          for (const s of allSlugs) {
            for (const tag of tagList) {
              try {
                await invokeOp(
                  engine,
                  "add_tag",
                  { slug: s, tag },
                  tenantSource,
                  undefined,
                  req.matterScope ?? "all",
                  req.aclGroups ?? "all"
                );
              } catch {
                /* best effort */
              }
            }
          }
        }

        // ── v0.44: Auto-trigger Legal Agent Pipeline for large documents ──
        // When a document is split into parts (large PDF), automatically
        // submit a legal-pipeline job to process the case file through the
        // 6-layer agent pipeline (ON-Scanner → Entity → Forensic → Damage
        // → Drafter → Critic). Best-effort: if queue submission fails, the
        // upload itself still succeeds.
        if (partSlugs.length > 0) {
          try {
            const { MinionQueue } = await import("../core/minions/queue.ts");
            const queue = new MinionQueue(engine);
            await queue.add(
              "legal-pipeline",
              {
                case_slug: slug,
                part_slugs: partSlugs,
                ...(tenantSource !== "default" ? { source_id: tenantSource } : {}),
                trigger: "post_upload",
              },
              { timeout_ms: 60 * 60 * 1000, max_attempts: 1 },
              { allowProtectedSubmit: true }
            );
          } catch (pipelineErr) {
            console.error(
              `[web-api] legal-pipeline auto-trigger failed for ${slug}: ` +
                (pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr))
            );
          }
        }

        assertMatterScope(req.matterScope, slug);
        const page = await engine.getPage(slug, { sourceId: opCtx.sourceId });
        res.json({
          slug,
          title: page?.title ?? title ?? slug.split("/").pop() ?? slug,
          original_persisted: persistRes.ok,
          ...(partSlugs.length > 0
            ? { split: true, part_count: partSlugs.length, part_slugs: partSlugs }
            : {}),
          ...(persistRes.ok ? {} : { persist_error: persistRes.error }),
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
  // v0.44 — Legal Agent Pipeline Trigger API
  // ============================================================
  // Exposes MinionQueue.add("legal-pipeline", ...) via HTTP so the
  // Next.js web app can trigger the 6-layer pipeline from the dashboard.
  // The upload flow already triggers it in-process (lines ~1401, ~2993);
  // this endpoint covers the manual-trigger and resume-from-layer cases.

  app.post(
    "/api/legal-pipeline/trigger",
    express.json({ limit: "1mb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const caseSlug = String(body.case_slug ?? "");
        if (!caseSlug) {
          res.status(400).json({ error: "missing_case_slug", message: "case_slug is required" });
          return;
        }

        // If part_slugs not provided, fetch from case page frontmatter
        let partSlugs = Array.isArray(body.part_slugs)
          ? (body.part_slugs as string[]).filter((s) => typeof s === "string" && s.length > 0)
          : [];

        if (partSlugs.length === 0 && !body.resume_from_layer) {
          const sourceId = requestSourceId(req);
          const casePage = await engine.getPage(
            caseSlug,
            sourceId !== "default" ? { sourceId } : undefined
          );
          if (casePage) {
            const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
            const documents = (fm.documents as Array<Record<string, unknown>>) ?? [];
            partSlugs = documents.map((d) => String(d.slug ?? "")).filter(Boolean);
          }
        }

        if (partSlugs.length === 0 && !body.resume_from_layer) {
          res.status(400).json({
            error: "no_documents",
            message: "No part_slugs provided and case has no documents.",
          });
          return;
        }

        const pipelineData: Record<string, unknown> = {
          case_slug: caseSlug,
          part_slugs: partSlugs,
          _source_id: requestSourceId(req),
        };

        if (typeof body.resume_from_layer === "number" && body.resume_from_layer >= 3) {
          pipelineData.resume_from_layer = body.resume_from_layer;
        }

        if (
          body.manual_overrides &&
          typeof body.manual_overrides === "object" &&
          !Array.isArray(body.manual_overrides)
        ) {
          pipelineData.manual_overrides = body.manual_overrides;
        }

        const queue = new MinionQueue(engine);
        const job = await queue.add("legal-pipeline", pipelineData);

        res.json({ success: true, job_id: job.id, status: "queued" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[legal-pipeline/trigger] error:", msg);
        res.status(500).json({ error: "trigger_failed", message: msg });
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

        // Pass through budget_remaining_cents (in cents) so the supervisor
        // handler can enforce it via setOwnerBudget. Without this, the cap
        // sent by callers (e.g. cron/rundown) was silently ignored.
        const budgetCents =
          typeof body.budget_remaining_cents === "number" && body.budget_remaining_cents > 0
            ? body.budget_remaining_cents
            : undefined;

        const job = await queue.add(
          "supervisor",
          data,
          {
            max_stalled: 3,
          },
          { allowProtectedSubmit: true }
        );

        // Set the spendable balance on the owner job row so subagent
        // reserveBudget() calls will actually check against it.
        if (budgetCents !== undefined) {
          const { setOwnerBudget } = await import("../core/minions/budget-tracker.ts");
          await setOwnerBudget(engine, job.id, budgetCents / 100);
        }

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
          res.status(409).json({
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
          for (const s of explicitSlugs.slice(0, limit)) assertMatterScope(req.matterScope, s);
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
            sourceId,
            undefined,
            req.matterScope ?? "all",
            req.aclGroups ?? "all"
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
            const pageRaw = await invokeOp(
              engine,
              "get_page",
              { slug: doc.slug },
              sourceId,
              undefined,
              req.matterScope ?? "all",
              req.aclGroups ?? "all"
            );
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

  // Deep Analysis (G2: Vault Deep Analysis): Bulk narrative report across
  // multiple Vault documents. Reads all specified documents and produces a
  // cohesive report with cross-document insights, themes, and risks — every
  // claim grounded with verbatim citations. Source-scoped.
  app.post(
    "/api/legal/deep-analysis",
    express.json({ limit: "256kb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const slugs = (Array.isArray(body.slugs) ? body.slugs : [])
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, 25);
        if (slugs.length === 0) {
          res
            .status(400)
            .json({ error: "missing_slugs", message: "At least one document slug is required." });
          return;
        }
        for (const s of slugs) assertMatterScope(req.matterScope, s);
        const prompt = typeof body.prompt === "string" ? body.prompt : "";
        const jurisdiction = typeof body.jurisdiction === "string" ? body.jurisdiction : "all";

        const { deepAnalysis } = await import("../core/legal/deep-analysis.ts");
        const result = await deepAnalysis(engine, {
          slugs,
          ...legalScope(req),
          ...(prompt ? { prompt } : {}),
          jurisdiction,
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "deep_analysis", e);
      }
    }
  );

  // Contract Portfolio Insights (G3+G7): Cross-contract analytics with
  // clause frequencies, outlier detection, risk distribution, obligation
  // summary, and negotiation patterns. Source-scoped.
  app.get("/api/legal/portfolio-insights", async (req: Request, res: Response) => {
    try {
      const daysBack = Math.min(Number(req.query?.daysBack) || 180, 365);
      const { portfolioInsights } = await import("../core/legal/portfolio-insights.ts");
      const result = await portfolioInsights(engine, {
        ...legalScope(req),
        daysBack,
      });
      res.json(result);
    } catch (e) {
      legalErr(res, "portfolio_insights", e);
    }
  });

  // Adoption Analytics (G4: Command Center equivalent): Usage analytics
  // aggregated from the engine's request log. Shows who's using the platform,
  // what features they use, and how usage trends over time. Admin-only.
  app.get("/api/analytics/adoption", async (req: Request, res: Response) => {
    try {
      const daysBack = Math.min(Number(req.query?.daysBack) || 30, 365);
      const { adoptionAnalytics } = await import("../core/legal/adoption-analytics.ts");
      const result = await adoptionAnalytics(engine, {
        ...legalScope(req),
        daysBack,
      });
      res.json(result);
    } catch (e) {
      legalErr(res, "adoption_analytics", e);
    }
  });

  // Auto-Playbook Updates (G6): Automatically extract negotiated clause
  // positions from executed contracts and update playbooks. Stages updates
  // as pending by default; auto_apply=true applies directly.
  app.post(
    "/api/legal/auto-playbook",
    express.json({ limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const contractSlug = String(body.contract_slug ?? "").trim();
        if (!contractSlug) {
          res.status(400).json({ error: "missing_contract_slug" });
          return;
        }
        assertMatterScope(req.matterScope, contractSlug);
        const playbookSlug =
          typeof body.playbook_slug === "string" ? body.playbook_slug : undefined;
        const autoApply = body.auto_apply === true;

        const { autoPlaybookUpdate } = await import("../core/legal/auto-playbook.ts");
        const result = await autoPlaybookUpdate(engine, {
          contract_slug: contractSlug,
          ...(playbookSlug ? { playbook_slug: playbookSlug } : {}),
          auto_apply: autoApply,
          ...legalScope(req),
        });
        res.json(result);
      } catch (e) {
        legalErr(res, "auto_playbook", e);
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
            await invokeOp(
              engine,
              "put_page",
              { slug, content: event.content },
              sourceId,
              undefined,
              req.matterScope ?? "all",
              req.aclGroups ?? "all"
            );
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

  // ============================================================
  // Law corpus sync: import bundled statutes into shared sources
  // ============================================================
  //
  // This is a host-admin operation: it mutates the shared read sources
  // (law-de, law-at, law-ch) that every tenant federates into search. In
  // multi-tenant mode it is intentionally restricted to the default/no-tenant
  // caller so tenants cannot pollute each other's shared corpus.
  //
  // Callers: the dashboard cron at /api/cron/law-sync, or manual CLI/admin use.

  const rejectSharedSourceActionInTenantMode = (req: Request, res: Response): boolean => {
    if (!requireTenant) return false;
    if (requestSourceId(req) === "default") return false;
    res.status(403).json({
      error: "host_admin_only",
      message:
        "Rechtsquellen-Synchronisation ist installationsweit und in Multi-Tenant-Deployments dem Host-Betreiber vorbehalten.",
    });
    return true;
  };

  const LAW_CORPUS_DIR = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "law-corpus"
  );
  const LAW_SOURCE_MAP: Record<string, string> = {
    de: "law-de",
    at: "law-at",
    ch: "law-ch",
    eu: "law-eu",
  };

  async function ensureSharedSource(sourceId: string): Promise<void> {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config)
       VALUES ($1, $1, '{"federated": true}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [sourceId]
    );
  }

  async function syncLawCorpus(): Promise<{
    success: boolean;
    sources: Record<string, { files: number; imported: number; skipped: number; errors: number }>;
    error?: string;
  }> {
    const result: Record<
      string,
      { files: number; imported: number; skipped: number; errors: number }
    > = {};
    const { isAvailable } = await import("../core/ai/gateway.ts");
    const noEmbed = !isAvailable("embedding");

    for (const [dir, sourceId] of Object.entries(LAW_SOURCE_MAP)) {
      const dirPath = join(LAW_CORPUS_DIR, dir);
      result[sourceId] = { files: 0, imported: 0, skipped: 0, errors: 0 };

      try {
        statSync(dirPath);
      } catch {
        continue;
      }

      await ensureSharedSource(sourceId);

      let files: string[];
      try {
        files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
      } catch {
        continue;
      }

      result[sourceId].files = files.length;
      for (const file of files) {
        const filePath = join(dirPath, file);
        const slug = `statutes/${dir}/${file.replace(/\.md$/, "")}`;
        try {
          const content = readFileSync(filePath, "utf8");
          const importResult = await importFromContent(engine, slug, content, {
            noEmbed,
            sourceId,
            sourcePath: `law-corpus/${dir}/${file}`,
            source_kind: "law_corpus",
            source_uri: `file://${filePath}`,
            ingested_via: "law_sync",
          });
          if (importResult.status === "imported") {
            result[sourceId].imported++;
          } else {
            result[sourceId].skipped++;
          }
        } catch (e) {
          result[sourceId].errors++;
          console.error(
            `[law-sync] failed to import ${filePath}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }

    return { success: true, sources: result };
  }

  app.post("/api/admin/law-sync", async (req: Request, res: Response) => {
    if (rejectSharedSourceActionInTenantMode(req, res)) return;
    try {
      const summary = await syncLawCorpus();
      res.json(summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "law_sync_failed", message: msg });
    }
  });

  app.post("/api/admin/dream", async (req: Request, res: Response) => {
    try {
      const { runDream } = await import("../commands/dream.ts");
      const report = await runDream(engine, ["--json"]);
      res.json(report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "dream_failed", message: msg });
    }
  });

  app.post("/api/admin/contradiction-probe", async (req: Request, res: Response) => {
    try {
      const { runEvalSuspectedContradictions } =
        await import("../commands/eval-suspected-contradictions.ts");
      const body = (req.body ?? {}) as {
        budget_usd?: number;
        top_k?: number;
        limit?: number;
        doc_type?: string;
      };
      const args = [
        "run",
        "--json",
        "--yes",
        "--budget-usd",
        String(body.budget_usd ?? 0.5),
        "--top-k",
        String(body.top_k ?? 5),
        "--limit",
        String(body.limit ?? 20),
      ];
      if (body.doc_type) {
        args.push("--doc-type", body.doc_type);
      }
      await runEvalSuspectedContradictions(engine, args);
      res.json({ status: "ok", message: "contradiction probe completed" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      res.status(500).json({ error: "contradiction_probe_failed", message: msg });
    }
  });

  console.error(
    `[web-api] Subsumio dashboard REST API mounted at /api/* (engine: ${config.engine})`
  );
}
