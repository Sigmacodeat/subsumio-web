/**
 * T2.2 — Audit all 105 existing subsumption cases.
 * Evaluates expected_section, expected_conclusion, jurisdiction, known AT errors.
 * Status per case: valid | corrected | removed | disputed.
 * Agent prepares review; juristic approval is external mandatory work.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../../..");

type CaseStatus = "valid" | "corrected" | "removed" | "disputed";

interface SubsumptionCase {
  case_id: string;
  jurisdiction: string;
  facts: string;
  question: string;
  expected_law: string;
  expected_section?: string;
  expected_keywords: string[];
  expected_conclusion: string;
}

interface AuditEntry {
  case_id: string;
  jurisdiction: string;
  expected_law: string;
  expected_section: string;
  expected_conclusion: string;
  status: CaseStatus;
  issues: string[];
  corrections?: {
    expected_section?: string;
    expected_conclusion?: string;
    expected_law?: string;
  };
  notes: string;
}

interface AuditReport {
  audit_date: string;
  total_cases: number;
  by_jurisdiction: Record<string, { total: number; valid: number; corrected: number; removed: number; disputed: number }>;
  by_status: Record<CaseStatus, number>;
  cases: AuditEntry[];
  known_at_errors: string[];
  superseded_metric: string;
}

// ─── Known AT Corrections ────────────────────────────────────────────────
// Manually identified errors in AT fixtures. Agent prepares; human lawyer confirms.

const KNOWN_AT_CORRECTIONS: Record<string, {
  status: CaseStatus;
  issues: string[];
  corrections?: Partial<Pick<SubsumptionCase, "expected_law" | "expected_section" | "expected_conclusion">>;
  notes: string;
}> = {
  // § 43 EheG = Wiederverheiratung nach Todeserklärung, NOT divorce
  "sub-at-035": {
    status: "corrected",
    issues: [
      "expected_section § 43 EheG is about Wiederverheiratung nach Todeserklärung, not divorce",
      "Divorce is in § 46 EheG; separation-based divorce in § 55 EheG",
    ],
    corrections: {
      expected_section: "§ 55",
      expected_conclusion: "Nach § 55 EheG ist eine Scheidung nach Aufhebung der häuslichen Gemeinschaft möglich, wenn die Wiederherstellung der Lebensgemeinschaft nicht erwartet werden kann.",
    },
    notes: "Juristische Freigabe erforderlich. § 43 EheG betrifft Wiederverheiratung nach Todeserklärung.",
  },
  // § 80 BAO ≠ Wiedereinsetzung; correct is § 145 BAO
  "sub-at-031": {
    status: "corrected",
    issues: [
      "expected_section § 80 BAO is not about Wiedereinsetzung",
      "Wiedereinsetzung in den vorigen Stand is regulated in § 145 BAO",
    ],
    corrections: {
      expected_section: "§ 145",
      expected_conclusion: "Nach § 145 BAO kann A Wiedereinsetzung in den vorigen Stand beantragen, wenn er ohne sein Verschulden an der Einhaltung einer Frist gehindert war.",
    },
    notes: "Juristische Freigabe erforderlich. § 80 BAO regelt nicht die Wiedereinsetzung.",
  },
  // § 105 UGB defines OHG; personal liability is § 128 UGB
  "sub-at-019": {
    status: "corrected",
    issues: [
      "expected_section § 105 UGB defines the OHG, not personal liability",
      "Personal unlimited liability of partners is in § 128 UGB",
    ],
    corrections: {
      expected_section: "§ 128",
      expected_conclusion: "Nach § 128 UGB haften die Gesellschafter einer OHG persönlich und unbeschränkt für die Gesellschaftsschulden.",
    },
    notes: "Juristische Freigabe erforderlich. § 105 UGB definiert die OHG, § 128 UGB regelt die Haftung.",
  },
  // § 1166 ABGB = Werkvertrag definition; Gewährleistung is § 1167
  "sub-at-038": {
    status: "corrected",
    issues: [
      "expected_section § 1166 ABGB defines Werkvertrag, warranty rights are in § 1167 ABGB",
      "Question asks about defective work rights (Gewährleistung), not definition",
    ],
    corrections: {
      expected_section: "§ 1167",
      expected_conclusion: "Nach § 1167 ABGB kann A Gewährleistung geltend machen: Nachbesserung, Preisminderung oder Wandlung bei mangelhaftem Werk.",
    },
    notes: "Juristische Freigabe erforderlich. § 1166 definiert den Werkvertrag, § 1167 regelt die Gewährleistung.",
  },
  // § 399 ABGB = Schatzteilung, not finder's duties
  "sub-at-040": {
    status: "corrected",
    issues: [
      "expected_section § 399 ABGB is about Schatzteilung (treasure trove), not finder's duties",
      "Finder's duties are in § 390 ABGB (Anzeigepflicht, Verwahrungspflicht)",
    ],
    corrections: {
      expected_section: "§ 390",
      expected_conclusion: "Nach § 390 ABGB muss A den Fund unverzüglich dem Verlierer oder der zuständigen Behörde anzeigen und die Sache verwahren.",
    },
    notes: "Juristische Freigabe erforderlich. § 399 regelt die Teilung eines Schatzes, nicht die Finderpflichten.",
  },
  // § 366 ABGB = Eigenthumsklage, not debt collection; law should be ZPO
  "sub-at-041": {
    status: "disputed",
    issues: [
      "expected_law 'abgb' is wrong — question is about debt collection procedure (ZPO)",
      "expected_section § 366 ABGB is about Eigenthumsklage (rei vindicatio), not debt collection",
      "DE equivalent (sub-de-051) correctly uses zpo § 253",
    ],
    corrections: {
      expected_law: "zpo",
      expected_section: "§ 236",
      expected_conclusion: "Nach § 236 ZPO muss A eine Klageschrift beim zuständigen Gericht einreichen, die den Streitgegenstand und den Klageantrag enthält.",
    },
    notes: "DISPUTED: Juristische Freigabe erforderlich. Frage ist prozessualer Natur.",
  },
  // § 762 ABGB = Bedingungen und Belastungen, not existence of Pflichtteil
  "sub-at-036": {
    status: "disputed",
    issues: [
      "expected_section § 762 ABGB is about 'Bedingungen und Belastungen' of Pflichtteil, not existence",
      "Existence of Pflichtteilsanspruch is in § 761 ABGB",
    ],
    corrections: {
      expected_section: "§ 761",
      expected_conclusion: "Nach § 761 ABGB haben die Kinder einen Pflichtteilsanspruch, auch wenn sie im Testament enterbt wurden.",
    },
    notes: "DISPUTED: § 762 im Pflichtteil-Kontext, aber regelt Bedingungen. Juristische Freigabe erforderlich.",
  },
  // § 309 ZPO does not exist in AT ZPO; Exekutionsvoraussetzungen are in § 291 ZPO
  "sub-at-025": {
    status: "corrected",
    issues: [
      "expected_section § 309 ZPO does not exist in the AT ZPO corpus",
      "Exekutionsvoraussetzungen (Vollstreckungstitel) are in § 291 ZPO",
    ],
    corrections: {
      expected_section: "§ 291",
      expected_conclusion: "Nach § 291 ZPO benötigt A einen Vollstreckungstitel (z.B. ein Urteil) mit Exekutionsklausel, um die Zwangsvollstreckung durchzuführen.",
    },
    notes: "Juristische Freigabe erforderlich. § 309 existiert nicht in der österreichischen ZPO.",
  },
};

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  outputPath: string;
  outputMd: string;
  outputFixtures: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { outputPath: "", outputMd: "", outputFixtures: "" };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--output-md" && i + 1 < args.length) { out.outputMd = args[++i]; continue; }
    if (a === "--output-fixtures" && i + 1 < args.length) { out.outputFixtures = args[++i]; continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/subsumption/audit-cases.ts [options]\n` +
        `  --output PATH         Write JSON audit protocol\n` +
        `  --output-md PATH      Write Markdown audit protocol\n` +
        `  --output-fixtures PATH Write corrected fixtures as JSONL\n`
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Corpus Loading ──────────────────────────────────────────────────────

interface CorpusIndex {
  [jurisdiction: string]: { [lawSlug: string]: string };
}

function buildCorpusIndex(): CorpusIndex {
  const index: CorpusIndex = {};
  const corpusRoot = join(REPO_ROOT, "law-corpus");
  for (const jur of ["de", "at", "ch", "eu"]) {
    const dir = join(corpusRoot, jur);
    if (!existsSync(dir)) continue;
    index[jur] = {};
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const slug = file.replace(/\.md$/, "");
      index[jur][slug] = readFileSync(join(dir, file), "utf-8");
    }
  }
  return index;
}

// ─── Audit Logic ─────────────────────────────────────────────────────────

function sectionExistsInCorpus(corpusText: string, sectionStr: string): boolean {
  const escaped = sectionStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped.replace(/§\s*/, "§\\s*"), "i");
  return pattern.test(corpusText);
}

