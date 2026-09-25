// @vitest-environment node
// AI surfaces send their writes with the CSRF token: a raw fetch() write is
// refused by the middleware (403), so the feature silently never works.
// Scoped to the AI work surfaces fixed in this pass; widen as others follow.

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FILES = [
  "src/app/dashboard/research/page.tsx",
  "src/app/dashboard/red-team/page.tsx",
  "src/app/dashboard/drafting/page.tsx",
  "src/app/dashboard/workflows/page.tsx",
  "src/components/legal/AutomationsPanel.tsx",
  "src/components/copilot/copilot-memory-panel.tsx",
  "src/components/copilot/planning-mode-panel.tsx",
];

/** A plain fetch( (not csrfFetch) whose options set a write method. */
const RAW_WRITE = /(?<![A-Za-z])fetch\(\s*[^)]*?,\s*\{[^}]*?method:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/s;

describe("AI surfaces use csrfFetch for writes", () => {
  test.each(FILES)("%s", (file) => {
    const src = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(RAW_WRITE.test(src)).toBe(false);
  });
});
