"use client";

import { useState, useEffect } from "react";
import {
  Calculator,
  Euro,
  Info,
  AlertTriangle,
  CheckCircle2,
  Save,
  Loader2,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { api } from "@/lib/api";
import { caseFrontmatter, type ExpenseEntry } from "@/lib/legal-types";
import type { BrainPage } from "@/lib/types";

// RVG § 13 Abs. 1 i.d.F. KostBRÄG 2025 (Deutschland, gültig ab 01.06.2025).
// Die einfache (1,0) Gebühr wird per Stufenformel berechnet, nicht aus einer
// hartkodierten Tabelle: Grundgebühr 51,50 € bis 500 € Gegenstandswert,
// danach feste Schritte je angefangenem Stufenbetrag.
const RVG_STUFEN: Array<{ bis: number; schritt: number; je: number }> = [
  { bis: 2_000, schritt: 41.5, je: 500 },
  { bis: 10_000, schritt: 59.5, je: 1_000 },
  { bis: 25_000, schritt: 55, je: 3_000 },
  { bis: 50_000, schritt: 86, je: 5_000 },
  { bis: 200_000, schritt: 99.5, je: 15_000 },
  { bis: 500_000, schritt: 140, je: 30_000 },
  { bis: Infinity, schritt: 175, je: 50_000 },
];

function rvgGebuehr(streitwert: number): number {
  let gebuehr = 51.5;
  let grenze = 500;
  for (const stufe of RVG_STUFEN) {
    while (grenze < streitwert && grenze < stufe.bis) {
      gebuehr += stufe.schritt;
      grenze += stufe.je;
    }
    if (grenze >= streitwert) break;
  }
  return gebuehr;
}

// RATG (Österreich) — NÄHERUNGSWERTE auf Basis TP3A. Das österreichische
// Tarifrecht (Bemessungsgrundlage, Einheitssatz, ERV-Zuschläge) ist deutlich
// komplexer; diese Werte dienen nur der groben Orientierung und sind im UI
// entsprechend gekennzeichnet.
function ratgGebuehr(streitwert: number): number {
  if (streitwert <= 364) return 36.4;
  if (streitwert <= 728) return 72.8;
  if (streitwert <= 1456) return 109.2;
  if (streitwert <= 3639) return 181.95;
  if (streitwert <= 7278) return 254.73;
  if (streitwert <= 14557) return 363.9;
  if (streitwert <= 36392) return 509.49;
  if (streitwert <= 72784) return 654.99;
  if (streitwert <= 145568) return 873.41;
  if (streitwert <= 363919) return 1091.76;
  return Math.round(streitwert * 0.003);
}

interface CalculationResult {
  jurisdiction: "de" | "at";
  streitwert: number;
  verfahrensgebuehr: number;
  terminGebuehr: number;
  einigungsgebuehr: number;
  zuschlag: number;
  auslagen: number;
  mwst: number;
  total: number;
}

export default function CostCalculatorPage() {
  const [jurisdiction, setJurisdiction] = useState<"de" | "at">("de");
  const [streitwert, setStreitwert] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    api.brain
      .listPages({ type: "legal_case", limit: 200 })
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  async function saveToCase() {
    if (!result || !selectedCaseSlug) return;
    setSaving(true);
    setSaveNotice(null);
    try {
      const page = await api.brain.getPage(selectedCaseSlug);
      const fm = caseFrontmatter(page);
      const entry: ExpenseEntry = {
        id: `cost-calc-${Date.now()}`,
        description: `Kostenschätzung (${result.jurisdiction === "de" ? "RVG" : "RATG"}) — Streitwert ${result.streitwert.toLocaleString("de-DE")} €`,
        date: new Date().toISOString(),
        amount: result.total,
        billable: false,
      };
      const updatedExpenses = [...(fm.expenses ?? []), entry];
      await api.brain.updatePage({
        slug: selectedCaseSlug,
        frontmatter: {
          ...fm,
          expenses: updatedExpenses,
          estimated_value: {
            min: result.total,
            max: result.total,
            currency: "EUR",
          },
        },
      });
      setSaveNotice("Kostenschätzung wurde in der Akte gespeichert.");
    } catch (e) {
      setSaveNotice(e instanceof Error ? `Fehler: ${e.message}` : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  function calculate() {
    const sw = parseFloat(streitwert.replace(/[^0-9.,]/g, "").replace(",", "."));
    if (isNaN(sw) || sw <= 0) return;

    // DE: einfache Gebühr nach § 13 RVG, dann die Standard-Gebührensätze des
    // gerichtlichen Verfahrens erster Instanz: Verfahrensgebühr 1,3 (VV 3100),
    // Terminsgebühr 1,2 (VV 3104), Einigungsgebühr 1,0 (VV 1003).
    // Auslagenpauschale VV 7002: 20 % der Gebühren, höchstens 20 €.
    const einfach = jurisdiction === "de" ? rvgGebuehr(sw) : ratgGebuehr(sw);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const vg = jurisdiction === "de" ? round2(einfach * 1.3) : round2(einfach);
    const tg = jurisdiction === "de" ? round2(einfach * 1.2) : round2(einfach);
    const eg = jurisdiction === "de" ? round2(einfach * 1.0) : round2(einfach * 1.2);
    const auslagen = jurisdiction === "de" ? Math.min(round2((vg + tg + eg) * 0.2), 20) : 25;
    const zuschlag = 0;
    const subtotal = round2(vg + tg + eg + auslagen + zuschlag);
    const mwst = round2(subtotal * (jurisdiction === "de" ? 0.19 : 0.2));
    const total = round2(subtotal + mwst);

    setResult({
      jurisdiction,
      streitwert: sw,
      verfahrensgebuehr: vg,
      terminGebuehr: tg,
      einigungsgebuehr: eg,
      zuschlag,
      auslagen,
      mwst,
      total,
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Kostenrechner"
        description="Anwaltskosten nach RVG 2025 (DE) oder RATG (AT)"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kostenrechner" }]}
      />

      {/* Jurisdiction selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setJurisdiction("de")}
          className={cn(
            "flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            jurisdiction === "de"
              ? "brand-soft brand-border brand-text"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          🇩🇪 Deutschland (RVG 2025)
        </button>
        <button
          onClick={() => setJurisdiction("at")}
          className={cn(
            "flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            jurisdiction === "at"
              ? "brand-soft brand-border brand-text"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          🇦🇹 Österreich (RATG 2024)
        </button>
      </div>

      {/* Input */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div>
          <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
            Streitwert ({jurisdiction === "de" ? "EUR" : "EUR"})
          </label>
          <div className="relative">
            <Euro
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
            />
            <Input
              value={streitwert}
              onChange={(e) => setStreitwert(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && calculate()}
              placeholder="z.B. 15000"
              aria-label="z.B. 15000"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
        </div>
        <Button
          onClick={calculate}
          variant="primary"
          className="brand-bg brand-bg w-full gap-2 text-white"
        >
          <Calculator size={16} />
          Berechnen
        </Button>

        {/* Case selector */}
        {cases.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
              Mit Akte verknüpfen
            </label>
            <select
              value={selectedCaseSlug}
              onChange={(e) => setSelectedCaseSlug(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              <option value="">Keine Akte</option>
              {cases.map((c) => {
                const fm = caseFrontmatter(c);
                return (
                  <option key={c.slug} value={c.slug}>
                    {fm.case_number ? `${fm.case_number} - ` : ""}
                    {c.title}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Berechnungsergebnis
            </h2>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] py-2">
              <span className="text-sm text-[color:var(--ds-text-muted)]">Streitwert</span>
              <span className="font-mono text-sm text-[color:var(--ds-text)]">
                {result.streitwert.toLocaleString("de-DE")} €
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[color:var(--ds-text-muted)]">
                Verfahrensgebühr (1,3)
              </span>
              <span className="font-mono text-sm text-[color:var(--ds-text)]">
                {result.verfahrensgebuehr.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[color:var(--ds-text-muted)]">Terminsgebühr (1,2)</span>
              <span className="font-mono text-sm text-[color:var(--ds-text)]">
                {result.terminGebuehr.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[color:var(--ds-text-muted)]">
                Einigungsgebühr ({result.jurisdiction === "de" ? "1,0" : "1,2"})
              </span>
              <span className="font-mono text-sm text-[color:var(--ds-text)]">
                {result.einigungsgebuehr.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[color:var(--ds-text-muted)]">Auslagenpauschale</span>
              <span className="font-mono text-sm text-[color:var(--ds-text)]">
                {result.auslagen.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] py-2">
              <span className="text-sm text-[color:var(--ds-text-muted)]">Zwischensumme</span>
              <span className="font-mono text-sm text-[color:var(--ds-text)]">
                {(
                  result.verfahrensgebuehr +
                  result.terminGebuehr +
                  result.einigungsgebuehr +
                  result.auslagen
                ).toLocaleString("de-DE", { minimumFractionDigits: 2 })}{" "}
                €
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[color:var(--ds-text-muted)]">
                MwSt ({result.jurisdiction === "de" ? "19%" : "20%"})
              </span>
              <span className="font-mono text-sm text-[color:var(--ds-text)]">
                {result.mwst.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="brand-soft brand-border/10 flex items-center justify-between rounded-lg border px-3 py-3">
              <span className="brand-text text-sm font-semibold">Geschätztes Honorar (brutto)</span>
              <span className="brand-text font-mono text-lg font-bold">
                {result.total.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
          </div>

          {/* Save to case */}
          {selectedCaseSlug && (
            <div className="flex items-center gap-3 border-t border-[color:var(--ds-border)] pt-3">
              <Button
                onClick={saveToCase}
                disabled={saving}
                variant="primary"
                className="brand-bg gap-2 text-sm text-white"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                In Akte speichern
              </Button>
              {saveNotice && (
                <span
                  className={cn(
                    "text-xs",
                    saveNotice.startsWith("Fehler:") ? "text-red-600" : "text-emerald-600"
                  )}
                >
                  {saveNotice}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* AT approximation warning */}
      {jurisdiction === "at" && (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-600"
          role="note"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Die Österreich-Werte sind <strong>Näherungswerte</strong>. Das RATG rechnet mit
            Bemessungsgrundlage, Einheitssatz und ERV-Zuschlägen — eine verbindliche Berechnung ist
            nur anhand des konkreten Tarifpostens möglich.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 border-t border-[color:var(--ds-border)] pt-4 text-xs text-[color:var(--ds-text-muted)]">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          Dieser Rechner dient der Orientierung und ersetzt keine rechtsverbindliche
          Gebührenberechnung. Berechnungsbasis: RVG § 13 i.d.F. KostBRÄG 2025 (gerichtliches
          Verfahren 1. Instanz, VV 3100/3104/1003/7002). Prüfe vor verbindlichen Angaben die aktuell
          geltende Fassung des RVG bzw. RATG.
        </p>
      </div>
    </div>
  );
}
