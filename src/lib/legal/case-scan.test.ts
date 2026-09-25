import { describe, expect, it } from "vitest";
import {
  CASE_SCAN_FINDING_MAX_CHARS,
  caseScanBookingKey,
  caseScanCost,
  extractScanFinding,
} from "./case-scan";
import { CREDIT_COSTS } from "@/lib/billing/credit-constants";

describe("case scan pricing", () => {
  it("costs matters × the canonical case_scan rate", () => {
    expect(caseScanCost(3)).toBe(3 * CREDIT_COSTS.case_scan);
    expect(caseScanCost(0)).toBe(0);
    expect(caseScanCost(-2)).toBe(0);
  });

  it("books each matter of a scan under its own key", () => {
    expect(caseScanBookingKey("scan-1", "cases/a")).not.toBe(
      caseScanBookingKey("scan-1", "cases/b")
    );
    expect(caseScanBookingKey("scan-1", "cases/a")).not.toBe(
      caseScanBookingKey("scan-2", "cases/a")
    );
  });
});

describe("extractScanFinding", () => {
  const page = (parts: string[]) => parts.join("\n\n");

  it("takes the result section, keeping headings inside it", () => {
    const text = extractScanFinding(
      page([
        "## Aufgabe\nPrüfe",
        "## Ergebnis\nEinleitung\n\n## Fristen\n§ 464 ZPO",
        "## Critic-Review\nVERDICT: publish",
        "## Specialist-Ergebnisse\nroh",
      ])
    );
    expect(text).toBe("Einleitung\n\n## Fristen\n§ 464 ZPO");
  });

  it("prefers the revised result", () => {
    const text = extractScanFinding(
      page([
        "## Ergebnis\nalt",
        "## Überarbeitetes Ergebnis (nach Critic)\nneu",
        "## Critic-Review\nVERDICT: revise",
      ])
    );
    expect(text).toBe("neu");
  });

  it("falls back to the whole page and caps the length", () => {
    expect(extractScanFinding("nur Text")).toBe("nur Text");
    expect(extractScanFinding("x".repeat(CASE_SCAN_FINDING_MAX_CHARS + 10)).length).toBe(
      CASE_SCAN_FINDING_MAX_CHARS + 1
    );
    expect(extractScanFinding(undefined)).toBe("");
  });
});
