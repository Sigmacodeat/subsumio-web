import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

interface TemplatePage {
  slug: string;
  title: string;
  type?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
  created_at?: string;
}

async function fetchEngine(
  brainId: string,
  headers: Record<string, string>,
  path: string,
  init?: RequestInit
) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...headers, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  return res;
}

const templatePostSchema = z.object({
  name: z.string().min(1, "name_required").max(100),
  language: z.string().max(10).default("de"),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).default("UTILITY"),
  body: z.string().min(1, "body_required").max(1024),
});

const templatePatchSchema = z.object({
  slug: z.string().min(1, "slug_required"),
  name: z.string().min(1).max(100).optional(),
  language: z.string().max(10).optional(),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).optional(),
  body: z.string().min(1).max(1024).optional(),
  status: z.enum(["draft", "pending", "approved", "rejected"]).optional(),
});

const templateDeleteSchema = z.object({ slug: z.string().min(1) });

export const GET = createHandler({ action: "settings.read", rateTier: "standard" }, async (ctx) => {
  const res = await fetchEngine(
    ctx.brainId,
    ctx.headers,
    `/api/pages?type=whatsapp_template&limit=100`
  );
  if (!res.ok) return Response.json({ templates: [] });
  const pages = (await res.json()) as TemplatePage[];
  const templates = pages.map((page) => {
    const fm = page.frontmatter ?? {};
    return {
      slug: page.slug,
      name: String(fm.name ?? page.title ?? ""),
      language: String(fm.language ?? "de"),
      category: String(fm.category ?? "UTILITY"),
      body: String(fm.body ?? page.content ?? ""),
      status: String(fm.status ?? "draft"),
      createdAt: page.created_at,
    };
  });
  return Response.json({ templates });
});

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: templatePostSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_template",
      details: { name: body.name, category: body.category, by: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const id = randomUUID();
    const slug = `legal/whatsapp/templates/${id}`;
    const res = await fetchEngine(ctx.brainId, ctx.headers, `/api/pages`, {
      method: "POST",
      body: JSON.stringify({
        slug,
        title: body.name,
        type: "whatsapp_template",
        content: body.body,
        frontmatter: {
          type: "whatsapp_template",
          name: body.name,
          language: body.language,
          category: body.category,
          body: body.body,
          status: "draft",
          created_at: new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[whatsapp/templates] create failed:", res.status, err);
      return Response.json({ error: "engine_error" }, { status: 502 });
    }
    return Response.json({ slug, name: body.name, status: "draft" });
  }
);

export const PATCH = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: templatePatchSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_template",
      details: { slug: body.slug, by: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const encodedSlug = body.slug.split("/").map(encodeURIComponent).join("/");
    const getRes = await fetchEngine(ctx.brainId, ctx.headers, `/api/pages/${encodedSlug}`);
    if (!getRes.ok) return Response.json({ error: "not_found" }, { status: 404 });
    const existing = (await getRes.json()) as TemplatePage;
    const fm = existing.frontmatter ?? {};
    const patchRes = await fetchEngine(ctx.brainId, ctx.headers, `/api/pages/${encodedSlug}`, {
      method: "PATCH",
      headers: { "If-Match": String((fm as { version?: number }).version ?? 0) },
      body: JSON.stringify({
        frontmatter: {
          ...fm,
          name: body.name ?? String(fm.name ?? ""),
          language: body.language ?? String(fm.language ?? "de"),
          category: body.category ?? String(fm.category ?? "UTILITY"),
          body: body.body ?? String(fm.body ?? ""),
          status: body.status ?? String(fm.status ?? "draft"),
          updated_at: new Date().toISOString(),
        },
        merge: true,
      }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.text().catch(() => "");
      console.error("[whatsapp/templates] patch failed:", patchRes.status, err);
      return Response.json({ error: "engine_error" }, { status: 502 });
    }
    return Response.json({ ok: true });
  }
);

export const DELETE = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: templateDeleteSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_template",
      details: { slug: body.slug, deleted: true, by: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const encodedSlug = body.slug.split("/").map(encodeURIComponent).join("/");
    await fetchEngine(ctx.brainId, ctx.headers, `/api/pages/${encodedSlug}`, {
      method: "DELETE",
    });
    return Response.json({ ok: true });
  }
);
