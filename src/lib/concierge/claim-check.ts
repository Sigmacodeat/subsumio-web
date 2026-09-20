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

export type DropReason =
  | "no_source"
  | "unknown_source"
  | "number_not_in_source"
  | "low_overlap"
  /** Only a reference to a removed sentence was left ("Stattdessen …"). */
  | "dangling_reference";

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

/** A sentence the model forgot to cite is kept only if one chunk covers it this well. */
const AUTO_SOURCE_OVERLAP = 0.6;

/**
 * Words that tie a sentence to the one before it. When the previous sentence
 * was removed, they point at nothing ("Unsere Maßnahmen legen wir stattdessen
 * offen …"), so they are stripped from the survivor.
 */
const CONNECTIVES = [
  "stattdessen",
  "außerdem",
  "ausserdem",
  "zudem",
  "deshalb",
  "deswegen",
  "daher",
  "somit",
  "dadurch",
  "dafür",
  "dabei",
  "darüber hinaus",
  "das heißt",
  "das heisst",
  "genauer gesagt",
  "konkret",
  "ebenso",
  "ebenfalls",
];

const overlapWith = (words: string[], sourceText: string): number => {
  if (words.length === 0) return 1;
  const sourceWords = new Set(tokenize(sourceText));
  return words.filter((w) => sourceWords.has(w)).length / words.length;
};

const chunkText = (c: KnowledgeChunk) => `${c.title} ${c.text}`;

/**
 * Remove a dangling connective at the start of a sentence and restore the
 * capital letter. Returns null when nothing meaningful is left.
 */
export function stripLeadingConnective(text: string): string | null {
  const lower = text.toLowerCase();
  const hit = CONNECTIVES.find((c) => lower.startsWith(`${c} `) || lower.startsWith(`${c}, `));
  if (!hit) return text;
  let rest = text.slice(hit.length).replace(/^[,\s]+/, "");
  if (rest.length < 15) return null;
  rest = rest[0].toUpperCase() + rest.slice(1);
  return rest;
}

/** The same, for a connective sitting inside the sentence ("legen wir stattdessen offen"). */
function dropInnerConnective(text: string): string {
  return text.replace(/\s+(stattdessen|hingegen|dagegen)\b/i, "");
}

export function claimCheck(draft: DraftSentence[], context: KnowledgeChunk[]): ClaimCheckResult {
  const byId = new Map(context.map((c) => [c.id, c]));
  const sentences: CheckedSentence[] = [];
  const dropped: ClaimCheckResult["dropped"] = [];
  // Set while the previous drafted sentence was removed: the next one may
  // refer back to something the visitor will never see.
  let previousDropped = false;

  const push = (raw: string, chunks: KnowledgeChunk[]) => {
    let text = raw;
    if (previousDropped || sentences.length === 0) {
      const repaired = stripLeadingConnective(text);
      if (repaired === null) {
        dropped.push({ text, reason: "dangling_reference" });
        previousDropped = true;
        return;
      }
      if (previousDropped) text = dropInnerConnective(repaired);
      else text = repaired;
    }
    sentences.push({
      text,
      sources: chunks.map((c) => ({ id: c.id, title: c.title, url: c.url })),
    });
    previousDropped = false;
  };

  for (const s of draft) {
    const text = s.text.trim();
    if (!text) continue;
    const ids = [...new Set(s.sources ?? [])];

    if (ids.length === 0) {
      // The model sometimes states something the context does back but forgets
      // the id. Look for the chunk that covers the sentence and cite that one:
      // the statement still has to be carried by a retrieved source, it is
      // just not the model's word that decides which. This runs BEFORE the
      // conversational allowance — otherwise a short factual sentence would
      // slip through as small talk, with no source shown to the visitor.
      const words = [...new Set(tokenize(text))];
      const best = context
        .map((c) => ({ c, score: overlapWith(words, chunkText(c)) }))
        .sort((a, b) => b.score - a.score)[0];
      const numbersOk =
        best && numbersIn(text).every((n) => numbersWithWords(chunkText(best.c)).has(n));
      if (best && best.score >= AUTO_SOURCE_OVERLAP && numbersOk) {
        push(text, [best.c]);
      } else if (isConversational(text)) {
        push(text, []);
      } else {
        dropped.push({ text, reason: "no_source" });
        previousDropped = true;
      }
      continue;
    }
    const cited = ids.map((id) => byId.get(id));
    if (cited.some((c) => !c)) {
      dropped.push({ text, reason: "unknown_source" });
      previousDropped = true;
      continue;
    }
    const chunks = cited as KnowledgeChunk[];
    const sourceText = chunks.map((c) => `${c.title} ${c.text}`).join(" ");

    const sourceNumbers = numbersWithWords(sourceText);
    if (numbersIn(text).some((n) => !sourceNumbers.has(n))) {
      dropped.push({ text, reason: "number_not_in_source" });
      previousDropped = true;
      continue;
    }

    const words = [...new Set(tokenize(text))];
    const sourceWords = new Set(tokenize(sourceText));
    const overlap = words.length
      ? words.filter((w) => sourceWords.has(w)).length / words.length
      : 1;
    if (overlap < MIN_OVERLAP) {
      dropped.push({ text, reason: "low_overlap" });
      previousDropped = true;
      continue;
    }

    push(text, chunks);
  }
  return { sentences, dropped };
}

/** Exposed for tests. */
export const __test = { numbersIn, isConversational, normalize, stripLeadingConnective };
