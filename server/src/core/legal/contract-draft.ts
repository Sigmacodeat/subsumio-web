/**
 * contract-draft — generates a first-draft contract for a given type,
 * jurisdiction and parties, optionally seeded by a brain template. Generative,
 * so it carries the AI-draft banner and is always attorney-review-required.
 */
import type { BrainEngine } from "../engine.ts";
import {
  type LegalLLM,
  asStringArray,
  clipText,
  defaultLegalLLM,
  jurisdictionLabel,
  loadPageText,
  tryParseJSON,
} from "./llm-util.ts";

export interface ContractDraft {
  title: string;
  contract_markdown: string;
  clauses: string[];
  attorney_review_required: true;
  warnings: string[];
}

export interface ContractDraftOpts {
  type: string;
  jurisdiction: "at" | "de" | "ch";
  parties: { a: string; b: string };
  instructions?: string;
  template_slug?: string;
  language?: "de" | "en";
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
}

function buildSystem(
  type: string,
  jurisdiction: string,
  language: "de" | "en",
  hasTemplate: boolean
): string {
  const langHint =
    language === "en" ? "Verfasse den Vertrag auf Englisch." : "Verfasse den Vertrag auf Deutsch.";
  const tplHint = hasTemplate
    ? "Orientiere dich an der mitgelieferten Vorlage und passe sie an."
    : "Verwende eine marktübliche, vollständige Klauselstruktur.";
  return `Du bist ein juristischer Vertragsentwurfs-Assistent (Recht: ${jurisdictionLabel(jurisdiction)}).
Erstelle einen Entwurf für einen Vertrag vom Typ "${type}". ${tplHint} ${langHint}
Achte auf die zwingenden Anforderungen der gewählten Rechtsordnung. Lasse Platzhalter [in eckigen Klammern]
wo konkrete Angaben fehlen. Erfinde keine spezifischen Beträge oder Daten, die nicht vorgegeben wurden.
Gib NUR ein JSON-Objekt zurück:
{
  "title": "Titel des Vertrags",
  "contract_markdown": "der vollständige Vertragstext als Markdown mit nummerierten §§",
  "clauses": ["Kurzbezeichnung jeder enthaltenen Klausel für die Übersicht"]
}
Dies ist ein KI-Entwurf und ersetzt keine anwaltliche Prüfung und Freigabe.`;
}

const AI_BANNER_DE =
  "> ⚠️ KI-Entwurf — anwaltlich zu prüfen und freizugeben (EU AI Act Art. 50). Erstellt mit Subsumio.";
const AI_BANNER_EN =
  "> ⚠️ AI draft — attorney review and approval required (EU AI Act Art. 50). Generated with Subsumio.";

export async function draftContract(
  engine: BrainEngine,
  opts: ContractDraftOpts
): Promise<ContractDraft> {
  const warnings: string[] = [];
  const language = opts.language ?? "de";

  const empty: ContractDraft = {
    title: "",
    contract_markdown: "",
    clauses: [],
    attorney_review_required: true,
    warnings,
  };

  // Optional template seed from the brain.
  let template = "";
  if (opts.template_slug) {
    const tpl = await loadPageText(engine, opts.template_slug, {
      ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
    });
    if (tpl) template = clipText(tpl, 16000).clipped;
    else warnings.push(`TEMPLATE_NOT_FOUND: ${opts.template_slug}`);
  }

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push("NO_LLM_AVAILABLE");
    return empty;
  }

  const userParts = [
    `Vertragstyp: ${opts.type}`,
    `Partei A: ${opts.parties.a}`,
    `Partei B: ${opts.parties.b}`,
  ];
  if (opts.instructions && opts.instructions.trim()) {
    userParts.push(`Besondere Anforderungen:\n${clipText(opts.instructions, 5000).clipped}`);
  }
  if (template) userParts.push(`<vorlage>\n${template}\n</vorlage>`);

  let raw: string;
  try {
    raw = await llm({
      system: buildSystem(opts.type, opts.jurisdiction, language, Boolean(template)),
      user: userParts.join("\n\n"),
      maxTokens: 6000,
    });
  } catch (e) {
    warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : "unknown"}`);
    return empty;
  }

  const parsed = tryParseJSON(raw);
  if (!parsed) {
    warnings.push("LLM_OUTPUT_NOT_JSON");
    return empty;
  }

  const banner = language === "en" ? AI_BANNER_EN : AI_BANNER_DE;
  const body = typeof parsed.contract_markdown === "string" ? parsed.contract_markdown : "";

  return {
    title: typeof parsed.title === "string" ? parsed.title : opts.type,
    contract_markdown: body ? `${banner}\n\n${body}` : "",
    clauses: asStringArray(parsed.clauses),
    attorney_review_required: true,
    warnings,
  };
}
