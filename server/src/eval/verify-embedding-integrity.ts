/**
 * Embedding-Integritäts-Verifikation — semantischer Beweis.
 *
 * Zieht N zufällige Chunks, bettet deren Text via OpenRouter mit dem
 * Produktionsmodell (openai/text-embedding-3-small) neu ein und vergleicht
 * per Cosine-Ähnlichkeit mit dem in der DB gespeicherten Vektor.
 *
 * Erwartung bei intakter Pipeline: ~1.000 (gleiches Modell, gleicher Text,
 * deterministischer Provider). Cluster deutlich < 0.99 wären ein Befund
 * (Modell-Mischung, falscher Text, Kontext-Prefix etc.).
 *
 * Secrets: OPENROUTER_API_KEY wird aus ../.env.local gelesen und NIE
 * ausgegeben. DB-URL aus ~/.gbrain/config.json oder --database-url.
 *
 * Usage (aus server/):
 *   bun run src/eval/verify-embedding-integrity.ts [--sample 200] [--database-url URL]
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { writeFileSync } from "fs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

interface Args {
  sample: number;
  databaseUrl?: string;
}
function parseArgs(argv: string[]): Args {
  const out: Args = { sample: 200 };
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--sample" && i + 1 < a.length) out.sample = parseInt(a[++i], 10);
    if (a[i] === "--database-url" && i + 1 < a.length) out.databaseUrl = a[++i];
    if (a[i] === "--help" || a[i] === "-h") {
      process.stderr.write(
        "Usage: bun run src/eval/verify-embedding-integrity.ts [--sample N] [--database-url URL]\n"
      );
      process.exit(0);
    }
  }
  return out;
}

function loadApiKey(): string {
  const envPath = join(SCRIPT_DIR, "../../../.env.local");
  const raw = readFileSync(envPath, "utf-8");
  const m = raw.match(/^OPENROUTER_API_KEY=["']?([^"'\r\n]+)["']?\s*$/m);
  if (!m) throw new Error("OPENROUTER_API_KEY nicht in .env.local gefunden");
  return m[1];
}

function loadDbUrl(argUrl?: string): string {
  if (argUrl) return argUrl;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const cfg = JSON.parse(readFileSync(join(homedir(), ".gbrain/config.json"), "utf-8"));
  if (!cfg.database_url) throw new Error("database_url nicht in ~/.gbrain/config.json");
  return cfg.database_url;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedBatch(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  const sorted = json.data.sort((x, y) => x.index - y.index);
  return sorted.map((d) => d.embedding);
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = loadApiKey();
  const { default: postgres } = await import("postgres");
  const sql = postgres(loadDbUrl(args.databaseUrl), { max: 2, prepare: false });

  try {
    // Zufallsstichprobe ueber ID-Subquery (kein TABLESAMPLE, kein Full-Table-Sort)
    const rows = (await sql.unsafe(
      `SELECT cc.id, cc.chunk_text, cc.embedding::text AS vec, p.slug
       FROM content_chunks cc
       JOIN pages p ON p.id = cc.page_id
       WHERE cc.id IN (SELECT id FROM content_chunks WHERE embedding IS NOT NULL ORDER BY random() LIMIT $1)`,
      [Math.floor(args.sample)]
    )) as { id: number; chunk_text: string; vec: string; slug: string }[];
    if (rows.length === 0) throw new Error("Stichprobe leer — TABLESAMPLE-Pct zu klein?");
    process.stderr.write(`[verify] ${rows.length} Chunks gezogen\n`);

    interface Finding {
      id: number;
      slug: string;
      cosine: number;
      has_replacement_char: boolean;
      text_preview: string;
    }
    const findings: Finding[] = [];
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const fresh = await embedBatch(
        apiKey,
        batch.map((r) => r.chunk_text)
      );
      if (fresh.length !== batch.length)
        throw new Error(`API lieferte ${fresh.length}/${batch.length} Vektoren`);
      for (let b = 0; b < batch.length; b++) {
        const stored = JSON.parse(batch[b].vec) as number[];
        if (stored.length !== fresh[b].length) {
          findings.push({
            id: batch[b].id,
            slug: batch[b].slug,
            cosine: -1,
            has_replacement_char: batch[b].chunk_text.includes("�"),
            text_preview: `DIMENSIONS-MISMATCH: DB=${stored.length} API=${fresh[b].length}`,
          });
          continue;
        }
        findings.push({
          id: batch[b].id,
          slug: batch[b].slug,
          cosine: cosine(stored, fresh[b]),
          has_replacement_char: batch[b].chunk_text.includes("�"),
          text_preview: batch[b].chunk_text.slice(0, 80).replace(/\s+/g, " "),
        });
      }
      process.stderr.write(
        `[verify] ${Math.min(i + BATCH, rows.length)}/${rows.length} verglichen\n`
      );
    }

    const vals = findings
      .map((f) => f.cosine)
      .filter((c) => c >= 0)
      .sort((x, y) => x - y);
    const n = vals.length;
    const stats = {
      n,
      min: vals[0],
      p5: vals[Math.floor(n * 0.05)],
      median: vals[Math.floor(n * 0.5)],
      mean: vals.reduce((s, v) => s + v, 0) / n,
      below_0_999: vals.filter((v) => v < 0.999).length,
      below_0_99: vals.filter((v) => v < 0.99).length,
      below_0_95: vals.filter((v) => v < 0.95).length,
      below_0_90: vals.filter((v) => v < 0.9).length,
      dim_mismatches: findings.filter((f) => f.cosine === -1).length,
      mit_ersatzzeichen: findings.filter((f) => f.has_replacement_char).length,
    };
    const worst = [...findings].sort((a, b) => a.cosine - b.cosine).slice(0, 10);

    let verdict: string;
    if (stats.dim_mismatches > 0) verdict = "FAIL — Dimensions-Mismatch gefunden";
    else if (stats.median >= 0.999 && stats.below_0_95 === 0)
      verdict = "PASS — gespeicherte Vektoren stimmen mit Modell+Text überein";
    else if (stats.median >= 0.99 && stats.below_0_90 === 0)
      verdict = "PASS mit Abweichlern — Einzelfälle prüfen (siehe worst)";
    else if (stats.median >= 0.95)
      verdict = "WARN — systematische Abweichung, Ursache klären (Kontext-Prefix? Modell?)";
    else verdict = "FAIL — gespeicherte Vektoren passen nicht zu Modell+Text";

    const report = {
      generated_at: new Date().toISOString(),
      model: "openai/text-embedding-3-small",
      stats,
      verdict,
      worst,
    };
    const outPath = join(SCRIPT_DIR, "embedding-integrity-report.json");
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.stderr.write(`[verify] Report: ${outPath}\n`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  process.stderr.write(`[verify] FEHLER: ${err?.message ?? err}\n`);
  process.exit(1);
});
