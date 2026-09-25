// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import {
  CORPUS_META,
  groundCitations,
  lookupAtNormFile,
  readNorm,
  viennaToday,
} from "@/lib/legal-grounding";

const TODAY = viennaToday();

function isoShift(days: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normFile(
  fm: Record<string, string>,
  body = "Jedermann ist berechtigt, Ersatz zu fordern."
): string {
  return [
    "---",
    'gesetzesnummer: "10001622"',
    ...Object.entries(fm).map(([k, v]) => `${k}: "${v}"`),
    "---",
    "",
    "# § 1295 ABGB",
    "",
    body,
  ].join("\n");
}

/** path basename → file content; anything else is ENOENT. */
function corpus(files: Record<string, string>) {
  vi.mocked(fs.readFile).mockImplementation((async (p: string) => {
    const name = String(p).split("/").pop()!;
    if (name in files) return files[name];
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }) as never);
  vi.mocked(fs.readdir).mockResolvedValue(Object.keys(files) as never);
}

beforeEach(() => {
  vi.mocked(fs.readFile).mockReset();
  vi.mocked(fs.readdir).mockReset();
});

describe("repealed norms are never verified", () => {
  it("a norm außer Kraft since yesterday is not verified and says since when", async () => {
    corpus({ "p-1295.md": normFile({ ausserkrafttretensdatum: isoShift(-1) }) });
    const [c] = await groundCitations([{ code: "ABGB", paragraph: "§ 1295" }], {
      jurisdiction: "at",
    });
    expect(c.verified).toBe(false);
    expect(c.in_force).toBe(false);
    expect(c.repealed_since).toBe(isoShift(-1));
    expect(c.unverifiable_reason).toMatch(/^Nicht mehr in Kraft \(seit \d{2}\.\d{2}\.\d{4}\)/);
    // The last wording is still shown for context.
    expect(c.source_text).toContain("Jedermann");
  });

  it("the corpus flag deprecated: true also means not in force", async () => {
    corpus({
      "p-1295.md": normFile({ deprecated: "true" }).replace(
        'deprecated: "true"',
        "deprecated: true"
      ),
    });
    const [c] = await groundCitations([{ code: "ABGB", paragraph: "§ 1295" }], {
      jurisdiction: "at",
    });
    expect(c.verified).toBe(false);
    expect(c.unverifiable_reason).toBe("Nicht mehr in Kraft — geltende Fassung prüfen");
  });

  it("Außerkrafttreten tomorrow: still in force today", async () => {
    corpus({ "p-1295.md": normFile({ ausserkrafttretensdatum: isoShift(1) }) });
    const [c] = await groundCitations([{ code: "ABGB", paragraph: "§ 1295" }], {
      jurisdiction: "at",
    });
    expect(c.verified).toBe(true);
    expect(c.in_force).toBeUndefined();
  });

  it("of two versions the one in force wins, even when the newer one is already repealed", async () => {
    corpus({
      "p-1295-nor1.md": normFile(
        { inkrafttretensdatum: "2000-01-01" },
        "Geltender Wortlaut der Norm."
      ),
      "p-1295-nor2.md": normFile(
        { inkrafttretensdatum: "2020-01-01", ausserkrafttretensdatum: "2021-01-01" },
        "Kurzzeitiger Wortlaut der Norm."
      ),
    });
    const r = await lookupAtNormFile(CORPUS_META["abgb"], "§ 1295");
    expect(r?.repealed).toBe(false);
    expect(r?.text).toContain("Geltender Wortlaut");
  });

  it("a repealed single file falls back to a NOR version in force", async () => {
    corpus({
      "p-1295.md": normFile(
        { ausserkrafttretensdatum: "2019-01-01" },
        "Alter Wortlaut der Norm hier."
      ),
      "p-1295-nor9.md": normFile(
        { inkrafttretensdatum: "2019-01-01" },
        "Neuer Wortlaut der Norm hier."
      ),
    });
    const r = await lookupAtNormFile(CORPUS_META["abgb"], "§ 1295");
    expect(r?.repealed).toBe(false);
    expect(r?.text).toContain("Neuer Wortlaut");
  });

  it("with every version repealed, the latest one is reported with its date", async () => {
    corpus({
      "p-1295-nor1.md": normFile({
        inkrafttretensdatum: "2000-01-01",
        ausserkrafttretensdatum: "2010-01-01",
      }),
      "p-1295-nor2.md": normFile({
        inkrafttretensdatum: "2010-01-01",
        ausserkrafttretensdatum: "2015-07-01",
      }),
    });
    const r = await lookupAtNormFile(CORPUS_META["abgb"], "§ 1295");
    expect(r?.repealed).toBe(true);
    expect(r?.repealedSince).toBe("2015-07-01");
  });

  it("a version entering into force later is not chosen", async () => {
    corpus({
      "p-1295-nor1.md": normFile(
        { inkrafttretensdatum: "2000-01-01" },
        "Heute geltender Wortlaut."
      ),
      "p-1295-nor2.md": normFile(
        { inkrafttretensdatum: isoShift(30) },
        "Künftiger Wortlaut der Norm."
      ),
    });
    const r = await lookupAtNormFile(CORPUS_META["abgb"], "§ 1295");
    expect(r?.text).toContain("Heute geltender");
  });

  it("the norm reader reports the repeal too", async () => {
    corpus({ "p-1295.md": normFile({ ausserkrafttretensdatum: "01.01.2024" }) });
    const n = await readNorm("ABGB", "§ 1295", "at");
    expect(n?.repealed).toBe(true);
    expect(n?.repealed_since).toBe("2024-01-01");
  });
});

describe("viennaToday", () => {
  it("uses the Vienna calendar day, not UTC", () => {
    // 22:30 UTC on 25.09. is already 26.09. in Vienna (CEST, UTC+2).
    expect(viennaToday(new Date("2026-09-25T22:30:00Z"))).toBe("2026-09-26");
    expect(viennaToday(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15");
  });
});
