// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_CSP,
  IMAGE_INLINE_CSP,
  PDF_INLINE_CSP,
  applyUploadedFileHeaders,
  isSafeInlineMime,
} from "./file-response-headers";

function apply(contentType: string | null, wantInline: boolean, cd = 'attachment; filename="x"') {
  const h = new Headers();
  const r = applyUploadedFileHeaders(h, { contentType, contentDisposition: cd, wantInline });
  return { h, inline: r.inline };
}

describe("applyUploadedFileHeaders", () => {
  it.each([
    "text/html",
    "text/html; charset=utf-8",
    "TEXT/HTML",
    "image/svg+xml",
    "text/xml",
    "application/xml",
    "application/xhtml+xml",
    "application/octet-stream",
    "text/plain",
  ])("forces %s to attachment with sandbox CSP even when inline is requested", (ct) => {
    const { h, inline } = apply(ct, true);
    expect(inline).toBe(false);
    expect(h.get("Content-Disposition")).toBe('attachment; filename="x"');
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Content-Security-Policy")).toBe(ATTACHMENT_CSP);
  });

  it("serves PDFs inline without sandbox so the browser PDF viewer can render", () => {
    const { h, inline } = apply("application/pdf", true);
    expect(inline).toBe(true);
    expect(h.get("Content-Disposition")).toBe('inline; filename="x"');
    expect(h.get("Content-Security-Policy")).toBe(PDF_INLINE_CSP);
    expect(h.get("Content-Security-Policy")).not.toMatch(/sandbox/);
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each(["image/png", "image/jpeg", "image/gif", "image/webp"])(
    "serves %s inline under a sandboxed CSP",
    (ct) => {
      const { h, inline } = apply(ct, true);
      expect(inline).toBe(true);
      expect(h.get("Content-Security-Policy")).toBe(IMAGE_INLINE_CSP);
    }
  );

  it("keeps safe types as attachment when inline was not requested", () => {
    const { h, inline } = apply("application/pdf", false, 'inline; filename="x"');
    expect(inline).toBe(false);
    expect(h.get("Content-Disposition")).toBe('attachment; filename="x"');
    expect(h.get("Content-Security-Policy")).toBe(ATTACHMENT_CSP);
  });

  it("defaults a missing content type to octet-stream attachment", () => {
    const { h, inline } = apply(null, true, "");
    expect(inline).toBe(false);
    expect(h.get("Content-Type")).toBe("application/octet-stream");
    expect(h.get("Content-Disposition")).toBe("attachment");
  });

  it("isSafeInlineMime rejects svg and html", () => {
    expect(isSafeInlineMime("image/svg+xml")).toBe(false);
    expect(isSafeInlineMime("text/html")).toBe(false);
    expect(isSafeInlineMime("application/pdf; name=x")).toBe(true);
  });
});
