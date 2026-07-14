/**
 * Phase 0 — Cross-jurisdiction leak probe (hermetic PGLite; keyword path, no
 * API key needed).
 *
 * WHY: requirement #1 for the AT lawyer brain is "an Austrian query must never
 * surface a German (or Swiss) statute." Austrian and German legal German is
 * lexically near-identical ("Verjährung", "Kündigung", "Schadenersatz"), so a
 * pure semantic/keyword retriever WILL pull the wrong jurisdiction's §§ when
 * both live in reach. This probe seeds AT + DE statutes into their canonical
 * sources, then searches federated across both to prove the jurisdiction
 * filter remains the final defense even when both countries are reachable.
 *
 * This file is the BASELINE instrument. The `BASELINE` test runs green and
 * prints the leak number ("X of N AT queries leaked a DE statute"). The
 * `Phase 1` test is a `test.todo` placeholder: when the hard jurisdiction
 * filter lands (HybridSearchOpts.jurisdiction → slug LIKE 'legal/statutes/
 * <jur>/%'), it becomes a real assertion that leakage is exactly zero.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../../src/core/pglite-engine.ts";
import { hybridSearch } from "../../src/core/search/hybrid.ts";
import { dispatchToolCall } from "../../src/mcp/dispatch.ts";
import type { ChunkInput } from "../../src/core/types.ts";

let eng: PGLiteEngine;

// ── deterministic embedding sized to the live column (mirrors the relational
// fixture). All distinct so vector search is well-defined; keyword FTS drives
// the ranking that actually matters for this probe. ──────────────────────
function basisEmbedding(slug: string, dim: number): Float32Array {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const e = new Float32Array(dim);
  e[h % dim] = 1.0;
  return e;
}

async function probeDim(engine: PGLiteEngine): Promise<number> {
  const db = (engine as unknown as { db: { query: (s: string) => Promise<{ rows: Array<{ atttypmod: number }> }> } }).db;
  const r = await db.query(
    `SELECT atttypmod FROM pg_attribute
       WHERE attrelid = 'content_chunks'::regclass AND attname = 'embedding'`
  );
  return r.rows[0].atttypmod;
}

/**
 * Paired AT/DE statute sections on the SAME legal topic. Bodies use the shared
 * legal-German vocabulary so keyword retrieval cannot tell them apart by text
 * alone — only the jurisdiction in the slug distinguishes them.
 */
