"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, RotateCcw, Calculator, FileText, User, AlertTriangle } from "lucide-react";
import {
  upcomingTaxDeadlines,
  brainPagesToTaxData,
  taxDeadlinesFromData,
  einspruchDeadline,
  zahlungsfristDeadline,
  einspruchsbegruendungDeadline,
  berichtigungsfrist,
  elsterFristverlaengerung,
  festsetzungsverjaehrung,
} from "@/lib/tax-deadlines";
import { api } from "@/lib/api";
import type { TaxDeadlineEntry } from "@/lib/tax-types";

type CalcType = "einspruch" | "zahlung" | "begruendung" | "berichtigung" | "elster" | "verjaehrung";

const CALC_FUNCTIONS: Record<CalcType, (date: string) => Date> = {
  einspruch: einspruchDeadline,
  zahlung: zahlungsfristDeadline,
  begruendung: einspruchsbegruendungDeadline,
  berichtigung: berichtigungsfrist,
  elster: elsterFristverlaengerung,
  verjaehrung: (date) => festsetzungsverjaehrung(new Date(date).getFullYear()),
};

export default function TaxDeadlinesPage() {
  const { t, lang } = useLang();
  const locale = lang === "en" ? "en-GB" : "de-DE";
  const [deadlines, setDeadlines] = useState<TaxDeadlineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calcType, setCalcType] = useState<CalcType>("einspruch");
  const [calcDate, setCalcDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [returns, assessments, audits] = await Promise.all([
        api.tax.returns.list({ limit: 50 }),
        api.tax.assessments.list({ limit: 50 }),
        api.tax.audits.list({ limit: 50 }),
      ]);
      const data = brainPagesToTaxData({ returns, assessments, audits });
      const recurring = upcomingTaxDeadlines(new Date(), 90);
      const fromData = taxDeadlinesFromData(data, new Date(), 90);
      const merged = [...recurring, ...fromData];
      merged.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      setDeadlines(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.deadlines.error_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...deadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [deadlines]);

  const overdue = sorted.filter((d) => d.isOverdue);
  const urgent = sorted.filter((d) => d.isUrgent && !d.isOverdue);
  const clientDeadlines = sorted.filter((d) => d.clientId);
  const recurringDeadlines = sorted.filter((d) => !d.clientId);

  const calcResult = useMemo(() => {
    if (!calcDate) return null;
    return CALC_FUNCTIONS[calcType](calcDate);
  }, [calcType, calcDate]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tax.deadlines.title")}
        description={t("tax.deadlines.desc")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("tax.deadlines.title") },
        ]}
      />

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle size={16} />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RotateCcw size={14} /> {t("tax.deadlines.retry")}
            </Button>
          </div>
        </div>
      )}

      {/* Calculator */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calculator size={16} className="text-[color:var(--brand-primary)]" />
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("tax.deadlines.calculator")}
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="calc-type">{t("tax.deadlines.calc_type")}</Label>
            <Select value={calcType} onValueChange={(v) => setCalcType(v as CalcType)}>
              <SelectTrigger id="calc-type" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="einspruch">{t("tax.deadlines.calc_einspruch")}</SelectItem>
                <SelectItem value="zahlung">{t("tax.deadlines.calc_zahlung")}</SelectItem>
                <SelectItem value="begruendung">{t("tax.deadlines.calc_begruendung")}</SelectItem>
                <SelectItem value="berichtigung">{t("tax.deadlines.calc_berichtigung")}</SelectItem>
                <SelectItem value="elster">{t("tax.deadlines.calc_elster")}</SelectItem>
                <SelectItem value="verjaehrung">{t("tax.deadlines.calc_verjaehrung")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="calc-date">{t("tax.deadlines.calc_date")}</Label>
            <Input
              id="calc-date"
              type="date"
              value={calcDate}
              onChange={(e) => setCalcDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>{t("tax.deadlines.calc_result")}</Label>
            <div className="mt-2.5 text-sm font-medium text-[color:var(--brand-primary)]">
              {calcResult
                ? calcResult.toLocaleDateString(locale, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <DeadlineSection
              title={t("tax.deadlines.overdue")}
              entries={overdue}
              variant="overdue"
              lang={lang}
            />
          )}

          {urgent.length > 0 && (
            <DeadlineSection
              title={t("tax.deadlines.urgent")}
              entries={urgent}
              variant="urgent"
              lang={lang}
            />
          )}

          {clientDeadlines.length > 0 && (
            <DeadlineSection
              title={t("tax.deadlines.from_data")}
              entries={clientDeadlines.filter((d) => !d.isOverdue && !d.isUrgent)}
              variant="upcoming"
              lang={lang}
            />
          )}

          <DeadlineSection
            title={t("tax.deadlines.recurring")}
            entries={recurringDeadlines.filter((d) => !d.isOverdue && !d.isUrgent)}
            variant="upcoming"
            lang={lang}
          />
        </>
      )}
    </div>
  );
}

function DeadlineSection({
  title,
  entries,
  variant,
  lang,
}: {
  title: string;
  entries: TaxDeadlineEntry[];
  variant: "overdue" | "urgent" | "upcoming";
  lang: string;
}) {
  const { t } = useLang();
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
        {title} ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-10 text-center">
          <CalendarClock size={32} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-2 text-sm text-[color:var(--ds-text-subtle)]">
            {t("tax.deadlines.empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((d) => (
            <DeadlineRow key={d.id} entry={d} variant={variant} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeadlineRow({
  entry,
  variant,
  lang,
}: {
  entry: TaxDeadlineEntry;
  variant: "overdue" | "urgent" | "upcoming";
  lang: string;
}) {
  const { t } = useLang();
  const locale = lang === "en" ? "en-GB" : "de-DE";
  const colors = {
    overdue: "border-rose-500/20 bg-rose-500/5",
    urgent: "border-amber-500/20 bg-amber-500/5",
    upcoming: "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
  };

  return (
    <div className={`flex items-start gap-3 rounded-lg border ${colors[variant]} px-4 py-3`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
        {entry.clientId ? (
          <User size={16} className="text-[color:var(--ds-text-muted)]" />
        ) : (
          <FileText size={16} className="text-[color:var(--ds-text-muted)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">{entry.label}</p>
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {entry.clientName ?? t("tax.deadlines.general")} · {entry.recurring}
        </p>
        {entry.notes && (
          <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
            {t("tax.deadlines.notes")}: {entry.notes}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-xs font-medium text-[color:var(--ds-text)]">
          {new Date(entry.dueDate).toLocaleDateString(locale, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
        <p
          className={`text-xs ${variant === "overdue" ? "text-rose-600" : variant === "urgent" ? "text-amber-600" : "text-[color:var(--ds-text-subtle)]"}`}
        >
          {entry.isOverdue
            ? `${Math.abs(entry.daysRemaining)} ${t("tax.deadlines.days_overdue")}`
            : `${entry.daysRemaining} ${t("tax.deadlines.in_days")}`}
        </p>
      </div>
    </div>
  );
}
