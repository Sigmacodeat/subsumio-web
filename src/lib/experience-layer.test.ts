import { describe, it, expect } from "vitest";
import {
  DEFAULT_FIRM_POLICY,
  type ExperienceProfile,
  type FirmExperiencePolicy,
  levelRank,
  meetsMinLevel,
  levelLabel,
  getPracticeArea,
  getActiveMatters,
  getMattersByArea,
  getEndorsementsForSkill,
  hasSkill,
  isProfileVisible,
  whoKnows,
  sanitizeProfile,
  validatePolicy,
  createProfile,
  getLayerSummary,
} from "@/lib/experience-layer";

// ── Fixtures ──────────────────────────────────────────────────────────

const NOW = "2026-06-20T12:00:00Z";

function makeProfile(overrides: Partial<ExperienceProfile> = {}): ExperienceProfile {
  return createProfile({
    org_id: "org-1",
    brain_id: "brain-1",
    ...overrides,
  });
}

const PROFILE_LAWYER_1 = makeProfile({
  user_id: "user-1",
  display_name: "Anna Anwältin",
  org_role: "partner",
  is_lawyer: true,
  is_external: false,
  practice_areas: [
    {
      area: "litigation",
      label: "Litigation",
      level: "expert",
      years: 15,
      matter_count: 50,
      verified: true,
    },
    {
      area: "contract",
      label: "Vertragsrecht",
      level: "advanced",
      years: 10,
      matter_count: 30,
      verified: true,
    },
  ],
  matter_history: [
    {
      case_slug: "cases/2026-001",
      role: "lead",
      practice_area: "litigation",
      joined_at: "2026-01-01T00:00:00Z",
      left_at: null,
      active: true,
    },
    {
      case_slug: "cases/2026-002",
      role: "lead",
      practice_area: "contract",
      joined_at: "2026-02-01T00:00:00Z",
      left_at: null,
      active: true,
    },
  ],
  endorsements: [
    { skill_id: "legal-subsumption", endorsed_by: "user-3", endorsed_at: NOW },
    { skill_id: "brief-generator", endorsed_by: "user-2", endorsed_at: NOW },
  ],
  languages: ["de", "en"],
  qualifications: ["Rechtsanwältin", "Fachanwältin für Arbeitsrecht"],
  visibility: "all_members",
});

const PROFILE_LAWYER_2 = makeProfile({
  user_id: "user-2",
  display_name: "Bernd Becker",
  org_role: "associate",
  is_lawyer: true,
  is_external: false,
  practice_areas: [
    {
      area: "tax",
      label: "Steuerrecht",
      level: "intermediate",
      years: 5,
      matter_count: 15,
      verified: false,
    },
  ],
  matter_history: [
    {
      case_slug: "cases/2026-003",
      role: "associate",
      practice_area: "tax",
      joined_at: "2026-03-01T00:00:00Z",
      left_at: null,
      active: true,
    },
  ],
  endorsements: [{ skill_id: "steuer-subsumption", endorsed_by: "user-1", endorsed_at: NOW }],
  languages: ["de"],
  qualifications: ["Rechtsanwalt"],
  visibility: "all_members",
});

const PROFILE_EXTERNAL = makeProfile({
  user_id: "user-3",
  display_name: "Chris Extern",
  org_role: "external_counsel",
  is_lawyer: true,
  is_external: true,
  practice_areas: [
    {
      area: "compliance",
      label: "Compliance",
      level: "expert",
      years: 20,
      matter_count: 100,
      verified: true,
    },
  ],
  matter_history: [],
  endorsements: [],
  languages: ["de", "fr"],
  qualifications: ["Rechtsanwalt", "Compliance Officer"],
  visibility: "all_members",
});

const PROFILE_HIDDEN = makeProfile({
  user_id: "user-4",
  display_name: "Diana Diplomat",
  org_role: "of_counsel",
  is_lawyer: true,
  is_external: false,
  practice_areas: [
    {
      area: "litigation",
      label: "Litigation",
      level: "advanced",
      years: 8,
      matter_count: 20,
      verified: true,
    },
  ],
  matter_history: [],
  endorsements: [],
  languages: ["de", "es"],
  qualifications: ["Rechtsanwältin"],
  visibility: "hidden",
});

