import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createHandler } from "@/lib/api-handler";

const semanticSearchSchema = z.object({
  q: z.string().min(2, "query_too_short").max(500, "query_too_long"),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).optional().default("all"),
  limit: z.string().optional(),
});

const CORPUS_DIR = path.join(process.cwd(), "law-corpus");

interface CorpusEntry {
  jurisdiction: "at" | "de" | "ch";
  label: string;
  file: string;
}

const CORPUS_META: Record<string, CorpusEntry> = {
  abgb:    { jurisdiction: "at", label: "ABGB", file: "at/abgb.md" },
  ahg:     { jurisdiction: "at", label: "AHG", file: "at/ahg.md" },
  bao:     { jurisdiction: "at", label: "BAO", file: "at/bao.md" },
  eo:      { jurisdiction: "at", label: "EO", file: "at/eo.md" },
  stgb_at: { jurisdiction: "at", label: "StGB (AT)", file: "at/stgb-at.md" },
  stpo_at: { jurisdiction: "at", label: "StPO (AT)", file: "at/stpo-at.md" },
  ugb:     { jurisdiction: "at", label: "UGB", file: "at/ugb.md" },
  zpo_at:  { jurisdiction: "at", label: "ZPO (AT)", file: "at/zpo-at.md" },
  ao:      { jurisdiction: "de", label: "AO", file: "de/ao.md" },
  bgb:     { jurisdiction: "de", label: "BGB", file: "de/bgb.md" },
  estg:    { jurisdiction: "de", label: "EStG", file: "de/estg.md" },
  famfg:   { jurisdiction: "de", label: "FamFG", file: "de/famfg.md" },
  gg:      { jurisdiction: "de", label: "GG", file: "de/gg.md" },
  gmbhg:   { jurisdiction: "de", label: "GmbHG", file: "de/gmbhg.md" },
  hgb:     { jurisdiction: "de", label: "HGB", file: "de/hgb.md" },
  inso:    { jurisdiction: "de", label: "InsO", file: "de/inso.md" },
  stgb:    { jurisdiction: "de", label: "StGB", file: "de/stgb.md" },
  stpo:    { jurisdiction: "de", label: "StPO", file: "de/stpo.md" },
  ustg:    { jurisdiction: "de", label: "UStG", file: "de/ustg.md" },
  uwg:     { jurisdiction: "de", label: "UWG", file: "de/uwg.md" },
  zpo:     { jurisdiction: "de", label: "ZPO", file: "de/zpo.md" },
  or:      { jurisdiction: "ch", label: "OR", file: "ch/or.md" },
  stgb_ch: { jurisdiction: "ch", label: "StGB (CH)", file: "ch/stgb.md" },
  zgb:     { jurisdiction: "ch", label: "ZGB", file: "ch/zgb.md" },
};

// ── Tokenization & TF-IDF-like scoring ─────────────────────────────────

const STOP_WORDS_DE = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "eines", "einem", "einen",
  "und", "oder", "aber", "nicht", "ist", "sind", "war", "waren", "sein", "hat", "haben",
  "im", "in", "an", "auf", "mit", "bei", "von", "zu", "zur", "zum", "für", "über", "unter",
  "nach", "vor", "aus", "durch", "um", "ohne", "gegen", "wird", "werden", "wurde", "worden",
  "kann", "können", "soll", "sollen", "muss", "müssen", "darf", "dürfen", "wenn", "dann",
  "so", "auch", "nur", "noch", "schon", "immer", "mehr", "kein", "keine", "keinen",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS_DE.has(t));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by max frequency
  const max = Math.max(...tf.values(), 1);
  for (const [key, val] of tf) {
    tf.set(key, val / max);
  }
  return tf;
}

function cosineSimilarity(tfA: Map<string, number>, tfB: Map<string, number>): number {
  let dot = 0;
  for (const [key, valA] of tfA) {
    const valB = tfB.get(key);
    if (valB) dot += valA * valB;
  }
  // Since we're comparing query to paragraph, simple dot product suffices
  // (both are normalized TF vectors, no IDF needed for ranking)
  return dot;
}

