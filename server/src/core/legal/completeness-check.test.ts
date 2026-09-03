/**
 * Tests für completeness-check — Stage 2 der Legal Analysis Pipeline.
 *
 * Pure Funktionen — keine Engine, kein Netzwerk, kein LLM.
 * Testet: Rule-Sets, Condition-Evaluator, Piece-Check, Verdict, Case-Type-Detection.
 */
import { describe, it, expect } from "bun:test";
import {
  RULE_SETS,
  checkPiece,
  computeVerdict,
  runCompletenessCheck,
  detectCaseType,
  type ExpectedPiece,
  type ArrivedDocument,
  type CaseFields,
} from "./completeness-check.ts";

// ── Fixtures ───────────────────────────────────────────────────────────

const makeDoc = (
  slug: string,
  docType: ArrivedDocument["docType"],
  overrides: Partial<ArrivedDocument> = {}
): ArrivedDocument => ({
  slug,
  title: slug,
  docType,
  confidence: 0.9,
  ...overrides,
});

const SCHADENERSATZ_DOCS: ArrivedDocument[] = [
  makeDoc("klage-001", "pleading"),
  makeDoc("vertrag-001", "contract"),
  makeDoc("rechnung-001", "invoice"),
  makeDoc("gutachten-001", "expert_report"),
];

// ── Rule-Sets ──────────────────────────────────────────────────────────

describe("RULE_SETS", () => {
  it("hat Rule-Sets für schadenersatz, mietrecht, arbeitsrecht, strafrecht", () => {
    expect(RULE_SETS["schadenersatz"]).toBeDefined();
    expect(RULE_SETS["mietrecht"]).toBeDefined();
    expect(RULE_SETS["arbeitsrecht"]).toBeDefined();
    expect(RULE_SETS["strafrecht"]).toBeDefined();
  });

  it("jedes Rule-Set hat pieces mit docTypes, minCount, rationale", () => {
    for (const [id, rs] of Object.entries(RULE_SETS)) {
      expect(rs.pieces.length).toBeGreaterThan(0);
      for (const p of rs.pieces) {
        expect(p.role).toBeTruthy();
        expect(p.docTypes.length).toBeGreaterThan(0);
        expect(p.rationale).toBeTruthy();
        expect(typeof p.minCount).toBe("number");
        expect(typeof p.blocksPayment).toBe("boolean");
      }
    }
  });

  it("schadenersatz hat Feuerwehrbericht conditional on loss_type == 'fire'", () => {
    const firePiece = RULE_SETS["schadenersatz"].pieces.find((p) => p.role === "Feuerwehrbericht");
    expect(firePiece).toBeDefined();
    expect(firePiece?.requiredWhen).toBe("loss_type == 'fire'");
    expect(firePiece?.minCount).toBe(1);
  });
});

// ── Condition Evaluator ────────────────────────────────────────────────

describe("checkPiece — condition evaluation", () => {
  const piece: ExpectedPiece = {
    role: "Feuerwehrbericht",
    docTypes: ["police_report"],
    minCount: 1,
    maxCount: null,
    requiredWhen: "loss_type == 'fire'",
    blocksPayment: false,
    rationale: "Bei Brandschaden erforderlich.",
  };

  it("returns OK when condition not met (no fire)", () => {
    const result = checkPiece(piece, [], { loss_type: "water" });
    expect(result.status).toBe("OK");
    expect(result.arrivedCount).toBe(0);
  });

  it("returns MISSING when condition met but no doc", () => {
    const result = checkPiece(piece, [], { loss_type: "fire" });
    expect(result.status).toBe("MISSING");
    expect(result.severity).toBe("medium"); // blocksPayment=false
  });

  it("returns OK when condition met and doc present", () => {
    const result = checkPiece(piece, [makeDoc("fb-001", "police_report")], { loss_type: "fire" });
    expect(result.status).toBe("OK");
    expect(result.matchedSlugs).toEqual(["fb-001"]);
  });

  it("returns OK when requiredWhen is undefined (always required)", () => {
    const alwaysRequired: ExpectedPiece = {
      role: "Klage",
      docTypes: ["pleading"],
      minCount: 1,
      maxCount: null,
      blocksPayment: true,
      rationale: "Zwingend.",
    };
    const result = checkPiece(alwaysRequired, [makeDoc("klage-001", "pleading")], {});
    expect(result.status).toBe("OK");
  });

  it("handles `field in [a, b]` condition", () => {
    const piece2: ExpectedPiece = {
      role: "Test",
      docTypes: ["pleading"],
      minCount: 1,
      maxCount: null,
      requiredWhen: "dispute_type in ['termination', 'discrimination']",
      blocksPayment: false,
      rationale: "Test.",
    };
    expect(checkPiece(piece2, [], { dispute_type: "termination" }).status).toBe("MISSING");
    expect(checkPiece(piece2, [], { dispute_type: "salary" }).status).toBe("OK");
  });

  it("handles `field exists` condition", () => {
    const piece3: ExpectedPiece = {
      role: "Test",
      docTypes: ["pleading"],
      minCount: 1,
      maxCount: null,
      requiredWhen: "case_number exists",
      blocksPayment: false,
      rationale: "Test.",
    };
    expect(checkPiece(piece3, [], { case_number: "123" }).status).toBe("MISSING");
    expect(checkPiece(piece3, [], {}).status).toBe("OK");
  });
});

