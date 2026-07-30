/**
 * Claim-Level Evaluation Module
 *
 * Decomposes LLM answers into atomic claims and verifies each claim
 * against the retrieved context. This provides a more granular evaluation
 * than criterion-level judging:
 *
 * - Claim Precision: fraction of claims that are supported by context
 * - Misgrounding Rate: fraction of claims NOT supported by context
 * - Claim Recall: fraction of expected claims present in the answer
 * - Hallucination Detection: unsupported claims flagged for review
 *
 * Usage:
 *   const result = await evaluateClaims({
 *     answer: "Gemäß § 823 BGB...",
 *     context: "§ 823 BGB: Wer vorsätzlich oder fahrlässig...",
 *     expectedClaims: ["§ 823 BGB wird zitiert", "Verschuldensprinzip erwähnt"],
 *     chatFn: async (opts) => { ... },
 *   });
 */

import type { ChatOpts, ChatResult } from "./lab-dach/rubric-judge.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface Claim {
  id: number;
  text: string;
  /** Whether this claim is supported by the provided context */
  supported: boolean;
  /** Evidence quote from context supporting the claim, if found */
  evidence?: string;
  /** Whether the claim is a hallucination (not supported) */
  hallucinated: boolean;
}

export interface ExpectedClaim {
  text: string;
  /** Whether this expected claim was found in the answer */
  found: boolean;
  /** Matching claim ID from the answer, if found */
  matched_claim_id?: number;
}

export interface ClaimEvaluationResult {
  /** All claims extracted from the answer */
  claims: Claim[];
  /** Expected claims checked against the answer */
  expected_claims: ExpectedClaim[];
  /** Metrics */
  metrics: {
    /** Total number of claims in the answer */
    total_claims: number;
    /** Number of claims supported by context */
    supported_claims: number;
    /** Number of claims NOT supported by context (potential hallucinations) */
    unsupported_claims: number;
    /** Fraction of claims supported by context */
    claim_precision: number;
    /** Fraction of claims not supported (1 - precision) */
    misgrounding_rate: number;
    /** Number of expected claims found in the answer */
    expected_found: number;
    /** Total expected claims */
    expected_total: number;
    /** Fraction of expected claims present in the answer */
    claim_recall: number;
    /** Overall pass: precision >= threshold AND recall >= threshold */
    pass: boolean;
  };
  /** Hallucinated claims for review */
  hallucinated_claims: Claim[];
}

export interface ClaimEvalOpts {
  /** The LLM-generated answer to evaluate */
  answer: string;
  /** The retrieved context (law chunks) provided to the agent */
  context: string;
  /** Expected claims that should appear in a correct answer */
  expectedClaims?: string[];
  /** Minimum claim precision to pass (default: 0.8) */
  minPrecision?: number;
  /** Minimum claim recall to pass (default: 0.6) */
  minRecall?: number;
  /** Chat function for LLM-based claim extraction and verification */
  chatFn: (opts: ChatOpts) => Promise<ChatResult>;
}

// ── Claim Extraction ──────────────────────────────────────────────────

const CLAIM_EXTRACTION_SYSTEM = `Du bist ein juristischer Claim-Extractor. Deine Aufgabe ist es, eine Rechtsantwort in atomare Faktenbehauptungen (Claims) zu zerlegen.

Jeder Claim ist ein einzelner, überprüfbarer Sachverhalt — keine Meinung, keine Frage, keine Verabschiedung.

Beispiele:
- "§ 823 BGB regelt die Schadensersatzpflicht bei vorsätzlicher oder fahrlässiger Schädigung"
- "Der Verschuldensprinzip gilt im deutschen Schadensersatzrecht"
- "Die Verjährungsfrist beträgt 3 Jahre"

Antworte IMMER als JSON-Array:
\`\`\`json
[
  {"id": 1, "text": "Claim 1..."},
  {"id": 2, "text": "Claim 2..."}
]
\`\`\`

Regeln:
- Jeder Claim muss eigenständig verständlich sein
- Keine doppelten Claims
- Keine Meta-Aussagen ("Die Antwort ist...")
- Maximal 15 Claims pro Antwort`;

const CLAIM_VERIFICATION_SYSTEM = `Du bist ein juristischer Claim-Verifier. Du überprüfst, ob ein einzelner Claim durch den bereitgestellten Kontext (Gesetze, Rechtsprechung) gestützt wird.

Bewertung:
- "supported": Der Claim wird durch den Kontext eindeutig gestützt
- "unsupported": Der Claim wird durch den Kontext NICHT gestützt (mögliche Halluzination)
- "partial": Der Claim wird teilweise gestützt, aber enthält unbelegte Zusätze

Antworte IMMER als JSON:
\`\`\`json
{
  "status": "supported" | "unsupported" | "partial",
  "evidence": "Zitat aus dem Kontext, das den Claim stützt (oder leer wenn unsupported)",
  "reasoning": "Kurze Begründung"
}
\`\`\`

Wichtig:
- Sei streng: Ein Claim ist nur "supported", wenn der Kontext die Aussage eindeutig bestätigt
- "partial" bedeutet, dass ein Kernfakt stimmt, aber zusätzliche Behauptungen unbelegt sind
- Behandle "partial" als "unsupported" für die Halluzinationsprüfung
- Zitiere immer die genaue Textstelle aus dem Kontext`;

