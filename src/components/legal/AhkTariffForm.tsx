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
  AhkInputError,
  calculateAhkStraf,
  calculateAhkStrafRatg,
  calculateAhkZivilverwaltung,
  einstufungAusStrafdrohung,
  type AhkResult,
} from "@/lib/legal/ahk";
import {
  AHK_BEMESSUNGSGRUNDLAGEN,
  AHK_SOURCE,
  AHK_SURCHARGE,
  AHK_STRAF_POSITIONEN,
  AHK_STRAF_VERFAHREN_LABEL,
  type AhkStrafVerfahren,
} from "@/lib/legal/ahk-tariff-data";
import type { RatgTariffItem } from "@/lib/legal/ratg";
import type { TariffInvoiceLine } from "@/components/legal/RatgTariffForm";

const ITEM_OPTIONS: Array<{ value: RatgTariffItem; label: string }> = [
  { value: "TP1", label: "TP 1 – Anzeigen, Mitteilungen, Fristansuchen" },
  { value: "TP2", label: "TP 2 – kurze Schriftsätze, einfache Tagsatzungen" },
  { value: "TP3A", label: "TP 3A – Klage, Klagebeantwortung, Tagsatzungen" },
  { value: "TP3B", label: "TP 3B – Berufung, Rekurs, Berufungsverhandlung" },
  { value: "TP3C", label: "TP 3C – Revision, Revisionsrekurs" },
];

type Bereich = "zivil" | "straf" | "straf_ratg";

const BEREICH_OPTIONS: Array<{ value: Bereich; label: string }> = [
  { value: "zivil", label: "Zivil-/Verwaltungssache ohne Streitwert (§ 5, § 6)" },
  { value: "straf", label: "Straf-/Disziplinarsache, in § 9 genannt" },
  { value: "straf_ratg", label: "Sonstige Strafsache (§ 10, über RATG)" },
];

const VERFAHREN_OPTIONS: Array<{ value: AhkStrafVerfahren; label: string }> = (
  Object.keys(AHK_STRAF_VERFAHREN_LABEL) as AhkStrafVerfahren[]
).map((v) => ({ value: v, label: AHK_STRAF_VERFAHREN_LABEL[v] }));

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "");
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalised);
}

