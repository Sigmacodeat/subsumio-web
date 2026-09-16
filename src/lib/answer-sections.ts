/**
 * The engine answers in a fixed English section layout ("## Answer",
 * "## Gaps", "## Sources"). German-speaking lawyers should not see those
 * headings; the briefing card should not show the gaps block at all.
 */
const HEADINGS: Array<[RegExp, { de: string; en: string }]> = [
  [/^(#{1,3})[ \t]*Answer[ \t]*$/gim, { de: "$1 Antwort", en: "$1 Answer" }],
  [/^(#{1,3})[ \t]*Gaps[ \t]*$/gim, { de: "$1 Offene Punkte", en: "$1 Gaps" }],
  [/^(#{1,3})[ \t]*Sources[ \t]*$/gim, { de: "$1 Quellen", en: "$1 Sources" }],
  [/^(#{1,3})[ \t]*Citations[ \t]*$/gim, { de: "$1 Belege", en: "$1 Citations" }],
  [/^(#{1,3})[ \t]*Conflicts?[ \t]*$/gim, { de: "$1 Widersprüche", en: "$1 Conflicts" }],
];

/** Translate the engine's section headings into the UI language. */
export function localizeAnswerSections(text: string, lang: "de" | "en" = "de"): string {
  let out = text;
  for (const [rx, labels] of HEADINGS) out = out.replace(rx, labels[lang]);
  return out;
}

/**
 * Prose for cards (briefing): drop the leading heading line, cut everything
 * from a "Gaps" marker on (the model writes it as "## Gaps", "**Gaps**" or
 * "Gaps:"), and keep other sections such as Sources.
 */
export function answerProseOnly(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const isGaps = (l: string) => /^\s*(#{1,3}\s*|\*\*)?Gaps(\*\*)?:?\s*$/i.test(l);
  const isHeading = (l: string) => /^\s*#{1,3}\s+\S/.test(l);
  const out: string[] = [];
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isGaps(l)) {
      skipping = true;
      continue;
    }
    if (skipping && isHeading(l)) skipping = false;
    if (skipping) continue;
    if (out.length === 0 && /^\s*#{1,3}\s*(Answer|Antwort|Morgen-Briefing|Briefing)\s*$/i.test(l))
      continue;
    out.push(l);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
