/**
 * Legal-AT Judikatur retrieval-quality gold set.
 *
 * 20 OGH decision retrieval questions, each verified against the real
 * law-corpus/at-judikatur/ files. The seeder reads the actual markdown
 * files and throws if any cited decision is missing — ground truth can
 * never silently drift.
 *
 * Each question is a natural-language query that should retrieve the
 * correct OGH decision slug. Questions cover Zivilrecht, Strafrecht,
 * Zivilverfahren, Exekution, Mietrecht, Konsumentenschutz, Arbeitsrecht,
 * Gesellschaftsrecht.
 *
 * Purity: all results must be from jurisdiction=at (no DE statutes leaking).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrainEngine } from "../../../../src/core/engine.ts";
import type { ChunkInput } from "../../../../src/core/types.ts";
import type { NamedThingQuestion } from "../../../../src/eval/retrieval-quality/harness.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, "..", "..", "..", "..", "law-corpus", "at-judikatur");

/** A judikatur file reference. */
interface JudgementRef {
  file: string; // filename without .md
  gz: string; // Geschäftszahl (case number)
}

const slugOf = (r: JudgementRef) => `legal/judikatur/at/${r.file}`;

/**
 * The gold set: 20 OGH retrieval questions.
 * Each query is natural language describing the legal topic of the decision.
 * The expected slug is the OGH decision that addresses that topic.
 */
interface JudikaturGoldEntry {
  query: string;
  ref: JudgementRef;
  legal_area: string;
}

