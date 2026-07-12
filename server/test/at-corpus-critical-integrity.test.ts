import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { splitStatute } from "../src/core/legal/split-statute.ts";

const corpus = join(import.meta.dir, "..", "..", "law-corpus", "at");

function read(name: string): string {
  return readFileSync(join(corpus, name), "utf8");
}

function sectionBody(file: string, ref: string): string {
  const section = splitStatute(read(file)).sections.find((candidate) => candidate.ref === ref);
  expect(section, `${file} must contain § ${ref}`).toBeDefined();
  return section!.body;
}

describe("critical AT corpus identities", () => {
  test("AußStrG points to the current 2003 statute, not the repealed 1854 law", () => {
    const raw = read("au-strg.md");
    expect(raw).toMatch(/(?:Gesetzesnummer=|Bundesnormen\/)20003047(?:\/|\b)/);
    expect(raw).not.toMatch(/(?:Gesetzesnummer=|Bundesnormen\/)10001659(?:\/|\b)/);
    expect(sectionBody("au-strg.md", "46")).toContain("Frist für den Rekurs beträgt vierzehn Tage");
  });

  test("JN has the official identity and general venue rule", () => {
    const raw = read("jn.md");
    expect(raw).toMatch(/(?:Gesetzesnummer=|Bundesnormen\/)10001697(?:\/|\b)/);
    expect(sectionBody("jn.md", "66")).toContain("allgemeine Gerichtsstand einer Person");
  });
});
