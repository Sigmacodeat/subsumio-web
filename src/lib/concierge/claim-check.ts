// Claim check: nothing reaches the visitor that the knowledge base does not
// back. The model answers in sentences, each citing the chunk ids it relies
// on. The server then removes every sentence that
//   - cites nothing (unless it is a short, fact-free conversational line),
//   - cites a chunk that was not in the retrieved context,
//   - states a number (price, count, duration, percentage) that none of its
//     cited chunks contains,
//   - shares too few content words with its cited chunks to be a faithful
//     paraphrase.
// Removing is deliberate: a marked-but-shown wrong price is still shown.

import type { KnowledgeChunk } from "./knowledge";
import { normalize, tokenize } from "./retrieve";

export interface DraftSentence {
  text: string;
  sources: string[];
}

export interface CheckedSentence {
  text: string;
  sources: Array<{ id: string; title: string; url: string }>;
}

export interface ClaimCheckResult {
  sentences: CheckedSentence[];
  dropped: Array<{ text: string; reason: DropReason }>;
}

export type DropReason = "no_source" | "unknown_source" | "number_not_in_source" | "low_overlap";

/** Numbers as written in German copy: 1.499, 249, 14, 99,8, 4.000. */
function numbersIn(text: string): string[] {
  const found = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return found.map((n) => n.replace(/\./g, "").replace(",", "."));
}

const NUMBER_WORDS: Record<string, string> = {
  eins: "1",
  einen: "1",
  zwei: "2",
  drei: "3",
  vier: "4",
  fünf: "5",
  fuenf: "5",
  sechs: "6",
  sieben: "7",
  acht: "8",
  neun: "9",
  zehn: "10",
  zwölf: "12",
  vierzehn: "14",
  dreißig: "30",
};

function numbersWithWords(text: string): Set<string> {
  const set = new Set(numbersIn(text));
  for (const word of text.toLowerCase().split(/[^a-zäöüß]+/)) {
    const n = NUMBER_WORDS[word];
    if (n) set.add(n);
  }
  return set;
}

/** Short, fact-free line ("Gern.", "Wie viele Personen arbeiten bei Ihnen?"). */
function isConversational(text: string): boolean {
  return text.length <= 140 && numbersIn(text).length === 0 && tokenize(text).length <= 12;
}

const MIN_OVERLAP = 0.35;

export function claimCheck(draft: DraftSentence[], context: KnowledgeChunk[]): ClaimCheckResult {
  const byId = new Map(context.map((c) => [c.id, c]));
  const sentences: CheckedSentence[] = [];
  const dropped: ClaimCheckResult["dropped"] = [];

  for (const s of draft) {
    const text = s.text.trim();
    if (!text) continue;
    const ids = [...new Set(s.sources ?? [])];

    if (ids.length === 0) {
      if (isConversational(text)) sentences.push({ text, sources: [] });
      else dropped.push({ text, reason: "no_source" });
      continue;
    }
    const cited = ids.map((id) => byId.get(id));
    if (cited.some((c) => !c)) {
      dropped.push({ text, reason: "unknown_source" });
      continue;
    }
    const chunks = cited as KnowledgeChunk[];
    const sourceText = chunks.map((c) => `${c.title} ${c.text}`).join(" ");

    const sourceNumbers = numbersWithWords(sourceText);
    if (numbersIn(text).some((n) => !sourceNumbers.has(n))) {
      dropped.push({ text, reason: "number_not_in_source" });
      continue;
    }

    const words = [...new Set(tokenize(text))];
    const sourceWords = new Set(tokenize(sourceText));
    const overlap = words.length
      ? words.filter((w) => sourceWords.has(w)).length / words.length
      : 1;
    if (overlap < MIN_OVERLAP) {
      dropped.push({ text, reason: "low_overlap" });
      continue;
    }

    sentences.push({
      text,
      sources: chunks.map((c) => ({ id: c.id, title: c.title, url: c.url })),
    });
  }
  return { sentences, dropped };
}

/** Exposed for tests. */
export const __test = { numbersIn, isConversational, normalize };
