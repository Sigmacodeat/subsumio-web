"use client";

import { useState } from "react";
import { ScrollText, Trash2 } from "lucide-react";
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
  calculateNtg,
  calculateNtgZeitgebuehr,
  NTG_TARIFART_LABEL,
  NtgInputError,
  type NtgTarifart,
} from "@/lib/legal/ntg";
import { NTG_SOURCE } from "@/lib/legal/ntg-tariff-data";
import type { TariffInvoiceLine } from "@/components/legal/RatgTariffForm";

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

export function NtgTariffForm({
  lines,
  onChange,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<"wert" | "zeit">("wert");
  const [tarifart, setTarifart] = useState<NtgTarifart>("zweiseitig_voll");
  const [grundlage, setGrundlage] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!label.trim()) {
      setError("Bitte die Position benennen, z. B. „Notariatsakt Kaufvertrag“.");
      return;
    }
    try {
      const result =
        mode === "wert"
          ? calculateNtg({ tarifart, grundlage: parseAmount(grundlage) })
          : calculateNtgZeitgebuehr(Number(minutes.replace(",", ".")));
      onChange([
        ...lines,
        {
          id: `ntg-${Date.now()}`,
          description: `${label.trim()} — ${result.basis}`,
          date: new Date().toISOString().slice(0, 10),
          amount: result.totalCents / 100,
        },
      ]);
      setLabel("");
      setGrundlage("");
      setMinutes("");
    } catch (err) {
      setError(err instanceof NtgInputError ? err.message : "Die Berechnung ist fehlgeschlagen.");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const ownLines = lines.filter((l) => l.id.startsWith("ntg-"));
  const total = ownLines.reduce((s, l) => s + l.amount, 0);

  return (
    <section
      aria-labelledby="ntg-heading"
      className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <h3 id="ntg-heading" className="flex items-center gap-2 text-sm font-semibold">
        <ScrollText size={15} aria-hidden /> Notariatskosten (NTG)
      </h3>
      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
        Wertgebühr (§§ 18–20) und Zeitgebühr (§ 26) als Kostenschätzung für Mandanten.{" "}
        {NTG_SOURCE.checkNote}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ntg-label" className="text-xs">
            Position *
          </Label>
          <Input
            id="ntg-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Notariatsakt Kaufvertrag, Beglaubigung"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ntg-mode" className="text-xs">
            Berechnungsart
          </Label>
          <Select value={mode} onValueChange={(v) => setMode(v as "wert" | "zeit")}>
            <SelectTrigger id="ntg-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wert">Wertgebühr (§§ 18–20)</SelectItem>
              <SelectItem value="zeit">Zeitgebühr (§ 26)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode === "wert" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ntg-art" className="text-xs">
                Tarifart
              </Label>
              <Select value={tarifart} onValueChange={(v) => setTarifart(v as NtgTarifart)}>
                <SelectTrigger id="ntg-art">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(NTG_TARIFART_LABEL) as NtgTarifart[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {NTG_TARIFART_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ntg-grundlage" className="text-xs">
                Bemessungsgrundlage in Euro *
              </Label>
              <Input
                id="ntg-grundlage"
                inputMode="decimal"
                value={grundlage}
                onChange={(e) => setGrundlage(e.target.value)}
                onKeyDown={onEnter}
                placeholder="z. B. 450.000,00"
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="ntg-minutes" className="text-xs">
              Zeitaufwand in Minuten *
            </Label>
            <Input
              id="ntg-minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onKeyDown={onEnter}
              placeholder="z. B. 45"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={add}>
          Gebühr berechnen und hinzufügen
        </Button>
        <p role="status" aria-live="polite" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      </div>

      {ownLines.length > 0 && (
        <ul className="divide-y divide-[color:var(--ds-border)] rounded-md border border-[color:var(--ds-border)] text-sm">
          {ownLines.map((l) => (
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
            <span>Summe Notariatskosten</span>
            <span className="tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
