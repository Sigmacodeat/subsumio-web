// @vitest-environment node
// UI-6: pages outside the sidebar stay findable in the palette and point to
// real, non-parked pages. UI-7: every palette command that fires an event has
// a listener (the layout's overlay map or a page listener).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRA_NAV_COMMANDS } from "./command-palette";

const SRC = path.resolve(__dirname, "..", "..");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("command palette", () => {
  it("offers case scanner and version history, each on an existing, non-parked page", () => {
    const hrefs = EXTRA_NAV_COMMANDS.map((c) => c.href);
    expect(hrefs).toEqual(
      expect.arrayContaining(["/dashboard/case-scanner", "/dashboard/version-history"])
    );
    const middleware = readFileSync(path.join(SRC, "middleware.ts"), "utf8");
    for (const href of hrefs) {
      const dir = path.join(SRC, "app", ...href.split("/").filter(Boolean));
      expect(existsSync(path.join(dir, "page.tsx")), href).toBe(true);
      expect(middleware.includes(`["${href}",`), `${href} is parked`).toBe(false);
    }
  });

  it("fires only events that something listens to", () => {
    const palette = readFileSync(
      path.join(SRC, "components", "dashboard", "command-palette.tsx"),
      "utf8"
    );
    const fired = [...palette.matchAll(/new CustomEvent\("(subsumio:[a-z-]+)"\)/g)].map(
      (m) => m[1]!
    );
    expect(fired.length).toBeGreaterThan(0);

    const listened = new Set<string>();
    for (const file of filesUnder(SRC)) {
      if (file.endsWith("command-palette.tsx")) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/addEventListener\(\s*"(subsumio:[a-z-]+)"/g))
        listened.add(m[1]!);
      for (const m of text.matchAll(/"(subsumio:[a-z-]+)"\s*:\s*"[a-z]+"/g)) listened.add(m[1]!);
    }
    const orphans = fired.filter((name) => !listened.has(name));
    expect(orphans).toEqual([]);
  });
});
