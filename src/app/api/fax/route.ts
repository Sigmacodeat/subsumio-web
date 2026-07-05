import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createFaxTransmission,
  validateFaxNumber,
  formatFaxNumber,
  type FaxTransmission,
} from "@/lib/fax-gateway";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  to_number: z.string().min(1).max(50),
  case_slug: z.string().max(300).optional(),
  subject: z.string().min(1).max(500),
  document_slug: z.string().max(300).optional(),
  provider: z.enum(["sipgate", "retarus", "interfax", "manual"]).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: sendSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "fax_transmission",
      entityId: body.to_number,
      details: { subject: body.subject, caseSlug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    if (!validateFaxNumber(body.to_number)) {
      return apiError("validation_error", "Invalid fax number", 400);
    }
    const transmission = createFaxTransmission({
      direction: "outbound",
      provider: body.provider,
      to_number: formatFaxNumber(body.to_number),
      case_slug: body.case_slug,
      subject: body.subject,
      document_slug: body.document_slug,
    });
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/fax/${transmission.id}`,
        title: `Fax: ${body.subject}`,
        type: "fax_transmission",
        frontmatter: transmission,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ transmission });
  }
);

const listSchema = z.object({
  case_slug: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listSchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "fax_transmission", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: FaxTransmission[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as FaxTransmission[];
    if (query?.case_slug) {
      items = items.filter((f) => f.case_slug === query.case_slug);
    }
    return apiSuccess({ items });
  }
);
