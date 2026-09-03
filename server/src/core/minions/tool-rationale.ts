/**
 * Typed Reasoning Schema — EBTE (Explanation-Bound Tool Execution).
 *
 * arXiv 2607.25364: "Tool-using agents expose structured calls but commonly
 * attach free-form rationales. Such rationales are neither authorization nor
 * reliable introspection."
 *
 * Lösung: Der Agent MUSS vor jedem Tool-Call eine typed Rationale ausgeben:
 *   { "rationale": "Warum dieser Call", "alternatives": [...], "tool": "search", ... }
 *
 * Subsumio implementiert dies als "rationale prefix" — der Agent gibt vor dem
 * tool_use-Block einen text-Block aus, der die Rationale enthält. Der subagent
 * handler extrahiert diese und persistiert sie im decision_record.tools_called[].rationale.
 */

/**
 * System-Prompt-Erweiterung die jeden Specialist erhält.
 * Fordert typed rationale vor jedem Tool-Call.
 */
export const RATIONALE_SYSTEM_PROMPT_APPENDIX = `
## Tool-Call Rationale (EBTE Schema)

Before EVERY tool call, you MUST output a brief rationale as a text block
immediately preceding the tool_use block. Format:

<rationale tool="search">
Brauche §-Grundlage für Schadensersatz im AT-Zivilrecht, da der Kläger
einen Vermögensschaden geltend macht.
</rationale>

This rationale is persisted in the audit trail (TRACE schema) and is
non-optional. If you call a tool without a preceding rationale block,
the audit record will be incomplete. The rationale should answer:
1. WHY this tool? (not just WHAT)
2. What information gap does this call fill?
3. What alternatives were considered and rejected?

Keep rationales concise (1-3 sentences). They are for audit, not for the
final output.
`;

/**
 * Extrahiert rationale-Blöcke aus Assistant-Text-Blöcken.
 * Format: <rationale tool="search">...</rationale>
 *
 * Wird vom subagent handler aufgerufen um die rationale dem
 * entsprechenden tool_use-Block zuzuordnen.
 */
export interface ExtractedRationale {
  tool: string;
  rationale: string;
}

export function extractRationalesFromText(text: string): ExtractedRationale[] {
  const rationales: ExtractedRationale[] = [];
  const regex = /<rationale\s+tool="([^"]+)"\s*>([\s\S]*?)<\/rationale>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    rationales.push({
      tool: match[1]!.trim(),
      rationale: match[2]!.trim(),
    });
  }
  return rationales;
}

/**
 * Ordnet extrahierte Rationales den Tool-Calls zu.
 * Match by tool name (first unmatched rationale wins).
 */
export function assignRationalesToToolCalls(
  toolCalls: Array<{ tool: string; input_summary: string; rationale?: string; timestamp: string }>,
  rationales: ExtractedRationale[]
): Array<{ tool: string; input_summary: string; rationale?: string; timestamp: string }> {
  const usedRationaleIndices = new Set<number>();
  return toolCalls.map((tc) => {
    const rationaleIdx = rationales.findIndex(
      (r, i) => r.tool === tc.tool && !usedRationaleIndices.has(i)
    );
    if (rationaleIdx >= 0) {
      usedRationaleIndices.add(rationaleIdx);
      return { ...tc, rationale: rationales[rationaleIdx]!.rationale };
    }
    return tc;
  });
}
