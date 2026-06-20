import { describe, it, expect } from "vitest";
import {
  RISK_LABELS,
  REVIEW_STATUS_LABELS,
  CATEGORY_LABELS,
  severityToRiskLevel,
  buildAnnotationSlug,
  buildAnnotationTitle,
  buildAnnotationFrontmatter,
  fmToAnnotation,
  filterByContract,
  filterByRisk,
  filterByReviewStatus,
  filterByCategory,
  sortByRiskLevel,
  sortByAnnotatedAt,
  computeAnnotationStats,
  buildReviewUpdate,
  type ClauseAnnotation,
  type ClauseRiskLevel,
  type ClauseReviewStatus,
  type ClauseCategory,
} from "@/lib/clause-annotation";

// ── Label Maps ────────────────────────────────────────────────────────

describe("RISK_LABELS", () => {
  it("has labels for all risk levels", () => {
    expect(RISK_LABELS.low).toBe("Niedrig");
    expect(RISK_LABELS.medium).toBe("Mittel");
    expect(RISK_LABELS.high).toBe("Hoch");
    expect(RISK_LABELS.critical).toBe("Kritisch");
  });
});

describe("REVIEW_STATUS_LABELS", () => {
  it("has labels for all review statuses", () => {
    expect(REVIEW_STATUS_LABELS.pending).toBe("Offen");
    expect(REVIEW_STATUS_LABELS.approved).toBe("Freigegeben");
    expect(REVIEW_STATUS_LABELS.rejected).toBe("Abgelehnt");
  });
});

describe("CATEGORY_LABELS", () => {
  it("has labels for all categories", () => {
    expect(CATEGORY_LABELS.nda).toBe("Geheimhaltung");
    expect(CATEGORY_LABELS.liability).toBe("Haftung");
    expect(CATEGORY_LABELS.data_protection).toBe("Datenschutz");
    expect(CATEGORY_LABELS.termination).toBe("Kündigung");
    expect(CATEGORY_LABELS.general).toBe("Allgemein");
  });

  it("covers all 15 categories", () => {
    const keys = Object.keys(CATEGORY_LABELS);
    expect(keys.length).toBe(15);
  });
});

// ── severityToRiskLevel ───────────────────────────────────────────────

describe("severityToRiskLevel", () => {
  it("maps critical severity to critical risk", () => {
    expect(severityToRiskLevel("critical")).toBe("critical");
  });

  it("maps high severity to high risk", () => {
    expect(severityToRiskLevel("high")).toBe("high");
  });

  it("maps medium severity to medium risk", () => {
    expect(severityToRiskLevel("medium")).toBe("medium");
  });

  it("maps low severity to low risk", () => {
    expect(severityToRiskLevel("low")).toBe("low");
  });
});

// ── buildAnnotationSlug ───────────────────────────────────────────────

describe("buildAnnotationSlug", () => {
  it("builds slug with contract and clause type", () => {
    const slug = buildAnnotationSlug("legal/contracts/my-contract", "liability");
    expect(slug).toMatch(/^clause_annotations\/my-contract\/liability-/);
  });

  it("uses custom date", () => {
    const date = new Date("2024-06-15T10:30:00.000Z");
    const slug = buildAnnotationSlug("legal/contracts/test", "nda", date);
    expect(slug).toBe("clause_annotations/test/nda-2024-06-15T10-30-00");
  });

  it("handles contract slug without slashes", () => {
    const slug = buildAnnotationSlug("simple-contract", "payment");
    expect(slug).toMatch(/^clause_annotations\/simple-contract\/payment-/);
  });
});

// ── buildAnnotationTitle ──────────────────────────────────────────────

describe("buildAnnotationTitle", () => {
  it("builds title from category and clause title", () => {
    expect(buildAnnotationTitle("liability", "Haftungsbeschränkung")).toBe(
      "Haftung: Haftungsbeschränkung",
    );
  });

  it("uses category label as prefix", () => {
    expect(buildAnnotationTitle("nda", "Geheimhaltung")).toBe(
      "Geheimhaltung: Geheimhaltung",
    );
  });
});

// ── buildAnnotationFrontmatter ────────────────────────────────────────