function conclusionReferencesSection(conclusion: string, sectionStr: string): boolean {
  const sectionNum = sectionStr.replace(/§\s*/, "");
  const c = conclusion.toLowerCase();
  return c.includes(sectionStr.toLowerCase()) ||
    c.includes(`§ ${sectionNum}`) ||
    c.includes(`§${sectionNum}`);
}

function conclusionReferencesLaw(conclusion: string, lawSlug: string): boolean {
  const c = conclusion.toLowerCase();
  return c.includes(lawSlug.toLowerCase()) || c.includes(lawSlug.toUpperCase().toLowerCase());
}

function loadFixture(path: string): SubsumptionCase[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as SubsumptionCase);
}

const AT_LAW_ALIASES: Record<string, string> = {
  stgb: "stgb-at",
  zpo: "zpo-at",
};

function resolveLawSlug(jurisdiction: string, lawSlug: string): string {
  if (jurisdiction === "at" && AT_LAW_ALIASES[lawSlug]) return AT_LAW_ALIASES[lawSlug];
  return lawSlug;
}

function auditCase(c: SubsumptionCase, corpus: CorpusIndex): AuditEntry {
  const issues: string[] = [];
  const jurCorpus = corpus[c.jurisdiction];
  const resolvedLawSlug = resolveLawSlug(c.jurisdiction, c.expected_law);

  if (!["de", "at"].includes(c.jurisdiction)) {
    issues.push(`Unexpected jurisdiction: ${c.jurisdiction}`);
  }
  if (!jurCorpus || !jurCorpus[resolvedLawSlug]) {
    issues.push(`expected_law '${c.expected_law}' not found in law-corpus/${c.jurisdiction}/`);
  }
  if (c.expected_section && jurCorpus && jurCorpus[resolvedLawSlug]) {
    if (!sectionExistsInCorpus(jurCorpus[resolvedLawSlug], c.expected_section)) {
      issues.push(`expected_section '${c.expected_section}' not found in ${resolvedLawSlug}.md`);
    }
  }
  if (c.expected_section && !conclusionReferencesSection(c.expected_conclusion, c.expected_section)) {
    issues.push(`expected_conclusion does not reference expected_section '${c.expected_section}'`);
  }
  if (!conclusionReferencesLaw(c.expected_conclusion, c.expected_law)) {
    issues.push(`expected_conclusion does not reference expected_law '${c.expected_law}'`);
  }
  if (!c.expected_section) issues.push("expected_section is missing");
  if (!c.expected_conclusion || c.expected_conclusion.length < 10) issues.push("expected_conclusion missing or too short");
  if (!c.expected_keywords || c.expected_keywords.length === 0) issues.push("expected_keywords is empty");

  const known = KNOWN_AT_CORRECTIONS[c.case_id];
  if (known) {
    return {
      case_id: c.case_id, jurisdiction: c.jurisdiction,
      expected_law: c.expected_law, expected_section: c.expected_section ?? "",
      expected_conclusion: c.expected_conclusion,
      status: known.status, issues: [...issues, ...known.issues],
      corrections: known.corrections, notes: known.notes,
    };
  }

  const hasMajorIssue = issues.some(i => i.includes("not found in") || i.includes("missing"));
  const status: CaseStatus = hasMajorIssue ? "disputed" : "valid";

  return {
    case_id: c.case_id, jurisdiction: c.jurisdiction,
    expected_law: c.expected_law, expected_section: c.expected_section ?? "",
    expected_conclusion: c.expected_conclusion,
    status, issues,
    notes: issues.length === 0 ? "No issues found." : "Agent-flagged for human review.",
  };
}

