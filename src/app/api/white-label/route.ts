import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  generateWhiteLabelManifest,
  whiteLabelFromKanzleiSettings,
  DEFAULT_WHITE_LABEL,
  type WhiteLabelConfig,
} from "@/lib/white-label";

export const dynamic = "force-dynamic";

const configSchema = z.object({
  firm_name: z.string().min(1).max(300),
  firm_short_name: z.string().max(50).optional(),
  firm_description: z.string().max(1000).optional(),
  logo_url: z.string().max(500).optional(),
  icon_192_url: z.string().max(500).optional(),
  icon_512_url: z.string().max(500).optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  start_url: z.string().max(300),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: configSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "white_label_config",
      entityId: body.firm_name,
      details: { themeColor: body.theme_color },
    }),
  },
  async (ctx, body) => {
    const config: WhiteLabelConfig = {
      firm_name: body.firm_name,
      firm_short_name: body.firm_short_name,
      firm_description: body.firm_description,
      logo_url: body.logo_url,
      icon_192_url: body.icon_192_url,
      icon_512_url: body.icon_512_url,
      theme_color: body.theme_color,
      background_color: body.background_color,
      start_url: body.start_url,
    };
    const manifest = generateWhiteLabelManifest(config);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "legal/settings/white-label",
        title: "White-Label PWA",
        type: "white_label_config",
        frontmatter: config,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ config, manifest });
  }
);

const settingsSchema = z.object({
  firm_name: z.string().max(300).optional(),
  logo_url: z.string().max(500).optional(),
  theme_color: z.string().max(20).optional(),
  background_color: z.string().max(20).optional(),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    query: settingsSchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "white_label_config", limit: "1" });
    const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    const data = response.ok ? await response.json() : [];
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
      frontmatter?: WhiteLabelConfig;
    }>;
    const saved = pages[0]?.frontmatter;
    const config =
      saved ??
      (query?.firm_name
        ? whiteLabelFromKanzleiSettings({
            firm_name: query.firm_name,
            logo_url: query.logo_url,
            theme_color: query.theme_color,
            background_color: query.background_color,
          })
        : DEFAULT_WHITE_LABEL);
    const manifest = generateWhiteLabelManifest(config);
    return apiSuccess({ config, manifest });
  }
);
