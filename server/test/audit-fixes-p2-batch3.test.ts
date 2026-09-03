import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for P2 batch 3 fixes (G8, G11).
 */

const ROOT = join(__dirname, "..");
const MATTER_DETAIL = join(__dirname, "..", "..", "src/lib/matter-detail-context.tsx");
const PIPELINE_PANEL = join(__dirname, "..", "..", "src/components/legal/PipelinePanel.tsx");
const PRESIGNED_UPLOAD = join(__dirname, "..", "..", "src/lib/presigned-upload.ts");

// ── G8: handleMultiUpload UUID-keyed progress + AbortController ─

describe("G8: handleMultiUpload index-keyed progress", () => {
  it("uses indexToQueueId Map instead of filename-keyed fileMap", () => {
    const src = readFileSync(MATTER_DETAIL, "utf-8");
    expect(src).toContain("indexToQueueId");
    expect(src).toContain("G8 fix: key by index");
    // Must NOT have the old filename-keyed fileMap
    expect(src).not.toContain("fileMap.set(f.name");
  });

  it("has uploadAbortRef for cancellation", () => {
    const src = readFileSync(MATTER_DETAIL, "utf-8");
    expect(src).toContain("uploadAbortRef");
    expect(src).toContain("AbortController");
    expect(src).toContain("uploadAbortRef.current = uploadAbortController");
  });

  it("passes signal to presignedUploadFiles", () => {
    const src = readFileSync(MATTER_DETAIL, "utf-8");
    expect(src).toContain("signal: uploadAbortController.signal");
  });

  it("maps results by index, not by filename", () => {
    const src = readFileSync(MATTER_DETAIL, "utf-8");
    expect(src).toContain("indexToQueueId.get(i)");
    // Must NOT have the old fileMap.get(r.file.name)
    expect(src).not.toContain("fileMap.get(r.file.name)");
  });
});

describe("G8: presigned-upload fileIndex support", () => {
  it("UploadProgress has fileIndex field", () => {
    const src = readFileSync(PRESIGNED_UPLOAD, "utf-8");
    expect(src).toContain("fileIndex");
    expect(src).toContain("G8 fix: index of the file");
  });

  it("uploadFiles wraps onProgress to inject fileIndex", () => {
    const src = readFileSync(PRESIGNED_UPLOAD, "utf-8");
    expect(src).toContain("fileIndex: myIndex");
    expect(src).toContain("G8 fix: wrap onProgress");
  });
});

// ── G11: PipelinePanel useQuery + error UI ──────────────────

describe("G11: PipelinePanel useQuery migration", () => {
  it("imports useQuery from @tanstack/react-query", () => {
    const src = readFileSync(PIPELINE_PANEL, "utf-8");
    expect(src).toContain("useQuery");
    expect(src).toContain("@tanstack/react-query");
  });

  it("uses queryKey with legal/pipeline namespace", () => {
    const src = readFileSync(PIPELINE_PANEL, "utf-8");
    expect(src).toContain('"legal"');
    expect(src).toContain('"pipeline"');
    expect(src).toContain("caseSlug");
  });

  it("has refetchInterval for auto-refresh", () => {
    const src = readFileSync(PIPELINE_PANEL, "utf-8");
    expect(src).toContain("refetchInterval");
  });

  it("has isError state in render", () => {
    const src = readFileSync(PIPELINE_PANEL, "utf-8");
    expect(src).toContain("isError");
    expect(src).toContain("Erneut versuchen");
  });

  it("does NOT have the old fetchPipelineData callback", () => {
    const src = readFileSync(PIPELINE_PANEL, "utf-8");
    // fetchPipelineData was replaced by refetch
    expect(src).not.toContain("const fetchPipelineData = useCallback");
  });

  it("does NOT have the old manual polling setInterval", () => {
    const src = readFileSync(PIPELINE_PANEL, "utf-8");
    // The old manual polling interval was removed
    expect(src).not.toContain("setInterval(() => refetch(), 5000)");
    expect(src).not.toContain("setInterval(() => fetchPipelineData(), 5000)");
  });

  it("imports AlertCircle for error UI", () => {
    const src = readFileSync(PIPELINE_PANEL, "utf-8");
    expect(src).toContain("AlertCircle");
  });
});
