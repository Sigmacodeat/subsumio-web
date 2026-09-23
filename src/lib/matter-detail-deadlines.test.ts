// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matterDeadlineQuery } from "@/lib/matter-detail-types";

describe("matter deadline list", () => {
  it("asks the server for this matter's deadlines by slug, title and number", () => {
    expect(
      matterDeadlineQuery({ slug: "legal/cases/akte-1", title: "Muster", caseNumber: "2026/1" })
    ).toEqual({
      type: "legal_deadline",
      caseSlug: "legal/cases/akte-1",
      caseTitle: "Muster",
      caseNumber: "2026/1",
    });
  });

  it("no longer reads a firm-wide, capped deadline list in the matter view", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/matter-detail-context.tsx"), "utf8");
    expect(src).not.toMatch(/type:\s*"legal_deadline",\s*limit:/);
    expect(src).not.toMatch(/batchListPages\(\[[^\]]*"legal_deadline"/);
    expect(src.match(/listPages\(matterDeadlineQuery\(detail\)\)/g)).toHaveLength(2);
  });
});