const PROFILE_MANAGEMENT_ONLY = makeProfile({
  user_id: "user-5",
  display_name: "Erik Chef",
  org_role: "managing_partner",
  is_lawyer: true,
  is_external: false,
  practice_areas: [
    {
      area: "corporate",
      label: "Corporate",
      level: "expert",
      years: 25,
      matter_count: 80,
      verified: true,
    },
  ],
  matter_history: [],
  endorsements: [],
  languages: ["de", "en"],
  qualifications: ["Rechtsanwalt", "Wirtschaftsprüfer"],
  visibility: "management_only",
});

const ALL_PROFILES = [
  PROFILE_LAWYER_1,
  PROFILE_LAWYER_2,
  PROFILE_EXTERNAL,
  PROFILE_HIDDEN,
  PROFILE_MANAGEMENT_ONLY,
];

// ── Tests ─────────────────────────────────────────────────────────────

describe("Experience Layer — Level Helpers", () => {
  it("levelRank returns correct order", () => {
    expect(levelRank("beginner")).toBe(0);
    expect(levelRank("intermediate")).toBe(1);
    expect(levelRank("advanced")).toBe(2);
    expect(levelRank("expert")).toBe(3);
  });

  it("meetsMinLevel returns true when level >= min", () => {
    expect(meetsMinLevel("expert", "intermediate")).toBe(true);
    expect(meetsMinLevel("intermediate", "intermediate")).toBe(true);
    expect(meetsMinLevel("beginner", "intermediate")).toBe(false);
  });

  it("levelLabel returns German label", () => {
    expect(levelLabel("beginner")).toBe("Anfänger");
    expect(levelLabel("expert")).toBe("Experte");
  });
});

describe("Experience Layer — Profile Helpers", () => {
  it("getPracticeArea returns area by name", () => {
    const pa = getPracticeArea(PROFILE_LAWYER_1, "litigation");
    expect(pa).toBeDefined();
    expect(pa!.level).toBe("expert");
  });

  it("getPracticeArea returns undefined for unknown area", () => {
    expect(getPracticeArea(PROFILE_LAWYER_1, "nonexistent")).toBeUndefined();
  });

  it("getActiveMatters returns only active matters", () => {
    const active = getActiveMatters(PROFILE_LAWYER_1);
    expect(active).toHaveLength(2);
    expect(active.every((m) => m.active)).toBe(true);
  });

  it("getMattersByArea filters by practice area", () => {
    const matters = getMattersByArea(PROFILE_LAWYER_1, "litigation");
    expect(matters).toHaveLength(1);
    expect(matters[0].case_slug).toBe("cases/2026-001");
  });

  it("getEndorsementsForSkill filters by skill ID", () => {
    const endorsements = getEndorsementsForSkill(PROFILE_LAWYER_1, "legal-subsumption");
    expect(endorsements).toHaveLength(1);
  });

  it("hasSkill returns true when endorsement exists", () => {
    expect(hasSkill(PROFILE_LAWYER_1, "legal-subsumption")).toBe(true);
    expect(hasSkill(PROFILE_LAWYER_1, "nonexistent")).toBe(false);
  });
});

describe("Experience Layer — Visibility", () => {
  it("returns false for different org (tenant isolation)", () => {
    expect(isProfileVisible(PROFILE_LAWYER_1, "org-2", true, false)).toBe(false);
  });

  it("returns false for hidden profile", () => {
    expect(isProfileVisible(PROFILE_HIDDEN, "org-1", true, false)).toBe(false);
  });

  it("returns true for all_members visibility", () => {
    expect(isProfileVisible(PROFILE_LAWYER_1, "org-1", true, false)).toBe(true);
  });

  it("returns false for management_only when viewer is not management", () => {
    expect(isProfileVisible(PROFILE_MANAGEMENT_ONLY, "org-1", true, false)).toBe(false);
  });

  it("returns true for management_only when viewer is management", () => {
    expect(isProfileVisible(PROFILE_MANAGEMENT_ONLY, "org-1", true, true)).toBe(true);
  });

  it("returns false for external when policy hides externals", () => {
    const policy: FirmExperiencePolicy = { ...DEFAULT_FIRM_POLICY, show_external: false };
    expect(isProfileVisible(PROFILE_EXTERNAL, "org-1", true, false, policy)).toBe(false);
  });

  it("returns true for external when policy shows externals", () => {
    const policy: FirmExperiencePolicy = { ...DEFAULT_FIRM_POLICY, show_external: true };
    expect(isProfileVisible(PROFILE_EXTERNAL, "org-1", true, false, policy)).toBe(true);
  });
});

