import { describe, it, expect } from "vitest";
import {
  checkNeedToKnow,
  detectGoldenExamples,
  classifyFirmKnowledgeType,
  filterFirmKnowledgeResults,
  rankWithGoldenBoost,
  processFirmKnowledgeResults,
  type PermissionInfo,
} from "./firm-knowledge.ts";
import type { SearchResult } from "../types.ts";

function mockResult(
  score: number,
  slug: string = "matter/case-001/doc.md",
  sourceId: string = "brain_abc",
  chunkId: number = Math.floor(Math.random() * 100000),
  text: string = "Some content"
): SearchResult {
  return {
    chunk_id: chunkId,
    chunk_text: text,
    title: text.slice(0, 50),
    slug,
    source_id: sourceId,
    score,
  } as unknown as SearchResult;
}

describe("Firm Knowledge Search", () => {
  // ── checkNeedToKnow ──

  describe("checkNeedToKnow", () => {
    it("allows access when no permissions defined", () => {
      const result = checkNeedToKnow("user-1", undefined, undefined, true);
      expect(result.hasNeedToKnow).toBe(true);
      expect(result.enforced).toBe(true);
    });

    it("allows access for full visibility", () => {
      const perms: PermissionInfo = { visibility: "full", allowed_users: [], blocked_users: [] };
      const result = checkNeedToKnow("user-1", perms, undefined, true);
      expect(result.hasNeedToKnow).toBe(true);
    });

    it("allows access for restricted when user in allowed_users", () => {
      const perms: PermissionInfo = {
        visibility: "restricted",
        allowed_users: ["user-1"],
        blocked_users: [],
      };
      const result = checkNeedToKnow("user-1", perms, undefined, true);
      expect(result.hasNeedToKnow).toBe(true);
    });

    it("denies access for restricted when user not in allowed_users", () => {
      const perms: PermissionInfo = {
        visibility: "restricted",
        allowed_users: ["user-2"],
        blocked_users: [],
      };
      const result = checkNeedToKnow("user-1", perms, undefined, true);
      expect(result.hasNeedToKnow).toBe(false);
      expect(result.reason).toContain("not_in_allowed_users");
    });

    it("denies access when blocked by ethical wall", () => {
      const perms: PermissionInfo = {
        visibility: "full",
        allowed_users: [],
        blocked_users: ["user-1"],
      };
      const result = checkNeedToKnow("user-1", perms, undefined, true);
      expect(result.hasNeedToKnow).toBe(false);
      expect(result.reason).toContain("ethical_wall");
    });

    it("skips enforcement when enforce=false", () => {
      const perms: PermissionInfo = {
        visibility: "restricted",
        allowed_users: ["user-2"],
        blocked_users: ["user-1"],
      };
      const result = checkNeedToKnow("user-1", perms, undefined, false);
      expect(result.hasNeedToKnow).toBe(true);
      expect(result.enforced).toBe(false);
    });

    it("allows general firm knowledge without matter slug", () => {
      const perms: PermissionInfo = { visibility: "full", allowed_users: [], blocked_users: [] };
      const result = checkNeedToKnow("user-1", perms, undefined, true);
      expect(result.hasNeedToKnow).toBe(true);
      // With full visibility, the reason is "full_visibility" (checked before matter slug)
      expect(result.reason).toMatch(/full_visibility|general_firm_knowledge/);
    });

    it("allows matter access for user in allowed_users", () => {
      const perms: PermissionInfo = {
        visibility: "restricted",
        allowed_users: ["user-1"],
        blocked_users: [],
      };
      const result = checkNeedToKnow("user-1", perms, "case-001", true);
      expect(result.hasNeedToKnow).toBe(true);
      expect(result.reason).toContain("matter_access");
    });
  });

  // ── detectGoldenExamples ──

  describe("detectGoldenExamples", () => {
    it("detects golden by slug path /golden/", () => {
      const results = [mockResult(0.8, "templates/golden/contract.md")];
      const { golden, normal } = detectGoldenExamples(results);
      expect(golden.length).toBe(1);
      expect(normal.length).toBe(0);
      expect(golden[0].boost).toBeGreaterThan(0);
    });

    it("detects golden by slug path /curated/", () => {
      const results = [mockResult(0.8, "playbooks/curated/process.md")];
      const { golden } = detectGoldenExamples(results);
      expect(golden.length).toBe(1);
    });

    it("detects golden by title [Golden Example]", () => {
      const results = [
        mockResult(
          0.8,
          "templates/contract.md",
          "brain_abc",
          1,
          "[Golden Example] Contract Template"
        ),
      ];
      const { golden } = detectGoldenExamples(results);
      expect(golden.length).toBe(1);
    });

    it("detects golden by title [Best Practice]", () => {
      const results = [
        mockResult(0.8, "playbooks/process.md", "brain_abc", 1, "[Best Practice] Process"),
      ];
      const { golden } = detectGoldenExamples(results);
      expect(golden.length).toBe(1);
    });

    it("detects golden by frontmatter golden: true", () => {
      const results = [
        mockResult(0.8, "templates/contract.md", "brain_abc", 1, "---\ngolden: true\n---\nContent"),
      ];
      const { golden } = detectGoldenExamples(results);
      expect(golden.length).toBe(1);
      expect(golden[0].boost).toBe(0.2);
    });

    it("detects golden by frontmatter curated: true with curator info", () => {
      const results = [
        mockResult(
          0.8,
          "templates/contract.md",
          "brain_abc",
          1,
          "---\ncurated: true\ncurated_by: lawyer-1\ncurated_at: 2024-01-15\n---\nContent"
        ),
      ];
      const { golden } = detectGoldenExamples(results);
      expect(golden.length).toBe(1);
      expect(golden[0].curatedBy).toBe("lawyer-1");
      expect(golden[0].curatedAt).toBe("2024-01-15");
    });

    it("separates golden from normal results", () => {
      const results = [
        mockResult(0.9, "templates/golden/contract.md", "brain_abc", 1),
        mockResult(0.7, "matter/case-001/doc.md", "brain_abc", 2),
        mockResult(0.5, "memo/internal.md", "brain_abc", 3),
      ];
      const { golden, normal } = detectGoldenExamples(results);
      expect(golden.length).toBe(1);
      expect(normal.length).toBe(2);
    });

    it("returns empty golden for no golden examples", () => {
      const results = [mockResult(0.8, "matter/case-001/doc.md")];
      const { golden, normal } = detectGoldenExamples(results);
      expect(golden.length).toBe(0);
      expect(normal.length).toBe(1);
    });
  });

  // ── classifyFirmKnowledgeType ──

  describe("classifyFirmKnowledgeType", () => {
    it("classifies matter slugs", () => {
      expect(classifyFirmKnowledgeType(mockResult(0.8, "matter/case-001/doc.md"))).toBe("matter");
      expect(classifyFirmKnowledgeType(mockResult(0.8, "case/abc/doc.md"))).toBe("matter");
      expect(classifyFirmKnowledgeType(mockResult(0.8, "akte/xyz/doc.md"))).toBe("matter");
    });

    it("classifies memo slugs", () => {
      expect(classifyFirmKnowledgeType(mockResult(0.8, "memo/internal-note.md"))).toBe("memo");
      expect(classifyFirmKnowledgeType(mockResult(0.8, "internal/research.md"))).toBe("memo");
    });

    it("classifies playbook slugs", () => {
      expect(classifyFirmKnowledgeType(mockResult(0.8, "playbooks/process.md"))).toBe("playbook");
      expect(classifyFirmKnowledgeType(mockResult(0.8, "process/checklist.md"))).toBe("playbook");
    });

    it("classifies template slugs", () => {
      expect(classifyFirmKnowledgeType(mockResult(0.8, "templates/contract.md"))).toBe("template");
      expect(classifyFirmKnowledgeType(mockResult(0.8, "muster/klausel.md"))).toBe("template");
      expect(classifyFirmKnowledgeType(mockResult(0.8, "vorlage/vertrag.md"))).toBe("template");
    });

    it("classifies precedent slugs", () => {
      expect(classifyFirmKnowledgeType(mockResult(0.8, "precedents/case-123.md"))).toBe(
        "precedent"
      );
    });

    it("classifies research slugs", () => {
      expect(classifyFirmKnowledgeType(mockResult(0.8, "research/topic.md"))).toBe("research");
      expect(classifyFirmKnowledgeType(mockResult(0.8, "recherche/thema.md"))).toBe("research");
    });

    it("returns unknown for unclassified slugs", () => {
      expect(classifyFirmKnowledgeType(mockResult(0.8, "random/path.md"))).toBe("unknown");
    });
  });

  // ── filterFirmKnowledgeResults ──

  describe("filterFirmKnowledgeResults", () => {
    it("excludes law-* sources", () => {
      const results = [
        mockResult(0.9, "legal/statutes/de/bgb.md", "law-de"),
        mockResult(0.8, "matter/case-001/doc.md", "brain_abc"),
      ];
      const { filtered, excluded } = filterFirmKnowledgeResults(results, {
        query: "test",
        userId: "user-1",
        brainId: "brain_abc",
        orgId: "org-1",
      });
      expect(filtered.length).toBe(1);
      expect(excluded.length).toBe(1);
      expect(excluded[0].source).toBe("law-de");
    });

    it("filters matter-specific results when matter slug is provided", () => {
      const results = [
        mockResult(0.9, "matter/case-001/doc.md", "brain_abc"),
        mockResult(0.8, "matter/case-002/doc.md", "brain_abc"),
        mockResult(0.7, "memo/general.md", "brain_abc"),
      ];
      const { filtered } = filterFirmKnowledgeResults(results, {
        query: "test",
        userId: "user-1",
        brainId: "brain_abc",
        orgId: "org-1",
        matterSlug: "case-001",
        enforceNeedToKnow: true,
      });
      // case-001 matches, general memo is allowed, case-002 is filtered out
      expect(filtered.length).toBe(2);
    });

    it("excludes user blocked by ethical wall", () => {
      const perms: PermissionInfo = {
        visibility: "full",
        allowed_users: [],
        blocked_users: ["user-1"],
      };
      const results = [mockResult(0.9, "matter/case-001/doc.md", "brain_abc")];
      const { filtered } = filterFirmKnowledgeResults(results, {
        query: "test",
        userId: "user-1",
        brainId: "brain_abc",
        orgId: "org-1",
        matterPermissions: perms,
      });
      expect(filtered.length).toBe(0);
    });
  });

  // ── rankWithGoldenBoost ──

  describe("rankWithGoldenBoost", () => {
    it("applies boost to golden examples", () => {
      const results = [
        mockResult(0.7, "matter/doc.md", "brain_abc", 1),
        mockResult(0.5, "templates/golden/contract.md", "brain_abc", 2),
      ];
      const { golden } = detectGoldenExamples(results);
      const ranked = rankWithGoldenBoost(results, golden);
      // The golden example should now be ranked higher due to boost
      expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });

    it("preserves order when no golden examples", () => {
      const results = [
        mockResult(0.9, "matter/doc.md", "brain_abc", 1),
        mockResult(0.7, "memo/note.md", "brain_abc", 2),
      ];
      const ranked = rankWithGoldenBoost(results, []);
      expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });
  });

  // ── processFirmKnowledgeResults (integration) ──

  describe("processFirmKnowledgeResults", () => {
    it("full pipeline with golden examples", () => {
      const results = [
        mockResult(
          0.9,
          "templates/golden/contract.md",
          "brain_abc",
          1,
          "[Golden Example] Contract"
        ),
        mockResult(0.8, "matter/case-001/doc.md", "brain_abc", 2),
        mockResult(0.7, "legal/statutes/de/bgb.md", "law-de", 3),
      ];
      const result = processFirmKnowledgeResults(results, {
        query: "contract template",
        userId: "user-1",
        brainId: "brain_abc",
        orgId: "org-1",
        includeGolden: true,
      });
      expect(result.ethicalWallPassed).toBe(true);
      expect(result.needToKnowEnforced).toBe(true);
      expect(result.goldenExamples.length).toBe(1);
      expect(result.results.length).toBe(1); // only the matter doc (golden is separated)
      expect(result.excludedSources.length).toBe(1); // law-de excluded
      expect(result.totalBeforeFilter).toBe(3);
      expect(result.totalAfterFilter).toBe(2); // golden + matter (law-de excluded)
    });

    it("returns empty results when need-to-know fails", () => {
      const perms: PermissionInfo = {
        visibility: "restricted",
        allowed_users: ["user-2"],
        blocked_users: [],
      };
      const results = [mockResult(0.9, "matter/case-001/doc.md", "brain_abc")];
      const result = processFirmKnowledgeResults(results, {
        query: "test",
        userId: "user-1",
        brainId: "brain_abc",
        orgId: "org-1",
        matterPermissions: perms,
      });
      expect(result.results.length).toBe(0);
      expect(result.goldenExamples.length).toBe(0);
      expect(result.ethicalWallPassed).toBe(false);
    });

    it("respects limit", () => {
      const results = Array.from({ length: 30 }, (_, i) =>
        mockResult(0.9 - i * 0.01, `matter/case-${i}/doc.md`, "brain_abc", i)
      );
      const result = processFirmKnowledgeResults(results, {
        query: "test",
        userId: "user-1",
        brainId: "brain_abc",
        orgId: "org-1",
        limit: 10,
      });
      expect(result.results.length).toBe(10);
    });

    it("disables golden examples when includeGolden=false", () => {
      const results = [
        mockResult(
          0.9,
          "templates/golden/contract.md",
          "brain_abc",
          1,
          "[Golden Example] Contract"
        ),
        mockResult(0.8, "matter/case-001/doc.md", "brain_abc", 2),
      ];
      const result = processFirmKnowledgeResults(results, {
        query: "test",
        userId: "user-1",
        brainId: "brain_abc",
        orgId: "org-1",
        includeGolden: false,
      });
      expect(result.goldenExamples.length).toBe(0);
      // Both results should be in normal results (golden not separated)
      expect(result.results.length).toBe(2);
    });
  });
});
