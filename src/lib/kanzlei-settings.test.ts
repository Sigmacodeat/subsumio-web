// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  normalizeKanzleiSettings,
  DEFAULT_KANZLEI_SETTINGS,
  readLocalKanzleiSettings,
  KANZLEI_SETTINGS_SLUG,
} from "./kanzlei-settings";

describe("DEFAULT_KANZLEI_SETTINGS", () => {
  test("has sensible defaults", () => {
    expect(DEFAULT_KANZLEI_SETTINGS.stundensatz).toBe("200");
    expect(DEFAULT_KANZLEI_SETTINGS.abrechnungstakt).toBe("15");
    expect(DEFAULT_KANZLEI_SETTINGS.zahlungszielTage).toBe("14");
    expect(DEFAULT_KANZLEI_SETTINGS.tarifModell).toBe("custom");
  });

  test("has default rechtsgebietSaetze", () => {
    expect(DEFAULT_KANZLEI_SETTINGS.rechtsgebietSaetze.allgemein).toBe(200);
    expect(DEFAULT_KANZLEI_SETTINGS.rechtsgebietSaetze.prozessrecht).toBe(250);
  });
});

describe("normalizeKanzleiSettings", () => {
  test("returns defaults for null input", () => {
    const result = normalizeKanzleiSettings(null);
    expect(result).toEqual(DEFAULT_KANZLEI_SETTINGS);
  });

  test("returns defaults for undefined input", () => {
    const result = normalizeKanzleiSettings(undefined);
    expect(result).toEqual(DEFAULT_KANZLEI_SETTINGS);
  });

  test("merges partial input over defaults", () => {
    const result = normalizeKanzleiSettings({ kanzleiName: "Test Kanzlei" });
    expect(result.kanzleiName).toBe("Test Kanzlei");
    expect(result.stundensatz).toBe("200"); // default kept
  });

  test("deep-merges rechtsgebietSaetze", () => {
    const result = normalizeKanzleiSettings({
      rechtsgebietSaetze: { allgemein: 300 },
    });
    expect(result.rechtsgebietSaetze.allgemein).toBe(300);
    expect(result.rechtsgebietSaetze.prozessrecht).toBe(250); // default kept
  });

  test("preserves all provided fields", () => {
    const result = normalizeKanzleiSettings({
      kanzleiName: "Kanzlei A",
      anwaltName: "Dr. A",
      ustId: "DE123",
      stundensatz: "350",
    });
    expect(result.kanzleiName).toBe("Kanzlei A");
    expect(result.anwaltName).toBe("Dr. A");
    expect(result.ustId).toBe("DE123");
    expect(result.stundensatz).toBe("350");
  });
});

describe("KANZLEI_SETTINGS_SLUG", () => {
  test("is a fixed slug", () => {
    expect(KANZLEI_SETTINGS_SLUG).toBe("legal/settings/kanzlei");
  });
});

describe("readLocalKanzleiSettings", () => {
  test("returns defaults on server (no window)", () => {
    const result = readLocalKanzleiSettings();
    expect(result).toEqual(DEFAULT_KANZLEI_SETTINGS);
  });
});

describe("vatRateFor", async () => {
  const { vatRateFor } = await import("./kanzlei-settings");
  it("uses the country's standard rate, Austria by default", () => {
    expect(vatRateFor({ country: "AT" })).toBe(0.2);
    expect(vatRateFor({})).toBe(0.2);
    expect(vatRateFor({ country: "DE" })).toBe(0.19);
    expect(vatRateFor({ country: "CH" })).toBe(0.081);
  });
  it("never keys the VAT on the fee model", () => {
    expect(vatRateFor({ country: "AT", tarifModell: "custom" })).toBe(0.2);
    expect(vatRateFor({ country: "AT", tarifModell: "rvg" })).toBe(0.2);
  });
  it("issues Kleinunternehmer invoices without VAT", () => {
    expect(vatRateFor({ country: "AT", kleinunternehmer: true })).toBe(0);
  });
});

describe("clampHourlyRate", async () => {
  const { clampHourlyRate, normalizeKanzleiSettings, MAX_HOURLY_RATE_EUR } =
    await import("./kanzlei-settings");
  it("keeps sane rates and caps typos", () => {
    expect(clampHourlyRate("250")).toBe("250");
    expect(clampHourlyRate(220250)).toBe(String(MAX_HOURLY_RATE_EUR));
    expect(clampHourlyRate("abc")).toBe("200");
    expect(clampHourlyRate("0")).toBe("200");
  });
  it("is applied by normalizeKanzleiSettings", () => {
    expect(normalizeKanzleiSettings({ stundensatz: "220250" }).stundensatz).toBe("5000");
    expect(normalizeKanzleiSettings({ stundensatz: "180" }).stundensatz).toBe("180");
  });
});

describe("onboardingMayWriteKanzleiSettings (OPS-19)", async () => {
  const { onboardingMayWriteKanzleiSettings, isKanzleiProfileConfigured } =
    await import("./kanzlei-settings");
  test("a member joining a configured firm never writes the settings", () => {
    const existing = normalizeKanzleiSettings({ kanzleiName: "Kanzlei A", iban: "AT1" });
    expect(onboardingMayWriteKanzleiSettings("lawyer", existing)).toBe(false);
    expect(onboardingMayWriteKanzleiSettings("assistant", null)).toBe(false);
  });
  test("an admin writes only while no profile exists", () => {
    expect(onboardingMayWriteKanzleiSettings("admin", normalizeKanzleiSettings({}))).toBe(true);
    expect(
      onboardingMayWriteKanzleiSettings("admin", normalizeKanzleiSettings({ kanzleiName: "A" }))
    ).toBe(false);
  });
  test("provisioned defaults do not count as a configured profile", () => {
    expect(isKanzleiProfileConfigured(normalizeKanzleiSettings({ rechtsraumCountry: "AT" }))).toBe(
      false
    );
  });
});

describe("browser copy holds no secret (OPS-18)", async () => {
  const { writeLocalKanzleiSettings } = await import("./kanzlei-settings");
  test("writeLocalKanzleiSettings drops the SMTP password", () => {
    const store = new Map<string, string>();
    const g = globalThis as unknown as { window?: unknown };
    g.window = {
      localStorage: {
        setItem: (k: string, v: string) => store.set(k, v),
        getItem: (k: string) => store.get(k) ?? null,
      },
    };
    try {
      writeLocalKanzleiSettings(
        normalizeKanzleiSettings({ kanzleiName: "A", smtpPassword: "geheim" })
      );
      const saved = JSON.parse(store.get("kanzlei_settings") ?? "{}");
      expect(saved.kanzleiName).toBe("A");
      expect(saved).not.toHaveProperty("smtpPassword");
      expect(readLocalKanzleiSettings()).not.toHaveProperty("smtpPassword");
    } finally {
      delete g.window;
    }
  });
});
