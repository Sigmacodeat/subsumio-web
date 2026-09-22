import { z } from "zod";
import JSZip from "jszip";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { caseFrontmatter } from "@/lib/legal-types";
import { sanitizeFilename } from "@/lib/upload-validation";

import { logger } from "@/lib/logger";
const log = logger("api/cases/export");

export const maxDuration = 300;

const exportQuerySchema = z.object({
  slug: z.string().min(1).max(300),
});

/** Einzeldatei-Limit — alles darüber wird im Manifest benannt statt eingepackt. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 800 * 1024 * 1024;

function safePath(name: string): string {
  const clean = sanitizeFilename(name).slice(0, 180) || "dokument";
  return `dokumente/${clean}`;
}

/**
 * WP-8.48: Akten-Export inkl. Originaldateien (Kanzlei-Wechselszenario).
 * ZIP mit akte.json + dokumente/* + export-manifest.json.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    query: exportQuerySchema,
    audit: (ctx, _body, query) => ({
      action: "case.export" as const,
      entityType: "case",
      entityId: query.slug,
      details: { user: ctx.user?.email },
    }),
  },
  async (ctx, _body, query) => {
    try {
      const slugPath = query.slug.split("/").map(encodeURIComponent).join("/");
      const caseRes = await fetch(`${ENGINE_URL}/api/pages/${slugPath}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!caseRes.ok) {
        return apiError(
          "case_not_found",
          "Akte konnte nicht geladen werden",
          caseRes.status === 404 ? 404 : 502
        );
      }
      const casePage = (await caseRes.json()) as Record<string, unknown>;
      const fm = caseFrontmatter(casePage);
      const docs = Array.isArray(fm.documents) ? fm.documents : [];

      const zip = new JSZip();
      zip.file(
        "akte.json",
        JSON.stringify(
          {
            export_metadata: {
              type: "case_export",
              generated_at: new Date().toISOString(),
              user: ctx.user?.email,
              case_slug: query.slug,
            },
            title: casePage.title,
            frontmatter: casePage.frontmatter,
            content: casePage.content ?? "",
          },
          null,
          2
        )
      );

      const skipped: Array<{ name: string; reason: string }> = [];
      let totalBytes = 0;
      let included = 0;
      const usedNames = new Set<string>();

      for (const doc of docs.slice(0, 500)) {
        const fileSlug = doc.slug || doc.url;
        if (!fileSlug) continue;
        if (totalBytes >= MAX_TOTAL_BYTES) {
          skipped.push({ name: doc.name, reason: "export_size_limit" });
          continue;
        }
        try {
          const filePath = fileSlug.split("/").map(encodeURIComponent).join("/");
          const res = await fetch(`${ENGINE_URL}/api/files/${filePath}`, {
            headers: ctx.headers,
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            skipped.push({ name: doc.name, reason: `download_http_${res.status}` });
            continue;
          }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.byteLength > MAX_FILE_BYTES) {
            skipped.push({ name: doc.name, reason: "file_too_large" });
            continue;
          }
          totalBytes += buf.byteLength;
          let path = safePath(doc.name);
          // Doppelte Dateinamen nicht überschreiben.
          while (usedNames.has(path)) path = safePath(`_${doc.name}`);
          usedNames.add(path);
          zip.file(path, buf);
          included += 1;
        } catch {
          skipped.push({ name: doc.name, reason: "download_failed" });
        }
      }

      zip.file(
        "export-manifest.json",
        JSON.stringify(
          {
            case_slug: query.slug,
            generated_at: new Date().toISOString(),
            documents_total: docs.length,
            documents_included: included,
            documents_skipped: skipped,
            complete: skipped.length === 0,
          },
          null,
          2
        )
      );

      const zipBuf = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const filename = `${sanitizeFilename(query.slug.split("/").pop() ?? "akte")}-export.zip`;
      return new Response(new Uint8Array(zipBuf), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(zipBuf.byteLength),
        },
      });
    } catch (err) {
      log.error("[cases/export] failed:", err instanceof Error ? err.message : String(err));
      return apiError("export_failed", "Akten-Export fehlgeschlagen", 500);
    }
  }
);
