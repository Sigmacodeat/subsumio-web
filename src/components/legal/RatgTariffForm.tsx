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
import {
  RatgInputError,
  calculateRatgService,
  type RatgServiceKind,
  type RatgTariffItem,
} from "@/lib/legal/ratg";
import { RATG_TARIFF_SOURCE } from "@/lib/legal/ratg-tariff-data";

/** One invoice line produced by the calculator. Flat item: no hours, no rate. */
export interface TariffInvoiceLine {
  id: string;
  description: string;
  date: string;
  amount: number;
}

const ITEM_OPTIONS: Array<{ value: RatgTariffItem; label: string }> = [
  { value: "TP1", label: "TP 1 – Anzeigen, Mitteilungen, Fristansuchen" },
  { value: "TP2", label: "TP 2 – kurze Schriftsätze, einfache Tagsatzungen" },
  { value: "TP3A", label: "TP 3A – Klage, Klagebeantwortung, Tagsatzungen" },
  { value: "TP3B", label: "TP 3B – Berufung, Rekurs, Berufungsverhandlung" },
  { value: "TP3C", label: "TP 3C – Revision, Revisionsrekurs" },
];

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  // Accept "12.000,50", "12000,50" and "12000.50".
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

export function RatgTariffForm({
  lines,
  onChange,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
}) {
  const [item, setItem] = useState<RatgTariffItem>("TP3A");
  const [kind, setKind] = useState<RatgServiceKind>("schriftsatz");
  const [label, setLabel] = useState("");
  const [basis, setBasis] = useState("");
  const [hours, setHours] = useState("1");
  const [factor, setFactor] = useState("1");
  const [erv, setErv] = useState<"none" | "einleitend" | "weiterer">("weiterer");
  const [represented, setRepresented] = useState("1");
  const [opposing, setOpposing] = useState("1");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    const bg = parseAmount(basis);
    if (!label.trim()) {
      setError("Bitte die Leistung benennen, z. B. „Klage“ oder „Tagsatzung vom 12.10.2026“.");
      return;
    }
    try {
      const result = calculateRatgService({
        item,
        kind,
        bemessungsgrundlage: bg,
        hours: kind === "verhandlung" ? Number(hours.replace(",", ".")) : undefined,
        einheitssatzFactor: Number(factor) as 0 | 1 | 2 | 3 | 4,
        erv: kind === "schriftsatz" && erv !== "none" ? erv : null,
        personen: {
          vertreten: Math.max(1, parseInt(represented, 10) || 1),
          gegenueber: Math.max(1, parseInt(opposing, 10) || 1),
        },
        label: label.trim(),
      });
      const date = new Date().toISOString().slice(0, 10);
      const stamp = Date.now();
      onChange([
        ...lines,
        ...result.lines.map((l, i) => ({
          id: `ratg-${stamp}-${i}`,
          description: `${l.label} — ${l.basis}`,
          date,
          amount: l.amount,
        })),
      ]);
      setLabel("");
    } catch (err) {
      setError(err instanceof RatgInputError ? err.message : "Die Berechnung ist fehlgeschlagen.");
    }
  }

  // Enter in a field must add the position, not submit the surrounding invoice form.
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const total = lines.reduce((s, l) => s + l.amount, 0);

  return (
    <section
      aria-labelledby="ratg-heading"
      className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="ratg-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Calculator size={15} aria-hidden /> Leistungen nach RATG
          </h3>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            TP 1 bis 3 mit Einheitssatz, ERV- und Streitgenossenzuschlag. Beträge nach{" "}
            {RATG_TARIFF_SOURCE.valorisation}. Vorschlag, vor dem Versand prüfen.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ratg-label" className="text-xs">
            Leistung *
          </Label>
          <Input
            id="ratg-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Klage, Klagebeantwortung, Tagsatzung vom 12.10.2026"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ratg-item" className="text-xs">
            Tarifpost
          </Label>
          <Select value={item} onValueChange={(v) => setItem(v as RatgTariffItem)}>
            <SelectTrigger id="ratg-item">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ratg-kind" className="text-xs">
            Art
          </Label>
          <Select value={kind} onValueChange={(v) => setKind(v as RatgServiceKind)}>
            <SelectTrigger id="ratg-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="schriftsatz">Schriftsatz</SelectItem>
              <SelectItem value="verhandlung" disabled={item === "TP1"}>
                Verhandlung / Tagsatzung
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ratg-basis" className="text-xs">
            Bemessungsgrundlage in Euro *
          </Label>
          <Input
            id="ratg-basis"
            inputMode="decimal"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. 12.000,00"
          />
        </div>
        {kind === "verhandlung" ? (
          <div className="space-y-1.5">
            <Label htmlFor="ratg-hours" className="text-xs">
              Dauer in Stunden
            </Label>
            <Input
              id="ratg-hours"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="ratg-erv" className="text-xs">
              Elektronischer Rechtsverkehr (§ 23a)
            </Label>
            <Select value={erv} onValueChange={(v) => setErv(v as typeof erv)}>
              <SelectTrigger id="ratg-erv">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="einleitend">Verfahrenseinleitend</SelectItem>
                <SelectItem value="weiterer">Weiterer Schriftsatz</SelectItem>
                <SelectItem value="none">Nicht im ERV</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ratg-factor" className="text-xs">
            Einheitssatz (§ 23)
          </Label>
          <Select value={factor} onValueChange={setFactor}>
            <SelectTrigger id="ratg-factor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Einfach</SelectItem>
              <SelectItem value="2">Doppelt</SelectItem>
              <SelectItem value="3">Dreifach</SelectItem>
              <SelectItem value="4">Vierfach</SelectItem>
              <SelectItem value="0">Keiner, Nebenleistungen einzeln</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ratg-represented" className="text-xs">
              Vertretene Personen
            </Label>
            <Input
              id="ratg-represented"
              type="number"
              min={1}
              value={represented}
              onChange={(e) => setRepresented(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ratg-opposing" className="text-xs">
              Gegenüber
            </Label>
            <Input
              id="ratg-opposing"
              type="number"
              min={1}
              value={opposing}
              onChange={(e) => setOpposing(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={add}>
          Position berechnen und hinzufügen
        </Button>
        <p role="status" aria-live="polite" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      </div>

      {lines.length > 0 && (
        <ul className="divide-y divide-[color:var(--ds-border)] rounded-md border border-[color:var(--ds-border)] text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0 break-words text-[color:var(--ds-text)]">
                {l.description}
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                {eur(l.amount)}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Position entfernen: ${l.description}`}
                  onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              </span>
            </li>
          ))}
          <li className="flex justify-between px-3 py-2 font-medium">
            <span>Summe Tarifleistungen (netto)</span>
            <span className="tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