export function AhkTariffForm({
  lines,
  onChange,
}: {
  lines: TariffInvoiceLine[];
  onChange: (lines: TariffInvoiceLine[]) => void;
}) {
  const [bereich, setBereich] = useState<Bereich>("zivil");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Zivil/§10-RATG
  const [item, setItem] = useState<RatgTariffItem>("TP3A");
  const [kind, setKind] = useState<"schriftsatz" | "verhandlung">("schriftsatz");
  const [sachgebiet, setSachgebiet] = useState("");
  const [basis, setBasis] = useState("");
  const [hours, setHours] = useState("1");
  const [factor, setFactor] = useState("1");
  const [represented, setRepresented] = useState("1");
  const [opposing, setOpposing] = useState("1");
  const [withSurcharge, setWithSurcharge] = useState(true);

  // Straf (§ 9)
  const [verfahren, setVerfahren] = useState<AhkStrafVerfahren>("bezirksgericht");
  const [positionKey, setPositionKey] = useState(AHK_STRAF_POSITIONEN.bezirksgericht[0].key);
  const [nichtigkeitUndBerufung, setNichtigkeitUndBerufung] = useState(false);
  const [strafEinheitssatz, setStrafEinheitssatz] = useState(false);
  const [erfolgszuschlag, setErfolgszuschlag] = useState("");
  const [weitereVerteidigte, setWeitereVerteidigte] = useState("");

  // Verwaltungsstrafsachen-Helfer (§ 13): Strafdrohung → Verfahren, nur für "straf_ratg".
  const [strafdrohung, setStrafdrohung] = useState("");
  const [mitHaft, setMitHaft] = useState(false);

  const num = (value: string) => Number(value.replace(",", "."));

  function applySachgebiet(key: string) {
    setSachgebiet(key);
    const entry = AHK_BEMESSUNGSGRUNDLAGEN.find((e) => e.key === key);
    if (entry && entry.amount > 0) setBasis(String(entry.amount));
  }

  function compute(): AhkResult {
    const es = Number(factor) as 0 | 1;
    if (bereich === "zivil") {
      const entry = AHK_BEMESSUNGSGRUNDLAGEN.find((e) => e.key === sachgebiet);
      return calculateAhkZivilverwaltung({
        item,
        kind,
        bemessungsgrundlage: parseAmount(basis),
        hours: kind === "verhandlung" ? num(hours) : undefined,
        einheitssatzFactor: es,
        personen: {
          vertreten: Math.max(1, parseInt(represented, 10) || 1),
          gegenueber: Math.max(1, parseInt(opposing, 10) || 1),
        },
        withSurcharge,
        label: label.trim(),
        sachgebiet: entry?.label,
      });
    }
    if (bereich === "straf_ratg") {
      const einstufung = strafdrohung.trim()
        ? einstufungAusStrafdrohung(parseAmount(strafdrohung), mitHaft)
        : verfahren;
      return calculateAhkStrafRatg({
        item,
        kind,
        einstufung,
        hours: kind === "verhandlung" ? num(hours) : undefined,
        einheitssatzFactor: es,
        withSurcharge,
        label: label.trim(),
      });
    }
    return calculateAhkStraf({
      verfahren,
      positionKey,
      hours: num(hours),
      nichtigkeitUndBerufung,
      einheitssatzFactor: strafEinheitssatz ? 1 : 0,
      erfolgszuschlagProzent: erfolgszuschlag.trim() ? num(erfolgszuschlag) : undefined,
      weitereVerteidigtePersonen: weitereVerteidigte.trim()
        ? Math.max(0, parseInt(weitereVerteidigte, 10) || 0)
        : undefined,
      label: label.trim(),
    });
  }

  function add() {
    setError(null);
    if (!label.trim()) {
      setError(
        "Bitte die Leistung benennen, z. B. „Klage“ oder „Hauptverhandlung vom 12.10.2026“."
      );
      return;
    }
    try {
      const result = compute();
      const date = new Date().toISOString().slice(0, 10);
      const stamp = Date.now();
      onChange([
        ...lines,
        ...result.lines.map((l, i) => ({
          id: `ahk-${stamp}-${i}`,
          description: `${l.label} — ${l.basis}`,
          date,
          amount: l.amount,
        })),
      ]);
      setLabel("");
    } catch (err) {
      setError(err instanceof AhkInputError ? err.message : "Die Berechnung ist fehlgeschlagen.");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const currentPositions = AHK_STRAF_POSITIONEN[verfahren];
  // `lines` is shared with RatgTariffForm (both append to the same invoice
  // position list) — show and total only this form's own entries here,
  // identified by the "ahk-" id prefix `add()` gives them below.
  const ownLines = lines.filter((l) => l.id.startsWith("ahk-"));
  const total = ownLines.reduce((s, l) => s + l.amount, 0);

  return (
    <section
      aria-labelledby="ahk-heading"
      className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <div>
        <h3 id="ahk-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator size={15} aria-hidden /> Leistungen nach AHK
        </h3>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          Allgemeine Honorar-Kriterien der ÖRAK ({AHK_SOURCE.version}) — für Sachen ohne natürlichen
          RATG-Streitwert und für Straf-/Disziplinarsachen. Kein Gesetz, sondern eine
          berufsrechtliche Richtlinie zur Angemessenheit; Vorschlag, vor dem Versand prüfen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ahk-label" className="text-xs">
            Leistung *
          </Label>
          <Input
            id="ahk-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Klage in Adoptionssache, Hauptverhandlung vom 12.10.2026"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ahk-bereich" className="text-xs">
            Bereich
          </Label>
          <Select value={bereich} onValueChange={(v) => setBereich(v as Bereich)}>
            <SelectTrigger id="ahk-bereich">
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

      {(bereich === "zivil" || bereich === "straf_ratg") && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bereich === "zivil" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ahk-sachgebiet" className="text-xs">
                Sachgebiet (§ 5 AHK, befüllt die Bemessungsgrundlage)
              </Label>
              <Select value={sachgebiet} onValueChange={applySachgebiet}>
                <SelectTrigger id="ahk-sachgebiet">
                  <SelectValue placeholder="Sachgebiet wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {AHK_BEMESSUNGSGRUNDLAGEN.map((e) => (
                    <SelectItem key={e.key} value={e.key}>
                      {e.label} ({e.amount > 0 ? eur(e.amount) : "kein Ersatzwert"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {bereich === "straf_ratg" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ahk-verfahren-fallback" className="text-xs">
                  Verfahrensart (§ 10 Abs 1)
                </Label>
                <Select
                  value={verfahren}
                  onValueChange={(v) => setVerfahren(v as AhkStrafVerfahren)}
                >
                  <SelectTrigger id="ahk-verfahren-fallback">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERFAHREN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ahk-strafdrohung" className="text-xs">
                  Oder: Strafdrohung in Euro (§ 13, ersetzt die Auswahl links)
                </Label>
                <Input
                  id="ahk-strafdrohung"
                  inputMode="decimal"
                  value={strafdrohung}
                  onChange={(e) => setStrafdrohung(e.target.value)}
                  onKeyDown={onEnter}
                  placeholder="z. B. 1500"
                />
              </div>
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input
                  type="checkbox"
                  checked={mitHaft}
                  onChange={(e) => setMitHaft(e.target.checked)}
                />
                Übertretung auch mit Haft bedroht (§ 13 Abs 1 Z 4)
              </label>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ahk-item" className="text-xs">
              Tarifpost (§ 6 Abs 1 AHK iVm RATG)
            </Label>
            <Select value={item} onValueChange={(v) => setItem(v as RatgTariffItem)}>
              <SelectTrigger id="ahk-item">
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
            <Label htmlFor="ahk-kind" className="text-xs">
              Art
            </Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id="ahk-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="schriftsatz">Schriftsatz</SelectItem>
                <SelectItem value="verhandlung">Verhandlung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {bereich === "zivil" && (
            <div className="space-y-1.5">
              <Label htmlFor="ahk-basis" className="text-xs">
                Bemessungsgrundlage in Euro *
              </Label>
              <Input
                id="ahk-basis"
                inputMode="decimal"
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                onKeyDown={onEnter}
                placeholder="z. B. 21.200,00"
              />
            </div>
          )}
          {kind === "verhandlung" && (
            <div className="space-y-1.5">
              <Label htmlFor="ahk-hours" className="text-xs">
                Dauer in Stunden
              </Label>
              <Input
                id="ahk-hours"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                onKeyDown={onEnter}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ahk-factor" className="text-xs">
              Einheitssatz
            </Label>
            <Select value={factor} onValueChange={setFactor}>
              <SelectTrigger id="ahk-factor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Einfach (60/50 %)</SelectItem>
                <SelectItem value="0">Keiner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {bereich === "zivil" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ahk-represented" className="text-xs">
                  Vertretene Personen
                </Label>
                <Input
                  id="ahk-represented"
                  type="number"
                  min={1}
                  value={represented}
                  onChange={(e) => setRepresented(e.target.value)}
                  onKeyDown={onEnter}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ahk-opposing" className="text-xs">
                  Gegenüberstehende Personen
                </Label>
                <Input
                  id="ahk-opposing"
                  type="number"
                  min={1}
                  value={opposing}
                  onChange={(e) => setOpposing(e.target.value)}
                  onKeyDown={onEnter}
                />
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input
              type="checkbox"
              checked={withSurcharge}
              onChange={(e) => setWithSurcharge(e.target.checked)}
            />
            VPI-Zuschlag {AHK_SURCHARGE.percent} % mitrechnen (§ 6 Abs 3a, Stand{" "}
            {AHK_SURCHARGE.announcedAt})
          </label>
        </div>
      )}

      {bereich === "straf" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ahk-verfahren" className="text-xs">
              Verfahrensart
            </Label>
            <Select
              value={verfahren}
              onValueChange={(v) => {
                const vv = v as AhkStrafVerfahren;
                setVerfahren(vv);
                setPositionKey(AHK_STRAF_POSITIONEN[vv][0].key);
              }}
            >
              <SelectTrigger id="ahk-verfahren">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERFAHREN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ahk-position" className="text-xs">
              Position (§ 9 Abs 1)
            </Label>
            <Select value={positionKey} onValueChange={setPositionKey}>
              <SelectTrigger id="ahk-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentPositions.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {currentPositions.find((p) => p.key === positionKey)?.ersteHalbeStunde !== undefined && (
            <div className="space-y-1.5">
              <Label htmlFor="ahk-straf-hours" className="text-xs">
                Dauer in Stunden (je begonnene halbe Stunde)
              </Label>
              <Input
                id="ahk-straf-hours"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                onKeyDown={onEnter}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ahk-erfolgszuschlag" className="text-xs">
              Erfolgszuschlag in % (§ 12, bis 50)
            </Label>
            <Input
              id="ahk-erfolgszuschlag"
              inputMode="decimal"
              value={erfolgszuschlag}
              onChange={(e) => setErfolgszuschlag(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ahk-weitere-verteidigte" className="text-xs">
              Weitere verteidigte Personen (§ 10 Abs 3, +30 % je Person)
            </Label>
            <Input
              id="ahk-weitere-verteidigte"
              type="number"
              min={0}
              value={weitereVerteidigte}
              onChange={(e) => setWeitereVerteidigte(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={strafEinheitssatz}
              onChange={(e) => setStrafEinheitssatz(e.target.checked)}
            />
            Einheitssatz mitrechnen (§ 11, 60 %)
          </label>
          {(verfahren === "schoeffengericht" || verfahren === "geschworenengericht") &&
            (positionKey === "berufungsverhandlung" ||
              positionKey === "gerichtstag_nichtigkeit") && (
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input
                  type="checkbox"
                  checked={nichtigkeitUndBerufung}
                  onChange={(e) => setNichtigkeitUndBerufung(e.target.checked)}
                />
                Zugleich mit Nichtigkeitsbeschwerde auch Berufung erhoben (§ 9 Abs 2, +20 %)
              </label>
            )}
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
            <span>Summe AHK-Leistungen (netto)</span>
            <span className="tabular-nums">{eur(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
