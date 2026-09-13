import { describe, expect, test } from "vitest";
import type { NextConfig } from "next";
import config from "../../next.config";

const EXPECTED_DASHBOARD_ALIASES = new Map([
  ["/dashboard/rechtsprechung", "/dashboard/research?tab=rechtsprechung"],
  ["/dashboard/norms", "/dashboard/research?tab=normen"],
  ["/dashboard/judgements-db", "/dashboard/research?tab=judgements-db"],
  ["/dashboard/precedent-search", "/dashboard/research?tab=precedent-search"],
  ["/dashboard/commentaries", "/dashboard/research?tab=commentaries"],
  ["/dashboard/time-tracking", "/dashboard/time"],
]);

describe("dashboard alias redirects", () => {
  test("keeps every archived dashboard URL as a permanent server redirect", async () => {
    expect(typeof config).toBe("object");
    const redirects = await (config as NextConfig).redirects?.();

    for (const [source, destination] of EXPECTED_DASHBOARD_ALIASES) {
      expect(redirects).toContainEqual({ source, destination, permanent: true });
    }
  });
});
