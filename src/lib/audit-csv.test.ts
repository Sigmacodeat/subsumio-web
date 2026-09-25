import { describe, expect, it } from "vitest";
import { buildAuditCsv, csvField, formatViennaTimestamp } from "./audit-csv";

const labels = { action: (a: string) => `L:${a}`, entity: (t?: string) => `E:${t ?? ""}` };

describe("csvField", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvField('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvField("+1")).toBe(`"'+1"`);
    expect(csvField("-2")).toBe(`"'-2"`);
    expect(csvField("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });

  it("doubles embedded quotes and keeps commas/newlines inside the field", () => {
    expect(csvField('Müller "Bau", GmbH\nWien')).toBe(`"Müller ""Bau"", GmbH\nWien"`);
  });

  it("renders null/undefined as empty field", () => {
    expect(csvField(undefined)).toBe('""');
  });
});

describe("formatViennaTimestamp", () => {
  it("uses Vienna wall-clock time with offset (summer time)", () => {
    expect(formatViennaTimestamp("2026-09-24T22:30:00Z")).toBe("25.09.2026 00:30:00 (UTC+02:00)");
  });
  it("accepts the Postgres timestamptz text form", () => {
    expect(formatViennaTimestamp("2026-09-24 22:30:00.123456+00")).toBe(
      "25.09.2026 00:30:00 (UTC+02:00)"
    );
  });
  it("winter time", () => {
    expect(formatViennaTimestamp("2026-01-15T08:00:00Z")).toBe("15.01.2026 09:00:00 (UTC+01:00)");
  });
});

describe("buildAuditCsv", () => {
  it("escapes every column, including the entity id", () => {
    const csv = buildAuditCsv(
      [
        {
          id: "1",
          action: "case.create",
          entityType: "case",
          entityId: '=cmd|" /C calc"!A0',
          userEmail: "a@b.at",
          details: { name: '-x", "y' },
          timestamp: "2026-09-24T22:30:00Z",
        },
      ],
      labels
    );
    const [header, row] = csv.replace(/^﻿/, "").split("\r\n");
    expect(header.startsWith('"Zeitpunkt (Wien)"')).toBe(true);
    expect(row).toContain(`"'=cmd|"" /C calc""!A0"`);
    expect(row).toContain('"25.09.2026 00:30:00 (UTC+02:00)"');
    // details JSON starts with "{", stays intact but quoted
    expect(row).toContain('"{""name"":""-x\\"", \\""y""}"');
  });
});
