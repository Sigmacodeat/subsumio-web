#!/usr/bin/env bun
/**
 * eval-pending-batch — batch evaluation of draft gold questions.
 *
 *   bun run server/scripts/eval-pending-batch.ts
 *
 * Loads the 16 reviewed gold questions from corpus.ts + each 25-question batch
 * from pending-review.ts, seeds a fresh PGLiteEngine, runs runRetrievalQuality
 * + jurisdiction purity per batch, and appends results to METRICS.md.
 *
 * No API key — uses keyword-only hybrid search (same as the existing test).
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { hybridSearch } from "../src/core/search/hybrid.ts";
import { runRetrievalQuality, type SearchFn, type NamedThingQuestion } from "../src/eval/retrieval-quality/harness.ts";
import { splitStatute } from "../src/core/legal/split-statute.ts";
import type { BrainEngine } from "../src/core/engine.ts";
import type { ChunkInput } from "../src/core/types.ts";

const REPO = join(import.meta.dir, "..", "..");
const CORPUS = join(REPO, "law-corpus");
const METRICS_FILE = join(REPO, "server", "test", "fixtures", "retrieval-quality", "legal-at", "METRICS.md");

// ── Types ────────────────────────────────────────────────────────────────────

interface Ref {
  jur: "at" | "de";
  file: string;
  abbr: string;
  ref: string;
}

interface DraftEntry {
  query: string;
  family: NamedThingQuestion["family"];
  at: Ref;
  de?: Ref;
  domain: string;
  status: "draft" | "reviewed";
  reviewed_by?: string;
  reviewed_at?: string;
}

// ── Import reviewed gold set + pending drafts ────────────────────────────────

// We import from the test fixtures directly
const { LEGAL_AT_GOLD, seedLegalAtCorpus } = await import(
  "../test/fixtures/retrieval-quality/legal-at/corpus.ts"
);
const { LEGAL_AT_PENDING } = await import(
  "../test/fixtures/retrieval-quality/legal-at/pending-review.ts"
);

// ── Helpers ──────────────────────────────────────────────────────────────────

const slugOf = (r: Ref) => `legal/statutes/${r.jur}/${r.abbr}/p-${r.ref}`;

const splitCache = new Map<string, ReturnType<typeof splitStatute>>();

function sectionBody(r: Ref): string {
  let split = splitCache.get(r.file);
  if (!split) {
    split = splitStatute(readFileSync(join(CORPUS, r.file), "utf8"));
    splitCache.set(r.file, split);
  }
  // Find first substantive section (B-VG has duplicate refs with metadata stubs)
  const sec = split.sections.find((s) => {
    if (s.ref !== r.ref && s.id !== `p-${r.ref}`) return false;
    const body = s.body.trim();
    if (body.length < 50) return false;
    if (/^## Inkrafttretensdatum\s+\d/.test(body) && body.length < 200) return false;
    return true;
  });
  if (!sec) {
    throw new Error(
      `legal-at gold set drift: ${r.file} has no substantive § ${r.ref} after split.`
    );
  }
  return `${sec.marker} ${sec.ref} ${sec.title}\n${sec.body}`.trim();
}

/** Seed additional refs (from pending batch) into the engine. */
async function seedRefs(engine: BrainEngine, refs: Ref[]): Promise<void> {
  const seen = new Set<string>();
  for (const r of refs) {
    const slug = slugOf(r);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const sourceId = `law-${r.jur}`;
    const body = sectionBody(r);
    await engine.putPage(slug, {
      type: "law" as never,
      title: slug,
      compiled_truth: body,
      timeline: "",
      frontmatter: { jurisdiction: r.jur, abbreviation: r.abbr, paragraph: r.ref },
    }, { sourceId });
    await engine.upsertChunks(slug, [
      {
        chunk_index: 0,
        chunk_text: body,
        chunk_source: "compiled_truth",
        token_count: body.split(/\s+/).length,
      },
    ] satisfies ChunkInput[], { sourceId });
  }
}

/** Build NamedThingQuestion[] from draft entries. */
function toQuestions(entries: DraftEntry[]): NamedThingQuestion[] {
  return entries.map((e) => ({
    family: e.family,
    query: e.query,
    relevant: [slugOf(e.at)],
  }));
}

