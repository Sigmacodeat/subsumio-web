/**
 * Tests for EPIC 8 — T8.2 Prompt Registry
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPrompt,
  submitEvalResults,
  promotePrompt,
  rollbackPrompt,
  getActivePrompt,
  getPromptVersion,
  listVersions,
  listPromptNames,
  getAuditTrail,
  verifyPromptIntegrity,
  computePromptHash,
  _resetPromptStore,
  PROMOTE_PASS_RATE_THRESHOLD,
  PROMOTE_HALLUCINATION_RATE_THRESHOLD,
  type PromptEvalResults,
} from "./prompt-registry.ts";

const GOOD_EVAL: PromptEvalResults = {
  pass_rate: 0.92,
  hallucination_rate: 0.05,
  tested_at: "2026-07-13T10:00:00Z",
  fixture_version: "v2.1",
  total_cases: 100,
  passed_cases: 92,
};

const BAD_EVAL_LOW_PASS: PromptEvalResults = {
  ...GOOD_EVAL,
  pass_rate: 0.7,
  passed_cases: 70,
};

const BAD_EVAL_HIGH_HALLUC: PromptEvalResults = {
  ...GOOD_EVAL,
  hallucination_rate: 0.15,
};

describe("Prompt Registry", () => {
  beforeEach(() => {
    _resetPromptStore();
  });

  describe("registerPrompt", () => {
    it("registers a new prompt with draft status", () => {
      const entry = registerPrompt({
        name: "think.legal.system",
        content: "You are a legal AI assistant.",
        owner: "legal-team",
      });
      expect(entry.eval_status).toBe("draft");
      expect(entry.version).toBe("1.0.0");
      expect(entry.hash).toHaveLength(64);
      expect(entry.owner).toBe("legal-team");
    });

    it("auto-increments version for subsequent registrations", () => {
      registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      const v2 = registerPrompt({ name: "test.prompt", content: "v2", owner: "team" });
      expect(v2.version).toBe("1.0.1");
    });

    it("rejects duplicate content with same hash", () => {
      registerPrompt({ name: "test.prompt", content: "same content", owner: "team" });
      expect(() =>
        registerPrompt({ name: "test.prompt", content: "same content", owner: "team" })
      ).toThrow(/identical content/);
    });
  });

  describe("submitEvalResults", () => {
    it("transitions prompt to tested status", () => {
      const entry = registerPrompt({
        name: "test.prompt",
        content: "content",
        owner: "team",
      });
      const updated = submitEvalResults("test.prompt", entry.version, GOOD_EVAL);
      expect(updated.eval_status).toBe("tested");
      expect(updated.eval_results?.pass_rate).toBe(0.92);
    });

    it("throws for unknown prompt", () => {
      expect(() => submitEvalResults("unknown.prompt", "1.0.0", GOOD_EVAL)).toThrow(/not found/);
    });

    it("throws for already promoted prompt", () => {
      const entry = registerPrompt({
        name: "test.prompt",
        content: "content",
        owner: "team",
      });
      submitEvalResults("test.prompt", entry.version, GOOD_EVAL);
      promotePrompt({
        name: "test.prompt",
        version: entry.version,
        eval_results: GOOD_EVAL,
      });
      expect(() => submitEvalResults("test.prompt", entry.version, GOOD_EVAL)).toThrow(
        /already promoted/
      );
    });
  });

  describe("promotePrompt (dev/test gate)", () => {
    it("promotes a tested prompt with good eval results", () => {
      const entry = registerPrompt({
        name: "test.prompt",
        content: "content",
        owner: "team",
      });
      submitEvalResults("test.prompt", entry.version, GOOD_EVAL);
      const { promoted, previous } = promotePrompt({
        name: "test.prompt",
        version: entry.version,
        eval_results: GOOD_EVAL,
      });
      expect(promoted.eval_status).toBe("promoted");
      expect(promoted.promoted_at).toBeDefined();
      expect(previous).toBeUndefined();
    });

    it("rejects promotion of draft prompt (not tested)", () => {
      const entry = registerPrompt({
        name: "test.prompt",
        content: "content",
        owner: "team",
      });
      expect(() =>
        promotePrompt({
          name: "test.prompt",
          version: entry.version,
          eval_results: GOOD_EVAL,
        })
      ).toThrow(/eval_status.*must be.*tested/);
    });

    it("rejects promotion with pass_rate below threshold", () => {
      const entry = registerPrompt({
        name: "test.prompt",
        content: "content",
        owner: "team",
      });
      submitEvalResults("test.prompt", entry.version, BAD_EVAL_LOW_PASS);
      expect(() =>
        promotePrompt({
          name: "test.prompt",
          version: entry.version,
          eval_results: BAD_EVAL_LOW_PASS,
        })
      ).toThrow(/pass_rate.*below threshold/);
    });

    it("rejects promotion with hallucination_rate above threshold", () => {
      const entry = registerPrompt({
        name: "test.prompt",
        content: "content",
        owner: "team",
      });
      submitEvalResults("test.prompt", entry.version, BAD_EVAL_HIGH_HALLUC);
      expect(() =>
        promotePrompt({
          name: "test.prompt",
          version: entry.version,
          eval_results: BAD_EVAL_HIGH_HALLUC,
        })
      ).toThrow(/hallucination_rate.*exceeds threshold/);
    });

    it("rolls back previous promoted version when promoting new one", () => {
      const v1 = registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      submitEvalResults("test.prompt", v1.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v1.version, eval_results: GOOD_EVAL });

      const v2 = registerPrompt({ name: "test.prompt", content: "v2", owner: "team" });
      submitEvalResults("test.prompt", v2.version, GOOD_EVAL);
      const { promoted, previous } = promotePrompt({
        name: "test.prompt",
        version: v2.version,
        eval_results: GOOD_EVAL,
      });

      expect(promoted.version).toBe(v2.version);
      expect(previous?.version).toBe(v1.version);
      expect(previous?.eval_status).toBe("rolled_back");
    });
  });

  describe("rollbackPrompt", () => {
    it("rolls back to previous promoted version", () => {
      const v1 = registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      submitEvalResults("test.prompt", v1.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v1.version, eval_results: GOOD_EVAL });

      const v2 = registerPrompt({ name: "test.prompt", content: "v2", owner: "team" });
      submitEvalResults("test.prompt", v2.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v2.version, eval_results: GOOD_EVAL });

      const { rolled_back, restored } = rollbackPrompt("test.prompt", "v2 caused regression");
      expect(rolled_back.version).toBe(v2.version);
      expect(rolled_back.eval_status).toBe("rolled_back");
      expect(rolled_back.rollback_reason).toBe("v2 caused regression");
      expect(restored?.version).toBe(v1.version);
      expect(restored?.eval_status).toBe("promoted");
    });

    it("throws when no active version exists", () => {
      expect(() => rollbackPrompt("unknown.prompt", "test")).toThrow(/Nothing to roll back/);
    });

    it("deletes active version when no previous promoted exists", () => {
      const v1 = registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      submitEvalResults("test.prompt", v1.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v1.version, eval_results: GOOD_EVAL });

      const { rolled_back, restored } = rollbackPrompt("test.prompt", "revert");
      expect(rolled_back.version).toBe(v1.version);
      expect(restored).toBeUndefined();
      expect(getActivePrompt("test.prompt")).toBeUndefined();
    });
  });

  describe("getActivePrompt", () => {
    it("returns undefined when no prompt promoted", () => {
      expect(getActivePrompt("test.prompt")).toBeUndefined();
    });

    it("returns the currently promoted prompt", () => {
      const v1 = registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      submitEvalResults("test.prompt", v1.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v1.version, eval_results: GOOD_EVAL });

      const active = getActivePrompt("test.prompt");
      expect(active?.version).toBe(v1.version);
      expect(active?.content).toBe("v1");
    });
  });

  describe("listVersions", () => {
    it("returns all versions sorted ascending", () => {
      registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      registerPrompt({ name: "test.prompt", content: "v2", owner: "team" });
      registerPrompt({ name: "test.prompt", content: "v3", owner: "team" });

      const versions = listVersions("test.prompt");
      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe("1.0.0");
      expect(versions[2].version).toBe("1.0.2");
    });

    it("returns empty array for unknown prompt", () => {
      expect(listVersions("unknown")).toEqual([]);
    });
  });

  describe("getAuditTrail", () => {
    it("provides full audit trail with active version", () => {
      const v1 = registerPrompt({ name: "test.prompt", content: "v1", owner: "team-a" });
      submitEvalResults("test.prompt", v1.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v1.version, eval_results: GOOD_EVAL });

      const v2 = registerPrompt({ name: "test.prompt", content: "v2", owner: "team-b" });
      submitEvalResults("test.prompt", v2.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v2.version, eval_results: GOOD_EVAL });

      const trail = getAuditTrail("test.prompt");
      expect(trail.name).toBe("test.prompt");
      expect(trail.active_version).toBe(v2.version);
      expect(trail.versions).toHaveLength(2);
      expect(trail.versions[0].owner).toBe("team-a");
      expect(trail.versions[1].owner).toBe("team-b");
      expect(trail.versions[0].eval_status).toBe("rolled_back");
      expect(trail.versions[1].eval_status).toBe("promoted");
    });
  });

  describe("verifyPromptIntegrity", () => {
    it("returns true when no active prompt exists", () => {
      expect(verifyPromptIntegrity("unknown")).toBe(true);
    });

    it("returns true when content matches hash", () => {
      const v1 = registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      submitEvalResults("test.prompt", v1.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v1.version, eval_results: GOOD_EVAL });
      expect(verifyPromptIntegrity("test.prompt")).toBe(true);
    });

    it("returns false when content was tampered after registration", () => {
      const v1 = registerPrompt({ name: "test.prompt", content: "v1", owner: "team" });
      submitEvalResults("test.prompt", v1.version, GOOD_EVAL);
      promotePrompt({ name: "test.prompt", version: v1.version, eval_results: GOOD_EVAL });

      // Tamper with content
      v1.content = "tampered content";
      expect(verifyPromptIntegrity("test.prompt")).toBe(false);
    });
  });

  describe("computePromptHash", () => {
    it("produces deterministic 64-char hex hash", () => {
      const hash = computePromptHash("test content");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
      expect(computePromptHash("test content")).toBe(hash);
    });

    it("produces different hashes for different content", () => {
      expect(computePromptHash("a")).not.toBe(computePromptHash("b"));
    });
  });

  describe("thresholds", () => {
    it("exports pass rate threshold", () => {
      expect(PROMOTE_PASS_RATE_THRESHOLD).toBe(0.85);
    });

    it("exports hallucination rate threshold", () => {
      expect(PROMOTE_HALLUCINATION_RATE_THRESHOLD).toBe(0.1);
    });
  });

  describe("listPromptNames", () => {
    it("lists all registered prompt names", () => {
      registerPrompt({ name: "prompt.a", content: "a", owner: "team" });
      registerPrompt({ name: "prompt.b", content: "b", owner: "team" });
      const names = listPromptNames();
      expect(names).toContain("prompt.a");
      expect(names).toContain("prompt.b");
    });
  });
});
