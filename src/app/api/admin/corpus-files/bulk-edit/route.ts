import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  safeCorpusPath,
  serializeDoc,
  parseDoc,
  saveVersion,
  saveVersionContent,
  auditLog,
  syncToRawCorpus,
  atomicWrite,
} from "@/lib/corpus-steward";
import { updateIndexEntry } from "@/lib/corpus-index";
import { markiereZumImport } from "@/lib/corpus-import-queue";
import { validateFrontmatter } from "@/lib/corpus-schema";
import { readFileSync, existsSync, statSync } from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  paths: z.array(z.string()).min(1).max(100),
  operation: z.enum(["set_field", "delete_field", "replace_body", "prepend_body", "append_body"]),
  field: z.string().optional(),
  value: z.unknown().optional(),
  text: z.string().optional(),
});

/**
 * POST /api/admin/corpus-files/bulk-edit
 *
 * Bulk-Edit für mehrere Dateien:
 * - set_field: Frontmatter-Feld setzen
 * - delete_field: Frontmatter-Feld löschen
 * - replace_body: Body ersetzen
 * - prepend_body: Text vor Body einfügen
 * - append_body: Text an Body anhängen
 */
export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "corpus_files.bulk_edit" as const,
      entityType: "corpus_file",
      details: {
        operation: body.operation,
        field: body.field,
        pathsCount: body.paths.length,
        user: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    const { paths, operation, field, value, text } = body;

    if (operation === "set_field" || operation === "delete_field") {
      if (!field) return apiError("validation_failed", "field is required for this operation", 400);
    }
    if (operation === "set_field" && value === undefined) {
      return apiError("validation_failed", "value is required for set_field", 400);
    }
    if (
      operation === "replace_body" ||
      operation === "prepend_body" ||
      operation === "append_body"
    ) {
      if (text === undefined)
        return apiError("validation_failed", "text is required for this operation", 400);
    }

    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    const affectedCorpora = new Set<string>();

    for (const relPath of paths) {
      const absPath = safeCorpusPath(relPath);
      if (!absPath || !existsSync(absPath)) {
        failed++;
        errors.push(`${relPath}: file not found`);
        continue;
      }

      try {
        // Read and parse
        const content = readFileSync(absPath, "utf-8");
        const parsed = parseDoc(content);

        // Apply operation
        switch (operation) {
          case "set_field":
            parsed.frontmatter[field!] = value;
            break;
          case "delete_field":
            delete parsed.frontmatter[field!];
            break;
          case "replace_body":
            parsed.body = text!;
            break;
          case "prepend_body":
            parsed.body = text! + "\n\n" + parsed.body;
            break;
          case "append_body":
            parsed.body = parsed.body + "\n\n" + text!;
            break;
        }

        // Schema-Validierung nach set_field — verhindert dass Bulk-Edit
        // kanonische Felder (doc_class, jurisdiction) kaputt macht.
        // Bei delete_field nur warnen (kann bewusst sein), bei set_field
        // hard fail — der Nutzer soll keine invaliden Werte setzen können.
        // BUG 31: Validierung VOR saveVersion — sonst entsteht eine
        // Phantom-Version (pre-edit snapshot) obwohl kein Edit stattfand.
        if (operation === "set_field") {
          const pruefung = validateFrontmatter(
            parsed.frontmatter,
            parsed.frontmatter.doc_class as string | undefined
          );
          if (!pruefung.valid) {
            failed++;
            errors.push(
              `${relPath}: schema validation failed: ${pruefung.errors.map((e) => e.message).join("; ")}`
            );
            continue;
          }
        }

        // Save version before edit (nur wenn die Änderung wirklich stattfindet)
        saveVersion(relPath, ctx.user.email, "edit", `bulk ${operation}`);

        // Serialize and write — BUG 54+56: atomicWrite (tmp + fsync + rename)
        const newContent = serializeDoc(parsed.frontmatter, parsed.body);
        atomicWrite(absPath, newContent);

        // Sync nach law-corpus/{path} (raw) — die Pipeline importiert aus
        // law-corpus/{dir}, nicht aus _normalized/. Ohne Sync kommt die
        // Bulk-Änderung nie in die DB (BUG 5).
        syncToRawCorpus(relPath, newContent);

        // Save new version
        saveVersionContent(relPath, newContent, ctx.user.email, "edit", `bulk ${operation} (post)`);

        // Massenänderungen sind der riskanteste Weg, Datei und Datenbank
        // auseinanderlaufen zu lassen — hunderte Dokumente auf einmal.
        markiereZumImport(relPath, ctx.user.email, "edit");

        // Index-Eintrag aktualisieren (Disk + Memory)
        const newStat = statSync(absPath);
        updateIndexEntry(relPath.split("/")[0], {
          path: relPath,
          size: newStat.size,
          mtime: Math.floor(newStat.mtimeMs / 1000),
        });

        success++;
        affectedCorpora.add(relPath.split("/")[0]);
      } catch (err) {
        failed++;
        errors.push(`${relPath}: ${(err as Error).message}`);
      }
    }

    auditLog({
      action: "bulk_edit",
      paths: paths.length,
      user: ctx.user.email,
      details: { operation, field, success, failed },
    });

    return apiSuccess({ success, failed, errors, operation });
  }
);