/** Measure jurisdiction purity for a set of entries. */
async function measurePurity(
  eng: PGLiteEngine,
  entries: DraftEntry[],
  jurisdiction?: string,
): Promise<{ leaks: string[]; total: number }> {
  const leaks: string[] = [];
  for (const e of entries) {
    const results = await hybridSearch(eng, e.query, { limit: 10, expansion: false, jurisdiction });
    const foreign = results
      .map((r) => r.slug)
      .filter((s) => s.startsWith("legal/statutes/") && !s.startsWith("legal/statutes/at/"));
    if (foreign.length > 0) leaks.push(`"${e.query}" → ${foreign.join(", ")}`);
  }
  return { leaks, total: entries.length };
}

/** Compute overall metrics from QuestionResult[]. */
function overall(qs: Array<{ hit_at_1: boolean; hit_at_3: boolean; reciprocal_rank: number }>) {
  const n = qs.length || 1;
  return {
    hit1: qs.filter((q) => q.hit_at_1).length / n,
    hit3: qs.filter((q) => q.hit_at_3).length / n,
    mrr: qs.reduce((s, q) => s + q.reciprocal_rank, 0) / n,
  };
}

// ── Batch evaluation ─────────────────────────────────────────────────────────

const BATCH_SIZE = 25;
const allEntries = LEGAL_AT_PENDING as DraftEntry[];

// Group by domain for per-domain metrics
const byDomain = new Map<string, DraftEntry[]>();
for (const e of allEntries) {
  const list = byDomain.get(e.domain) ?? [];
  list.push(e);
  byDomain.set(e.domain, list);
}

