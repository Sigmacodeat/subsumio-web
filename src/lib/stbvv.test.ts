import { describe, test, expect } from "vitest";
import { calculateStBVV, STBVV_ACTIVITIES } from "./stbvv";

describe("stbvv", () => {
  test("zero/negative Gegenstandswert → only Auslagenpauschale", () => {
    const r0 = calculateStBVV(0);
    expect(r0.basisGebuehr).toBe(0);
    expect(r0.gebuehrNetto).toBe(0);
    expect(r0.auslagenpauschale).toBe(20);
    expect(r0.summeNetto).toBe(20);
    expect(r0.mwst).toBe(3.8);
    expect(r0.summeBrutto).toBe(23.8);

    expect(calculateStBVV(-100).basisGebuehr).toBe(0);
    expect(calculateStBVV(NaN).basisGebuehr).toBe(0);
  });

  test("StBVV Anlage 1: 500 € → 15 € Grundgebühr", () => {
    const r = calculateStBVV(500, "steuererklaerung");
    expect(r.basisGebuehr).toBe(15);
    expect(r.gebuehrNetto).toBe(19.5); // 15 * 1.3
    expect(r.auslagenpauschale).toBe(20);
    expect(r.summeNetto).toBe(39.5);
    expect(r.mwst).toBe(7.51); // 39.5 * 0.19
    expect(r.summeBrutto).toBe(47.01);
  });

  test("StBVV Anlage 1: 3.000 € → 25 € Grundgebühr", () => {
    const r = calculateStBVV(3_000, "steuererklaerung");
    expect(r.basisGebuehr).toBe(25);
  });

  test("StBVV Anlage 1: 8.000 € → 40 € Grundgebühr", () => {
    const r = calculateStBVV(8_000, "steuererklaerung");
    expect(r.basisGebuehr).toBe(40);
  });

  test("StBVV Anlage 1: 50.000 € → 100 € Grundgebühr", () => {
    const r = calculateStBVV(50_000, "steuererklaerung");
    expect(r.basisGebuehr).toBe(100);
    expect(r.gebuehrNetto).toBe(130); // 100 * 1.3
  });

  test("StBVV Anlage 1: 750.000 € → 600 € Grundgebühr", () => {
    const r = calculateStBVV(750_000, "steuererklaerung");
    expect(r.basisGebuehr).toBe(600);
  });

  test("StBVV Anlage 1: 100.000.000 € → 3.500 € Grundgebühr (max stufe)", () => {
    const r = calculateStBVV(100_000_000, "steuererklaerung");
    expect(r.basisGebuehr).toBe(3_500);
  });

  test("activity factors are applied correctly", () => {
    const base = calculateStBVV(10_000, "steuererklaerung");
    const buchfuehrung = calculateStBVV(10_000, "buchfuehrung");
    const jahresabschluss = calculateStBVV(10_000, "jahresabschluss");
    const einspruch = calculateStBVV(10_000, "einspruch");

    expect(buchfuehrung.gebuehrNetto).toBe(base.basisGebuehr * 1.0);
    expect(base.gebuehrNetto).toBe(base.basisGebuehr * 1.3);
    expect(jahresabschluss.gebuehrNetto).toBe(base.basisGebuehr * 2.5);
    expect(einspruch.gebuehrNetto).toBe(base.basisGebuehr * 1.6);
  });

  test("custom faktor within range is applied", () => {
    const r = calculateStBVV(50_000, "steuererklaerung", 2.0);
    expect(r.activityFactor).toBe(2.0);
    expect(r.gebuehrNetto).toBe(200);
  });

  test("custom faktor below min is clamped", () => {
    const r = calculateStBVV(50_000, "steuererklaerung", 0.1);
    expect(r.activityFactor).toBe(0.5);
  });

  test("custom faktor above max is clamped", () => {
    const r = calculateStBVV(50_000, "steuererklaerung", 10);
    expect(r.activityFactor).toBe(2.5);
  });

  test("minGebuehr and maxGebuehr are correct", () => {
    const r = calculateStBVV(50_000, "steuererklaerung");
    expect(r.minGebuehr).toBe(50); // 100 * 0.5
    expect(r.maxGebuehr).toBe(250); // 100 * 2.5
  });

  test("vvNummer is set correctly", () => {
    expect(calculateStBVV(50_000, "steuererklaerung").vvNummer).toBe("VV 3300");
    expect(calculateStBVV(50_000, "jahresabschluss").vvNummer).toBe("VV 2500");
    expect(calculateStBVV(50_000, "buchfuehrung").vvNummer).toBe("VV 2400");
  });

  test("boundary: exactly 2.000 € → 15 € (first stufe)", () => {
    expect(calculateStBVV(2_000, "beratung").basisGebuehr).toBe(15);
  });

  test("boundary: 2.001 € → 25 € (second stufe)", () => {
    expect(calculateStBVV(2_001, "beratung").basisGebuehr).toBe(25);
  });

  test("StBVV activities list has all keys", () => {
    expect(STBVV_ACTIVITIES.length).toBe(10);
    expect(STBVV_ACTIVITIES.some((a) => a.value === "buchfuehrung")).toBe(true);
    expect(STBVV_ACTIVITIES.some((a) => a.value === "jahresabschluss")).toBe(true);
    expect(STBVV_ACTIVITIES.some((a) => a.value === "steuererklaerung")).toBe(true);
  });

  test("MwSt is 19%", () => {
    const r = calculateStBVV(25_000, "beratung");
    expect(r.mwst).toBe(Math.round(r.summeNetto * 0.19 * 100) / 100);
    expect(r.summeBrutto).toBe(r.summeNetto + r.mwst);
  });
});
