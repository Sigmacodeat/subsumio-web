// Lexical retrieval over the concierge knowledge base (BM25). The corpus is a
// few hundred website paragraphs, so an in-process index beats a round trip
// to the engine and cannot leak into any firm's brain.

import type { KnowledgeChunk } from "./knowledge";

const STOPWORDS = new Set(
  (
    "der die das den dem des ein eine einer eines einem einen und oder aber ist sind " +
    "wird werden wie was wer wo wann warum ich sie wir ihr es er mit von zu zum zur im in " +
    "an am auf aus bei für fur über uber unter nach vor bis auch nicht kein keine noch nur " +
    "so dass daß ob mein meine meinen ihre ihren unser unsere man kann können koennen muss " +
    "habe haben hat gibt geht mir mich dir dich uns euch sich als wenn dann denn doch ja " +
    "nein bitte danke hallo gut sehr mehr viel diese dieser dieses jede jeder jedes alle " +
    "the a an of to is are for and or"
  ).split(" ")
);

/** Lowercase, fold umlauts and ß, drop punctuation. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9§ ]+/g, " ");
}

/** Crude German stemmer: strip common inflection suffixes. */
function stem(token: string): string {
  if (token.length <= 4) return token;
  for (const suffix of [
    "ungen",
    "heit",
    "keit",
    "ung",
    "en",
    "er",
    "es",
    "em",
    "et",
    "e",
    "n",
    "s",
  ]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// Visitors ask "was kostet", the website says "Preise" and "Tarif". Expand the
// query (not the documents) with the words the website uses for the topic.
const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(kost|teuer|guenstig|zahl|gebuehr|abo|lizenz)/, "preis tarif monat"],
  [/\b(test|ausprobier|gratis|kostenlos)/, "testphase testen tage"],
  [/\b(kuendig|vertrag|laufzeit)/, "kuendbar monatlich"],
  [/\b(daten|server|hosting|cloud|speicher)\b/, "eu cloud hosting daten"],
  [/\b(datenschutz|dsgvo|avv)\b/, "dsgvo avv datenschutz"],
  [/\b(datenschutzbeauftragt|dsb\b)/, "dsb kontakt"],
  [/\b(mensch|mitarbeiter|beratung|anruf|rueckruf|termin|kontakt)/, "kontakt anfrage"],
];

export function expandQuery(query: string): string {
  const n = normalize(query);
  const extra = SYNONYMS.filter(([re]) => re.test(n)).map(([, words]) => words);
  return extra.length ? `${query} ${extra.join(" ")}` : query;
}

export interface Retriever {
  search(query: string, k?: number): Array<{ chunk: KnowledgeChunk; score: number }>;
}

export function buildRetriever(chunks: KnowledgeChunk[]): Retriever {
  const k1 = 1.4;
  const b = 0.75;
  const docs = chunks.map((chunk) => {
    // Titles carry the topic ("Preise", "Sicherheit") — weight them twice.
    const tokens = [...tokenize(chunk.title), ...tokenize(chunk.title), ...tokenize(chunk.text)];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { chunk, tf, len: tokens.length };
  });
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const idf = (t: string) => {
    const f = df.get(t) ?? 0;
    return Math.log(1 + (n - f + 0.5) / (f + 0.5));
  };

  return {
    search(query, k = 6) {
      const terms = [...new Set(tokenize(expandQuery(query)))];
      if (terms.length === 0) return [];
      return docs
        .map((d) => {
          let score = 0;
          for (const t of terms) {
            const f = d.tf.get(t);
            if (!f) continue;
            score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
          }
          return { chunk: d.chunk, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b2) => b2.score - a.score)
        .slice(0, k);
    },
  };
}
