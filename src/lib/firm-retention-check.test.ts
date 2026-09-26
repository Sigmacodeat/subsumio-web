// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const byType = vi.hoisted(() => new Map<string, Array<Record<string, unknown>>>());
const fail = vi.hoisted(() => ({ type: "" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async (_h: unknown, type: string) => {
    if (type === fail.type) throw new Error("HTTP 500");
    return byType.get(type) ?? [];
  },
}));

import { checkFirmRetention, retainedMessage } from "./firm-retention-check";

const now = new Date("2026-09-26T10:00:00Z");

beforeEach(() => {
  byType.clear();
  fail.type = "";
});

describe("checkFirmRetention", () => {
  it("clear when only the demo matter, deleted matters and expired receipts exist", async () => {
    byType.set("legal_case", [
      { slug: "demo", frontmatter: { status: "open", demo: true } },
      { slug: "trash", frontmatter: { status: "tombstoned", tombstone_reason: "manual_delete" } },
    ]);
    byType.set("invoice", [
      { slug: "i", frontmatter: { gobd_retention: true, hashed_at: "2015-01-01T00:00:00Z" } },
    ]);
    expect(await checkFirmRetention({}, now)).toEqual({ status: "clear" });
  });

  it("retained for a closed matter and a receipt in its period", async () => {
    byType.set("legal_case", [
      { slug: "closed", frontmatter: { status: "archived", closed_at: "2025-02-01" } },
    ]);
    byType.set("invoice", [
      { slug: "i", frontmatter: { gobd_retention: true, hashed_at: "2024-05-01T00:00:00Z" } },
    ]);
    const r = await checkFirmRetention({}, now);
    expect(r).toEqual({
      status: "retained",
      cases: ["closed"],
      receipts: 1,
      until: "2032-12-31",
      openCases: [],
    });
    if (r.status === "retained") expect(retainedMessage(r)).toMatch(/Export/);
  });

  it("unknown (never clear) when a read fails", async () => {
    fail.type = "invoice";
    expect(await checkFirmRetention({}, now)).toEqual({ status: "unknown" });
  });
});

describe("open matters are kept too", () => {
  it("an open (not archived, not deleted) matter blocks, with a close-first message", async () => {
    byType.set("legal_case", [{ slug: "laufend", frontmatter: { status: "open" } }]);
    const r = await checkFirmRetention({}, now);
    expect(r).toMatchObject({ status: "retained", cases: [], openCases: ["laufend"] });
    if (r.status === "retained") {
      expect(retainedMessage(r)).toMatch(/offene Akte/);
      expect(retainedMessage(r)).toMatch(/Papierkorb/);
      expect(retainedMessage(r)).toMatch(/Export/);
    }
  });
});
