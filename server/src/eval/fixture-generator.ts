/**
 * Fixture Generator — Scales Component & Subsumption Fixtures
 *
 * Reads law corpus files and generates additional test fixtures
 * to scale from 12→100+ component fixtures and 45→100+ subsumption fixtures.
 *
 * Strategy:
 * - Parse law corpus files (## § N — Title format)
 * - Generate layperson questions from § titles using templates
 * - Use actual § text as gold_context
 * - Generate gold_slugs, gold_citations, gold_concepts from parsed data
 *
 * Output: JSONL files written to server/test/fixtures/
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ── Types ─────────────────────────────────────────────────────────────

interface ParsedSection {
  section: string;
  title: string;
  text: string;
}

interface ParsedLaw {
  filename: string;
  lawCode: string;
  jurisdiction: string;
  sections: ParsedSection[];
}

interface ComponentFixture {
  id: string;
  jurisdiction: string;
  question: string;
  gold_concepts: {
    intent: string;
    expected_laws: string[];
    expected_sections: string[];
    expected_terms: string[];
  };
  gold_slugs: string[];
  gold_context: string;
  gold_citations: { code: string; paragraph: string }[];
}

interface SubsumptionFixture {
  case_id: string;
  jurisdiction: string;
  legal_area: string;
  scenario: string;
  question: string;
  expected_law: string;
  expected_section: string;
  expected_answer_keywords: string[];
  answer_slug: string;
}

// ── Law Corpus Parser ─────────────────────────────────────────────────

const CORPUS_BASE = join(import.meta.dir, "../../..", "law-corpus");

function parseLawFile(filepath: string, lawCode: string, jurisdiction: string): ParsedLaw {
  const content = readFileSync(filepath, "utf-8");
  const sections: ParsedSection[] = [];

  const isArticleBased = jurisdiction === "ch" || jurisdiction === "eu";

  if (isArticleBased) {
    // CH: "Art. N Title" / EU: "Artikel N" at start of line
    const articleRegex =
      jurisdiction === "eu" ? /^Artikel\s*(\d+[a-z]?)\s*$/gm : /^Art\.\s*(\d+[a-z]?)\s*(.+)$/gm;
    let lastMatch: RegExpExecArray | null = null;
    let lastStart = 0;

    let match: RegExpExecArray | null;
    while ((match = articleRegex.exec(content)) !== null) {
      if (lastMatch) {
        const text = content.slice(lastStart, match.index).trim();
        // For EU, title is the text after the Artikel line (first non-empty line)
        const titleMatch = text.match(/^(.+)$/m);
        sections.push({
          section: lastMatch[1],
          title:
            jurisdiction === "eu"
              ? (titleMatch?.[1]?.trim().slice(0, 200) ?? `Artikel ${lastMatch[1]}`)
              : lastMatch[2].trim().slice(0, 200),
          text: text.slice(0, 2000),
        });
      }
      lastMatch = match;
      lastStart = match.index + match[0].length;
    }
    if (lastMatch) {
      const text = content.slice(lastStart).trim();
      const titleMatch = text.match(/^(.+)$/m);
      sections.push({
        section: lastMatch[1],
        title:
          jurisdiction === "eu"
            ? (titleMatch?.[1]?.trim().slice(0, 200) ?? `Artikel ${lastMatch[1]}`)
            : lastMatch[2].trim().slice(0, 200),
        text: text.slice(0, 2000),
      });
    }
  } else if (jurisdiction === "at") {
    // AT: "§ N. Title" or "§ N. bis § M. Title" at start of line
    const atRegex = /^§\s*(\d+[a-z]?)\.\s*(.+)$/gm;
    let lastMatch: RegExpExecArray | null = null;
    let lastStart = 0;

    let match: RegExpExecArray | null;
    while ((match = atRegex.exec(content)) !== null) {
      if (lastMatch) {
        const text = content.slice(lastStart, match.index).trim();
        sections.push({
          section: lastMatch[1],
          title: lastMatch[2].trim().slice(0, 200),
          text: text.slice(0, 2000),
        });
      }
      lastMatch = match;
      lastStart = match.index + match[0].length;
    }
    if (lastMatch) {
      const text = content.slice(lastStart).trim();
      sections.push({
        section: lastMatch[1],
        title: lastMatch[2].trim().slice(0, 200),
        text: text.slice(0, 2000),
      });
    }
  } else {
    // DE/AT: "## § N — Title" headers
    const sectionRegex = /^## § (\d+[a-z]?)\s*[—–-]\s*(.+)$/gm;
    let lastMatch: RegExpExecArray | null = null;
    let lastStart = 0;

    let match: RegExpExecArray | null;
    while ((match = sectionRegex.exec(content)) !== null) {
      if (lastMatch) {
        const text = content.slice(lastStart, match.index).trim();
        sections.push({
          section: lastMatch[1],
          title: lastMatch[2].trim(),
          text: text.slice(0, 2000),
        });
      }
      lastMatch = match;
      lastStart = match.index + match[0].length;
    }
    if (lastMatch) {
      const text = content.slice(lastStart).trim();
      sections.push({
        section: lastMatch[1],
        title: lastMatch[2].trim(),
        text: text.slice(0, 2000),
      });
    }
  }

  return { filename: filepath.split("/").pop()!, lawCode, jurisdiction, sections };
}

function loadLawCorpus(jurisdiction: string, lawFiles: string[]): ParsedLaw[] {
  const laws: ParsedLaw[] = [];
  const base = join(CORPUS_BASE, jurisdiction);
  for (const file of lawFiles) {
    const filepath = join(base, file);
    if (!existsSync(filepath)) continue;
    const lawCode = file.replace(".md", "").replace(/_/g, "");
    laws.push(parseLawFile(filepath, lawCode.toUpperCase(), jurisdiction));
  }
  return laws;
}

// ── Question Templates ────────────────────────────────────────────────

const QUESTION_TEMPLATES_DE: Record<string, string[]> = {
  BGB: [
    "Was regelt § {n} BGB?",
    "Ich habe eine Frage zu § {n} BGB. Können Sie mir das erklären?",
    "Was bedeutet § {n} BGB für mich?",
    "Können Sie mir § {n} BGB erklären?",
  ],
  StGB: [
    "Was ist die Strafe nach § {n} StGB?",
    "Was droht mir nach § {n} StGB?",
    "Können Sie § {n} StGB erklären?",
    "Ist {title} strafbar?",
  ],
  ZPO: [
    "Was regelt § {n} ZPO?",
    "Wie funktioniert das nach § {n} ZPO?",
    "Können Sie mir § {n} ZPO erklären?",
  ],
  HGB: [
    "Was besagt § {n} HGB?",
    "Können Sie § {n} HGB erklären?",
    "Was regelt § {n} HGB für Kaufleute?",
  ],
  AO: [
    "Was regelt § {n} AO?",
    "Können Sie mir § {n} Abgabenordnung erklären?",
    "Was bedeutet § {n} AO steuerlich?",
  ],
  InsO: ["Was regelt § {n} InsO?", "Können Sie § {n} InsO erklären?"],
  BDSG: ["Was regelt § {n} BDSG?", "Können Sie mir § {n} Datenschutzgesetz erklären?"],
  BauGB: ["Was regelt § {n} BauGB?", "Können Sie § {n} Baugesetzbuch erklären?"],
  UWG: ["Was regelt § {n} UWG?", "Ist {title} wettbewerbswidrig?"],
  FamFG: ["Was regelt § {n} FamFG?", "Können Sie § {n} FamFG erklären?"],
  GewO: ["Was regelt § {n} GewO?", "Können Sie mir § {n} Gewerbeordnung erklären?"],
  RVG: ["Was regelt § {n} RVG?", "Können Sie § {n} Rechtsanwaltsvergütungsgesetz erklären?"],
};

const QUESTION_TEMPLATES_AT: Record<string, string[]> = {
  ABGB: [
    "Was regelt § {n} ABGB?",
    "Können Sie mir § {n} ABGB erklären?",
    "Was bedeutet § {n} ABGB für mich?",
  ],
  StGB: [
    "Was ist die Strafe nach § {n} StGB?",
    "Was droht mir nach § {n} StGB?",
    "Können Sie § {n} StGB erklären?",
  ],
  ZPO: ["Was regelt § {n} ZPO?", "Wie funktioniert das nach § {n} ZPO?"],
  EheG: ["Was regelt § {n} EheG?", "Können Sie § {n} Ehegesetz erklären?"],
  UGB: ["Was regelt § {n} UGB?", "Können Sie § {n} Unternehmensgesetzbuch erklären?"],
  ASVG: ["Was regelt § {n} ASVG?", "Können Sie mir § {n} ASVG erklären?"],
  ArbVG: ["Was regelt § {n} ArbVG?", "Können Sie § {n} Arbeitsverfassungsgesetz erklären?"],
};

const QUESTION_TEMPLATES_CH: Record<string, string[]> = {
  OR: ["Was regelt Art. {n} OR?", "Können Sie mir Art. {n} OR erklären?"],
  ZGB: ["Was regelt Art. {n} ZGB?", "Können Sie Art. {n} ZGB erklären?"],
  BGG: ["Was regelt Art. {n} BGG?", "Können Sie Art. {n} BGG erklären?"],
  STGB: ["Was regelt Art. {n} StGB?", "Was droht mir nach Art. {n} StGB?"],
  STPO: ["Was regelt Art. {n} StPO?", "Können Sie Art. {n} StPO erklären?"],
};

const QUESTION_TEMPLATES_EU: Record<string, string[]> = {
  DSGVO: [
    "Was regelt Art. {n} DSGVO?",
    "Können Sie mir Art. {n} DSGVO erklären?",
    "Was bedeutet Art. {n} DSGVO für mein Unternehmen?",
  ],
  DSRL: ["Was regelt Art. {n} DSRL?", "Können Sie Art. {n} Datenschutzrichtlinie erklären?"],
};

// ── Fixture Generators ────────────────────────────────────────────────

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function makeRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateComponentFixtures(
  laws: ParsedLaw[],
  templates: Record<string, string[]>,
  jurisdiction: string,
  count: number,
  startId: number,
  rng: () => number
): ComponentFixture[] {
  const fixtures: ComponentFixture[] = [];
  let id = startId;

  // Only use laws that have parseable sections
  const validLaws = laws.filter((l) => l.sections.length > 0);
  if (validLaws.length === 0) return fixtures;

  for (let i = 0; i < count; i++) {
    const law = pickRandom(validLaws, rng);
    const section = pickRandom(law.sections, rng);
    const tmpl = templates[law.lawCode] ?? ["Was regelt § {n} {law}?"];
    const question = pickRandom(tmpl, rng)
      .replace("{n}", section.section)
      .replace("{law}", law.lawCode)
      .replace("{title}", section.title);

    const slugJur = jurisdiction.toLowerCase();
    const isArticle = jurisdiction === "ch" || jurisdiction === "eu";
    const slugSuffix = isArticle ? `art-${section.section}` : `p-${section.section}`;
    const slug = `legal/statutes/${slugJur}/${law.lawCode.toLowerCase()}/${slugSuffix}`;

    // Extract terms from title
    const terms = section.title
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/[^\wäöüß-]/g, ""))
      .filter((w) => w.length > 3)
      .slice(0, 4);

    const fixture: ComponentFixture = {
      id: `gen-${slugJur}-${String(id).padStart(3, "0")}`,
      jurisdiction: jurisdiction.toUpperCase(),
      question,
      gold_concepts: {
        intent: "statute_lookup",
        expected_laws: [law.lawCode],
        expected_sections: [section.section],
        expected_terms: terms,
      },
      gold_slugs: [slug],
      gold_context: `## ${isArticle ? "Art." : "§"} ${section.section} ${law.lawCode} — ${section.title}\n${section.text.slice(0, 800)}`,
      gold_citations: [{ code: law.lawCode, paragraph: section.section }],
    };

    fixtures.push(fixture);
    id++;
  }

  return fixtures;
}

function generateSubsumptionFixtures(
  laws: ParsedLaw[],
  jurisdiction: string,
  count: number,
  startId: number,
  rng: () => number,
  legalAreas: string[]
): SubsumptionFixture[] {
  const fixtures: SubsumptionFixture[] = [];
  let id = startId;

  const validLaws = laws.filter((l) => l.sections.length > 0);
  if (validLaws.length === 0) return fixtures;

  for (let i = 0; i < count; i++) {
    const law = pickRandom(validLaws, rng);
    const section = pickRandom(law.sections, rng);
    const legalArea = pickRandom(legalAreas, rng);
    const isArticle = jurisdiction === "ch" || jurisdiction === "eu";
    const sectionStr = isArticle ? `Art. ${section.section}` : `§ ${section.section}`;

    const keywords = section.title
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/[^\wäöüß-]/g, ""))
      .filter((w) => w.length > 3)
      .slice(0, 5);

    const slugJur = jurisdiction.toLowerCase();
    const slugSuffix = isArticle ? `art-${section.section}` : `p-${section.section}`;

    fixtures.push({
      case_id: `gen-sub-${slugJur}-${String(id).padStart(3, "0")}`,
      jurisdiction: jurisdiction.toUpperCase(),
      legal_area: legalArea,
      scenario: `Ein Mandant fragt nach den rechtlichen Folgen von ${section.title}.`,
      question: `Welche rechtlichen Regelungen gelten für ${section.title} nach ${law.lawCode}?`,
      expected_law: law.lawCode,
      expected_section: sectionStr,
      expected_answer_keywords: keywords,
      answer_slug: `${law.lawCode.toLowerCase()}`,
    });
    id++;
  }

  return fixtures;
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  const rng = makeRNG(12345);

  // Load law corpora
  const deLaws = loadLawCorpus("de", [
    "bgb.md",
    "stgb.md",
    "zpo.md",
    "hgb.md",
    "ao.md",
    "insO.md",
    "bdsg.md",
    "baugb.md",
    "uwg.md",
    "famfg.md",
    "gewo.md",
    "rvg.md",
  ]);
  const atLaws = loadLawCorpus("at", ["abgb.md", "stgb-at.md", "zpo-at.md", "eheg.md", "ugb.md"]);
  const chLaws = loadLawCorpus("ch", ["or.md", "zgb.md", "bgg.md", "stgb.md", "stpo.md"]);
  const euLaws = loadLawCorpus("eu", ["dsgvo.md", "dsrl.md"]);

  // Generate component fixtures
  // DE: 40, AT: 25, CH: 20, EU: 15 = 100 total
  const deComp = generateComponentFixtures(deLaws, QUESTION_TEMPLATES_DE, "de", 40, 1, rng);
  const atComp = generateComponentFixtures(atLaws, QUESTION_TEMPLATES_AT, "at", 25, 41, rng);
  const chComp = generateComponentFixtures(chLaws, QUESTION_TEMPLATES_CH, "ch", 20, 66, rng);
  const euComp = generateComponentFixtures(euLaws, QUESTION_TEMPLATES_EU, "eu", 15, 86, rng);

  const allComp = [...deComp, ...atComp, ...chComp, ...euComp];

  // Write component fixtures as JSONL
  const compPath = join(
    CORPUS_BASE,
    "..",
    "server",
    "test",
    "fixtures",
    "generated-component-eval.jsonl"
  );
  writeFileSync(compPath, allComp.map((f) => JSON.stringify(f)).join("\n") + "\n");
  console.log(`[fixture-gen] Component fixtures: ${allComp.length} written to ${compPath}`);

  // Generate subsumption fixtures
  // DE: 40, AT: 25, CH: 20, EU: 15 = 100 total
  const deLegalAreas = [
    "civil_law",
    "criminal_law",
    "commercial_law",
    "procedural_law",
    "family_law",
    "administrative_law",
  ];
  const atLegalAreas = ["civil_law", "criminal_law", "procedural_law", "family_law", "labor_law"];
  const chLegalAreas = ["civil_law", "commercial_law", "administrative_law"];
  const euLegalAreas = ["data_protection", "eu_law"];

  const deSub = generateSubsumptionFixtures(deLaws, "de", 40, 1, rng, deLegalAreas);
  const atSub = generateSubsumptionFixtures(atLaws, "at", 25, 41, rng, atLegalAreas);
  const chSub = generateSubsumptionFixtures(chLaws, "ch", 20, 66, rng, chLegalAreas);
  const euSub = generateSubsumptionFixtures(euLaws, "eu", 15, 86, rng, euLegalAreas);

  const allSub = [...deSub, ...atSub, ...chSub, ...euSub];

  const subPath = join(
    CORPUS_BASE,
    "..",
    "server",
    "test",
    "fixtures",
    "generated-subsumption.jsonl"
  );
  writeFileSync(subPath, allSub.map((f) => JSON.stringify(f)).join("\n") + "\n");
  console.log(`[fixture-gen] Subsumption fixtures: ${allSub.length} written to ${subPath}`);

  // Summary
  console.log(`\n[fixture-gen] Summary:`);
  console.log(
    `  Component: ${allComp.length} (DE=${deComp.length}, AT=${atComp.length}, CH=${chComp.length}, EU=${euComp.length})`
  );
  console.log(
    `  Subsumption: ${allSub.length} (DE=${deSub.length}, AT=${atSub.length}, CH=${chSub.length}, EU=${euSub.length})`
  );
  console.log(`  Combined total: ${allComp.length + allSub.length}`);
}

main();
