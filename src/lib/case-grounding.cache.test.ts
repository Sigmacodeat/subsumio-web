// @vitest-environment node
// The decision index of the citation check picks up new corpus files after
// its lifetime, and a failed directory read is not cached.
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const readFile = vi.fn();
  const readdir = vi.fn();
  return {
    ...actual,
    default: { ...actual, promises: { readFile, readdir } },
    promises: { readFile, readdir },
  };
});

import { promises as fs } from "node:fs";
import { groundCaseCitations } from "@/lib/case-grounding";
import { extractCaseCitations } from "@/lib/case-citations";

const decision = [
  "---",
  'source_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_9"',
  "---",
  "Text der Entscheidung.",
].join("\n");

afterEach(() => vi.useRealTimers());

describe("case index lifetime", () => {
  test("a failed read is retried; a decision added later is found after the index expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T08:00:00Z"));
    const cite = extractCaseCitations("OGH 2 Ob 77/26k");
    vi.mocked(fs.readFile).mockResolvedValue(decision as never);

    // Corpus mount not ready yet.
    vi.mocked(fs.readdir).mockRejectedValueOnce(new Error("ENOENT"));
    expect((await groundCaseCitations(cite))[0]!.verified).toBe(false);

    // Next check reads again (the failure was not cached) — still not there.
    vi.mocked(fs.readdir).mockResolvedValueOnce([] as never);
    expect((await groundCaseCitations(cite))[0]!.verified).toBe(false);

    // The delta adds the decision; within the index lifetime it is not re-read…
    vi.mocked(fs.readdir).mockResolvedValue(["2026-09-25-2ob77-26k.md"] as never);
    expect((await groundCaseCitations(cite))[0]!.verified).toBe(false);

    // …after it, the new decision is found.
    vi.setSystemTime(new Date("2026-09-26T09:01:00Z"));
    expect((await groundCaseCitations(cite))[0]!.verified).toBe(true);
  });
});
