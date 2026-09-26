"use client";

import { useState } from "react";
import { Globe2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrg, useUpdateOrg } from "@/lib/queries/settings";

interface OrgView {
  org: {
    id: string;
    modelPolicy?: "any" | "eu_only";
    euRouteAvailable?: boolean;
  } | null;
  isOwner?: boolean;
}

/**
 * Transparenz über den KI-Datenweg: Wohin gehen KI-Anfragen dieser Kanzlei?
 * Im EU-Datenmodus lehnt die Engine jedes nicht-EU Ziel ab; sonst gehen
 * Anfragen an Anbieter in den USA — das steht hier offen, statt nur im AVV.
 * Umschalten darf die Inhaberin/der Inhaber der Kanzlei; einschalten nur,
 * wenn ein EU-Modellweg eingerichtet ist (sonst würde jede KI-Anfrage
 * abgelehnt). Siehe src/lib/eu-routing.ts.
 */
export function DataResidencyCard() {
  const org = useOrg();
  const update = useUpdateOrg();
  const [error, setError] = useState<string | null>(null);
  const view = org.data as OrgView | undefined;
  if (org.isLoading) return null;

  const policy = view?.org?.modelPolicy ?? "any";
  const euOnly = policy === "eu_only";
  const euAvailable = view?.org?.euRouteAvailable === true;
  const canToggle = !!view?.org && view.isOwner === true;

  function setPolicy(next: "any" | "eu_only") {
    setError(null);
    update.mutate(
      { modelPolicy: next },
      {
        onError: () => setError("Die Einstellung konnte nicht gespeichert werden."),
      }
    );
  }

  return (
    <section
      aria-labelledby="data-residency-title"
      className={
        euOnly
          ? "space-y-2 rounded-2xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-4"
          : "space-y-2 rounded-2xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4"
      }
    >
      <h2
        id="data-residency-title"
        className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]"
      >
        {euOnly ? <ShieldCheck size={16} aria-hidden /> : <Globe2 size={16} aria-hidden />}
        {euOnly ? "KI-Datenweg: nur EU" : "KI-Datenweg: auch Anbieter in den USA"}
      </h2>
      <p className="text-xs text-[color:var(--ds-text)]">
        {euOnly
          ? "KI-Anfragen dieser Kanzlei werden nur über Modelle mit Verarbeitung in der EU ausgeführt. Ein nicht-EU Ziel wird abgelehnt, es gibt keinen stillen Ausweichweg."
          : "KI-Anfragen (Frage und die dafür ausgewählten Ausschnitte aus Akten und Dokumenten) werden an Anthropic PBC in den USA übermittelt, ersatzweise über OpenRouter an weitere Anbieter. Grundlage sind Standardvertragsklauseln; die Anbieter trainieren nicht mit Ihren Daten. Einzelheiten stehen in der Liste der Auftragsverarbeiter (AVV § 4)."}
      </p>
      {!euOnly && !euAvailable && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Ein EU-Datenmodus ist möglich, sobald der Betreiber einen EU-Modellweg eingerichtet hat.
        </p>
      )}
      {canToggle && (euOnly || euAvailable) && (
        <Button
          size="sm"
          variant="outline"
          disabled={update.isPending}
          onClick={() => setPolicy(euOnly ? "any" : "eu_only")}
        >
          {update.isPending && <Loader2 size={14} className="animate-spin" />}
          {euOnly ? "Auch Anbieter außerhalb der EU zulassen" : "Nur EU-Modelle verwenden"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      )}
    </section>
  );
}
