/**
 * LAB-DACH v3 — CH Challenge Set (T10.2)
 *
 * Swiss-specific manipulated answers derived from CH gold task reference outputs.
 * Tests guardrail detection of CH-specific manipulations:
 *   - CH→DE/AT jurisdiction swaps (OR→BGB, StGB CH→StGB DE)
 *   - Fabricated CH article numbers
 *   - Wrong CH law applied (OR instead of ZGB, etc.)
 *   - CH-specific language contamination (Swiss German vs Standard German)
 *   - Outdated CH federal law references
 *
 * This is a SEPARATE challenge set from the main DE/AT challenge set.
 * It ensures the guardrail can handle CH-specific legal content correctly.
 */

import type { ChallengeEntry, ManipulationType, ExpectedFlagSeverity, Task } from "./types.ts";
import { GOLD_CH_LITIGATION, GOLD_CH_CRIMINAL, GOLD_CH_INHERITANCE } from "./gold-tasks-ch.ts";

// ── CH-Specific Manipulation Helpers ──────────────────────────────────

function swapCHtoDEorAT(text: string): string {
  return text
    .replace(/OR/g, "BGB")
    .replace(/ZGB/g, "BGB")
    .replace(/StGB/g, "BGB")
    .replace(/Art\.\s*(\d+)/g, "§ $1")
    .replace(/fedlex\.data\.admin\.ch/g, "gesetze-im-internet.de")
    .replace(/CHF/g, "€");
}

function swapCHtoAT(text: string): string {
  return text
    .replace(/OR/g, "ABGB")
    .replace(/ZGB/g, "ABGB")
    .replace(/StGB/g, "ATStGB")
    .replace(/Art\.\s*(\d+)/g, "§ $1")
    .replace(/fedlex\.data\.admin\.ch/g, "ris.bka.gv.at")
    .replace(/CHF/g, "€");
}

function injectFabricatedCHArticle(text: string, law: string, fakeArt: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  const insertIdx = Math.min(3, lines.length - 2);
  lines.splice(
    insertIdx,
    0,
    `Gemäss Art. ${fakeArt} ${law} ist hier eine zusätzliche Prüfung erforderlich.`
  );
  return lines.join("\n");
}

function corruptCHConclusion(text: string, wrongResult: string): string {
  const resultIdx = text.indexOf("## Ergebnis");
  if (resultIdx === -1) return text + "\n\n## Ergebnis\n" + wrongResult;
  return text.substring(0, resultIdx) + "## Ergebnis\n" + wrongResult;
}

function injectSwissGermanContamination(text: string): string {
  return text
    .replace("Rechtliche Würdigung", "Rächtlichi Würdigig")
    .replace("Ergebnis", "Ergebnis / Resultat")
    .replace("Sachverhalt", "Sachverhalt / Tatbestand");
}

function removeCHUncertainty(text: string): string {
  return text
    .replace(/kann/g, "muss")
    .replace(/könnte/g, "wird")
    .replace(/ist zu prüfen/g, "ist eindeutig")
    .replace(/möglicherweise/g, "definitiv");
}

function injectFabricatedCHLaw(text: string, realLaw: string, fakeLaw: string): string {
  return text.replace(new RegExp(realLaw, "g"), fakeLaw);
}

// ── CH Challenge Entry Factory ────────────────────────────────────────

let chCounter = 0;
function makeCHEntry(
  task: Task,
  type: ManipulationType,
  manipulated: string,
  flag: string,
  severity: ExpectedFlagSeverity,
  desc: string
): ChallengeEntry {
  chCounter++;
  return {
    id: `ch-challenge-${String(chCounter).padStart(3, "0")}`,
    source_task_id: task.id,
    jurisdiction: "CH",
    manipulation_type: type,
    manipulated_output: manipulated,
    expected_guardrail_flag: flag,
    expected_flag_severity: severity,
    description: desc,
  };
}

// ── Generate CH Challenge Set ─────────────────────────────────────────

