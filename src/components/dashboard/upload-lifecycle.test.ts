import { describe, it, expect } from "vitest";
import {
  uploadStageIndex,
  UPLOAD_STAGES,
  COMBINED_PROCESSING_STAGE,
  type UploadFileLike,
} from "./upload-lifecycle";

const f = (o: Partial<UploadFileLike>): UploadFileLike => ({ status: "pending", ...o });

describe("uploadStageIndex", () => {
  it("maps pending/preparing/uploading to the Upload stage (0)", () => {
    expect(uploadStageIndex(f({ status: "pending" }))).toBe(0);
    expect(uploadStageIndex(f({ status: "preparing" }))).toBe(0);
    expect(uploadStageIndex(f({ status: "uploading" }))).toBe(0);
  });

  it("maps the server sub-phases to their stage", () => {
    expect(uploadStageIndex(f({ status: "processing", serverPhase: "downloading" }))).toBe(0);
    expect(uploadStageIndex(f({ status: "processing", serverPhase: "verifying" }))).toBe(1);
    expect(uploadStageIndex(f({ status: "processing", serverPhase: "scanning" }))).toBe(2);
    expect(uploadStageIndex(f({ status: "processing", serverPhase: "extracting" }))).toBe(3);
  });

  it("processing without a known sub-phase stays at Upload (0) by default", () => {
    expect(uploadStageIndex(f({ status: "processing" }))).toBe(0);
  });

  it("sync-fallback (hadSubPhase=false) with no sub-phase returns the combined sentinel", () => {
    expect(uploadStageIndex(f({ status: "processing", hadSubPhase: false }))).toBe(
      COMBINED_PROCESSING_STAGE
    );
  });

  it("a real sub-phase always wins over hadSubPhase=false (telemetry arrived after all)", () => {
    expect(
      uploadStageIndex(f({ status: "processing", serverPhase: "scanning", hadSubPhase: false }))
    ).toBe(2);
  });

  it("done marks every stage complete (index == stage count)", () => {
    expect(uploadStageIndex(f({ status: "done" }))).toBe(UPLOAD_STAGES.length);
  });

  it("stage indices are monotonic along the pipeline", () => {
    const order = [
      uploadStageIndex(f({ status: "uploading" })),
      uploadStageIndex(f({ status: "processing", serverPhase: "verifying" })),
      uploadStageIndex(f({ status: "processing", serverPhase: "scanning" })),
      uploadStageIndex(f({ status: "processing", serverPhase: "extracting" })),
      uploadStageIndex(f({ status: "done" })),
    ];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
});
