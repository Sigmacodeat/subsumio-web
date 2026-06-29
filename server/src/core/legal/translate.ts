/**
 * translate — legal-aware translation of documents, clauses, or text between
 * languages. Preserves legal terminology, statute references, and jurisdictional
 * context. Returns the translated text plus a glossary of key legal terms.
 */
import type { BrainEngine } from "../engine.ts";
import {
  type LegalLLM,
  clipText,
  defaultLegalLLM,
  resolveDocumentText,
  tryParseJSON,
  asStringArray,
} from "./llm-util.ts";

export interface TranslationGlossaryEntry {
  source_term: string;
  target_term: string;
  note?: string;
}

export interface DocumentTranslation {
  translated_text: string;
  source_language: string;
  target_language: string;
  glossary: TranslationGlossaryEntry[];
  warnings: string[];
  attorney_review_required: true;
}

export interface TranslateOpts {
  slug?: string;
  text?: string;
  source_language?: string;
  target_language: string;
  legal_terminology?: boolean;
  preserve_formatting?: boolean;
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxChars?: number;
}

const LANG_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "Englisch",
  fr: "Französisch",
  it: "Italienisch",
  es: "Spanisch",
  nl: "Niederländisch",
  pl: "Polnisch",
  ro: "Rumänisch",
  tr: "Türkisch",
  ar: "Arabisch",
  ru: "Russisch",
  zh: "Chinesisch",
};

function langLabel(code: string): string {
  return LANG_LABELS[code] ?? code.toUpperCase();
}

function buildSystem(
  sourceLang: string,
  targetLang: string,
  legalTerminology: boolean,
  preserveFormatting: boolean
): string {
  const srcLabel = langLabel(sourceLang);
  const tgtLabel = langLabel(targetLang);

  let system = `You are a legal translation expert. Translate the given text from ${srcLabel} to ${tgtLabel}.`;

  if (legalTerminology) {
    system += `

CRITICAL LEGAL TERMINOLOGY RULES:
- Preserve all statute references (e.g. "§ 433 BGB", "Art 5 OR", "§ 1313a ABGB") in their original form.
- Use established legal terminology for the target jurisdiction:
  - DE → AT: "Klage" → "Klage", "Urteil" → "Erkenntnis", "Rechtsanwalt" → "Rechtsanwalt"
  - DE → CH: "Klage" → "Klage", "Urteil" → "Entscheid", "BGB" → "OR/ZGB (as applicable)"
  - DE → EN: "Klage" → "Statement of Claim", "Urteil" → "Judgment", "Vertrag" → "Contract"
  - EN → DE: "Consideration" → "Gegenleistung", "Breach" → "Vertragsverletzung", "Damages" → "Schadensersatz"
- Do NOT translate proper nouns (party names, court names, case numbers).
- Preserve all dates in their original format.
- Preserve all monetary amounts with their currency designation.`;
  }

  if (preserveFormatting) {
    system += `

FORMATTING RULES:
- Preserve all markdown formatting (headers, lists, bold, italic, code blocks).
- Preserve paragraph breaks and line structure.
- Preserve all numbering and bullet points.`;
  }

  system += `

Return a JSON object with this exact schema:
{
  "translated_text": "the full translated text",
  "glossary": [
    { "source_term": "original legal term", "target_term": "translated term", "note": "optional explanation" }
  ]
}

The glossary should contain 0-20 entries covering key legal terms that required specialized translation. Only include terms where the translation is non-obvious or jurisdictionally significant. Leave "note" empty if no explanation is needed.`;

  return system;
}

export async function translateDocument(
  engine: BrainEngine,
  opts: TranslateOpts
): Promise<DocumentTranslation> {
  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    return {
      translated_text: "",
      source_language: opts.source_language ?? "auto",
      target_language: opts.target_language,
      glossary: [],
      warnings: ["LLM_NOT_CONFIGURED: No chat model available for translation."],
      attorney_review_required: true,
    };
  }

  const { text, sourceSlug, notFound } = await resolveDocumentText(engine, {
    slug: opts.slug,
    text: opts.text,
    sourceId: opts.sourceId,
    sourceIds: opts.sourceIds,
  });

  if (notFound) {
    return {
      translated_text: "",
      source_language: opts.source_language ?? "auto",
      target_language: opts.target_language,
      glossary: [],
      warnings: [`DOCUMENT_NOT_FOUND: slug "${sourceSlug}" does not exist.`],
      attorney_review_required: true,
    };
  }

  if (!text.trim()) {
    return {
      translated_text: "",
      source_language: opts.source_language ?? "auto",
      target_language: opts.target_language,
      glossary: [],
      warnings: ["NO_TEXT: No text provided for translation."],
      attorney_review_required: true,
    };
  }

  const maxChars = opts.maxChars ?? 50_000;
  const { clipped, warning } = clipText(text, maxChars);
  const warnings: string[] = [];
  if (warning) warnings.push(warning);

  const sourceLang = opts.source_language ?? "auto";
  const system = buildSystem(
    sourceLang,
    opts.target_language,
    opts.legal_terminology ?? true,
    opts.preserve_formatting ?? true
  );

  const userPrompt = `Translate the following text${sourceLang !== "auto" ? ` from ${langLabel(sourceLang)}` : ""} to ${langLabel(opts.target_language)}:\n\n${clipped}`;

  let raw: string;
  try {
    raw = await llm({ system, user: userPrompt, maxTokens: 8000 });
  } catch (e) {
    return {
      translated_text: "",
      source_language: sourceLang,
      target_language: opts.target_language,
      glossary: [],
      warnings: [`LLM_CALL_FAILED: ${e instanceof Error ? e.message : "unknown"}`],
      attorney_review_required: true,
    };
  }
  const parsed = tryParseJSON(raw);

  if (!parsed) {
    return {
      translated_text: raw.trim(),
      source_language: sourceLang,
      target_language: opts.target_language,
      glossary: [],
      warnings: [
        "UNSTRUCTURED_OUTPUT: Model returned plain text instead of JSON. Translation may be incomplete.",
      ],
      attorney_review_required: true,
    };
  }

  const translatedText = typeof parsed.translated_text === "string" ? parsed.translated_text : "";
  const glossary: TranslationGlossaryEntry[] = Array.isArray(parsed.glossary)
    ? parsed.glossary
        .filter((g): g is Record<string, unknown> => typeof g === "object" && g !== null)
        .map((g) => ({
          source_term: String(g.source_term ?? ""),
          target_term: String(g.target_term ?? ""),
          ...(typeof g.note === "string" && g.note ? { note: g.note } : {}),
        }))
        .filter((g) => g.source_term && g.target_term)
    : [];

  return {
    translated_text: translatedText,
    source_language: sourceLang,
    target_language: opts.target_language,
    glossary,
    warnings,
    attorney_review_required: true,
  };
}
