import { describe, it, expect } from "vitest";
import {
  LEGAL_SKILLS,
  SKILL_CATEGORIES,
  CATEGORY_LABELS,
  WORKFLOW_SKILL_MAPPINGS,
  getSkill,
  getSkillsByCategory,
  getEnabledSkills,
  getSkillByPath,
  getDependencies,
  getDependents,
  getSkillsBySeverity,
  getCriticalSkills,
  getWritingSkills,
  getGoBdRelevantSkills,
  getGdprRelevantSkills,
  getWorkflowMapping,
  getSkillsForWorkflow,
  areDependenciesSatisfied,
  getSkillsWithUnsatisfiedDependencies,
  findMeceOverlaps,
  findUnreachableSkills,
  findMissingSkillPaths,
  getPackVersion,
  getPackSummary,
  type SkillSeverity,
} from "@/lib/legal-skill-pack";

describe("Legal Skill Pack — Constants", () => {
  it("has 9 categories", () => {
    expect(SKILL_CATEGORIES).toHaveLength(9);
  });

  it("all categories have label, description, and icon", () => {
    for (const cat of SKILL_CATEGORIES) {
      expect(cat.label).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    }
  });

  it("CATEGORY_LABELS matches SKILL_CATEGORIES", () => {
    for (const cat of SKILL_CATEGORIES) {
      expect(CATEGORY_LABELS[cat.id]).toBe(cat.label);
    }
  });

  it("pack version is 1.0.0", () => {
    expect(getPackVersion()).toBe("1.0.0");
  });
});

