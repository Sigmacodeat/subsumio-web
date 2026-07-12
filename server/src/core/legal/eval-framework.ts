/**
 * Gap 15: Eval Framework — Leave-one-out-Validation pro Specialist.
 *
 * Harvey-Feature: "Before any Tool Bundle or system prompt upgrade can be deployed,
 * it must pass tests demonstrating that existing capabilities maintain their
 * performance levels" — Leave-one-out validation gating.
 *
 * This module provides:
 * - EvalDataset: A set of gold-standard inputs + expected outputs per specialist
 * - runEval: Runs a specialist against the dataset and scores results
 * - leaveOneOutEval: Removes one test case, runs specialist on it, checks if
 *   the specialist still produces correct output (regression detection)
 *
 * Usage:
 *   const dataset = loadEvalDataset('on-scanner');
 *   const results = await runEval({ specialistName: 'on-scanner', dataset, engine, queue });
 *   if (!results.passed) throw new Error('Eval gate failed — do not deploy');
 */

export interface EvalCase {
  /** Unique ID within the dataset */
  id: string;
  /** Input text (the "document" to process) */
  input: string;
  /** Expected output (JSON structure for structured specialists, or text for draft/critic) */
  expected: unknown;
  /** Human-readable description of what this case tests */
  description: string;
  /** Optional: specific fields to check (if not all fields matter) */
  checkFields?: string[];
}

export interface EvalDataset {
  specialist_name: string;
  version: string;
  cases: EvalCase[];
}

export interface EvalResult {
  case_id: string;
  passed: boolean;
  score: number;
  errors: string[];
  duration_ms: number;
}

export interface EvalRunResult {
  specialist_name: string;
  dataset_version: string;
  total_cases: number;
  passed_cases: number;
  pass_rate: number;
  avg_score: number;
  results: EvalResult[];
  /** True if pass_rate >= threshold (default 0.8) */
  passed: boolean;
  duration_ms: number;
}

export interface RunEvalOpts {
  specialistName: string;
  dataset: EvalDataset;
  engine: unknown;
  queue: unknown;
  /** Pass rate threshold (0-1, default 0.8) */
  threshold?: number;
  /** Leave-one-out mode: skip one case and run the rest, then check the skipped one */
  leaveOneOut?: boolean;
  /** Wall-clock limit for one specialist job (default: 5 minutes). */
  caseTimeoutMs?: number;
  /** Queue polling interval (default: 500ms). Primarily useful for tests. */
  pollIntervalMs?: number;
}

type EvalJobStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "dead"
  | "cancelled"
  | "waiting-children"
  | "paused";

interface EvalJob {
  id: number;
  status: EvalJobStatus;
  result: Record<string, unknown> | null;
  error_text: string | null;
}

interface EvalQueue {
  add(
    name: string,
    data?: Record<string, unknown>,
    opts?: Record<string, unknown>
  ): Promise<EvalJob>;
  getJob(id: number): Promise<EvalJob | null>;
}

const TERMINAL_EVAL_STATUSES = new Set<EvalJobStatus>([
  "completed",
  "failed",
  "dead",
  "cancelled",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalize the subagent's final text into the value expected by an eval case. */
export function parseEvalOutput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return text;

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? text;
  try {
    return JSON.parse(candidate);
  } catch {
    return text;
  }
}

function extractCompletedOutput(job: EvalJob): unknown {
  const result = job.result;
  if (!result) {
    throw new Error(`Eval job ${job.id} completed without a result`);
  }

  // The subagent handler returns { result: finalText, ...metadata }.
  if (Object.prototype.hasOwnProperty.call(result, "result")) {
    return parseEvalOutput(result.result);
  }
  // Keep compatibility with handlers that return a direct `output` field.
  if (Object.prototype.hasOwnProperty.call(result, "output")) {
    return parseEvalOutput(result.output);
  }
  return result;
}

/**
 * Compare actual output to expected output.
 * Returns a score (0-1) and list of errors.
 */
function compareOutput(
  actual: unknown,
  expected: unknown,
  checkFields?: string[]
): { score: number; errors: string[] } {
  const errors: string[] = [];
  let checks = 0;
  let passed = 0;

  if (checkFields && Array.isArray(checkFields) && checkFields.length > 0) {
    // Field-by-field comparison
    const actualObj = actual as Record<string, unknown>;
    const expectedObj = expected as Record<string, unknown>;
    for (const field of checkFields) {
      checks++;
      const actualVal = actualObj?.[field];
      const expectedVal = expectedObj?.[field];
      if (JSON.stringify(actualVal) === JSON.stringify(expectedVal)) {
        passed++;
      } else {
        errors.push(
          `Field "${field}": expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actualVal)}`
        );
      }
    }
  } else {
    // Full comparison
    checks++;
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      passed++;
    } else {
      errors.push("Full output mismatch");
    }
  }

  const score = checks > 0 ? passed / checks : 0;
  return { score, errors };
}

