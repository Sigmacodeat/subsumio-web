"use client";

import { useState } from "react";
import { Calculator, Trash2 } from "lucide-react";
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
import { calculateRvg } from "@/lib/rvg";
import type { TariffInvoiceLine } from "@/components/legal/RatgTariffForm";

const eur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

type VvPosition = "verfahrensgebuehr" | "terminsgebuehr" | "einigungsgebuehr" | "auslagenpauschale";

const VV_OPTIONS: Array<{ value: VvPosition; label: string }> = [
  { value: "verfahrensgebuehr", label: "Verfahrensgebühr 1,3 (VV 3100)" },
  { value: "terminsgebuehr", label: "Terminsgebühr 1,2 (VV 3104)" },
  { value: "einigungsgebuehr", label: "Einigungsgebühr 1,0 (VV 1003)" },
  { value: "auslagenpauschale", label: "Auslagenpauschale (VV 7002 — 20 €)" },
];

export function RvgTariffForm({
  lines,
  onChange,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [vv, setVv] = useState<VvPosition>("verfahrensgebuehr");
  const [wert, setWert] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!label.trim()) {
      setError("Bitte die Leistung benennen, z. B. „Verfahrensgebühr Klage“.");
      return;
    }
    try {
      const streitwert = parseAmount(wert);
      if (!Number.isFinite(streitwert) || streitwert <= 0) {
        setError("Streitwert muss eine positive Zahl sein.");
        return;
      }
      const r = calculateRvg(streitwert);
      const amount = vv === "auslagenpauschale" ? r.auslagenpauschale : r[vv];
      onChange([
        ...lines,
        {
          id: `rvg-${Date.now()}`,
          description: `${label.trim()} — ${VV_OPTIONS.find((o) => o.value === vv)?.label} bei ${eur(streitwert)} Gegenstandswert (§ 13 RVG, KostBRÄG 2025)`,
          date: new Date().toISOString().slice(0, 10),
          amount,
        },
      ]);
      setLabel("");
      setWert("");
    } catch {
      setError("Die Berechnung ist fehlgeschlagen.");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const ownLines = lines.filter((l) => l.id.startsWith("rvg-"));
  const total = ownLines.reduce((s, l) => s + l.amount, 0);

  return (
    <section
      aria-labelledby="rvg-heading"
      className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <div>
        <h3 id="rvg-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator size={15} aria-hidden /> Anwaltsgebühren nach RVG (Deutschland)
        </h3>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          § 13 RVG-Stufenformel (KostBRÄG 2025) × VV-Gebührensatz. Vorschlag, vor dem Versand
          prüfen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rvg-label" className="text-xs">
            Leistung *
          </Label>
          <Input
            id="rvg-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Verfahrensgebühr Klage, Terminsgebühr 12.10."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rvg-vv" className="text-xs">
            Gebühr (VV RVG)
          </Label>
          <Select value={vv} onValueChange={(v) => setVv(v as VvPosition)}>
            <SelectTrigger id="rvg-vv">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VV_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rvg-wert" className="text-xs">
            Gegenstandswert in Euro *
          </Label>
          <Input
            id="rvg-wert"
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

      <Button type="button" variant="secondary" size="sm" onClick={add}>
        Gebühr hinzufügen
      </Button>

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
            Summe RVG: <span className="ml-1 font-semibold tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