export const JUDIKATUR_GOLD: JudikaturGoldEntry[] = [
  // ── Zivilrecht / ABGB ──────────────────────────────────────────────
  {
    query: "OGH Entscheidung ABGB §36 Vertragsrecht deutsche Rechtsbestimmungen sachenrechtlich",
    ref: { file: "1979-06-12-6ob154-61", gz: "6Ob154/61" },
    legal_area: "zivilrecht",
  },
  {
    query: "OGH Erbvertrag Willensmängel Anfechtung ABGB §1249 §1254",
    ref: { file: "1986-04-24-6ob657-85", gz: "6Ob657/85" },
    legal_area: "zivilrecht",
  },
  {
    query: "OGH Eigentum ABGB Schadensersatz",
    ref: { file: "1995-05-24-4ob149-61", gz: "4Ob149/61" },
    legal_area: "zivilrecht",
  },
  {
    query: "OGH Schadensersatz ABGB §1158 §1162 Arbeitgeber gefälschtes Kündigungsschreiben",
    ref: { file: "1992-10-21-9oba256-92", gz: "9ObA256/92" },
    legal_area: "zivilrecht",
  },
  // ── Strafrecht / StGB ──────────────────────────────────────────────
  {
    query: "OGH Diebstahl StGB §125 §127 §135 Einbruch",
    ref: { file: "1983-03-22-9os18-83", gz: "9Os18/83" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Sachbeschädigung Versicherungsbetrug Einverständnis des Eigentümers",
    ref: { file: "1985-05-30-12os42-85", gz: "12Os42/85" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Sachbeschädigung Sparbuch Zerreißen Vorsatz",
    ref: { file: "1989-06-29-12os32-89", gz: "12Os32/89" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Hehlerei privilegierte Delikte taxative Aufzählung",
    ref: { file: "1983-03-22-11os29-79", gz: "11Os29/79" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Sachbeschädigung Lenkradsperre Kraftfahrzeug unbedeutende Folge",
    ref: { file: "1983-12-20-10os182-83", gz: "10Os182/83" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Notzucht Beschädigung Kleidungsstücke Überwältigung Konsumtion",
    ref: { file: "1982-10-14-12os70-77", gz: "12Os70/77" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Sachbeschädigung Computerprogramme Löschen elektronisch gespeichert",
    ref: { file: "1986-02-12-9os2-86", gz: "9Os2/86" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Sachbeschädigung Diebstahl Einbruch Konsumtion strafbarer Versuch",
    ref: { file: "1985-09-19-10os29-77", gz: "10Os29/77" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH Versuch Einbruchsdiebstahl Rücktritt Sachbeschädigung strafbar",
    ref: { file: "1985-09-19-12os99-85", gz: "12Os99/85" },
    legal_area: "strafrecht",
  },
  {
    query: "OGH VerbotsG §3f §3g Sachbeschädigung Idealkonkurrenz",
    ref: { file: "1989-01-19-12os179-83", gz: "12Os179/83" },
    legal_area: "strafrecht",
  },
  // ── Zivilverfahren / ZPO ───────────────────────────────────────────
  {
    query: "OGH ZPO Klage Sachverständigengutachten Widersprüche Strafverfahren Zivilverfahren",
    ref: { file: "1961-02-16-2ob31-61", gz: "2Ob31/61" },
    legal_area: "zivilverfahren",
  },
  {
    query: "OGH ZPO Berufung Beweiswürdigung §292",
    ref: { file: "1964-10-23-7ob157-64", gz: "7Ob157/64" },
    legal_area: "zivilverfahren",
  },
  {
    query: "OGH ZPO Exekution §268 §482",
    ref: { file: "1971-07-08-2ob314-70", gz: "2Ob314/70" },
    legal_area: "zivilverfahren",
  },
  {
    query: "OGH ZPO Verfahren Versicherung AKB §2",
    ref: { file: "1978-10-19-7ob85-69", gz: "7Ob85/69" },
    legal_area: "zivilverfahren",
  },
  {
    query: "OGH EO Exekutionsrecht §268 ZPO",
    ref: { file: "1981-11-17-4ob547-81-4ob548-81", gz: "4Ob547/81" },
    legal_area: "exekution",
  },
  // ── Mietrecht / MRG ────────────────────────────────────────────────
  {
    query: "OGH MRG Mietrecht §16 §44 Kündigung Konsumentenschutz",
    ref: { file: "1987-04-07-5ob39-87", gz: "5Ob39/87" },
    legal_area: "mietrecht",
  },
];

/** Harness questions: correct OGH decision slug is the sole relevant slug. */
export const JUDIKATUR_QUESTIONS: NamedThingQuestion[] = JUDIKATUR_GOLD.map((g) => ({
  family: "generic-to-named",
  query: g.query,
  relevant: [slugOf(g.ref)],
}));

/**
 * Read a decision markdown file and return its full text.
 * Throws if the file is missing — keeps ground truth honest.
 */
function readDecision(r: JudgementRef): string {
  const path = join(CORPUS_DIR, `${r.file}.md`);
  if (!existsSync(path)) {
    throw new Error(
      `judikatur gold set drift: ${r.file}.md not found in at-judikatur/. ` +
        `Fix the corpus or the gold reference — a gold answer must exist.`
    );
  }
  return readFileSync(path, "utf-8");
}

/**
 * Seed all gold OGH decisions into a fresh brain.
 * Each decision is stored as a page with its full markdown text as compiled_truth
 * and a single chunk for keyword search.
 */
export async function seedJudikaturCorpus(engine: BrainEngine): Promise<void> {
  const sourceId = "law-at-judikatur";
  await engine.executeRaw(
    `INSERT INTO sources (id, name, jurisdiction, config)
     VALUES ($1, $1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET jurisdiction = EXCLUDED.jurisdiction`,
    [sourceId, "at", JSON.stringify({ federated: true, legal_corpus: true })]
  );

  const seen = new Set<string>();
  for (const g of JUDIKATUR_GOLD) {
    const slug = slugOf(g.ref);
    if (seen.has(slug)) continue;
    seen.add(slug);

    const body = readDecision(g.ref);
    const title = `OGH — ${g.ref.gz}`;

    await engine.putPage(
      slug,
      {
        type: "court_decision" as never,
        title,
        compiled_truth: body,
        timeline: "",
        frontmatter: {
          jurisdiction: "at",
          court: "OGH",
          case_number: g.ref.gz,
          legal_area: g.legal_area,
        },
      },
      { sourceId }
    );

    await engine.upsertChunks(
      slug,
      [
        {
          chunk_index: 0,
          chunk_text: body,
          chunk_source: "compiled_truth",
          token_count: body.split(/\s+/).length,
        },
      ] satisfies ChunkInput[],
      { sourceId }
    );
  }
}

/**
 * Seed DE distractor statutes to test jurisdiction purity.
 * Seeds a few German statute pages into the same brain so we can verify
 * that jurisdiction=at filtering keeps them out of judikatur results.
 */
export async function seedDeDistractors(engine: BrainEngine): Promise<void> {
  const sourceId = "law-de";
  await engine.executeRaw(
    `INSERT INTO sources (id, name, jurisdiction, config)
     VALUES ($1, $1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET jurisdiction = EXCLUDED.jurisdiction`,
    [sourceId, "de", JSON.stringify({ federated: true, legal_corpus: true })]
  );

  const distractors: { slug: string; title: string; body: string }[] = [
    {
      slug: "legal/statutes/de/bgb/p-823",
      title: "§ 823 BGB",
      body: "§ 823 BGB Schadensersatzpflicht. Wer vorsätzlich oder fahrlässig das Leben, Körper, Gesundheit, Freiheit, Eigentum oder ein sonstiges Recht eines anderen widerrechtlich verletzt, ist dem anderen zum Ersatze des daraus entstehenden Schadens verpflichtet.",
    },
    {
      slug: "legal/statutes/de/stgb/p-242",
      title: "§ 242 StGB",
      body: "§ 242 StGB Diebstahl. Wer eine fremde bewegliche Sache einem anderen in der Absicht wegnimmt, die Sache sich oder einem Dritten rechtswidrig zuzueignen, wird mit Freiheitsstrafe bis zu fünf Jahren oder mit Geldstrafe bestraft.",
    },
    {
      slug: "legal/statutes/de/zpo/p-283",
      title: "§ 283 ZPO",
      body: "§ 283 ZPO Beweiswürdigung. Das Gericht hat unter Berücksichtigung des gesamten Inhalts der Verhandlungen und des Ergebnisses einer etwaigen Beweisaufnahme nach freier Überzeugung zu entscheiden.",
    },
  ];

  for (const d of distractors) {
    await engine.putPage(
      d.slug,
      {
        type: "law" as never,
        title: d.title,
        compiled_truth: d.body,
        timeline: "",
        frontmatter: {
          jurisdiction: "de",
          abbreviation: d.title.split(" ")[1],
          paragraph: d.title.split(" ")[0].replace("§", ""),
        },
      },
      { sourceId }
    );

    await engine.upsertChunks(
      d.slug,
      [
        {
          chunk_index: 0,
          chunk_text: d.body,
          chunk_source: "compiled_truth",
          token_count: d.body.split(/\s+/).length,
        },
      ] satisfies ChunkInput[],
      { sourceId }
    );
  }
}
