// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  computeStatistics,
  generateBatesNumber,
  exportPrivilegeLog,
  parseReviewSet,
  REDACTION_CODE_LABELS_DE,
  PRIVILEGE_TYPE_LABELS_DE,
  REVIEW_DECISION_LABELS_DE,
  REVIEW_SET_STATUS_LABELS_DE,
  type ReviewSetDocument,
  type ReviewDecision,
  type PrivilegeType,
  type RedactionCode,
  type ReviewSetStatus,
} from "./review-sets";

const doc = (overrides: Partial<ReviewSetDocument> & { slug: string }): ReviewSetDocument => ({
  title: "Document",
  decision: "responsive",
  privilegeType: "none",
  ...overrides,
});

describe("computeStatistics", () => {
  test("counts all decision types", () => {
    const documents: ReviewSetDocument[] = [
      doc({ slug: "d1", decision: "responsive" }),
      doc({ slug: "d2", decision: "non_responsive" }),
      doc({ slug: "d3", decision: "privileged" }),
      doc({ slug: "d4", decision: "redact" }),
      doc({ slug: "d5", decision: "withhold" }),
    ];
    const stats = computeStatistics(documents);
    expect(stats.total).toBe(5);
    expect(stats.responsive).toBe(1);
    expect(stats.nonResponsive).toBe(1);
    expect(stats.privileged).toBe(1);
    expect(stats.redacted).toBe(1);
    expect(stats.withheld).toBe(1);
    expect(stats.unreviewed).toBe(0);
  });

  test("unknown decisions count as unreviewed", () => {
    const documents: ReviewSetDocument[] = [
      doc({ slug: "d1", decision: "unknown" as ReviewDecision }),
    ];
    const stats = computeStatistics(documents);
    expect(stats.unreviewed).toBe(1);
  });

  test("empty documents returns zeros", () => {
    const stats = computeStatistics([]);
    expect(stats.total).toBe(0);
    expect(stats.responsive).toBe(0);
  });
});

describe("generateBatesNumber", () => {
  test("generates zero-padded bates numbers", () => {
    expect(generateBatesNumber("SUBS", 1, 0)).toBe("SUBS0000001");
    expect(generateBatesNumber("SUBS", 1, 5)).toBe("SUBS0000006");
    expect(generateBatesNumber("PROD", 100, 0)).toBe("PROD0000100");
  });
});

describe("exportPrivilegeLog", () => {
  test("exports only privileged or redacted documents", () => {
    const documents: ReviewSetDocument[] = [
      doc({ slug: "d1", decision: "responsive", privilegeType: "none" }),
      doc({
        slug: "d2",
        decision: "privileged",
        privilegeType: "attorney_client",
        privilegeBasis: "§ 203 StGB",
        batesNumber: "SUBS0000001",
      }),
      doc({
        slug: "d3",
        decision: "redact",
        privilegeType: "none",
        redactionCode: "PERSONAL_DATA",
        redactionNotes: "DSGVO",
        batesNumber: "SUBS0000002",
      }),
    ];
    const csv = exportPrivilegeLog(documents);
    expect(csv).toContain(
      '"Bates-Nummer","Dokument","Privileg-Typ","Grundlage","Geschwärzt","Notizen"'
    );
    expect(csv).toContain("SUBS0000001");
    expect(csv).toContain("SUBS0000002");
    expect(csv).not.toContain('"d1"');
  });

  test("escapes quotes in CSV", () => {
    const documents: ReviewSetDocument[] = [
      doc({
        slug: "d1",
        decision: "privileged",
        title: 'Doc "A"',
        privilegeType: "attorney_client",
        batesNumber: "SUBS0000001",
      }),
    ];
    const csv = exportPrivilegeLog(documents);
    expect(csv).toContain('"Doc ""A"""');
  });
});

describe("parseReviewSet", () => {
  test("parses valid review set frontmatter", () => {
    const parsed = parseReviewSet("rs-1", {
      type: "review_set",
      title: "Production Set 1",
      case_slug: "case-1",
      status: "in_review" as ReviewSetStatus,
      documents: [
        doc({ slug: "d1", decision: "responsive" }),
        doc({ slug: "d2", decision: "privileged", privilegeType: "attorney_client" }),
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("Production Set 1");
    expect(parsed?.statistics.total).toBe(2);
    expect(parsed?.statistics.privileged).toBe(1);
  });

  test("returns null for wrong type", () => {
    const parsed = parseReviewSet("rs-1", { type: "case" });
    expect(parsed).toBeNull();
  });

  test("defaults missing fields", () => {
    const parsed = parseReviewSet("rs-1", { type: "review_set" });
    expect(parsed?.status).toBe("draft");
    expect(parsed?.production.format).toBe("pdf");
    expect(parsed?.statistics.total).toBe(0);
  });
});

describe("labels", () => {
  test("redaction code labels cover all codes", () => {
    const codes: RedactionCode[] = [
      "PRIV_ATTORNEY_CLIENT",
      "PRIV_WORK_PRODUCT",
      "PRIV_SETTLEMENT",
      "PERSONAL_DATA",
      "CONFIDENTIAL",
      "TRADE_SECRET",
      "THIRD_PARTY",
    ];
    for (const code of codes) {
      expect(REDACTION_CODE_LABELS_DE[code]).toBeDefined();
    }
  });

  test("privilege type labels cover all types", () => {
    const types: PrivilegeType[] = [
      "attorney_client",
      "work_product",
      "joint_defense",
      "settlement",
      "none",
    ];
    for (const type of types) {
      expect(PRIVILEGE_TYPE_LABELS_DE[type]).toBeDefined();
    }
  });

  test("decision labels cover all decisions", () => {
    const decisions: ReviewDecision[] = [
      "responsive",
      "non_responsive",
      "privileged",
      "redact",
      "withhold",
    ];
    for (const d of decisions) {
      expect(REVIEW_DECISION_LABELS_DE[d]).toBeDefined();
    }
  });

  test("status labels cover all statuses", () => {
    const statuses: ReviewSetStatus[] = ["draft", "in_review", "produced", "archived"];
    for (const s of statuses) {
      expect(REVIEW_SET_STATUS_LABELS_DE[s]).toBeDefined();
    }
  });
});
