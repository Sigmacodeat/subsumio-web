/**
 * Chat export as a working document: every AI answer carries the checked
 * citations with their status and official link, plus the EU AI Act notice —
 * so the exported file can go into the Akt without losing provenance.
 */

import { AI_NOTICE } from "@/lib/ai-act";
import { isOfficialUrl } from "@/lib/citation-gate-client";
import type { ChatMessage } from "@/components/chat/chat-types";

export interface ChatExportLabels {
  user: string;
  ai: string;
  date: string;
  sources: string;
  gaps: string;
  locale: string;
}

function citationLine(
  gc: NonNullable<ChatMessage["grounding"]>["grounded_citations"][number]
): string {
  const name =
    gc.category === "judikatur" ? `${gc.code} ${gc.paragraph}` : `${gc.paragraph} ${gc.code}`;
  if (gc.verified) {
    const link = isOfficialUrl(gc.source_url) ? ` — [amtliche Quelle](${gc.source_url})` : "";
    return `- ✓ ${name} (im Rechtskorpus verifiziert)${link}`;
  }
  const search = isOfficialUrl(gc.search_url) ? ` — [im RIS suchen](${gc.search_url})` : "";
  return `- ⚠ ${name} (nicht verifiziert — bitte prüfen)${search}`;
}

export function buildChatExportMarkdown(messages: ChatMessage[], l: ChatExportLabels): string {
  const parts = messages.map((m) => {
    const who = m.role === "user" ? l.user : l.ai;
    const lines = [`**${who}:**`, "", m.content];
    if (m.role === "assistant") {
      const grounded = m.grounding?.grounded_citations ?? [];
      if (grounded.length > 0) {
        lines.push("", "**Geprüfte Fundstellen:**", ...grounded.map(citationLine));
      }
      if (m.citations?.length) {
        lines.push("", `**${l.sources}:** ${m.citations.map((c) => c.title).join(", ")}`);
      }
      if (m.gaps?.length) lines.push("", `**${l.gaps}:** ${m.gaps.join("; ")}`);
    }
    return lines.join("\n");
  });
  return [
    `${l.date} ${new Date().toLocaleString(l.locale)}`,
    "",
    `> ${AI_NOTICE}`,
    "",
    "---",
    "",
    parts.join("\n\n---\n\n"),
  ].join("\n");
}
