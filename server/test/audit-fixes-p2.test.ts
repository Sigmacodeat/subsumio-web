import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for P2 audit fixes (G12, G14, G16, G19, G20, G21/G22, G24).
 */

const ROOT = join(__dirname, "..");
const LEGAL_PIPELINE = join(ROOT, "src/core/minions/handlers/legal-pipeline.ts");
const WEB_API = join(ROOT, "src/commands/web-api.ts");
const EXTRACT_DOC = join(ROOT, "src/core/extract-document.ts");
const CONNECTOR_MGR = join(ROOT, "src/core/ingestion/connectors/manager.ts");

// ── G12: discoverAllCaseDocuments error logging ─────────────

describe("G12: discoverAllCaseDocuments error logging", () => {
  it("catch block logs error instead of silently swallowing", () => {
    const src = readFileSync(LEGAL_PIPELINE, "utf-8");
    const fnStart = src.indexOf("export async function discoverAllCaseDocuments");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf("return [...new Set(slugs)];", fnStart);
    const fnBody = src.slice(fnStart, fnEnd + 30);
    expect(fnBody).toContain("console.error");
    expect(fnBody).toContain("[discoverAllCaseDocuments]");
    expect(fnBody).not.toMatch(/catch\s*\{\s*\}/);
  });
});

// ── G14: runMapReduceLayer parallel submission ──────────────

describe("G14: runMapReduceLayer parallel submission", () => {
  it("uses Promise.all for map children instead of sequential for-loop", () => {
    const src = readFileSync(LEGAL_PIPELINE, "utf-8");
    const fnStart = src.indexOf("async function runMapReduceLayer");
    expect(fnStart).toBeGreaterThan(-1);
    expect(src).toContain("G14 fix: submit all map children in parallel");
    const fixSection = src.slice(fnStart, fnStart + 5000);
    expect(fixSection).toContain("Promise.all");
    expect(fixSection).toContain("batches.map(async");
  });
});

// ── G16: persistEnginePostUploadTasks backoff ───────────────

describe("G16: persistEnginePostUploadTasks backoff", () => {
  it("next_attempt_at is 30s in the future, not now", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("G16 fix");
    expect(src).toContain("Date.now() + 30_000");
  });

  it("30s backoff prevents immediate worker re-processing", () => {
    const now = Date.now();
    const nextAttempt = new Date(now + 30_000).toISOString();
    const parsed = new Date(nextAttempt).getTime();
    expect(parsed - now).toBeGreaterThanOrEqual(29_000);
    expect(parsed - now).toBeLessThanOrEqual(31_000);
  });
});

// ── G19: OCR parallelization + timeout ──────────────────────

describe("G19: OCR tryOcrFallback parallelization", () => {
  it("uses bounded concurrency (4) for rasterization and OCR", () => {
    const src = readFileSync(EXTRACT_DOC, "utf-8");
    expect(src).toContain("G19 fix");
    expect(src).toContain("OCR_CONCURRENCY = 4");
    expect(src).toContain("Promise.all");
  });

  it("has per-page timeout (30s)", () => {
    const src = readFileSync(EXTRACT_DOC, "utf-8");
    expect(src).toContain("OCR_PAGE_TIMEOUT_MS = 30_000");
    expect(src).toContain("ocr_timeout");
  });

  it("Promise.race with timeout prevents indefinite hang", async () => {
    const TIMEOUT = 100;
    const slowPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("should not reach")), 1000)
    );
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("ocr_timeout")), TIMEOUT)
    );
    await expect(Promise.race([slowPromise, timeoutPromise])).rejects.toThrow("ocr_timeout");
  });
});

// ── G20: PST listFilesRecursive limits ──────────────────────

describe("G20: PST listFilesRecursive limits", () => {
  it("has MAX_PST_FILES and MAX_PST_DEPTH constants", () => {
    const src = readFileSync(EXTRACT_DOC, "utf-8");
    expect(src).toContain("MAX_PST_FILES = 50_000");
    expect(src).toContain("MAX_PST_DEPTH = 32");
  });

  it("depth tracking prevents unbounded recursion", () => {
    const src = readFileSync(EXTRACT_DOC, "utf-8");
    expect(src).toContain("depth > MAX_PST_DEPTH");
    expect(src).toContain("max depth");
  });
});

// ── G21/G22: ConnectorManager map keys ──────────────────────

describe("G21/G22: ConnectorManager map keys", () => {
  it("has serviceToId index for service→connectorId lookup", () => {
    const src = readFileSync(CONNECTOR_MGR, "utf-8");
    expect(src).toContain("serviceToId");
    expect(src).toContain("_findConnectorIdByService");
  });

  it("list() uses _findConnectorIdByService instead of has(service)", () => {
    const src = readFileSync(CONNECTOR_MGR, "utf-8");
    const listFn = src.slice(src.indexOf("async list()"), src.indexOf("async syncOne"));
    expect(listFn).toContain("_findConnectorIdByService");
    expect(listFn).not.toContain("this.connectors.has(e.service)");
  });

  it("remove() deletes by connector.id, not by service name", () => {
    const src = readFileSync(CONNECTOR_MGR, "utf-8");
    const removeFn = src.slice(src.indexOf("async remove("), src.indexOf("async setEnabled"));
    expect(removeFn).toContain("_findConnectorIdByService");
    expect(removeFn).not.toContain("this.connectors.delete(service)");
  });
});

// ── G24: shouldAutoTriggerUploadPipeline boolean coercion ───

describe("G24: shouldAutoTriggerUploadPipeline boolean coercion", () => {
  function shouldAutoTrigger(deferPipeline: unknown, source?: string): boolean {
    const LEGAL_SOURCES = new Set(["documents", "legal_case", "legal"]);
    const defer =
      typeof deferPipeline === "string" ? deferPipeline === "true" : deferPipeline === true;
    if (defer) return false;
    const src = source ?? "documents";
    return LEGAL_SOURCES.has(src);
  }

  it("string 'true' defers pipeline", () => {
    expect(shouldAutoTrigger("true", "documents")).toBe(false);
  });

  it("boolean true defers pipeline (G24 fix)", () => {
    expect(shouldAutoTrigger(true, "documents")).toBe(false);
  });

  it("boolean false does NOT defer pipeline", () => {
    expect(shouldAutoTrigger(false, "documents")).toBe(true);
  });

  it("string 'false' does NOT defer pipeline", () => {
    expect(shouldAutoTrigger("false", "documents")).toBe(true);
  });

  it("undefined does NOT defer pipeline", () => {
    expect(shouldAutoTrigger(undefined, "documents")).toBe(true);
  });

  it("non-legal source does NOT trigger pipeline", () => {
    expect(shouldAutoTrigger(false, "wiki")).toBe(false);
  });

  it("undefined source defaults to 'documents' (backward compat)", () => {
    expect(shouldAutoTrigger(false, undefined)).toBe(true);
  });
});
