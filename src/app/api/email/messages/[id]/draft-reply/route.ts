import { createHandler, apiError, recordCreditConsumption } from "@/lib/api-handler";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { getMailMessage } from "@/lib/email/mailbox";
import { caseAccessForUser } from "@/lib/email/case-link";
import { createServerBrainClient } from "@/lib/server-brain";
import { engineComplete, isEngineLLMAvailable } from "@/lib/engine-llm";
import { REPLY_DRAFT_SYSTEM, buildReplyDraftPrompt } from "@/lib/email/draft-reply";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drafts a reply for the lawyer to edit. Nothing is sent: the draft goes into
 * the reply composer and the lawyer decides.
 */
export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    credits: "think",
    audit: () => ({ action: "email.draft_reply" as const, entityType: "email_message" }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!isEngineLLMAvailable()) {
      return apiError("ai_unavailable", "Der Assistent ist derzeit nicht verfügbar", 503);
    }
    const message = await getMailMessage(mailboxScopeFor(ctx, req), id);
    if (!message) return apiError("not_found", "Nachricht nicht gefunden", 404);

    let matterContext = "";
    if (message.caseSlug) {
      if ((await caseAccessForUser(ctx.headers, message.caseSlug, ctx.user.id)) === "blocked") {
        return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
      }
      try {
        const page = await createServerBrainClient(ctx.headers).getPage(message.caseSlug);
        matterContext = `Akte: ${page?.title ?? message.caseSlug}\n${String(page?.content ?? "").slice(0, 4000)}`;
      } catch {
        /* draft without matter context */
      }
    }

    const prompt = buildReplyDraftPrompt({
      fromName: message.fromName,
      fromEmail: message.fromEmail,
      subject: message.subject,
      body: message.text ?? "",
      matterContext: matterContext || undefined,
    });

    const result = await engineComplete(ctx.headers, {
      purpose: "email_reply_draft",
      // Client-facing text: reasoning tier (the owner's quality-first rule).
      tier: "reasoning",
      system: REPLY_DRAFT_SYSTEM,
      prompt,
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
    return Response.json({ draft: result.text.trim(), aiGenerated: true });
  }
);
