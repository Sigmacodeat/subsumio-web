/**
 * Specialist definition unit tests.
 */

import { describe, it, expect } from "bun:test";
import {
  resolveSpecialist,
  EMBEDDED_SPECIALISTS,
  SPECIALIST_MAP,
} from "../src/core/minions/specialist-defs.ts";

describe("resolveSpecialist", () => {
  it("returns null for unknown names", () => {
    expect(resolveSpecialist("nonexistent")).toBeNull();
  });

  it("resolves every embedded specialist", () => {
    for (const s of EMBEDDED_SPECIALISTS) {
      const def = resolveSpecialist(s.name);
      expect(def).not.toBeNull();
      expect(def!.name).toBe(s.name);
      expect(def!.systemPrompt.length).toBeGreaterThan(50);
      expect(def!.allowedTools).toBeArray();
    }
  });

  it("legal-researcher has the right tools", () => {
    const def = resolveSpecialist("legal-researcher");
    expect(def).not.toBeNull();
    expect(def!.allowedTools).toContain("query");
    expect(def!.allowedTools).toContain("search");
    // perplexity_research is NOT a registered tool; including it makes
    // filterAllowedTools throw and crashes the specialist. It must stay out
    // until a real web/RIS tool is implemented. (Guarded broadly below.)
    expect(def!.allowedTools).not.toContain("perplexity_research");
    expect(def!.maxTurns).toBe(25);
  });

  it("no specialist references the unimplemented perplexity_research tool", () => {
    // filterAllowedTools throws on any unknown tool name, which would crash the
    // specialist mid-run. Guard every specialist so a stray re-add is caught here.
    for (const def of EMBEDDED_SPECIALISTS) {
      expect(def.allowedTools ?? []).not.toContain("perplexity_research");
    }
  });

  it("legal-critic has brain tools but no put_page", () => {
    const def = resolveSpecialist("legal-critic");
    expect(def).not.toBeNull();
    expect(def!.allowedTools).toContain("query");
    expect(def!.allowedTools).not.toContain("put_page");
  });

  it("legal-drafter can write pages", () => {
    const def = resolveSpecialist("legal-drafter");
    expect(def).not.toBeNull();
    expect(def!.allowedTools).toContain("put_page");
  });
});

describe("SPECIALIST_MAP", () => {
  it("contains exactly the embedded count", () => {
    expect(SPECIALIST_MAP.size).toBe(EMBEDDED_SPECIALISTS.length);
  });

  it("all names are unique", () => {
    const names = EMBEDDED_SPECIALISTS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
