import { createHandler } from "@/lib/api-handler";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSharedPgPool } from "@/lib/auth/store";
import { env } from "@/lib/env";
import { createSchemaInit } from "@/lib/schema-init";

const widgetSchema = z.object({
  id: z.string(),
  type: z.enum(["stats", "recent-activity", "deadlines", "quick-actions", "dream-cycle", "getting-started"]),
  visible: z.boolean(),
  order: z.number(),
});

const widgetsPostSchema = z.object({
  widgets: z.array(widgetSchema).max(20, "too_many_widgets"),
});

const DATA_DIR = env("SIGMABRAIN_DATA_DIR") || path.join(process.cwd(), ".data");
const WIDGET_PREFS_FILE = path.join(DATA_DIR, "widget-prefs.json");

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_widget_prefs (
    user_id text NOT NULL,
    brain_id text NOT NULL,
    widgets jsonb NOT NULL DEFAULT '[]',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, brain_id)
  );
`);

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    const pool = getSharedPgPool();
    if (pool) {
      try {
        await ensureSchema();
        const result = await pool.query(
          "SELECT widgets FROM subsumio_widget_prefs WHERE user_id = $1 AND brain_id = $2",
          [ctx.user.id, ctx.brainId],
        );
        if (result.rows.length > 0) {
          return Response.json({ widgets: result.rows[0].widgets });
        }
      } catch {
        // fall through to file
      }
    }
    // File fallback
    try {
      const raw = await fs.readFile(WIDGET_PREFS_FILE, "utf-8");
      const all = JSON.parse(raw) as Record<string, unknown>;
      const key = `${ctx.user.id}:${ctx.brainId}`;
      if (all[key]) {
        return Response.json({ widgets: all[key] });
      }
    } catch {}
    return Response.json({ widgets: null });
  },
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: widgetsPostSchema,
  },
  async (ctx, body, _query, _req) => {
    const pool = getSharedPgPool();
    if (pool) {
      try {
        await ensureSchema();
        await pool.query(
          `INSERT INTO subsumio_widget_prefs (user_id, brain_id, widgets, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (user_id, brain_id) DO UPDATE SET widgets = EXCLUDED.widgets, updated_at = now()`,
          [ctx.user.id, ctx.brainId, JSON.stringify(body.widgets)],
        );
        return Response.json({ ok: true });
      } catch (err) {
        console.error("[widget-prefs] postgres save failed:", err instanceof Error ? err.message : String(err));
      }
    }
    // File fallback
    try {
      await fs.mkdir(path.dirname(WIDGET_PREFS_FILE), { recursive: true });
      let all: Record<string, unknown> = {};
      try {
        const raw = await fs.readFile(WIDGET_PREFS_FILE, "utf-8");
        all = JSON.parse(raw);
      } catch {}
      const key = `${ctx.user.id}:${ctx.brainId}`;
      all[key] = body.widgets;
      const tmp = `${WIDGET_PREFS_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, WIDGET_PREFS_FILE);
      return Response.json({ ok: true });
    } catch (err) {
      console.error("[widget-prefs] file save failed:", err instanceof Error ? err.message : String(err));
      return Response.json({ ok: false, error: "persist_failed" }, { status: 500 });
    }
  },
);