describe("Legal Skill Pack — Catalog Integrity", () => {
  it("has at least 20 skills", () => {
    expect(LEGAL_SKILLS.length).toBeGreaterThanOrEqual(20);
  });

  it("all skills have unique IDs", () => {
    const ids = LEGAL_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all skills have unique skill_paths", () => {
    const paths = LEGAL_SKILLS.map((s) => s.skill_path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("all skill_paths follow skills/<name>/SKILL.md format", () => {
    for (const skill of LEGAL_SKILLS) {
      expect(skill.skill_path).toMatch(/^skills\/[a-z0-9-]+\/SKILL\.md$/);
    }
  });

  it("all skills have valid semver versions", () => {
    for (const skill of LEGAL_SKILLS) {
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("all skills have at least one trigger", () => {
    for (const skill of LEGAL_SKILLS) {
      expect(skill.triggers.length).toBeGreaterThan(0);
    }
  });

  it("all skills have a category from SkillCategory", () => {
    const validCategories = new Set(SKILL_CATEGORIES.map((c) => c.id));
    for (const skill of LEGAL_SKILLS) {
      expect(validCategories.has(skill.category)).toBe(true);
    }
  });

  it("all skills have a severity from SkillSeverity", () => {
    const validSeverities: SkillSeverity[] = ["info", "low", "medium", "high", "critical"];
    const validSet = new Set(validSeverities);
    for (const skill of LEGAL_SKILLS) {
      expect(validSet.has(skill.severity)).toBe(true);
    }
  });

  it("all enabled skills have priority >= 0", () => {
    for (const skill of LEGAL_SKILLS) {
      if (skill.enabled) {
        expect(skill.priority).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("writing skills have writes_to directories", () => {
    for (const skill of LEGAL_SKILLS) {
      if (skill.writes_pages && skill.enabled) {
        expect(skill.writes_to).toBeDefined();
        expect(skill.writes_to!.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Legal Skill Pack — getSkill", () => {
  it("returns skill by ID", () => {
    const skill = getSkill("legal-brain");
    expect(skill).toBeDefined();
    expect(skill!.id).toBe("legal-brain");
    expect(skill!.name).toBe("Legal Brain");
  });

  it("returns undefined for unknown ID", () => {
    expect(getSkill("nonexistent")).toBeUndefined();
  });
});

describe("Legal Skill Pack — getSkillsByCategory", () => {
  it("returns skills for litigation category", () => {
    const skills = getSkillsByCategory("litigation");
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(s.category).toBe("litigation");
      expect(s.enabled).toBe(true);
    }
  });

  it("returns skills for compliance category", () => {
    const skills = getSkillsByCategory("compliance");
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(s.category).toBe("compliance");
    }
  });

  it("returns skills for tax category", () => {
    const skills = getSkillsByCategory("tax");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("returns skills for general_legal category", () => {
    const skills = getSkillsByCategory("general_legal");
    expect(skills.length).toBeGreaterThanOrEqual(4);
  });

  it("excludes disabled skills", () => {
    const skills = getSkillsByCategory("litigation");
    for (const s of skills) {
      expect(s.enabled).toBe(true);
    }
  });
});

describe("Legal Skill Pack — getEnabledSkills", () => {
  it("returns only enabled skills", () => {
    const skills = getEnabledSkills();
    for (const s of skills) {
      expect(s.enabled).toBe(true);
    }
  });

  it("returns all skills if all are enabled", () => {
    const enabled = getEnabledSkills();
    const allEnabled = LEGAL_SKILLS.every((s) => s.enabled);
    if (allEnabled) {
      expect(enabled.length).toBe(LEGAL_SKILLS.length);
    }
  });
});

describe("Legal Skill Pack — getSkillByPath", () => {
  it("returns skill by path", () => {
    const skill = getSkillByPath("skills/legal-brain/SKILL.md");
    expect(skill).toBeDefined();
    expect(skill!.id).toBe("legal-brain");
  });

  it("returns undefined for unknown path", () => {
    expect(getSkillByPath("skills/nonexistent/SKILL.md")).toBeUndefined();
  });
});

describe("Legal Skill Pack — Dependencies", () => {
  it("getDependencies returns dependent skills", () => {
    const deps = getDependencies("legal-subsumption");
    expect(deps.length).toBeGreaterThan(0);
    expect(deps.some((d) => d.id === "legal-brain")).toBe(true);
  });

  it("getDependencies returns empty for skill with no deps", () => {
    const deps = getDependencies("legal-normen");
    expect(deps).toHaveLength(0);
  });

  it("getDependents returns skills that depend on this one", () => {
    const dependents = getDependents("legal-brain");
    expect(dependents.length).toBeGreaterThan(0);
    expect(dependents.some((d) => d.id === "legal-subsumption")).toBe(true);
  });

  it("areDependenciesSatisfied returns true when all deps enabled", () => {
    expect(areDependenciesSatisfied("legal-normen")).toBe(true);
  });

  it("getSkillsWithUnsatisfiedDependencies returns empty when all deps enabled", () => {
    const unsatisfied = getSkillsWithUnsatisfiedDependencies();
    // All dependencies should be on enabled skills
    expect(unsatisfied).toHaveLength(0);
  });
});

describe("Legal Skill Pack — Severity", () => {
  it("getSkillsBySeverity filters by severity", () => {
    const critical = getSkillsBySeverity("critical");
    for (const s of critical) {
      expect(s.severity).toBe("critical");
    }
  });

  it("getCriticalSkills returns only critical severity", () => {
    const critical = getCriticalSkills();
    for (const s of critical) {
      expect(s.severity).toBe("critical");
    }
    expect(critical.length).toBeGreaterThan(0);
  });

  it("critical skills include deadline-extract and kollisionspruefung", () => {
    const critical = getCriticalSkills();
    const ids = critical.map((s) => s.id);
    expect(ids).toContain("deadline-extract");
    expect(ids).toContain("kollisionspruefung");
    expect(ids).toContain("dsgvo-compliance");
    expect(ids).toContain("aml-screener");
  });
});

describe("Legal Skill Pack — Writing/GoBD/GDPR", () => {
  it("getWritingSkills returns skills that write pages", () => {
    const writers = getWritingSkills();
    for (const s of writers) {
      expect(s.writes_pages).toBe(true);
      expect(s.enabled).toBe(true);
    }
  });

  it("getGoBdRelevantSkills returns GoBD-relevant skills", () => {
    const gobd = getGoBdRelevantSkills();
    for (const s of gobd) {
      expect(s.gobd_relevant).toBe(true);
    }
  });

  it("getGdprRelevantSkills returns GDPR-relevant skills", () => {
    const gdpr = getGdprRelevantSkills();
    for (const s of gdpr) {
      expect(s.gdpr_relevant).toBe(true);
    }
  });
});

describe("Legal Skill Pack — Workflow Mappings", () => {
  it("has 5 workflow mappings", () => {
    expect(WORKFLOW_SKILL_MAPPINGS).toHaveLength(5);
  });

  it("all workflow mappings have unique IDs", () => {
    const ids = WORKFLOW_SKILL_MAPPINGS.map((w) => w.workflow_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all workflow mappings reference existing skills", () => {
    for (const mapping of WORKFLOW_SKILL_MAPPINGS) {
      for (const skillId of mapping.skill_ids) {
        expect(getSkill(skillId)).toBeDefined();
      }
    }
  });

  it("getWorkflowMapping returns mapping by ID", () => {
    const mapping = getWorkflowMapping("due_diligence");
    expect(mapping).toBeDefined();
    expect(mapping!.workflow_label).toBe("Due Diligence");
  });

  it("getWorkflowMapping returns undefined for unknown ID", () => {
    expect(getWorkflowMapping("nonexistent")).toBeUndefined();
  });

  it("getSkillsForWorkflow returns skill entries", () => {
    const skills = getSkillsForWorkflow("litigation_prep");
    expect(skills.length).toBeGreaterThan(0);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("legal-subsumption");
    expect(ids).toContain("precedent-finder");
  });

  it("getSkillsForWorkflow returns empty for unknown workflow", () => {
    expect(getSkillsForWorkflow("nonexistent")).toHaveLength(0);
  });

  it("due_diligence mapping includes contract-analysis", () => {
    const skills = getSkillsForWorkflow("due_diligence");
    expect(skills.some((s) => s.id === "contract-analysis")).toBe(true);
  });

  it("compliance_check mapping includes dsgvo-compliance and aml-screener", () => {
    const skills = getSkillsForWorkflow("compliance_check");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("dsgvo-compliance");
    expect(ids).toContain("aml-screener");
  });

  it("fristen_management mapping includes deadline-extract", () => {
    const skills = getSkillsForWorkflow("fristen_management");
    expect(skills.some((s) => s.id === "deadline-extract")).toBe(true);
  });
});

describe("Legal Skill Pack — MECE Validation", () => {
  it("findMeceOverlaps returns array (may be empty)", () => {
    const overlaps = findMeceOverlaps();
    expect(Array.isArray(overlaps)).toBe(true);
  });

  it("findMeceOverlaps does not include disabled skills", () => {
    const overlaps = findMeceOverlaps();
    for (const overlap of overlaps) {
      for (const skillId of overlap.skills) {
        const skill = getSkill(skillId);
        expect(skill?.enabled).toBe(true);
      }
    }
  });
});

describe("Legal Skill Pack — Reachability", () => {
  it("findUnreachableSkills returns skills not in any workflow or dependency", () => {
    const unreachable = findUnreachableSkills();
    expect(Array.isArray(unreachable)).toBe(true);
  });

  it("findMissingSkillPaths returns skills not in provided paths", () => {
    const existingPaths = ["skills/legal-brain/SKILL.md", "skills/contract-analysis/SKILL.md"];
    const missing = findMissingSkillPaths(existingPaths);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some((s) => s.id === "legal-brain")).toBe(false);
  });

  it("findMissingSkillPaths returns empty when all paths provided", () => {
    const allPaths = LEGAL_SKILLS.map((s) => s.skill_path);
    expect(findMissingSkillPaths(allPaths)).toHaveLength(0);
  });
});

describe("Legal Skill Pack — Summary", () => {
  it("getPackSummary returns valid summary", () => {
    const summary = getPackSummary();
    expect(summary.total_skills).toBe(LEGAL_SKILLS.length);
    expect(summary.enabled_skills).toBeGreaterThan(0);
    expect(summary.workflow_mappings).toBe(5);
    expect(summary.pack_version).toBe("1.0.0");
  });

  it("summary by_category has entries for all used categories", () => {
    const summary = getPackSummary();
    const usedCategories = new Set(LEGAL_SKILLS.map((s) => s.category));
    for (const cat of usedCategories) {
      expect(summary.by_category[cat]).toBeDefined();
      expect(summary.by_category[cat]).toBeGreaterThan(0);
    }
  });

  it("summary by_severity has entries for all used severities", () => {
    const summary = getPackSummary();
    const usedSeverities = new Set(LEGAL_SKILLS.map((s) => s.severity));
    for (const sev of usedSeverities) {
      expect(summary.by_severity[sev]).toBeDefined();
      expect(summary.by_severity[sev]).toBeGreaterThan(0);
    }
  });

  it("summary total_triggers equals sum of all triggers", () => {
    const summary = getPackSummary();
    const expected = LEGAL_SKILLS.reduce((sum, s) => sum + s.triggers.length, 0);
    expect(summary.total_triggers).toBe(expected);
  });

  it("summary total_dependencies equals sum of all deps", () => {
    const summary = getPackSummary();
    const expected = LEGAL_SKILLS.reduce((sum, s) => sum + s.dependencies.length, 0);
    expect(summary.total_dependencies).toBe(expected);
  });

  it("summary writing_skills matches getWritingSkills", () => {
    const summary = getPackSummary();
    expect(summary.writing_skills).toBe(getWritingSkills().length);
  });

  it("summary gobd_relevant matches getGoBdRelevantSkills", () => {
    const summary = getPackSummary();
    expect(summary.gobd_relevant).toBe(getGoBdRelevantSkills().length);
  });

  it("summary gdpr_relevant matches getGdprRelevantSkills", () => {
    const summary = getPackSummary();
    expect(summary.gdpr_relevant).toBe(getGdprRelevantSkills().length);
  });
});
