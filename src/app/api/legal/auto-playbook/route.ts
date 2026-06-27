import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 120;

const autoPlaybookSchema = z.object({
  contract_slug: z.string().min(1).max(200),
  playbook_slug: z.string().max(200).optional(),
  auto_apply: z.boolean().default(false),
});

export const POST = createEngineProxy({
  action: "legal.playbook",
  enginePath: "/api/legal/auto-playbook",
  body: autoPlaybookSchema,
  quota: "queries",
  label: "auto-playbook",
  transformBody: (b) => ({
    contract_slug: b.contract_slug,
    playbook_slug: b.playbook_slug || undefined,
    auto_apply: b.auto_apply,
  }),
  audit: (_ctx, b) => ({
    action: "legal.playbook" as const,
    entityType: "playbook",
    details: { contract_slug: b.contract_slug, auto_apply: b.auto_apply },
  }),
});