/**
 * Run eval for a single case.
 */
async function runEvalCase(
  caseData: EvalCase,
  specialistName: string,
  queue: EvalQueue,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<{ actual: unknown; duration_ms: number }> {
  const start = Date.now();
  const child = await queue.add(
    "subagent",
    {
      prompt: caseData.input,
      subagent_def: specialistName,
      max_turns: 15,
    },
    {
      timeout_ms: timeoutMs,
      remove_on_complete: false,
      remove_on_fail: false,
    }
  );

  while (Date.now() - start < timeoutMs) {
    const job = await queue.getJob(child.id);
    if (!job) throw new Error(`Eval job ${child.id} disappeared from the queue`);

    if (job.status === "completed") {
      return { actual: extractCompletedOutput(job), duration_ms: Date.now() - start };
    }
    if (TERMINAL_EVAL_STATUSES.has(job.status)) {
      throw new Error(
        `Eval job ${job.id} ended with status ${job.status}: ${job.error_text ?? "no error detail"}`
      );
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`Eval job ${child.id} timed out after ${timeoutMs}ms`);
}

/**
 * Run eval for a specialist against a dataset.
 */
export async function runEval(opts: RunEvalOpts): Promise<EvalRunResult> {
  const {
    specialistName,
    dataset,
    queue,
    threshold = 0.8,
    caseTimeoutMs = 5 * 60_000,
    pollIntervalMs = 500,
  } = opts;
  const start = Date.now();
  const results: EvalResult[] = [];

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`threshold must be between 0 and 1, got ${threshold}`);
  }
  if (!Number.isFinite(caseTimeoutMs) || caseTimeoutMs <= 0) {
    throw new Error(`caseTimeoutMs must be greater than 0, got ${caseTimeoutMs}`);
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new Error(`pollIntervalMs must be at least 0, got ${pollIntervalMs}`);
  }

  const evalQueue = queue as EvalQueue;
  if (!evalQueue || typeof evalQueue.add !== "function" || typeof evalQueue.getJob !== "function") {
    throw new Error("runEval requires a queue with add() and getJob() methods");
  }

  for (const caseData of dataset.cases) {
    const caseStart = Date.now();
    try {
      const { actual, duration_ms } = await runEvalCase(
        caseData,
        specialistName,
        evalQueue,
        caseTimeoutMs,
        pollIntervalMs
      );
      const { score, errors } = compareOutput(actual, caseData.expected, caseData.checkFields);
      results.push({
        case_id: caseData.id,
        passed: score >= 1.0,
        score,
        errors,
        duration_ms,
      });
    } catch (err) {
      results.push({
        case_id: caseData.id,
        passed: false,
        score: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        duration_ms: Date.now() - caseStart,
      });
    }
  }

  const passedCases = results.filter((r) => r.passed).length;
  const passRate = results.length > 0 ? passedCases / results.length : 0;
  const avgScore =
    results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0;

  return {
    specialist_name: specialistName,
    dataset_version: dataset.version,
    total_cases: results.length,
    passed_cases: passedCases,
    pass_rate: passRate,
    avg_score: avgScore,
    results,
    passed: passRate >= threshold,
    duration_ms: Date.now() - start,
  };
}

/**
 * Leave-one-out validation: for each case, remove it from the dataset,
 * run the specialist on the remaining cases, then check if the removed
 * case still passes. This detects regressions where a prompt change
 * breaks a previously working capability.
 */
