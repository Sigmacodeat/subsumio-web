/**
 * frist-options.ts — one list of selectable deadline types and one compute
 * call for every manual deadline UI (quick-create dialog, deadline calculator).
 *
 * Austria uses the deterministic frist-engine registry (ZPO, StPO, AVG,
 * VwGVG, VwGG, VfGG, ABGB, BAO) with § 222 ZPO, § 89a GOG and the Austrian
 * holiday calendar. DE/CH keep the generic `DEADLINE_RULES` table. A firm
 * without a configured Rechtsraum is treated as Austrian: the product
 * launches in Austria, and silently falling back to German rules put a
 * "§ 517 ZPO" (DE) Berufungsfrist into Austrian matters.
 */

import {
  FRISTEN_REGISTRY,
  berechneFristAuto,
  resolveFristArt,
  zustellungERV,
  type FristArt,
  type VerfahrenshilfeUnterbrechung,
} from "@/lib/legal/frist-engine";
import {
  FRISTEN_REGISTRY_DE,
  berechneFristArtDE,
  fristArtDE,
  zustellungBea,
  type Bundesland as DEBundesland,
} from "@/lib/legal/frist-engine-de";
import {
  DEADLINE_RULES,
  computeDueDate,
  type Bundesland,
  type Canton,
} from "@/lib/legal-deadlines";

export type FristCountry = "AT" | "DE" | "CH";

export interface FristOption {
  key: string;
  label: string;
  law: string;
  description: string;
  group: string;
  notfrist: boolean;
}

export interface FristComputation {
  key: string;
  label: string;
  law: string;
  /** Day the period starts from (after any service fiction). */
  fristbeginn: string;
  dueDate: string;
  /** Only the AT engine computes a Vorfrist; callers fall back to their own. */
  vorfrist?: string;
  notfrist: boolean;
  hinweise: string[];
  /** The Fristart is suspended by the verhandlungsfreie Zeit (§ 222 Abs 1
   *  ZPO), so the user must say whether the matter is a Ferialsache
   *  (§ 222 Abs 2 ZPO). Always false outside Austria. */
  ferialsacheRelevant: boolean;
  /** True when § 222 Abs 1 ZPO extended the period — only correct if the
   *  matter is NOT a Ferialsache; callers flag it for a second check. */
  vhfzVerlaengert: boolean;
  /** § 73 ZPO: a Verfahrenshilfeantrag interrupted this run (AT only, ZPO
   *  Rechtsmittel-/Rechtsmittelbeantwortungsfristen). */
  verfahrenshilfeUnterbrochen: boolean;
}

/** Hinweis, der jede durch die verhandlungsfreie Zeit verlängerte Frist
 *  begleitet, solange niemand bestätigt hat, dass keine Ferialsache vorliegt. */
export const FERIALSACHE_WARNUNG =
  "Ferialsache prüfen: In den Fällen des § 222 Abs 2 ZPO (u. a. einstweilige Verfügungen, Unterhalt, Besitzstörung, Wechselsachen, §§ 35–37 EO, Verfahrenshilfe, Beweissicherung, Wiedereinsetzung, Versäumungs- und Anerkenntnisurteile) gibt es keine Hemmung — die Frist endet dann früher.";

/** True when the engine's notes show a § 222 Abs 1 ZPO extension. */
export function vhfzHatVerlaengert(hinweise: readonly string[]): boolean {
  return hinweise.some((h) => h.includes("(§ 222 Abs 1 ZPO)"));
}

const VERFAHREN_LABEL: Record<FristArt["verfahrenstyp"], string> = {
  zivil: "Zivilverfahren",
  straf: "Strafverfahren",
  verwaltungsrecht: "Verwaltungsverfahren",
  arbeitsrecht: "Arbeitsrecht",
  alle: "Materielles Recht und Abgaben",
};

const VERFAHREN_LABEL_DE: Record<string, string> = {
  zivil: "Zivilverfahren",
  straf: "Strafverfahren",
  verwaltungsrecht: "Verwaltungsverfahren",
  alle: "Materielles Recht",
};

/** Registry entries that belong to another jurisdiction (e.g. `steuer_einspruch_de`). */
function isForeignArt(art: FristArt): boolean {
  return /_(de|ch)$/.test(art.key);
}

export function resolveFristCountry(country?: string): FristCountry {
  return country === "DE" || country === "CH" ? country : "AT";
}