describe("Experience Layer — Who Knows Query", () => {
  it("returns profiles matching practice area", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "litigation" }, "org-1", true, false);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.user_id === "user-1")).toBe(true);
  });

  it("returns profiles matching skill ID", () => {
    const results = whoKnows(ALL_PROFILES, { skill_id: "legal-subsumption" }, "org-1", true, false);
    expect(results).toHaveLength(1);
    expect(results[0].user_id).toBe("user-1");
  });

  it("filters by minimum experience level", () => {
    const results = whoKnows(
      ALL_PROFILES,
      { practice_area: "litigation", min_level: "expert" },
      "org-1",
      true,
      false
    );
    expect(results.every((r) => r.practice_area?.level === "expert")).toBe(true);
  });

  it("excludes external members by default", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "compliance" }, "org-1", true, false);
    expect(results).toHaveLength(0);
  });

  it("includes external members when requested", () => {
    const results = whoKnows(
      ALL_PROFILES,
      { practice_area: "compliance", include_external: true },
      "org-1",
      true,
      false
    );
    expect(results).toHaveLength(1);
    expect(results[0].user_id).toBe("user-3");
  });

  it("filters by language", () => {
    const results = whoKnows(ALL_PROFILES, { language: "fr" }, "org-1", true, false);
    expect(results).toHaveLength(0); // external has fr but is excluded by default
  });

  it("filters by language including external", () => {
    const results = whoKnows(
      ALL_PROFILES,
      { language: "fr", include_external: true },
      "org-1",
      true,
      false
    );
    expect(results).toHaveLength(1);
    expect(results[0].user_id).toBe("user-3");
  });

  it("excludes hidden profiles", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "litigation" }, "org-1", true, false);
    expect(results.some((r) => r.user_id === "user-4")).toBe(false);
  });

  it("excludes management_only profiles for non-management viewers", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "corporate" }, "org-1", true, false);
    expect(results).toHaveLength(0);
  });

  it("includes management_only profiles for management viewers", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "corporate" }, "org-1", true, true);
    expect(results).toHaveLength(1);
    expect(results[0].user_id).toBe("user-5");
  });

  it("sorts by matter count in area (descending)", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "litigation" }, "org-1", true, false);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].matter_count_in_area).toBeGreaterThanOrEqual(
        results[i].matter_count_in_area
      );
    }
  });

  it("returns empty for different org (tenant isolation)", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "litigation" }, "org-2", true, false);
    expect(results).toHaveLength(0);
  });

  it("returns matching_skills when no skill filter", () => {
    const results = whoKnows(ALL_PROFILES, { practice_area: "litigation" }, "org-1", true, false);
    const lawyer1 = results.find((r) => r.user_id === "user-1");
    expect(lawyer1).toBeDefined();
    expect(lawyer1!.matching_skills.length).toBeGreaterThan(0);
  });
});