// Each query's key terms appear VERBATIM (as standalone, identically-stemmed
// words) in BOTH the AT and the DE body, so keyword FTS matches both and the
// only thing distinguishing them is the jurisdiction in the slug.
const PAIRS: Array<{ topic: string; query: string; at: { slug: string; body: string }; de: { slug: string; body: string } }> = [
  {
    topic: "Verjährung",
    query: "Verjährung drei Jahren",
    at: {
      slug: "legal/statutes/at/abgb/p-1489",
      body: "Verjährung. Der Anspruch verjährt in drei Jahren ab Kenntnis; die Verjährung endet spätestens nach dreißig Jahren.",
    },
    de: {
      slug: "legal/statutes/de/bgb/p-195",
      body: "Verjährung. Der Anspruch verjährt in drei Jahren ab Kenntnis; die Verjährung beginnt mit dem Schluss des Jahres.",
    },
  },
  {
    topic: "Kündigung Mietvertrag",
    query: "Kündigung Mietvertrag Vermieter",
    at: {
      slug: "legal/statutes/at/mrg/p-30",
      body: "Kündigung. Der Vermieter darf den Mietvertrag nur aus wichtigen Gründen kündigen; die Kündigung bedarf der gesetzlichen Frist.",
    },
    de: {
      slug: "legal/statutes/de/bgb/p-573",
      body: "Kündigung. Der Vermieter darf den Mietvertrag nur bei berechtigtem Interesse kündigen; die Kündigung bedarf der gesetzlichen Frist.",
    },
  },
  {
    topic: "Gewährleistung Mängel",
    query: "Gewährleistung Mängel Sache",
    at: {
      slug: "legal/statutes/at/abgb/p-922",
      body: "Gewährleistung. Wer eine Sache überlässt, leistet Gewährleistung für Mängel; die Sache muss die bedungenen Eigenschaften haben.",
    },
    de: {
      slug: "legal/statutes/de/bgb/p-434",
      body: "Gewährleistung. Wer eine Sache verkauft, leistet Gewährleistung für Mängel; die Sache muss die vereinbarte Beschaffenheit haben.",
    },
  },
  {
    topic: "GmbH Stammkapital",
    query: "Stammkapital Stammeinlage Gesellschaftsvertrag",
    at: {
      slug: "legal/statutes/at/gmbhg/p-6",
      body: "Stammkapital. Das Stammkapital und die Stammeinlage der Gesellschafter werden im Gesellschaftsvertrag festgesetzt.",
    },
    de: {
      slug: "legal/statutes/de/gmbhg/p-5",
      body: "Stammkapital. Das Stammkapital und die Stammeinlage der Gesellschafter werden im Gesellschaftsvertrag bestimmt.",
    },
  },
  {
    topic: "Rücktritt Verzug",
    query: "Rücktritt Vertrag Verzug",
    at: {
      slug: "legal/statutes/at/abgb/p-918",
      body: "Rücktritt. Bei Verzug kann der andere Teil unter Nachfrist vom Vertrag den Rücktritt erklären.",
    },
    de: {
      slug: "legal/statutes/de/bgb/p-323",
      body: "Rücktritt. Bei Verzug kann der Gläubiger unter Nachfrist vom Vertrag den Rücktritt erklären.",
    },
  },
  {
    topic: "Insolvenz Zahlungsunfähigkeit",
    query: "Insolvenzverfahren Zahlungsunfähigkeit Eröffnung",
    at: {
      slug: "legal/statutes/at/io/p-66",
      body: "Insolvenzverfahren. Das Insolvenzverfahren wird bei Zahlungsunfähigkeit eröffnet; die Zahlungsunfähigkeit ist Grund der Eröffnung.",
    },
    de: {
      slug: "legal/statutes/de/inso/p-17",
      body: "Insolvenzverfahren. Das Insolvenzverfahren wird bei Zahlungsunfähigkeit eröffnet; die Zahlungsunfähigkeit ist Grund der Eröffnung.",
    },
  },
];

// AT-classic questions. Each query's terms appear in both jurisdictions'
// bodies → a DE statute in the top-K is a pure jurisdiction leak.
const AT_QUERIES = PAIRS.map((p) => p.query);

beforeAll(async () => {
  eng = new PGLiteEngine();
  await eng.connect({});
  await eng.initSchema();
  await eng.executeRaw(
    `INSERT INTO sources (id, name, jurisdiction, config) VALUES
       ('law-at', 'law-at', 'at', '{"federated":true,"legal_reference":true}'::jsonb),
       ('law-de', 'law-de', 'de', '{"federated":true,"legal_reference":true}'::jsonb)
     ON CONFLICT (id) DO NOTHING`
  );
  const dim = await probeDim(eng);
  for (const p of PAIRS) {
    for (const s of [p.at, p.de]) {
      const sourceId = s.slug.startsWith("legal/statutes/at/") ? "law-at" : "law-de";
      await eng.putPage(s.slug, {
        type: "law" as never,
        title: s.slug.split("/").slice(-2).join(" "),
        compiled_truth: s.body,
        timeline: "",
      }, { sourceId });
      await eng.upsertChunks(s.slug, [
        {
          chunk_index: 0,
          chunk_text: s.body,
          chunk_source: "compiled_truth",
          embedding: basisEmbedding(s.slug, dim),
          token_count: s.body.split(/\s+/).length,
        },
      ] satisfies ChunkInput[], { sourceId });
    }
  }
}, 60_000);

afterAll(async () => {
  await eng.disconnect();
});

function jurisdictionOf(slug: string): string | null {
  const m = /^legal\/statutes\/([a-z]{2})\//.exec(slug);
  return m ? m[1] : null;
}

