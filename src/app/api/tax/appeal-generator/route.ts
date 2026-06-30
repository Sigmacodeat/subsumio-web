import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { collectSSEChunks } from "@/lib/sse-stream";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { einspruchDeadline } from "@/lib/tax-deadlines";

export const maxDuration = 120;

const appealSchema = z.object({
  assessment_slug: z.string().min(1, "assessment_slug_required"),
  contested_points: z.string().max(10_000).optional(),
  jurisdiction: z.enum(["de", "at"]).optional().default("de"),
  language: z.enum(["de", "en"]).optional().default("de"),
});

interface AppealPoint {
  position: string;
  tax_office_view: string;
  taxpayer_view: string;
  legal_basis: string;
  disputed_amount: number;
  success_prospect: "stark" | "mittel" | "schwach" | "keine";
  required_evidence: string[];
}

interface AppealDraft {
  recipient: string;
  subject: string;
  body: string;
  requests: string[];
}

interface AppealResult {
  assessment_summary: string;
  contested_points: AppealPoint[];
  deadline: string;
  deadline_legal_basis: string;
  days_remaining: number;
  success_prospect_summary: string;
  total_disputed_amount: number;
  draft_letter: AppealDraft;
  recommendations: string[];
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

export const POST = createHandler(
  {
    action: "tax.appeal_generator",
    rateTier: "heavy",
    body: appealSchema,
    audit: (_ctx, body) => ({
      action: "tax.appeal_generator" as const,
      entityType: "tax_appeal",
      details: { assessment_slug: body.assessment_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    const encodedSlug = body.assessment_slug.split("/").map(encodeURIComponent).join("/");

    let assessmentData: {
      title: string;
      frontmatter: Record<string, unknown>;
      content?: string;
    } | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok)
        return apiError("assessment_not_found", `Assessment not found: ${res.status}`, 404);
      assessmentData = (await res.json()) as {
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

    if (!assessmentData) return apiError("assessment_not_found", "Assessment not found", 404);

    const fm = assessmentData.frontmatter ?? {};
    const clientName = String(fm.client_name ?? "—");
    const taxType = String(fm.tax_type ?? "ESt");
    const year = Number(fm.year ?? new Date().getFullYear());
    const noticeNumber = String(fm.notice_number ?? "—");
    const noticeDate = String(fm.notice_date ?? "");
    const amount = typeof fm.amount === "number" ? fm.amount : 0;
    const notes = sanitizeUserInput(String(fm.notes ?? assessmentData.content ?? ""));
    const contestedPoints = body.contested_points ? sanitizeUserInput(body.contested_points) : "";

    // Calculate deadline from notice date (§ 355 AO / § 109 AO: 1 month)
    let deadlineISO = "";
    let daysRemaining = 0;
    if (noticeDate) {
      try {
        const dl = einspruchDeadline(noticeDate);
        deadlineISO = dl.toISOString().split("T")[0];
        const now = new Date();
        const diffMs = dl.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      } catch {
        /* invalid date */
      }
    }

    const jurisdictionLabel =
      body.jurisdiction === "at" ? "AT (Österreich, BAO)" : "DE (Deutschland, AO)";
    const langHint = body.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

    const prompt = `Du bist ein erfahrener Steuerberater und Fachanwalt für Steuerrecht (${jurisdictionLabel}).
Analysiere den folgenden Steuerbescheid und generiere einen Einspruchsentwurf.

BESCHEIDDATEN:
- Mandant: ${clientName}
- Steuerart: ${taxType}
- Veranlagungszeitraum: ${year}
- Bescheidnummer: ${noticeNumber}
- Bescheiddatum: ${noticeDate}
- Festgesetzte Steuer: ${amount} EUR
- Notizen/Inhalt: ${notes}
${contestedPoints ? `- Vom Mandanten beanstandete Punkte: ${contestedPoints}` : ""}

${langHint}
Berechne die Einspruchsfrist (§ 355 AO: 1 Monat ab Bekanntgabe/Zustellung).
Bekanntgabefiktion: 3 Tage nach Aufgabe zur Post (§ 122 AO).

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "assessment_summary": "Kurzzusammenfassung des Bescheids (2-3 Sätze)",
  "contested_points": [
    {
      "position": "Bezeichnung der streitigen Position",
      "tax_office_view": "Auffassung des Finanzamts",
      "taxpayer_view": "Auffassung des Steuerpflichtigen",
      "legal_basis": "§ X Gesetz",
      "disputed_amount": 0,
      "success_prospect": "stark|mittel|schwach|keine",
      "required_evidence": ["Benötigte Nachweise"]
    }
  ],
  "success_prospect_summary": "Gesamtbewertung der Erfolgsaussichten (2-3 Sätze)",
  "total_disputed_amount": 0,
  "draft_letter": {
    "recipient": "Finanzamt ...",
    "subject": "Einspruch gegen den ...-Bescheid ... vom ...",
    "body": "Vollständiger Einspruchsschreiben-Text mit rechtlicher Begründung",
    "requests": ["Antrag 1", "Antrag 2"]
  },
  "recommendations": ["Empfohlene Maßnahmen"]
}`;

    let rawResponse = "";
    try {
      const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          query: prompt,
          mode: "balanced",
          source_id: ctx.brainId,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!thinkRes.ok) {
        return apiError(
          "think_failed",
          `Appeal generation failed: ${thinkRes.status}`,
          thinkRes.status
        );
      }

      rawResponse = await collectSSEChunks(thinkRes.body!);
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "Appeal generation failed",
        503
      );
    }

    const parsed = safeParseJson(rawResponse);

    const result: AppealResult = {
      assessment_summary: String(parsed.assessment_summary ?? rawResponse.slice(0, 500)),
      contested_points: Array.isArray(parsed.contested_points)
        ? (parsed.contested_points as Record<string, unknown>[]).map((p) => ({
            position: String(p.position ?? ""),
            tax_office_view: String(p.tax_office_view ?? ""),
            taxpayer_view: String(p.taxpayer_view ?? ""),
            legal_basis: String(p.legal_basis ?? ""),
            disputed_amount: typeof p.disputed_amount === "number" ? p.disputed_amount : 0,
            success_prospect:
              p.success_prospect === "stark" ||
              p.success_prospect === "mittel" ||
              p.success_prospect === "schwach" ||
              p.success_prospect === "keine"
                ? (p.success_prospect as AppealPoint["success_prospect"])
                : "mittel",
            required_evidence: Array.isArray(p.required_evidence)
              ? p.required_evidence.map((e: unknown) => String(e))
              : [],
          }))
        : [],
      deadline: deadlineISO,
      deadline_legal_basis: body.jurisdiction === "at" ? "§ 248 BAO" : "§ 355 AO",
      days_remaining: daysRemaining,
      success_prospect_summary: String(parsed.success_prospect_summary ?? ""),
      total_disputed_amount:
        typeof parsed.total_disputed_amount === "number" ? parsed.total_disputed_amount : 0,
      draft_letter: {
        recipient: String(
          (parsed.draft_letter as Record<string, unknown> | undefined)?.recipient ?? ""
        ),
        subject: String(
          (parsed.draft_letter as Record<string, unknown> | undefined)?.subject ?? ""
        ),
        body: String((parsed.draft_letter as Record<string, unknown> | undefined)?.body ?? ""),
        requests: Array.isArray(
          (parsed.draft_letter as Record<string, unknown> | undefined)?.requests
        )
          ? ((parsed.draft_letter as Record<string, unknown>).requests as unknown[]).map((r) =>
              String(r)
            )
          : [],
      },
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((r: unknown) => String(r))
        : [],
      generatedAt: new Date().toISOString(),
    };

    try {
      await enginePatchPage(ctx.headers, {
        slug: body.assessment_slug,
        frontmatter: {
          appeal_analysis: result,
          appeal_generated_at: result.generatedAt,
          contested: true,
        },
      });
    } catch {
      // best-effort
    }

    return Response.json(result);
  }
);
