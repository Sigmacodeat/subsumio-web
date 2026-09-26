"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { RatgTariffForm, type TariffInvoiceLine } from "@/components/legal/RatgTariffForm";
import { AhkTariffForm } from "@/components/legal/AhkTariffForm";
import { api } from "@/lib/api";
import { firmToday } from "@/lib/datetime";
import { formatEur } from "@/lib/utils";

export interface TariffCaseOption {
  slug: string;
  title: string;
  /** Streitwert of the matter (prefilled as Bemessungsgrundlage). */
  disputeValue?: number;
}

/**
 * The time entries a set of calculated tariff lines becomes: one Tarifleistung
 * per line (same positions as on the invoice); the time spent is booked on the
 * first line only.
 */
export function tariffEntriesFor(input: {
  caseSlug: string;
  date: string;
  minutes: number;
  system: "ratg" | "ahk";
  basis?: number;
  lines: TariffInvoiceLine[];
}) {
  return input.lines.map((line, i) => ({
    case_slug: input.caseSlug,
    description: line.description,
    minutes: i === 0 ? Math.max(0, Math.round(input.minutes) || 0) : 0,
    date: input.date,
    billable: true,
    activity_type: "drafting",
    tariff: {
      system: input.system,
      amount: Math.round(line.amount * 100) / 100,
      ...(typeof input.basis === "number" ? { basis: input.basis } : {}),
      label: line.description,
    },
  }));
}

/**
 * Tarifleistung (RATG/AHK) recorded right at the work, on the matter — it
 * waits there as an open item until the invoice takes it over.
 */
export function TariffEntryDialog({
  open,
  onOpenChange,
  cases,
  presetCaseSlug,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cases: TariffCaseOption[];
  presetCaseSlug?: string;
  onSaved?: () => void;
}) {
  const { addToast } = useToast();
  const [caseSlug, setCaseSlug] = useState(presetCaseSlug ?? "");
  const [date, setDate] = useState(firmToday());
  const [minutes, setMinutes] = useState("");
  const [system, setSystem] = useState<"ratg" | "ahk">("ratg");
  const [lines, setLines] = useState<TariffInvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCaseSlug(presetCaseSlug ?? "");
    setDate(firmToday());
    setMinutes("");
    setLines([]);
  }, [open, presetCaseSlug]);

  const selected = useMemo(() => cases.find((c) => c.slug === caseSlug), [cases, caseSlug]);
  const total = lines.reduce((s, l) => s + l.amount, 0);

  async function save() {
    if (!caseSlug || lines.length === 0) return;
    setSaving(true);
    const entries = tariffEntriesFor({
      caseSlug,
      date,
      minutes: parseInt(minutes, 10) || 0,
      system,
      basis: selected?.disputeValue,
      lines,
    });
    let saved = 0;
    try {
      for (const entry of entries) {
        await api.time.create(entry);
        saved++;
      }
      addToast({
        type: "success",
        title: saved === 1 ? "Tarifleistung erfasst" : `${saved} Tarifleistungen erfasst`,
        description: "Sie stehen in der Akte offen, bis sie abgerechnet werden.",
      });
      onSaved?.();
      onOpenChange(false);
    } catch {
      addToast({
        type: "error",
        title: "Tarifleistung nicht vollständig gespeichert",
        description:
          saved > 0
            ? `${saved} von ${entries.length} Positionen wurden gespeichert — bitte die Zeiterfassung prüfen.`
            : "Bitte erneut versuchen.",
      });
      if (saved > 0) onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tarifleistung erfassen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Akte</Label>
              <Select value={caseSlug} onValueChange={setCaseSlug}>
                <SelectTrigger aria-label="Akte">
                  <SelectValue placeholder="Akte auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {typeof selected.disputeValue === "number"
                    ? `Streitwert der Akte: ${formatEur(selected.disputeValue)} — als Bemessungsgrundlage vorbelegt.`
                    : "In der Akte ist kein Streitwert hinterlegt."}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tariff-date">Datum</Label>
              <Input
                id="tariff-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tariff-minutes">Zeitaufwand (Min., optional)</Label>
              <Input
                id="tariff-minutes"
                type="number"
                inputMode="numeric"
                min={0}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="z. B. 90"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tarif</Label>
              <Select value={system} onValueChange={(v) => setSystem(v as "ratg" | "ahk")}>
                <SelectTrigger aria-label="Tarif">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ratg">RATG</SelectItem>
                  <SelectItem value="ahk">AHK</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {system === "ratg" ? (
            <RatgTariffForm
              key={`ratg-${caseSlug}`}
              lines={lines}
              onChange={setLines}
              defaultBasis={selected?.disputeValue}
              date={date}
            />
          ) : (
            <AhkTariffForm
              key={`ahk-${caseSlug}`}
              lines={lines}
              onChange={setLines}
              defaultBasis={selected?.disputeValue}
              date={date}
            />
          )}

          {lines.length > 0 && (
            <p className="flex justify-between rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm font-medium">
              <span>
                {lines.length} {lines.length === 1 ? "Position" : "Positionen"} (netto)
              </span>
              <span className="tabular-nums">{formatEur(total)}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => void save()} disabled={saving || !caseSlug || lines.length === 0}>
            {saving ? "Wird gespeichert…" : "In der Akte erfassen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
