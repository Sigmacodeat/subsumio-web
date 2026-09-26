/**
 * Applying the engine's structured redlines to the selected contract text.
 *
 * The model quotes the clause it changes; minor deviations (line breaks,
 * double spaces, typographic quotes) must not make a change disappear
 * silently. Clauses that still cannot be located are reported, so the
 * lawyer never takes a partial revision for a complete one.
 */

export interface Redline {
  original_clause: string;
  suggested_text: string;
  change_type: "add" | "remove" | "modify";
  reason: string;
  risk_level?: string;
  legal_basis?: string;
}

export interface AppliedRedlines {
  text: string;
  applied: number;
  /** Changes whose clause was not found in the text (not applied). */
  unapplied: Redline[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pattern that matches the clause regardless of whitespace and quote style. */
function clausePattern(clause: string): RegExp | null {
  const trimmed = clause.trim();
  if (!trimmed) return null;
  const pattern = trimmed
    .split(/\s+/)
    .map((word) =>
      escapeRegExp(word)
        .replace(/["„“”«»]/g, '["„“”«»]')
        .replace(/['‚‘’`]/g, "['‚‘’`]")
        .replace(/[–—-]/g, "[–—-]")
    )
    .join("\\s+");
  return new RegExp(pattern);
}

export function applyRedlines(original: string, redlines: Redline[]): AppliedRedlines {
  let out = original;
  let applied = 0;
  const unapplied: Redline[] = [];
  const additions: string[] = [];
  for (const r of redlines) {
    if (r.change_type === "add" || !r.original_clause?.trim()) {
      if (r.suggested_text?.trim()) {
        additions.push(r.suggested_text);
        applied++;
      } else {
        unapplied.push(r);
      }
      continue;
    }
    const replacement = r.change_type === "remove" ? "" : r.suggested_text;
    if (out.includes(r.original_clause)) {
      out = out.replace(r.original_clause, () => replacement);
      applied++;
      continue;
    }
    const re = clausePattern(r.original_clause);
    if (re && re.test(out)) {
      out = out.replace(re, () => replacement);
      applied++;
      continue;
    }
    unapplied.push(r);
  }
  if (additions.length > 0) {
    out = out.replace(/\n+$/, "") + "\n\n" + additions.join("\n\n");
  }
  return { text: out, applied, unapplied };
}

/** Summary line for the task pane: "10 von 12 Änderungen angewendet …". */
export function redlineSummary(total: number, result: AppliedRedlines): string {
  if (result.unapplied.length === 0) return `${total} Änderungen identifiziert und angewendet`;
  return `${result.applied} von ${total} Änderungen angewendet — ${result.unapplied.length} konnten nicht automatisch angewendet werden (Klausel im Text nicht gefunden, siehe unten)`;
}
