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
});
