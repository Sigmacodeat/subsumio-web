import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 60;

export const GET = createEngineProxy({
  action: "admin.*",
  enginePath: "/api/analytics/adoption",
  body: z.object({}).passthrough(),
  quota: undefined,
  label: "adoption-analytics",
  cacheMaxAge: 300,
  transformBody: (_b) => ({}),
  audit: (_ctx, _b) => ({
    action: "settings.update" as const,
    entityType: "analytics",
    details: { type: "adoption_analytics" },
  }),
});
