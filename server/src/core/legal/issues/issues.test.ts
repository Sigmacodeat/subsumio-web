import { describe, it, expect } from "vitest";
import {
  validateIssue,
  isValidIssue,
  validateIssueResult,
  verifyEvidenceSpanHash,
  isVerifiedEvidence,
  createIssueDraft,
  type LegalIssue,
  type EvidenceSpan,
  type ElementAssessment,
  type IssueConclusion,
  type Assumption,
  type FactReference,
} from "./validator.ts";
import { computeContentHash, type Jurisdiction } from "../corpus-receipt.ts";
import type { IssueStore } from "./store.ts";
import { createInMemoryIssueStore, IssueStoreError } from "./store.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

const NOW = "2026-07-14T10:00:00Z";
const TODAY = "2026-07-14";

function makeVerifiedEvidence(overrides: Partial<EvidenceSpan> = {}): EvidenceSpan {
  const text = "Der Kläger hat den Kaufvertrag am 1. März 2024 geschlossen.";
  return {
    id: "ev-001",
    source_slug: "case/az-123/klage",
    jurisdiction: "DE",
    start_offset: 0,
    end_offset: text.length,
    text,
    content_hash: computeContentHash(text),
    verification: "verified",
    extracted_at: NOW,
    ...overrides,
  };
}

function makeUnverifiedEvidence(overrides: Partial<EvidenceSpan> = {}): EvidenceSpan {
  return makeVerifiedEvidence({ verification: "unverified", ...overrides });
}

