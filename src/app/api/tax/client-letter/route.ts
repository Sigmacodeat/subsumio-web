import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { collectSSEChunks } from "@/lib/sse-stream";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { buildTaxClientLetterPrompt } from "@/lib/tax-prompts";

export const maxDuration = 120;

const letterSchema = z.object({
  client_slug: z.string().min(1, "client_slug_required"),
  occasion: z.enum([
    "quarterly_update",
    "law_change",
    "reminder",
    "assessment_received",
    "audit_notice",
    "year_end",
    "custom",
  ]),
  custom_occasion: z.string().max(500).optional(),
  key_points: z.string().max(5_000).optional(),
  language: z.enum(["de", "en"]).optional().default("de"),
});

interface ClientLetterResult {
  recipient_name: string;
  recipient_address: string;
  subject: string;
  body: string;
  key_points: string[];
  call_to_action: string;
  generatedAt: string;
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

const OCCASION_LABELS: Record<string, string> = {
  quarterly_update: "Quartalsinformation",
  law_change: "Gesetzesänderung",
  reminder: "Erinnerung",
  assessment_received: "Steuerbescheid eingegangen",
  audit_notice: "Betriebsprüfungsankündigung",
  year_end: "Jahresabschluss / Jahresrückblick",
  custom: "Individuelles Anschreiben",
};

export const POST = createHandler(
  {
    action: "tax.client_letter",
    rateTier: "heavy",
    body: letterSchema,
    audit: (_ctx, body) => ({
      action: "tax.client_letter" as const,
      entityType: "tax_client_letter",
      details: { client_slug: body.client_slug, occasion: body.occasion },
    }),
  },
  async (ctx, body, _query, _req) => {
    const encodedSlug = body.client_slug.split("/").map(encodeURIComponent).join("/");

    let clientData: {
      title: string;
      frontmatter: Record<string, unknown>;
      content?: string;
    } | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return apiError("client_not_found", `Client not found: ${res.status}`, 404);
      clientData = (await res.json()) as {
        title: string;
        frontmatter: Record<string, unknown>;
        content?: string;
      };
    } catch (err) {
      return apiError(
        "engine_unreachable",
        err instanceof Error ? err.message : "Engine nicht erreichbar",
        503
      );
    }

    if (!clientData) return apiError("client_not_found", "Client not found", 404);

    const fm = clientData.frontmatter ?? {};
    const clientName = String(fm.name ?? clientData.title ?? "—");
    const clientType = String(fm.type ?? "person");
    const clientEmail = String(fm.email ?? "");
    const clientAddress = String(fm.address ?? "");
    const clientTaxNumber = String(fm.tax_number ?? "");
    const notes = sanitizeUserInput(String(fm.notes ?? clientData.content ?? ""));
    const keyPoints = body.key_points ? sanitizeUserInput(body.key_points) : "";

    const occasionLabel =
      body.occasion === "custom" && body.custom_occasion
        ? body.custom_occasion
        : (OCCASION_LABELS[body.occasion] ?? "Anschreiben");

    const prompt = buildTaxClientLetterPrompt({
      clientName,
      clientType,
      clientAddress,
      clientTaxNumber,
      clientEmail,
      notes,
      occasionLabel,
      keyPoints,
      language: body.language,
    });

    let rawResponse = "";
    try {
      const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          query: prompt,
          mode: "balanced",
          tax_mode: true,
          source_id: ctx.brainId,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!thinkRes.ok) {
        return apiError(
          "think_failed",
          `Letter generation failed: ${thinkRes.status}`,
          thinkRes.status
        );
      }

      rawResponse = await collectSSEChunks(thinkRes.body!);
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "Letter generation failed",
        503
      );
    }

    const parsed = safeParseJson(rawResponse);

    const result: ClientLetterResult = {
      recipient_name: String(parsed.recipient_name ?? clientName),
      recipient_address: String(parsed.recipient_address ?? clientAddress),
      subject: String(parsed.subject ?? occasionLabel),
      body: String(parsed.body ?? rawResponse.slice(0, 2000)),
      key_points: Array.isArray(parsed.key_points)
        ? parsed.key_points.map((p: unknown) => String(p))
        : [],
      call_to_action: String(parsed.call_to_action ?? ""),
      generatedAt: new Date().toISOString(),
    };

    return Response.json(result);
  }
);