export async function leaveOneOutEval(
  opts: RunEvalOpts
): Promise<EvalRunResult & { regressions: string[] }> {
  const { dataset, threshold = 0.8 } = opts;
  const regressions: string[] = [];
  const allResults: EvalResult[] = [];

  for (let i = 0; i < dataset.cases.length; i++) {
    const leftOutCase = dataset.cases[i]!;
    const remainingCases = dataset.cases.filter((_, idx) => idx !== i);

    // Run on remaining cases
    const remainingResult = await runEval({
      ...opts,
      dataset: { ...dataset, cases: remainingCases },
      threshold: 0, // Don't gate on intermediate runs
    });

    // Now run on the left-out case
    const leftOutResult = await runEval({
      ...opts,
      dataset: { ...dataset, cases: [leftOutCase] },
      threshold: 0,
    });

    const leftOutEvalResult = leftOutResult.results[0]!;
    allResults.push(leftOutEvalResult);

    if (!leftOutEvalResult.passed) {
      regressions.push(leftOutCase.id);
    }
  }

  const passedCases = allResults.filter((r) => r.passed).length;
  const passRate = allResults.length > 0 ? passedCases / allResults.length : 0;
  const avgScore =
    allResults.length > 0 ? allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length : 0;

  return {
    specialist_name: opts.specialistName,
    dataset_version: dataset.version,
    total_cases: allResults.length,
    passed_cases: passedCases,
    pass_rate: passRate,
    avg_score: avgScore,
    results: allResults,
    passed: passRate >= threshold,
    regressions,
    duration_ms: 0, // Set by caller
  };
}

// ── Default eval datasets (gold-standard cases) ──────────────

export const ON_SCANNER_EVAL: EvalDataset = {
  specialist_name: "on-scanner",
  version: "1.1.0",
  cases: [
    {
      id: "on-basic-1",
      input: `ON 1.4\nEingang: 15.03.2023\nSeiten: 50001-50005\nPersonen: Mustermann, Eckerstorfer\n\nAnzeige gegen unbekannt.`,
      expected: {
        on_entries: [
          {
            on_nummer: "ON 1.4",
            datum: "15.03.2023",
            typ: "Eingang",
            seiten: "50001-50005",
            personen: ["Mustermann", "Eckerstorfer"],
            quote: "Anzeige gegen unbekannt.",
          },
        ],
      },
      checkFields: ["on_entries"],
      description: "Basic ON extraction with single entry",
    },
    {
      id: "on-cross-ref",
      input: `ON 40.2.6\nVernehmung Protokoll\nSeiten: 50985-50991\nPersonen: Hrustemovic\n\n(siehe auch ON 40.1 für Antrag)`,
      expected: {
        on_entries: [
          {
            on_nummer: "ON 40.2.6",
            typ: "Vernehmung Protokoll",
            seiten: "50985-50991",
            personen: ["Hrustemovic"],
          },
        ],
      },
      checkFields: ["on_entries"],
      description: "ON with cross-reference to another ON",
    },
    // A4: GZ validation golden-set cases
    {
      id: "gz-ocr-confusable-O-as-0",
      input: `Geschäftszahl: 1O C 125/95t - 1\nON 1\nEingang: 15.03.2023\n\nBeschluss vom 3.5.2024.`,
      expected: {
        on_entries: [
          {
            on_nummer: "ON 1",
            gz_raw: "1O C 125/95t",
          },
        ],
        gz_befunde: [{ code: "ocr_verdacht", schwere: "fehler" }],
      },
      checkFields: ["gz_befunde"],
      description: "A4: OCR confusable O instead of 0 in GZ — must flag ocr_verdacht",
    },
    {
      id: "gz-ocr-confusable-l-as-1",
      input: `Geschäftszahl: l0 C 125/95t - 1\nON 1\nEingang: 15.03.2023\n\nBeschluss.`,
      expected: {
        gz_befunde: [{ code: "ocr_verdacht", schwere: "fehler" }],
      },
      checkFields: ["gz_befunde"],
      description: "A4: OCR confusable l instead of 1 in GZ — must flag ocr_verdacht",
    },
    {
      id: "gz-uppercase-pruefzeichen",
      input: `Geschäftszahl: 10 C 125/95T - 1\nON 1\nEingang: 15.03.2023\n\nBeschluss.`,
      expected: {
        gz_befunde: [{ code: "pruefzeichen_grossbuchstabe", schwere: "warnung" }],
      },
      checkFields: ["gz_befunde"],
      description: "A4: Uppercase Prüfzeichen T instead of t — must flag as OCR warning",
    },
    {
      id: "gz-on-sub-order",
      input: `Geschäftszahl: 10 C 125/95t - 40.2.6\nON 40.2.6\nVernehmung Protokoll\nSeiten: 50985-50991\n\nZeugenaussage.`,
      expected: {
        on_entries: [
          {
            on_nummer: "ON 40.2.6",
            gz_raw: "10 C 125/95t - 40.2.6",
          },
        ],
      },
      checkFields: ["on_entries"],
      description: "A4: ON sub-order numbering (40.2.6) — must parse correctly",
    },
    {
      id: "gz-foreign-akt",
      input: `Aktenzeichen: 4 O 123/22\nON 1\nEingang: 15.03.2023\n\nKlage gegen Beklagte.`,
      expected: {
        gz_befunde: [{ code: "gattung_unbekannt" }],
      },
      checkFields: ["gz_befunde"],
      description: "A4: Foreign (DE) GZ with unknown Gattungszeichen — must flag gattung_unbekannt",
    },
    {
      id: "gz-clean-civil",
      input: `Geschäftszahl: 10 C 125/95t - 1\nON 1\nEingang: 15.03.2023\n\nKlage.`,
      expected: {
        gz_befunde: [],
        gz_einheitlich: true,
      },
      checkFields: ["gz_befunde", "gz_einheitlich"],
      description: "A4: Clean civil GZ — no befunde, einheitlich=true",
    },
  ],
};

