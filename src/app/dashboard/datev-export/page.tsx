"use client";

import { useState, useEffect } from "react";
import { Download, Copy, Check, AlertTriangle, Clock, Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import { loadKanzleiSettings, type KanzleiSettings } from "@/lib/kanzlei-settings";
import { generateDatevCsv, type ExportEntry } from "@/lib/datev-export";
import { PageHeader } from "@/components/dashboard/page-header";

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
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="DATEV Export"
        description="Abgerechnete Honorare und Auslagen für DATEV Unternehmen Online"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "DATEV-Export" }]}
      />

      {/* DATEV Einstellungen */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Export-Einstellungen</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs text-[color:var(--ds-text-muted)]">Von</label>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-green-500/50 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[color:var(--ds-text-muted)]">Bis</label>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-green-500/50 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[color:var(--ds-text-muted)]">Kontenrahmen</label>
            <select
              value={settings?.datevKontenrahmen || "SKR03"}
              onChange={(e) => {
                const next = {
                  ...settings,
                  datevKontenrahmen: e.target.value as "SKR03" | "SKR04" | "SKR49",
                } as KanzleiSettings;
                setSettings(next);
              }}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-green-500/50 focus:outline-none"
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
              onChange={(e) =>
                setSettings({ ...settings, datevBeraterNr: e.target.value } as KanzleiSettings)
              }
              placeholder="12345"
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-green-500/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-600">
          Der Export berücksichtigt nur bereits abgerechnete, abrechenbare Positionen aus Akten.
          Bitte Kontenrahmen, Steuerschlüssel und Importformat vor dem DATEV-Import durch Ihren
          Steuerberater verifizieren.
        </p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
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
          <div className="text-xl font-bold text-[color:var(--ds-text)]">
            {totalHours.toFixed(1)}h
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Netto-Betrag</div>
          <div className="text-xl font-bold text-emerald-600">
            {totalAmount.toLocaleString("de-DE")} €
          </div>
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Buchungen</h2>
        {loading ? (
          <div className="py-10 text-center text-[color:var(--ds-text-muted)]">
            <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
            Lade Buchungen…
          </div>
        ) : entries.length === 0 ? (
          <div className="space-y-3 py-10 text-center">
            <Clock size={32} className="mx-auto text-[color:var(--ds-border)]" />
            <p className="text-[color:var(--ds-text-muted)]">
              Keine abgerechneten Buchungen gefunden.
            </p>
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              Erstellen Sie zuerst Rechnungen aus offenen Zeiten/Auslagen, damit Positionen in den
              DATEV-Export wandern.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
              >
                <Briefcase size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[color:var(--ds-text)]">{entry.description}</div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {entry.client} · {entry.caseNumber}
                    {entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ""}
                  </div>
                </div>
                <Badge
                  variant="default"
                  className="shrink-0 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                >
                  {entry.legalArea}
                </Badge>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm text-[color:var(--ds-text)]">
                    {entry.kind === "time" ? `${(entry.hours ?? 0).toFixed(1)}h` : "Auslage"}
                  </div>
                  <div className="font-mono text-xs text-emerald-600">
                    {entry.amount.toFixed(0)} €
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSV Preview */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">DATEV CSV</h2>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyCsv}
              className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              Kopieren
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={downloadCsv}
              className="gap-1.5 bg-green-600 text-xs text-white hover:bg-green-500"
            >
              <Download size={14} />
              Herunterladen
            </Button>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 font-mono text-xs whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
          {csv}
        </pre>
      </div>
    </div>
  );
}
