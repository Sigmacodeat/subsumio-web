/**
 * Legal-AT retrieval-quality gold set (Phase 2).
 *
 * The measurable "as good as Harvey" anchor for Austrian statute retrieval.
 * Every (query → §) pair below is VERIFIED against the real law-corpus: the
 * cited section exists after splitStatute and its body IS that provision (a
 * gold set with wrong ground truth is worse than none, so the seeder throws if
 * a cited § is missing — the corpus and the gold set can never silently drift).
 *
 * Each Austrian gold answer is paired with the German provision on the SAME
 * legal topic (near-identical legal German), seeded into the SAME brain, so the
 * eval measures two things at once:
 *   1. RETRIEVAL QUALITY — does the correct AT § rank at the top?
 *      (hit@1 / hit@3 / MRR / recall@3 via the shared harness)
 *   2. JURISDICTION PURITY — with jurisdiction=at, does the paired DE § stay
 *      out of the results entirely? (the hard-isolation guarantee, measured)
 *
 * Curated seed set (~13 Q). A practising Austrian lawyer extends it; the
 * seeder's existence check keeps every addition honest.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { splitStatute } from "../../../../src/core/legal/split-statute.ts";
import type { BrainEngine } from "../../../../src/core/engine.ts";
import type { ChunkInput } from "../../../../src/core/types.ts";
import type { NamedThingQuestion } from "../../../../src/eval/retrieval-quality/harness.ts";

const CORPUS = join(import.meta.dir, "..", "..", "..", "..", "..", "law-corpus");

/** A statute reference resolvable to a real corpus §. */
interface Ref {
  jur: "at" | "de";
  file: string; // relative to law-corpus/
  abbr: string; // slug segment (matches import-statutes-split.ts registry)
  ref: string; // printed § number, e.g. "1489"
}

const slugOf = (r: Ref) => `legal/statutes/${r.jur}/${r.abbr}/p-${r.ref}`;

/**
 * The gold set. `at` is the correct answer; `de` is the same-topic German
 * provision that must be hard-excluded under jurisdiction=at (the leak bait).
 */
interface GoldEntry {
  query: string;
  family: NamedThingQuestion["family"];
  at: Ref;
  de?: Ref;
}

const A = (file: string, abbr: string, ref: string): Ref => ({ jur: "at", file, abbr, ref });
const D = (file: string, abbr: string, ref: string): Ref => ({ jur: "de", file, abbr, ref });

export const LEGAL_AT_GOLD: GoldEntry[] = [
  // ── Civil law (ABGB) ────────────────────────────────────────────────
  {
    query: "Verjährung von Schadenersatzansprüchen Frist drei Jahre",
    family: "generic-to-named",
    at: A("at/abgb.md", "abgb", "1489"),
    de: D("de/bgb.md", "bgb", "195"),
  },
  {
    query: "Gewährleistung für Mängel einer Kaufsache",
    family: "generic-to-named",
    at: A("at/abgb.md", "abgb", "922"),
    de: D("de/bgb.md", "bgb", "434"),
  },
  {
    query: "Rücktritt vom Vertrag bei Verzug nach Nachfrist",
    family: "generic-to-named",
    at: A("at/abgb.md", "abgb", "918"),
    de: D("de/bgb.md", "bgb", "323"),
  },
  {
    query: "Schadenersatz Verschulden Recht auf Ersatz des Schadens",
    family: "generic-to-named",
    at: A("at/abgb.md", "abgb", "1295"),
    de: D("de/bgb.md", "bgb", "823"),
  },
  {
    query: "Kaufvertrag Sache gegen bestimmten Preis",
    family: "generic-to-named",
    at: A("at/abgb.md", "abgb", "1053"),
    de: D("de/bgb.md", "bgb", "433"),
  },
  {
    query: "Auslegung von Verträgen wahre Absicht der Parteien",
    family: "generic-to-named",
    at: A("at/abgb.md", "abgb", "914"),
  },
  // ── Tenancy (MRG) ───────────────────────────────────────────────────
  {
    query: "Kündigung des Mietvertrags durch den Vermieter aus wichtigen Gründen",
    family: "generic-to-named",
    at: A("at/mrg.md", "mrg", "30"),
    de: D("de/bgb.md", "bgb", "573"),
  },
  // ── Corporate (GmbHG) ───────────────────────────────────────────────
  {
    query: "Höhe des Stammkapitals einer GmbH",
    family: "generic-to-named",
    at: A("at/gmbhg-at.md", "gmbhg", "6"),
    de: D("de/gmbhg.md", "gmbhg", "5"),
  },
  // ── Insolvency (IO) ─────────────────────────────────────────────────
  {
    query: "Eröffnung des Insolvenzverfahrens bei Zahlungsunfähigkeit",
    family: "generic-to-named",
    at: A("at/io.md", "io", "66"),
    de: D("de/inso.md", "inso", "17"),
  },
  // ── Criminal (StGB) ─────────────────────────────────────────────────
  {
    query: "Diebstahl fremde bewegliche Sache mit Bereicherungsvorsatz",
    family: "generic-to-named",
    at: A("at/stgb-at.md", "stgb", "127"),
    de: D("de/stgb.md", "stgb", "242"),
  },
  {
    query: "Mord vorsätzliche Tötung eines Menschen Strafe",
    family: "generic-to-named",
    at: A("at/stgb-at.md", "stgb", "75"),
    de: D("de/stgb.md", "stgb", "211"),
  },
  // ── Direct § lookup (title-substring family) ────────────────────────
  {
    query: "§ 1489 ABGB Verjährung",
    family: "title-substring",
    at: A("at/abgb.md", "abgb", "1489"),
  },
  {
    query: "§ 30 MRG Kündigung",
    family: "title-substring",
    at: A("at/mrg.md", "mrg", "30"),
  },
];

