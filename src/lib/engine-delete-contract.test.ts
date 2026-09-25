// @vitest-environment node
// ENG-9: the engine has a DELETE /api/pages/{slug} route (soft-delete). The
// contract comments in src/lib must not claim otherwise — that claim led
// callers to tombstone instead of deleting.
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const LIB = path.join(process.cwd(), "src/lib");
const WRONG_CLAIM = /\bno\s+`?DELETE`?\s+route\b|\bengine has no delete\b/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("engine delete contract docs (ENG-9)", () => {
  it("no library comment claims the engine has no DELETE route", () => {
    const offenders = files(LIB).filter((f) => WRONG_CLAIM.test(readFileSync(f, "utf-8")));
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
