/**
 * draft-packages.ts — Verfahrenstyp- and Parteirollen-aware draft package
 * resolution for the legal pipeline (Gap B).
 *
 * Replaces the static DRAFT_PACKAGES_BY_JURISDICTION lookup in
 * legal-pipeline.ts, which hard-wired ONE case archetype (Amtshaftung/
 * Strafantrag) for every Austrian Akte. A Mietrecht or Werklohn case got
 * Amtshaftungs-Drafts — a blocker for general Kanzlei use.
 *
 * Resolution matrix (AT):
 *   zivil + klaeger    → Mahnklage (zwingend bis € 75.000, § 244 ZPO),
 *                        Klage, vorbereitender Schriftsatz, Beweisantrag,
 *                        Kostenverzeichnis (RATG), Versand-Checkliste
 *   zivil + beklagter  → Einspruch gg. Zahlungsbefehl, KLAGEBEANTWORTUNG,
 *                        Einreden-Katalog, Beweisantrag (Gegenbeweis),
 *                        Kostenverzeichnis, Versand-Checkliste
 *   arbeitsrecht       → ASGG-Varianten (ASG Wien / LG als ASG)
 *   verwaltungsrecht   → Bescheidbeschwerde (VwGVG), Säumnisbeschwerde,
 *                        VwGH-Revisions-Vorprüfung
 *   straf / sonstiges  → legacy AT-Paket (backward compatible: the flagship
 *                        Amtshaftungs-Strafakte keeps producing exactly the
 *                        drafts it produced before this module existed)
 *
 * DE/CH/EU keep their existing static sets — verticalizing those matrices
 * is tracked as follow-up work; AT is the launch market.
 *
 * The Kostenverzeichnis draft is fed by the deterministic RATG calculator
 * (kosten-at.ts); the drafter LLM formats, it never re-computes.
 */

export type Jurisdiction = "at" | "de" | "ch" | "eu";
export type PipelineVerfahrenstyp =
  | "straf"
  | "zivil"
  | "arbeitsrecht"
  | "verwaltungsrecht"
  | "sonstiges";
export type Parteirolle = "klaeger" | "beklagter" | "unbekannt";

export interface DraftPackage {
  type: string;
  title: string;
  /** Extra instruction appended to the drafter prompt for this package. */
  hinweis?: string;
}

// ── Legacy sets (unchanged — backward compatibility) ────────