// ─── Markdown Report ─────────────────────────────────────────────────────

function generateMarkdownReport(report: AuditReport, duplicates: string[]): string {
  const lines: string[] = [];
  lines.push("# Subsumption Case Audit Protocol — T2.2");
  lines.push("");
  lines.push(`**Audit Date:** ${report.audit_date}`);
  lines.push(`**Total Cases:** ${report.total_cases}`);
  lines.push("");
  lines.push("## Summary by Status");
  lines.push("");
  lines.push("| Status | Count | Percentage |");
  lines.push("|--------|-------|-----------|");
  for (const s of ["valid", "corrected", "removed", "disputed"] as CaseStatus[]) {
    const n = report.by_status[s];
    lines.push(`| ${s} | ${n} | ${(n / report.total_cases * 100).toFixed(1)}% |`);
  }
  lines.push("");
  lines.push("## Summary by Jurisdiction");
  lines.push("");
  for (const [jur, stats] of Object.entries(report.by_jurisdiction)) {
    lines.push(`### ${jur.toUpperCase()} (${stats.total} cases)`);
    lines.push(`- valid: ${stats.valid}`);
    lines.push(`- corrected: ${stats.corrected}`);
    lines.push(`- removed: ${stats.removed}`);
    lines.push(`- disputed: ${stats.disputed}`);
    lines.push("");
  }
  if (duplicates.length > 0) {
    lines.push("## Duplicate Case IDs");
    lines.push("");
    for (const d of duplicates) lines.push(`- ${d}`);
    lines.push("");
  }
  lines.push("## Superseded Metric");
  lines.push("");
  lines.push(`> ${report.superseded_metric}`);
  lines.push("");
  lines.push("## Known AT Errors (Regression Fixtures)");
  lines.push("");
  for (const id of report.known_at_errors) {
    const e = report.cases.find(c => c.case_id === id);
    if (!e) continue;
    lines.push(`### ${id} — Status: ${e.status}`);
    lines.push(`- **Law:** ${e.expected_law} ${e.expected_section}`);
    lines.push(`- **Issues:**`);
    for (const iss of e.issues) lines.push(`  - ${iss}`);
    if (e.corrections) {
      lines.push(`- **Corrections:**`);
      if (e.corrections.expected_law) lines.push(`  - expected_law → ${e.corrections.expected_law}`);
      if (e.corrections.expected_section) lines.push(`  - expected_section → ${e.corrections.expected_section}`);
      if (e.corrections.expected_conclusion) lines.push(`  - expected_conclusion → ${e.corrections.expected_conclusion}`);
    }
    lines.push(`- **Notes:** ${e.notes}`);
    lines.push("");
  }
  lines.push("## All Cases");
  lines.push("");
  lines.push("| Case ID | Jur | Law | Section | Status | Issues |");
  lines.push("|---------|-----|-----|---------|--------|--------|");
  for (const e of report.cases) {
    const issueCount = e.issues.length;
    lines.push(`| ${e.case_id} | ${e.jurisdiction} | ${e.expected_law} | ${e.expected_section} | ${e.status} | ${issueCount} |`);
  }
  lines.push("");
  lines.push("## Detailed Case Entries");
  lines.push("");
  for (const e of report.cases) {
    if (e.status === "valid" && e.issues.length === 0) continue;
    lines.push(`### ${e.case_id} — ${e.status}`);
    lines.push(`- **Jurisdiction:** ${e.jurisdiction}`);
    lines.push(`- **Expected:** ${e.expected_law} ${e.expected_section}`);
    lines.push(`- **Conclusion:** ${e.expected_conclusion.substring(0, 120)}...`);
    lines.push(`- **Issues:**`);
    for (const iss of e.issues) lines.push(`  - ${iss}`);
    if (e.corrections) {
      lines.push(`- **Proposed Corrections:**`);
      if (e.corrections.expected_law) lines.push(`  - law → ${e.corrections.expected_law}`);
      if (e.corrections.expected_section) lines.push(`  - section → ${e.corrections.expected_section}`);
      if (e.corrections.expected_conclusion) lines.push(`  - conclusion → ${e.corrections.expected_conclusion}`);
    }
    lines.push(`- **Notes:** ${e.notes}`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("**Disclaimer:** This audit was prepared by an AI agent. Juridical review is external mandatory work. No legal validity is claimed.");
  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);
  const corpus = buildCorpusIndex();
  const fixtureDir = join(REPO_ROOT, "server", "test", "fixtures");
  const allCases: SubsumptionCase[] = [
    ...loadFixture(join(fixtureDir, "de-subsumption-expanded.jsonl")),
    ...loadFixture(join(fixtureDir, "at-subsumption-expanded.jsonl")),
  ];

  process.stderr.write(
    `[audit] loaded ${allCases.length} cases ` +
    `(${allCases.filter(c => c.jurisdiction === "de").length} DE, ` +
    `${allCases.filter(c => c.jurisdiction === "at").length} AT)\n`
  );

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const c of allCases) {
    if (seen.has(c.case_id)) duplicates.push(c.case_id);
    seen.add(c.case_id);
  }

  const entries: AuditEntry[] = allCases.map(c => auditCase(c, corpus));

  const byJurisdiction: AuditReport["by_jurisdiction"] = {};
  const byStatus: AuditReport["by_status"] = { valid: 0, corrected: 0, removed: 0, disputed: 0 };
  for (const e of entries) {
    if (!byJurisdiction[e.jurisdiction]) {
      byJurisdiction[e.jurisdiction] = { total: 0, valid: 0, corrected: 0, removed: 0, disputed: 0 };
    }
    byJurisdiction[e.jurisdiction].total++;
    byJurisdiction[e.jurisdiction][e.status]++;
    byStatus[e.status]++;
  }

  const report: AuditReport = {
    audit_date: new Date().toISOString(),
    total_cases: entries.length,
    by_jurisdiction: byJurisdiction, by_status: byStatus, cases: entries,
    known_at_errors: Object.keys(KNOWN_AT_CORRECTIONS),
    superseded_metric: "95,2% Pass Rate (E2E Subsumption Benchmark v3) — superseded by this audit. Do not display as quality number until re-validated.",
  };

  if (opts.outputPath) {
    writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
    process.stderr.write(`[audit] JSON protocol written to ${opts.outputPath}\n`);
  }
  if (opts.outputMd) {
    writeFileSync(opts.outputMd, generateMarkdownReport(report, duplicates));
    process.stderr.write(`[audit] Markdown protocol written to ${opts.outputMd}\n`);
  }
  if (opts.outputFixtures) {
    const lines: string[] = [];
    for (const e of entries) {
      const original = allCases.find(c => c.case_id === e.case_id);
      if (!original || e.status === "valid") continue;
      const corrected = { ...original };
      if (e.corrections?.expected_law) corrected.expected_law = e.corrections.expected_law;
      if (e.corrections?.expected_section) corrected.expected_section = e.corrections.expected_section;
      if (e.corrections?.expected_conclusion) corrected.expected_conclusion = e.corrections.expected_conclusion;
      lines.push(JSON.stringify(corrected));
    }
    writeFileSync(opts.outputFixtures, lines.join("\n") + "\n");
    process.stderr.write(`[audit] Corrected fixtures written to ${opts.outputFixtures} (${lines.length} cases)\n`);
  }

  // Console summary
  process.stderr.write(`\n[audit] SUMMARY (${entries.length} cases)\n`);
  for (const s of ["valid", "corrected", "removed", "disputed"] as CaseStatus[]) {
    process.stderr.write(`  ${s}: ${byStatus[s]} (${(byStatus[s] / entries.length * 100).toFixed(1)}%)\n`);
  }
  for (const [jur, stats] of Object.entries(byJurisdiction)) {
    process.stderr.write(`  ${jur}: valid=${stats.valid} corrected=${stats.corrected} disputed=${stats.disputed} removed=${stats.removed}\n`);
  }
}

main();

