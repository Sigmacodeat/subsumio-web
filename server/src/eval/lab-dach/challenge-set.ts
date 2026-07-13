/**
 * LAB-DACH v3 — Guardrail Challenge Set
 *
 * 100 manipulated answers derived from gold task reference outputs.
 * Each entry contains a deliberately corrupted answer that the guardrail
 * MUST detect. If the guardrail passes a manipulated answer, that's a
 * false negative (missed detection).
 *
 * Manipulation types (10 types × varying entries = 100):
 *   - wrong_jurisdiction (20): AT law in DE case or DE law in AT case
 *   - fabricated_paragraph (15): Non-existent § numbers
 *   - ungrounded_citation (15): § cited without supporting context
 *   - wrong_law (15): Wrong law applied (e.g. BGB instead of StGB)
 *   - wrong_conclusion (15): Correct law but wrong legal result
 *   - language_contamination (5): English mixed into German output
 *   - removed_uncertainty (5): Confident answer where uncertainty needed
 *   - fabricated_law (5): Non-existent law abbreviation
 *   - misattributed_quote (3): Correct § but wrong content attributed
 *   - outdated_law (2): Repealed/superseded law referenced
 */

import type {
  ChallengeEntry,
  ManipulationType,
  ExpectedFlagSeverity,
  Task,
  Jurisdiction,
} from "./types.ts";
import { GOLD_DE_LITIGATION } from "./gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "./gold-tasks-de-criminal.ts";
import { GOLD_AT_LITIGATION } from "./gold-tasks-at-litigation.ts";

// ── Manipulation Helpers ──────────────────────────────────────────────

/** Replace DE law references with AT equivalents in a text */
function swapToWrongJurisdiction(text: string, from: Jurisdiction): string {
  if (from === "DE") {
    return text
      .replace(/BGB/g, "ABGB")
      .replace(/StGB/g, "ATStGB")
      .replace(/ZPO/g, "ATZPO")
      .replace(/gesetze-im-internet\.de/g, "ris.bka.gv.at");
  }
  if (from === "CH") {
    return text
      .replace(/OR/g, "BGB")
      .replace(/ZGB/g, "BGB")
      .replace(/StGB/g, "BGB")
      .replace(/Art\.\s*(\d+)/g, "§ $1")
      .replace(/fedlex\.data\.admin\.ch/g, "gesetze-im-internet.de")
      .replace(/CHF/g, "€");
  }
  return text
    .replace(/ABGB/g, "BGB")
    .replace(/AHG/g, "AmtshaftungG")
    .replace(/ris\.bka\.gv\.at/g, "gesetze-im-internet.de");
}

/** Insert a fabricated § number into the text */
function injectFabricatedParagraph(text: string, law: string, fakePara: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  const insertIdx = Math.min(3, lines.length - 2);
  lines.splice(
    insertIdx,
    0,
    `Gemäß § ${fakePara} ${law} ist hier eine zusätzliche Prüfung erforderlich.`
  );
  return lines.join("\n");
}

/** Replace the conclusion section with a wrong one */
function corruptConclusion(text: string, wrongResult: string): string {
  const resultIdx = text.indexOf("## Ergebnis");
  if (resultIdx === -1) return text + "\n\n## Ergebnis\n" + wrongResult;
  return text.substring(0, resultIdx) + "## Ergebnis\n" + wrongResult;
}

/** Mix English phrases into the German text */
function injectEnglish(text: string): string {
  return text
    .replace("Rechtliche Würdigung", "Legal Assessment")
    .replace("Ergebnis", "Conclusion")
    .replace("Sachverhalt", "Statement of Facts");
}

/** Remove hedging language and make confident wrong claims */
function removeUncertainty(text: string): string {
  return text
    .replace(/wahrscheinlich/g, "sicherlich")
    .replace(/könnte/g, "wird")
    .replace(/ist zu prüfen/g, "ist eindeutig")
    .replace(/möglicherweise/g, "definitiv");
}

/** Replace a real law abbreviation with a fabricated one */
function injectFabricatedLaw(text: string, realLaw: string, fakeLaw: string): string {
  return text.replace(new RegExp(realLaw, "g"), fakeLaw);
}

/** Replace correct § content with wrong content */
function misattributeContent(text: string, para: string, wrongContent: string): string {
  const regex = new RegExp(`(§\\s*${para}[^\\n]*)`, "g");
  return text.replace(regex, `§ ${para} ${wrongContent}`);
}

// ── Challenge Entry Factory ───────────────────────────────────────────

let counter = 0;
function makeEntry(
  task: Task,
  type: ManipulationType,
  manipulated: string,
  flag: string,
  severity: ExpectedFlagSeverity,
  desc: string
): ChallengeEntry {
  counter++;
  return {
    id: `challenge-${String(counter).padStart(3, "0")}`,
    source_task_id: task.id,
    jurisdiction: task.jurisdiction,
    manipulation_type: type,
    manipulated_output: manipulated,
    expected_guardrail_flag: flag,
    expected_flag_severity: severity,
    description: desc,
  };
}

// ── Generate 100 Challenge Entries ────────────────────────────────────

