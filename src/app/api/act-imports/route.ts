import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { actImportSessionSlug, safeImportId } from "@/lib/act-import";

const createSchema = z.object({
  id: z.string().optional(),
  case_slug: z.string().min(1),
  title: z.string().min(1).max(240),
  expected_files: z.number().int().min(0).optional(),
  expected_bytes: z.number().int().min(0).optional(),
  jurisdiction: z.enum(["at", "de", "ch", "eu"]).default("at"),
  verfahrenstyp: z
    .enum(["straf", "zivil", "arbeitsrecht", "verwaltungsrecht", "sonstiges"])
    .default("sonstiges"),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "act_import.create" as const,
      entityType: "act_import_session",
      details: {
        case_slug: body.case_slug,
        title: body.title,
        jurisdiction: body.jurisdiction,
        verfahrenstyp: body.verfahrenstyp,
        expected_files: body.expected_files ?? 0,
        expected_bytes: body.expected_bytes ?? 0,
      },
    }),
  },
  async (ctx, body) => {
    const id = safeImportId(body.id ?? `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
    const slug = actImportSessionSlug(id);
    const now = new Date().toISOString();
    // Create-only: an existing session (running or finished analysis) is
    // never reset to a draft or moved to another matter.
    const response = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        if_absent: true,
        slug,
        title: body.title,
        type: "act_import_session",
        content: JSON.stringify(
          { id, case_slug: body.case_slug, status: "draft", created_at: now },
          null,
          2
        ),
        frontmatter: {
          id,
          case_slug: body.case_slug,
          status: "draft",
          expected_files: body.expected_files ?? 0,
          expected_bytes: body.expected_bytes ?? 0,
          jurisdiction: body.jurisdiction,
          verfahrenstyp: body.verfahrenstyp,
          created_at: now,
          updated_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response) return apiError("session_create_failed", "Engine nicht erreichbar", 502);
    if (response.status === 409) {
      const upstream = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (upstream?.error === "page_exists") {
        return apiError("import_exists", "Diese Import-Session existiert bereits", 409);
      }
    }
    if (!response.ok) return apiError("session_create_failed", await response.text(), 502);
    return Response.json({ ok: true, id, slug, status: "draft" }, { status: 201 });
  }
);

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({
      type: "act_import_session",
      limit: String(Math.min(Number(query?.limit ?? 50), 200)),
    });
    const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      cache: "no-store",
    });
    if (!response.ok)
      return apiError("session_list_failed", "Imports konnten nicht geladen werden", 502);
    return Response.json(await response.json());
  }
);
