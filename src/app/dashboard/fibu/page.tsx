"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Banknote, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton, Skeleton } from "@/components/dashboard/skeleton";
import { formatDate, formatEur } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { getOposSummary, getDunningLabel, type OpenItem, type BankTransaction } from "@/lib/fibu";
import { FibuExportPanel } from "@/components/legal/FibuExportPanel";

import { unwrapApiBody } from "@/lib/api-body";
export default function FibuPage() {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const router = useRouter();
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
      addToast({
        type: "error",
        title: "Buchhaltungsdaten konnten nicht geladen werden",
        description: "Bitte laden Sie die Seite neu.",
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleImport() {
    if (!importForm.date || !importForm.amount || !importForm.iban) {
      addToast({ type: "error", title: "Bitte Datum, Betrag und IBAN angeben" });
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/fibu/opos", {
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
      const data = unwrapApiBody(await res.json());
      const imported = Number(data.imported) || 0;
      const matched = Number(data.matched) || 0;
      addToast({
        type: "success",
        title: `${imported} ${imported === 1 ? "Bankbuchung" : "Bankbuchungen"} erfasst`,
        description:
          matched > 0
            ? `${matched} davon einem offenen Posten zugeordnet.`
            : "Keinem offenen Posten automatisch zugeordnet.",
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
      console.error("[fibu] import failed:", e instanceof Error ? e.message : e);
      addToast({
        type: "error",
        title: "Bankbuchung wurde nicht gespeichert",
        description: "Bitte prüfen Sie die Angaben und versuchen Sie es erneut.",
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
      console.error("[fibu] bank feed failed:", error instanceof Error ? error.message : error);
      addToast({
        type: "error",
        title: "Bankabgleich nicht möglich",
        description:
          "Es ist keine Bankverbindung eingerichtet oder die Bank antwortet nicht. Sie können Buchungen weiterhin manuell erfassen.",
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
      addToast({ type: "error", title: "Bitte alle Pflichtfelder ausfüllen" });
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/fibu/payment-links", {
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
      console.error("[fibu] payment link failed:", e instanceof Error ? e.message : e);
      addToast({
        type: "error",
        title: "Zahlungslink wurde nicht erstellt",
        description: "Bitte prüfen Sie Betrag und IBAN und versuchen Sie es erneut.",
      });
    } finally {
      setSaving(false);
    }
  }

  const summary = getOposSummary(openItems);
  const openCount = summary.total - summary.paid;
  const unmatchedTxns = transactions.filter((t) => t.status === "unmatched");

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("fibu.title")}
        description={t("fibu.desc")}
        breadcrumbs={[{ label: t("breadcrumb.dashboard"), href: "/dashboard" }, { label: "FiBu" }]}
        actions={
          <>
            <PrimaryAction
              icon={<Banknote size={15} aria-hidden="true" />}
              onClick={() => {
                setShowImport(!showImport);
                setShowPaymentLink(false);
              }}
            >
              Bankbuchung erfassen
            </PrimaryAction>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              disabled={saving}
              onClick={() => void syncBankFeed()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Bank abgleichen
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => {
                setShowPaymentLink(!showPaymentLink);
                setShowImport(false);
              }}
            >
              <Plus size={14} aria-hidden="true" />
              Zahlungslink
            </Button>
          </>
        }
      />

      <FibuExportPanel />

      {/* Kennzahlen — Farbe nur, wenn es etwas zu beachten gibt */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FibuStat label="Offene Posten" value={String(openCount)} />
          <FibuStat label="Offener Betrag" value={formatEur(summary.totalOpenAmount, lang)} />
          <FibuStat
            label="Überfällig"
            value={String(summary.overdue)}
            sub={summary.overdue > 0 ? formatEur(summary.totalOverdueAmount, lang) : undefined}
            tone={summary.overdue > 0 ? "danger" : undefined}
          />
          <FibuStat label="Bezahlt" value={String(summary.paid)} />
        </div>
      )}

      {/* Bank Import Form */}
      {showImport && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleImport();
          }}
        >
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            Bankbuchung erfassen
          </h2>
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
                inputMode="decimal"
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
                <option value="credit">Eingang</option>
                <option value="debit">Ausgang</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">IBAN *</Label>
              <Input
                value={importForm.iban}
                onChange={(e) => setImportForm({ ...importForm, iban: e.target.value })}
                placeholder="AT61 1904 3002 3457 3201"
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
                placeholder={t("fibu.ph_search")}
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
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
              Buchung speichern
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowImport(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {/* Payment Link Form */}
      {showPaymentLink && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePaymentLink();
          }}
        >
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Zahlungslink erstellen
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
              Erzeugt einen EPC-QR-Code (SEPA-Überweisung), den der Mandant mit der Banking-App
              scannt.
            </p>
          </div>
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
                inputMode="decimal"
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
                autoComplete="email"
                inputMode="email"
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
                placeholder={t("fibu.ph_invoice")}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Zahlungslink erstellen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowPaymentLink(false)}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <RowSkeleton count={4} />
      ) : (
        <>
          {/* OPOS List */}
          <section aria-labelledby="opos-heading" className="space-y-2">
            <h2
              id="opos-heading"
              className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase"
            >
              Offene Posten{openItems.length > 0 ? ` · ${openItems.length}` : ""}
            </h2>
            {openItems.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Keine offenen Posten"
                description="Offene Posten entstehen aus versendeten Rechnungen. Zahlungseingänge werden ihnen beim Bankabgleich zugeordnet."
                actionLabel="Zu den Rechnungen"
                onAction={() => router.push("/dashboard/invoicing")}
              />
            ) : (
              <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                {openItems.map((item) => {
                  const isOverdue = item.status !== "paid" && new Date(item.due_date) < new Date();
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[color:var(--ds-text)] tabular-nums">
                            {item.invoice_number}
                          </span>
                          <Badge
                            variant="default"
                            className={`text-xs ${
                              item.status === "paid"
                                ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                                : isOverdue
                                  ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                                  : ""
                            }`}
                          >
                            {item.status === "paid"
                              ? "Bezahlt"
                              : isOverdue
                                ? "Überfällig"
                                : getDunningLabel(item.dunning_level) || "Offen"}
                          </Badge>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                          {item.client_name} · fällig {formatDate(item.due_date)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-semibold text-[color:var(--ds-text)] tabular-nums">
                        {formatEur(item.open_amount, lang)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Unmatched Transactions */}
          {unmatchedTxns.length > 0 && (
            <section aria-labelledby="unmatched-heading" className="space-y-2">
              <h2
                id="unmatched-heading"
                className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase"
              >
                Nicht zugeordnete Bankbuchungen · {unmatchedTxns.length}
              </h2>
              <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                {unmatchedTxns.map((txn) => (
                  <li key={txn.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-[color:var(--ds-text)]">
                        {txn.sender_name ?? "Unbekannter Absender"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                        {formatDate(txn.date)} ·{" "}
                        {txn.reference ?? txn.purpose ?? "Kein Verwendungszweck"}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-[color:var(--ds-text)] tabular-nums">
                      {formatEur(txn.amount, lang)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FibuStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "danger" ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-text)]"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">{sub}</div>
      )}
    </div>
  );
}
