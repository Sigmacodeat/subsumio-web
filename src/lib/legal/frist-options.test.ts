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

  it("§ 73 ZPO: passes a Verfahrenshilfeantrag through to the engine and reports the interruption", () => {
    const withoutVh = computeFrist("rekurs", "2026-03-02", { country: "AT" });
    expect(withoutVh.verfahrenshilfeUnterbrochen).toBe(false);

    const stillOpen = computeFrist("rekurs", "2026-03-02", {
      country: "AT",
      verfahrenshilfe: { antragAm: "2026-03-10" },
    });
    expect(stillOpen.verfahrenshilfeUnterbrochen).toBe(true);
    expect(stillOpen.dueDate).toBe(withoutVh.dueDate); // ruht — kein neues Fristende bekannt
    expect(stillOpen.hinweise.some((h) => h.includes("§ 73 Abs 1 ZPO"))).toBe(true);

    const resumed = computeFrist("rekurs", "2026-03-02", {
      country: "AT",
      verfahrenshilfe: { antragAm: "2026-03-10", fortsetzungAm: "2026-04-01" },
    });
    const direct = computeFrist("rekurs", "2026-04-01", { country: "AT" });
    expect(resumed.verfahrenshilfeUnterbrochen).toBe(true);
    expect(resumed.dueDate).toBe(direct.dueDate); // voller Neustart, nicht bloß der Rest
  });
});

describe("computeFrist (DE)", () => {
  it("uses the generic rule table", () => {
    const r = computeFrist("zpo-berufung", "2026-10-05", { country: "DE", state: "BY" });
    expect(r.law).toContain("517");
    expect(r.vorfrist).toBeUndefined();
  });
});

describe("computeFrist — Ferialsache (§ 222 Abs 2 ZPO) und VfGH (§ 35 VfGG) (FRI-3/FRI-4)", () => {
  it("§ 521 Abs 1 iVm § 222 Abs 2 Z 6 ZPO: Rekurs gegen EV-Beschluss, zugestellt 2026-07-20, Ferialsache → 2026-08-03", () => {
    expect(computeFrist("rekurs", "2026-07-20", { country: "AT", ferialsache: true }).dueDate).toBe(
      "2026-08-03"
    );
  });

  it("§ 222 Abs 1 ZPO: ohne Ferialsache-Angabe bei Zustellung in der vhfZ → verlängert + Warnhinweis auf § 222 Abs 2", () => {
    const r = computeFrist("rekurs", "2026-07-20", { country: "AT" });
    expect(r.dueDate).toBe("2026-08-31");
    expect(r.ferialsacheRelevant).toBe(true);
    expect(r.vhfzVerlaengert).toBe(true);
    expect(r.hinweise.some((h) => h.includes("§ 222 Abs 2 ZPO"))).toBe(true);
  });

  it("§ 464 Abs 1 ZPO: Zustellung außerhalb der vhfZ ohne Überschneidung → keine Warnung", () => {
    const r = computeFrist("berufung", "2026-03-02", { country: "AT" });
    expect(r.dueDate).toBe("2026-03-30");
    expect(r.vhfzVerlaengert).toBe(false);
    expect(r.hinweise.some((h) => h.includes("Ferialsache prüfen"))).toBe(false);
  });

  it("§ 230 Abs 1 ZPO: Klagebeantwortung ist keine vhfZ-gehemmte Frist → Ferialsache nicht relevant", () => {
    expect(
      computeFrist("klagebeantwortung", "2026-07-20", { country: "AT" }).ferialsacheRelevant
    ).toBe(false);
  });

  it("§ 82 Abs 1 iVm § 35 VfGG, § 126 Abs 2 ZPO: VfGH-Beschwerde 6 Wochen ab 2026-11-12 endet am 24.12.", () => {
    expect(computeFrist("beschwerde_vfgh", "2026-11-12", { country: "AT" }).dueDate).toBe(
      "2026-12-24"
    );
  });

  it("DE-Fristen haben keine Ferialsache-Frage", () => {
    const r = computeFrist("zpo-berufung", "2026-07-20", { country: "DE", state: "BY" });
    expect(r.ferialsacheRelevant).toBe(false);
  });
});
