"use client";

import { useState, useCallback } from "react";
import {
  Clock,
  Receipt,
  Plus,
  Trash2,
  FileText,
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import type { TimeEntry } from "@/lib/legal-types";
import type { DashboardKey } from "@/content/dashboard";

const ACTIVITY_TYPES: Array<{ value: string; key: string }> = [
  { value: "consultation", key: "cases.detail_time_act_consultation" },
  { value: "phone", key: "cases.detail_time_act_phone" },
  { value: "email", key: "cases.detail_time_act_email" },
  { value: "filing", key: "cases.detail_time_act_filing" },
  { value: "court", key: "cases.detail_time_act_court" },
  { value: "research", key: "cases.detail_time_act_research" },
  { value: "study", key: "cases.detail_time_act_study" },
];

export function BillingTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newEntry, setNewEntry] = useState({
    description: "",
    minutes: "",
    rate: "",
    lawyer: "",
    activity_type: "consultation",
    billable: true,
  });
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);

  const handleStartTimer = useCallback(() => {
    setTimerRunning(true);
    setTimerStart(Date.now());
    setTimerElapsed(0);
  }, []);

  const handleStopTimer = useCallback(() => {
    if (timerStart) {
      const elapsedMin = Math.round((Date.now() - timerStart) / 60000);
      setNewEntry((prev) => ({ ...prev, minutes: String(elapsedMin) }));
    }
    setTimerRunning(false);
    setTimerStart(null);
  }, [timerStart]);

  const handleAddTimeEntry = useCallback(() => {
    if (!ctx.caseData) return;
    if (ctx.caseData.status === "archived") {
      ctx.setSaveError(t("casesdetail.archived_msg"));
      return;
    }
    const minutes = parseInt(newEntry.minutes, 10);
    if (!newEntry.description.trim() || !Number.isFinite(minutes) || minutes <= 0) return;
    const entry: TimeEntry = {
      id: `te-${Date.now()}`,
      description: newEntry.description.trim(),
      minutes,
      date: new Date().toISOString(),
      rate: newEntry.rate ? parseFloat(newEntry.rate) : undefined,
      billable: newEntry.billable,
      billed: false,
      lawyer: newEntry.lawyer || undefined,
      activity_type: newEntry.activity_type,
    };
    const updated = [...ctx.timeEntries, entry];
    ctx.setTimeEntries(updated);
    void ctx.saveCaseUpdate({ timeEntries: updated });
    setNewEntry({
      description: "",
      minutes: "",
      rate: "",
      lawyer: "",
      activity_type: "consultation",
      billable: true,
    });
  }, [ctx, newEntry, t]);

  const handleDeleteTimeEntry = useCallback(
    (id: string) => {
      if (!ctx.caseData || ctx.caseData.status === "archived") return;
      const updated = ctx.timeEntries.filter((e) => e.id !== id);
      ctx.setTimeEntries(updated);
      void ctx.saveCaseUpdate({ timeEntries: updated });
    },
    [ctx]
  );

  const handleDeleteExpense = useCallback(
    (id: string) => {
      if (!ctx.caseData || ctx.caseData.status === "archived") return;
      const updated = ctx.expensesList.filter((e) => e.id !== id);
      ctx.setExpensesList(updated);
      void ctx.saveCaseUpdate({ expenses: updated });
    },
    [ctx]
  );

  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const isArchived = caseData.status === "archived";

  const totalMinutes = ctx.timeEntries.reduce((sum, e) => sum + (e.minutes || 0), 0);
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  const billableMinutes = ctx.timeEntries
    .filter((e) => e.billable !== false)
    .reduce((sum, e) => sum + (e.minutes || 0), 0);
  const billableHours = Math.round((billableMinutes / 60) * 100) / 100;
  const billedMinutes = ctx.timeEntries
    .filter((e) => e.billed)
    .reduce((sum, e) => sum + (e.minutes || 0), 0);
  const billedHours = Math.round((billedMinutes / 60) * 100) / 100;
  const expenseTotal = ctx.expensesList.reduce(
    (sum, e) => sum + (typeof e.amount === "number" ? e.amount : 0),
    0
  );
  const billableExpenses = ctx.expensesList
    .filter((e) => e.billable !== false)
    .reduce((sum, e) => sum + (typeof e.amount === "number" ? e.amount : 0), 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="max-w-3xl space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
              <Clock size={14} />
              <span className="text-xs">{t("cases.detail_time_total")}</span>
            </div>
            <div className="mt-1 text-xl font-semibold text-[color:var(--ds-text)]">
              {totalHours}h
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
              <TrendingUp size={14} />
              <span className="text-xs">{t("cases.detail_time_billable")}</span>
            </div>
            <div className="mt-1 text-xl font-semibold text-[color:var(--ds-text)]">
              {billableHours}h
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
              <Receipt size={14} />
              <span className="text-xs">{t("cases.detail_exp_total")}</span>
            </div>
            <div className="mt-1 text-xl font-semibold text-[color:var(--ds-text)]">
              {expenseTotal.toFixed(2)} €
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
              <FileText size={14} />
              <span className="text-xs">{t("cases.detail_time_billed")}</span>
            </div>
            <div className="mt-1 text-xl font-semibold text-[color:var(--ds-text)]">
              {billedHours}h
            </div>
          </div>
        </div>

        {/* Time Tracking */}
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("cases.detail_time_title")}
            </h3>
            <div className="flex items-center gap-2">
              {timerRunning && (
                <span className="flex items-center gap-1.5 text-xs text-blue-600">
                  <Loader2 size={12} className="animate-spin" />
                  {Math.floor(timerElapsed / 60)}:{String(timerElapsed % 60).padStart(2, "0")}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={isArchived}
                onClick={timerRunning ? handleStopTimer : handleStartTimer}
                className="gap-1.5 text-xs"
              >
                {timerRunning ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {t("cases.detail_time_stop")}
                  </>
                ) : (
                  <>
                    <Clock size={12} />
                    {t("cases.detail_time_start")}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Add Time Entry Form — essentials only (Progressive Disclosure) */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              type="text"
              placeholder={t("cases.detail_time_activity_ph")}
              value={newEntry.description}
              disabled={isArchived}
              onChange={(e) => setNewEntry((p) => ({ ...p, description: e.target.value }))}
              className="md:col-span-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
            <input
              type="number"
              placeholder={t("cases.detail_time_min_ph")}
              value={newEntry.minutes}
              disabled={isArchived}
              onChange={(e) => setNewEntry((p) => ({ ...p, minutes: e.target.value }))}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
          </div>
          {/* Advanced fields — collapsed by default */}
          {showAdvanced && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                value={newEntry.activity_type}
                disabled={isArchived}
                onChange={(e) => setNewEntry((p) => ({ ...p, activity_type: e.target.value }))}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              >
                {ACTIVITY_TYPES.map((at) => (
                  <option key={at.value} value={at.value}>
                    {t(at.key as DashboardKey)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder={t("cases.detail_time_rate_ph")}
                value={newEntry.rate}
                disabled={isArchived}
                onChange={(e) => setNewEntry((p) => ({ ...p, rate: e.target.value }))}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
              <input
                type="text"
                placeholder={t("cases.detail_time_lawyer_ph")}
                value={newEntry.lawyer}
                disabled={isArchived}
                onChange={(e) => setNewEntry((p) => ({ ...p, lawyer: e.target.value }))}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                <input
                  type="checkbox"
                  checked={newEntry.billable}
                  disabled={isArchived}
                  onChange={(e) => setNewEntry((p) => ({ ...p, billable: e.target.checked }))}
                  className="accent-[var(--brand-primary)]"
                />
                {t("cases.detail_time_billable")}
              </label>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
            >
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {lang === "en" ? "Advanced" : "Erweitert"}
            </button>
            <Button
              variant="primary"
              size="sm"
              disabled={isArchived || !newEntry.description.trim() || !newEntry.minutes}
              onClick={handleAddTimeEntry}
              className="brand-bg gap-1.5 text-sm text-white"
            >
              <Plus size={14} />
              {t("cases.detail_time_book")}
            </Button>
          </div>

          {/* Time Entries List */}
          {ctx.timeEntries.length === 0 ? (
            <div className="py-8 text-center">
              <Clock size={32} className="mx-auto text-[color:var(--ds-border)]" />
              <p className="mt-2 text-sm text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "No time entries yet." : "Noch keine Zeiteinträge."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ctx.timeEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-[color:var(--ds-text)]">
                      {entry.description}
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {entry.activity_type &&
                        t(
                          (ACTIVITY_TYPES.find((a) => a.value === entry.activity_type)?.key ??
                            "cases.detail_time_title") as DashboardKey
                        )}
                      {entry.lawyer && ` · ${entry.lawyer}`}
                      {" · "}
                      {new Date(entry.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {Math.round((entry.minutes / 60) * 100) / 100}h
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {entry.rate ? `${entry.rate} €/h` : ""}
                    </div>
                  </div>
                  <Badge
                    variant={entry.billed ? "success" : entry.billable === false ? "default" : "warning"}
                    className="shrink-0 text-xs"
                  >
                    {entry.billed
                      ? t("cases.detail_time_billed")
                      : entry.billable === false
                        ? t("cases.detail_time_internal")
                        : t("cases.detail_time_billable")}
                  </Badge>
                  <button
                    disabled={isArchived}
                    onClick={() => handleDeleteTimeEntry(entry.id)}
                    className="shrink-0 text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("cases.detail_exp_title")}
          </h3>

          {/* Expense Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ctx.expenseForm.handleSubmit(ctx.onExpenseSubmit)();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              {...ctx.expenseForm.register("description")}
              placeholder={t("cases.detail_exp_desc_ph")}
              disabled={isArchived}
              className="min-w-[200px] flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
            <input
              {...ctx.expenseForm.register("amount")}
              type="number"
              step="0.01"
              placeholder={t("cases.detail_exp_amount_ph")}
              disabled={isArchived}
              className="w-32 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
            <label className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
              <input
                type="checkbox"
                {...ctx.expenseForm.register("billable")}
                disabled={isArchived}
                className="accent-[var(--brand-primary)]"
              />
              {t("cases.detail_exp_billable")}
            </label>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isArchived}
              className="brand-bg gap-1.5 text-sm text-white"
            >
              <Plus size={14} />
              {t("cases.detail_exp_add")}
            </Button>
          </form>

          {/* Expense List */}
          {ctx.expensesList.length === 0 ? (
            <div className="py-8 text-center">
              <Receipt size={32} className="mx-auto text-[color:var(--ds-border)]" />
              <p className="mt-2 text-sm text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "No expenses recorded." : "Keine Auslagen erfasst."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ctx.expensesList.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-[color:var(--ds-text)]">
                      {expense.description}
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {new Date(expense.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-medium text-[color:var(--ds-text)]">
                    {expense.amount.toFixed(2)} €
                  </div>
                  <Badge
                    variant={expense.billed ? "success" : expense.billable === false ? "default" : "warning"}
                    className="shrink-0 text-xs"
                  >
                    {expense.billed
                      ? t("cases.detail_exp_billed")
                      : expense.billable === false
                        ? t("cases.detail_exp_internal")
                        : t("cases.detail_exp_billable")}
                  </Badge>
                  <button
                    disabled={isArchived}
                    onClick={() => handleDeleteExpense(expense.id)}
                    className="shrink-0 text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Expense Total */}
          <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] pt-3">
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {t("cases.detail_exp_total")}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[color:var(--ds-text-muted)]">
                {t("cases.detail_exp_billable")}: {billableExpenses.toFixed(2)} €
              </span>
              <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                {expenseTotal.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>

        {/* Unbilled Summary */}
        {(billableHours > 0 || ctx.unbilledExpenses > 0) && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div>
              <h3 className="text-sm font-semibold text-amber-600">
                {lang === "en" ? "Unbilled Summary" : "Nicht abgerechnet"}
              </h3>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {billableHours}h {lang === "en" ? "time" : "Zeit"} +{" "}
                {ctx.unbilledExpenses.toFixed(2)} € {lang === "en" ? "expenses" : "Auslagen"}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = `/dashboard/invoicing?case=${encodeURIComponent(caseData.slug)}`;
              }}
              className="gap-1.5 border border-amber-500/30 text-xs text-amber-600 hover:bg-amber-500/10"
            >
              <FileText size={14} />
              {lang === "en" ? "Create Invoice" : "Rechnung erstellen"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
