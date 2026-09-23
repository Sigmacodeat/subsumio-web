// @vitest-environment node
// Regression guard: the matter tab used to write second_check_by itself
// (client-side "Vier-Augen" stamp through the generic page write). The only
// writer is now /api/legal/fristen/second-check.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  path.join(process.cwd(), "src/components/legal/matter-tabs/deadlines-tasks-tab.tsx"),
  "utf8"
);

describe("matter deadlines tab — second check", () => {
  it("never stamps second_check_* on the client", () => {
    expect(src).not.toMatch(/second_check_by\s*:/);
    expect(src).not.toMatch(/second_check_at\s*:/);
  });

  it("calls the server-side second-check route with the deadline's identity", () => {
    expect(src).toContain("api.legal.fristenSecondCheck(caseData.slug");
    expect(src).toMatch(/id:\s*dl\.id/);
  });
});
