import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";
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
    // Fetch the POA from the engine — cursor-paginated, a bare /api/pages
    // call is capped at 100 rows.
    let pages: Array<{ slug: string; frontmatter: PowerOfAttorney }>;
    try {
      pages = (await listEnginePages(ctx.headers, "power_of_attorney", 10_000, {
        strict: true,
      })) as unknown as Array<{ slug: string; frontmatter: PowerOfAttorney }>;
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    const poaPage = pages.find((p) => p.frontmatter?.id === body.poa_id);
    if (!poaPage) return apiError("not_found", "Vollmacht nicht gefunden", 404);

    const poa = poaPage.frontmatter;
    const pdf = generatePoaPdf({ poa });
    const pdfBase64 = pdf.output("datauristring").split(",")[1] ?? "";

    return apiSuccess({ pdf_base64: pdfBase64, poa_id: poa.id });
  }
);
