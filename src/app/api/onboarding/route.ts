import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { isValidIndustry } from "@/lib/industry-pack";
import { provisionBrainAsync } from "@/lib/provision";
import type { OnboardingProgress } from "@/lib/types";

const completeSchema = z.object({
  industry: z.string().nullable().optional(),
  profile: z
    .object({
      kanzleiName: z.string().max(200).optional(),
      anwaltName: z.string().max(200).optional(),
      kanzleiEmail: z.string().max(200).optional(),
      country: z.string().max(20).optional(),
      role: z.string().max(40).optional(),
      focus: z.string().max(500).optional(),
    })
    .optional(),
});

const progressSchema = z.object({
  progress: z.object({
    firm: z.boolean().optional(),
    firstCase: z.boolean().optional(),
    firstDeadline: z.boolean().optional(),
    teamInvited: z.boolean().optional(),
    firstQuery: z.boolean().optional(),
  }),
});

export const POST = createHandler(
  {
    action: "onboarding.complete",
    rateTier: "standard",
    body: completeSchema,
    audit: (ctx, body) => ({
      action: "onboarding.complete" as const,
      entityType: "user",
      details: {
        user: ctx.user.email,
        industry: body.industry ?? null,
        role: body.profile?.role ?? null,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const patch: Record<string, unknown> = {
      onboardingCompletedAt: new Date().toISOString(),
    };

    if (body.industry && isValidIndustry(body.industry)) {
      patch.industry = body.industry;
      if (ctx.user.industry !== body.industry) {
        provisionBrainAsync(ctx.user.brainId, { industry: body.industry });
      }
    }

    // Save jurisdiction from onboarding country selection — drives law corpus scoping
    const country = body.profile?.country?.toUpperCase();
    if (country === "DE" || country === "AT" || country === "CH") {
      patch.jurisdiction = country;
    }

    const updated = await getStore().update(ctx.user.id, patch);
    if (!updated) {
      return Response.json({ error: "user_not_found" }, { status: 404 });
    }

    return Response.json({ ok: true, onboardingCompletedAt: patch.onboardingCompletedAt });
  }
);

export const GET = createHandler(
  {
    action: "onboarding.complete",
    rateTier: "standard",
  },
  async (ctx) => {
    return Response.json({
      onboardingCompletedAt: ctx.user.onboardingCompletedAt ?? null,
      industry: ctx.user.industry ?? null,
      jurisdiction: ctx.user.jurisdiction ?? null,
      progress: ctx.user.onboardingProgress ?? {
        firm: false,
        firstCase: false,
        firstDeadline: false,
        teamInvited: false,
        firstQuery: false,
      },
    });
  }
);

export const PATCH = createHandler(
  {
    action: "onboarding.progress",
    rateTier: "standard",
    body: progressSchema,
    audit: (ctx, body) => ({
      action: "onboarding.progress" as const,
      entityType: "user",
      entityId: ctx.user.id,
      details: { user: ctx.user.email, progress: body.progress },
    }),
  },
  async (ctx, body) => {
    const current = ctx.user.onboardingProgress ?? {
      firm: false,
      firstCase: false,
      firstDeadline: false,
      teamInvited: false,
      firstQuery: false,
    };
    const next: OnboardingProgress = { ...current, ...body.progress };
    const updated = await getStore().update(ctx.user.id, { onboardingProgress: next });
    if (!updated) return Response.json({ error: "user_not_found" }, { status: 404 });
    return Response.json({ ok: true, progress: next });
  }
);
