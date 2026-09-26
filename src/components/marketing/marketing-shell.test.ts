// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("marketing shell", () => {
  it("loads the chat widget lazily, not in the initial bundle", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/marketing/marketing-shell.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/^import\s+\w+\s+from\s+["']\.\/concierge\/concierge-widget["']/m);
    expect(src).toMatch(/dynamic\(\(\) => import\(["']\.\/concierge\/concierge-widget["']\)/);
    expect(src).toMatch(/ssr:\s*false/);
  });
});
