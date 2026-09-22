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
import {
  calculateGgg,
  GGG_ERMAESSIGUNG_LABEL,
  GggInputError,
  type GggErmaessigung,
  type GggTarifpost,
} from "@/lib/legal/ggg";
import { GGG_SOURCE } from "@/lib/legal/ggg-tariff-data";
import type { TariffInvoiceLine } from "@/components/legal/RatgTariffForm";

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

export function GggTariffForm({
  lines,
  onChange,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [tarifpost, setTarifpost] = useState<GggTarifpost>("TP1");
  const [wert, setWert] = useState("");
  const [ermaessigung, setErmaessigung] = useState<GggErmaessigung>("keine");
  const [kfz, setKfz] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ermaessigungen = (Object.keys(GGG_ERMAESSIGUNG_LABEL) as GggErmaessigung[]).filter(
    (e) => tarifpost === "TP1" || (e !== "viertel" && e !== "halbe_rueckzug")
  );

  function add() {
    setError(null);
    if (!label.trim()) {
      setError("Bitte die Position benennen, z. B. „Klage beim HG Wien“.");
      return;
    }
    try {
      const result = calculateGgg({
        tarifpost,
        wert: parseAmount(wert),
        ermaessigung,
        kfzRechtsschutz: tarifpost === "TP1" && kfz,
      });
      onChange([
        ...lines,
        {
          id: `ggg-${Date.now()}`,
          description: `${label.trim()} — ${result.basis}`,
          date: new Date().toISOString().slice(0, 10),
          amount: result.totalCents / 100,
        },
      ]);
      setLabel("");
      setWert("");
    } catch (err) {
      setError(err instanceof GggInputError ? err.message : "Die Berechnung ist fehlgeschlagen.");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const ownLines = lines.filter((l) => l.id.startsWith("ggg-"));
  const total = ownLines.reduce((s, l) => s + l.amount, 0);

  return (
    <section
      aria-labelledby="ggg-heading"
      className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <h3 id="ggg-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Landmark size={15} aria-hidden /> Gerichtsgebühren (GGG)
      </h3>
      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
        Pauschalgebühren TP 1 (erste Instanz) und TP 2 (Berufung) als Barauslage.{" "}
        {GGG_SOURCE.checkNote}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ggg-label" className="text-xs">
            Position *
          </Label>
          <Input
            id="ggg-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Klage HG Wien, Berufung an OLG Wien"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ggg-tp" className="text-xs">
            Tarifpost
          </Label>
          <Select
            value={tarifpost}
            onValueChange={(v) => {
              setTarifpost(v as GggTarifpost);
              if (
                v === "TP2" &&
                (ermaessigung === "viertel" || ermaessigung === "halbe_rueckzug")
              ) {
                setErmaessigung("keine");
              }
            }}
          >
            <SelectTrigger id="ggg-tp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TP1">TP 1 — Verfahren erster Instanz</SelectItem>
              <SelectItem value="TP2">TP 2 — Rechtsmittel zweite Instanz</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ggg-wert" className="text-xs">
            {tarifpost === "TP1" ? "Streitwert" : "Berufungsinteresse"} in Euro *
          </Label>
          <Input
            id="ggg-wert"
            inputMode="decimal"
            value={wert}
            onChange={(e) => setWert(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. 25.000,00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ggg-erm" className="text-xs">
            Ermäßigung
          </Label>
          <Select value={ermaessigung} onValueChange={(v) => setErmaessigung(v as GggErmaessigung)}>
            <SelectTrigger id="ggg-erm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ermaessigungen.map((e) => (
                <SelectItem key={e} value={e}>
                  {GGG_ERMAESSIGUNG_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {tarifpost === "TP1" && (
          <label className="flex items-center gap-2 self-end pb-2 text-xs">
            <input
              type="checkbox"
              checked={kfz}
              onChange={(e) => setKfz(e.target.checked)}
              aria-label="Kraftfahrzeug-Rechtsschutzziel"
            />
            Kfz-Rechtsschutzziel (§ 615 ZPO) — Fixgebühr
          </label>
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
            <span>Summe Gerichtsgebühren</span>
            <span className="tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
