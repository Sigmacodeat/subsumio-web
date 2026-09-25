"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  BILLING_INCREMENT_MAX,
  BILLING_INCREMENT_MIN,
  RATE_SOURCE_LABELS_DE,
  legalAreaRate,
  parseBillingIncrement,
  roundUpToIncrement,
  timeLineAmount,
} from "@/lib/billing-rules";
import { parseHourlyRate } from "@/lib/invoice-totals";

/** Example duration of the preview (spec: 22 min bei Takt 10 → 30 min). */
export const PREVIEW_MINUTES = 22;

const money = (n: number) =>
  `${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export interface BillingRulesSettingsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  abrechnungstakt?: string;
  stundensatz?: string;
  rechtsgebietSaetze?: Record<string, number>;
  tarifModell?: string;
  /** Display names of the practice-area keys. */
  areaLabel?: (key: string) => string;
  disabled?: boolean;
}

/**
 * Opt-in switch for the firm's billing rules (src/lib/billing-rules.ts) with
 * an explanation and a worked example from the values currently entered.
 */
export function BillingRulesSettings({
  enabled,
  onEnabledChange,
  abrechnungstakt,
  stundensatz,
  rechtsgebietSaetze,
  tarifModell,
  areaLabel = (k) => k,
  disabled,
}: BillingRulesSettingsProps) {
  const increment = parseBillingIncrement(abrechnungstakt);
  const firmRate = parseHourlyRate(stundensatz ?? null);
  const exampleArea = Object.keys(rechtsgebietSaetze ?? {}).find(
    (k) => legalAreaRate(rechtsgebietSaetze, k) !== null
  );
  const exampleAreaRate = exampleArea ? legalAreaRate(rechtsgebietSaetze, exampleArea) : null;
  const billed = roundUpToIncrement(PREVIEW_MINUTES, increment);
  const exampleRate = exampleAreaRate ?? firmRate;

  return (
    <div className="space-y-3" data-testid="billing-rules-settings">
      <label className="flex items-start gap-2 text-sm text-[color:var(--ds-text)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          aria-describedby="billing-rules-desc"
        />
        <span>
          Abrechnungstakt und Sätze je Rechtsgebiet beim Rechnungsstellen anwenden
          <span id="billing-rules-desc" className="block text-xs text-[color:var(--ds-text-muted)]">
            Standardmäßig aus. Eingeschaltet wird beim Übernehmen von Zeiteinträgen in eine Rechnung
            die verrechnete Dauer auf den nächsten Abrechnungstakt aufgerundet; die erfasste Zeit im
            Zeiteintrag bleibt unverändert. Die Rechnungsposition weist erfasste und verrechnete
            Minuten sowie die Herkunft des Stundensatzes aus.
          </span>
        </span>
      </label>

      {enabled && increment === null && (
        <p className="flex items-start gap-1.5 text-xs text-[color:var(--ds-warning-text)]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Kein gültiger Abrechnungstakt eingetragen (ganze Minuten von {
            BILLING_INCREMENT_MIN
          } bis {BILLING_INCREMENT_MAX}) — Zeiten werden dann nicht gerundet.
        </p>
      )}

      <div
        className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)]"
        aria-label="Vorschau der Abrechnungsregeln"
      >
        <p className="font-medium text-[color:var(--ds-text)]">
          Beispiel{enabled ? "" : " (wirkt erst nach dem Einschalten)"}
        </p>
        <p data-testid="billing-rules-example-rounding">
          {increment !== null
            ? `Erfasst ${PREVIEW_MINUTES} Minuten, Takt ${increment} Minuten → verrechnet ${billed} Minuten.`
            : `Erfasst ${PREVIEW_MINUTES} Minuten → verrechnet ${PREVIEW_MINUTES} Minuten (kein gültiger Takt).`}
          {exampleRate !== null && (
            <>
              {" "}
              Bei {money(exampleRate)}/h ergibt das {money(timeLineAmount(billed, exampleRate))}.
            </>
          )}
        </p>
        <p className="mt-1">Der Stundensatz einer Position kommt aus (in dieser Reihenfolge):</p>
        <ol className="ml-4 list-decimal" data-testid="billing-rules-example-sources">
          <li>{RATE_SOURCE_LABELS_DE.fee_agreement}, falls für die Akte eine besteht;</li>
          <li>
            {RATE_SOURCE_LABELS_DE.legal_area} der Akte
            {exampleArea && exampleAreaRate !== null
              ? ` (z. B. ${areaLabel(exampleArea)}: ${money(exampleAreaRate)}/h)`
              : ""}
            ;
          </li>
          <li>
            {RATE_SOURCE_LABELS_DE.firm_default}
            {firmRate !== null ? ` (${money(firmRate)}/h)` : " — derzeit nicht hinterlegt"}.
          </li>
        </ol>
        <p className="mt-1">
          Ein direkt am Zeiteintrag erfasster Satz (auch 0 € pro bono) bleibt immer erhalten. Ohne
          gültigen Satz wird keine Rechnung erstellt, sondern ein Hinweis angezeigt.
        </p>
      </div>

      {tarifModell === "ratg" && (
        <p className="text-xs text-[color:var(--ds-text-muted)]" data-testid="billing-rules-ratg">
          Tarifleistungen nach RATG werden nicht automatisch berechnet — die Abrechnungsregeln
          betreffen nur Leistungen nach Zeit. Tarifleistungen berechnen Sie mit dem Tarifrechner in
          der{" "}
          <Link href="/dashboard/invoicing" className="brand-text underline underline-offset-2">
            Honorarnote (Rechnungen → Rechnung erstellen)
          </Link>
          .
        </p>
      )}
    </div>
  );
}
