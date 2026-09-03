import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { collectSSEChunks } from "@/lib/sse-stream";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { buildTaxTriagePrompt, type TaxJurisdiction } from "@/lib/tax-prompts";
import { triageMessage, type TriageCard, type TriageInput } from "@/lib/triage";

export const maxDuration = 60;

const taxTriageSchema = z.object({
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
    .max(50, "too_many_messages"),
  jurisdiction: z.enum(["de", "at", "ch"]).optional().default("de"),
  use_ai: z.boolean().optional().default(true),
});

interface TaxTriageEnrichment {
  document_type: string;
  tax_area: string;
  deadline_type: string | null;
  deadline_date: string | null;
  deadline_legal_basis: string | null;
  required_actions: string[];
  risk_level: "critical" | "high" | "medium" | "low";
  estimated_amount: number | null;
  jurisdiction: string;
  key_entities: { label: string; value: string }[];
}

interface TaxTriageResult {
  card: TriageCard;
  enrichment: TaxTriageEnrichment | null;
  ai_classified: boolean;
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    return {};
  }
}

const TAX_KEYWORDS =
  /\b(steuer|finanzamt|einspruch|bescheid|elster|datev|umsatzsteuer|einkommensteuer|gewerbesteuer|körperschaftsteuer|erbschaftsteuer|lohnsteuer|betriebsprüfung|außenprüfung|festsetzung|verjährung|hinterziehung|selbstanzeige|vorauszahlung|voranmeldung|spenden|freibetrag|werbungskosten|betriebsausgaben|vorsteuer|abgabenordnung|bao|estg|ustg|kstg|gewstg|erbstg|ao\b|fgo|bfh|dba|verrechnungspreis)\b/i;

function isTaxRelated(card: TriageCard): boolean {
  if (card.legalArea?.includes("steuer")) return true;
  return TAX_KEYWORDS.test(`${card.title} ${card.summary}`);
}

export const POST = createHandler(
  {
    action: "tax.triage",
    rateTier: "standard",
    body: taxTriageSchema,
    audit: (_ctx, body) => ({
      action: "tax.triage" as const,
      entityType: "tax_triage",
      details: {
        message_count: body.messages.length,
        jurisdiction: body.jurisdiction,
        use_ai: body.use_ai,
      },
    }),
  },
  async (ctx, body) => {
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

    const cards = inputs.map(triageMessage);

    const results: TaxTriageResult[] = [];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const input = inputs[i];

      if (!body.use_ai || !isTaxRelated(card)) {
        results.push({ card, enrichment: null, ai_classified: false });
        continue;
      }

      const fullText = sanitizeUserInput(`${input.subject}\n\n${input.body}`);

      const prompt = buildTaxTriagePrompt({
        subject: sanitizeUserInput(input.subject),
        body: fullText,
        sender: sanitizeUserInput(input.sender ?? "unbekannt"),
        date: input.date ?? "unbekannt",
        jurisdiction: body.jurisdiction.toUpperCase() as TaxJurisdiction,
      });

      let enrichment: TaxTriageEnrichment | null = null;

      try {
        const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            query: prompt,
            mode: "fast",
            tax_mode: true,
            source_id: ctx.brainId,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (thinkRes.ok) {
          const rawResponse = await collectSSEChunks(thinkRes.body!);
          const parsed = safeParseJson(rawResponse);

          enrichment = {
            document_type: String(parsed.document_type ?? "sonstiges"),
            tax_area: String(parsed.tax_area ?? "sonstiges"),
            deadline_type:
              parsed.deadline_type && parsed.deadline_type !== "null"
                ? String(parsed.deadline_type)
                : null,
            deadline_date:
              parsed.deadline_date && parsed.deadline_date !== "null"
                ? String(parsed.deadline_date)
                : null,
            deadline_legal_basis:
              parsed.deadline_legal_basis && parsed.deadline_legal_basis !== "null"
                ? String(parsed.deadline_legal_basis)
                : null,
            required_actions: Array.isArray(parsed.required_actions)
              ? parsed.required_actions.map((a: unknown) => String(a))
              : [],
            risk_level:
              parsed.risk_level === "critical" ||
              parsed.risk_level === "high" ||
              parsed.risk_level === "medium" ||
              parsed.risk_level === "low"
                ? (parsed.risk_level as TaxTriageEnrichment["risk_level"])
                : "medium",
            estimated_amount:
              typeof parsed.estimated_amount === "number" ? parsed.estimated_amount : null,
            jurisdiction: body.jurisdiction,
            key_entities: Array.isArray(parsed.key_entities)
              ? (parsed.key_entities as Record<string, unknown>[]).map((e) => ({
                  label: String(e.label ?? ""),
                  value: String(e.value ?? ""),
                }))
              : [],
          };

          if (enrichment.risk_level === "critical" && card.urgency !== "critical") {
            card.urgency = "critical";
          }
          if (enrichment.deadline_date && !card.deadline) {
            card.deadline = enrichment.deadline_date;
          }
        }
      } catch {
        // best-effort AI enrichment — deterministic triage card is still valid
      }

      results.push({
        card,
        enrichment,
        ai_classified: enrichment !== null,
      });
    }

    const sorted = results.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.card.urgency] - urgencyOrder[b.card.urgency];
    });

    return apiSuccess({
      results: sorted,
      summary: {
        total: sorted.length,
        tax_related: sorted.filter((r) => r.ai_classified || isTaxRelated(r.card)).length,
        critical: sorted.filter((r) => r.card.urgency === "critical").length,
        high: sorted.filter((r) => r.card.urgency === "high").length,
        medium: sorted.filter((r) => r.card.urgency === "medium").length,
        low: sorted.filter((r) => r.card.urgency === "low").length,
        ai_enriched: sorted.filter((r) => r.ai_classified).length,
      },
    });
  }
);