export const ENTITY_EXTRACTOR_EVAL: EvalDataset = {
  specialist_name: "entity-extractor",
  version: "1.0.0",
  cases: [
    {
      id: "entity-basic-1",
      input: `Zeuge Adis Hrustemovic, geb. 1985, wohnhaft in Linz, sagte aus, dass er den Beschuldigten Toni Remik kannte.`,
      expected: {
        entities: [
          {
            name: "Adis Hrustemovic",
            type: "person",
            role: "zeuge",
            aliases: ["Hrustemovic"],
          },
          {
            name: "Toni Remik",
            type: "person",
            role: "beschuldigter",
            aliases: ["Remik"],
          },
        ],
      },
      checkFields: ["entities"],
      description: "Basic entity extraction with two persons",
    },
  ],
};

export const FORENSIC_ANALYST_EVAL: EvalDataset = {
  specialist_name: "forensic-analyst",
  version: "1.0.0",
  cases: [
    {
      id: "forensic-basic-1",
      input: `ON 10: Festnahme beantragt am 01.04.2023. ON 15: Festnahme wurde NICHT veranlasst. ON 20: Zeuge X wurde nicht vernommen.`,
      expected: {
        summary: {
          unterlassene_ermittlungen: ["Festnahme"],
          nicht_vernommene: ["Zeuge X"],
        },
      },
      checkFields: ["summary"],
      description: "Basic forensic analysis with unterlassene Maßnahmen",
    },
  ],
};

export const LEGAL_CRITIC_EVAL: EvalDataset = {
  specialist_name: "legal-critic",
  version: "1.0.0",
  cases: [
    {
      id: "critic-hallucination-1",
      input: `Forensic Report enthält: "§ 110 Abs 1 Z 2 StPO" — prüfe gegen RIS.`,
      expected: {
        total_score: 0,
        recommendation: "reject",
      },
      checkFields: ["recommendation"],
      description: "Critic should reject hallucinated §",
    },
  ],
};

/**
 * Get the eval dataset for a specialist.
 */
export function getEvalDataset(specialistName: string): EvalDataset | null {
  switch (specialistName) {
    case "on-scanner":
      return ON_SCANNER_EVAL;
    case "entity-extractor":
      return ENTITY_EXTRACTOR_EVAL;
    case "forensic-analyst":
      return FORENSIC_ANALYST_EVAL;
    case "legal-critic":
      return LEGAL_CRITIC_EVAL;
    default:
      return null;
  }
}

/**
 * Run eval gate for a specialist.
 * Returns true if the specialist passes the eval gate.
 * This should be called before deploying any prompt change.
 */
export async function evalGate(
  specialistName: string,
  engine: unknown,
  queue: unknown,
  opts?: { threshold?: number; leaveOneOut?: boolean }
): Promise<{ passed: boolean; result: EvalRunResult }> {
  const dataset = getEvalDataset(specialistName);
  if (!dataset) {
    return {
      passed: true,
      result: {
        specialist_name: specialistName,
        dataset_version: "none",
        total_cases: 0,
        passed_cases: 0,
        pass_rate: 1,
        avg_score: 1,
        results: [],
        passed: true,
        duration_ms: 0,
      },
    };
  }

  const result = opts?.leaveOneOut
    ? await leaveOneOutEval({ specialistName, dataset, engine, queue, threshold: opts?.threshold })
    : await runEval({ specialistName, dataset, engine, queue, threshold: opts?.threshold });

  return { passed: result.passed, result };
}