function makeValidIssue(overrides: Partial<LegalIssue> = {}): LegalIssue {
  const statuteText = "§ 433 BGB: Durch den Kaufvertrag wird der Verkäufer einer Sache verpflichtet, dem Käufer die Sache zu übergeben und das Eigentum an ihr zu verschaffen.";
  const statuteEvidence: EvidenceSpan = {
    id: "ev-statute",
    source_slug: "law/de/bgb",
    jurisdiction: "DE",
    start_offset: 0,
    end_offset: statuteText.length,
    text: statuteText,
    content_hash: computeContentHash(statuteText),
    verification: "verified",
    extracted_at: NOW,
    paragraph_ref: "433",
  };

  const caseEvidence = makeVerifiedEvidence();

  const assessment: ElementAssessment = {
    element_id: "el-001",
    status: "satisfied",
    evidence: [caseEvidence],
    reasoning: "Der Kläger hat den Kaufvertrag geschlossen, wie aus der Klageschrift hervorgeht.",
    agent_generated: false,
    assessed_at: NOW,
  };

  const supportingFact: FactReference = {
    id: "fact-001",
    description: "Kaufvertrag wurde am 1. März 2024 geschlossen",
    source: "case_file",
    evidence: [caseEvidence],
    role: "supporting",
    confidence: 0.95,
  };

  return {
    id: "issue-001",
    title: "Kaufvertragliche Ansprüche aus § 433 BGB",
    jurisdiction: "DE",
    as_of_date: TODAY,
    source_snapshot: {
      jurisdiction: "DE",
      as_of_date: TODAY,
      corpus_hashes: { "law/de/bgb": computeContentHash(statuteText) },
      corpus_slugs: ["law/de/bgb"],
    },
    applicable_rules: [
      {
        id: "rule-001",
        law: "BGB",
        section: "433",
        jurisdiction: "DE",
        description: "Kaufvertragliche Verpflichtung des Verkäufers",
        required_elements: [
          { id: "el-001", label: "Abschluss eines Kaufvertrags", required: true },
          { id: "el-002", label: "Verkäuferstellung", required: true },
        ],
        source_slug: "law/de/bgb",
        statute_text: statuteEvidence,
      },
    ],
    required_elements: [
      { id: "el-001", label: "Abschluss eines Kaufvertrags", required: true },
      { id: "el-002", label: "Verkäuferstellung", required: true },
    ],
    element_assessments: [assessment],
    supporting_facts: [supportingFact],
    opposing_facts: [],
    missing_facts: [],
    assumptions: [],
    status: "open",
    risk: "medium",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ── Types & Schema Tests ──────────────────────────────────────────────

describe("LegalIssue types", () => {
  it("LegalIssue has all Pflichtfelder", () => {
    const issue = makeValidIssue();
    // Pflichtfelder: jurisdiction, as_of_date, source_snapshot, required_elements,
    // supporting_facts, opposing_facts, missing_facts, status, assumptions
    expect(issue.jurisdiction).toBeDefined();
    expect(issue.as_of_date).toBeDefined();
    expect(issue.source_snapshot).toBeDefined();
    expect(issue.required_elements).toBeDefined();
    expect(issue.supporting_facts).toBeDefined();
    expect(issue.opposing_facts).toBeDefined();
    expect(issue.missing_facts).toBeDefined();
    expect(issue.status).toBeDefined();
    expect(issue.assumptions).toBeDefined();
  });

  it("JSON schema is exported and well-formed", async () => {
    const mod = await import("./types.ts");
    expect(mod.LEGAL_ISSUE_JSON_SCHEMA).toBeDefined();
    expect(mod.LEGAL_ISSUE_JSON_SCHEMA.title).toBe("LegalIssue");
    expect(mod.LEGAL_ISSUE_JSON_SCHEMA.required).toContain("jurisdiction");
    expect(mod.LEGAL_ISSUE_JSON_SCHEMA.required).toContain("as_of_date");
    expect(mod.LEGAL_ISSUE_JSON_SCHEMA.required).toContain("source_snapshot");
    expect(mod.LEGAL_ISSUE_JSON_SCHEMA.required).toContain("status");
    expect(mod.LEGAL_ISSUE_JSON_SCHEMA.required).toContain("assumptions");
  });
});

// ── Validator: Valid Issue ────────────────────────────────────────────

describe("validateIssue — valid issue", () => {
  it("passes for a valid issue", () => {
    const errors = validateIssue(makeValidIssue());
    expect(errors).toHaveLength(0);
  });

  it("isValidIssue returns true for valid issue", () => {
    expect(isValidIssue(makeValidIssue())).toBe(true);
  });

  it("validateIssueResult returns structured result", () => {
    const result = validateIssueResult(makeValidIssue());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── Invariant I1: satisfied requires verified EvidenceSpan ────────────

describe("Invariant I1: satisfied requires verified evidence", () => {
  it("flags satisfied without evidence", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "satisfied",
          evidence: [],
          reasoning: "Agent believes this is satisfied.",
          agent_generated: true,
          assessed_at: NOW,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I1")).toBe(true);
  });

  it("flags satisfied with only unverified evidence", () => {
    const unverified = makeUnverifiedEvidence();
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "satisfied",
          evidence: [unverified],
          reasoning: "Evidence exists but is not verified.",
          agent_generated: true,
          assessed_at: NOW,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I1")).toBe(true);
  });

  it("flags not_satisfied without verified evidence", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "not_satisfied",
          evidence: [],
          reasoning: "Agent believes this is not satisfied.",
          agent_generated: true,
          assessed_at: NOW,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I1")).toBe(true);
  });

  it("passes satisfied with verified evidence", () => {
    const issue = makeValidIssue();
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I1")).toBe(false);
  });

  it("allows unknown without evidence", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "unknown",
          evidence: [],
          reasoning: "Insufficient information.",
          agent_generated: false,
          assessed_at: NOW,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I1")).toBe(false);
  });

  it("allows disputed without verified evidence", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "disputed",
          evidence: [],
          reasoning: "Facts conflict.",
          agent_generated: false,
          assessed_at: NOW,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I1")).toBe(false);
  });
});

// ── Invariant I2: unknown/disputed never auto-resolves ────────────────

describe("Invariant I2: unknown/disputed blocks definitive conclusion", () => {
  it("flags definitive conclusion with unknown element", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "satisfied",
          evidence: [makeVerifiedEvidence()],
          reasoning: "Satisfied.",
          agent_generated: false,
          assessed_at: NOW,
        },
        {
          element_id: "el-002",
          status: "unknown",
          evidence: [],
          reasoning: "Unknown.",
          agent_generated: false,
          assessed_at: NOW,
        },
      ],
      status: "concluded",
      conclusion: {
        outcome: "applies",
        is_definitive: true,
        summary: "The rule applies.",
        agent_generated: false,
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I2")).toBe(true);
  });

  it("flags definitive conclusion with disputed element", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "disputed",
          evidence: [],
          reasoning: "Disputed.",
          agent_generated: false,
          assessed_at: NOW,
        },
      ],
      status: "concluded",
      conclusion: {
        outcome: "applies",
        is_definitive: true,
        summary: "The rule applies.",
        agent_generated: false,
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I2")).toBe(true);
  });

  it("allows non-definitive conclusion with unknown element", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "el-001",
          status: "unknown",
          evidence: [],
          reasoning: "Unknown.",
          agent_generated: false,
          assessed_at: NOW,
        },
      ],
      status: "concluded",
      conclusion: {
        outcome: "conditional",
        is_definitive: false,
        summary: "The rule may apply conditionally.",
        agent_generated: false,
        conditions: ["Element el-001 must be clarified"],
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I2")).toBe(false);
  });

  it("flags definitive conclusion when assumptions exist", () => {
    const assumption: Assumption = {
      id: "assump-001",
      description: "Assuming the contract was signed",
      justification: "No direct evidence but likely",
      agent_generated: true,
      created_at: NOW,
    };
    const issue = makeValidIssue({
      assumptions: [assumption],
      status: "concluded",
      conclusion: {
        outcome: "applies",
        is_definitive: true,
        summary: "The rule applies.",
        agent_generated: false,
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I2")).toBe(true);
  });
});

// ── Invariant I3: jurisdiction and as_of_date are mandatory ───────────

describe("Invariant I3: jurisdiction and as_of_date mandatory", () => {
  it("flags missing jurisdiction", () => {
    const issue = makeValidIssue({ jurisdiction: "" as unknown as Jurisdiction });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I3")).toBe(true);
  });

  it("flags invalid jurisdiction", () => {
    const issue = makeValidIssue({ jurisdiction: "FR" as unknown as Jurisdiction });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I3")).toBe(true);
  });

  it("flags missing as_of_date", () => {
    const issue = makeValidIssue({ as_of_date: "" });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I3")).toBe(true);
  });

  it("flags invalid as_of_date format", () => {
    const issue = makeValidIssue({ as_of_date: "not-a-date" });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I3")).toBe(true);
  });

  it("flags missing source_snapshot.jurisdiction", () => {
    const issue = makeValidIssue({
      source_snapshot: {
        jurisdiction: "" as unknown as Jurisdiction,
        as_of_date: TODAY,
        corpus_hashes: { "law/de/bgb": "abc" },
        corpus_slugs: ["law/de/bgb"],
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I3")).toBe(true);
  });

  it("flags missing source_snapshot.as_of_date", () => {
    const issue = makeValidIssue({
      source_snapshot: {
        jurisdiction: "DE",
        as_of_date: "",
        corpus_hashes: { "law/de/bgb": "abc" },
        corpus_slugs: ["law/de/bgb"],
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I3")).toBe(true);
  });

  it("flags jurisdiction mismatch between issue and source_snapshot", () => {
    const issue = makeValidIssue({
      jurisdiction: "DE",
      source_snapshot: {
        jurisdiction: "AT",
        as_of_date: TODAY,
        corpus_hashes: { "law/at/abgb": "abc" },
        corpus_slugs: ["law/at/abgb"],
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.field === "jurisdiction")).toBe(true);
  });
});

// ── Invariant I4: free agent text is not canonical truth ──────────────

describe("Invariant I4: agent text is not canonical", () => {
  it("flags agent_inferred fact with confidence > 0.5", () => {
    const issue = makeValidIssue({
      supporting_facts: [
        {
          id: "fact-agent",
          description: "Agent inferred this fact",
          source: "agent_inferred",
          evidence: [],
          role: "supporting",
          confidence: 0.9,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I4")).toBe(true);
  });

  it("flags agent_inferred fact without evidence", () => {
    const issue = makeValidIssue({
      supporting_facts: [
        {
          id: "fact-agent",
          description: "Agent inferred this fact",
          source: "agent_inferred",
          evidence: [],
          role: "supporting",
          confidence: 0.3,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I4")).toBe(true);
  });

  it("flags agent-generated definitive conclusion", () => {
    const issue = makeValidIssue({
      status: "concluded",
      conclusion: {
        outcome: "applies",
        is_definitive: true,
        summary: "Agent says rule applies.",
        agent_generated: true,
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I4")).toBe(true);
  });

  it("allows agent-generated non-definitive conclusion", () => {
    const issue = makeValidIssue({
      status: "concluded",
      conclusion: {
        outcome: "conditional",
        is_definitive: false,
        summary: "Agent suggests rule may apply.",
        agent_generated: true,
        conditions: ["Needs human review"],
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I4")).toBe(false);
  });

  it("allows agent_inferred fact with low confidence and evidence", () => {
    const ev = makeVerifiedEvidence();
    const issue = makeValidIssue({
      supporting_facts: [
        {
          id: "fact-agent-2",
          description: "Agent inferred with evidence",
          source: "agent_inferred",
          evidence: [ev],
          role: "supporting",
          confidence: 0.4,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.invariant === "I4")).toBe(false);
  });
});

// ── Evidence Span Validation ──────────────────────────────────────────

describe("verifyEvidenceSpanHash", () => {
  it("returns true when hash matches text", () => {
    const span = makeVerifiedEvidence();
    expect(verifyEvidenceSpanHash(span)).toBe(true);
  });

  it("returns false when hash does not match text", () => {
    const span = makeVerifiedEvidence({ content_hash: "a".repeat(64) });
    expect(verifyEvidenceSpanHash(span)).toBe(false);
  });
});

describe("isVerifiedEvidence", () => {
  it("returns true for verified span", () => {
    expect(isVerifiedEvidence(makeVerifiedEvidence())).toBe(true);
  });

  it("returns false for unverified span", () => {
    expect(isVerifiedEvidence(makeUnverifiedEvidence())).toBe(false);
  });
});

// ── Cross-Field Validation ────────────────────────────────────────────

describe("cross-field validation", () => {
  it("flags element_assessment referencing non-existent element", () => {
    const issue = makeValidIssue({
      element_assessments: [
        {
          element_id: "non-existent",
          status: "satisfied",
          evidence: [makeVerifiedEvidence()],
          reasoning: "Satisfied.",
          agent_generated: false,
          assessed_at: NOW,
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.field === "element_assessments[0].element_id")).toBe(true);
  });

  it("flags concluded status without conclusion", () => {
    const issue = makeValidIssue({ status: "concluded", conclusion: undefined });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.field === "conclusion")).toBe(true);
  });

  it("flags conclusion present with non-concluded status", () => {
    const issue = makeValidIssue({
      status: "open",
      conclusion: {
        outcome: "applies",
        is_definitive: false,
        summary: "Rule applies.",
        agent_generated: false,
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("flags rule jurisdiction mismatch", () => {
    const issue = makeValidIssue({
      applicable_rules: [
        {
          id: "rule-001",
          law: "BGB",
          section: "433",
          jurisdiction: "AT",
          description: "Kaufvertrag",
          required_elements: [{ id: "el-001", label: "Kaufvertrag", required: true }],
          source_slug: "law/at/abgb",
          statute_text: makeVerifiedEvidence({ jurisdiction: "AT", source_slug: "law/at/abgb" }),
        },
      ],
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.field === "applicable_rules[0].jurisdiction")).toBe(true);
  });

  it("flags conditional conclusion without conditions", () => {
    const issue = makeValidIssue({
      status: "concluded",
      conclusion: {
        outcome: "conditional",
        is_definitive: false,
        summary: "Conditional.",
        agent_generated: false,
        concluded_at: NOW,
      },
    });
    const errors = validateIssue(issue);
    expect(errors.some((e) => e.field === "conclusion.conditions")).toBe(true);
  });
});

// ── createIssueDraft ──────────────────────────────────────────────────

describe("createIssueDraft", () => {
  it("creates a valid minimal issue", () => {
    const draft = createIssueDraft({
      id: "draft-001",
      title: "Test Issue",
      jurisdiction: "DE",
      as_of_date: TODAY,
      corpus_slugs: ["law/de/bgb"],
      corpus_hashes: { "law/de/bgb": "abc123" },
    });
    expect(draft.status).toBe("open");
    expect(draft.risk).toBe("medium");
    expect(draft.applicable_rules).toEqual([]);
    expect(draft.required_elements).toEqual([]);
    expect(isValidIssue(draft)).toBe(false); // No required_elements or applicable_rules
  });

  it("creates a valid issue when elements are added", () => {
    const draft = createIssueDraft({
      id: "draft-002",
      title: "Test Issue 2",
      jurisdiction: "AT",
      as_of_date: TODAY,
      corpus_slugs: ["law/at/abgb"],
      corpus_hashes: { "law/at/abgb": "abc123" },
    });
    draft.required_elements = [{ id: "el-001", label: "Test element", required: true }];
    draft.element_assessments = [
      {
        element_id: "el-001",
        status: "unknown",
        evidence: [],
        reasoning: "Not yet assessed",
        agent_generated: false,
        assessed_at: NOW,
      },
    ];
    expect(isValidIssue(draft)).toBe(true);
  });
});

// ── Store: In-Memory Implementation ───────────────────────────────────

describe("InMemoryIssueStore", () => {
  let store: IssueStore;

  function makeStoreIssue(id: string): LegalIssue {
    const issue = makeValidIssue({ id });
    // Add at least one required element + assessment to make it valid
    return issue;
  }

  it("creates and retrieves an issue", async () => {
    store = createInMemoryIssueStore();
    const issue = makeStoreIssue("test-create-001");
    await store.create(issue);
    const retrieved = await store.getById("test-create-001");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("test-create-001");
    expect(retrieved!.title).toBe(issue.title);
  });

  it("throws on duplicate create", async () => {
    store = createInMemoryIssueStore();
    const issue = makeStoreIssue("test-dup-001");
    await store.create(issue);
    await expect(store.create(issue)).rejects.toThrow(IssueStoreError);
  });

  it("returns null for non-existent id", async () => {
    store = createInMemoryIssueStore();
    const result = await store.getById("non-existent");
    expect(result).toBeNull();
  });

  it("lists issues with filters", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("list-001"));
    await store.create(makeStoreIssue("list-002"));
    const deIssues = await store.list({ jurisdiction: "DE" });
    expect(deIssues.length).toBe(2);
    const atIssues = await store.list({ jurisdiction: "AT" });
    expect(atIssues.length).toBe(0);
  });

  it("updates an issue", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("update-001"));
    const updated = await store.update("update-001", {
      status: "concluded",
      conclusion: {
        outcome: "applies",
        is_definitive: false,
        summary: "Rule applies.",
        agent_generated: false,
        concluded_at: NOW,
      },
    });
    expect(updated.status).toBe("concluded");
    expect(updated.conclusion).toBeDefined();
  });

  it("throws on update of non-existent issue", async () => {
    store = createInMemoryIssueStore();
    await expect(store.update("non-existent", { status: "concluded" })).rejects.toThrow(IssueStoreError);
  });

  it("deletes an issue", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("delete-001"));
    expect(await store.delete("delete-001")).toBe(true);
    expect(await store.getById("delete-001")).toBeNull();
    expect(await store.delete("delete-001")).toBe(false);
  });

  it("counts issues", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("count-001"));
    await store.create(makeStoreIssue("count-002"));
    expect(await store.count({ jurisdiction: "DE" })).toBe(2);
    expect(await store.count({ jurisdiction: "AT" })).toBe(0);
  });

  it("findByCorpusSlug returns referencing issues", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("corpus-001"));
    const found = await store.findByCorpusSlug("law/de/bgb");
    expect(found.length).toBe(1);
    expect(found[0]!.id).toBe("corpus-001");
  });

  it("findByCorpusSlug returns empty for non-referenced slug", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("corpus-002"));
    const found = await store.findByCorpusSlug("law/at/abgb");
    expect(found.length).toBe(0);
  });

  it("markStaleByCorpusSlug marks issues stale", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("stale-001"));
    const count = await store.markStaleByCorpusSlug("law/de/bgb");
    expect(count).toBe(1);
    const issue = await store.getById("stale-001");
    expect(issue!.status).toBe("stale");
  });

  it("markStaleByCorpusSlug does not double-mark already stale issues", async () => {
    store = createInMemoryIssueStore();
    await store.create(makeStoreIssue("stale-002"));
    await store.markStaleByCorpusSlug("law/de/bgb");
    const count = await store.markStaleByCorpusSlug("law/de/bgb");
    expect(count).toBe(0);
  });

  it("store isolates copies (mutation safety)", async () => {
    store = createInMemoryIssueStore();
    const original = makeStoreIssue("isolate-001");
    await store.create(original);
    const retrieved = await store.getById("isolate-001");
    expect(retrieved).not.toBe(original);
    retrieved!.title = "MUTATED";
    const again = await store.getById("isolate-001");
    expect(again!.title).not.toBe("MUTATED");
  });
});

// ── Migration Test ────────────────────────────────────────────────────

describe("migration 005_legal_issues.sql", () => {
  it("migration file exists", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const migrationPath = path.resolve(
      path.dirname(new URL(".", import.meta.url).pathname),
      "../../../migrations/005_legal_issues.sql"
    );
    const content = await fs.readFile(migrationPath, "utf-8");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS legal_issues");
    expect(content).toContain("jurisdiction");
    expect(content).toContain("as_of_date");
    expect(content).toContain("status");
    expect(content).toContain("data");
    expect(content).toContain("CHECK (jurisdiction IN");
    expect(content).toContain("CHECK (status IN");
    expect(content).toContain("CHECK (risk IN");
    expect(content).toContain("idx_legal_issues_corpus_slugs");
    expect(content).toContain("GIN");
  });

  it("migration has correct CHECK constraints", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const migrationPath = path.resolve(
      path.dirname(new URL(".", import.meta.url).pathname),
      "../../../migrations/005_legal_issues.sql"
    );
    const content = await fs.readFile(migrationPath, "utf-8");
    // I3: jurisdiction check
    expect(content).toMatch(/jurisdiction IN \('DE', 'AT', 'CH', 'EU'\)/);
    // Status check
    expect(content).toMatch(/status IN \('open', 'concluded', 'stale', 'blocked'\)/);
    // Risk check
    expect(content).toMatch(/risk IN \('low', 'medium', 'high'\)/);
  });

  it("migration has updated_at trigger", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const migrationPath = path.resolve(
      path.dirname(new URL(".", import.meta.url).pathname),
      "../../../migrations/005_legal_issues.sql"
    );
    const content = await fs.readFile(migrationPath, "utf-8");
    expect(content).toContain("trg_legal_issues_updated_at");
    expect(content).toContain("BEFORE UPDATE");
  });
});
