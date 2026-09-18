import { describe, expect, it } from "vitest";
import { berechneFristAuto, zustellungERV } from "@/lib/legal/frist-engine";
import { computeFrist, fristOptionsFor, resolveFristCountry } from "@/lib/legal/frist-options";

describe("fristOptionsFor", () => {
  it("offers the Austrian engine registry when no Rechtsraum is configured", () => {
    const keys = fristOptionsFor(undefined).map((o) => o.key);
    expect(keys).toContain("berufung");
    expect(keys).toContain("klagebeantwortung");
    expect(keys).not.toContain("zpo-berufung");
  });

  it("leaves German and Swiss registry entries out of the Austrian list", () => {
    const keys = fristOptionsFor("AT").map((o) => o.key);
    expect(keys.some((k) => k.endsWith("_de") || k.endsWith("_ch"))).toBe(false);
    expect(keys).toContain("steuer_berufung_at");
  });

  it("keeps the generic table for German firms", () => {
    const keys = fristOptionsFor("DE").map((o) => o.key);
    expect(keys).toContain("zpo-berufung");
    expect(keys).not.toContain("berufung");
  });

  it("treats unknown countries as Austria", () => {
    expect(resolveFristCountry("")).toBe("AT");
    expect(resolveFristCountry("XX")).toBe("AT");
    expect(resolveFristCountry("CH")).toBe("CH");
  });
});

describe("computeFrist (AT)", () => {
  it("matches the frist-engine for a Berufung", () => {
    const r = computeFrist("berufung", "2026-10-05", { country: "AT" });
    const engine = berechneFristAuto("berufung", "2026-10-05");
    expect(r.dueDate).toBe(engine.fristende);
    expect(r.vorfrist).toBe(engine.vorfrist);
    expect(r.law).toBe("§ 464 Abs 1 ZPO");
    expect(r.notfrist).toBe(true);
  });

  it("applies the § 89a GOG service fiction for an ERV arrival on a Friday", () => {
    // 2026-10-09 is a Friday; service is deemed on Monday 2026-10-12.
    const r = computeFrist("berufung", "2026-10-09", { country: "AT", ervEinlangen: true });
    expect(zustellungERV("2026-10-09")).toBe("2026-10-12");
    expect(r.dueDate).toBe(berechneFristAuto("berufung", "2026-10-12").fristende);
    expect(r.hinweise[0]).toContain("§ 89a Abs 2 GOG");
  });

  it("differs from a plain start date when the ERV fiction moves service", () => {
    const plain = computeFrist("klagebeantwortung", "2026-10-09", { country: "AT" });
    const erv = computeFrist("klagebeantwortung", "2026-10-09", {
      country: "AT",
      ervEinlangen: true,
    });
    expect(erv.dueDate > plain.dueDate).toBe(true);
  });

  it("refuses German keys instead of silently using another rule set", () => {
    expect(() => computeFrist("zpo-berufung", "2026-10-05", { country: "AT" })).toThrow(/Fristart/);
    expect(() => computeFrist("steuer_einspruch_de", "2026-10-05", { country: "AT" })).toThrow();
  });
});

describe("computeFrist (DE)", () => {
  it("uses the generic rule table", () => {
    const r = computeFrist("zpo-berufung", "2026-10-05", { country: "DE", state: "BY" });
    expect(r.law).toContain("517");
    expect(r.vorfrist).toBeUndefined();
  });
});