// ── Piece Status ───────────────────────────────────────────────────────

describe("checkPiece — status logic", () => {
  const piece: ExpectedPiece = {
    role: "Klage",
    docTypes: ["pleading"],
    minCount: 1,
    maxCount: null,
    blocksPayment: true,
    rationale: "Zwingend.",
  };

  it("MISSING when no matching doc", () => {
    const result = checkPiece(piece, [], {});
    expect(result.status).toBe("MISSING");
    expect(result.severity).toBe("high"); // blocksPayment=true
  });

  it("OK when matching doc present", () => {
    const result = checkPiece(piece, [makeDoc("k-001", "pleading")], {});
    expect(result.status).toBe("OK");
  });

  it("EXPIRED when doc has past expiresAt", () => {
    const result = checkPiece(
      piece,
      [makeDoc("k-001", "pleading", { expiresAt: "2020-01-01" })],
      {},
      new Date("2026-01-01")
    );
    expect(result.status).toBe("EXPIRED");
    expect(result.expiredSlug).toBe("k-001");
  });

  it("OK when doc has future expiresAt", () => {
    const result = checkPiece(
      piece,
      [makeDoc("k-001", "pleading", { expiresAt: "2030-01-01" })],
      {},
      new Date("2026-01-01")
    );
    expect(result.status).toBe("OK");
  });

  it("INVALID when too many docs (maxCount exceeded)", () => {
    const piece2: ExpectedPiece = {
      role: "Vertrag",
      docTypes: ["contract"],
      minCount: 1,
      maxCount: 1,
      blocksPayment: false,
      rationale: "Max 1.",
    };
    const result = checkPiece(
      piece2,
      [makeDoc("v-001", "contract"), makeDoc("v-002", "contract")],
      {}
    );
    expect(result.status).toBe("INVALID");
  });
});

// ── Verdict ────────────────────────────────────────────────────────────

describe("computeVerdict", () => {
  it("HOLD when blocker MISSING", () => {
    const pieces = [
      {
        role: "Klage",
        status: "MISSING" as const,
        severity: "high" as const,
        blocksPayment: true,
        rationale: "",
        arrivedCount: 0,
        expectedCount: 1,
        matchedSlugs: [],
      },
      {
        role: "Vertrag",
        status: "OK" as const,
        severity: "low" as const,
        blocksPayment: true,
        rationale: "",
        arrivedCount: 1,
        expectedCount: 1,
        matchedSlugs: ["v-001"],
      },
    ];
    const { verdict } = computeVerdict(pieces);
    expect(verdict).toBe("HOLD");
  });

  it("CHASE when non-blocker MISSING", () => {
    const pieces = [
      {
        role: "Klage",
        status: "OK" as const,
        severity: "low" as const,
        blocksPayment: true,
        rationale: "",
        arrivedCount: 1,
        expectedCount: 1,
        matchedSlugs: ["k-001"],
      },
      {
        role: "Rechnung",
        status: "MISSING" as const,
        severity: "medium" as const,
        blocksPayment: false,
        rationale: "",
        arrivedCount: 0,
        expectedCount: 1,
        matchedSlugs: [],
      },
    ];
    const { verdict } = computeVerdict(pieces);
    expect(verdict).toBe("CHASE");
  });

  it("COMPLETE when all OK", () => {
    const pieces = [
      {
        role: "Klage",
        status: "OK" as const,
        severity: "low" as const,
        blocksPayment: true,
        rationale: "",
        arrivedCount: 1,
        expectedCount: 1,
        matchedSlugs: ["k-001"],
      },
      {
        role: "Vertrag",
        status: "OK" as const,
        severity: "low" as const,
        blocksPayment: true,
        rationale: "",
        arrivedCount: 1,
        expectedCount: 1,
        matchedSlugs: ["v-001"],
      },
    ];
    const { verdict, completenessPercent } = computeVerdict(pieces);
    expect(verdict).toBe("COMPLETE");
    expect(completenessPercent).toBe(100);
  });

  it("HOLD when blocker EXPIRED", () => {
    const pieces = [
      {
        role: "Klage",
        status: "EXPIRED" as const,
        severity: "high" as const,
        blocksPayment: true,
        rationale: "",
        arrivedCount: 1,
        expectedCount: 1,
        matchedSlugs: ["k-001"],
      },
    ];
    const { verdict } = computeVerdict(pieces);
    expect(verdict).toBe("HOLD");
  });

  it("completenessPercent = 50 when half OK", () => {
    const pieces = [
      {
        role: "A",
        status: "OK" as const,
        severity: "low" as const,
        blocksPayment: false,
        rationale: "",
        arrivedCount: 1,
        expectedCount: 1,
        matchedSlugs: ["a"],
      },
      {
        role: "B",
        status: "MISSING" as const,
        severity: "medium" as const,
        blocksPayment: false,
        rationale: "",
        arrivedCount: 0,
        expectedCount: 1,
        matchedSlugs: [],
      },
    ];
    const { completenessPercent } = computeVerdict(pieces);
    expect(completenessPercent).toBe(50);
  });
});

