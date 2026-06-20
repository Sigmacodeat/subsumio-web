/**
 * Experience / Who-Knows Layer — Kanzlei-Policy-konforme Expertise-Karte.
 *
 * P1-BRAIN-008: Experience-/Who-knows-Layer mit Kanzlei-Policy,
 * Berechtigungen und ohne personenbezogene Leistungsrankings.
 *
 * Architektur:
 *   - Jedes Team-Mitglied hat ein ExperienceProfile mit Practice-Areas, Skills, Matter-History
 *   - "Who knows X?" — findet Team-Mitglieder mit Expertise in einem Rechtsgebiet/Thema
 *   - KEINE personenbezogenen Leistungsrankings — nur Expertise-Fakten, keine Bewertung
 *   - Kanzlei-Policy steuert Sichtbarkeit (z.B. "zeige nur Anwälte", "verstecke externe")
 *   - Berechtigungen: nur sichtbar für Team-Mitglieder derselben Org
 *   - DSGVO-konform: keine Leistungs-Scores, keine Ranking-Positionen, keine Vergleichbarkeit
 */

import type { SkillCategory } from "@/lib/legal-skill-pack";

// ── Types ─────────────────────────────────────────────────────────────

export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "expert";

export type MatterRole = "lead" | "associate" | "support" | "reviewer" | "observer";

export type VisibilityPolicy = "all_members" | "lawyers_only" | "management_only" | "hidden";

export interface PracticeArea {
  /** Practice area identifier (e.g. "litigation", "contract", "tax") */
  area: string;
  /** Human-readable label */
  label: string;
  /** Experience level — fact, not a ranking */
  level: ExperienceLevel;
  /** Years of experience in this area */
  years: number;
  /** Number of matters handled in this area */
  matter_count: number;
  /** Self-declared or verified */
  verified: boolean;
}

export interface MatterExperienceEntry {
  /** Matter slug */
  case_slug: string;
  /** Role in this matter */
  role: MatterRole;
  /** Practice area of this matter */
  practice_area: string;
  /** When the member joined this matter */
  joined_at: string;
  /** When the member left (null if active) */
  left_at: string | null;
  /** Whether this matter is still active */
  active: boolean;
}

export interface SkillEndorsement {
  /** Skill identifier (matches legal-skill-pack skill ID) */
  skill_id: string;
  /** Who endorsed this person for this skill */
  endorsed_by: string;
  /** When the endorsement was made */
  endorsed_at: string;
  /** Optional comment */
  comment?: string;
}

export interface ExperienceProfile {
  /** Team member user ID */
  user_id: string;
  /** Display name (for internal use only) */
  display_name: string;
  /** Role in the organization */
  org_role: string;
  /** Whether this person is a lawyer */
  is_lawyer: boolean;
  /** Whether this person is external (not a regular employee) */
  is_external: boolean;
  /** Practice areas with experience levels */
  practice_areas: PracticeArea[];
  /** Matter history (anonymized — only case_slug + role + area) */
  matter_history: MatterExperienceEntry[];
  /** Skill endorsements from other team members */
  endorsements: SkillEndorsement[];
  /** Languages spoken */
  languages: string[];
  /** Bar admissions / qualifications */
  qualifications: string[];
  /** Whether this profile is visible to others */
  visibility: VisibilityPolicy;
  /** Brain ID for tenant isolation */
  brain_id: string;
  /** Org ID for tenant isolation */
  org_id: string;
}

export interface WhoKnowsQuery {
  /** Practice area to search for */
  practice_area?: string;
  /** Skill ID from legal-skill-pack */
  skill_id?: string;
  /** Minimum experience level */
  min_level?: ExperienceLevel;
  /** Whether to include inactive members */
  include_inactive?: boolean;
  /** Whether to include external members */
  include_external?: boolean;
  /** Language requirement */
  language?: string;
}

export interface WhoKnowsResult {
  user_id: string;
  display_name: string;
  org_role: string;
  is_lawyer: boolean;
  practice_area: PracticeArea | null;
  matching_skills: string[];
  matter_count_in_area: number;
  endorsement_count: number;
  active_matters: number;
}

export interface FirmExperiencePolicy {
  /** Who can see experience profiles */
  default_visibility: VisibilityPolicy;
  /** Whether external members are visible */
  show_external: boolean;
  /** Whether matter history is shown */
  show_matter_history: boolean;
  /** Whether endorsements are shown */
  show_endorsements: boolean;
  /** Whether years of experience are shown */
  show_years: boolean;
  /** Whether matter counts are shown */
  show_matter_counts: boolean;
  /** Whether rankings/comparisons are allowed (always false by policy) */
  allow_rankings: boolean;
  /** Whether performance scores are allowed (always false by policy) */
  allow_performance_scores: boolean;
}

