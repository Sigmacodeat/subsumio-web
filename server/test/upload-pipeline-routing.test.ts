import { describe, expect, it } from "vitest";
import {
  legalPipelineIdempotencyKey,
  shouldAutoTriggerUploadPipeline,
  uploadPipelineCaseSlug,
} from "../src/core/upload-pipeline-routing.ts";

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

  it("uses a stable order-independent idempotency key per corpus and version", () => {
    const a = legalPipelineIdempotencyKey("tenant-a", "cases/1", ["docs/b", "docs/a"]);
    const b = legalPipelineIdempotencyKey("tenant-a", "cases/1", ["docs/a", "docs/b"]);
    const changed = legalPipelineIdempotencyKey("tenant-a", "cases/1", ["docs/a"], 2);
    expect(a).toBe(b);
    expect(changed).not.toBe(a);
  });
});
