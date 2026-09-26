import { describe, expect, it } from "vitest";
import {
  confirmPipelinePlan,
  legalPipelineIdempotencyKey,
  presignPipelineRouting,
  shouldAutoTriggerUploadPipeline,
  uploadPipelineCaseSlug,
} from "../src/core/upload-pipeline-routing.ts";

describe("direct upload (presign → confirm) honours defer and source", () => {
  it("the signed token's defer flag reaches confirm: no pipeline, no post-upload tasks", () => {
    const r = presignPipelineRouting({
      payload: { source: "documents", defer_pipeline: true },
      bodySource: "documents",
    });
    expect(r).toEqual({ source: "documents", deferPipeline: true });
    expect(confirmPipelinePlan(r)).toEqual({
      autoTriggerLegalPipeline: false,
      persistPostUploadTasks: false,
      pipelineDeferred: true,
    });
  });

  it("a wiki / Kanzleiwissen upload never starts the legal pipeline", () => {
    const r = presignPipelineRouting({ payload: { source: "wiki" } });
    expect(confirmPipelinePlan(r).autoTriggerLegalPipeline).toBe(false);
    // …but still gets its per-document tasks (same as the form upload).
    expect(confirmPipelinePlan(r).persistPostUploadTasks).toBe(true);
  });

  it("the token's source wins over the body", () => {
    expect(
      presignPipelineRouting({ payload: { source: "wiki" }, bodySource: "documents" }).source
    ).toBe("wiki");
  });

  it("a body flag can defer, but never re-enable what the token deferred", () => {
    expect(
      presignPipelineRouting({ payload: { source: "documents" }, bodyDefer: "true" }).deferPipeline
    ).toBe(true);
    expect(
      presignPipelineRouting({
        payload: { source: "documents", defer_pipeline: true },
        bodyDefer: false,
      }).deferPipeline
    ).toBe(true);
  });

  it("a normal legal upload runs its pipeline and tasks", () => {
    const r = presignPipelineRouting({ payload: null, bodySource: "documents" });
    expect(confirmPipelinePlan(r)).toEqual({
      autoTriggerLegalPipeline: true,
      persistPostUploadTasks: true,
      pipelineDeferred: false,
    });
  });
});

describe("canonical upload pipeline routing", () => {
  it("runs assigned documents against their legal case, never the document slug", () => {
    expect(uploadPipelineCaseSlug("documents/brief", "legal/cases/case-1")).toBe(
      "legal/cases/case-1"
    );
  });

  it("uses the document as a standalone case only when no case is assigned", () => {
    expect(uploadPipelineCaseSlug("documents/brief")).toBe("documents/brief");
  });

  it("allows a complete act runner to defer per-document pipelines", () => {
    expect(shouldAutoTriggerUploadPipeline("true")).toBe(false);
    expect(shouldAutoTriggerUploadPipeline(undefined)).toBe(true);
  });

  it("triggers pipeline for legal sources (documents, legal_case, legal)", () => {
    expect(shouldAutoTriggerUploadPipeline(undefined, "documents")).toBe(true);
    expect(shouldAutoTriggerUploadPipeline(undefined, "legal_case")).toBe(true);
    expect(shouldAutoTriggerUploadPipeline(undefined, "legal")).toBe(true);
  });

  it("does NOT trigger pipeline for non-legal sources (wiki, meetings, etc.)", () => {
    expect(shouldAutoTriggerUploadPipeline(undefined, "wiki")).toBe(false);
    expect(shouldAutoTriggerUploadPipeline(undefined, "meetings")).toBe(false);
    expect(shouldAutoTriggerUploadPipeline(undefined, "ideas")).toBe(false);
    expect(shouldAutoTriggerUploadPipeline(undefined, "people")).toBe(false);
    expect(shouldAutoTriggerUploadPipeline(undefined, "companies")).toBe(false);
    expect(shouldAutoTriggerUploadPipeline(undefined, "chat")).toBe(false);
  });

  it("defaults to documents source when source is undefined (backward compat)", () => {
    expect(shouldAutoTriggerUploadPipeline(undefined, undefined)).toBe(true);
  });

  it("respects defer_pipeline even for legal sources", () => {
    expect(shouldAutoTriggerUploadPipeline("true", "documents")).toBe(false);
  });

  it("uses a stable order-independent idempotency key per corpus and version", () => {
    const a = legalPipelineIdempotencyKey("tenant-a", "cases/1", ["docs/b", "docs/a"]);
    const b = legalPipelineIdempotencyKey("tenant-a", "cases/1", ["docs/a", "docs/b"]);
    const changed = legalPipelineIdempotencyKey("tenant-a", "cases/1", ["docs/a"], 2);
    expect(a).toBe(b);
    expect(changed).not.toBe(a);
  });
});
