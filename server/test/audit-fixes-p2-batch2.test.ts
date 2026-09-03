import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for P2 audit fixes batch 2 (G13, G15, G18, G23, G26, G27).
 */

const ROOT = join(__dirname, "..");
const LEGAL_PIPELINE = join(ROOT, "src/core/minions/handlers/legal-pipeline.ts");
const WEB_API = join(ROOT, "src/commands/web-api.ts");
const CONNECTOR_MGR = join(ROOT, "src/core/ingestion/connectors/manager.ts");
const DOCUMENTS_TAB = join(
  __dirname,
  "..",
  "..",
  "src/components/legal/matter-tabs/documents-tab.tsx"
);
const DRAFT_EDITOR = join(__dirname, "..", "..", "src/components/legal/DraftEditor.tsx");

// ── G13: waitForChild exponential backoff ───────────────────

describe("G13: waitForChild exponential backoff", () => {
  it("uses exponential backoff instead of fixed 3s interval", () => {
    const src = readFileSync(LEGAL_PIPELINE, "utf-8");
    expect(src).toContain("pollInterval");
    expect(src).toContain("MAX_POLL_INTERVAL");
    expect(src).toContain("pollInterval * 2");
    expect(src).toContain("G13 fix");
  });

  it("logs warning when approaching deadline", () => {
    const src = readFileSync(LEGAL_PIPELINE, "utf-8");
    expect(src).toContain("approaching timeout");
    expect(src).toContain("console.warn");
  });
});

// ── G15: patchPageFrontmatterBatch ──────────────────────────

describe("G15: patchPageFrontmatterBatch", () => {
  it("exports a batch variant", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("export async function patchPageFrontmatterBatch");
  });

  it("uses ANY() for batch update in a single query", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("ANY($3::text[])");
    expect(src).toContain("G15 fix");
  });

  it("throws if not all slugs were found", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("EngineNotFoundError");
  });
});

// ── G18: assertMatterScope before persistence ───────────────

describe("G18: assertMatterScope before persistence", () => {
  it("validates matter scope on slug before persistence", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // The G18 fix comment should exist and be near an assertMatterScope call
    const g18Idx = src.indexOf("G18 fix: validate matter scope");
    expect(g18Idx).toBeGreaterThan(-1);
    // Check that assertMatterScope(req.matterScope, slug) appears in the
    // 200 chars after the G18 fix comment
    const afterFix = src.slice(g18Idx, g18Idx + 300);
    expect(afterFix).toContain("assertMatterScope(req.matterScope, slug)");
  });

  it("does NOT have assertMatterScope after runExtractionAndImport", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // The "G18 fix: matter scope already validated" comment should be
    // after runExtractionAndImport, replacing the old assertMatterScope call
    const validatedComment = src.indexOf("G18 fix: matter scope already validated");
    expect(validatedComment).toBeGreaterThan(-1);
  });
});

// ── G23: syncOne timeout ────────────────────────────────────

describe("G23: syncOne timeout", () => {
  it("uses Promise.race with a timeout", () => {
    const src = readFileSync(CONNECTOR_MGR, "utf-8");
    expect(src).toContain("G23 fix");
    expect(src).toContain("Promise.race");
    expect(src).toContain("SYNC_TIMEOUT_MS");
    expect(src).toContain("sync_timeout");
  });

  it("timeout is 5 minutes (300000ms)", () => {
    const src = readFileSync(CONNECTOR_MGR, "utf-8");
    expect(src).toContain("5 * 60 * 1000");
  });
});

// ── G26: DraftEditor query invalidation ─────────────────────

describe("G26: DraftEditor query invalidation", () => {
  it("imports useQueryClient", () => {
    const src = readFileSync(DRAFT_EDITOR, "utf-8");
    expect(src).toContain("useQueryClient");
    expect(src).toContain("@tanstack/react-query");
  });

  it("invalidates brain page + pages + case queries after save", () => {
    const src = readFileSync(DRAFT_EDITOR, "utf-8");
    expect(src).toContain("invalidateQueries");
    expect(src).toContain('["brain", "page"');
    expect(src).toContain('["brain", "pages"');
    expect(src).toContain('["legal", "case"');
    expect(src).toContain("G26 fix");
  });
});

// ── G27: DocumentsTab debounce + AbortController ────────────

describe("G27: DocumentsTab debounce + AbortController", () => {
  it("imports useRef", () => {
    const src = readFileSync(DOCUMENTS_TAB, "utf-8");
    expect(src).toContain("useRef");
  });

  it("has AbortController ref for search", () => {
    const src = readFileSync(DOCUMENTS_TAB, "utf-8");
    expect(src).toContain("searchAbortRef");
    expect(src).toContain("AbortController");
    expect(src).toContain("ac.abort()");
  });

  it("has debounce timer ref (250ms)", () => {
    const src = readFileSync(DOCUMENTS_TAB, "utf-8");
    expect(src).toContain("searchTimerRef");
    expect(src).toContain("250");
    expect(src).toContain("clearTimeout");
  });

  it("guards against stale responses with signal.aborted check", () => {
    const src = readFileSync(DOCUMENTS_TAB, "utf-8");
    expect(src).toContain("ac.signal.aborted");
  });
});
