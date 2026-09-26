"use client";

import { useEffect, useState } from "react";
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
  RATG_TP4_LEISTUNG,
  RATG_TP4_VERFAHREN,
  RatgInputError,
  calculateRatgNebenleistung,
  calculateRatgService,
  calculateRatgTp4,
  calculateRatgTp7,
  calculateRatgTp9,
  type RatgNebenleistung,
  type RatgResult,
  type RatgServiceKind,
  type RatgTariffItem,
  type RatgTp4Leistung,
  type RatgTp4Verfahren,
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

type Bereich = "zivil" | "straf" | "neben" | "tp7" | "tp9";

const BEREICH_OPTIONS: Array<{ value: Bereich; label: string }> = [
  { value: "zivil", label: "Zivilverfahren (TP 1 bis 3)" },
  { value: "straf", label: "Privatanklage, Mediengesetz, Privatbeteiligte (TP 4)" },
  { value: "neben", label: "Schreiben, Briefe, Besprechungen (TP 5, 6, 8)" },
  { value: "tp7", label: "Geschäfte außerhalb der Kanzlei (TP 7)" },
  { value: "tp9", label: "Reise: Zeitversäumnis, Wegentschädigung (TP 9)" },
];

const NEBEN_OPTIONS: Array<{ value: RatgNebenleistung; label: string }> = [
  { value: "besprechung", label: "Besprechung (TP 8)" },
  { value: "besprechung_kurz", label: "Kurze Besprechung unter 10 Minuten (TP 8 Abs 2)" },
  { value: "brief", label: "Brief (TP 6)" },
  { value: "schreiben", label: "Einfaches Schreiben (TP 5)" },
];

const TP4_WITH_HEARING: RatgTp4Leistung[] = ["hauptverhandlung", "verhandlung_zweite_instanz"];

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  // Accept "12.000,50", "12000,50" and "12000.50".
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

export type RatgBereich = Bereich;

/** Streitwert of the matter as the basis field reads it ("12000,50"). */
export function basisInputFromValue(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toFixed(2).replace(".", ",").replace(/,00$/, "")
    : "";
}