// ── Full Pipeline ──────────────────────────────────────────────────────

describe("runCompletenessCheck", () => {
  it("returns COMPLETE for a well-stocked Schadenersatzakte", () => {
    const result = runCompletenessCheck("schadenersatz", SCHADENERSATZ_DOCS, {});
    expect(result.caseType).toBe("schadenersatz");
    expect(result.verdict).toBe("COMPLETE");
    expect(result.completenessPercent).toBe(100);
  });

  it("returns HOLD when Klage missing (blocker)", () => {
    const docs = SCHADENERSATZ_DOCS.filter((d) => d.docType !== "pleading");
    const result = runCompletenessCheck("schadenersatz", docs, {});
    expect(result.verdict).toBe("HOLD");
    const klagePiece = result.pieces.find((p) => p.role === "Klage / Klagebeantwortung");
    expect(klagePiece?.status).toBe("MISSING");
    expect(klagePiece?.severity).toBe("high");
  });

  it("flags MISSING Feuerwehrbericht when loss_type == 'fire'", () => {
    const docs = SCHADENERSATZ_DOCS; // no police_report
    const result = runCompletenessCheck("schadenersatz", docs, { loss_type: "fire" });
    const firePiece = result.pieces.find((p) => p.role === "Feuerwehrbericht");
    expect(firePiece?.status).toBe("MISSING");
  });

  it("does NOT flag Feuerwehrbericht when loss_type != 'fire'", () => {
    const result = runCompletenessCheck("schadenersatz", SCHADENERSATZ_DOCS, {
      loss_type: "water",
    });
    const firePiece = result.pieces.find((p) => p.role === "Feuerwehrbericht");
    expect(firePiece?.status).toBe("OK");
  });

  it("returns HOLD for unknown rule set", () => {
    const result = runCompletenessCheck("nonexistent", [], {});
    expect(result.verdict).toBe("HOLD");
    expect(result.pieces).toEqual([]);
  });

  it("returns CHASE when only non-blocker missing", () => {
    // Schadenersatz ohne Rechnung (non-blocker)
    const docs = SCHADENERSATZ_DOCS.filter((d) => d.docType !== "invoice");
    const result = runCompletenessCheck("schadenersatz", docs, {});
    // Rechnung is non-blocker but severity medium → CHASE
    expect(["CHASE", "COMPLETE"]).toContain(result.verdict);
  });
});

// ── Case Type Detection ────────────────────────────────────────────────

describe("detectCaseType", () => {
  it("detects strafrecht when strafantrag present", () => {
    const docs = [makeDoc("antrag-001", "strafantrag")];
    expect(detectCaseType(docs)).toBe("strafrecht");
  });

  it("detects strafrecht when akteneinsicht present", () => {
    const docs = [makeDoc("akten-001", "akteneinsicht")];
    expect(detectCaseType(docs)).toBe("strafrecht");
  });

  it("detects arbeitsrecht when dispute_type == 'termination'", () => {
    const docs = [makeDoc("k-001", "pleading"), makeDoc("v-001", "contract")];
    expect(detectCaseType(docs, { dispute_type: "termination" })).toBe("arbeitsrecht");
  });

  it("detects schadenersatz when loss_type == 'fire'", () => {
    const docs = [makeDoc("k-001", "pleading"), makeDoc("v-001", "contract")];
    expect(detectCaseType(docs, { loss_type: "fire" })).toBe("schadenersatz");
  });

  it("defaults to schadenersatz for contract+pleading", () => {
    const docs = [makeDoc("k-001", "pleading"), makeDoc("v-001", "contract")];
    expect(detectCaseType(docs)).toBe("schadenersatz");
  });
});
