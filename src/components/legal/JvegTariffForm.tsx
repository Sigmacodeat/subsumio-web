"use client";

import { useState } from "react";
import { Scale, Trash2 } from "lucide-react";
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
  calculateJvegSachverstaendiger,
  calculateJvegZeuge,
  JvegInputError,
} from "@/lib/legal/jveg";
import { JVEG_HONORARGRUPPEN, JVEG_SOURCE } from "@/lib/legal/jveg-tariff-data";
import type { TariffInvoiceLine } from "@/components/legal/RatgTariffForm";

const eur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const num = (v: string) => Number(v.replace(",", "."));

type JvegArt = "zeuge" | "sachverstaendiger";

export function JvegTariffForm({
  lines,
  onChange,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
}) {
  const [art, setArt] = useState<JvegArt>("zeuge");
  const [label, setLabel] = useState("");
  const [stunden, setStunden] = useState("");
  const [brutto, setBrutto] = useState("");
  const [haushalt, setHaushalt] = useState(false);
  const [km, setKm] = useState("");
  const [gruppe, setGruppe] = useState("M1");
  const [pauschale, setPauschale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!label.trim()) {
      setError("Bitte die Position benennen, z. B. „Zeuge Max M., Termin 12.10.“.");
      return;
    }
    try {
      let amount: number;
      let detail: string;
      if (art === "zeuge") {
        const r = calculateJvegZeuge({
          stunden: num(stunden),
          bruttoverdienstProStunde: brutto.trim() ? num(brutto) : undefined,
          haushaltsfuehrung: haushalt,
          fahrtKm: km.trim() ? num(km) : undefined,
        });
        amount = r.gesamt;
        detail = r.hinweise.join("; ");
      } else {
        const r = calculateJvegSachverstaendiger({
          honorargruppe: gruppe,
          stunden: num(stunden),
          auslagenpauschale: pauschale,
        });
        amount = r.gesamtNetto;
        detail = r.hinweise.join("; ");
      }
      onChange([
        ...lines,
        {
          id: `jveg-${Date.now()}`,
          description: `${label.trim()} — ${detail}`,
          date: new Date().toISOString().slice(0, 10),
          amount,
        },
      ]);
      setLabel("");
      setStunden("");
      setBrutto("");
      setKm("");
    } catch (err) {
      setError(err instanceof JvegInputError ? err.message : "Die Berechnung ist fehlgeschlagen.");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const ownLines = lines.filter((l) => l.id.startsWith("jveg-"));
  const total = ownLines.reduce((s, l) => s + l.amount, 0);

  return (
    <section
      aria-labelledby="jveg-heading"
      className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <div>
        <h3 id="jveg-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Scale size={15} aria-hidden /> Zeugen- und Sachverständigenkosten nach JVEG
        </h3>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          §§ 19–23 JVEG (Zeugen) bzw. § 9 i.V.m. Anlage 1 (Sachverständige). Vorschlag, vor dem
          Versand prüfen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="jveg-label" className="text-xs">
            Position *
          </Label>
          <Input
            id="jveg-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Zeuge Max M., Termin 12.10.2026"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jveg-art" className="text-xs">
            Art
          </Label>
          <Select value={art} onValueChange={(v) => setArt(v as JvegArt)}>
            <SelectTrigger id="jveg-art">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zeuge">Zeuge (§§ 19–23 JVEG)</SelectItem>
              <SelectItem value="sachverstaendiger">Sachverständige:r (§ 9 JVEG)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jveg-stunden" className="text-xs">
            {art === "zeuge" ? "Heranziehung in Stunden *" : "Aufwand in Stunden *"}
          </Label>
          <Input
            id="jveg-stunden"
            inputMode="decimal"
            value={stunden}
            onChange={(e) => setStunden(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. 2,5"
          />
        </div>

        {art === "zeuge" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="jveg-brutto" className="text-xs">
                Bruttoverdienst je Stunde (§ 22, max 25 €)
              </Label>
              <Input
                id="jveg-brutto"
                inputMode="decimal"
                value={brutto}
                onChange={(e) => setBrutto(e.target.value)}
                onKeyDown={onEnter}
                placeholder="leer = Zeitversäumnis 4 €/h"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jveg-km" className="text-xs">
                Fahrtkosten Kfz in km (§ 5, 0,42 €/km)
              </Label>
              <Input
                id="jveg-km"
                inputMode="decimal"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                onKeyDown={onEnter}
              />
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input
                id="jveg-haushalt"
                type="checkbox"
                checked={haushalt}
                onChange={(e) => setHaushalt(e.target.checked)}
              />
              Nachteile bei der Haushaltsführung (§ 21 JVEG — 14 €/h, falls kein Verdienstausfall)
            </label>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="jveg-gruppe" className="text-xs">
                Honorargruppe (Anlage 1)
              </Label>
              <Select value={gruppe} onValueChange={setGruppe}>
                <SelectTrigger id="jveg-gruppe">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JVEG_HONORARGRUPPEN.map((g) => (
                    <SelectItem key={g.gruppe} value={g.gruppe}>
                      {g.gruppe} — {eur(g.satz)}/h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                id="jveg-pauschale"
                type="checkbox"
                checked={pauschale}
                onChange={(e) => setPauschale(e.target.checked)}
              />
              Auslagenpauschale (§ 12 — 10 %, max 75 €)
            </label>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          Position hinzufügen
        </Button>
        <span className="text-xs text-[color:var(--ds-text-subtle)]">{JVEG_SOURCE.checkNote}</span>
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
            Summe JVEG: <span className="ml-1 font-semibold tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