// Create batches of 25 (preserving domain grouping for readability)
const batches: DraftEntry[][] = [];
let currentBatch: DraftEntry[] = [];
for (const [, entries] of byDomain) {
  for (const e of entries) {
    currentBatch.push(e);
    if (currentBatch.length >= BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }
}
if (currentBatch.length > 0) batches.push(currentBatch);

// eslint-disable-next-line no-console
console.log(`\nEvaluating ${allEntries.length} draft questions in ${batches.length} batches of ≤${BATCH_SIZE}\n`);

const metricsLines: string[] = [];
metricsLines.push(`# AT Legal Retrieval — Draft Question Metrics`);
metricsLines.push("");
metricsLines.push(`Generated: ${new Date().toISOString()}`);
metricsLines.push(`Total draft questions: ${allEntries.length}`);
metricsLines.push(`Batch size: ${BATCH_SIZE}`);
metricsLines.push("");
metricsLines.push(`## Per-Batch Metrics (jurisdiction=at)`);
metricsLines.push("");
metricsLines.push(
  `> Haystack: ONLY this batch's target §§ + distractors (small corpus → ` +
    `optimistic). The Per-Domain Summary below seeds ALL entries into one ` +
    `engine — the harder, more realistic number. Quote the Per-Domain values.`
);
metricsLines.push("");
metricsLines.push(`| Batch | Domain | n | hit@1 | hit@3 | MRR | Purity |`);
metricsLines.push(`|-------|--------|---|-------|-------|-----|--------|`);

for (let bi = 0; bi < batches.length; bi++) {
  const batch = batches[bi];
  const domains = [...new Set(batch.map((e) => e.domain))].join(", ");

  // eslint-disable-next-line no-console
  console.log(`Batch ${bi + 1}/${batches.length}: ${batch.length} questions (${domains})`);

  // Fresh engine per batch
  const eng = new PGLiteEngine();
  await eng.connect({});
  await eng.initSchema();

  // Seed reviewed gold (corpus.ts) + current batch
  await seedLegalAtCorpus(eng);

  // Collect refs from batch entries
  const batchRefs: Ref[] = [];
  for (const e of batch) {
    batchRefs.push(e.at);
    if (e.de) batchRefs.push(e.de);
  }
  await seedRefs(eng, batchRefs);

  // Run retrieval quality
  const questions = toQuestions(batch);
  const searchFn: SearchFn = async (q) => {
    const results = await hybridSearch(eng, q, { limit: 10, expansion: false, jurisdiction: "at" });
    return results.map((r) => r.slug);
  };
  const report = await runRetrievalQuality(questions, searchFn);
  const o = overall(report.questions);

  // Measure purity
  const purity = await measurePurity(eng, batch, "at");
  const pureRate = (purity.total - purity.leaks.length) / purity.total;

  // eslint-disable-next-line no-console
  console.log(`  hit@1: ${(o.hit1 * 100).toFixed(1)}%, hit@3: ${(o.hit3 * 100).toFixed(1)}%, MRR: ${o.mrr.toFixed(3)}, purity: ${(pureRate * 100).toFixed(1)}%`);

  metricsLines.push(`| ${bi + 1} | ${domains} | ${batch.length} | ${(o.hit1 * 100).toFixed(1)}% | ${(o.hit3 * 100).toFixed(1)}% | ${o.mrr.toFixed(3)} | ${(pureRate * 100).toFixed(1)}% |`);

  // Per-domain breakdown within batch
  const batchByDomain = new Map<string, typeof report.questions>();
  for (let i = 0; i < report.questions.length; i++) {
    const domain = batch[i].domain;
    const list = batchByDomain.get(domain) ?? [];
    list.push(report.questions[i]);
    batchByDomain.set(domain, list);
  }

  await eng.disconnect();
}

// ── Per-domain summary ───────────────────────────────────────────────────────

metricsLines.push("");
metricsLines.push(`## Per-Domain Summary`);
metricsLines.push("");
metricsLines.push(
  `> Haystack: all ${allEntries.length} draft + reviewed gold refs in one ` +
    `engine — the citable baseline.`
);
metricsLines.push("");
metricsLines.push(`| Domain | n | hit@1 | hit@3 | MRR |`);
metricsLines.push(`|--------|---|-------|-------|-----|`);

// Re-run per domain (single engine with all entries for completeness)
{
  const eng = new PGLiteEngine();
  await eng.connect({});
  await eng.initSchema();
  await seedLegalAtCorpus(eng);

  const allRefs: Ref[] = [];
  for (const e of allEntries) {
    allRefs.push(e.at);
    if (e.de) allRefs.push(e.de);
  }
  await seedRefs(eng, allRefs);

  for (const [domain, entries] of byDomain) {
    const questions = toQuestions(entries);
    const searchFn: SearchFn = async (q) => {
      const results = await hybridSearch(eng, q, { limit: 10, expansion: false, jurisdiction: "at" });
      return results.map((r) => r.slug);
    };
    const report = await runRetrievalQuality(questions, searchFn);
    const o = overall(report.questions);
    // eslint-disable-next-line no-console
    console.log(`  ${domain}: n=${entries.length}, hit@1=${(o.hit1 * 100).toFixed(1)}%, hit@3=${(o.hit3 * 100).toFixed(1)}%, MRR=${o.mrr.toFixed(3)}`);
    metricsLines.push(`| ${domain} | ${entries.length} | ${(o.hit1 * 100).toFixed(1)}% | ${(o.hit3 * 100).toFixed(1)}% | ${o.mrr.toFixed(3)} |`);
  }

  // Overall purity
  const purity = await measurePurity(eng, allEntries, "at");
  const pureRate = (purity.total - purity.leaks.length) / purity.total;
  metricsLines.push("");
  metricsLines.push(`## Overall Jurisdiction Purity (jurisdiction=at)`);
  metricsLines.push("");
  metricsLines.push(`- Total questions: ${allEntries.length}`);
  metricsLines.push(`- Leaks: ${purity.leaks.length}`);
  metricsLines.push(`- Purity: ${(pureRate * 100).toFixed(1)}%`);
  if (purity.leaks.length > 0) {
    metricsLines.push("");
    metricsLines.push(`### Leaked queries:`);
    for (const leak of purity.leaks) {
      metricsLines.push(`- ${leak}`);
    }
  }

  await eng.disconnect();
}

// ── Write METRICS.md ─────────────────────────────────────────────────────────

metricsLines.push("");
writeFileSync(METRICS_FILE, metricsLines.join("\n"), "utf8");
// eslint-disable-next-line no-console
console.log(`\nMetrics written to: ${METRICS_FILE}\n`);
