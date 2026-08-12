import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { generatePoaPdf } from "@/lib/poa-template";
import type { PowerOfAttorney } from "@/lib/power-of-attorney";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  poa_id: z.string().min(1).max(200),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: generateSchema,
    audit: (ctx, body) => ({
      action: "poa.generate_pdf" as const,
      entityType: "power_of_attorney",
      entityId: body.poa_id,
      details: { generated_by: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    // Fetch the POA from the engine
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=power_of_attorney&limit=500`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    const pages: Array<{ slug: string; frontmatter: PowerOfAttorney }> =
      Array.isArray(data) ? data : (data.pages ?? []);
    const poaPage = pages.find((p) => p.frontmatter?.id === body.poa_id);
    if (!poaPage) return apiError("not_found", "Vollmacht nicht gefunden", 404);

    const poa = poaPage.frontmatter;
    const pdf = generatePoaPdf({ poa });
    const pdfBase64 = pdf.output("datauristring").split(",")[1] ?? "";

    return apiSuccess({ pdf_base64: pdfBase64, poa_id: poa.id });
  }
);