export function fristOptionsFor(country?: string): FristOption[] {
  if (resolveFristCountry(country) === "AT") {
    return FRISTEN_REGISTRY.filter((art) => !isForeignArt(art)).map((art) => ({
      key: art.key,
      label: art.bezeichnung,
      law: art.rechtsgrundlage,
      description: art.hinweis ?? "",
      group: art.regime === "materiell" ? VERFAHREN_LABEL.alle : VERFAHREN_LABEL[art.verfahrenstyp],
      notfrist: art.notfrist,
    }));
  }
  if (resolveFristCountry(country) === "DE") {
    const registryKeys = new Set(FRISTEN_REGISTRY_DE.map((f) => f.key));
    return [
      ...FRISTEN_REGISTRY_DE.map((art) => ({
        key: art.key,
        label: art.bezeichnung,
        law: art.rechtsgrundlage,
        description: art.hinweis ?? "",
        group: VERFAHREN_LABEL_DE[art.verfahrenstyp] ?? "",
        notfrist: art.notfrist,
      })),
      ...DEADLINE_RULES.filter((r) => !registryKeys.has(r.key)).map((rule) => ({
        key: rule.key,
        label: rule.label,
        law: rule.law,
        description: rule.description,
        group: "",
        notfrist: false,
      })),
    ];
  }
  return DEADLINE_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    law: rule.law,
    description: rule.description,
    group: "",
    notfrist: false,
  }));
}

/**
 * Computes the deadline for `key` from `startIso`.
 *
 * `ervEinlangen`: the date is the day the document arrived in the ERV
 * mailbox. For Austria § 89a Abs 2 GOG moves service to the next working
 * day (Saturday does not count); the engine applies it unless the Fristart
 * already carries its own service trigger.
 *
 * Throws for an unknown key — callers must show the error instead of
 * falling back to a different rule set.
 */
export function computeFrist(
  key: string,
  startIso: string,
  opts: {
    country?: string;
    state?: string;
    ervEinlangen?: boolean;
    /** § 222 Abs 2 ZPO: no suspension by the verhandlungsfreie Zeit. */
    ferialsache?: boolean;
    /** § 73 ZPO: a Verfahrenshilfeantrag filed against this (still open)
     *  Rechtsmittel-/Rechtsmittelbeantwortungsfrist. AT only. */
    verfahrenshilfe?: VerfahrenshilfeUnterbrechung;
  } = {}
): FristComputation {
  const country = resolveFristCountry(opts.country);
  if (country === "AT") {
    const art = resolveFristArt(key);
    if (!art || isForeignArt(art)) {
      throw new Error(`Unbekannte österreichische Fristart „${key}“`);
    }
    const applyErv = opts.ervEinlangen && !art.zustellungs_trigger;
    const zustellung = applyErv ? zustellungERV(startIso) : startIso;
    const result = berechneFristAuto(key, zustellung, {
      ferialsache: opts.ferialsache === true,
      verfahrenshilfe: opts.verfahrenshilfe,
    });
    const vhfzVerlaengert = vhfzHatVerlaengert(result.hinweise);
    const hinweise = [
      ...(applyErv
        ? [`ERV-Zustellungsfiktion (§ 89a Abs 2 GOG): zugestellt am ${zustellung}`]
        : []),
      ...result.hinweise,
      ...(vhfzVerlaengert ? [FERIALSACHE_WARNUNG] : []),
    ];
    return {
      key,
      label: art.bezeichnung,
      law: art.rechtsgrundlage,
      fristbeginn: result.fristbeginn,
      dueDate: result.fristende,
      vorfrist: result.vorfrist,
      notfrist: art.notfrist,
      hinweise: art.hinweis ? [...hinweise, art.hinweis] : hinweise,
      ferialsacheRelevant: art.regime === "zpo" && art.gehemmtInVhfz,
      vhfzVerlaengert,
      verfahrenshilfeUnterbrochen: result.verfahrenshilfeUnterbrochen === true,
    };
  }

  if (country === "DE") {
    const art = fristArtDE(key);
    if (art) {
      const land = opts.state as DEBundesland | undefined;
      const applyBea = opts.ervEinlangen === true;
      const zustellung = applyBea ? zustellungBea(startIso, land) : startIso;
      const result = berechneFristArtDE(key, zustellung, land);
      const hinweise = applyBea
        ? [
            `beA-Zustellungsfiktion (§ 174 ZPO i.V.m. § 4 ERVG): zugestellt am ${zustellung}`,
            ...result.hinweise,
          ]
        : result.hinweise;
      return {
        key,
        label: art.bezeichnung,
        law: art.rechtsgrundlage,
        fristbeginn: result.fristbeginn,
        dueDate: result.fristende,
        vorfrist: result.vorfrist,
        notfrist: art.notfrist,
        hinweise: art.hinweis ? [...hinweise, art.hinweis] : hinweise,
        ferialsacheRelevant: false,
        vhfzVerlaengert: false,
        verfahrenshilfeUnterbrochen: false,
      };
    }
  }

  const rule = DEADLINE_RULES.find((r) => r.key === key);
  if (!rule) throw new Error(`Unknown deadline rule "${key}"`);
  const { dueDate, note } = computeDueDate(
    rule,
    startIso,
    opts.state as Bundesland | Canton | undefined,
    country,
    opts.ervEinlangen ? startIso : undefined
  );
  return {
    key,
    label: rule.label,
    law: rule.law,
    fristbeginn: startIso,
    dueDate,
    notfrist: false,
    hinweise: note ? [note] : [],
    ferialsacheRelevant: false,
    vhfzVerlaengert: false,
    verfahrenshilfeUnterbrochen: false,
  };
}
