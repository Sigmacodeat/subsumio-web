import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  whoKnows,
  getLayerSummary,
  sanitizeProfile,
  isProfileVisible,
  DEFAULT_FIRM_POLICY,
  type ExperienceProfile,
  type WhoKnowsQuery,
  type FirmExperiencePolicy,
} from "@/lib/experience-layer";

// ── In-memory profile store (Phase 1 — will migrate to DB) ────────────

const profileStore = new Map<string, ExperienceProfile>();

function getProfile(userId: string): ExperienceProfile | undefined {
  return profileStore.get(userId);
}

function getAllProfiles(): ExperienceProfile[] {
  return Array.from(profileStore.values());
}

// ── Query Schema ──────────────────────────────────────────────────────

const experienceQuerySchema = z.object({
  action: z.enum(["who_knows", "summary", "profile", "list"]).default("list"),
  practice_area: z.string().optional(),
  skill_id: z.string().optional(),
  min_level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  include_inactive: z.string().optional(),
  include_external: z.string().optional(),
  language: z.string().optional(),
  user_id: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: experienceQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    const allProfiles = getAllProfiles();
    const orgProfiles = allProfiles.filter((p) => p.org_id === ctx.user.orgId);

    // Determine viewer permissions
    const viewerIsLawyer = ctx.user.role === "lawyer" || ctx.user.role === "admin";
    const viewerIsManagement = ctx.user.role === "admin";
    const policy: FirmExperiencePolicy = DEFAULT_FIRM_POLICY;

    switch (query.action) {
      case "who_knows": {
        const whoKnowsQuery: WhoKnowsQuery = {
          practice_area: query.practice_area,
          skill_id: query.skill_id,
          min_level: query.min_level,
          include_inactive: query.include_inactive === "true",
          include_external: query.include_external === "true",
          language: query.language,
        };
        const results = whoKnows(orgProfiles, whoKnowsQuery, ctx.user.orgId || "", viewerIsLawyer, viewerIsManagement, policy);
        return apiSuccess({ results, total: results.length });
      }

      case "summary": {
        const summary = getLayerSummary(orgProfiles, ctx.user.orgId || "", viewerIsLawyer, viewerIsManagement, policy);
        return apiSuccess(summary);
      }

      case "profile": {
        if (!query.user_id) {
          return apiError("validation_error", "user_id required for profile action", 400);
        }
        const profile = getProfile(query.user_id);
        if (!profile) {
          return apiError("not_found", "Profile not found", 404);
        }
        if (!isProfileVisible(profile, ctx.user.orgId || "", viewerIsLawyer, viewerIsManagement, policy)) {
          return apiError("forbidden", "Profile not visible", 403);
        }
        return apiSuccess(sanitizeProfile(profile, policy));
      }

      case "list":
      default: {
        const visible = orgProfiles
          .filter((p) => isProfileVisible(p, ctx.user.orgId || "", viewerIsLawyer, viewerIsManagement, policy))
          .map((p) => sanitizeProfile(p, policy));
        return apiSuccess({ profiles: visible, total: visible.length });
      }
    }
  },
);
