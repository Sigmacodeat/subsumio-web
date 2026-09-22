"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
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
  calculateVerzugszinsen,
  VerzugszinsenInputError,
  ZINS_GRUNDLAGE_LABEL,
  type ZinsMethode,
  type ZinsRechtsgrundlage,
} from "@/lib/legal/verzugszinsen";
import { VERZUGSZINSEN_SOURCE } from "@/lib/legal/verzugszinsen-data";

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

/**
 * Gesetzliche Verzugszinsen (§§ 1000/1333 ABGB, § 456 UGB) mit
 * Halbjahres-Segmentierung. Ergebnis wird per `onApply` in das
 * umgebende Forderungsformular übernommen — nie automatisch.
 */
export function VerzugszinsenCalculator({
  principal,
  defaultVon,
  onApply,
}: {
  /** Kapitalforderung aus dem Formular (EUR, darf leer/ungültig sein). */
  principal: string;
  /** Vorbelegung für Verzugsbeginn (ISO), typischerweise die Fälligkeit. */
  defaultVon?: string;
  onApply: (interestAmount: number, interestFrom: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [grundlage, setGrundlage] = useState<ZinsRechtsgrundlage>("ugb_456");
  const [von, setVon] = useState(defaultVon ?? "");
  const [bis, setBis] = useState(new Date().toISOString().slice(0, 10));
  const [methode, setMethode] = useState<ZinsMethode>("act365");
  const [satz, setSatz] = useState("");
  const [pauschale, setPauschale] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function compute() {
    setError(null);
    try {
      return calculateVerzugszinsen({
        kapital: parseAmount(principal),
        von,
        bis,
        grundlage,
        methode,
        satzProzent: grundlage === "vereinbart" ? Number(satz.replace(",", ".")) : undefined,
        betreibungspauschale: pauschale,
      });
    } catch (err) {
      setError(err instanceof VerzugszinsenInputError ? err.message : "Berechnung fehlgeschlagen.");
      return null;
    }
  }

  function apply() {
    const r = compute();
    if (!r) return;
    onApply(r.zinsenCents / 100, von);
    setOpen(false);
  }

  const preview = open && von && bis ? compute() : null;

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="w-fit"
        onClick={() => {
          if (defaultVon && !von) setVon(defaultVon);
          setOpen(true);
        }}
      >
        <Calculator className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Gesetzliche Verzugszinsen berechnen
      </Button>
    );
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[color:var(--ds-border)] p-4 md:col-span-2">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold">
        <Calculator className="h-3.5 w-3.5" aria-hidden /> Verzugszinsen
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="vz-grundlage" className="text-xs">
            Rechtsgrundlage
          </Label>
          <Select value={grundlage} onValueChange={(v) => setGrundlage(v as ZinsRechtsgrundlage)}>
            <SelectTrigger id="vz-grundlage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ZINS_GRUNDLAGE_LABEL) as ZinsRechtsgrundlage[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {ZINS_GRUNDLAGE_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vz-von" className="text-xs">
            Verzugsbeginn *
          </Label>
          <Input id="vz-von" type="date" value={von} onChange={(e) => setVon(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vz-bis" className="text-xs">
            Stichtag
          </Label>
          <Input id="vz-bis" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vz-methode" className="text-xs">
            Zinsmethode
          </Label>
          <Select value={methode} onValueChange={(v) => setMethode(v as ZinsMethode)}>
            <SelectTrigger id="vz-methode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="act365">act/365 (Zivilmethode)</SelectItem>
              <SelectItem value="30/360">30/360 (kaufmännisch)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {grundlage === "vereinbart" && (
          <div className="space-y-1.5">
            <Label htmlFor="vz-satz" className="text-xs">
              Vereinbarter Satz % p.a. *
            </Label>
            <Input
              id="vz-satz"
              inputMode="decimal"
              value={satz}
              onChange={(e) => setSatz(e.target.value)}
              placeholder="z. B. 8,0"
            />
          </div>
        )}
        {grundlage === "ugb_456" && (
          <label className="flex items-center gap-2 self-end pb-1.5 text-xs">
            <input
              type="checkbox"
              checked={pauschale}
              onChange={(e) => setPauschale(e.target.checked)}
            />
            Betreibungspauschale 40 € (§ 458 UGB)
          </label>
        )}
      </div>

      {preview && (
        <div className="rounded-md bg-[color:var(--ds-surface-2)] p-3 text-xs">
          <p className="font-medium">
            Zinsen {eur(preview.zinsenCents / 100)}
            {preview.betreibungspauschaleCents > 0 &&
              ` + Pauschale ${eur(preview.betreibungspauschaleCents / 100)}`}
          </p>
          {preview.segmente.length > 1 && (
            <ul className="mt-1 space-y-0.5 text-[color:var(--ds-text-muted)]">
              {preview.segmente.map((s) => (
                <li key={`${s.von}-${s.bis}`}>
                  {s.von} – {s.bis}: {s.tage} Tage à {s.satzProzent.toLocaleString("de-AT")} % →{" "}
                  {eur(s.zinsenCents / 100)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[color:var(--ds-text-muted)]">
            {preview.basis} · {VERZUGSZINSEN_SOURCE.checkNote}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={apply} disabled={!preview}>
          Übernehmen (
          {preview ? eur((preview.zinsenCents + preview.betreibungspauschaleCents) / 100) : "—"})
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Schließen
        </Button>
        <p role="status" aria-live="polite" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      </div>
    </fieldset>
  );
}
