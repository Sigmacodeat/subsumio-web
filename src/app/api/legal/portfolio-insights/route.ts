import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 60;

export const GET = createEngineProxy({
  action: "legal.portfolio_insights",
  enginePath: "/api/legal/portfolio-insights",
  body: z.object({}).passthrough(),
  quota: undefined,
  label: "portfolio-insights",
  transformBody: (_b) => ({}),
  audit: (_ctx, _b) => ({
    action: "legal.deep_analysis" as const,
    entityType: "contract",
    details: { type: "portfolio_insights" },
  }),
});
