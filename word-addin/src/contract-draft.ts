/**
 * "Vertrag entwerfen" in the Word add-in: builds exactly the request
 * POST /api/legal/contract-draft accepts (type, jurisdiction, both parties)
 * and reads its answer — JSON from the engine, or an event stream.
 */

export type Jurisdiction = "at" | "de" | "ch";

export interface ContractDraftForm {
  type: string;
  jurisdiction: string;
  partyA: string;
  partyB: string;
  instructions: string;
  /** Selected Word text, passed along as context for the draft. */
  context?: string;
}

export interface ContractDraftBody {
  type: string;
  jurisdiction: Jurisdiction;
  parties: { a: string; b: string };
  instructions: string;
  language: "de";
}

const JURISDICTIONS = new Set(["at", "de", "ch"]);

export function buildContractDraftRequest(
  form: ContractDraftForm
): { ok: true; body: ContractDraftBody } | { ok: false; error: string } {
  const type = form.type.trim();
  if (!type) return { ok: false, error: "Bitte einen Vertragstyp wählen." };
  if (!JURISDICTIONS.has(form.jurisdiction)) {
    return { ok: false, error: "Bitte die Rechtsordnung wählen (AT, DE oder CH)." };
  }
  const a = form.partyA.trim();
  const b = form.partyB.trim();
  if (!a || !b) return { ok: false, error: "Bitte beide Vertragsparteien angeben." };
  const parts = [form.instructions.trim()];
  const context = form.context?.trim();
  if (context) parts.push(`Kontext aus dem Word-Dokument:\n${context}`);
  return {
    ok: true,
    body: {
      type: type.slice(0, 100),
      jurisdiction: form.jurisdiction as Jurisdiction,
      parties: { a: a.slice(0, 300), b: b.slice(0, 300) },
      instructions: parts.filter(Boolean).join("\n\n").slice(0, 5000),
      language: "de",
    },
  };
}

export interface DraftGrounding {
  citations_verified: number;
  citations_unverified: number;
  corpus_checked?: boolean;
  has_unverified?: boolean;
  warning?: string;
  grounded_citations?: Array<{ code: string; paragraph: string; verified: boolean }>;
}

export interface ContractDraftAnswer {
  text: string;
  title?: string;
  warnings: string[];
  grounding?: DraftGrounding;
}

function fromJson(obj: Record<string, unknown>): ContractDraftAnswer {
  const data =
    obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : obj;
  const text =
    (typeof data.contract_markdown === "string" && data.contract_markdown) ||
    (typeof data.markdown === "string" && data.markdown) ||
    (typeof data.text === "string" && data.text) ||
    "";
  const grounding = (data._grounding ?? data.grounding) as DraftGrounding | undefined;
  return {
    text,
    title: typeof data.title === "string" ? data.title : undefined,
    warnings: Array.isArray(data.warnings)
      ? data.warnings.filter((w): w is string => typeof w === "string")
      : [],
    ...(grounding && typeof grounding === "object" ? { grounding } : {}),
  };
}

/** Reads the route's answer: a JSON draft, or SSE (chunk / final_answer / grounding). */
export function readContractDraftResponse(raw: string, contentType: string): ContractDraftAnswer {
  if (!contentType.includes("text/event-stream")) {
    try {
      return fromJson(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      return { text: "", warnings: ["RESPONSE_NOT_JSON"] };
    }
  }
  let text = "";
  let answer: ContractDraftAnswer = { text: "", warnings: [] };
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof parsed.chunk === "string") text += parsed.chunk;
    if (typeof parsed.final_answer === "string" && parsed.final_answer) text = parsed.final_answer;
    if (typeof parsed.contract_markdown === "string") answer = fromJson(parsed);
    if (parsed.grounding && typeof parsed.grounding === "object") {
      answer.grounding = parsed.grounding as DraftGrounding;
    }
  }
  return { ...answer, text: answer.text || text };
}