interface ParagraphChunk {
  code: string;
  label: string;
  jurisdiction: string;
  paragraph: string;
  text: string;
  tf: Map<string, number>;
}

let corpusIndex: ParagraphChunk[] | null = null;
let corpusIndexing: Promise<ParagraphChunk[]> | null = null;

async function buildCorpusIndex(): Promise<ParagraphChunk[]> {
  if (corpusIndex) return corpusIndex;
  if (corpusIndexing) return corpusIndexing;

  corpusIndexing = (async () => {
    const chunks: ParagraphChunk[] = [];

    for (const [code, meta] of Object.entries(CORPUS_META)) {
      const fullPath = path.join(CORPUS_DIR, meta.file);
      let text: string;
      try {
        text = await fs.readFile(fullPath, "utf8");
      } catch {
        continue;
      }

      // Strip frontmatter
      if (text.startsWith("---")) {
        const end = text.indexOf("---", 3);
        if (end !== -1) text = text.slice(end + 3);
      }

      // Split into paragraphs by § headings
      const SECTION_RE = /^#{1,4}\s*§\s*(\d+[a-zA-Z]?)/m;
      const PARA_RE = /§\s*(\d+[a-zA-Z]?)\./g;

      if (meta.jurisdiction === "de") {
        // DE: split on markdown headings with §
        const lines = text.split("\n");
        let currentPara = "";
        let currentLines: string[] = [];

        const flush = () => {
          if (currentLines.length === 0) return;
          const block = currentLines.join("\n").trim();
          if (block.length > 20) {
            const tokens = tokenize(block);
            if (tokens.length > 0) {
              chunks.push({
                code,
                label: meta.label,
                jurisdiction: meta.jurisdiction,
                paragraph: currentPara,
                text: block.slice(0, 2000),
                tf: termFrequency(tokens),
              });
            }
          }
          currentLines = [];
        };

        for (const line of lines) {
          const m = line.match(SECTION_RE);
          if (m) {
            flush();
            currentPara = `§ ${m[1]}`;
          }
          currentLines.push(line);
        }
        flush();
      } else {
        // AT/CH: split on § N. patterns
        const positions: { num: string; idx: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = PARA_RE.exec(text)) !== null) {
          positions.push({ num: m[1], idx: m.index });
        }

        for (let i = 0; i < positions.length; i++) {
          const { num, idx } = positions[i];
          const endIdx = i + 1 < positions.length ? positions[i + 1].idx : idx + 3000;
          const block = text.slice(idx, endIdx).trim();
          if (block.length > 20) {
            const tokens = tokenize(block);
            if (tokens.length > 0) {
              chunks.push({
                code,
                label: meta.label,
                jurisdiction: meta.jurisdiction,
                paragraph: `§ ${num}`,
                text: block.slice(0, 2000),
                tf: termFrequency(tokens),
              });
            }
          }
        }
      }
    }

    corpusIndex = chunks;
    return chunks;
  })();

  return corpusIndexing;
}

export const GET = createHandler(
  {
    action: "legal.statute",
    rateTier: "standard",
    query: semanticSearchSchema,
    cacheMaxAge: 60,
  },
  async (_ctx, _body, query, _req) => {
    const q = query.q;
    const jurisdiction = query.jurisdiction;
    const limit = Math.min(parseInt(query.limit || "20", 10), 50);

    const chunks = await buildCorpusIndex();
    const queryTokens = tokenize(q);
    if (queryTokens.length === 0) {
      return Response.json({ results: [], total: 0, query: q });
    }
    const queryTf = termFrequency(queryTokens);

    const scored = chunks
      .filter((c) => jurisdiction === "all" || c.jurisdiction === jurisdiction)
      .map((c) => ({
        chunk: c,
        score: cosineSimilarity(queryTf, c.tf),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const results = scored.map((s) => ({
      code: s.chunk.code,
      label: s.chunk.label,
      jurisdiction: s.chunk.jurisdiction,
      paragraph: s.chunk.paragraph,
      excerpt: s.chunk.text.slice(0, 800),
      score: Math.round(s.score * 1000) / 1000,
    }));

    return Response.json({
      query: q,
      jurisdiction,
      total: results.length,
      results,
    });
  },
);
