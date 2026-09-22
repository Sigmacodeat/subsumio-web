import { describe, test, expect } from "vitest";
import {
  generateRubrum,
  generateLetterhead,
  buildLetterheadFromKanzleiSettings,
} from "./letterhead-rubrum";
import type { KanzleiSettings } from "@/lib/kanzlei-settings";

describe("letterhead-rubrum", () => {
  describe("generateRubrum", () => {
    test("generates rubrum with parties", () => {
      const rubrum = generateRubrum({
        court: "AG Berlin-Mitte",
        case_number: "123 C 456/23",
        plaintiffs: [{ name: "Max Mustermann", role: "plaintiff" }],
        defendants: [{ name: "Anna Schmidt", role: "defendant" }],
      });
      expect(rubrum).toContain("AG Berlin-Mitte");
      expect(rubrum).toContain("123 C 456/23");
      expect(rubrum).toContain("Max Mustermann");
      expect(rubrum).toContain("Anna Schmidt");
    });
  });

  describe("generateLetterhead", () => {
    test("generates letterhead with firm data", () => {
      const letterhead = generateLetterhead({
        firm_name: "Kanzlei Müller",
        address_line_1: "Berlinstraße 1",
        zip_city: "10115 Berlin",
        phone: "+49 30 1234567",
        email: "kanzlei@mueller.de",
        lawyers: [],
      });
      expect(letterhead).toContain("Kanzlei Müller");
      expect(letterhead).toContain("Berlinstraße 1");
    });
  });

  describe("buildLetterheadFromKanzleiSettings", () => {
    const base: KanzleiSettings = {
      kanzleiName: "Muster Rechtsanwälte",
      anwaltName: "Dr. Anna Muster",
      kammerNummer: "1234",
      ustId: "ATU12345678",
      stundensatz: "200",
      abrechnungstakt: "15",
      zahlungszielTage: "14",
      rechnungFooter: "",
      tarifModell: "custom",
      rechtsgebietSaetze: {},
      street: "Ringstraße 1",
      zip: "1010",
      city: "Wien",
      iban: "AT611904300234573201",
      bic: "BKAUATWW",
      bankName: "Erste Bank",
    };

    test("prefers structured street/zip/city over the legacy free-text address", () => {
      const lh = buildLetterheadFromKanzleiSettings({
        ...base,
        kanzleiAdresse: "Sollte nicht erscheinen",
      });
      expect(lh.address_line_1).toBe("Ringstraße 1");
      expect(lh.zip_city).toBe("1010 Wien");
    });

    test("falls back to the free-text address when street/zip/city are unset", () => {
      const lh = buildLetterheadFromKanzleiSettings({
        ...base,
        street: undefined,
        zip: undefined,
        city: undefined,
        kanzleiAdresse: "Alte Adresse 5, 1020 Wien",
      });
      expect(lh.address_line_1).toBe("Alte Adresse 5, 1020 Wien");
    });

    test("includes bank details only when IBAN and BIC are both set", () => {
      const withBank = buildLetterheadFromKanzleiSettings(base);
      expect(withBank.bank_details).toEqual({
        iban: "AT611904300234573201",
        bic: "BKAUATWW",
        bank_name: "Erste Bank",
      });
      const withoutBank = buildLetterheadFromKanzleiSettings({ ...base, iban: undefined });
      expect(withoutBank.bank_details).toBeUndefined();
    });

    test("lists the responsible lawyer with their Kammer-Nummer", () => {
      const lh = buildLetterheadFromKanzleiSettings(base);
      expect(lh.lawyers).toEqual([
        { name: "Dr. Anna Muster", title: "Rechtsanwalt/-anwältin", bar_number: "1234" },
      ]);
    });
  });
});