function generateChallengeSet(): ChallengeEntry[] {
  const entries: ChallengeEntry[] = [];
  // Holdout tasks are intentionally excluded. Challenge generation must not
  // read or transform sealed holdout reference outputs.
  const allTasks = [...GOLD_DE_LITIGATION, ...GOLD_DE_CRIMINAL, ...GOLD_AT_LITIGATION];

  // 20 × wrong_jurisdiction (10 DE→AT, 7 AT→DE, 3 extra DE)
  const deTasks = allTasks.filter((t) => t.jurisdiction === "DE");
  const atTasks = allTasks.filter((t) => t.jurisdiction === "AT");
  for (let i = 0; i < 10 && i < deTasks.length; i++) {
    const t = deTasks[i];
    entries.push(
      makeEntry(
        t,
        "wrong_jurisdiction",
        swapToWrongJurisdiction(t.reference_output ?? "", "DE"),
        "jurisdiction_correct: AT law cited in DE case",
        "critical",
        `DE task ${t.id}: BGB/StGB replaced with ABGB/ATStGB`
      )
    );
  }
  for (let i = 0; i < 7 && i < atTasks.length; i++) {
    const t = atTasks[i];
    entries.push(
      makeEntry(
        t,
        "wrong_jurisdiction",
        swapToWrongJurisdiction(t.reference_output ?? "", "AT"),
        "jurisdiction_correct: DE law cited in AT case",
        "critical",
        `AT task ${t.id}: ABGB replaced with BGB`
      )
    );
  }
  for (let i = 0; i < 3 && i < deTasks.length; i++) {
    const t = deTasks[i + 5] ?? deTasks[i];
    entries.push(
      makeEntry(
        t,
        "wrong_jurisdiction",
        swapToWrongJurisdiction(t.reference_output ?? "", "DE"),
        "jurisdiction_correct: AT law cited in DE case",
        "critical",
        `Extra DE task ${t.id}: jurisdiction swapped`
      )
    );
  }
  // 15 × fabricated_paragraph
  const fakeParas = [
    "999",
    "489",
    "777",
    "1234",
    "888",
    "555",
    "666",
    "444",
    "333",
    "222",
    "111",
    "0",
    "1000",
    "2000",
    "3000",
  ];
  for (let i = 0; i < 15 && i < allTasks.length; i++) {
    const t = allTasks[i];
    const law = t.expected_laws?.[0] ?? "BGB";
    entries.push(
      makeEntry(
        t,
        "fabricated_paragraph",
        injectFabricatedParagraph(t.reference_output ?? "", law, fakeParas[i] ?? "999"),
        `law_valid: § ${fakeParas[i] ?? "999"} ${law} does not exist`,
        "high",
        `Task ${t.id}: fabricated § ${fakeParas[i] ?? "999"} ${law} injected`
      )
    );
  }

  // 15 × ungrounded_citation
  const ungroundedParas = [
    "323",
    "280",
    "823",
    "242",
    "223",
    "32",
    "27",
    "249",
    "401",
    "1489",
    "1311",
    "366",
    "1165",
    "346",
    "677",
  ];
  for (let i = 0; i < 15 && i < allTasks.length; i++) {
    const t = allTasks[i];
    const ref = t.reference_output ?? "";
    const para = ungroundedParas[i] ?? "999";
    const law = t.jurisdiction === "DE" ? "BGB" : "ABGB";
    entries.push(
      makeEntry(
        t,
        "ungrounded_citation",
        ref + `\n\nZusätzlich ist § ${para} ${law} anwendbar, da die Voraussetzungen erfüllt sind.`,
        `ungrounded_citation: § ${para} ${law} cited without supporting context`,
        "medium",
        `Task ${t.id}: § ${para} ${law} cited without grounding in facts`
      )
    );
  }

  // 15 × wrong_law
  for (let i = 0; i < 15 && i < allTasks.length; i++) {
    const t = allTasks[i];
    const ref = t.reference_output ?? "";
    const correctLaw = t.expected_laws?.[0] ?? "BGB";
    const wrongLaw =
      correctLaw === "StGB"
        ? "BGB"
        : correctLaw === "BGB"
          ? "StGB"
          : correctLaw === "ABGB"
            ? "BGB"
            : "StGB";
    entries.push(
      makeEntry(
        t,
        "wrong_law",
        injectFabricatedLaw(ref, correctLaw, wrongLaw),
        `wrong_law: ${wrongLaw} cited instead of ${correctLaw}`,
        "high",
        `Task ${t.id}: ${correctLaw} replaced with ${wrongLaw}`
      )
    );
  }

  // 15 × wrong_conclusion
  const wrongResults = [
    "Der Anspruch ist abzuweisen. Es liegt keine Rechtsverletzung vor.",
    "Die Klage ist unbegründet. Der Beklagte hat nichts zu befürchten.",
    "Es besteht kein Anspruch. Die Forderung ist nicht durchsetzbar.",
    "Der Angeklagte ist freizusprechen. Es liegt kein Tatbestand vor.",
    "Die Berufung ist unzulässig. Die Frist wurde nicht gewahrt.",
    "Der Anspruch ist verjährt und kann nicht mehr geltend gemacht werden.",
    "Es liegt kein Verschulden vor. Schadenersatz ist ausgeschlossen.",
    "Der Vertrag ist wirksam. Mängel bestehen nicht.",
    "Die Herausgabe ist nicht geschuldet. Kein Anspruch aus dem Gesetz.",
    "Der Rücktritt ist unwirksam. Die Voraussetzungen liegen nicht vor.",
    "Die Nacherfüllung ist nicht geschuldet. Der Mangel ist nicht erheblich.",
    "Der Schadenersatzanspruch besteht nicht. Keine Kausalität.",
    "Die Verjährung ist gehemmt. Die Forderung ist durchsetzbar.",
    "Notwehr liegt nicht vor. Die Handlung ist rechtswidrig.",
    "Der Versuch ist nicht strafbar. Kein unmittelbares Ansetzen.",
  ];
  for (let i = 0; i < 15 && i < allTasks.length; i++) {
    const t = allTasks[i];
    entries.push(
      makeEntry(
        t,
        "wrong_conclusion",
        corruptConclusion(t.reference_output ?? "", wrongResults[i] ?? "Anspruch abzuweisen."),
        "wrong_conclusion: legal conclusion contradicts the correct application of law",
        "high",
        `Task ${t.id}: conclusion replaced with wrong legal result`
      )
    );
  }

  // 5 × language_contamination
  for (let i = 0; i < 5 && i < allTasks.length; i++) {
    const t = allTasks[i];
    entries.push(
      makeEntry(
        t,
        "language_contamination",
        injectEnglish(t.reference_output ?? ""),
        "language_german: English headings mixed into German output",
        "medium",
        `Task ${t.id}: German section headings replaced with English`
      )
    );
  }

  // 5 × removed_uncertainty
  for (let i = 0; i < 5 && i < allTasks.length; i++) {
    const t = allTasks[i + 10] ?? allTasks[i];
    entries.push(
      makeEntry(
        t,
        "removed_uncertainty",
        removeUncertainty(t.reference_output ?? ""),
        "substantiated_uncertainty: hedging removed, confident claims where uncertainty is warranted",
        "medium",
        `Task ${t.id}: hedging language replaced with confident assertions`
      )
    );
  }

  // 5 × fabricated_law
  const fakeLaws = ["DSGBO", "WpIG", "MarkenGVO", "ZivilGB", "StrafBGB"];
  for (let i = 0; i < 5 && i < allTasks.length; i++) {
    const t = allTasks[i];
    const realLaw = t.expected_laws?.[0] ?? "BGB";
    const fakeLaw = fakeLaws[i] ?? "FakeG";
    entries.push(
      makeEntry(
        t,
        "fabricated_law",
        injectFabricatedLaw(t.reference_output ?? "", realLaw, fakeLaw),
        `law_valid: ${fakeLaw} is not a valid law abbreviation`,
        "high",
        `Task ${t.id}: ${realLaw} replaced with fabricated ${fakeLaw}`
      )
    );
  }

  // 3 × misattributed_quote
  const misattributed = [
    { para: "437", wrong: "gewährt keinen Anspruch, sondern schließt die Gewährleistung aus" },
    { para: "32", wrong: "begründet eine Pflicht zur Hilfeleistung, keinen Rechtfertigungsgrund" },
    { para: "242", wrong: "definiert den Diebstahl als Vergehen mit Gewaltanwendung" },
  ];
  for (let i = 0; i < 3 && i < allTasks.length; i++) {
    const t = allTasks[i];
    const m = misattributed[i] ?? { para: "999", wrong: "ist nicht anwendbar" };
    entries.push(
      makeEntry(
        t,
        "misattributed_quote",
        misattributeContent(t.reference_output ?? "", m.para, m.wrong),
        `misattributed_quote: § ${m.para} content is wrong — describes opposite legal effect`,
        "high",
        `Task ${t.id}: § ${m.para} attributed with wrong legal content`
      )
    );
  }

  // 2 × outdated_law
  const outdated = [
    {
      realLaw: "BGB",
      oldLaw: "ADGB",
      note: "ADGB (Allgemeines Deutsches Handelsgesetzbuch, 1861–1900, replaced by HGB 1900)",
    },
    {
      realLaw: "StGB",
      oldLaw: "RStGB",
      note: "RStGB (Reichsstrafgesetzbuch, 1871–1975, replaced by StGB 1975)",
    },
  ];
  for (let i = 0; i < 2 && i < allTasks.length; i++) {
    const t = allTasks[i];
    const o = outdated[i] ?? { realLaw: "BGB", oldLaw: "ADGB", note: "outdated law" };
    entries.push(
      makeEntry(
        t,
        "outdated_law",
        injectFabricatedLaw(t.reference_output ?? "", o.realLaw, o.oldLaw),
        `outdated_law: ${o.oldLaw} is repealed/superseded — ${o.note}`,
        "high",
        `Task ${t.id}: ${o.realLaw} replaced with outdated ${o.oldLaw}`
      )
    );
  }

  return entries;
}

export const CHALLENGE_SET: ChallengeEntry[] = generateChallengeSet();
