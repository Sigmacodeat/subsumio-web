import type { GroundedCitation } from "@/lib/types";

/** Where an AI result came from — shown in the matter and kept for the audit trail. */
export type SaveToMatterSource = "chat" | "deep_analysis" | "dictation" | "analysis" | "research";

export const SOURCE_LABELS: Record<SaveToMatterSource, string> = {
  chat: "KI-Chat",
  deep_analysis: "Tiefenanalyse",
  dictation: "Diktat",
  analysis: "Dokumentanalyse",
  research: "Recherche",
};

export interface SaveToMatterInput {
  case_slug: string;
  title: string;
  content: string;
  source: SaveToMatterSource;
  citations?: GroundedCitation[];
}

/** Stable, readable slug under the matter's AI-results folder. */
export function savedDocumentSlug(caseSlug: string, title: string, now = new Date()): string {
  const tail = caseSlug.split("/").pop() || "akte";
  const words =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "ki-ergebnis";
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `legal/documents/${tail}/ki-${words}-${stamp}`;
}

/**
 * Frontmatter for a saved AI result. It is always marked unreviewed and carries
 * the grounding verdict, so the matter shows it as an AI draft until a lawyer
 * has checked it.
 */
export function savedDocumentFrontmatter(
  input: SaveToMatterInput,
  savedBy: string,
  now = new Date()
): Record<string, unknown> {
  const citations = input.citations ?? [];
  const verified = citations.filter((c) => c.verified).length;
  return {
    case_slug: input.case_slug,
    document_kind: "ki_ergebnis",
    ai_generated: true,
    ai_source: input.source,
    review_status: "unreviewed",
    saved_by: savedBy,
    saved_at: now.toISOString(),
    grounding: {
      citations_total: citations.length,
      citations_verified: verified,
      citations_unverified: citations.length - verified,
      citations: citations.slice(0, 50).map((c) => ({
        code: c.code,
        paragraph: c.paragraph,
        verified: c.verified,
        support: c.support,
        source_url: c.source_url,
      })),
    },
  };
}

/** Markdown body: the AI text plus the lawyer-facing review notice. */
export function savedDocumentContent(input: SaveToMatterInput): string {
  const citations = input.citations ?? [];
  const unverified = citations.filter((c) => !c.verified);
  const lines = [
    `> KI-Ergebnis (${SOURCE_LABELS[input.source]}) — anwaltlich zu prüfen.`,
    citations.length
      ? `> Zitate: ${citations.length - unverified.length} von ${citations.length} gegen den Korpus verifiziert.`
      : "> Keine Zitate geprüft.",
    "",
    input.content.trim(),
  ];
  if (unverified.length) {
    lines.push(
      "",
      "## Nicht verifizierte Zitate",
      ...unverified.slice(0, 50).map((c) => `- ${[c.paragraph, c.code].filter(Boolean).join(" ")}`)
    );
  }
  return lines.join("\n");
}