describe("buildAnnotationFrontmatter", () => {
  it("builds valid frontmatter with all fields", () => {
    const fm = buildAnnotationFrontmatter({
      contract_slug: "legal/contracts/test",
      clause_type: "liability",
      clause_title: "Haftungsbeschränkung",
      clause_excerpt: "Die Haftung ist auf... begrenzt.",
      risk_level: "high",
      legal_basis: "§ 309 Nr. 7 BGB",
      recommendation: "Haftungsgrenze entfernen oder anpassen.",
      annotated_by: "user@test.com",
    });
    expect(fm.type).toBe("clause_annotation");
    expect(fm.contract_slug).toBe("legal/contracts/test");
    expect(fm.clause_type).toBe("liability");
    expect(fm.risk_level).toBe("high");
    expect(fm.review_status).toBe("pending");
    expect(fm.annotated_at).toBeTruthy();
  });

  it("includes optional fields when provided", () => {
    const fm = buildAnnotationFrontmatter({
      contract_slug: "c1",
      clause_type: "nda",
      clause_title: "Test",
      clause_excerpt: "Excerpt",
      risk_level: "low",
      legal_basis: "Test",
      recommendation: "Test",
      annotated_by: "user@test.com",
      playbook_rule_id: "rule-001",
      position_start: 100,
      position_end: 250,
    });
    expect(fm.playbook_rule_id).toBe("rule-001");
    expect(fm.position_start).toBe(100);
    expect(fm.position_end).toBe(250);
  });

  it("uses custom date when provided", () => {
    const date = new Date("2024-01-15T10:00:00Z");
    const fm = buildAnnotationFrontmatter({
      contract_slug: "c1",
      clause_type: "general",
      clause_title: "Test",
      clause_excerpt: "",
      risk_level: "medium",
      legal_basis: "",
      recommendation: "",
      annotated_by: "u",
      at: date,
    });
    expect(fm.annotated_at).toBe(date.toISOString());
  });
});

// ── fmToAnnotation ────────────────────────────────────────────────────

describe("fmToAnnotation", () => {
  it("converts valid page to annotation", () => {
    const page = {
      slug: "clause_annotations/test/nda-123",
      title: "NDA: Test",
      frontmatter: {
        type: "clause_annotation",
        contract_slug: "legal/contracts/test",
        clause_type: "nda",
        clause_title: "Test",
        clause_excerpt: "Excerpt",
        risk_level: "high",
        legal_basis: "§ 1 UWG",
        recommendation: "Anpassen",
        review_status: "pending",
        annotated_by: "user@test.com",
        annotated_at: "2024-01-01T00:00:00Z",
      },
    };
    const ann = fmToAnnotation(page);
    expect(ann).not.toBeNull();
    expect(ann?.slug).toBe("clause_annotations/test/nda-123");
    expect(ann?.frontmatter.contract_slug).toBe("legal/contracts/test");
    expect(ann?.frontmatter.risk_level).toBe("high");
  });

  it("returns null for non-annotation page", () => {
    expect(
      fmToAnnotation({
        slug: "cases/123",
        title: "Case",
        frontmatter: { type: "case" },
      }),
    ).toBeNull();
  });

  it("returns null for missing frontmatter", () => {
    expect(fmToAnnotation({ slug: "test", title: "Test" })).toBeNull();
  });

  it("fills defaults for missing fields", () => {
    const ann = fmToAnnotation({
      slug: "test",
      title: "Test",
      frontmatter: { type: "clause_annotation" },
    });
    expect(ann?.frontmatter.clause_type).toBe("general");
    expect(ann?.frontmatter.risk_level).toBe("medium");
    expect(ann?.frontmatter.review_status).toBe("pending");
    expect(ann?.frontmatter.annotated_by).toBe("—");
  });
});

// ── Filtering ─────────────────────────────────────────────────────────

const mockAnnotations: ClauseAnnotation[] = [
  {
    slug: "a1",
    title: "A1",
    frontmatter: {
      type: "clause_annotation",
      contract_slug: "c1",
      clause_type: "liability",
      clause_title: "A",
      clause_excerpt: "",
      risk_level: "critical",
      legal_basis: "",
      recommendation: "",
      review_status: "pending",
      annotated_by: "u",
      annotated_at: "2024-01-01",
    },
  },
  {
    slug: "a2",
    title: "A2",
    frontmatter: {
      type: "clause_annotation",
      contract_slug: "c1",
      clause_type: "nda",
      clause_title: "B",
      clause_excerpt: "",
      risk_level: "low",
      legal_basis: "",
      recommendation: "",
      review_status: "approved",
      annotated_by: "u",
      annotated_at: "2024-01-02",
    },
  },
  {
    slug: "a3",
    title: "A3",
    frontmatter: {
      type: "clause_annotation",
      contract_slug: "c2",
      clause_type: "liability",
      clause_title: "C",
      clause_excerpt: "",
      risk_level: "high",
      legal_basis: "",
      recommendation: "",
      review_status: "rejected",
      annotated_by: "u",
      annotated_at: "2024-01-03",
    },
  },
];

describe("filterByContract", () => {
  it("filters by contract slug", () => {
    expect(filterByContract(mockAnnotations, "c1").length).toBe(2);
    expect(filterByContract(mockAnnotations, "c2").length).toBe(1);
    expect(filterByContract(mockAnnotations, "c3").length).toBe(0);
  });
});

describe("filterByRisk", () => {
  it("filters by risk level", () => {
    expect(filterByRisk(mockAnnotations, "critical").length).toBe(1);
    expect(filterByRisk(mockAnnotations, "high").length).toBe(1);
    expect(filterByRisk(mockAnnotations, "low").length).toBe(1);
    expect(filterByRisk(mockAnnotations, "medium").length).toBe(0);
  });
});

