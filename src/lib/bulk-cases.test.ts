// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  parseCsvCases,
  caseSlugFromRow,
  caseFrontmatterFromRow,
  groupByMandateId,
  type BulkCaseRow,
  type PortfolioItem,
} from "./bulk-cases";

describe("parseCsvCases", () => {
  test("parses valid CSV with English headers", () => {
    const csv = `case_number,client_name,matter,mandate_id
123,Max Muster,Kündigung,M-2026-001
456,Anna Schmidt,Unterhaltsklage,M-2026-002`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.case_number).toBe("123");
    expect(rows[0]!.client_name).toBe("Max Muster");
    expect(rows[0]!.matter).toBe("Kündigung");
    expect(rows[0]!.mandate_id).toBe("M-2026-001");
  });

  test("parses German headers (Aktenzeichen, Mandant, etc.)", () => {
    const csv = `aktenzeichen,mandant,gegenstand,klammer
789,Dr. Weber,Schiedsverfahren,K-2026-003`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.case_number).toBe("789");
    expect(rows[0]!.client_name).toBe("Dr. Weber");
    expect(rows[0]!.matter).toBe("Schiedsverfahren");
    expect(rows[0]!.mandate_id).toBe("K-2026-003");
  });

  test("parses optional fields (email, opponent, court, dispute_value)", () => {
    const csv = `case_number,client_name,client_email,opponent_name,matter,legal_area,court,dispute_value,mandate_id
100,Test Client,client@example.com,Opponent AG,Vertragsstreit,Arbeitsrecht,Arbeitsgericht Wien,50000,M-001`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_email).toBe("client@example.com");
    expect(rows[0]!.opponent_name).toBe("Opponent AG");
    expect(rows[0]!.legal_area).toBe("Arbeitsrecht");
    expect(rows[0]!.court).toBe("Arbeitsgericht Wien");
    expect(rows[0]!.dispute_value).toBe(50000);
  });

  test("parses German optional headers (email, gegner, gericht, streitwert, rechtsgebiet)", () => {
    const csv = `aktenzeichen,mandant,email,gegner,gegenstand,rechtsgebiet,gericht,streitwert,klammer
200,Client,mail@test.at,Gegner GmbH,Streit,Zivilrecht,Landesgericht,25000,K-002`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_email).toBe("mail@test.at");
    expect(rows[0]!.opponent_name).toBe("Gegner GmbH");
    expect(rows[0]!.legal_area).toBe("Zivilrecht");
    expect(rows[0]!.court).toBe("Landesgericht");
    expect(rows[0]!.dispute_value).toBe(25000);
  });

  test("skips rows missing required fields", () => {
    const csv = `case_number,client_name,matter,mandate_id
123,Max Muster,Kündigung,M-001
456,Anna Schmidt,,M-002
,Test,Matter,M-003
789,Valid Client,Valid Matter,M-004`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.case_number).toBe("123");
    expect(rows[1]!.case_number).toBe("789");
  });

  test("returns empty array for header-only CSV", () => {
    const csv = `case_number,client_name,matter,mandate_id`;
    expect(parseCsvCases(csv)).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    expect(parseCsvCases("")).toEqual([]);
  });

  test("handles quoted values (without internal commas)", () => {
    const csv = `case_number,client_name,matter,mandate_id
123,"Max Muster","Kündigung wegen X",M-001`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_name).toBe("Max Muster");
    expect(rows[0]!.matter).toBe("Kündigung wegen X");
  });

  test("BUG: quoted values with internal commas are split incorrectly", () => {
    // CSV parser splits by comma before stripping quotes — RFC 4180 violation.
    // This test documents the known bug: "Max, Muster" becomes "Max" + "Muster"
    const csv = `case_number,client_name,matter,mandate_id
123,"Max, Muster",Kündigung,M-001`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    // Bug: comma inside quotes splits the value, quotes are then stripped
    expect(rows[0]!.client_name).toBe("Max");
    expect(rows[0]!.matter).toBe("Muster");
  });

  test("handles non-numeric dispute_value as NaN", () => {
    const csv = `case_number,client_name,matter,dispute_value,mandate_id
123,Client,Matter,not-a-number,M-001`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dispute_value).toBeNaN();
  });

  test("handles empty dispute_value as undefined", () => {
    const csv = `case_number,client_name,matter,dispute_value,mandate_id
123,Client,Matter,,M-001`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dispute_value).toBeUndefined();
  });

  test("trims whitespace in values", () => {
    const csv = `case_number,client_name,matter,mandate_id
  123 ,  Max Muster ,  Kündigung ,  M-001 `;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.case_number).toBe("123");
    expect(rows[0]!.client_name).toBe("Max Muster");
    expect(rows[0]!.matter).toBe("Kündigung");
    expect(rows[0]!.mandate_id).toBe("M-001");
  });

  test("lowercases headers for matching", () => {
    const csv = `Case_Number,Client_Name,Matter,Mandate_ID
123,Client,Matter,M-001`;
    const rows = parseCsvCases(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.case_number).toBe("123");
  });
});

