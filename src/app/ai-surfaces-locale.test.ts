// @vitest-environment node
// Austrian formats on the AI work surfaces: dates/amounts in de-AT, no raw
// engine error text in the litigation view, matters picked from a list.

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("AI surfaces — Austrian formats", () => {
  test.each([
    "src/app/dashboard/litigation/page.tsx",
    "src/app/dashboard/red-team/page.tsx",
    "src/components/legal/berufungs-agent/ActAnalysisStep.tsx",
  ])("%s uses de-AT, not de-DE", (file) => {
    expect(read(file)).not.toMatch(/["']de-DE["']/);
  });

  test("amounts via formatEur, not toFixed(2) €", () => {
    expect(read("src/components/legal/matter-tabs/overview-tab.tsx")).not.toMatch(
      /toFixed\(2\)\}\s*€/
    );
  });

  test.each([
    "src/app/dashboard/compliance/answer-quality/page.tsx",
    "src/app/dashboard/settings/privacy/page.tsx",
    "src/app/dashboard/shared-spaces/accept/page.tsx",
  ])("%s reads the error text from `error` (apiError shape)", (file) => {
    expect(read(file)).not.toMatch(
      /error\?\.message|\{ message\?: string \}\)\?\.message\s*:\s*undefined/
    );
  });

  test("litigation: matter chosen from the list, no raw error message shown", () => {
    const src = read("src/app/dashboard/litigation/page.tsx");
    expect(src).toContain("<CaseSelect");
    expect(src).not.toMatch(/setError\(err instanceof Error \? err\.message/);
  });
});