export function RatgTariffForm({
  lines,
  onChange,
  initialBereich = "zivil",
  defaultBasis,
  date,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
  initialBereich?: Bereich;
  /** Streitwert of the matter — prefilled as Bemessungsgrundlage. */
  defaultBasis?: number;
  /** Service date of the positions (default: today). */
  date?: string;
}) {
  const [bereich, setBereich] = useState<Bereich>(initialBereich);
  const [tp4Verfahren, setTp4Verfahren] = useState<RatgTp4Verfahren>("privatanklage_sonstige");
  const [tp4Leistung, setTp4Leistung] = useState<RatgTp4Leistung>("hauptverhandlung");
  const [neben, setNeben] = useState<RatgNebenleistung>("besprechung");
  const [anzahl, setAnzahl] = useState("1");
  const [information, setInformation] = useState(false);
  const [durch, setDurch] = useState<"anwalt" | "kanzleikraft">("anwalt");
  const [zeitHours, setZeitHours] = useState("");
  const [wegHours, setWegHours] = useState("");
  const [item, setItem] = useState<RatgTariffItem>("TP3A");
  const [kind, setKind] = useState<RatgServiceKind>("schriftsatz");
  const [label, setLabel] = useState("");
  const [basis, setBasis] = useState(() => basisInputFromValue(defaultBasis));
  // A matter picked later (or its Streitwert) fills an empty basis field.
  useEffect(() => {
    const prefill = basisInputFromValue(defaultBasis);
    if (prefill) setBasis((cur) => (cur.trim() ? cur : prefill));
  }, [defaultBasis]);
  const [hours, setHours] = useState("1");
  const [factor, setFactor] = useState("1");
  const [erv, setErv] = useState<"none" | "einleitend" | "weiterer">("weiterer");
  const [represented, setRepresented] = useState("1");
  const [opposing, setOpposing] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const num = (value: string) => Number(value.replace(",", "."));

  function compute(): RatgResult {
    const bg = parseAmount(basis);
    const es = Number(factor) as 0 | 1 | 2 | 3 | 4;
    const ervValue = erv !== "none" ? erv : null;
    switch (bereich) {
      case "zivil":
        return calculateRatgService({
          item,
          kind,
          bemessungsgrundlage: bg,
          hours: kind === "verhandlung" ? num(hours) : undefined,
          einheitssatzFactor: es,
          erv: kind === "schriftsatz" ? ervValue : null,
          personen: {
            vertreten: Math.max(1, parseInt(represented, 10) || 1),
            gegenueber: Math.max(1, parseInt(opposing, 10) || 1),
          },
          label: label.trim(),
        });
      case "straf": {
        const hearing = TP4_WITH_HEARING.includes(tp4Leistung);
        return calculateRatgTp4({
          verfahren: tp4Verfahren,
          leistung: tp4Leistung,
          hours: hearing ? num(hours) : undefined,
          einheitssatzFactor: es,
          erv: hearing ? null : ervValue,
          label: label.trim(),
        });
      }
      case "neben":
        return calculateRatgNebenleistung({
          art: neben,
          bemessungsgrundlage: bg,
          anzahl: neben === "schreiben" || neben === "brief" ? num(anzahl) : undefined,
          hours: neben === "besprechung" ? num(hours) : undefined,
          information: (neben === "schreiben" || neben === "brief") && information,
          label: label.trim(),
        });
      case "tp7":
        return calculateRatgTp7({
          bemessungsgrundlage: bg,
          hours: num(hours),
          durch,
          einheitssatzFactor: es,
          label: label.trim(),
        });
      case "tp9":
        return calculateRatgTp9({
          zeitversaeumnisHours: zeitHours.trim() ? num(zeitHours) : undefined,
          wegentschaedigungHours: wegHours.trim() ? num(wegHours) : undefined,
          label: label.trim(),
        });
    }
  }

  function add() {
    setError(null);
    if (!label.trim()) {
      setError("Bitte die Leistung benennen, z. B. „Klage“ oder „Tagsatzung vom 12.10.2026“.");
      return;
    }
    try {
      const result = compute();
      const lineDate = date || new Date().toISOString().slice(0, 10);
      const stamp = Date.now();
      onChange([
        ...lines,
        ...result.lines.map((l, i) => ({
          id: `ratg-${stamp}-${i}`,
          description: `${l.label} — ${l.basis}`,
          date: lineDate,
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

  // `lines` is shared with AhkTariffForm (both append to the same invoice
  // position list, InvoiceQuickCreateDialog.tsx) — show and total only
  // this form's own entries, identified by the "ratg-" id prefix `add()`
  // gives them below.
  const ownLines = lines.filter((l) => l.id.startsWith("ratg-"));
  const total = ownLines.reduce((s, l) => s + l.amount, 0);

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
            TP 1 bis 9 mit Einheitssatz, ERV- und Streitgenossenzuschlag. Beträge nach{" "}
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ratg-bereich" className="text-xs">
            Bereich
          </Label>
          <Select value={bereich} onValueChange={(v) => setBereich(v as Bereich)}>
            <SelectTrigger id="ratg-bereich">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BEREICH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {bereich === "zivil" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      )}

      {bereich === "straf" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ratg-tp4-verfahren" className="text-xs">
              Verfahren
            </Label>
            <Select
              value={tp4Verfahren}
              onValueChange={(v) => setTp4Verfahren(v as RatgTp4Verfahren)}
            >
              <SelectTrigger id="ratg-tp4-verfahren">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RATG_TP4_VERFAHREN).map(([value, v]) => (
                  <SelectItem key={value} value={value}>
                    {v.label} (BG {eur(v.bemessungsgrundlage)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ratg-tp4-leistung" className="text-xs">
              Leistung nach TP 4
            </Label>
            <Select value={tp4Leistung} onValueChange={(v) => setTp4Leistung(v as RatgTp4Leistung)}>
              <SelectTrigger id="ratg-tp4-leistung">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RATG_TP4_LEISTUNG).map(([value, v]) => (
                  <SelectItem key={value} value={value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {TP4_WITH_HEARING.includes(tp4Leistung) ? (
            <HoursField value={hours} onChange={setHours} onEnter={onEnter} />
          ) : (
            <ErvField value={erv} onChange={setErv} />
          )}
          <EinheitssatzField value={factor} onChange={setFactor} />
        </div>
      )}

      {bereich === "neben" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <p className="text-xs text-[color:var(--ds-text-muted)] sm:col-span-2">
            Diese Leistungen deckt der Einheitssatz ab. Einzeln verrechnen Sie sie gegenüber Ihrer
            Partei statt des Einheitssatzes (§ 23 Abs 2), bei aufwendigen Vergleichsgesprächen (§ 23
            Abs 4) oder ohne Gerichtsverfahren.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ratg-neben" className="text-xs">
              Art
            </Label>
            <Select value={neben} onValueChange={(v) => setNeben(v as RatgNebenleistung)}>
              <SelectTrigger id="ratg-neben">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEBEN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <BasisField value={basis} onChange={setBasis} onEnter={onEnter} />
          {neben === "besprechung" && (
            <HoursField value={hours} onChange={setHours} onEnter={onEnter} />
          )}
          {(neben === "schreiben" || neben === "brief") && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ratg-anzahl" className="text-xs">
                  Anzahl
                </Label>
                <Input
                  id="ratg-anzahl"
                  type="number"
                  min={1}
                  value={anzahl}
                  onChange={(e) => setAnzahl(e.target.value)}
                  onKeyDown={onEnter}
                />
              </div>
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input
                  id="ratg-information"
                  type="checkbox"
                  checked={information}
                  onChange={(e) => setInformation(e.target.checked)}
                />
                Mit Information aus den Akten oder mit der Partei (zuzüglich die Hälfte)
              </label>
            </>
          )}
        </div>
      )}

      {bereich === "tp7" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BasisField value={basis} onChange={setBasis} onEnter={onEnter} />
          <HoursField value={hours} onChange={setHours} onEnter={onEnter} />
          <div className="space-y-1.5">
            <Label htmlFor="ratg-durch" className="text-xs">
              Erledigt durch
            </Label>
            <Select value={durch} onValueChange={(v) => setDurch(v as typeof durch)}>
              <SelectTrigger id="ratg-durch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anwalt">Rechtsanwalt oder Anwärter (erforderlich)</SelectItem>
                <SelectItem value="kanzleikraft">Kanzleikraft</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <EinheitssatzField value={factor} onChange={setFactor} />
        </div>
      )}

      {bereich === "tp9" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ratg-zeit" className="text-xs">
              Zeitversäumnis in Stunden (TP 9 Z 4)
            </Label>
            <Input
              id="ratg-zeit"
              inputMode="decimal"
              value={zeitHours}
              onChange={(e) => setZeitHours(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ratg-weg" className="text-xs">
              Wegzeit ohne Verkehrsmittel in Stunden (Z 1 lit c)
            </Label>
            <Input
              id="ratg-weg"
              inputMode="decimal"
              value={wegHours}
              onChange={(e) => setWegHours(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
          <p className="text-xs text-[color:var(--ds-text-muted)] sm:col-span-2">
            Fahrkarten, Kilometergeld, Verpflegung und Übernachtung erfassen Sie als Barauslage in
            der Akte; sie erscheinen dann in der Honorarnote.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={add}>
          Position berechnen und hinzufügen
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
            <span>Summe Tarifleistungen (netto)</span>
            <span className="tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}

function HoursField({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="ratg-hours-extra" className="text-xs">
        Dauer in Stunden
      </Label>
      <Input
        id="ratg-hours-extra"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onEnter}
      />
    </div>
  );
}

function BasisField({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="ratg-basis-extra" className="text-xs">
        Bemessungsgrundlage in Euro *
      </Label>
      <Input
        id="ratg-basis-extra"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onEnter}
        placeholder="z. B. 12.000,00"
      />
    </div>
  );
}

function ErvField({
  value,
  onChange,
}: {
  value: "none" | "einleitend" | "weiterer";
  onChange: (v: "none" | "einleitend" | "weiterer") => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="ratg-erv-extra" className="text-xs">
        Elektronischer Rechtsverkehr (§ 23a)
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as typeof value)}>
        <SelectTrigger id="ratg-erv-extra">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="einleitend">Verfahrenseinleitend</SelectItem>
          <SelectItem value="weiterer">Weiterer Schriftsatz</SelectItem>
          <SelectItem value="none">Nicht im ERV</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function EinheitssatzField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="ratg-factor-extra" className="text-xs">
        Einheitssatz (§ 23)
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="ratg-factor-extra">
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
  );
}
