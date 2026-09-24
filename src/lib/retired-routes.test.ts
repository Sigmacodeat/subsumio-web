import { describe, expect, it } from "vitest";
import {
  RETIRED_PILOT_DASHBOARD_PREFIXES,
  isRetiredApiPath,
  isRetiredDashboardPath,
} from "./retired-routes";
import { ALL_NAV_ITEMS, NAV_SECTIONS } from "@/components/dashboard/sidebar";

describe("retired pilot routes", () => {
  it("matches the prefix and its sub-paths only", () => {
    expect(isRetiredDashboardPath("/dashboard/bea")).toBe(true);
    expect(isRetiredDashboardPath("/dashboard/bea/inbox")).toBe(true);
    expect(isRetiredDashboardPath("/dashboard/beamer")).toBe(false);
    expect(isRetiredApiPath("/api/fachrechner")).toBe(true);
    expect(isRetiredApiPath("/api/datev-direct/sync")).toBe(true);
    expect(isRetiredApiPath("/api/invoices")).toBe(false);
  });

  it("no navigation entry points at a retired page (DE firms included)", () => {
    const hrefs = [
      ...ALL_NAV_ITEMS.map((i) => i.href),
      ...NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)),
    ];
    for (const prefix of RETIRED_PILOT_DASHBOARD_PREFIXES) {
      expect(
        hrefs.filter((h) => isRetiredDashboardPath(h)),
        prefix
      ).toEqual([]);
    }
    // Regular entries are still there.
    expect(hrefs).toContain("/dashboard/settings");
  });
});