describe("caseSlugFromRow", () => {
  test("creates slug from case_number", () => {
    const row: BulkCaseRow = {
      case_number: "123/2026",
      client_name: "Test",
      matter: "Test",
      mandate_id: "M-001",
    };
    expect(caseSlugFromRow(row)).toBe("legal/cases/123-2026");
  });

  test("normalizes umlauts", () => {
    const row: BulkCaseRow = {
      case_number: "ünicöde-123",
      client_name: "Test",
      matter: "Test",
      mandate_id: "M-001",
    };
    expect(caseSlugFromRow(row)).toBe("legal/cases/unicode-123");
  });

  test("replaces non-alphanumeric with dashes", () => {
    const row: BulkCaseRow = {
      case_number: "ABC 123/456 (2026)",
      client_name: "Test",
      matter: "Test",
      mandate_id: "M-001",
    };
    expect(caseSlugFromRow(row)).toBe("legal/cases/abc-123-456-2026");
  });

  test("truncates to 80 chars", () => {
    const longNum = "a".repeat(100);
    const row: BulkCaseRow = {
      case_number: longNum,
      client_name: "Test",
      matter: "Test",
      mandate_id: "M-001",
    };
    const slug = caseSlugFromRow(row);
    expect(slug).toBe(`legal/cases/${"a".repeat(80)}`);
  });

  test("strips leading/trailing dashes", () => {
    const row: BulkCaseRow = {
      case_number: "---123---",
      client_name: "Test",
      matter: "Test",
      mandate_id: "M-001",
    };
    expect(caseSlugFromRow(row)).toBe("legal/cases/123");
  });
});

describe("caseFrontmatterFromRow", () => {
  test("creates frontmatter with all fields", () => {
    const row: BulkCaseRow = {
      case_number: "123",
      client_name: "Max Muster",
      client_email: "max@example.com",
      opponent_name: "Gegner AG",
      matter: "Kündigung",
      legal_area: "Arbeitsrecht",
      court: "Arbeitsgericht",
      dispute_value: 50000,
      mandate_id: "M-001",
    };
    const fm = caseFrontmatterFromRow(row);
    expect(fm.type).toBe("legal_case");
    expect(fm.status).toBe("open");
    expect(fm.case_number).toBe("123");
    expect(fm.client_name).toBe("Max Muster");
    expect(fm.client_email).toBe("max@example.com");
    expect(fm.opponent_name).toBe("Gegner AG");
    expect(fm.matter).toBe("Kündigung");
    expect(fm.legal_area).toBe("Arbeitsrecht");
    expect(fm.court).toBe("Arbeitsgericht");
    expect(fm.dispute_value).toBe(50000);
    expect(fm.mandate_id).toBe("M-001");
    expect(fm.created_via).toBe("bulk_import");
    expect(fm.created_at).toBeTruthy();
    expect(fm.updated_at).toBeTruthy();
  });

  test("handles optional fields being undefined", () => {
    const row: BulkCaseRow = {
      case_number: "123",
      client_name: "Test",
      matter: "Test",
      mandate_id: "M-001",
    };
    const fm = caseFrontmatterFromRow(row);
    expect(fm.client_email).toBeUndefined();
    expect(fm.opponent_name).toBeUndefined();
    expect(fm.legal_area).toBeUndefined();
    expect(fm.court).toBeUndefined();
    expect(fm.dispute_value).toBeUndefined();
  });
});

describe("groupByMandateId", () => {
  test("groups items by mandate_id", () => {
    const items: PortfolioItem[] = [
      {
        case_slug: "a",
        case_number: "1",
        client_name: "C1",
        matter: "M",
        status: "open",
        mandate_id: "K-001",
      },
      {
        case_slug: "b",
        case_number: "2",
        client_name: "C2",
        matter: "M",
        status: "open",
        mandate_id: "K-001",
      },
      {
        case_slug: "c",
        case_number: "3",
        client_name: "C3",
        matter: "M",
        status: "open",
        mandate_id: "K-002",
      },
    ];
    const groups = groupByMandateId(items);
    expect(groups.size).toBe(2);
    expect(groups.get("K-001")).toHaveLength(2);
    expect(groups.get("K-002")).toHaveLength(1);
  });

  test("returns empty map for empty input", () => {
    const groups = groupByMandateId([]);
    expect(groups.size).toBe(0);
  });

  test("handles single item", () => {
    const items: PortfolioItem[] = [
      {
        case_slug: "a",
        case_number: "1",
        client_name: "C1",
        matter: "M",
        status: "open",
        mandate_id: "K-001",
      },
    ];
    const groups = groupByMandateId(items);
    expect(groups.size).toBe(1);
    expect(groups.get("K-001")).toHaveLength(1);
  });
});
