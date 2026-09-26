// @vitest-environment node
//
// /ops/engine shows platform figures only: it must not call firm-scoped
// routes (the operator's own brain, or a firm's during a support session).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/ops/engine data sources", () => {
  it("calls no firm-scoped brain or quota route", () => {
    const calls = [...source.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(calls).toEqual(["/api/admin/queue-health"]);
  });
});