// ── Default Policy ────────────────────────────────────────────────────

export const DEFAULT_FIRM_POLICY: FirmExperiencePolicy = {
  default_visibility: "all_members",
  show_external: false,
  show_matter_history: true,
  show_endorsements: true,
  show_years: true,
  show_matter_counts: true,
  allow_rankings: false,
  allow_performance_scores: false,
};

// ── Experience Level Helpers ──────────────────────────────────────────

const LEVEL_ORDER: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "expert"];

export function levelRank(level: ExperienceLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

export function meetsMinLevel(level: ExperienceLevel, minLevel: ExperienceLevel): boolean {
  return levelRank(level) >= levelRank(minLevel);
}

export function levelLabel(level: ExperienceLevel): string {
  const labels: Record<ExperienceLevel, string> = {
    beginner: "Anfänger",
    intermediate: "Fortgeschritten",
    advanced: "Erfahren",
    expert: "Experte",
  };
  return labels[level];
}

// ── Profile Helpers ───────────────────────────────────────────────────

export function getPracticeArea(profile: ExperienceProfile, area: string): PracticeArea | undefined {
  return profile.practice_areas.find((pa) => pa.area === area);
}

export function getActiveMatters(profile: ExperienceProfile): MatterExperienceEntry[] {
  return profile.matter_history.filter((m) => m.active);
}

export function getMattersByArea(profile: ExperienceProfile, area: string): MatterExperienceEntry[] {
  return profile.matter_history.filter((m) => m.practice_area === area);
}

export function getEndorsementsForSkill(profile: ExperienceProfile, skillId: string): SkillEndorsement[] {
  return profile.endorsements.filter((e) => e.skill_id === skillId);
}

export function hasSkill(profile: ExperienceProfile, skillId: string): boolean {
  return profile.endorsements.some((e) => e.skill_id === skillId);
}

// ── Visibility Check ──────────────────────────────────────────────────

export function isProfileVisible(
  profile: ExperienceProfile,
  viewerOrgId: string,
  viewerIsLawyer: boolean,
  viewerIsManagement: boolean,
  policy: FirmExperiencePolicy = DEFAULT_FIRM_POLICY,
): boolean {
  // Tenant isolation: only same org
  if (profile.org_id !== viewerOrgId) return false;

  // External members: only if policy allows
  if (profile.is_external && !policy.show_external) return false;

  // Visibility policy check
  switch (profile.visibility) {
    case "hidden":
      return false;
    case "management_only":
      return viewerIsManagement;
    case "lawyers_only":
      return viewerIsLawyer || viewerIsManagement;
    case "all_members":
      return true;
    default:
      return false;
  }
}

// ── Who Knows Query ───────────────────────────────────────────────────

export function whoKnows(
  profiles: ExperienceProfile[],
  query: WhoKnowsQuery,
  viewerOrgId: string,
  viewerIsLawyer: boolean,
  viewerIsManagement: boolean,
  policy: FirmExperiencePolicy = DEFAULT_FIRM_POLICY,
): WhoKnowsResult[] {
  const results: WhoKnowsResult[] = [];

  // When query.include_external is set, override policy.show_external so
  // isProfileVisible doesn't block externals before we get to the include_external check.
  const effectivePolicy = query.include_external
    ? { ...policy, show_external: true }
    : policy;

  for (const profile of profiles) {
    // Visibility check with effective policy
    if (!isProfileVisible(profile, viewerOrgId, viewerIsLawyer, viewerIsManagement, effectivePolicy)) {
      continue;
    }

    // External filter (separate from policy.show_external — this is the query-level filter)
    if (profile.is_external && !query.include_external) continue;

    // Language filter
    if (query.language && !profile.languages.includes(query.language)) continue;

    // Practice area filter
    let practiceArea: PracticeArea | null = null;
    if (query.practice_area) {
      practiceArea = getPracticeArea(profile, query.practice_area) ?? null;
      if (!practiceArea) continue;
      if (query.min_level && !meetsMinLevel(practiceArea.level, query.min_level)) continue;
    }

    // Skill filter
    let matchingSkills: string[] = [];
    if (query.skill_id) {
      if (!hasSkill(profile, query.skill_id)) continue;
      matchingSkills = [query.skill_id];
    } else {
      matchingSkills = profile.endorsements.map((e) => e.skill_id);
    }

    // Matter count in area
    const mattersInArea = query.practice_area
      ? getMattersByArea(profile, query.practice_area)
      : profile.matter_history;

    const activeMatters = getActiveMatters(profile);

    results.push({
      user_id: profile.user_id,
      display_name: profile.display_name,
      org_role: profile.org_role,
      is_lawyer: profile.is_lawyer,
      practice_area: practiceArea,
      matching_skills: matchingSkills,
      matter_count_in_area: mattersInArea.length,
      endorsement_count: profile.endorsements.length,
      active_matters: activeMatters.length,
    });
  }

  // Sort by matter count in area (descending) — NOT a ranking, just ordering for usability
  results.sort((a, b) => b.matter_count_in_area - a.matter_count_in_area);

  return results;
}

// ── Profile Sanitization (for display based on policy) ────────────────

export interface SanitizedProfile {
  user_id: string;
  display_name: string;
  org_role: string;
  is_lawyer: boolean;
  practice_areas: Array<{
    area: string;
    label: string;
    level: ExperienceLevel;
    level_label: string;
    years?: number;
    matter_count?: number;
    verified: boolean;
  }>;
  languages: string[];
  qualifications: string[];
  active_matter_count: number;
  endorsement_count: number;
}

export function sanitizeProfile(
  profile: ExperienceProfile,
  policy: FirmExperiencePolicy = DEFAULT_FIRM_POLICY,
): SanitizedProfile {
  return {
    user_id: profile.user_id,
    display_name: profile.display_name,
    org_role: profile.org_role,
    is_lawyer: profile.is_lawyer,
    practice_areas: profile.practice_areas.map((pa) => ({
      area: pa.area,
      label: pa.label,
      level: pa.level,
      level_label: levelLabel(pa.level),
      years: policy.show_years ? pa.years : undefined,
      matter_count: policy.show_matter_counts ? pa.matter_count : undefined,
      verified: pa.verified,
    })),
    languages: profile.languages,
    qualifications: profile.qualifications,
    active_matter_count: getActiveMatters(profile).length,
    endorsement_count: policy.show_endorsements ? profile.endorsements.length : 0,
  };
}

// ── Policy Validation ─────────────────────────────────────────────────

export function validatePolicy(policy: FirmExperiencePolicy): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Rankings and performance scores are NEVER allowed
  if (policy.allow_rankings) {
    violations.push("allow_rankings must be false — rankings are prohibited by policy");
  }
  if (policy.allow_performance_scores) {
    violations.push("allow_performance_scores must be false — performance scores are prohibited by policy");
  }

  return { valid: violations.length === 0, violations };
}

