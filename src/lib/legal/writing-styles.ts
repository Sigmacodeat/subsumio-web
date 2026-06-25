/**
 * Gap 10: Custom Writing Styles — konfigurierbarer Output-Stil.
 *
 * Harvey-Feature: "Tailor Harvey's outputs to match your writing style,
 * organizational tone, and local preferences."
 *
 * Subsumio-Status vor Gap 10: `legal-drafter` hat festes System-Prompt,
 * kein Style-Parameter.
 *
 * Dieses Modul bietet:
 * - WritingStyle: Konfigurierbarer Stil mit tone, formality, length, language
 * - Preset-Styles: formal, modern, concise, detailed, persuasive
 * - applyStyleToPrompt(): Injiziert Style-Parameter in Specialist-Prompt
 * - Style-Profile pro Kanzlei speicherbar
 */

export interface WritingStyle {
  id: string;
  name: string;
  description: string;

  /** Tonfall: formell, modern, klassisch */
  tone: "formal" | "modern" | "classical" | "persuasive" | "neutral";

  /** Formalitätsgrad 1-5 (1=sehr umgangssprachlich, 5=sehr formell) */
  formality: 1 | 2 | 3 | 4 | 5;

  /** Längen-Präferenz */
  length: "concise" | "standard" | "detailed" | "exhaustive";

  /** Sprache/Dialekt */
  language: "de-AT" | "de-DE" | "de-CH";

  /** Perspektive */
  perspective: "first_person" | "third_person" | "passive";

  /** Ob Zitate inline oder als Fußnoten */
  citation_style: "inline" | "footnote" | "endnote";

  /** Ob Sätze kurz oder lang sein sollen */
  sentence_style: "short" | "medium" | "long" | "varied";

  /** Custom Instructions (freitext) */
  custom_instructions?: string;

  /** Kanzlei-Name für Personalisierung */
  firm_name?: string;

  /** Signatur-Fußzeile */
  signature?: string;
}

/**
 * Preset-Styles für schnelle Konfiguration.
 */
export const PRESET_STYLES: WritingStyle[] = [
  {
    id: "formal-classic",
    name: "Klassisch Formell",
    description: "Traditioneller anwaltlicher Stil mit langen Sätzen und formeller Anrede",
    tone: "classical",
    formality: 5,
    length: "detailed",
    language: "de-AT",
    perspective: "third_person",
    citation_style: "inline",
    sentence_style: "long",
  },
  {
    id: "modern-concise",
    name: "Modern & Prägnant",
    description: "Klarer, direkter Stil mit kurzen Sätzen — gut für moderne Kanzleien",
    tone: "modern",
    formality: 3,
    length: "concise",
    language: "de-AT",
    perspective: "first_person",
    citation_style: "inline",
    sentence_style: "short",
  },
  {
    id: "persuasive-detailed",
    name: "Argumentativ & Detailliert",
    description: "Überzeugender Stil mit ausführlicher Argumentation — gut für Klageschriften",
    tone: "persuasive",
    formality: 4,
    length: "exhaustive",
    language: "de-AT",
    perspective: "first_person",
    citation_style: "footnote",
    sentence_style: "varied",
  },
  {
    id: "neutral-standard",
    name: "Neutral & Standard",
    description: "Ausgewogener Stil für Gutachten und Aktennotizen",
    tone: "neutral",
    formality: 3,
    length: "standard",
    language: "de-AT",
    perspective: "passive",
    citation_style: "inline",
    sentence_style: "medium",
  },
  {
    id: "de-de-formal",
    name: "Deutschland Formell",
    description: "Deutscher Standard mit de-DE Rechtschreibung und Formulierungen",
    tone: "formal",
    formality: 4,
    length: "standard",
    language: "de-DE",
    perspective: "third_person",
    citation_style: "inline",
    sentence_style: "medium",
  },
];

/**
 * Default Style (wird verwendet, wenn kein Style konfiguriert ist).
 */
export const DEFAULT_STYLE: WritingStyle = PRESET_STYLES[3]!; // neutral-standard

const TONE_LABELS: Record<WritingStyle["tone"], string> = {
  formal: "formell — traditionelle anwaltliche Sprache",
  modern: "modern — klar und direkt",
  classical: "klassisch — gehobene Sprache mit komplexen Sätzen",
  persuasive: "argumentativ — überzeugend und pointiert",
  neutral: "neutral — sachlich und ausgewogen",
};

