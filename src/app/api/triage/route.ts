import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { triageMessage, triageBatch, type TriageInput } from "@/lib/triage";

const triageSchema = z.object({
  messages: z
    .array(
      z.object({
        source: z.enum(["bea", "email", "scan", "whatsapp", "portal", "manual"]),
        subject: z.string().min(1).max(500),
        body: z.string().max(10_000).default(""),
        sender: z.string().max(300).optional(),
        date: z.string().optional(),
        caseRef: z.string().max(200).optional(),
        rawSlug: z.string().max(300).optional(),
        suggestedCaseSlug: z.string().max(300).optional(),
      })
    )
    .min(1, "messages_required")
    .max(100, "too_many_messages"),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: triageSchema,
  },
  async (_ctx, body) => {
    const inputs: TriageInput[] = body.messages.map((m) => ({
      source: m.source,
      subject: m.subject,
      body: m.body,
      sender: m.sender,
      date: m.date,
      caseRef: m.caseRef,
      rawSlug: m.rawSlug,
      suggestedCaseSlug: m.suggestedCaseSlug,
    }));

    if (inputs.length === 1) {
      const card = triageMessage(inputs[0]);
      return apiSuccess({ card });
    }

    const cards = triageBatch(inputs);
    const sorted = cards.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    return apiSuccess({
      cards: sorted,
      summary: {
        total: sorted.length,
        critical: sorted.filter((c) => c.urgency === "critical").length,
        high: sorted.filter((c) => c.urgency === "high").length,
        medium: sorted.filter((c) => c.urgency === "medium").length,
        low: sorted.filter((c) => c.urgency === "low").length,
      },
    });
  }
);
