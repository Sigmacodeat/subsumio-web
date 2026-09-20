// Strip what looks like client or personal data from concierge messages
// before they reach the model or the log. Visitors are asked not to paste
// matter data (professional secrecy, § 9 RAO) — this is the safety net for
// when they do anyway. Contact details belong in the contact form, which
// stores them with consent; they have no business in a chat transcript.

const RULES: Array<{ kind: string; re: RegExp }> = [
  { kind: "E-Mail", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { kind: "IBAN", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  // Austrian/German court file numbers: "3 Cg 123/24", "12 Os 45/23m", "1 Ob 2/19x", "5 O 123/21"
  {
    kind: "Aktenzeichen",
    re: /\b\d{1,3}\s?[A-Z][A-Za-z]{0,3}\s?\d{1,5}\/\d{2,4}[a-z]?\b/g,
  },
  // Austrian social security number: 4 digits + birth date DDMMYY
  { kind: "SVNR", re: /\b\d{4}\s?(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}\b/g },
  { kind: "Telefon", re: /(?:\+|00)\d{1,3}[\s/-]?(?:\(?\d{1,5}\)?[\s/-]?){2,5}\d{2,}/g },
  { kind: "Telefon", re: /\b0\d{2,4}[\s/-]?\d{3,}[\s/-]?\d{2,}\b/g },
  // Dates of birth written out ("geb. 12.03.1980", "geboren am 1.2.1975")
  { kind: "Geburtsdatum", re: /\bgeb(?:\.|oren)(?:\s+am)?\s+\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}/gi },
  // Party formula of a matter: "Huber ./. Meier GmbH". The "./." is unambiguous.
  {
    kind: "Name",
    re: /\b[A-ZÄÖÜ][\wäöüß-]+(?:\s+(?:GmbH|AG|KG|OG|GesmbH|e\.?U\.?))?\s*\.\/\.\s*[A-ZÄÖÜ][\wäöüß-]+(?:\s+(?:GmbH|AG|KG|OG|GesmbH|e\.?U\.?))?/g,
  },
  // "gegen" only inside a matter context — otherwise "Subsumio gegen Harvey"
  // (a comparison question) would be redacted and the answer would suffer.
  {
    kind: "Name",
    re: /\b(?:Akte|Verfahren|Klage|Mandat|Sache[n]?|Causa|Prozess|Streit)\s+(?:von\s+)?[A-ZÄÖÜ][\wäöüß-]+(?:\s+(?:GmbH|AG|KG|OG|GesmbH|e\.?U\.?))?\s+gegen\s+[A-ZÄÖÜ][\wäöüß-]+(?:\s+(?:GmbH|AG|KG|OG|GesmbH|e\.?U\.?))?/g,
  },
  // A person introduced by their role or title: "Mandant Huber", "Frau Dr. Meier",
  // "Klientin Maria Gruber". The role word stays, the name goes.
  {
    kind: "Name",
    re: /\b(Mandant(?:in)?|Klient(?:in)?|Gegner(?:in)?|Kläger(?:in)?|Beklagte[rn]?|Herr|Frau|Hr\.|Fr\.)\s+(?:(?:Dr|Mag|DI|Ing|Prof|MMag)\.?\s+)*[A-ZÄÖÜ][\wäöüß-]{1,}(?:\s+[A-ZÄÖÜ][\wäöüß-]{1,})?/g,
  },
];

/** Role words kept in place so the sentence still reads ("Mandant [Name entfernt]"). */
const KEEP_ROLE =
  /^(Mandant(?:in)?|Klient(?:in)?|Gegner(?:in)?|Kläger(?:in)?|Beklagte[rn]?|Herr|Frau|Hr\.|Fr\.|Akte|Verfahren|Klage|Mandat|Sache[n]?|Causa|Prozess|Streit)\s+/;

export interface RedactionResult {
  text: string;
  /** Kinds of data removed, e.g. ["E-Mail", "Aktenzeichen"] — shown to the visitor. */
  removed: string[];
}

export function redact(input: string): RedactionResult {
  let text = input;
  const removed = new Set<string>();
  for (const { kind, re } of RULES) {
    text = text.replace(re, (match) => {
      removed.add(kind);
      const role = kind === "Name" ? (match.match(KEEP_ROLE)?.[0] ?? "") : "";
      return `${role}[${kind} entfernt]`;
    });
  }
  return { text, removed: [...removed] };
}
