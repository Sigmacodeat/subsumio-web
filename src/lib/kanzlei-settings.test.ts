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
