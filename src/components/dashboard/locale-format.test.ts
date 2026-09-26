// @vitest-environment node
// UI-8 / UIS-0-19: the corrected screens format dates in de-AT ("Jänner") and
// amounts via formatEur ("1.234,50 €"), not de-DE or `toFixed(2) €`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatEur } from "@/lib/utils";

const SRC = path.resolve(__dirname, "..", "..");

const FIXED_FILES = [
  "components/dashboard/widget-board.tsx",
  "components/dashboard/widget-dashboard.tsx",
  "components/dashboard/matter-budget-widget.tsx",
  "components/legal/DeadlineQuickCreateDialog.tsx",
  "components/legal/matter-tabs/overview-tab.tsx",
  "app/dashboard/claim-account/page.tsx",
  "app/dashboard/litigation/page.tsx",
  "app/dashboard/red-team/page.tsx",
];

describe("de-AT formats", () => {
  it.each(FIXED_FILES)("%s uses no de-DE locale and no toFixed(2) €", (file) => {
    const text = readFileSync(path.join(SRC, file), "utf8");
    expect(text).not.toContain('"de-DE"');
    expect(text).not.toMatch(/toFixed\(2\)\}\s*€/);
  });

  it("de-AT spells January as Jänner (deadline preview)", () => {
    const d = new Date("2027-01-15T12:00:00Z");
    const text = d.toLocaleDateString("de-AT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    expect(text).toContain("Jänner");
  });

  it("formatEur uses the Austrian decimal comma and thousands separator", () => {
    expect(formatEur(1234.5)).toMatch(/1\.234,50/);
  });

  it("the security page renders the allowlist example on two lines", () => {
    const text = readFileSync(path.join(SRC, "app/dashboard/settings/security/page.tsx"), "utf8");
    // A literal "\n" in JSX text is shown as backslash-n; inside a JS string it is a line break.
    expect(text).toContain('{"SUBSUMIO_IP_ALLOWLIST=');
  });
});