/** Harness questions: correct AT § is the sole relevant slug. */
export const LEGAL_AT_QUESTIONS: NamedThingQuestion[] = LEGAL_AT_GOLD.map((g) => ({
  family: g.family,
  query: g.query,
  relevant: [slugOf(g.at)],
}));

/** Every AT gold slug + every DE distractor slug, deduped, for purity checks. */
export function goldSlugs(): { at: string[]; de: string[] } {
  const at = new Set<string>();
  const de = new Set<string>();
  for (const g of LEGAL_AT_GOLD) {
    at.add(slugOf(g.at));
    if (g.de) de.add(slugOf(g.de));
  }
  return { at: [...at], de: [...de] };
}

// ── seeding ─────────────────────────────────────────────────────────

const splitCache = new Map<string, ReturnType<typeof splitStatute>>();
function sectionBody(r: Ref): string {
  let split = splitCache.get(r.file);
  if (!split) {
    split = splitStatute(readFileSync(join(CORPUS, r.file), "utf8"));
    splitCache.set(r.file, split);
  }
  const sec = split.sections.find((s) => s.ref === r.ref || s.id === `p-${r.ref}`);
  if (!sec) {
    throw new Error(
      `legal-at gold set drift: ${r.file} has no § ${r.ref} after split. ` +
        `Fix the corpus or the gold reference — a gold answer must exist.`
    );
  }
  // Prefix the § marker so the body is self-identifying for keyword search.
  return `${sec.marker} ${sec.ref} ${sec.title}\n${sec.body}`.trim();
}

/**
 * Seed the real AT gold §§ + their DE same-topic distractors into a fresh
 * brain, with real statute bodies + one chunk each. Throws if any cited § is
 * missing from the corpus (keeps ground truth honest).
 */
export async function seedLegalAtCorpus(engine: BrainEngine): Promise<void> {
  for (const jurisdiction of ["at", "de"] as const) {
    const sourceId = `law-${jurisdiction}`;
    await engine.executeRaw(
      `INSERT INTO sources (id, name, jurisdiction, config)
       VALUES ($1, $1, $2, $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET jurisdiction = EXCLUDED.jurisdiction`,
      [sourceId, jurisdiction, JSON.stringify({ federated: true, legal_corpus: true })]
    );
  }
  const seen = new Set<string>();
  const refs: Ref[] = [];
  for (const g of LEGAL_AT_GOLD) {
    for (const r of [g.at, g.de]) {
      if (!r) continue;
      const slug = slugOf(r);
      if (seen.has(slug)) continue;
      seen.add(slug);
      refs.push(r);
    }
  }
  for (const r of refs) {
    const slug = slugOf(r);
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
