import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  calculateGkg,
  calculateFamilienrecht,
  calculateArbeitsrecht,
  calculateVerkehrsrecht,
  calculateMietrecht,
  calculateErbrecht,
  bestimmeStreitwert,
} from "@/lib/fachrechner";

const calculateSchema = z.object({
  rechner: z.enum([
    "gkg",
    "familienrecht",
    "arbeitsrecht",
    "verkehrsrecht",
    "mietrecht",
    "erbrecht",
    "streitwert",
  ]),
  input: z.record(z.unknown()),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: calculateSchema,
  },
  async (_ctx, body) => {
    const input = body.input as Record<string, unknown>;

    switch (body.rechner) {
      case "gkg": {
        const streitwert = Number(input.streitwert ?? 0);
        if (streitwert < 0) return apiError("invalid_input", "Streitwert muss >= 0 sein", 422);
        return apiSuccess(calculateGkg(streitwert));
      }
      case "familienrecht": {
        const verfahrensart = String(input.verfahrensart ?? "ehesachen") as
          | "ehesachen"
          | "folgesachen"
          | "elterliche_sorge"
          | "unterhalt"
          | "verfahrenskostenhilfe";
        const streitwert = Number(input.streitwert ?? 0);
        const einkommenMonatlich = input.einkommenMonatlich
          ? Number(input.einkommenMonatlich)
          : undefined;
        return apiSuccess(
          calculateFamilienrecht({ verfahrensart, streitwert, einkommenMonatlich })
        );
      }
      case "arbeitsrecht": {
        const streitwert = Number(input.streitwert ?? 0);
        const withTermin = Boolean(input.withTermin);
        if (streitwert <= 0) return apiError("invalid_input", "Streitwert muss > 0 sein", 422);
        return apiSuccess(calculateArbeitsrecht({ streitwert, withTermin }));
      }
      case "verkehrsrecht": {
        return apiSuccess(
          calculateVerkehrsrecht({
            reparaturkosten: input.reparaturkosten ? Number(input.reparaturkosten) : undefined,
            gutachterkosten: input.gutachterkosten ? Number(input.gutachterkosten) : undefined,
            mietwagenkosten: input.mietwagenkosten ? Number(input.mietwagenkosten) : undefined,
            nutzungsausfall: input.nutzungsausfall ? Number(input.nutzungsausfall) : undefined,
            heilbehandlungskosten: input.heilbehandlungskosten
              ? Number(input.heilbehandlungskosten)
              : undefined,
            schmerzensgeld: input.schmerzensgeld ? Number(input.schmerzensgeld) : undefined,
            verdienstausfall: input.verdienstausfall ? Number(input.verdienstausfall) : undefined,
            generalpauschale: input.generalpauschale ? Number(input.generalpauschale) : undefined,
          })
        );
      }
      case "mietrecht": {
        const art = String(input.art ?? "raeumungsklage") as
          | "raeumungsklage"
          | "mieterhoehung"
          | "mietminderung"
          | "betriebskostenabrechnung";
        const streitwert = Number(input.streitwert ?? 0);
        const monateRueckstand = input.monateRueckstand
          ? Number(input.monateRueckstand)
          : undefined;
        const monatsmiete = input.monatsmiete ? Number(input.monatsmiete) : undefined;
        return apiSuccess(calculateMietrecht({ art, streitwert, monateRueckstand, monatsmiete }));
      }
      case "erbrecht": {
        const art = String(input.art ?? "erbschein") as
          | "erbschein"
          | "nachlassverwaltung"
          | "erbstreitigkeit";
        const nachlasswert = Number(input.nachlasswert ?? 0);
        if (nachlasswert < 0) return apiError("invalid_input", "Nachlasswert muss >= 0 sein", 422);
        return apiSuccess(calculateErbrecht({ art, nachlasswert }));
      }
      case "streitwert": {
        const art = String(input.art ?? "einmalig") as
          | "unterhalt_monatlich"
          | "rente_monatlich"
          | "einmalig"
          | "wohnung_miete";
        const betrag = Number(input.betrag ?? 0);
        const faktor = input.faktor ? Number(input.faktor) : undefined;
        return apiSuccess({ streitwert: bestimmeStreitwert({ art, betrag, faktor }) });
      }
      default:
        return apiError("unknown_rechner", "Unbekannter Rechner", 400);
    }
  }
);