// ── Profile Creation Helper ───────────────────────────────────────────

export function createProfile(overrides: Partial<ExperienceProfile> = {}): ExperienceProfile {
  return {
    user_id: `user-${Math.random().toString(36).slice(2, 10)}`,
    display_name: "Team Member",
    org_role: "associate",
    is_lawyer: true,
    is_external: false,
    practice_areas: [],
    matter_history: [],
    endorsements: [],
    languages: ["de"],
    qualifications: [],
    visibility: "all_members",
    brain_id: "",
    org_id: "",
    ...overrides,
  };
}

// ── Summary ───────────────────────────────────────────────────────────

export interface ExperienceLayerSummary {
  total_profiles: number;
  visible_profiles: number;
  by_role: Record<string, number>;
  by_practice_area: Record<string, number>;
  by_level: Record<ExperienceLevel, number>;
  total_endorsements: number;
  total_active_matters: number;
  languages_represented: string[];
}

export function getLayerSummary(
  profiles: ExperienceProfile[],
  viewerOrgId: string,
  viewerIsLawyer: boolean,
  viewerIsManagement: boolean,
  policy: FirmExperiencePolicy = DEFAULT_FIRM_POLICY,
): ExperienceLayerSummary {
  const byRole: Record<string, number> = {};
  const byArea: Record<string, number> = {};
  const byLevel: Record<string, number> = {};
  const languages = new Set<string>();
  let visible = 0;
  let totalEndorsements = 0;
  let totalActiveMatters = 0;

  for (const profile of profiles) {
    if (!isProfileVisible(profile, viewerOrgId, viewerIsLawyer, viewerIsManagement, policy)) continue;
    visible++;

    byRole[profile.org_role] = (byRole[profile.org_role] ?? 0) + 1;

    for (const pa of profile.practice_areas) {
      byArea[pa.area] = (byArea[pa.area] ?? 0) + 1;
      byLevel[pa.level] = (byLevel[pa.level] ?? 0) + 1;
    }

    for (const lang of profile.languages) {
      languages.add(lang);
    }

    totalEndorsements += profile.endorsements.length;
    totalActiveMatters += getActiveMatters(profile).length;
  }

  return {
    total_profiles: profiles.length,
    visible_profiles: visible,
    by_role: byRole,
    by_practice_area: byArea,
    by_level: byLevel as Record<ExperienceLevel, number>,
    total_endorsements: totalEndorsements,
    total_active_matters: totalActiveMatters,
    languages_represented: [...languages].sort(),
  };
}