const FORMALITY_LABELS: Record<number, string> = {
  1: "sehr locker (1/5)",
  2: "locker (2/5)",
  3: "mittelmäßig formell (3/5)",
  4: "formell (4/5)",
  5: "sehr formell (5/5) — traditionelle Anwaltssprache",
};

const LENGTH_LABELS: Record<WritingStyle["length"], string> = {
  concise: "prägnant — kurz und auf den Punkt",
  standard: "standard — normale Länge",
  detailed: "detailliert — ausführliche Darstellung",
  exhaustive: "erschöpfend — maximale Detailtiefe",
};

const LANGUAGE_LABELS: Record<WritingStyle["language"], string> = {
  "de-AT": "Österreichisches Deutsch (de-AT)",
  "de-DE": "Deutschland Deutsch (de-DE)",
  "de-CH": "Schweizer Deutsch (de-CH)",
};

const PERSPECTIVE_LABELS: Record<WritingStyle["perspective"], string> = {
  first_person: "erste Person (ich, wir)",
  third_person: "dritte Person (der Unterzeichnete, die Kanzlei)",
  passive: "passiv (wird dargelegt, ist zu beachten)",
};

const CITATION_LABELS: Record<WritingStyle["citation_style"], string> = {
  inline: "Inline-Zitate (im Fließtext)",
  footnote: "Fußnoten-Zitate",
  endnote: "Endnoten-Zitate (am Dokumentende)",
};

const SENTENCE_LABELS: Record<WritingStyle["sentence_style"], string> = {
  short: "kurze Sätze (max 15 Wörter)",
  medium: "mittlere Sätze (15-25 Wörter)",
  long: "lange Sätze (25+ Wörter, verschachtelt)",
  varied: "abwechslungsreiche Satzlängen",
};

/**
 * Generate a style instruction block for injection into specialist prompts.
 */
export function applyStyleToPrompt(style: WritingStyle): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("SCHREIBSTIL-KONFIGURATION (MUSS eingehalten werden):");
  lines.push(`- Tonfall: ${TONE_LABELS[style.tone]}`);
  lines.push(`- Formalität: ${FORMALITY_LABELS[style.formality]}`);
  lines.push(`- Länge: ${LENGTH_LABELS[style.length]}`);
  lines.push(`- Sprache: ${LANGUAGE_LABELS[style.language]}`);
  lines.push(`- Perspektive: ${PERSPECTIVE_LABELS[style.perspective]}`);
  lines.push(`- Zitierweise: ${CITATION_LABELS[style.citation_style]}`);
  lines.push(`- Satzstil: ${SENTENCE_LABELS[style.sentence_style]}`);

  if (style.firm_name) {
    lines.push(`- Kanzlei: ${style.firm_name} — verwende Kanzlei-Name in Briefköpfen und Signatur`);
  }

  if (style.signature) {
    lines.push(`- Signatur: ${style.signature}`);
  }

  if (style.custom_instructions) {
    lines.push(`- Zusätzliche Anweisungen: ${style.custom_instructions}`);
  }

  lines.push("");
  lines.push("PASSE deinen Output-STIL an diese Konfiguration an. Der INHALT bleibt gleich,");
  lines.push("aber FORMULIERUNG, LÄNGE und TONFALL richten sich nach diesen Vorgaben.");

  return lines.join("\n");
}

/**
 * In-memory style registry (in production: DB-backed).
 */
const styleRegistry = new Map<string, WritingStyle>();

// Initialize with presets
for (const style of PRESET_STYLES) {
  styleRegistry.set(style.id, style);
}

/**
 * Get a style by ID.
 */
export function getStyle(id: string): WritingStyle | null {
  return styleRegistry.get(id) ?? null;
}

/**
 * List all available styles.
 */
export function listStyles(): WritingStyle[] {
  return Array.from(styleRegistry.values());
}

/**
 * Save a custom style.
 */
export function saveStyle(style: WritingStyle): void {
  styleRegistry.set(style.id, style);
}

/**
 * Delete a custom style (presets cannot be deleted).
 */
export function deleteStyle(id: string): boolean {
  if (PRESET_STYLES.some((s) => s.id === id)) return false;
  return styleRegistry.delete(id);
}