function generateCHChallengeSet(): ChallengeEntry[] {
  const entries: ChallengeEntry[] = [];
  const allCHTasks = [...GOLD_CH_LITIGATION, ...GOLD_CH_CRIMINAL, ...GOLD_CH_INHERITANCE];

  // 10 × wrong_jurisdiction (5 CH→DE, 5 CH→AT)
  for (let i = 0; i < 5 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i];
    entries.push(
      makeCHEntry(
        t,
        "wrong_jurisdiction",
        swapCHtoDEorAT(t.reference_output ?? ""),
        "jurisdiction_correct: DE law (BGB) cited in CH case",
        "critical",
        `CH task ${t.id}: OR/ZGB/StGB replaced with BGB (DE)`
      )
    );
  }
  for (let i = 0; i < 5 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i + 3] ?? allCHTasks[i];
    entries.push(
      makeCHEntry(
        t,
        "wrong_jurisdiction",
        swapCHtoAT(t.reference_output ?? ""),
        "jurisdiction_correct: AT law (ABGB) cited in CH case",
        "critical",
        `CH task ${t.id}: OR/ZGB replaced with ABGB (AT)`
      )
    );
  }

  // 5 × fabricated_paragraph
  const fakeArts = ["999", "888", "777", "666", "555"];
  for (let i = 0; i < 5 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i];
    const law = t.expected_laws?.[0] ?? "OR";
    entries.push(
      makeCHEntry(
        t,
        "fabricated_paragraph",
        injectFabricatedCHArticle(t.reference_output ?? "", law, fakeArts[i] ?? "999"),
        `law_valid: Art. ${fakeArts[i] ?? "999"} ${law} does not exist`,
        "high",
        `CH task ${t.id}: fabricated Art. ${fakeArts[i] ?? "999"} ${law} injected`
      )
    );
  }

  // 5 × wrong_law (OR→ZGB, ZGB→OR, StGB→OR, etc.)
  const wrongLawMap: Record<string, string> = { OR: "ZGB", ZGB: "OR", StGB: "OR" };
  for (let i = 0; i < 5 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i];
    const ref = t.reference_output ?? "";
    const correctLaw = t.expected_laws?.[0] ?? "OR";
    const wrongLaw = wrongLawMap[correctLaw] ?? "ZGB";
    entries.push(
      makeCHEntry(
        t,
        "wrong_law",
        injectFabricatedCHLaw(ref, correctLaw, wrongLaw),
        `wrong_law: ${wrongLaw} cited instead of ${correctLaw}`,
        "high",
        `CH task ${t.id}: ${correctLaw} replaced with ${wrongLaw}`
      )
    );
  }

  // 5 × wrong_conclusion
  const wrongResults = [
    "Der Anspruch ist abzuweisen. Es liegt keine Rechtsverletzung vor.",
    "Die Klage ist unbegründet. Der Beklagte hat nichts zu befürchten.",
    "Es besteht kein Anspruch. Die Forderung ist nicht durchsetzbar.",
    "Der Angeklagte ist freizusprechen. Es liegt kein Tatbestand vor.",
    "Der Pflichtteil kann nicht geltend gemacht werden.",
  ];
  for (let i = 0; i < 5 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i];
    entries.push(
      makeCHEntry(
        t,
        "wrong_conclusion",
        corruptCHConclusion(t.reference_output ?? "", wrongResults[i] ?? "Anspruch abzuweisen."),
        "wrong_conclusion: legal conclusion contradicts the correct application of Swiss law",
        "high",
        `CH task ${t.id}: conclusion replaced with wrong legal result`
      )
    );
  }

  // 3 × language_contamination (Swiss German dialect)
  for (let i = 0; i < 3 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i];
    entries.push(
      makeCHEntry(
        t,
        "language_contamination",
        injectSwissGermanContamination(t.reference_output ?? ""),
        "language_german: Swiss German dialect headings mixed into output",
        "medium",
        `CH task ${t.id}: Standard German headings replaced with Swiss German dialect`
      )
    );
  }

  // 3 × removed_uncertainty
  for (let i = 0; i < 3 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i + 4] ?? allCHTasks[i];
    entries.push(
      makeCHEntry(
        t,
        "removed_uncertainty",
        removeCHUncertainty(t.reference_output ?? ""),
        "substantiated_uncertainty: hedging removed, confident claims where uncertainty is warranted",
        "medium",
        `CH task ${t.id}: hedging language replaced with confident assertions`
      )
    );
  }

  // 3 × fabricated_law
  const fakeCHLaws = ["SchweizGB", "BundesZivilG", "HelvetG"];
  for (let i = 0; i < 3 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i];
    const realLaw = t.expected_laws?.[0] ?? "OR";
    const fakeLaw = fakeCHLaws[i] ?? "FakeG";
    entries.push(
      makeCHEntry(
        t,
        "fabricated_law",
        injectFabricatedCHLaw(t.reference_output ?? "", realLaw, fakeLaw),
        `law_valid: ${fakeLaw} is not a valid Swiss law abbreviation`,
        "high",
        `CH task ${t.id}: ${realLaw} replaced with fabricated ${fakeLaw}`
      )
    );
  }

  // 2 × outdated_law (old Swiss federal law references)
  const outdatedCH = [
    { realLaw: "OR", oldLaw: "Obligationenrecht1872", note: "OR 1872 (replaced by OR 1911)" },
    { realLaw: "ZGB", oldLaw: "ZivilGB1907", note: "ZGB 1907 version (superseded by amendments)" },
  ];
  for (let i = 0; i < 2 && i < allCHTasks.length; i++) {
    const t = allCHTasks[i];
    const o = outdatedCH[i] ?? { realLaw: "OR", oldLaw: "OldOR", note: "outdated law" };
    entries.push(
      makeCHEntry(
        t,
        "outdated_law",
        injectFabricatedCHLaw(t.reference_output ?? "", o.realLaw, o.oldLaw),
        `outdated_law: ${o.oldLaw} is superseded — ${o.note}`,
        "high",
        `CH task ${t.id}: ${o.realLaw} replaced with outdated ${o.oldLaw}`
      )
    );
  }

  return entries;
}