describe("filterByReviewStatus", () => {
  it("filters by review status", () => {
    expect(filterByReviewStatus(mockAnnotations, "pending").length).toBe(1);
    expect(filterByReviewStatus(mockAnnotations, "approved").length).toBe(1);
    expect(filterByReviewStatus(mockAnnotations, "rejected").length).toBe(1);
  });
});

describe("filterByCategory", () => {
  it("filters by clause category", () => {
    expect(filterByCategory(mockAnnotations, "liability").length).toBe(2);
    expect(filterByCategory(mockAnnotations, "nda").length).toBe(1);
    expect(filterByCategory(mockAnnotations, "payment").length).toBe(0);
  });
});

// ── Sorting ───────────────────────────────────────────────────────────

describe("sortByRiskLevel", () => {
  it("sorts ascending (critical first)", () => {
    const sorted = sortByRiskLevel(mockAnnotations, "asc");
    expect(sorted[0].frontmatter.risk_level).toBe("critical");
    expect(sorted[1].frontmatter.risk_level).toBe("high");
    expect(sorted[2].frontmatter.risk_level).toBe("low");
  });

  it("sorts descending (low first)", () => {
    const sorted = sortByRiskLevel(mockAnnotations, "desc");
    expect(sorted[0].frontmatter.risk_level).toBe("low");
    expect(sorted[2].frontmatter.risk_level).toBe("critical");
  });

  it("does not mutate original array", () => {
    const original = [...mockAnnotations];
    sortByRiskLevel(mockAnnotations);
    expect(mockAnnotations.map((a) => a.slug)).toEqual(original.map((a) => a.slug));
  });
});

describe("sortByAnnotatedAt", () => {
  it("sorts descending by default (newest first)", () => {
    const sorted = sortByAnnotatedAt(mockAnnotations);
    expect(sorted[0].slug).toBe("a3");
    expect(sorted[2].slug).toBe("a1");
  });

  it("sorts ascending (oldest first)", () => {
    const sorted = sortByAnnotatedAt(mockAnnotations, "asc");
    expect(sorted[0].slug).toBe("a1");
    expect(sorted[2].slug).toBe("a3");
  });
});

// ── computeAnnotationStats ────────────────────────────────────────────

describe("computeAnnotationStats", () => {
  it("computes correct stats", () => {
    const stats = computeAnnotationStats(mockAnnotations);
    expect(stats.total).toBe(3);
    expect(stats.by_risk.critical).toBe(1);
    expect(stats.by_risk.high).toBe(1);
    expect(stats.by_risk.low).toBe(1);
    expect(stats.by_risk.medium).toBe(0);
    expect(stats.by_status.pending).toBe(1);
    expect(stats.by_status.approved).toBe(1);
    expect(stats.by_status.rejected).toBe(1);
    expect(stats.approved).toBe(1);
    expect(stats.rejected).toBe(1);
  });

  it("counts pending critical", () => {
    const stats = computeAnnotationStats(mockAnnotations);
    expect(stats.pending_critical).toBe(1);
  });

  it("handles empty array", () => {
    const stats = computeAnnotationStats([]);
    expect(stats.total).toBe(0);
    expect(stats.pending_critical).toBe(0);
    expect(stats.approved).toBe(0);
  });

  it("counts multiple pending critical", () => {
    const anns: ClauseAnnotation[] = [
      { ...mockAnnotations[0] },
      {
        slug: "a4",
        title: "A4",
        frontmatter: {
          ...mockAnnotations[0].frontmatter,
          risk_level: "critical" as ClauseRiskLevel,
          clause_title: "D",
        },
      },
    ];
    const stats = computeAnnotationStats(anns);
    expect(stats.pending_critical).toBe(2);
  });
});

// ── buildReviewUpdate ─────────────────────────────────────────────────

describe("buildReviewUpdate", () => {
  it("builds approval update", () => {
    const update = buildReviewUpdate({
      status: "approved",
      reviewed_by: "reviewer@test.com",
    });
    expect(update.review_status).toBe("approved");
    expect(update.reviewed_by).toBe("reviewer@test.com");
    expect(update.reviewed_at).toBeTruthy();
    expect(update.reject_reason).toBeUndefined();
  });

  it("builds rejection update with reason", () => {
    const update = buildReviewUpdate({
      status: "rejected",
      reviewed_by: "reviewer@test.com",
      reject_reason: "Klausel ist rechtlich unbedenklich.",
    });
    expect(update.review_status).toBe("rejected");
    expect(update.reject_reason).toBe("Klausel ist rechtlich unbedenklich.");
  });

  it("uses custom date", () => {
    const date = new Date("2024-06-15T10:00:00Z");
    const update = buildReviewUpdate({
      status: "approved",
      reviewed_by: "u",
      at: date,
    });
    expect(update.reviewed_at).toBe(date.toISOString());
  });
});
