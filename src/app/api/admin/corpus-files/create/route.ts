import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { safeCorpusPath, createFile } from "@/lib/corpus-steward";
import { validateFrontmatter } from "@/lib/corpus-schema";
import { updateIndexEntry } from "@/lib/corpus-index";
import { markiereZumImport } from "@/lib/corpus-import-queue";
import { existsSync, statSync } from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const bodySchema = z.object({
  path: z.string().min(3).max(500),
  frontmatter: z.record(z.unknown()).default({}),
  body: z.string().default(""),
});

/**
 * POST /api/admin/corpus-files/create
 *
 * Erstellt eine neue Datei im Corpus.
 */
export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "corpus.file_create" as const,
      entityType: "corpus_file",
      entityId: body.path,
      details: {
        doc_class: body.frontmatter.doc_class,
        created_by: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    // Validate path — BUG 41: vorher nur at-/at/, jetzt alle Jurisdiktionen.
    if (
      !body.path.startsWith("at-") &&
      !body.path.startsWith("at/") &&
      !body.path.startsWith("de/") &&
      !body.path.startsWith("ch/") &&
      !body.path.startsWith("eu/")
    ) {
      return apiError("validation_failed", "Path must start with at-, at/, de/, ch/, or eu/", 400);
    }
    if (!body.path.endsWith(".md")) {
      return apiError("validation_failed", "Path must end with .md", 400);
    }

    const absPath = safeCorpusPath(body.path);
    if (!absPath) {
      return apiError("validation_failed", "Invalid or unsafe path", 400);
    }
    if (existsSync(absPath)) {
      return apiError("conflict", "File already exists", 409);
    }

    // Schema-Validierung — neu angelegte Dateien müssen ebenfalls dem
    // kanonischen Schema entsprechen, sonst entsteht Uneinheitlichkeit
    // an der Quelle statt nachträglichem Normalisieren.
    // doc_class ist das kanonische Feld im Frontmatter (nicht "type").
    const pruefung = validateFrontmatter(
      body.frontmatter,
      body.frontmatter.doc_class as string | undefined
    );
    if (!pruefung.valid) {
      return apiError(
        "validation_failed",
        `Frontmatter verletzt das Schema: ${pruefung.errors.map((e) => e.message).join("; ")}`,
        400
      );
    }

    try {
      const result = createFile(body.path, body.frontmatter, body.body, ctx.user.email);

      // Update Index (Disk + Memory)
      const corpus = body.path.split("/")[0];
      const newStat = statSync(absPath);
      updateIndexEntry(corpus, {
        path: body.path,
        size: newStat.size,
        mtime: Math.floor(newStat.mtimeMs / 1000),
      });

      // Eine neu angelegte Norm existiert für das KI-Gehirn erst nach dem
      // Import — bis dahin ist sie im Dashboard sichtbar und in der Suche nicht.
      markiereZumImport(body.path, ctx.user.email, "create");

      return apiSuccess({ ...result, importAusstehend: true });
    } catch (err) {
      return apiError("create_failed", (err as Error).message, 500);
    }
  }
);
