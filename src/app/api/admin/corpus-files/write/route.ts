import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { safeCorpusPath, serializeDoc, saveVersion, saveVersionContent, auditLog } from "@/lib/corpus-steward";
import { validateFrontmatter } from "@/lib/corpus-schema";
import { updateIndexEntry } from "@/lib/corpus-index";
import { markiereZumImport } from "@/lib/corpus-import-queue";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const bodySchema = z.object({
  path: z.string().min(1).max(500),
  frontmatter: z.record(z.unknown()),
  body: z.string().max(500_000), // 500KB limit
  expectedHash: z.string().optional(),
});

/**
 * PUT /api/admin/corpus-files/write
 *
 * Schreibt eine Datei (Frontmatter + Body) mit Backup + Audit-Log.
 */
export const PUT = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "corpus_file",
      details: { path: body.path, editedBy: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const absPath = safeCorpusPath(body.path);
    if (!absPath) {
      return apiError("validation_failed", "Invalid path", 400);
    }

    if (!existsSync(absPath)) {
      return apiError("not_found", "File not found", 404);
    }

    // Gleichzeitiges Bearbeiten: `expectedHash` war deklariert, wurde aber nie
    // geprüft. Zwei Bearbeiter derselben Norm überschrieben sich damit
    // lautlos — der zweite Speichervorgang gewann, ohne dass der erste es
    // erfuhr. Bei Gesetzestexten ist das nicht hinnehmbar.
    if (body.expectedHash) {
      const istHash = createHash("sha256").update(readFileSync(absPath, "utf-8")).digest("hex").slice(0, 16);
      if (istHash !== body.expectedHash) {
        return apiError(
          "conflict",
          "Die Datei wurde seit dem Öffnen geändert. Bitte neu laden und Änderung erneut anwenden.",
          409,
        );
      }
    }

    // Kanonisches Schema erzwingen. Ohne diese Prüfung nahm die Route jedes
    // beliebige Frontmatter an (`z.record(z.unknown())`) und konnte damit
    // genau die Uneinheitlichkeit wieder einschleusen, gegen die der
    // Normalisierer den ganzen Bestand vereinheitlicht hat.
    // doc_class ist das kanonische Feld im Frontmatter (nicht "type").
    const pruefung = validateFrontmatter(body.frontmatter, body.frontmatter.doc_class as string | undefined);
    if (!pruefung.valid) {
      return apiError(
        "validation_failed",
        `Frontmatter verletzt das Schema: ${pruefung.errors.map((e) => e.message).join("; ")}`,
        400,
      );
    }

    // Save old version before overwrite
    saveVersion(body.path, ctx.user.email, "edit", "pre-edit snapshot");

    // Serialize and write
    const content = serializeDoc(body.frontmatter, body.body);
    writeFileSync(absPath, content, "utf-8");

    // Save new version after write
    saveVersionContent(body.path, content, ctx.user.email, "edit", "post-edit snapshot");

    // In Import-Warteschlange eintragen — die DB muss diese Datei neu
    // einlesen, sonst zitiert das Gehirn den alten Text.
    markiereZumImport(body.path, ctx.user.email, "edit");

    // Update Index (Disk + Memory — inkrementell, kein Full-Rebuild nötig)
    const corpus = body.path.split("/")[0];
    const newStat = statSync(absPath);
    updateIndexEntry(corpus, {
      path: body.path,
      size: newStat.size,
      mtime: Math.floor(newStat.mtimeMs / 1000),
    });

    // Audit log
    auditLog({
      action: "edit_file",
      path: body.path,
      user: ctx.user.email,
      details: { size: content.length },
    });

    return apiSuccess({
      path: body.path,
      written: true,
      size: content.length,
      /** Solange true, weicht die Datenbank von der Datei ab. */
      importAusstehend: true,
    });
  },
);
