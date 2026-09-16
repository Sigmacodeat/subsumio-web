import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps same-origin paths including query strings", () => {
    expect(safeNextPath("/ops")).toBe("/ops");
    expect(safeNextPath("/dashboard/billing?checkout=pro")).toBe("/dashboard/billing?checkout=pro");
  });

  it("falls back when missing", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("", "/ops")).toBe("/ops");
  });

  it("rejects external and protocol-relative targets", () => {
    expect(safeNextPath("https://phish.example")).toBe("/dashboard");
    expect(safeNextPath("//phish.example")).toBe("/dashboard");
    expect(safeNextPath("/\\phish.example")).toBe("/dashboard");
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNextPath("/\tphish")).toBe("/dashboard");
  });
});
