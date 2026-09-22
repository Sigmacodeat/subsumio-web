// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  allocatePayment,
  applyInstallmentPayment,
  buildExekutionsantrag,
  buildMahnAntrag,
  createClaim,
  createInstallmentPlan,
  createZvMeasure,
  getClaimStatusLabel,
  getZvTypeLabel,
  InstallmentPlanError,
  isInstallmentPlanDefaulted,
  refreshInstallmentStatuses,
} from "./claim-account";

const baseClaim = () =>
  createClaim({
    case_slug: "legal/akte-1",
    claimant_name: "Kläger GmbH",
    debtor_name: "Max Schuldner",
    debtor_address: "Musterstraße 1, 1010 Wien",
    principal_amount: 10_000,
    interest_amount: 500,
    costs_amount: 150,
    interest_rate: 4,
    interest_from: "2026-01-01",
    due_date: "2026-01-15",
    jurisdiction: "at",
  });

describe("allocatePayment (§ 1415 ABGB / § 367 BGB)", () => {
  test("Tilgungsreihenfolge: Kosten → Zinsen → Haupt", () => {
    const claim = baseClaim();
    const alloc = allocatePayment(claim, 1_000);
    expect(alloc.allocated_costs).toBe(150);
    expect(alloc.allocated_interest).toBe(500);
    expect(alloc.allocated_principal).toBe(350);
  });
});

describe("Ratenvereinbarung", () => {
  test("Raten decken den offenen Betrag exakt (Rest auf letzter Rate)", () => {
    const plan = createInstallmentPlan(baseClaim(), { count: 3, startIso: "2026-02-01" });
    const sum = plan.installments.reduce((s, i) => s + i.amount, 0);
    expect(Math.round(sum * 100)).toBe(Math.round(10_650 * 100));
    expect(plan.installments).toHaveLength(3);
    expect(plan.installments[1]!.due_date).toBe("2026-03-01");
  });

  test("ungültige Anzahl wirft", () => {
    expect(() => createInstallmentPlan(baseClaim(), { count: 1, startIso: "2026-02-01" })).toThrow(
      InstallmentPlanError
    );
  });

  test("Zahlung wird auf älteste offene Rate gebucht", () => {
    const plan = createInstallmentPlan(baseClaim(), { count: 3, startIso: "2026-02-01" });
    const first = plan.installments[0]!.amount;
    const { plan: updated, applied } = applyInstallmentPayment(plan, first + 10);
    expect(applied).toBe(first + 10);
    expect(updated.installments[0]!.status).toBe("bezahlt");
    expect(updated.installments[1]!.paid_amount).toBeCloseTo(10, 2);
  });

  test("Verfallsklausel: Rate über Toleranz überfällig → Gesamtfälligkeit", () => {
    const plan = createInstallmentPlan(baseClaim(), {
      count: 3,
      startIso: "2026-01-01",
      graceDays: 14,
    });
    expect(isInstallmentPlanDefaulted(plan, "2026-01-10")).toBe(false);
    expect(isInstallmentPlanDefaulted(plan, "2026-01-20")).toBe(true);
  });

  test("refreshInstallmentStatuses markiert überfällige Raten", () => {
    const plan = createInstallmentPlan(baseClaim(), { count: 2, startIso: "2026-01-01" });
    const r = refreshInstallmentStatuses(plan, "2026-01-15");
    expect(r.installments[0]!.status).toBe("überfällig");
    expect(r.installments[1]!.status).toBe("offen");
  });
});

describe("Mahnklage / Mahnbescheid Antragsdaten", () => {
  test("AT: Mahnklage enthält §§ 244 ff. ZPO und EKV-Hinweis", () => {
    const a = buildMahnAntrag(baseClaim(), { jurisdiction: "at", gericht: "BG Innere Stadt" });
    expect(a.art).toBe("mahnklage");
    expect(a.rechtsgrundlage).toContain("244");
    expect(a.antragstext).toContain("MAHNKLAGE");
    expect(a.antragstext).toContain("BG Innere Stadt");
    expect(a.antragstext).toContain("650,00");
    expect(a.hinweise.some((h) => h.includes("75.000"))).toBe(true);
  });

  test("DE: Mahnbescheid enthält §§ 688 ff. ZPO", () => {
    const a = buildMahnAntrag(baseClaim(), {
      jurisdiction: "de",
      gericht: "Mahngericht Berlin-Wedding",
    });
    expect(a.art).toBe("mahnbescheid");
    expect(a.rechtsgrundlage).toContain("688");
    expect(a.antragstext).toContain("MAHNBESCHEID");
    expect(a.antragstext).toContain("Mahngericht Berlin-Wedding");
  });

  test("kein offener Betrag → Fehler", () => {
    const c = { ...baseClaim(), open_amount: 0 };
    expect(() => buildMahnAntrag(c, { jurisdiction: "at", gericht: "BG X" })).toThrow(
      InstallmentPlanError
    );
  });
});

describe("Exekutionsantrag", () => {
  test("AT: Exekutionsantrag mit EO-Grundlage und Drittschuldner-Hinweis", () => {
    const claim = baseClaim();
    const measure = createZvMeasure({
      claim_id: claim.id,
      type: "pfändung_forderungen",
      target: "Arbeitgeber GmbH (Drittschuldner)",
      court: "BG Hernals",
    });
    const a = buildExekutionsantrag(claim, measure, {
      jurisdiction: "at",
      gericht: "BG Hernals",
      titel: "Zahlungsbefehl BG X, 25 A 1/26, rechtskräftig",
    });
    expect(a.art).toBe("exekution");
    expect(a.rechtsgrundlage).toContain("EO");
    expect(a.antragstext).toContain("Forderungsexekution");
    expect(a.antragstext).toContain("Drittschuldner");
  });

  test("DE: ZV-Antrag mit §§ 750 ff. ZPO", () => {
    const claim = baseClaim();
    const measure = createZvMeasure({
      claim_id: claim.id,
      type: "pfändung_und_überweisung",
      target: "Konto IBAN DE12…",
      court: "AG Mitte",
    });
    const a = buildExekutionsantrag(claim, measure, {
      jurisdiction: "de",
      gericht: "AG Mitte",
      titel: "Vollstreckungsbescheid, Az 12-345",
    });
    expect(a.rechtsgrundlage).toContain("750");
    expect(a.antragstext).toContain("Pfändungs- und Überweisungsbeschluss");
  });
});

describe("Jurisdiktions-Labels", () => {
  test("Status-Labels unterscheiden AT/DE", () => {
    expect(getClaimStatusLabel("mahnbescheid", "at")).toBe("Mahnklage");
    expect(getClaimStatusLabel("mahnbescheid", "de")).toBe("Mahnbescheid");
    expect(getClaimStatusLabel("zwangsvollstreckung", "at")).toBe("Exekution");
  });

  test("ZV-Typ-Labels unterscheiden AT/DE", () => {
    expect(getZvTypeLabel("pfändung_forderungen", "at")).toContain("Forderungsexekution");
    expect(getZvTypeLabel("pfändung_forderungen", "de")).toBe("Forderungspfändung");
    expect(getZvTypeLabel("eidesstattliche_versicherung", "at")).toContain("Vermögensverzeichnis");
  });
});
