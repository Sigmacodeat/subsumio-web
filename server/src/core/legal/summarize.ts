/**
 * summarize — executive summary + structured key points for a legal document,
 * case file or judgement. Paraphrasing by nature, so it is NOT quote-grounded;
 * instead it reports word_count/reading_time and stays explicitly assistive.
 */
import type { BrainEngine } from "../engine.ts";
import {
  type LegalLLM,
  asStringArray,
  clipText,
  defaultLegalLLM,
  resolveDocumentText,
  tryParseJSON,
} from "./llm-util.ts";

export interface SummaryDate {
  label: string;
  date: string;
}

export interface DocumentSummary {
  executive_summary: string;
  key_points: string[];
  parties: string[];
  dates: SummaryDate[];
  obligations: string[];
  risks: string[];
  word_count: number;
  reading_time_minutes: number;
  attorney_review_required: true;
  warnings: string[];
}

export interface SummarizeOpts {
  slug?: string;
  text?: string;
  type?: "document" | "case" | "judgement" | "contract" | "general";
  depth?: "brief" | "standard" | "detailed";
  focus?: string;
  language?: "de" | "en";
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxChars?: number;
}

function buildSystem(type: string, depth: string, focus: string, language: "de" | "en"): string {
  const depthHint =
    depth === "brief"
      ? "executive_summary: maximal 3 Sätze."
      : depth === "detailed"
        ? "executive_summary: ausführlich (mehrere Absätze), key_points feingranular."
        : "executive_summary: ca. eine Absatzlänge.";
  const langHint = language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";
  const focusHint = focus ? `Lege besonderen Fokus auf: ${focus}.` : "";
  return `Du bist ein juristischer Zusammenfassungs-Assistent (Dokumenttyp: ${type}).
${depthHint} ${focusHint} ${langHint}
Gib NUR ein JSON-Objekt zurück:
{
  "executive_summary": "string",
  "key_points": ["wichtigster Punkt", "..."],
  "parties": ["Beteiligte, sofern erkennbar"],
  "dates": [{"label": "Bedeutung", "date": "YYYY-MM-DD oder wörtlich"}],
  "obligations": ["zentrale Pflichten/Verpflichtungen"],
  "risks": ["erkennbare Risiken oder offene Punkte"]
}
Bleibe nah am Dokument, erfinde keine Fakten. Dies ersetzt keine anwaltliche Prüfung.`;
}

function parseDates(v: unknown): SummaryDate[] {
  if (!Array.isArray(v)) return [];
  const out: SummaryDate[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.date !== "string") continue;
    out.push({ label: typeof o.label === "string" ? o.label : "", date: o.date });
  }
  return out;
}

export async function summarizeDocument(
  engine: BrainEngine,
  opts: SummarizeOpts
): Promise<DocumentSummary> {
  const warnings: string[] = [];
  const type = opts.type ?? "general";
  const depth = opts.depth ?? "standard";
  const focus = opts.focus ?? "";
  const language = opts.language ?? "de";

  const resolved = await resolveDocumentText(engine, {
    ...(opts.slug !== undefined ? { slug: opts.slug } : {}),
    ...(opts.text !== undefined ? { text: opts.text } : {}),
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
  });
  if (resolved.notFound) throw new Error(`summarize: page not found: ${resolved.sourceSlug}`);

  const wordCount = resolved.text.trim() ? resolved.text.trim().split(/\s+/).length : 0;
  const empty: DocumentSummary = {
    executive_summary: "",
    key_points: [],
    parties: [],
    dates: [],
    obligations: [],
    risks: [],
    word_count: wordCount,
    reading_time_minutes: Math.max(1, Math.round(wordCount / 200)),
    attorney_review_required: true,
    warnings,
  };
  if (!resolved.text.trim()) {
    warnings.push("NO_DOCUMENT_TEXT");
    return empty;
  }

  const { clipped, warning } = clipText(resolved.text, opts.maxChars ?? 40000);
  if (warning) warnings.push(warning);

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push("NO_LLM_AVAILABLE");
    return empty;
  }

  const user = `<dokument>\n${clipped}\n</dokument>`;
  let raw: string;
  try {
    raw = await llm({ system: buildSystem(type, depth, focus, language), user, maxTokens: 4000 });
  } catch (e) {
    warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : "unknown"}`);
    return empty;
  }

  const parsed = tryParseJSON(raw);
  if (!parsed) {
    warnings.push("LLM_OUTPUT_NOT_JSON");
    return empty;
  }

  return {
    executive_summary: typeof parsed.executive_summary === "string" ? parsed.executive_summary : "",
    key_points: asStringArray(parsed.key_points),
    parties: asStringArray(parsed.parties),
    dates: parseDates(parsed.dates),
    obligations: asStringArray(parsed.obligations),
    risks: asStringArray(parsed.risks),
    word_count: wordCount,
    reading_time_minutes: Math.max(1, Math.round(wordCount / 200)),
    attorney_review_required: true,
    warnings,
  };
}
