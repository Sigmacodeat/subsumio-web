import { describe, expect, it } from "vitest";
import { caseSlugFromDashboardPath } from "./matter-route-path";

describe("caseSlugFromDashboardPath", () => {
  it("preserves nested legal case slugs", () => {
    expect(caseSlugFromDashboardPath("/dashboard/cases/legal/cases/toni/documents")).toBe(
      "legal/cases/toni"
    );
  });
  it("preserves an overview slug without a tab", () => {
    expect(caseSlugFromDashboardPath("/dashboard/cases/legal/cases/toni")).toBe("legal/cases/toni");
  });
  it("does not claim unrelated routes", () => {
    expect(caseSlugFromDashboardPath("/dashboard/deadlines")).toBeUndefined();
  });
});
