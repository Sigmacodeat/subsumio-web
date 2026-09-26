import { z } from "zod";
import JSZip from "jszip";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { caseFrontmatter } from "@/lib/legal-types";
import { sanitizeFilename } from "@/lib/upload-validation";
import { listEnginePages } from "@/lib/engine-pages";
import { readCapped, uniqueZipPath } from "@/lib/case-export";

import { logger } from "@/lib/logger";
const log = logger("api/cases/export");

export const maxDuration = 300;

const exportQuerySchema = z.object({
  slug: z.string().min(1).max(300),
});

/** Einzeldatei-Limit — alles darüber wird im Manifest benannt statt eingepackt. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 800 * 1024 * 1024;

/** Höchstzahl der Dateien pro Export; der Rest steht im Manifest. */
const MAX_EXPORT_ITEMS = 500;
/** Obergrenze für die Suche nach Dokumenten, die per case_slug an der Akte hängen. */
const MATTER_DOC_SCAN_MAX = 50_000;

interface ExportDoc {
  slug?: string;
  url?: string;
  name: string;
}

/**
 * Die Dokumente der Akte: die Liste in `frontmatter.documents` plus alle
 * Dokumentseiten, die per `case_slug` an der Akte hängen. Einträge, deren
 * Dokument gelöscht oder einer anderen Akte zugeordnet ist, fallen heraus.
 */
async function collectCaseDocuments(
  headers: Record<string, string>,
  caseSlugs: Set<string>,
  listed: ExportDoc[]
): Promise<{ docs: ExportDoc[]; listingFailed: boolean }> {
  let pages: Awaited<ReturnType<typeof listEnginePages>>;
  try {
    pages = await listEnginePages(headers, "document", MATTER_DOC_SCAN_MAX, {
      includeTombstoned: true,
      strict: true,
      timeoutMs: 20_000,
    });
  } catch (err) {
    log.warn("[cases/export] document listing failed:", err instanceof Error ? err.message : err);
    return { docs: listed, listingFailed: true };
  }
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const docs: ExportDoc[] = [];
  const seen = new Set<string>();
  for (const entry of listed) {
    const key = entry.slug || entry.url || "";
    const page = entry.slug ? bySlug.get(entry.slug) : undefined;
    if (page) {
      const fm = page.frontmatter ?? {};
      if (fm.status === "tombstoned") continue;
      if (!caseSlugs.has(String(fm.case_slug ?? ""))) continue;
    }
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    docs.push(entry);
  }
  for (const page of pages) {
    const fm = page.frontmatter ?? {};
    if (fm.status === "tombstoned") continue;
    if (!caseSlugs.has(String(fm.case_slug ?? ""))) continue;
    if (seen.has(page.slug)) continue;
    seen.add(page.slug);
    const name =
      (typeof fm.source_filename === "string" && fm.source_filename) ||
      (typeof fm.filename === "string" && fm.filename) ||
      page.title ||
      page.slug.split("/").pop() ||
      "dokument";
    docs.push({ slug: page.slug, name });
  }
  return { docs, listingFailed: false };
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
      const listedDocs = (Array.isArray(fm.documents) ? fm.documents : []) as ExportDoc[];
      const caseSlugs = new Set(
        [query.slug, typeof casePage.slug === "string" ? casePage.slug : ""].filter(Boolean)
      );
      const { docs, listingFailed } = await collectCaseDocuments(
        ctx.headers,
        caseSlugs,
        listedDocs
      );

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

      for (const doc of docs.slice(MAX_EXPORT_ITEMS)) {
        skipped.push({ name: doc.name, reason: "export_item_limit" });
      }

      for (const doc of docs.slice(0, MAX_EXPORT_ITEMS)) {
        const fileSlug = doc.slug || doc.url;
        if (!fileSlug) {
          skipped.push({ name: doc.name, reason: "no_file_reference" });
          continue;
        }
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
          const buf = await readCapped(res, MAX_FILE_BYTES);
          if (!buf) {
            skipped.push({ name: doc.name, reason: "file_too_large" });
            continue;
          }
          totalBytes += buf.byteLength;
          // Doppelte Dateinamen nicht überschreiben.
          const path = uniqueZipPath(doc.name, usedNames);
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
            ...(listingFailed ? { document_listing_failed: true } : {}),
            complete: skipped.length === 0 && !listingFailed,
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
