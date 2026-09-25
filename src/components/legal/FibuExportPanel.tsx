"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
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
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { loadKanzleiSettings, type KanzleiSettings } from "@/lib/kanzlei-settings";
import { generateRzlExport } from "@/lib/fibu-export/rzl";
import { generateBmdExport } from "@/lib/fibu-export/bmd";
import { FibuExportInputError, type FibuBookingInput } from "@/lib/fibu-export/types";

/**
 * Buchhaltungsexport für BMD und RZL. Vorher gab es im aktiven (AT-only)
 * Produkt gar keinen Export — die vorhandene DATEV-Logik
 * (src/lib/datev-export.ts) hängt nur noch an der archivierten DE-Seite.
 *
 * Beide Formate laufen komplett im Browser (die Rechnungen sind ohnehin
 * schon geladen); es wird nichts an den Server gesendet.
 */

type Format = "rzl" | "bmd";

interface InvoiceRow {
  number: string;
  date: string;
  client: string;
  status: string;
  net: number;
  vatRate: number;
  tax: number;
  total: number;
  invoiceType?: "standard" | "teilrechnung" | "sammelrechnung" | "gutschrift";
}

const BOOKABLE_STATUS = new Set(["sent", "paid", "overdue"]);

function toBookingInput(inv: InvoiceRow): FibuBookingInput {
  return {
    invoiceNumber: inv.number,
    date: inv.date,
    clientName: inv.client,
    net: inv.net,
    vat: inv.tax,
    vatRatePercent: Math.round(inv.vatRate * 100),
    gross: inv.total,
    invoiceType: inv.invoiceType === "gutschrift" ? "gutschrift" : "standard",
  };
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FibuExportPanel() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<KanzleiSettings | null>(null);
  const [format, setFormat] = useState<Format>("rzl");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadKanzleiSettings().then(setSettings);
  }, []);

  const debitorKonto = settings?.fibuDebitorKonto?.trim();
  const erloesKonto = settings?.fibuErloesKonto?.trim();
  const kontenConfigured = Boolean(debitorKonto && erloesKonto);

  async function exportInvoices() {
    setError(null);
    if (!kontenConfigured) {
      setError(
        "Debitoren- und Erlöskonto sind noch nicht hinterlegt — bitte in den Kanzlei-Einstellungen unter Buchhaltung mit dem Steuerberater abstimmen."
      );
      return;
    }
    setBusy(true);
    try {
      const { results, errors } = await api.brain.batchListPagesDetailed(["invoice"], 2000);
      if (errors.length) throw new Error(`batch list failed: ${errors.join(",")}`);
      const invoicePages = results.invoice ?? [];
      const rows: InvoiceRow[] = invoicePages
        .map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            number: String(fm.invoice_number ?? p.slug),
            date: String(fm.date ?? p.created_at ?? ""),
            client: String(fm.client ?? ""),
            status: String(fm.status ?? "draft"),
            net: Number(fm.subtotal ?? 0) + Number(fm.expense_total ?? 0),
            vatRate: Number(fm.vat_rate ?? 0.2),
            tax: Number(fm.tax ?? 0),
            total: Number(fm.total ?? 0),
            invoiceType: fm.invoice_type as InvoiceRow["invoiceType"],
          };
        })
        .filter((r) => BOOKABLE_STATUS.has(r.status) && r.date >= from && r.date <= to && r.number);

      if (rows.length === 0) {
        setError("Keine versendeten Rechnungen im gewählten Zeitraum gefunden.");
        return;
      }

      const config = {
        debitorKonto: Number(debitorKonto),
        erloesKonto: Number(erloesKonto),
      };
      const entries = rows.map(toBookingInput);

      if (format === "rzl") {
        const csv = generateRzlExport(entries, config);
        download(csv, `rzl-export_${from}_${to}.txt`, "text/plain;charset=windows-1252");
      } else {
        const steuercodeForRate: Record<number, string> = {};
        if (settings?.fibuBmdSteuercode20) steuercodeForRate[20] = settings.fibuBmdSteuercode20;
        if (settings?.fibuBmdSteuercode13) steuercodeForRate[13] = settings.fibuBmdSteuercode13;
        if (settings?.fibuBmdSteuercode10) steuercodeForRate[10] = settings.fibuBmdSteuercode10;
        const csv = generateBmdExport(entries, config, steuercodeForRate);
        download(csv, `bmd-export_${from}_${to}.csv`, "text/csv;charset=utf-8");
      }
      addToast({ type: "success", title: `${rows.length} Rechnung(en) exportiert` });
    } catch (err) {
      setError(err instanceof FibuExportInputError ? err.message : "Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-[color:var(--ds-border)] p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileSpreadsheet size={15} aria-hidden /> Buchhaltungsexport (BMD / RZL)
        </h3>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          Versendete Rechnungen im gewählten Zeitraum als Buchungssätze exportieren. RZL nach der
          amtlichen Schnittstellenspezifikation (RZL Software GmbH); BMD nach einer
          Partner-Referenzimplementierung — bitte vor dem ersten echten Import gegen einen realen
          BMD-Export oder mit dem BMD-Partnerprogramm verifizieren.
        </p>
      </div>

      {!kontenConfigured && (
        <p className="rounded-md border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
          Debitoren- und Erlöskonto sind noch nicht hinterlegt. Bitte in den Kanzlei-Einstellungen
          unter Buchhaltung eintragen — beides ist kanzleispezifisch und mit dem Steuerberater
          abzustimmen.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fibu-export-format" className="text-xs">
            Format
          </Label>
          <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
            <SelectTrigger id="fibu-export-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rzl">RZL</SelectItem>
              <SelectItem value="bmd">BMD NTCS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fibu-export-from" className="text-xs">
            Von
          </Label>
          <Input
            id="fibu-export-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fibu-export-to" className="text-xs">
            Bis
          </Label>
          <Input
            id="fibu-export-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void exportInvoices()} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Exportieren
        </Button>
        {error && (
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-[color:var(--ds-danger-text)]"
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
