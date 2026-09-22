"use client";

import { useState } from "react";
import { Landmark, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateGkg, GkgInputError } from "@/lib/legal/gkg";
import {
  GKG_GEBUEHRENSAETZE,
  GKG_SOURCE,
  type GkgGebuehrensatzKey,
} from "@/lib/legal/gkg-tariff-data";
import type { TariffInvoiceLine } from "@/components/legal/RatgTariffForm";

const eur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

export function GkgTariffForm({
  lines,
  onChange,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [satzKey, setSatzKey] = useState<GkgGebuehrensatzKey>("verfahren1Instanz");
  const [wert, setWert] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!label.trim()) {
      setError("Bitte den Vorgang benennen, z. B. „Klage beim LG …“.");
      return;
    }
    try {
      const result = calculateGkg({ streitwert: parseAmount(wert), satzKey });
      onChange([
        ...lines,
        {
          id: `gkg-${Date.now()}`,
          description: `${label.trim()} — Gerichtsgebühr ${result.satzLabel.replace(/ \(KV .*\)/, "")} (KV ${result.kv}, ${result.satz},0-fach) bei ${eur(result.streitwert)} Streitwert`,
          date: new Date().toISOString().slice(0, 10),
          amount: result.gebuehr,
        },
      ]);
      setLabel("");
      setWert("");
    } catch (err) {
      setError(err instanceof GkgInputError ? err.message : "Die Berechnung ist fehlgeschlagen.");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const ownLines = lines.filter((l) => l.id.startsWith("gkg-"));
  const total = ownLines.reduce((s, l) => s + l.amount, 0);

  return (
    <section
      aria-labelledby="gkg-heading"
      className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <div>
        <h3 id="gkg-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Landmark size={15} aria-hidden /> Gerichtsgebühren nach GKG (Deutschland)
        </h3>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          § 34 GKG-Stufenformel × Gebührensatz der Anlage 1 (KostBRÄG 2025). Vorschlag, vor dem
          Versand prüfen — die Gerichtskasse legt die Gebühr fest.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="gkg-label" className="text-xs">
            Vorgang *
          </Label>
          <Input
            id="gkg-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Klage beim LG München I"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gkg-satz" className="text-xs">
            Gebührensatz (KV Anlage 1)
          </Label>
          <Select value={satzKey} onValueChange={(v) => setSatzKey(v as GkgGebuehrensatzKey)}>
            <SelectTrigger id="gkg-satz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GKG_GEBUEHRENSAETZE).map(([key, def]) => (
                <SelectItem key={key} value={key}>
                  {def.label} — {def.satz.toLocaleString("de-DE")}-fach
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gkg-wert" className="text-xs">
            Streitwert in Euro *
          </Label>
          <Input
            id="gkg-wert"
            inputMode="decimal"
            value={wert}
            onChange={(e) => setWert(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. 25.000,00"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          Gebühr hinzufügen
        </Button>
        <span className="text-xs text-[color:var(--ds-text-subtle)]">{GKG_SOURCE.checkNote}</span>
      </div>

      {ownLines.length > 0 && (
        <ul className="space-y-1 text-xs">
          {ownLines.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 rounded bg-[color:var(--ds-surface-2)] px-2 py-1.5"
            >
              <span className="min-w-0 truncate">{l.description}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-medium tabular-nums">{eur(l.amount)}</span>
                <button
                  type="button"
                  aria-label="Position entfernen"
                  className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                  onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </span>
            </li>
          ))}
          <li className="flex justify-end pt-1 text-[color:var(--ds-text-muted)]">
            Summe GKG: <span className="ml-1 font-semibold tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
