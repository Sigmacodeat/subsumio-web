import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bindPresignCaseSlug } from "../src/core/upload-case-binding.ts";

describe("bindPresignCaseSlug — presign matter bound to the signed upload token", () => {
  it("keeps the body's matter when no token is sent (authenticated web proxy)", () => {
    expect(
      bindPresignCaseSlug({ tokenPresent: false, payload: null, bodyCaseSlug: "legal/cases/a" })
    ).toEqual({ ok: true, caseSlug: "legal/cases/a" });
  });

  it("refuses a token that does not verify", () => {
    expect(
      bindPresignCaseSlug({ tokenPresent: true, payload: null, bodyCaseSlug: "legal/cases/a" })
    ).toEqual({ ok: false, status: 401, error: "invalid_upload_token" });
  });

  it("refuses a body matter that differs from the token's", () => {
    expect(
      bindPresignCaseSlug({
        tokenPresent: true,
        payload: { case_slug: "legal/cases/a" },
        bodyCaseSlug: "legal/cases/b",
      })
    ).toEqual({ ok: false, status: 403, error: "upload_token_case_mismatch" });
  });

  it("refuses a body matter when the token was issued without one", () => {
    expect(
      bindPresignCaseSlug({ tokenPresent: true, payload: {}, bodyCaseSlug: "legal/cases/b" })
    ).toEqual({ ok: false, status: 403, error: "upload_token_case_mismatch" });
  });

  it("takes the token's matter when the body names none, or the same one", () => {
    expect(
      bindPresignCaseSlug({
        tokenPresent: true,
        payload: { case_slug: "legal/cases/a" },
        bodyCaseSlug: undefined,
      })
    ).toEqual({ ok: true, caseSlug: "legal/cases/a" });
    expect(
      bindPresignCaseSlug({
        tokenPresent: true,
        payload: { case_slug: "legal/cases/a" },
        bodyCaseSlug: " legal/cases/a ",
      })
    ).toEqual({ ok: true, caseSlug: "legal/cases/a" });
  });

  it("is applied by both presign routes before the matter-scope check", () => {
    const src = readFileSync(join(__dirname, "..", "src/commands/web-api.ts"), "utf-8");
    for (const route of ['"/api/upload/presign"', '"/api/upload/presign-batch"']) {
      const start = src.indexOf(route);
      expect(start).toBeGreaterThan(-1);
      const handler = src.slice(start, start + 6000);
      const bind = handler.indexOf("bindPresignCaseSlug(");
      const scope = handler.indexOf("assertSlugMatterScope(");
      expect(bind).toBeGreaterThan(-1);
      expect(scope).toBeGreaterThan(bind);
    }
  });
});
