/**
 * Legal questions with the provision that answers them.
 *
 * Used to compare two embedding spaces against the real corpus before the
 * live vectors are replaced (`scripts/compare-embedding-columns.ts`). The
 * measure is whether the named provision appears among the first results —
 * blunt on purpose, so it cannot be tuned after the fact.
 *
 * These are ordinary questions from Austrian practice with the provision a
 * lawyer would cite. They are not a benchmark and make no claim to cover
 * the law; they are a check that the new space still finds what the old one
 * found. Corrections are welcome — the set is only as good as its answers,
 * and a wrong expectation makes a good column look bad.
 */

export interface QueryProbe {
  question: string;
  /** Abbreviation as lawyers write it, e.g. "ABGB". */
  abbr: string;
  /** Section, as RIS writes it, e.g. "§ 1489". */
  paragraph: string;
  /** Other spellings of the law's name, for norms RIS has no abbreviation for. */
  names?: string[];
}

export const QUERY_PROBES: QueryProbe[] = [
  {
    question: "Wann verjährt ein Schadenersatzanspruch?",
    abbr: "ABGB",
    paragraph: "§ 1489",
    names: ["Allgemeines bürgerliches Gesetzbuch"],
  },
  {
    question: "Was kann der Käufer tun, wenn der Verkäufer nicht rechtzeitig liefert?",
    abbr: "ABGB",
    paragraph: "§ 918",
  },
  {
    question: "Wann kann ich einen Vertrag wegen Irrtums anfechten?",
    abbr: "ABGB",
    paragraph: "§ 871",
  },
  {
    question: "Welche Rechte habe ich, wenn die gekaufte Sache mangelhaft ist?",
    abbr: "ABGB",
    paragraph: "§ 932",
  },
  {
    question: "Welche Formvorschriften gelten für ein eigenhändiges Testament?",
    abbr: "ABGB",
    paragraph: "§ 578",
  },
  {
    question: "Wie hoch ist der Pflichtteil der Kinder im Erbrecht?",
    abbr: "ABGB",
    paragraph: "§ 759",
  },
  {
    question: "Wer haftet für den Schaden, den ein Gehilfe verursacht?",
    abbr: "ABGB",
    paragraph: "§ 1313a",
  },
  {
    question: "Welche Frist gilt für die Berufung gegen ein Urteil im Zivilprozess?",
    abbr: "ZPO",
    paragraph: "§ 464",
    names: ["Zivilprozessordnung"],
  },
  {
    question: "Wann liegt eine schwere Körperverletzung vor?",
    abbr: "StGB",
    paragraph: "§ 84",
    names: ["Strafgesetzbuch"],
  },
  {
    question: "Unter welchen Voraussetzungen ist Notwehr gerechtfertigt?",
    abbr: "StGB",
    paragraph: "§ 3",
  },
  {
    question: "Welche Strafe droht bei Diebstahl?",
    abbr: "StGB",
    paragraph: "§ 127",
  },
  {
    question: "Wie lange ist die Kündigungsfrist des Arbeitgebers bei Angestellten?",
    abbr: "AngG",
    paragraph: "§ 20",
    names: ["Angestelltengesetz"],
  },
  {
    question: "Wann darf ein Angestellter fristlos entlassen werden?",
    abbr: "AngG",
    paragraph: "§ 27",
  },
  {
    question: "Wann darf der Vermieter einen Mietvertrag kündigen?",
    abbr: "MRG",
    paragraph: "§ 30",
    names: ["Mietrechtsgesetz"],
  },
  {
    question: "Wie lange kann ein Verbraucher von einem Fernabsatzvertrag zurücktreten?",
    abbr: "FAGG",
    paragraph: "§ 11",
    names: ["Fern- und Auswärtsgeschäfte-Gesetz"],
  },
  {
    question: "Wann verjährt eine Verwaltungsübertretung?",
    abbr: "VStG",
    paragraph: "§ 31",
    names: ["Verwaltungsstrafgesetz"],
  },
  {
    question: "Welche Frist gilt für eine Beschwerde an das Verwaltungsgericht?",
    abbr: "VwGVG",
    paragraph: "§ 7",
    names: ["Verwaltungsgerichtsverfahrensgesetz"],
  },
  {
    question: "Wann haftet der Geschäftsführer einer GmbH persönlich?",
    abbr: "GmbHG",
    paragraph: "§ 25",
    names: ["GmbH-Gesetz", "Gesetz über Gesellschaften mit beschränkter Haftung"],
  },
  {
    question: "Innerhalb welcher Frist muss ein Unternehmer Mängel rügen?",
    abbr: "UGB",
    paragraph: "§ 377",
    names: ["Unternehmensgesetzbuch"],
  },
  {
    question: "Wie lange dauert die Karenz nach der Geburt eines Kindes?",
    abbr: "MSchG",
    paragraph: "§ 15",
    names: ["Mutterschutzgesetz"],
  },
];

/** One result of a vector search, as far as matching needs it. */
export interface ProbeCandidate {
  canonical_label?: string | null;
  statute_abbr?: string | null;
  paragraph_ref?: string | null;
  title?: string | null;
}

/** "§  1489 " and "§1489" are the same section. */
function normalizeParagraph(value: string): string {
  return value
    .replace(/§+/g, "§")
    .replace(/§\s*/g, "§ ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function haystack(c: ProbeCandidate): string {
  return `${c.canonical_label ?? ""} ${c.title ?? ""} ${c.statute_abbr ?? ""}`.toLowerCase();
}

/**
 * Does this result cite the provision the question asks about?
 *
 * The law has to match and the section has to match. Either may come from
 * its own column or from the citation label, because RIS has no
 * abbreviation for many laws and the label then carries the full name.
 */
export function probeHit(probe: QueryProbe, candidate: ProbeCandidate): boolean {
  const text = haystack(candidate);
  const abbr = probe.abbr.toLowerCase();
  const lawMatches =
    (candidate.statute_abbr ?? "").toLowerCase() === abbr ||
    new RegExp(`(^|[^a-zäöüß])${abbr}([^a-zäöüß]|$)`).test(text) ||
    (probe.names ?? []).some((n) => text.includes(n.toLowerCase()));
  if (!lawMatches) return false;

  const wanted = normalizeParagraph(probe.paragraph);
  const ref = normalizeParagraph(candidate.paragraph_ref ?? "");
  if (ref === wanted) return true;
  // The label reads "ABGB § 1489"; guard the end so § 148 never matches § 1489.
  const num = wanted.replace(/^§\s*/, "");
  return new RegExp(`§\\s*${num}([^0-9a-zäöüß]|$)`).test(normalizeParagraph(text));
}
