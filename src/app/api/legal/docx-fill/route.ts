import { z } from "zod";
import JSZip from "jszip";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { DocxTemplateError, fillDocxBatch, fillDocxTemplate } from "@/lib/docx-template";
import { resolveKnownVariables } from "@/lib/templates";
import { KANZLEI_SETTINGS_SLUG, type KanzleiSettings } from "@/lib/kanzlei-settings";
import type { CaseFrontmatter } from "@/lib/legal-types";
import type { AuditAction } from "@/lib/audit";
import { logger } from "@/lib/logger";

const log = logger("api/legal/docx-fill");

const valueSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

const schema = z.object({
  /** .docx-Vorlage als Base64. */
  templateBase64: z
    .string()
    .min(50)
    .max(40 * 1024 * 1024),
  /** Akten-Slug — befüllt die bekannten Platzhalter automatisch. */
  caseSlug: z.string().optional(),
  /** Zusätzliche/überschreibende Platzhalterwerte. */
  values: valueSchema.optional(),
  /** Serienbrief: eine Zeile pro Empfänger. */
  rows: z
    .array(z.object({ filename: z.string().max(200).optional(), values: valueSchema }))
    .max(500)
    .optional(),
  filename: z.string().max(200).optional(),
});

async function fetchJson<T>(ctxHeaders: Record<string, string>, path: string): Promise<T | null> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    headers: ctxHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export const POST = createHandler(
  {
    action: "legal.playbook" as const,
    rateTier: "heavy",
    body: schema,
    audit: (_ctx, body) => ({
      action: "legal.docx_fill" as unknown as AuditAction,
      entityType: "template",
      details: { caseSlug: body.caseSlug, rows: body.rows?.length ?? 0 },
    }),
  },
  async (ctx, body) => {
    let template: Buffer;
    try {
      template = Buffer.from(body.templateBase64, "base64");
    } catch {
      return apiError("invalid_template", "Vorlage konnte nicht dekodiert werden", 400);
    }

    // Akte + Kanzlei-Einstellungen für die bekannten Platzhalter laden.
    let known: Record<string, string> = {};
    try {
      const [kanzleiPage, casePage] = await Promise.all([
        fetchJson<{ frontmatter?: KanzleiSettings }>(
          ctx.headers,
          `/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`
        ),
        body.caseSlug
          ? fetchJson<{ frontmatter?: CaseFrontmatter; title?: string }>(
              ctx.headers,
              `/api/pages/${encodeURIComponent(body.caseSlug)}`
            )
          : Promise.resolve(null),
      ]);
      known = resolveKnownVariables(
        casePage ? { ...casePage.frontmatter, title: casePage.title, slug: body.caseSlug } : null,
        kanzleiPage?.frontmatter ?? null
      );
    } catch (err) {
      log.warn("[docx-fill] context lookup failed:", err instanceof Error ? err.message : err);
    }

    const merged = { ...known, ...(body.values ?? {}) };

    try {
      if (body.rows && body.rows.length > 0) {
        const files = fillDocxBatch(
          template,
          body.rows.map((r) => ({ filename: r.filename, values: { ...merged, ...r.values } }))
        );
        const zip = new JSZip();
        for (const f of files) zip.file(f.filename, f.buffer);
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
        return apiSuccess({
          kind: "zip",
          filename: "serienbrief.zip",
          count: files.length,
          base64: zipBuffer.toString("base64"),
        });
      }
      const buffer = fillDocxTemplate(template, merged);
      return apiSuccess({
        kind: "docx",
        filename: body.filename ?? "dokument.docx",
        base64: buffer.toString("base64"),
      });
    } catch (err) {
      if (err instanceof DocxTemplateError) {
        return apiError("docx_fill_error", err.message, 400);
      }
      throw err;
    }
  }
);