const EXPECTED_CLAIM_CHECK_SYSTEM = `Du bist ein juristischer Claim-Matcher. Du überprüfst, ob ein erwarteter Claim in einer Liste von Claims aus einer Antwort enthalten ist.

Ein Match liegt vor, wenn ein Claim aus der Antwort den gleichen Sachverhalt ausdrückt wie der erwartete Claim — auch wenn die Formulierung leicht abweicht.

Antworte IMMER als JSON:
\`\`\`json
{
  "found": true | false,
  "matched_claim_id": 123 | null,
  "reasoning": "Kurze Begründung"
}
\`\`\``;

// ── JSON Parser ───────────────────────────────────────────────────────

function parseJSON<T>(raw: string): T | null {
  if (!raw || raw.trim() === "") return null;
  // Strategy 1: Code block
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]!.trim()) as T;
    } catch {
      /* fall through */
    }
  }
  // Strategy 2: Direct parse
  try {
    return JSON.parse(raw.trim()) as T;
  } catch {
    /* fall through */
  }
  // Strategy 3: Find first JSON array/object
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T;
    } catch {
      /* fall through */
    }
  }
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      /* fall through */
    }
  }
  return null;
}

// ── Claim Extraction ──────────────────────────────────────────────────

interface ExtractedClaim {
  id: number;
  text: string;
}

async function extractClaims(
  answer: string,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<ExtractedClaim[]> {
  const result = await chatFn({
    system: CLAIM_EXTRACTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: `## Rechtsantwort\n\n${answer.slice(0, 6000)}\n\nExtrahiere alle atomaren Claims.`,
      },
    ],
    maxTokens: 2048,
    temperature: 0,
    responseFormat: { type: "json_object" },
  });
  const parsed = parseJSON<ExtractedClaim[]>(result.text);
  if (!parsed || !Array.isArray(parsed)) return [];
  return parsed.filter((c) => typeof c.id === "number" && typeof c.text === "string");
}

// ── Claim Verification ────────────────────────────────────────────────

interface VerificationResult {
  status: "supported" | "unsupported" | "partial";
  evidence: string;
  reasoning: string;
}

