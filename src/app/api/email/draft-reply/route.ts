import { z } from "zod";
import { createHandler, apiError, recordCreditConsumption } from "@/lib/api-handler";
import { caseAccessForUser } from "@/lib/email/case-link";
import { createServerBrainClient } from "@/lib/server-brain";
import { engineComplete, isEngineLLMAvailable } from "@/lib/engine-llm";
import {
  REPLY_DRAFT_SYSTEM,
  buildReplyDraftPrompt,
  parseDraftWithSummary,
} from "@/lib/email/draft-reply";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const draftSchema = z.object({
  subject: z.string().max(500).default(""),
  from: z.string().min(3).max(300),
  body: z.string().min(1).max(20_000),
  /** Optional: Aktenkontext einbeziehen (Ethical-Wall-geprüft). */
  caseSlug: z.string().max(300).optional(),
});

/**
 * WP-5.27 — drafts a reply for a mail that is not (yet) imported: the Outlook
 * add-in sends the open item's text and shows the draft for the lawyer to
 * edit. Nothing is sent or stored; the draft stays client-side.
 */
export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    credits: "think",
    body: draftSchema,
    audit: () => ({ action: "email.draft_reply" as const, entityType: "email_message" }),
  },
  async (ctx, body) => {
    if (!isEngineLLMAvailable()) {
      return apiError("ai_unavailable", "Der Assistent ist derzeit nicht verfügbar", 503);
    }

    let matterContext = "";
    if (body.caseSlug) {
      if ((await caseAccessForUser(ctx.headers, body.caseSlug, ctx.user.id)) === "blocked") {
        return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
      }
      try {
        const page = await createServerBrainClient(ctx.headers).getPage(body.caseSlug);
        matterContext = `Akte: ${page?.title ?? body.caseSlug}\n${String(page?.content ?? "").slice(0, 4000)}`;
      } catch {
        /* draft without matter context */
      }
    }

    const result = await engineComplete(ctx.headers, {
      purpose: "email_reply_draft",
      tier: "reasoning",
      system: REPLY_DRAFT_SYSTEM,
      prompt: buildReplyDraftPrompt({
        fromEmail: body.from,
        subject: body.subject,
        body: body.body,
        matterContext: matterContext || undefined,
        withSummary: true,
      }),
      maxTokens: 700,
      timeoutMs: 45_000,
    });
    if (!result?.text) return apiError("draft_failed", "Entwurf konnte nicht erstellt werden", 502);
    void recordCreditConsumption(ctx, "think", undefined, {
      modelId: result.model,
      inputTokens: result.usage?.input_tokens,
      cachedTokens: result.usage?.cache_read_tokens,
      outputTokens: result.usage?.output_tokens,
    });
    const { summary, draft } = parseDraftWithSummary(result.text);
    return Response.json({ draft, summary, aiGenerated: true });
  }
);
