import { describe, test, expect } from "vitest";
import { generateRubrum, generateLetterhead } from "./letterhead-rubrum";

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
});