async function verifyClaim(
  claim: ExtractedClaim,
  context: string,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<VerificationResult> {
  const result = await chatFn({
    system: CLAIM_VERIFICATION_SYSTEM,
    messages: [
      {
        role: "user",
        content: `## Kontext\n---\n${context.slice(0, 8000)}\n---\n\n## Claim\n${claim.text}\n\nIst dieser Claim durch den Kontext gestützt?`,
      },
    ],
    maxTokens: 512,
    temperature: 0,
    responseFormat: { type: "json_object" },
  });
  const parsed = parseJSON<VerificationResult>(result.text);
  if (!parsed) {
    return { status: "unsupported", evidence: "", reasoning: "Parse error — fail-closed" };
  }
  return parsed;
}

// ── Expected Claim Matching ───────────────────────────────────────────

interface ExpectedClaimMatch {
  found: boolean;
  matched_claim_id: number | null;
  reasoning: string;
}

async function matchExpectedClaim(
  expectedClaim: string,
  answerClaims: ExtractedClaim[],
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<ExpectedClaimMatch> {
  const claimsList = answerClaims.map((c) => `  ${c.id}: ${c.text}`).join("\n");
  const result = await chatFn({
    system: EXPECTED_CLAIM_CHECK_SYSTEM,
    messages: [
      {
        role: "user",
        content: `## Erwarteter Claim\n${expectedClaim}\n\n## Claims aus der Antwort\n${claimsList}\n\nIst der erwartete Claim in der Antwort enthalten?`,
      },
    ],
    maxTokens: 256,
    temperature: 0,
    responseFormat: { type: "json_object" },
  });
  const parsed = parseJSON<ExpectedClaimMatch>(result.text);
  if (!parsed) {
    return { found: false, matched_claim_id: null, reasoning: "Parse error" };
  }
  return parsed;
}

// ── Main Evaluation Function ──────────────────────────────────────────

export async function evaluateClaims(opts: ClaimEvalOpts): Promise<ClaimEvaluationResult> {
  const minPrecision = opts.minPrecision ?? 0.8;
  const minRecall = opts.minRecall ?? 0.6;

  // 1. Extract claims from the answer
  const extracted = await extractClaims(opts.answer, opts.chatFn);

  // 2. Verify each claim against the context
  const claims: Claim[] = [];
  for (const ec of extracted) {
    const verification = await verifyClaim(ec, opts.context, opts.chatFn);
    const supported = verification.status === "supported";
    claims.push({
      id: ec.id,
      text: ec.text,
      supported,
      evidence: verification.evidence || undefined,
      hallucinated: !supported,
    });
  }

  // 3. Check expected claims against the answer
  const expectedClaims: ExpectedClaim[] = [];
  if (opts.expectedClaims && opts.expectedClaims.length > 0) {
    for (const ec of opts.expectedClaims) {
      const match = await matchExpectedClaim(ec, extracted, opts.chatFn);
      expectedClaims.push({
        text: ec,
        found: match.found,
        matched_claim_id: match.matched_claim_id ?? undefined,
      });
    }
  }

  // 4. Compute metrics
  const totalClaims = claims.length;
  const supportedClaims = claims.filter((c) => c.supported).length;
  const unsupportedClaims = claims.filter((c) => !c.supported).length;
  const claimPrecision = totalClaims > 0 ? supportedClaims / totalClaims : 0;
  const misgroundingRate = totalClaims > 0 ? unsupportedClaims / totalClaims : 0;

  const expectedFound = expectedClaims.filter((c) => c.found).length;
  const expectedTotal = expectedClaims.length;
  const claimRecall = expectedTotal > 0 ? expectedFound / expectedTotal : 1.0;

  const pass = claimPrecision >= minPrecision && claimRecall >= minRecall;

  return {
    claims,
    expected_claims: expectedClaims,
    metrics: {
      total_claims: totalClaims,
      supported_claims: supportedClaims,
      unsupported_claims: unsupportedClaims,
      claim_precision: claimPrecision,
      misgrounding_rate: misgroundingRate,
      expected_found: expectedFound,
      expected_total: expectedTotal,
      claim_recall: claimRecall,
      pass,
    },
    hallucinated_claims: claims.filter((c) => c.hallucinated),
  };
}

// ── Batch Evaluation ──────────────────────────────────────────────────

export interface BatchClaimResult {
  question_id: string;
  result: ClaimEvaluationResult;
  error?: string;
}

export async function evaluateClaimsBatch(
  items: Array<{ question_id: string; answer: string; context: string; expectedClaims?: string[] }>,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>,
  onProgress?: (idx: number, total: number) => void
): Promise<BatchClaimResult[]> {
  const results: BatchClaimResult[] = [];
  for (let i = 0; i < items.length; i++) {
    onProgress?.(i + 1, items.length);
    try {
      const result = await evaluateClaims({
        answer: items[i].answer,
        context: items[i].context,
        expectedClaims: items[i].expectedClaims,
        chatFn,
      });
      results.push({ question_id: items[i].question_id, result });
    } catch (err) {
      results.push({
        question_id: items[i].question_id,
        result: {
          claims: [],
          expected_claims: [],
          metrics: {
            total_claims: 0,
            supported_claims: 0,
            unsupported_claims: 0,
            claim_precision: 0,
            misgrounding_rate: 0,
            expected_found: 0,
            expected_total: items[i].expectedClaims?.length ?? 0,
            claim_recall: 0,
            pass: false,
          },
          hallucinated_claims: [],
        },
        error: String((err as Error)?.message ?? err),
      });
    }
  }
  return results;
}

// ── Summary Report ────────────────────────────────────────────────────

export function formatClaimReport(results: BatchClaimResult[]): string {
  const valid = results.filter((r) => !r.error);
  const n = valid.length;
  if (n === 0) return "No valid results to report.";

  const avgPrecision = valid.reduce((s, r) => s + r.result.metrics.claim_precision, 0) / n;
  const avgRecall = valid.reduce((s, r) => s + r.result.metrics.claim_recall, 0) / n;
  const avgMisgrounding = valid.reduce((s, r) => s + r.result.metrics.misgrounding_rate, 0) / n;
  const passCount = valid.filter((r) => r.result.metrics.pass).length;
  const totalHallucinated = valid.reduce((s, r) => s + r.result.hallucinated_claims.length, 0);
  const totalClaims = valid.reduce((s, r) => s + r.result.metrics.total_claims, 0);

  const lines: string[] = [];
  lines.push("=== Claim-Level Evaluation Report ===");
  lines.push("");
  lines.push(`Total answers evaluated: ${n}`);
  lines.push(`Total claims extracted: ${totalClaims}`);
  lines.push(`Total hallucinated claims: ${totalHallucinated}`);
  lines.push("");
  lines.push(`Average Claim Precision: ${(avgPrecision * 100).toFixed(1)}%`);
  lines.push(`Average Claim Recall: ${(avgRecall * 100).toFixed(1)}%`);
  lines.push(`Average Misgrounding Rate: ${(avgMisgrounding * 100).toFixed(1)}%`);
  lines.push(
    `Pass Rate (precision≥0.8, recall≥0.6): ${((passCount / n) * 100).toFixed(1)}% (${passCount}/${n})`
  );
  lines.push("");

  if (totalHallucinated > 0) {
    lines.push("--- Hallucinated Claims (sample) ---");
    const sample = valid
      .flatMap((r) => r.result.hallucinated_claims.map((c) => ({ qid: r.question_id, claim: c })))
      .slice(0, 10);
    for (const h of sample) {
      lines.push(`  [${h.qid}] ${h.claim.text.slice(0, 100)}`);
    }
    if (totalHallucinated > 10) {
      lines.push(`  ... and ${totalHallucinated - 10} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
