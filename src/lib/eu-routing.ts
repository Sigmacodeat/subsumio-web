/**
 * EU-Datenmodus je Kanzlei (`org.modelPolicy: "eu_only"`): jede KI-Anfrage
 * der Kanzlei läuft dann nur über EU-Modellwege; die Engine lehnt nicht-EU
 * Ziele ab (server/src/core/ai/request-eu-policy.ts), ohne Ausweichweg.
 *
 * Entscheidung zur Voreinstellung: Eine neue Kanzlei mit Sitz in AT/DE/CH
 * startet im EU-Datenmodus, WENN der Betreiber einen EU-Modellweg
 * eingerichtet und das mit `SUBSUMIO_EU_MODEL_ROUTE=1` bestätigt hat (die
 * Web-App kann das Engine-Routing nicht selbst prüfen). Ohne EU-Modellweg
 * bliebe im EU-Modus jede KI-Anfrage abgelehnt — dann bleibt es bei „alle
 * Anbieter“ und die Einstellungen zeigen offen, dass Anfragen an Anbieter in
 * den USA gehen.
 */

export type ModelPolicy = "any" | "eu_only";

const DACH = new Set(["AT", "DE", "CH"]);

function truthy(v: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((v ?? "").trim());
}

/** The operator confirmed an EU model route (or runs the whole deployment EU-only). */
export function euRouteAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return truthy(env.SUBSUMIO_EU_MODEL_ROUTE) || truthy(env.SUBSUMIO_EU_ONLY);
}

/** Model policy a newly founded firm starts with. */
export function defaultModelPolicyForNewOrg(
  jurisdiction: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): ModelPolicy {
  return DACH.has((jurisdiction ?? "").toUpperCase()) && euRouteAvailable(env) ? "eu_only" : "any";
}
