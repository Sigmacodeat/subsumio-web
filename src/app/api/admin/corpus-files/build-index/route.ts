import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { listCorpusNames, hasIndex, clearCache } from "@/lib/corpus-index";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  corpus: z.string().optional(),
});

/**
 * POST /api/admin/corpus-files/build-index
 *
 * Baut den File-Index neu (oder für ein spezifisches Korpus).
 * Nutzt OS find + batch stat (25s für 713K Dateien).
 */
export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
    skipCsrf: false,
  },
  async (ctx, body) => {
    const NORMALIZED_ROOT = join(process.cwd(), "law-corpus", "_normalized");
    const INDEX_DIR = join(NORMALIZED_ROOT, "_index");
    mkdirSync(INDEX_DIR, { recursive: true });

    const isMac = process.platform === "darwin";
    const statFmt = isMac ? "-f" : "-c";
    const statArg = isMac
      ? '{"size":%z,"mtime":%m,"path":"%N"}'
      : '{"size":%s,"mtime":%Y,"path":"%n"}';

    const corpora = body.corpus ? [body.corpus] : listCorpusNames();
    const results: Array<{ corpus: string; files: number; ms: number }> = [];

    for (const corpus of corpora) {
      if (!corpus.startsWith("at-") && corpus !== "at") continue;
      const corpusDir = join(NORMALIZED_ROOT, corpus);
      if (!existsSync(corpusDir)) continue;

      const t0 = Date.now();
      // WICHTIG: Bun.spawn existiert nicht in Node.js (Next.js läuft mit
      // Node.js, nicht Bun). Wir verwenden execFile (async) stattdessen.
      const { stdout: output } = await execFileAsync("find", [
        corpusDir, "-type", "f", "-name", "*.md",
        "-exec", "stat", statFmt, statArg, "{}", "+",
      ], {
        encoding: "utf-8",
        maxBuffer: 512 * 1024 * 1024, // 512MB — 713K Dateien
      });

      const entries: Array<{ path: string; size: number; mtime: number }> = [];
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          const relPath = obj.path.replace(/.*law-corpus\/_normalized\//, "");
          entries.push({ path: relPath, size: obj.size, mtime: obj.mtime });
        } catch {
          // skip
        }
      }
      entries.sort((a, b) => a.path.localeCompare(b.path));

      const indexPath = join(INDEX_DIR, `${corpus}.json`);
      writeFileSync(indexPath, JSON.stringify(entries), "utf-8");
      results.push({ corpus, files: entries.length, ms: Date.now() - t0 });
    }

    clearCache(); // Memory-Cache leeren damit neue Index-Dateien geladen werden

    return apiSuccess({
      built: results,
      totalFiles: results.reduce((s, r) => s + r.files, 0),
      totalMs: results.reduce((s, r) => s + r.ms, 0),
    });
  },
);
