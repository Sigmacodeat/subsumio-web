import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for P2 batch 4 fixes (G5, G7, G17, G25).
 */

const ROOT = join(__dirname, "..");
const WEB_API = join(ROOT, "src/commands/web-api.ts");

// ── G5: RAM-Buffering — hash-based dedup ────────────────────

describe("G5: RAM-Buffering — hash-based dedup", () => {
  it("exports storedDuplicateByHash that accepts a hash string", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("async function storedDuplicateByHash");
    expect(src).toContain("G5 fix: hash-based duplicate check");
  });

  it("upload route uses storedDuplicateByHash with file.hash", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("storedDuplicateByHash(file.hash, tenantSource");
  });

  it("warns when large files are loaded into RAM", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // G5 full-streaming: warning is now in getFileData() lazy-load
    expect(src).toContain("Large file loaded into RAM");
  });
});

// ── G7: Zod-Validation for upload form fields ───────────────

describe("G7: Zod-Validation for upload form fields", () => {
  it("imports zod", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain('from "zod"');
  });

  it("defines uploadFieldsSchema with Zod", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("uploadFieldsSchema");
    expect(src).toContain("z.object");
    expect(src).toContain("G7 fix: Zod schema");
  });

  it("validates fields with safeParse before use", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("uploadFieldsSchema.safeParse(fields)");
    expect(src).toContain("invalid_form_fields");
  });

  it("schema includes case_slug, jurisdiction, doc_type, password", () => {
    const src = readFileSync(WEB_API, "utf-8");
    const schemaStart = src.indexOf("uploadFieldsSchema = z.object");
    const schemaBody = src.slice(schemaStart, schemaStart + 500);
    expect(schemaBody).toContain("case_slug");
    expect(schemaBody).toContain("jurisdiction");
    expect(schemaBody).toContain("doc_type");
    expect(schemaBody).toContain("password");
  });

  it("jurisdiction is enum-validated (at/de/ch)", () => {
    const src = readFileSync(WEB_API, "utf-8");
    const schemaStart = src.indexOf("uploadFieldsSchema = z.object");
    const schemaBody = src.slice(schemaStart, schemaStart + 500);
    expect(schemaBody).toContain("z.enum");
    expect(schemaBody).toContain('"at"');
    expect(schemaBody).toContain('"de"');
    expect(schemaBody).toContain('"ch"');
  });
});

// ── G17: Trust-Boundary — remote:false Review ───────────────

describe("G17: Trust-Boundary — remote:false", () => {
  it("all buildOperationContext calls use remote:false", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // Find all buildOperationContext calls
    const matches = src.match(/buildOperationContext\(engine/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // All should have remote: false in the options
    const ctxCalls =
      src.match(/buildOperationContext\(engine,\s*\{\},\s*\{\s*remote:\s*false/g) ?? [];
    expect(ctxCalls.length).toBe(matches.length);
  });

  it("dispatchToolCall uses remote:false", () => {
    const src = readFileSync(WEB_API, "utf-8");
    const dispatchMatch = src.match(
      /dispatchToolCall\(engine,\s*name,\s*params,\s*\{\s*remote:\s*false/
    );
    expect(dispatchMatch).not.toBeNull();
  });

  it("runThink uses remote:false", () => {
    const src = readFileSync(WEB_API, "utf-8");
    const thinkMatch = src.match(/runThink\(engine,\s*\{\s*question:\s*query,\s*remote:\s*false/);
    expect(thinkMatch).not.toBeNull();
  });

  it("no remote:true or remote:undefined in the file", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).not.toContain("remote: true");
    expect(src).not.toContain("remote: undefined");
  });
});

// ── G25: Error-Response-Format konsistent ───────────────────

describe("G25: Error-Response-Format konsistent", () => {
  it("defines apiError helper", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("const apiError =");
    expect(src).toContain("G25 fix: consistent error-response helper");
  });

  it("apiError always includes message field", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("message: message ?? code");
  });

  it("G7 validation uses apiError", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain(
      'apiError(\n          res,\n          400,\n          "invalid_form_fields"'
    );
  });
});
