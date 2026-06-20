"use client";

import { useState, useEffect } from "react";
import {
  Download,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Briefcase,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import { loadKanzleiSettings, type KanzleiSettings } from "@/lib/kanzlei-settings";
import { PageHeader } from "@/components/dashboard/page-header";

interface ExportEntry {
  id: string;
  date: string;
  caseNumber: string;
  description: string;
  hours?: number;
  rate: number;
  amount: number;
  client: string;
  legalArea: string;
  invoiceNumber?: string;
  kind: "time" | "expense";
}

const AREA_CODES: Record<string, string> = {
  "Vertragsrecht": "1300",
  "Prozessrecht": "1200",
  "Arbeitsrecht": "1400",
  "Datenschutz": "1500",
  "Steuerrecht": "1700",
  "Allgemein": "1100",
};

/** DATEV Kontenrahmen — Konto / Gegenkonto für Honorar und Auslagen. */
const KONTENRAHMEN: Record<string, { honorarKonto: string; auslagenKonto: string; ustKonto: string }> = {
  SKR03: { honorarKonto: "8400", auslagenKonto: "4900", ustKonto: "1776" },
  SKR04: { honorarKonto: "4400", auslagenKonto: "6300", ustKonto: "3806" },
  SKR49: { honorarKonto: "4400", auslagenKonto: "4900", ustKonto: "2776" }, // AT-Fibel
};

function csvCell(value: string | number | undefined): string {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Steuerkennzeichen für DATEV je nach USt-Satz.
 *  19 % DE = 19, 20 % AT = 20, 0 % = 0 (Ausland/Reverse-Charge). */
function steuerKennzeichen(vatRate: number): string {
  if (vatRate >= 0.195 && vatRate <= 0.195) return "19";
  if (vatRate >= 0.20) return "20";
  return "0";
}

function generateDatevCsv(
  entries: ExportEntry[],
  settings: KanzleiSettings | null,
  periodFrom: string,
  periodTo: string,
): string {
  const kontenrahmen = settings?.datevKontenrahmen || "SKR03";
  const konten = KONTENRAHMEN[kontenrahmen] || KONTENRAHMEN.SKR03;
  const beraterNr = settings?.datevBeraterNr || "";
  const mandantenNr = settings?.datevMandantenNr || "";
  const ustId = settings?.ustId || "";

  const lines = [
    "USt-ID;Datum;Belegnr;Buchungstext;Konto;Gegenkonto;Betrag;Steuerkennzeichen;Kostenstelle;Mandant;Stunden;Typ;Berater;Mandant-Nr",
    ...entries
      .filter((e) => e.date >= periodFrom && e.date <= periodTo)
      .map((e) => {
        const amount = e.amount.toFixed(2).replace(".", ",");
        const hours = (e.hours ?? 0).toFixed(2).replace(".", ",");
        const date = e.date.split("-").reverse().join(".");
        const kostenstelle = AREA_CODES[e.legalArea] || "1100";
        const beleg = e.invoiceNumber || e.caseNumber;
        const konto = e.kind === "time" ? konten.honorarKonto : konten.auslagenKonto;
        const steuer = steuerKennzeichen(0.19); // Default 19 % — pro Eintrag wäre besser
        return [
          ustId,
          date,
          beleg,
          e.description,
          konto,
          konten.ustKonto,
          amount,
          steuer,
          kostenstelle,
          e.client,
          hours,
          e.kind === "time" ? "Honorar" : "Auslage",
          beraterNr,
          mandantenNr,
        ].map(csvCell).join(";");
      }),
  ];
  return lines.join("\n");
}

export default function DatevExportPage() {
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = now.toISOString().split("T")[0];

  const [copied, setCopied] = useState(false);
  const [periodFrom, setPeriodFrom] = useState(defaultFrom);
  const [periodTo, setPeriodTo] = useState(defaultTo);
  const [entries, setEntries] = useState<ExportEntry[]>([]);
  const [settings, setSettings] = useState<KanzleiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    setLoadError(null);
    try {
      const [pages, loadedSettings] = await Promise.all([
        api.brain.listPages({ type: "legal_case", limit: 200 }),
        loadKanzleiSettings(),
      ]);
      setSettings(loadedSettings);
      const loaded: ExportEntry[] = [];
      for (const page of pages) {
        const fm = caseFrontmatter(page);
        const te = fm.time_entries || [];
        const expenses = fm.expenses || [];
        const caseNum = fm.case_number || page.slug;
        const client = fm.client_name || "Unbekannt";
        const area = fm.legal_area || "Allgemein";
        for (const e of te) {
          if (e.billable === false || e.billed !== true) continue;
          const rate = e.rate || parseInt(loadedSettings.stundensatz || "200", 10);
          const hours = (e.minutes || 0) / 60;
          loaded.push({
            id: `${page.slug}-${e.id}`,
            date: e.date ? e.date.split("T")[0] : new Date().toISOString().split("T")[0],
            caseNumber: caseNum,
            description: e.description || "",
            hours,
            rate,
            amount: Math.round(hours * rate * 100) / 100,
            client,
            legalArea: area,
            invoiceNumber: e.invoice_number,
            kind: "time",
          });
        }
        for (const e of expenses) {
          if (e.billable === false || e.billed !== true) continue;
          loaded.push({
            id: `${page.slug}-expense-${e.id}`,
            date: e.date ? e.date.split("T")[0] : new Date().toISOString().split("T")[0],
            caseNumber: caseNum,
            description: e.description || "Auslage",
            rate: 0,
            amount: e.amount || 0,
            client,
            legalArea: area,
            invoiceNumber: e.invoice_number,
            kind: "expense",
          });
        }
      }
      setEntries(loaded);
    } catch (err) {
      setEntries([]);
      setLoadError(err instanceof Error ? err.message : "Buchungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  const totalHours = entries.reduce((s, e) => s + (e.hours ?? 0), 0);
  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
  const csv = generateDatevCsv(entries, settings, periodFrom, periodTo);

  function copyCsv() {
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadCsv() {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `datev-export-${periodFrom}_bis_${periodTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="DATEV Export"
        description="Abgerechnete Honorare und Auslagen für DATEV Unternehmen Online"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "DATEV-Export" }]}
      />

      {/* DATEV Einstellungen */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Export-Einstellungen</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-[color:var(--ds-text-muted)]">Von</label>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-green-500/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[color:var(--ds-text-muted)]">Bis</label>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-green-500/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[color:var(--ds-text-muted)]">Kontenrahmen</label>
            <select
              value={settings?.datevKontenrahmen || "SKR03"}
              onChange={(e) => {
                const next = { ...settings, datevKontenrahmen: e.target.value as "SKR03" | "SKR04" | "SKR49" } as KanzleiSettings;
                setSettings(next);
              }}
              className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-green-500/50"
            >
              <option value="SKR03">SKR03 (DE)</option>
              <option value="SKR04">SKR04 (DE)</option>
              <option value="SKR49">SKR49 (AT)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[color:var(--ds-text-muted)]">Berater-Nr.</label>
            <input
              type="text"
              value={settings?.datevBeraterNr || ""}
              onChange={(e) => setSettings({ ...settings, datevBeraterNr: e.target.value } as KanzleiSettings)}
              placeholder="12345"
              className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-green-500/50"
            />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-600">
          Der Export berücksichtigt nur bereits abgerechnete, abrechenbare Positionen aus Akten.
          Bitte Kontenrahmen, Steuerschlüssel und Importformat vor dem DATEV-Import durch Ihren Steuerberater verifizieren.
        </p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-600 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          {loadError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Einträge</div>
          <div className="text-xl font-bold text-[color:var(--ds-text)]">{entries.length}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Gesamtstunden</div>
          <div className="text-xl font-bold text-[color:var(--ds-text)]">{totalHours.toFixed(1)}h</div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Netto-Betrag</div>
          <div className="text-xl font-bold text-emerald-600">{totalAmount.toLocaleString("de-DE")} €</div>
        </div>
      </div>

      {/* Entries */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Buchungen</h2>
        {loading ? (
          <div className="text-center py-10 text-[color:var(--ds-text-muted)]">
            <Loader2 size={20} className="mx-auto animate-spin mb-2" />
            Lade Buchungen…
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <Clock size={32} className="mx-auto text-[color:var(--ds-border)]" />
            <p className="text-[color:var(--ds-text-muted)]">Keine abgerechneten Buchungen gefunden.</p>
            <p className="text-[color:var(--ds-text-muted)] text-sm">Erstellen Sie zuerst Rechnungen aus offenen Zeiten/Auslagen, damit Positionen in den DATEV-Export wandern.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)]">
                <Briefcase size={14} className="text-[color:var(--ds-text-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[color:var(--ds-text)]">{entry.description}</div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {entry.client} · {entry.caseNumber}{entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ""}
                  </div>
                </div>
                <Badge variant="default" className="text-[10px] bg-[color:var(--ds-hover)] border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] shrink-0">
                  {entry.legalArea}
                </Badge>
                <div className="text-right shrink-0">
                  <div className="text-sm text-[color:var(--ds-text)] font-mono">{entry.kind === "time" ? `${(entry.hours ?? 0).toFixed(1)}h` : "Auslage"}</div>
                  <div className="text-xs text-emerald-600 font-mono">{entry.amount.toFixed(0)} €</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSV Preview */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">DATEV CSV</h2>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyCsv}
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] gap-1.5 text-xs"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              Kopieren
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={downloadCsv}
              className="bg-green-600 hover:bg-green-500 text-white gap-1.5 text-xs"
            >
              <Download size={14} />
              Herunterladen
            </Button>
          </div>
        </div>
        <pre className="text-xs text-[color:var(--ds-text-muted)] font-mono bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
          {csv}
        </pre>
      </div>
    </div>
  );
}