describe("Experience Layer — Sanitization", () => {
  it("sanitizes profile with default policy", () => {
    const sanitized = sanitizeProfile(PROFILE_LAWYER_1);
    expect(sanitized.user_id).toBe("user-1");
    expect(sanitized.display_name).toBe("Anna Anwältin");
    expect(sanitized.practice_areas).toHaveLength(2);
    expect(sanitized.practice_areas[0].years).toBe(15);
    expect(sanitized.practice_areas[0].matter_count).toBe(50);
  });

  it("hides years when policy disables it", () => {
    const policy: FirmExperiencePolicy = { ...DEFAULT_FIRM_POLICY, show_years: false };
    const sanitized = sanitizeProfile(PROFILE_LAWYER_1, policy);
    expect(sanitized.practice_areas[0].years).toBeUndefined();
  });

  it("hides matter counts when policy disables it", () => {
    const policy: FirmExperiencePolicy = { ...DEFAULT_FIRM_POLICY, show_matter_counts: false };
    const sanitized = sanitizeProfile(PROFILE_LAWYER_1, policy);
    expect(sanitized.practice_areas[0].matter_count).toBeUndefined();
  });

  it("hides endorsement count when policy disables it", () => {
    const policy: FirmExperiencePolicy = { ...DEFAULT_FIRM_POLICY, show_endorsements: false };
    const sanitized = sanitizeProfile(PROFILE_LAWYER_1, policy);
    expect(sanitized.endorsement_count).toBe(0);
  });

  it("includes level_label in sanitized output", () => {
    const sanitized = sanitizeProfile(PROFILE_LAWYER_1);
    expect(sanitized.practice_areas[0].level_label).toBe("Experte");
  });
});

describe("Experience Layer — Policy Validation", () => {
  it("validates default policy as valid", () => {
    const result = validatePolicy(DEFAULT_FIRM_POLICY);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects policy with allow_rankings = true", () => {
    const policy: FirmExperiencePolicy = { ...DEFAULT_FIRM_POLICY, allow_rankings: true };
    const result = validatePolicy(policy);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "allow_rankings must be false — rankings are prohibited by policy"
    );
  });

  it("rejects policy with allow_performance_scores = true", () => {
    const policy: FirmExperiencePolicy = { ...DEFAULT_FIRM_POLICY, allow_performance_scores: true };
    const result = validatePolicy(policy);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "allow_performance_scores must be false — performance scores are prohibited by policy"
    );
  });
});

describe("Experience Layer — Summary", () => {
  it("returns summary with correct counts", () => {
    const summary = getLayerSummary(ALL_PROFILES, "org-1", true, false);
    expect(summary.total_profiles).toBe(5);
    expect(summary.visible_profiles).toBe(2); // user-1, user-2 (external excluded by policy, hidden and management_only excluded)
  });

  it("returns summary with management viewer seeing more", () => {
    const summary = getLayerSummary(ALL_PROFILES, "org-1", true, true);
    expect(summary.visible_profiles).toBe(3); // user-1, user-2, user-5 (external excluded by policy, hidden still excluded)
  });

  it("returns empty for different org", () => {
    const summary = getLayerSummary(ALL_PROFILES, "org-2", true, false);
    expect(summary.visible_profiles).toBe(0);
  });

  it("counts endorsements correctly", () => {
    const summary = getLayerSummary(ALL_PROFILES, "org-1", true, false);
    expect(summary.total_endorsements).toBe(3); // 2 from lawyer1 + 1 from lawyer2
  });

  it("counts active matters correctly", () => {
    const summary = getLayerSummary(ALL_PROFILES, "org-1", true, false);
    expect(summary.total_active_matters).toBe(3); // 2 from lawyer1 + 1 from lawyer2
  });

  it("collects languages", () => {
    const summary = getLayerSummary(ALL_PROFILES, "org-1", true, false);
    expect(summary.languages_represented).toContain("de");
    expect(summary.languages_represented).toContain("en");
  });

  it("counts by role", () => {
    const summary = getLayerSummary(ALL_PROFILES, "org-1", true, false);
    expect(summary.by_role["partner"]).toBe(1);
    expect(summary.by_role["associate"]).toBe(1);
  });
});

describe("Experience Layer — Create Profile", () => {
  it("creates profile with defaults", () => {
    const profile = createProfile();
    expect(profile.user_id).toMatch(/^user-/);
    expect(profile.is_lawyer).toBe(true);
    expect(profile.is_external).toBe(false);
    expect(profile.visibility).toBe("all_members");
  });

  it("creates profile with overrides", () => {
    const profile = createProfile({ is_lawyer: false, org_role: "paralegal" });
    expect(profile.is_lawyer).toBe(false);
    expect(profile.org_role).toBe("paralegal");
  });
});
