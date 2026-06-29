"use client";

import { useState, useMemo, useEffect } from "react";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { CalendarClock, AlertCircle, Clock } from "lucide-react";
import { upcomingTaxDeadlines } from "@/lib/tax-deadlines";
import type { TaxDeadlineEntry } from "@/lib/tax-types";

export default function TaxDeadlinesPage() {
  const { t } = useLang();
  const [deadlines, setDeadlines] = useState<TaxDeadlineEntry[]>([]);

  useEffect(() => {
    setDeadlines(upcomingTaxDeadlines(new Date(), 90));
  }, []);

  const sorted = useMemo(() => {
    return [...deadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [deadlines]);

  const overdue = sorted.filter((d) => d.isOverdue);
  const urgent = sorted.filter((d) => d.isUrgent && !d.isOverdue);
  const upcoming = sorted.filter((d) => !d.isOverdue && !d.isUrgent);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("nav.tax_deadlines")}
        description="Steuerfristen und Abgabetermine — automatisch berechnet nach AO"
      />

      {overdue.length > 0 && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertCircle size={16} />
            <h3 className="text-sm font-semibold">Ueberfaellige Fristen ({overdue.length})</h3>
          </div>
          <div className="mt-3 space-y-2">
            {overdue.map((d) => (
              <DeadlineRow key={d.id} entry={d} variant="overdue" />
            ))}
          </div>
        </div>
      )}

      {urgent.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Clock size={16} />
            <h3 className="text-sm font-semibold">Dringende Fristen ({urgent.length})</h3>
          </div>
          <div className="mt-3 space-y-2">
            {urgent.map((d) => (
              <DeadlineRow key={d.id} entry={d} variant="urgent" />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
          Kommende Fristen ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarClock size={36} className="text-[color:var(--ds-text-subtle)] opacity-50" />
            <p className="mt-3 text-sm text-[color:var(--ds-text-subtle)]">
              Keine anstehenden Fristen in den naechsten 90 Tagen.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((d) => (
              <DeadlineRow key={d.id} entry={d} variant="upcoming" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeadlineRow({
  entry,
  variant,
}: {
  entry: TaxDeadlineEntry;
  variant: "overdue" | "urgent" | "upcoming";
}) {
  const colors = {
    overdue: "border-rose-500/20 bg-rose-500/5",
    urgent: "border-amber-500/20 bg-amber-500/5",
    upcoming: "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
  };

  return (
    <div className={`flex items-center gap-3 rounded-lg border ${colors[variant]} px-4 py-2.5`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
        <CalendarClock size={16} className="text-[color:var(--ds-text-muted)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">{entry.label}</p>
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {entry.clientName ?? "Allgemein"} · {entry.recurring}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs font-medium text-[color:var(--ds-text)]">
          {new Date(entry.dueDate).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
        <p
          className={`text-xs ${variant === "overdue" ? "text-rose-400" : variant === "urgent" ? "text-amber-400" : "text-[color:var(--ds-text-subtle)]"}`}
        >
          {entry.isOverdue
            ? `${Math.abs(entry.daysRemaining)} Tage ueberfaellig`
            : `in ${entry.daysRemaining} Tagen`}
        </p>
      </div>
    </div>
  );
}
