// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  computeStatistics,
  generateBatesNumber,
  exportPrivilegeLog,
  exportProductionProtocol,
  parseReviewSet,
  sampleForQC,
  computeCodingConsistency,
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

describe("WP-8.50: sampleForQC", () => {
  const decided = Array.from({ length: 100 }, (_, i) =>
    doc({ slug: `d${i}`, decision: "responsive" })
  );

  test("is deterministic — same seed, same sample", () => {
    const a = sampleForQC(decided, { rate: 0.1, seed: "set-1" });
    const b = sampleForQC(decided, { rate: 0.1, seed: "set-1" });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  test("different seeds draw different samples", () => {
    const a = sampleForQC(decided, { rate: 0.3, seed: "seed-a" });
    const b = sampleForQC(decided, { rate: 0.3, seed: "seed-b" });
    expect(a).not.toEqual(b);
  });

  test("rate 1 samples all decided docs", () => {
    const all = sampleForQC(decided, { rate: 1, seed: "x" });
    expect(all).toHaveLength(100);
  });

  test("rate clamps to [0,1]", () => {
    expect(sampleForQC(decided, { rate: 0, seed: "x" })).toHaveLength(0);
    expect(sampleForQC(decided, { rate: 2, seed: "x" })).toHaveLength(100);
  });

  test("only decided docs are sampled", () => {
    const mixed = [
      doc({ slug: "unrev", decision: undefined as unknown as ReviewDecision }),
      ...decided.slice(0, 5),
    ];
    const sampled = sampleForQC(mixed, { rate: 1, seed: "x" });
    expect(sampled).not.toContain("unrev");
    expect(sampled).toHaveLength(5);
  });
});

describe("WP-8.50: computeCodingConsistency", () => {
  test("perfect agreement → rate 1, kappa 1", () => {
    const docs = [
      doc({ slug: "d1", decision: "responsive", qcSampled: true, qcDecision: "responsive" }),
      doc({ slug: "d2", decision: "privileged", qcSampled: true, qcDecision: "privileged" }),
    ];
    const c = computeCodingConsistency(docs);
    expect(c.sampled).toBe(2);
    expect(c.qcReviewed).toBe(2);
    expect(c.agreementRate).toBe(1);
    expect(c.kappa).toBeCloseTo(1);
    expect(c.conflictItems).toHaveLength(0);
  });

  test("conflicts are listed with both decisions", () => {
    const docs = [
      doc({ slug: "d1", decision: "responsive", qcSampled: true, qcDecision: "privileged" }),
      doc({ slug: "d2", decision: "responsive", qcSampled: true, qcDecision: "responsive" }),
    ];
    const c = computeCodingConsistency(docs);
    expect(c.agreements).toBe(1);
    expect(c.conflicts).toBe(1);
    expect(c.agreementRate).toBe(0.5);
    expect(c.conflictItems[0]).toEqual({
      slug: "d1",
      decision: "responsive",
      qcDecision: "privileged",
    });
  });

  test("no QC data → nulls, not NaN", () => {
    const c = computeCodingConsistency([doc({ slug: "d1" })]);
    expect(c.agreementRate).toBeNull();
    expect(c.kappa).toBeNull();
    expect(c.qcReviewed).toBe(0);
  });

  test("sampled but not yet QC-reviewed counts only as sampled", () => {
    const c = computeCodingConsistency([
      doc({ slug: "d1", qcSampled: true }),
      doc({ slug: "d2", decision: "responsive", qcSampled: true, qcDecision: "responsive" }),
    ]);
    expect(c.sampled).toBe(2);
    expect(c.qcReviewed).toBe(1);
  });

  test("kappa below agreement rate when marginals predict chance agreement", () => {
    // All first-level "responsive", QC mixed — high raw agreement but chance-
    // inflated, so kappa must be < agreement rate.
    const docs = [
      doc({ slug: "a", decision: "responsive", qcSampled: true, qcDecision: "responsive" }),
      doc({ slug: "b", decision: "responsive", qcSampled: true, qcDecision: "responsive" }),
      doc({ slug: "c", decision: "responsive", qcSampled: true, qcDecision: "non_responsive" }),
      doc({ slug: "d", decision: "responsive", qcSampled: true, qcDecision: "responsive" }),
    ];
    const c = computeCodingConsistency(docs);
    expect(c.agreementRate).toBe(0.75);
    expect(c.kappa).not.toBeNull();
    expect(c.kappa!).toBeLessThan(0.75);
  });
});

describe("WP-8.50: exportProductionProtocol", () => {
  const set = {
    slug: "review-sets/1",
    title: "Offenlegung Müller",
    status: "produced" as ReviewSetStatus,
    documents: [
      doc({
        slug: "d1",
        title: 'Vertrag "Müller"',
        batesNumber: "SUB0000001",
        decision: "responsive",
        decisionBy: "anwalt@kanzlei.at",
        decisionAt: "2026-01-01T10:00:00Z",
        qcSampled: true,
        qcDecision: "responsive",
        qcBy: "partner@kanzlei.at",
        qcAt: "2026-01-02T10:00:00Z",
      }),
      doc({
        slug: "d2",
        title: "Interne Notiz",
        batesNumber: "SUB0000002",
        decision: "privileged",
        privilegeType: "attorney_client",
        qcSampled: true,
        qcDecision: "non_responsive",
      }),
    ],
    criteria: {},
    production: { produced: true, producedAt: "2026-01-05T00:00:00Z", format: "pdf" as const },
    statistics: computeStatistics([]),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-05T00:00:00Z",
  };

  test("contains per-document protocol rows and metadata", () => {
    const csv = exportProductionProtocol(set as never);
    expect(csv).toContain("Bates-Nummer");
    expect(csv).toContain("SUB0000001");
    expect(csv).toContain("anwalt@kanzlei.at");
    expect(csv).toContain('"QC-Stichprobe"');
    expect(csv).toContain('"Cohen-Kappa"');
    expect(csv).toContain('"Konflikte","1"');
  });

  test("quotes fields containing quotes and commas", () => {
    const csv = exportProductionProtocol(set as never);
    expect(csv).toContain('"Vertrag ""Müller"""');
  });

  test("conflict row is marked NEIN", () => {
    const csv = exportProductionProtocol(set as never);
    const conflictRow = csv.split("\n").find((l: string) => l.includes("SUB0000002"));
    expect(conflictRow).toContain("NEIN");
  });
});
