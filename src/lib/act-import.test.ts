import { describe, expect, it } from "vitest";
import { computeActImportMetrics, safeImportId, type ActImportItem } from "./act-import";

const item = (
  status: ActImportItem["status"],
  extra: Partial<ActImportItem> = {}
): ActImportItem => ({
  id: crypto.randomUUID(),
  sessionId: "s1",
  caseSlug: "legal/cases/a",
  relativePath: "a.pdf",
  filename: "a.pdf",
  size: 100,
  status,
  attempts: 1,
  updatedAt: new Date().toISOString(),
  ...extra,
});

describe("act import metrics", () => {
  it("only finalizes when every item is terminal and usable", () => {
    expect(computeActImportMetrics([item("ready"), item("partial")]).canFinalize).toBe(true);
    expect(computeActImportMetrics([item("ready"), item("processing")]).canFinalize).toBe(false);
    expect(computeActImportMetrics([item("ready"), item("failed")]).canFinalize).toBe(false);
  });

  it("reports classification and ON coverage", () => {
    const metrics = computeActImportMetrics([
      item("ready", { classification: "Beschluss", onCount: 4, pageCount: 10 }),
      item("review", { warningCount: 2 }),
    ]);
    expect(metrics.classificationPercent).toBe(50);
    expect(metrics.onCoveragePercent).toBe(50);
    expect(metrics.pages).toBe(10);
    expect(metrics.warnings).toBe(2);
  });

  it("normalizes safe ids", () => {
    expect(safeImportId(" Akt 2026/01 ")).toBe("akt-2026-01");
    expect(() => safeImportId("///")).toThrow("invalid_import_id");
  });

  it("counts failed items for retry button visibility", () => {
    const metrics = computeActImportMetrics([
      item("ready"),
      item("failed", { filename: "b.pdf" }),
      item("failed", { filename: "c.pdf" }),
    ]);
    expect(metrics.failed).toBe(2);
    expect(metrics.canFinalize).toBe(false);
  });

  it("allows finalize after all failed items are retried to ready", () => {
    const before = computeActImportMetrics([item("ready"), item("failed", { filename: "b.pdf" })]);
    expect(before.canFinalize).toBe(false);

    const after = computeActImportMetrics([
      item("ready"),
      item("ready", { filename: "b.pdf", attempts: 2 }),
    ]);
    expect(after.canFinalize).toBe(true);
    expect(after.ready).toBe(2);
  });

  it("handles 84-item bulk import readiness", () => {
    const items84 = Array.from({ length: 84 }, (_, i) =>
      item("ready", { filename: `doc-${i}.heic` })
    );
    const metrics = computeActImportMetrics(items84);
    expect(metrics.total).toBe(84);
    expect(metrics.ready).toBe(84);
    expect(metrics.canFinalize).toBe(true);
    expect(metrics.readinessPercent).toBe(100);
  });

  it("blocks finalize if any item is still processing in 84-item bulk", () => {
    const items84 = Array.from({ length: 84 }, (_, i) =>
      item(i < 82 ? "ready" : "processing", { filename: `doc-${i}.heic` })
    );
    const metrics = computeActImportMetrics(items84);
    expect(metrics.canFinalize).toBe(false);
    expect(metrics.processing).toBe(2);
  });
});
