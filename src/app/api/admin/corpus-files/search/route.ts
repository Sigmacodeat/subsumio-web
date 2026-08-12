import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getCorpusIndex, listCorpusNames, safeCorpusPath, NORMALIZED_ROOT_PATH } from "@/lib/corpus-index";
import { basename } from "path";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const querySchema = z.object({
  corpus: z.string().min(1).max(100).default("all"),
  q: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  mode: z.enum(["filename", "content", "both"]).default("both"),
});

interface SearchResult {
  path: string;
  name: string;
  snippet?: string;
  matchIn: "filename" | "content" | "both";
}

/**
 * GET /api/admin/corpus-files/search?q=ABGB&corpus=at-normen&limit=20
 *
 * Filename-Suche: Memory-Index (instant).
 * Content-Suche: OS `grep -rl` (viel schneller als JS readFileSync pro Datei).
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const { corpus, q, limit, mode } = query;
    const qLower = q.toLowerCase();

    // Determine which corpora to search
    const corpora = corpus === "all" ? listCorpusNames() : [corpus];
    if (corpus !== "all" && !corpus.startsWith("at-") && corpus !== "at") {
      return apiError("validation_failed", "Invalid corpus name", 400);
    }

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // ── Phase 1: Filename-Suche (Memory-Index, instant) ──
    if (mode === "filename" || mode === "both") {
      for (const c of corpora) {
        if (results.length >= limit) break;
        const entries = getCorpusIndex(c);
        for (const e of entries) {
          if (results.length >= limit) break;
          if (e.path.toLowerCase().includes(qLower)) {
            if (!seen.has(e.path)) {
              seen.add(e.path);
              results.push({
                path: e.path,
                name: basename(e.path),
                matchIn: "filename",
              });
            }
          }
        }
      }
    }

    // ── Phase 2: Content-Suche (OS grep, schnell) ──
    if (mode === "content" || (mode === "both" && results.length < limit)) {
      const remaining = limit - results.length;
      if (remaining > 0) {
        for (const c of corpora) {
          if (results.length >= limit) break;
          const corpusDir = safeCorpusPath(c);
          if (!corpusDir || !existsSync(corpusDir)) continue;

          // Use grep -rl for fast content search (returns filenames only)
          // -i = case insensitive, -l = list filenames, --include=*.md
          // -F = fixed strings (kein Regex — verhindert Syntax-Fehler und
          // Injection bei Sonderzeichen wie ', ", [, ], *, ., etc.)
          // WICHTIG: Bun.spawn existiert nicht in Node.js (Next.js läuft mit
          // Node.js, nicht Bun). Wir verwenden execFile (async) stattdessen.
          let grepOutput = "";
          try {
            const { stdout } = await execFileAsync("grep", ["-rliF", "--include=*.md", q, corpusDir], {
              encoding: "utf-8",
              maxBuffer: 256 * 1024 * 1024, // 256MB — at-normen hat ~584KB grep-Output
            });
            grepOutput = stdout;
          } catch (err) {
            // grep exit 1 = no matches (not an error), exit 2 = real error
            const code = (err as { code?: number }).code ?? 1;
            if (code > 1) continue; // real grep error → skip this corpus
            // exit 1 = no matches → empty output, continue normally
          }

          for (const line of grepOutput.split("\n")) {
            if (results.length >= limit) break;
            const trimmed = line.trim();
            if (!trimmed) continue;
            const rel = trimmed.replace(/.*law-corpus\/_normalized\//, "");
            if (seen.has(rel)) {
              // Already found via filename — upgrade to "both"
              const existing = results.find((r) => r.path === rel);
              if (existing) existing.matchIn = "both";
              continue;
            }
            seen.add(rel);

            // Get snippet (read first 8KB, find match)
            let snippet: string | undefined;
            try {
              const { readFileSync } = await import("fs");
              const content = readFileSync(trimmed, "utf-8").slice(0, 8192);
              const idx = content.toLowerCase().indexOf(qLower);
              if (idx >= 0) {
                const start = Math.max(0, idx - 50);
                const end = Math.min(content.length, idx + q.length + 50);
                snippet = content.slice(start, end).replace(/\n/g, " ");
              }
            } catch {
              // skip
            }

            results.push({
              path: rel,
              name: basename(rel),
              snippet,
              matchIn: "content",
            });
          }
        }
      }
    }

    return apiSuccess({
      query: q,
      corpus,
      total: results.length,
      results,
    });
  },
);
