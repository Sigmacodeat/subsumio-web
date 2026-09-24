/**
 * Security headers for routes that stream user-uploaded files back from the
 * app origin (original documents, portal/data-room downloads, DAV bridge).
 *
 * Uploaded bytes carry a client-declared Content-Type, so a file must never
 * render as an active document (HTML, SVG, XML, …) on the app origin. Rules:
 *
 *  - Inline rendering is allowed ONLY for a fixed allowlist of passive types
 *    (PDF + raster images). Everything else is forced to `attachment`, even
 *    when the caller asked for `inline`.
 *  - `X-Content-Type-Options: nosniff` always — the browser must honour the
 *    declared type and never upgrade e.g. a mislabelled "PDF" to HTML.
 *  - A restrictive CSP always:
 *      * attachments and images: `sandbox; default-src 'none'` (images get
 *        `img-src 'self'` + inline styles for the browser's image viewer).
 *      * PDFs: NO `sandbox` and no fetch-directive lockdown — Chromium's
 *        built-in PDF viewer refuses to load inside a sandboxed document and
 *        is blocked by `object-src 'none'`. A PDF served as
 *        `application/pdf` + nosniff is handed to the PDF viewer (whose own
 *        scripting is isolated from the page origin), never parsed as HTML,
 *        so only `frame-ancestors 'self'` is set to prevent cross-site
 *        framing. The in-app viewer uses pdf.js via fetch and is unaffected.
 */

/** MIME types that may be rendered inline (exact match on the essence). */
export const SAFE_INLINE_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const ATTACHMENT_CSP = "sandbox; default-src 'none'";
export const IMAGE_INLINE_CSP =
  "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
export const PDF_INLINE_CSP = "frame-ancestors 'self'";

/** Lower-cased MIME essence without parameters ("Text/HTML; charset=x" → "text/html"). */
export function mimeEssence(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

export function isSafeInlineMime(contentType: string | null | undefined): boolean {
  return SAFE_INLINE_MIME_TYPES.has(mimeEssence(contentType));
}

/**
 * Rewrite (or synthesize) a Content-Disposition with the given disposition
 * type, keeping any filename parameters from the upstream header.
 */
function withDisposition(
  upstream: string | null | undefined,
  type: "inline" | "attachment"
): string {
  const cd = (upstream ?? "").trim();
  if (!cd) return type;
  if (/^(inline|attachment)\b/i.test(cd)) return cd.replace(/^(inline|attachment)\b/i, type);
  // Parameters without a disposition type ("filename=...") — prepend one.
  if (/^[a-z*-]+\s*=/i.test(cd)) return `${type}; ${cd}`;
  return type;
}

/**
 * Apply Content-Type, Content-Disposition, nosniff and CSP to `headers` for a
 * user-uploaded file. `wantInline` is the caller's request; it is honoured
 * only for {@link SAFE_INLINE_MIME_TYPES}. Returns whether the response is
 * served inline.
 */
export function applyUploadedFileHeaders(
  headers: Headers,
  opts: {
    contentType: string | null | undefined;
    contentDisposition?: string | null;
    wantInline: boolean;
  }
): { inline: boolean } {
  const contentType = opts.contentType?.trim() || "application/octet-stream";
  const essence = mimeEssence(contentType);
  const inline = opts.wantInline && SAFE_INLINE_MIME_TYPES.has(essence);
  headers.set("Content-Type", contentType);
  headers.set(
    "Content-Disposition",
    withDisposition(opts.contentDisposition, inline ? "inline" : "attachment")
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Content-Security-Policy",
    !inline ? ATTACHMENT_CSP : essence === "application/pdf" ? PDF_INLINE_CSP : IMAGE_INLINE_CSP
  );
  return { inline };
}