export const CH_CHALLENGE_SET: ChallengeEntry[] = generateCHChallengeSet();

// ── CH Corpus Readiness Check ─────────────────────────────────────────

export interface CHCorpusReadiness {
  ready: boolean;
  total_laws: number;
  laws: { slug: string; name: string; size_bytes: number; ready: boolean }[];
  missing: string[];
  notes: string[];
}

export function checkCHCorpusReadiness(
  corpusFiles: { slug: string; name: string; size_bytes: number }[]
): CHCorpusReadiness {
  const required = [
    { slug: "law/ch/or", name: "Obligationenrecht (OR)" },
    { slug: "law/ch/zgb", name: "Zivilgesetzbuch (ZGB)" },
    { slug: "law/ch/stgb", name: "Strafgesetzbuch (StGB)" },
    { slug: "law/ch/zpo", name: "Zivilprozessordnung (ZPO)" },
    { slug: "law/ch/stpo", name: "Strafprozessordnung (StPO)" },
  ];

  const laws = required.map((req) => {
    const file = corpusFiles.find(
      (f) => f.slug === req.slug || f.name.includes(req.slug.split("/").pop()!)
    );
    return {
      slug: req.slug,
      name: req.name,
      size_bytes: file?.size_bytes ?? 0,
      ready: file !== undefined && file.size_bytes > 0,
    };
  });

  const missing = laws.filter((l) => !l.ready).map((l) => `${l.slug} (${l.name})`);
  const notes: string[] = [];

  if (missing.length > 0) {
    notes.push(`Missing: ${missing.join(", ")}`);
  }

  // Check for optional but recommended sources
  const optional = [
    { slug: "law/ch/bvg", name: "Bundesverfassung (BV)" },
    { slug: "law/ch/dsg", name: "Datenschutzgesetz (DSG)" },
    { slug: "law/ch/uwg", name: "Wettbewerbsgesetz (UWG)" },
  ];
  const optionalMissing = optional.filter((o) => !corpusFiles.some((f) => f.slug === o.slug));
  if (optionalMissing.length > 0) {
    notes.push(`Optional but recommended: ${optionalMissing.map((o) => o.name).join(", ")}`);
  }

  notes.push("CH Judikatur (BGer) import script exists at server/scripts/ingest-ch-judikatur.ts");
  notes.push("Fedlex license: CC0 1.0 (Public Domain Dedication) — no attribution required");

  return {
    ready: missing.length === 0,
    total_laws: laws.length,
    laws,
    missing,
    notes,
  };
}
