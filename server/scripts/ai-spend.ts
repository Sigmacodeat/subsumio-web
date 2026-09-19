#!/usr/bin/env bun
/**
 * Summarize the AI spend ledger (src/core/ai/spend-log.ts).
 *
 *   bun run scripts/ai-spend.ts            # last 7 days
 *   bun run scripts/ai-spend.ts --days 1   # today
 *   GBRAIN_AUDIT_DIR=/data/audit bun run scripts/ai-spend.ts
 *
 * In production: `docker exec subsumio-engine-engine-1 bun run scripts/ai-spend.ts`
 * for engine calls, and the corpus-pipeline container for embeddings (its
 * ledger lives under /root/subsumio-pipeline-logs/audit).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAuditDir } from "../src/core/audit-week-file.ts";

interface Line {
  ts: string;
  kind: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  usd: number | null;
  label: string;
  failed?: boolean;
}

const daysArg = process.argv.indexOf("--days");
const days = daysArg >= 0 ? Math.max(1, Number(process.argv[daysArg + 1]) || 7) : 7;
const since = Date.now() - days * 86_400_000;

const dir = resolveAuditDir();
if (!existsSync(dir)) {
  console.log(`Kein Ausgabenprotokoll unter ${dir}.`);
  process.exit(0);
}

const lines: Line[] = [];
for (const file of readdirSync(dir).filter(
  (f) => f.startsWith("ai-spend-") && f.endsWith(".jsonl")
)) {
  for (const raw of readFileSync(join(dir, file), "utf-8").split("\n")) {
    if (!raw.trim()) continue;
    try {
      const line = JSON.parse(raw) as Line;
      if (Date.parse(line.ts) >= since) lines.push(line);
    } catch {
      // skip a torn line
    }
  }
}

function group(key: (l: Line) => string) {
  const out = new Map<
    string,
    { calls: number; inTok: number; outTok: number; usd: number; unpriced: number }
  >();
  for (const l of lines) {
    const k = key(l);
    const g = out.get(k) ?? { calls: 0, inTok: 0, outTok: 0, usd: 0, unpriced: 0 };
    g.calls += 1;
    g.inTok += l.input_tokens;
    g.outTok += l.output_tokens;
    if (l.usd === null) g.unpriced += 1;
    else g.usd += l.usd;
    out.set(k, g);
  }
  return [...out.entries()].sort((a, b) => b[1].usd - a[1].usd);
}

function print(title: string, rows: ReturnType<typeof group>) {
  console.log(`\n${title}`);
  for (const [k, g] of rows) {
    const unpriced = g.unpriced ? `  (${g.unpriced} ohne Preis)` : "";
    console.log(
      `  ${k.padEnd(52)} ${String(g.calls).padStart(7)} Aufrufe  ${g.inTok.toLocaleString("de-AT").padStart(14)} ein  ${g.outTok.toLocaleString("de-AT").padStart(12)} aus  $${g.usd.toFixed(2).padStart(8)}${unpriced}`
    );
  }
}

const total = lines.reduce((s, l) => s + (l.usd ?? 0), 0);
console.log(
  `KI-Ausgaben der letzten ${days} Tag(e) aus ${dir}: $${total.toFixed(2)} in ${lines.length} Aufrufen`
);
print(
  "Nach Tag",
  group((l) => l.ts.slice(0, 10))
);
print(
  "Nach Modell",
  group((l) => `${l.kind} ${l.model}`)
);
print(
  "Nach Aufrufstelle",
  group((l) => `${l.label}${l.failed ? " (fehlgeschlagen)" : ""}`)
);
