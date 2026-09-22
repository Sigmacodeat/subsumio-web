import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// primitives.tsx is a "use client" module. A Server Component that imports a
// plain string constant from it does not get the string — it gets a client
// reference, and `className={H2_CTA_CLASS}` renders garbage. That is how the
// headline in the dark proof band of the solution pages ended up tiny and
// dark-on-dark. Class constants must come from ./typography (a pure module).
const CONSTANTS = [
  "H1_CLASS",
  "H2_CTA_CLASS",
  "H3_CLASS",
  "EYEBROW_CLASS",
  "SECTION_PAD",
  "SECTION_PAD_FLUSH",
  "SECTION_COLUMN",
];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

describe("class constants in Server Components", () => {
  test("no server file imports them from the client module primitives.tsx", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(path.join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(src.slice(0, 300))) continue;
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"[^"]*primitives"/g)) {
        const bad = m[1]
          .split(",")
          .map((n) => n.trim())
          .filter((n) => CONSTANTS.includes(n));
        if (bad.length) offenders.push(`${path.relative(process.cwd(), file)}: ${bad.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
