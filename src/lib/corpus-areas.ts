/**
 * Rechtsbereiche des Korpus — die Gliederung, nach der /ops/corpus den
 * Bestand zeigt: so, wie das österreichische Recht selbst aufgeteilt ist
 * (Bund → Länder → Gemeinden, daneben Verwaltungsvorschriften und die
 * Rechtsprechung nach Gerichtsbarkeit), nicht nach Ordnernamen.
 *
 * Reine Zuordnung, keine I/O. Eine Quelle, die hier fehlt, landet unter
 * „Sonstiges" — sie verschwindet nie aus der Ansicht.
 */

import { normOfficialUrl } from "@/lib/law-coverage";

export type CorpusAreaId =
  | "bund"
  | "land"
  | "kommunal"
  | "verwaltung"
  | "hoechstgerichte"
  | "verwaltungsgerichte"
  | "behoerden"
  | "historisch"
  | "sonstiges";

export interface CorpusArea {
  id: CorpusAreaId;
  title: string;
  /** Eine Zeile, was in diesen Bereich gehört. */
  hint: string;
  /** Normen oder Entscheidungen — bestimmt das Wort in der Anzeige. */
  unit: "Normen" | "Dokumente" | "Entscheidungen";
}

export const CORPUS_AREAS: readonly CorpusArea[] = [
  {
    id: "bund",
    title: "Bundesrecht",
    hint: "Bundesverfassung, Bundesgesetze und Verordnungen des Bundes, Staatsverträge — konsolidiert",
    unit: "Normen",
  },
  {
    id: "land",
    title: "Landesrecht",
    hint: "Landesverfassungen, Landesgesetze und Verordnungen der neun Länder — konsolidiert",
    unit: "Normen",
  },
  {
    id: "kommunal",
    title: "Bezirke und Gemeinden",
    hint: "Verordnungen und Kundmachungen der Bezirksverwaltungsbehörden und Gemeinden",
    unit: "Dokumente",
  },
  {
    id: "verwaltung",
    title: "Erlässe und amtliche Verlautbarungen",
    hint: "Erlässe der Ministerien, Verlautbarungen der Sozialversicherung, Veterinärnachrichten, Strukturpläne Gesundheit, Kundmachungen der Gerichte",
    unit: "Dokumente",
  },
  {
    id: "hoechstgerichte",
    title: "Rechtsprechung der Höchstgerichte",
    hint: "Verfassungsgerichtshof, Verwaltungsgerichtshof, Oberster Gerichtshof mit der ordentlichen Gerichtsbarkeit",
    unit: "Entscheidungen",
  },
  {
    id: "verwaltungsgerichte",
    title: "Rechtsprechung der Verwaltungsgerichte",
    hint: "Bundesverwaltungsgericht und Landesverwaltungsgerichte",
    unit: "Entscheidungen",
  },
  {
    id: "behoerden",
    title: "Entscheidungen von Behörden und Kommissionen",
    hint: "Datenschutzbehörde, Gleichbehandlungskommission, Personalvertretungsaufsicht, Disziplinarbehörden, Umweltsenat",
    unit: "Entscheidungen",
  },
  {
    id: "historisch",
    title: "Aufgelöste Einrichtungen",
    hint: "Asylgerichtshof und Unabhängige Verwaltungssenate — bis 2013, abgeschlossener Bestand",
    unit: "Entscheidungen",
  },
  {
    id: "sonstiges",
    title: "Sonstiges",
    hint: "Quellen ohne feste Zuordnung",
    unit: "Dokumente",
  },
];

/** Korpus-Ordner → Rechtsbereich und Reihenfolge darin (Stufenbau, dann Rang). */
const AREA_OF: Record<string, [CorpusAreaId, number]> = {
  "at-normen": ["bund", 0],
  "at-staatsvertraege": ["bund", 1],
  "at-landesrecht": ["land", 0],
  "at-bezirke": ["kommunal", 0],
  "at-gemeinden": ["kommunal", 1],
  "at-bmerl": ["verwaltung", 0],
  "at-avsv": ["verwaltung", 1],
  "at-avn": ["verwaltung", 2],
  "at-spg": ["verwaltung", 3],
  "at-kmger": ["verwaltung", 4],
  "at-judikatur-vfgh": ["hoechstgerichte", 0],
  "at-judikatur-vwgh": ["hoechstgerichte", 1],
  "at-judikatur": ["hoechstgerichte", 2],
  "at-judikatur-bvwg": ["verwaltungsgerichte", 0],
  "at-judikatur-lvwg": ["verwaltungsgerichte", 1],
  "at-judikatur-dsk": ["behoerden", 0],
  "at-judikatur-gbk": ["behoerden", 1],
  "at-judikatur-pvak": ["behoerden", 2],
  "at-judikatur-dok": ["behoerden", 3],
  "at-judikatur-ubas": ["behoerden", 4],
  "at-judikatur-umse": ["behoerden", 5],
  "at-judikatur-asylgh": ["historisch", 0],
  "at-judikatur-uvs": ["historisch", 1],
};

export function areaOfCorpus(corpus: string): { area: CorpusAreaId; rank: number } {
  const hit = AREA_OF[corpus];
  return hit ? { area: hit[0], rank: hit[1] } : { area: "sonstiges", rank: 99 };
}

/** Bundesländer in amtlicher Reihenfolge (B-Vg Art. 2), Kürzel wie in lawKeyFor. */
export const LAENDER: ReadonlyArray<{ code: string; name: string }> = [
  { code: "bgld", name: "Burgenland" },
  { code: "ktn", name: "Kärnten" },
  { code: "noe", name: "Niederösterreich" },
  { code: "ooe", name: "Oberösterreich" },
  { code: "sbg", name: "Salzburg" },
  { code: "stmk", name: "Steiermark" },
  { code: "tir", name: "Tirol" },
  { code: "vbg", name: "Vorarlberg" },
  { code: "wien", name: "Wien" },
];

export function landName(code: string): string {
  return LAENDER.find((l) => l.code === code)?.name ?? "Land unbekannt";
}

/**
 * Amtliche RIS-Seite eines Dokuments aus seiner Nummer — nur, wo die
 * Adresse sicher bekannt ist; sonst null (die Nummer steht dann ohne Link).
 */
export function risDocumentUrl(corpus: string, id: string): string | null {
  if (corpus === "at-normen") return normOfficialUrl("law-at-normen", id);
  if (corpus === "at-landesrecht") return normOfficialUrl("law-at-landesrecht", id);
  const q = encodeURIComponent(id);
  const abfrage: Record<string, string> = {
    "at-judikatur": "Justiz",
    "at-judikatur-vfgh": "Vfgh",
    "at-judikatur-vwgh": "Vwgh",
    "at-judikatur-bvwg": "Bvwg",
    "at-judikatur-lvwg": "Lvwg",
  };
  const a = abfrage[corpus];
  return a ? `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=${a}&Dokumentnummer=${q}` : null;
}