/** The pre-Gap-B AT package (flagship Amtshaftungs-/Strafakte). */
export const LEGACY_AT_PACKAGE: DraftPackage[] = [
  { type: "ahg_antrag", title: "AHG-Antrag (§ 8 AHG an Finanzprokuratur)" },
  { type: "strafantrag", title: "Strafantrag (§ 28 StPO an STA)" },
  { type: "einspruch", title: "Einspruch (§ 106 StPO)" },
  { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
  { type: "klage_entwurf", title: "Klageentwurf (AHG-Klage LG ZRS)" },
  { type: "versand_checkliste", title: "Versand-Checkliste" },
];

export const STATIC_PACKAGES_DE: DraftPackage[] = [
  { type: "amtshaftung_anspruch", title: "Amtshaftungsanspruch (§ 839 BGB i.V.m. Art 34 GG)" },
  { type: "strafanzeige", title: "Strafanzeige (§ 158 StPO an STA)" },
  { type: "widerspruch", title: "Widerspruch (§ 69 VwGO)" },
  { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
  { type: "klage_entwurf", title: "Klageentwurf (Landgericht Zivilkammer)" },
  { type: "versand_checkliste", title: "Versand-Checkliste" },
];

export const STATIC_PACKAGES_CH: DraftPackage[] = [
  { type: "staatshaftung", title: "Staatshaftungsanspruch (Art 61 BV)" },
  { type: "strafanzeige", title: "Strafanzeige (Art 118 StPO an Staatsanwaltschaft)" },
  { type: "beschwerde", title: "Beschwerde (Art 80 BGG)" },
  { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO / nDSG)" },
  { type: "klage_entwurf", title: "Klageentwurf (Bezirks-/Kantonsgericht)" },
  { type: "versand_checkliste", title: "Versand-Checkliste" },
];

export const STATIC_PACKAGES_EU: DraftPackage[] = [
  { type: "eu_beschwerde", title: "EU-Beschwerde (an EU-Institution)" },
  { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
  { type: "menschrechts_beschwerde", title: "EMRK-Beschwerde (Art 13 EMRK)" },
  { type: "versand_checkliste", title: "Versand-Checkliste" },
];

// ── AT dynamic sets ─────────────────────────────────────────

const KOSTENVERZEICHNIS: DraftPackage = {
  type: "kostenverzeichnis",
  title: "Kostenverzeichnis (RATG)",
  hinweis:
    "Formatiere das im Kontext mitgegebene, deterministisch berechnete RATG-Kostenverzeichnis. " +
    "RECHNE KEINE Beträge selbst — übernimm die Zahlen exakt aus dem Kontext.",
};

const VERSAND: DraftPackage = { type: "versand_checkliste", title: "Versand-Checkliste" };

const AT_ZIVIL_KLAEGER: DraftPackage[] = [
  {
    type: "mahnklage",
    title: "Mahnklage (§ 244 ZPO)",
    hinweis:
      "Mahnverfahren ist bis € 75.000 Streitwert ZWINGEND (§ 244 Abs 2 ZPO). " +
      "Liegt der Streitwert darüber, vermerke dies und verweise auf den Klageentwurf.",
  },
  { type: "klage_entwurf", title: "Klageentwurf" },
  { type: "vorbereitender_schriftsatz", title: "Vorbereitender Schriftsatz (§ 257 ZPO)" },
  {
    type: "beweisantrag",
    title: "Beweisanbot / Beweisantrag",
    hinweis: "Nutze die Beilagen-Klassifikation aus der ON-Tabelle (Beilage ./A, ./B, ...).",
  },
  KOSTENVERZEICHNIS,
  VERSAND,
];

const AT_ZIVIL_BEKLAGTER: DraftPackage[] = [
  {
    type: "einspruch_zahlungsbefehl",
    title: "Einspruch gegen Zahlungsbefehl (§ 248 ZPO)",
    hinweis: "Nur relevant, wenn ein Zahlungsbefehl im Akt liegt — sonst kurz vermerken.",
  },
  { type: "klagebeantwortung", title: "Klagebeantwortung (§ 230 ZPO)" },
  {
    type: "einreden_katalog",
    title: "Einreden-Katalog",
    hinweis:
      "Systematisch: Unzuständigkeit, Streitanhängigkeit, Verjährung, Aufrechnung, " +
      "mangelnde Aktiv-/Passivlegitimation — je mit Beleg aus dem Akt.",
  },
  {
    type: "beweisantrag",
    title: "Beweisanbot / Gegenbeweis",
    hinweis: "Nutze die Beilagen-Klassifikation (Gegner: arabische Ziffern ./1, ./2, ...).",
  },
  KOSTENVERZEICHNIS,
  VERSAND,
];

const AT_ARBEITSRECHT_KLAEGER: DraftPackage[] = [
  { type: "asg_klage", title: "Klage an das Arbeits- und Sozialgericht (ASGG)" },
  { type: "vorbereitender_schriftsatz", title: "Vorbereitender Schriftsatz" },
  { type: "beweisantrag", title: "Beweisanbot / Beweisantrag" },
  KOSTENVERZEICHNIS,
  VERSAND,
];

const AT_ARBEITSRECHT_BEKLAGTER: DraftPackage[] = [
  { type: "klagebeantwortung", title: "Klagebeantwortung (ASGG-Verfahren)" },
  { type: "einreden_katalog", title: "Einreden-Katalog" },
  { type: "beweisantrag", title: "Beweisanbot / Gegenbeweis" },
  KOSTENVERZEICHNIS,
  VERSAND,
];

const AT_VERWALTUNGSRECHT: DraftPackage[] = [
  { type: "beschwerde_vwgvg", title: "Bescheidbeschwerde (§ 9 VwGVG)" },
  { type: "saeumnisbeschwerde", title: "Säumnisbeschwerde (§ 8 VwGVG)" },
  {
    type: "revision_vwgh_vorpruefung",
    title: "VwGH-Revisions-Vorprüfung (Art 133 Abs 4 B-VG)",
    hinweis: "Prüfe die Zulässigkeitsvoraussetzungen (grundsätzliche Rechtsfrage) und dokumentiere sie.",
  },
  VERSAND,
];

// ── Resolution ──────────────────────────────────────────────

export interface ResolveDraftPackagesOpts {
  jurisdiction?: Jurisdiction;
  verfahrenstyp?: PipelineVerfahrenstyp;
  parteirolle?: Parteirolle;
}

/**
 * Resolve the draft package set for a pipeline run.
 * Backward compatible: AT + straf/sonstiges (and any unspecified inputs)
 * return exactly the legacy set.
 */
export function resolveDraftPackages(opts: ResolveDraftPackagesOpts = {}): DraftPackage[] {
  const jurisdiction = opts.jurisdiction ?? "at";
  if (jurisdiction === "de") return STATIC_PACKAGES_DE;
  if (jurisdiction === "ch") return STATIC_PACKAGES_CH;
  if (jurisdiction === "eu") return STATIC_PACKAGES_EU;

  const verfahrenstyp = opts.verfahrenstyp ?? "sonstiges";
  const rolle = opts.parteirolle ?? "unbekannt";

  switch (verfahrenstyp) {
    case "zivil":
      if (rolle === "beklagter") return AT_ZIVIL_BEKLAGTER;
      if (rolle === "klaeger") return AT_ZIVIL_KLAEGER;
      // Rolle unbekannt: Kläger-Set + Klagebeantwortung, damit beide
      // Richtungen vorbereitet sind (der Anwalt streicht, was nicht passt).
      return [
        ...AT_ZIVIL_KLAEGER.filter((p) => p.type !== "versand_checkliste"),
        { type: "klagebeantwortung", title: "Klagebeantwortung (§ 230 ZPO)" },
        VERSAND,
      ];
    case "arbeitsrecht":
      return rolle === "beklagter" ? AT_ARBEITSRECHT_BEKLAGTER : AT_ARBEITSRECHT_KLAEGER;
    case "verwaltungsrecht":
      return AT_VERWALTUNGSRECHT;
    case "straf":
    case "sonstiges":
    default:
      return LEGACY_AT_PACKAGE;
  }
}

// ── Parteirollen-Auto-Detection ─────────────────────────────

/** Minimal entity shape shared with the pipeline (structural typing). */
export interface EntityLike {
  name: string;
  role: string;
}

const KLAEGER_ROLES = /kläger|klaeger|antragsteller|betreib|opfer|privatbeteiligt|geschädigt|geschaedigt/i;
const BEKLAGTER_ROLES = /beklagte|antragsgegner|verpflichtete|beschuldigt|angeklagt/i;

/**
 * Infer the Mandant's Parteirolle from extracted entities + the attorney's
 * manual override (client name). Deterministic heuristic:
 *   - explicit override wins,
 *   - otherwise: if the client entity carries a Kläger-side role → klaeger,
 *     a Beklagten-side role → beklagter,
 *   - otherwise unbekannt (pipeline prepares both directions).
 */
export function detectParteirolle(
  entities: EntityLike[],
  opts?: { client?: string; parteirolle?: Parteirolle }
): Parteirolle {
  if (opts?.parteirolle && opts.parteirolle !== "unbekannt") return opts.parteirolle;
  const clientNorm = opts?.client?.toLowerCase().trim();
  if (clientNorm) {
    for (const e of entities) {
      const nameNorm = e.name.toLowerCase();
      if (nameNorm.includes(clientNorm) || clientNorm.includes(nameNorm)) {
        if (KLAEGER_ROLES.test(e.role)) return "klaeger";
        if (BEKLAGTER_ROLES.test(e.role)) return "beklagter";
      }
    }
  }
  return "unbekannt";
}