/** Run every AT query, return which ones surfaced a non-AT statute in top-10. */
async function measureLeak(
  jurisdiction?: string
): Promise<{ leaking: string[]; total: number; details: string[] }> {
  const leaking: string[] = [];
  const details: string[] = [];
  for (const q of AT_QUERIES) {
    const results = await hybridSearch(eng, q, { limit: 10, expansion: false, jurisdiction });
    const statutes = results.map((r) => r.slug).filter((s) => s.startsWith("legal/statutes/"));
    const foreign = statutes.filter((s) => jurisdictionOf(s) !== "at");
    if (foreign.length > 0) {
      leaking.push(q);
      details.push(`  "${q}" → leaked ${foreign.join(", ")}`);
    }
  }
  return { leaking, total: AT_QUERIES.length, details };
}

describe("jurisdiction isolation (Phase 0 leak probe)", () => {
  test("probe has teeth: AT queries return statute results at all", async () => {
    const results = await hybridSearch(eng, AT_QUERIES[0], { limit: 10, expansion: false });
    const statutes = results.filter((r) => r.slug.startsWith("legal/statutes/"));
    expect(statutes.length).toBeGreaterThan(0);
  }, 30_000);

  test("BASELINE: measure cross-jurisdiction leak (AT query → DE statute)", async () => {
    const { leaking, total, details } = await measureLeak();
    // eslint-disable-next-line no-console
    console.log(
      `\n[Phase0 leak baseline] ${leaking.length}/${total} AT queries leaked a foreign-jurisdiction statute` +
        (details.length ? `\n${details.join("\n")}` : "") +
        `\n  → Phase 1 (hard jurisdiction filter) drives this to 0/${total}.\n`
    );
    // Baseline is a measurement, not a gate: assert only that the probe ran
    // over the full query set. The number above is the deliverable.
    expect(total).toBe(AT_QUERIES.length);
  }, 60_000);

  test("Phase 1: with jurisdiction=at, zero AT queries surface a DE/CH statute (hard isolation)", async () => {
    const { leaking, details } = await measureLeak("at");
    expect(leaking, `hard isolation breached:\n${details.join("\n")}`).toEqual([]);
  }, 60_000);

  test("Phase 1: jurisdiction=at still returns the correct AT statutes (no over-filtering)", async () => {
    // The filter must remove foreign §§ WITHOUT starving the AT answer: every
    // query must still surface at least one at-statute.
    const misses: string[] = [];
    for (const q of AT_QUERIES) {
      const results = await hybridSearch(eng, q, { limit: 10, expansion: false, jurisdiction: "at" });
      const atHits = results.filter(
        (r) => r.slug.startsWith("legal/statutes/at/")
      );
      if (atHits.length === 0) misses.push(q);
    }
    expect(misses, `queries with no AT statute after filtering: ${misses.join(", ")}`).toEqual([]);
  }, 60_000);

  test("Phase 1: config default `legal.jurisdiction=at` filters EVERY query — even a remote MCP call with no jurisdiction param", async () => {
    // The strongest guarantee for an Austrian firm: set it once on the brain,
    // and every caller (including a remote MCP agent that never passes
    // jurisdiction) is hard-isolated. Drives the full dispatch pipeline.
    await eng.setConfig("legal.jurisdiction", "at");
    try {
      const leaks: string[] = [];
      for (const q of AT_QUERIES) {
        const res = await dispatchToolCall(eng, "query", { query: q, limit: 10 }, { remote: true });
        expect(res.isError).toBeFalsy();
        const rows = JSON.parse(res.content[0].text) as Array<{ slug: string }>;
        const foreign = rows
          .map((r) => r.slug)
          .filter((s) => s.startsWith("legal/statutes/") && jurisdictionOf(s) !== "at");
        if (foreign.length > 0) leaks.push(`"${q}" → ${foreign.join(", ")}`);
      }
      expect(leaks, `config-default isolation breached:\n${leaks.join("\n")}`).toEqual([]);
    } finally {
      await eng.unsetConfig("legal.jurisdiction");
    }
  }, 60_000);

  test("Phase 1: the `search` op honors the jurisdiction param too (both retrieval surfaces isolated)", async () => {
    // Defense-in-depth: `query` and `search` are separate ops with separate
    // handlers. Both must isolate, so a caller can't reach foreign statutes
    // through the other door.
    const leaks: string[] = [];
    for (const q of AT_QUERIES) {
      const res = await dispatchToolCall(
        eng,
        "search",
        { query: q, limit: 10, jurisdiction: "at" },
        { remote: true }
      );
      expect(res.isError).toBeFalsy();
      const rows = JSON.parse(res.content[0].text) as Array<{ slug: string }>;
      const foreign = rows
        .map((r) => r.slug)
        .filter((s) => s.startsWith("legal/statutes/") && jurisdictionOf(s) !== "at");
      if (foreign.length > 0) leaks.push(`"${q}" → ${foreign.join(", ")}`);
    }
    expect(leaks, `search-op isolation breached:\n${leaks.join("\n")}`).toEqual([]);
  }, 60_000);

  test("Phase 1b: DE query excludes AT judikatur / landesrecht / staatsvertraege — not just statutes", async () => {
    // 2026-07-14 audit finding: foreignStatutePrefixes() only covered
    // legal/statutes/, so a DE-jurisdiction query could surface AT case law,
    // AT state law, and AT treaties. Seed one page per non-statute content
    // class whose body matches a shared legal-German query, then prove a
    // jurisdiction=de search returns none of them.
    await eng.executeRaw(
      `INSERT INTO sources (id, name, jurisdiction, config) VALUES
         ('law-at-judikatur', 'law-at-judikatur', 'at', '{"federated":true,"legal_reference":true}'::jsonb),
         ('law-at-landesrecht', 'law-at-landesrecht', 'at', '{"federated":true,"legal_reference":true}'::jsonb),
         ('law-at-staatsvertraege', 'law-at-staatsvertraege', 'at', '{"federated":true,"legal_reference":true}'::jsonb)
       ON CONFLICT (id) DO NOTHING`
    );
    const dim = await probeDim(eng);
    const QUERY = "Verjährung Schadenersatz drei Jahren";
    const body =
      "Die Verjährung des Anspruchs auf Schadenersatz beträgt drei Jahre ab Kenntnis von Schaden und Schädiger.";
    const atNonStatute = [
      { slug: "legal/judikatur/at/ogh/2ob123-24x", sourceId: "law-at-judikatur" },
      { slug: "legal/landesrecht/at/wien/bauordnung-testfall", sourceId: "law-at-landesrecht" },
      { slug: "legal/staatsvertraege/at/testabkommen-verjaehrung", sourceId: "law-at-staatsvertraege" },
    ];
    for (const p of atNonStatute) {
      await eng.putPage(p.slug, {
        type: "law" as never,
        title: p.slug.split("/").slice(-1).join(" "),
        compiled_truth: body,
        timeline: "",
      }, { sourceId: p.sourceId });
      await eng.upsertChunks(p.slug, [
        {
          chunk_index: 0,
          chunk_text: body,
          chunk_source: "compiled_truth",
          embedding: basisEmbedding(p.slug, dim),
          token_count: body.split(/\s+/).length,
        },
      ] satisfies ChunkInput[], { sourceId: p.sourceId });
    }

    // Probe has teeth: WITHOUT a jurisdiction filter the seeded AT pages are
    // reachable for this query (otherwise the assertion below proves nothing).
    const unfiltered = await hybridSearch(eng, QUERY, { limit: 20, expansion: false });
    const reachable = unfiltered.filter((r) =>
      atNonStatute.some((p) => r.slug === p.slug)
    );
    expect(reachable.length).toBeGreaterThan(0);

    // The actual guarantee: jurisdiction=de must exclude EVERY AT legal
    // content class, not only legal/statutes/at/.
    const filtered = await hybridSearch(eng, QUERY, { limit: 20, expansion: false, jurisdiction: "de" });
    const leakedAt = filtered
      .map((r) => r.slug)
      .filter((s) => /^legal\/(statutes|judikatur|landesrecht|staatsvertraege)\/at\//.test(s));
    expect(leakedAt, `DE query surfaced AT legal content: ${leakedAt.join(", ")}`).toEqual([]);
  }, 60_000);
});
