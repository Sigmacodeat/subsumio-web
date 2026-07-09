"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Banknote,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Clock,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { getOposSummary, getDunningLabel, type OpenItem, type BankTransaction } from "@/lib/fibu";

export default function FibuPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [openItems, setOpenItems] = useState<OpenItem[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [saving, setSaving] = useState(false);

  const [importForm, setImportForm] = useState({
    date: "",
    amount: "",
    direction: "credit" as "debit" | "credit",
    iban: "",
    bic: "",
    sender_name: "",
    reference: "",
    purpose: "",
  });

  const [linkForm, setLinkForm] = useState({
    invoice_id: "",
    invoice_number: "",
    amount: "",
    client_name: "",
    client_email: "",
    iban: "",
    bic: "",
    remittance_text: "",
  });

  const load = useCallback(async () => {
    try {
      const batch = await api.brain.batchListPages(
        ["open_item", "bank_transaction", "payment_link"],
        200
      );
      const items = (batch["open_item"] ?? []).map((p) => p.frontmatter as unknown as OpenItem);
      const txns = (batch["bank_transaction"] ?? []).map(
        (p) => p.frontmatter as unknown as BankTransaction
      );
      setOpenItems(items);
      setTransactions(txns);
    } catch {
      addToast({ type: "error", title: "Fehler beim Laden" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleImport() {
    if (!importForm.date || !importForm.amount || !importForm.iban) {
      addToast({ type: "error", title: "Datum, Betrag und IBAN erforderlich" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fibu/opos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: [
            {
              date: importForm.date,
              amount: parseFloat(importForm.amount),
              direction: importForm.direction,
              iban: importForm.iban,
              bic: importForm.bic || undefined,
              sender_name: importForm.sender_name || undefined,
              reference: importForm.reference || undefined,
              purpose: importForm.purpose || undefined,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      addToast({
        type: "success",
        title: `${data.imported} Transaktion(en) importiert, ${data.matched} matched`,
      });
      setShowImport(false);
      setImportForm({
        date: "",
        amount: "",
        direction: "credit",
        iban: "",
        bic: "",
        sender_name: "",
        reference: "",
        purpose: "",
      });
      void load();
    } catch (e) {
      addToast({
        type: "error",
        title: "Import fehlgeschlagen",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function syncBankFeed() {
    setSaving(true);
    try {
      const response = await csrfFetch("/api/fibu/bank-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.error);
      addToast({
        type: "success",
        title: `${result.data?.imported ?? 0} Bankbuchungen synchronisiert`,
      });
      await load();
    } catch (error) {
      addToast({
        type: "error",
        title: "Bank-Feed nicht verfügbar",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePaymentLink() {
    if (
      !linkForm.invoice_id ||
      !linkForm.invoice_number ||
      !linkForm.amount ||
      !linkForm.client_name ||
      !linkForm.iban
    ) {
      addToast({ type: "error", title: "Pflichtfelder ausfüllen" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fibu/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: linkForm.invoice_id,
          invoice_number: linkForm.invoice_number,
          amount: parseFloat(linkForm.amount),
          client_name: linkForm.client_name,
          client_email: linkForm.client_email || undefined,
          iban: linkForm.iban,
          bic: linkForm.bic || undefined,
          remittance_text: linkForm.remittance_text || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: "Zahlungslink erstellt" });
      setShowPaymentLink(false);
      setLinkForm({
        invoice_id: "",
        invoice_number: "",
        amount: "",
        client_name: "",
        client_email: "",
        iban: "",
        bic: "",
        remittance_text: "",
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "Fehler",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const summary = getOposSummary(openItems);
  const unmatchedTxns = transactions.filter((t) => t.status === "unmatched");

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Finanzbuchhaltung"
        description="Bank-Feed, OPOS, Mahnläufe und Zahlungslinks"
        breadcrumbs={[{ label: t("breadcrumb.dashboard"), href: "/dashboard" }, { label: "FiBu" }]}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => void syncBankFeed()}>
              Bank synchronisieren
            </Button>
            <Button
              variant="secondary"
              className="gap-2 text-sm"
              onClick={() => setShowPaymentLink(!showPaymentLink)}
            >
              <Plus size={14} />
              Zahlungslink
            </Button>
            <Button
              className="brand-bg gap-2 text-white"
              onClick={() => setShowImport(!showImport)}
            >
              <Banknote size={14} />
              Bank-Import
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
            <FileText size={12} />
            Offene Posten
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-text)]">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
            <Clock size={12} />
            Offener Betrag
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-text)]">
            {summary.totalOpenAmount.toFixed(2)} €
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] p-4">
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-attention-text)]">
            <AlertTriangle size={12} />
            Überfällig
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-attention-text)]">{summary.overdue}</p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-4">
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-success-text)]">
            <CheckCircle2 size={12} />
            Bezahlt
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-success-text)]">{summary.paid}</p>
        </div>
      </div>

      {/* Bank Import Form */}
      {showImport && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleImport();
          }}
        >
          <h2 className="text-sm font-semibold text-[color:var(--ds-info-text)]">Bank-Transaktion importieren</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Datum *</Label>
              <Input
                type="date"
                value={importForm.date}
                onChange={(e) => setImportForm({ ...importForm, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Betrag (€) *</Label>
              <Input
                type="number"
                step="0.01"
                value={importForm.amount}
                onChange={(e) => setImportForm({ ...importForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Richtung</Label>
              <select
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                value={importForm.direction}
                onChange={(e) =>
                  setImportForm({ ...importForm, direction: e.target.value as "debit" | "credit" })
                }
              >
                <option value="credit">Eingang (Credit)</option>
                <option value="debit">Ausgang (Debit)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">IBAN *</Label>
              <Input
                value={importForm.iban}
                onChange={(e) => setImportForm({ ...importForm, iban: e.target.value })}
                placeholder="DE89 3704 0044 0532 0130 00"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">BIC</Label>
              <Input
                value={importForm.bic}
                onChange={(e) => setImportForm({ ...importForm, bic: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Absender</Label>
              <Input
                value={importForm.sender_name}
                onChange={(e) => setImportForm({ ...importForm, sender_name: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Verwendungszweck</Label>
              <Input
                value={importForm.reference}
                onChange={(e) => setImportForm({ ...importForm, reference: e.target.value })}
                placeholder="Rechnungsnummer, Aktenzeichen..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Zweck</Label>
              <Input
                value={importForm.purpose}
                onChange={(e) => setImportForm({ ...importForm, purpose: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
            Importieren
          </Button>
        </form>
      )}

      {/* Payment Link Form */}
      {showPaymentLink && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePaymentLink();
          }}
        >
          <h2 className="text-sm font-semibold text-[color:var(--ds-success-text)]">
            Zahlungslink erstellen (EPC-QR)
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Rechnungs-ID *</Label>
              <Input
                value={linkForm.invoice_id}
                onChange={(e) => setLinkForm({ ...linkForm, invoice_id: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Rechnungsnummer *</Label>
              <Input
                value={linkForm.invoice_number}
                onChange={(e) => setLinkForm({ ...linkForm, invoice_number: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Betrag (€) *</Label>
              <Input
                type="number"
                step="0.01"
                value={linkForm.amount}
                onChange={(e) => setLinkForm({ ...linkForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Mandant *</Label>
              <Input
                value={linkForm.client_name}
                onChange={(e) => setLinkForm({ ...linkForm, client_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Mandant E-Mail</Label>
              <Input
                type="email"
                value={linkForm.client_email}
                onChange={(e) => setLinkForm({ ...linkForm, client_email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">IBAN *</Label>
              <Input
                value={linkForm.iban}
                onChange={(e) => setLinkForm({ ...linkForm, iban: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">BIC</Label>
              <Input
                value={linkForm.bic}
                onChange={(e) => setLinkForm({ ...linkForm, bic: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Verwendungszweck</Label>
              <Input
                value={linkForm.remittance_text}
                onChange={(e) => setLinkForm({ ...linkForm, remittance_text: e.target.value })}
                placeholder="Rechnung RE-2026-001"
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Zahlungslink erstellen
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : (
        <>
          {/* OPOS List */}
          <section aria-labelledby="opos-heading">
            <h2
              id="opos-heading"
              className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]"
            >
              Offene Posten ({openItems.length})
            </h2>
            <div className="space-y-2">
              {openItems.length === 0 ? (
                <p className="py-4 text-sm text-[color:var(--ds-text-muted)]">
                  Keine offenen Posten.
                </p>
              ) : (
                openItems.map((item) => {
                  const isOverdue = item.status !== "paid" && new Date(item.due_date) < new Date();
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isOverdue
                            ? "bg-[color:var(--ds-attention-bg)]"
                            : item.status === "paid"
                              ? "bg-[color:var(--ds-success-bg)]"
                              : "bg-[color:var(--ds-info-bg)]"
                        }`}
                      >
                        {isOverdue ? (
                          <AlertTriangle size={14} className="text-[color:var(--ds-attention-text)]" />
                        ) : item.status === "paid" ? (
                          <CheckCircle2 size={14} className="text-[color:var(--ds-success-text)]" />
                        ) : (
                          <FileText size={14} className="text-[color:var(--ds-info-text)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[color:var(--ds-text)]">
                            {item.invoice_number}
                          </span>
                          <Badge
                            variant="default"
                            className={`text-xs ${
                              item.status === "paid"
                                ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                                : isOverdue
                                  ? "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]"
                                  : "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                            }`}
                          >
                            {item.status === "paid"
                              ? "Bezahlt"
                              : isOverdue
                                ? "Überfällig"
                                : getDunningLabel(item.dunning_level) || "Offen"}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                          {item.client_name} · Fällig: {item.due_date.split("T")[0]} · Offen:{" "}
                          {item.open_amount.toFixed(2)} €
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Unmatched Transactions */}
          {unmatchedTxns.length > 0 && (
            <section aria-labelledby="unmatched-heading">
              <h2
                id="unmatched-heading"
                className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]"
              >
                Unzugeordnete Bank-Transaktionen ({unmatchedTxns.length})
              </h2>
              <div className="space-y-2">
                {unmatchedTxns.map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-warning-bg)]">
                      <TrendingUp size={14} className="text-[color:var(--ds-warning-text)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {txn.amount.toFixed(2)} €
                      </span>
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {txn.date.split("T")[0]} · {txn.sender_name ?? "Unbekannt"} ·{" "}
                        {txn.reference ?? txn.purpose ?? "Kein Verwendungszweck"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
