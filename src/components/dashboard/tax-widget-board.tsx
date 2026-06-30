"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  CalendarClock,
  FileCheck,
  FileText,
  ClipboardCheck,
  Plus,
  Loader2,
  RotateCcw,
  AlertCircle,
  Search,
  Send,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { encodeSlugPath } from "@/lib/utils";
import { upcomingTaxDeadlines } from "@/lib/tax-deadlines";
import type { BrainPage } from "@/lib/types";
import type { TaxDeadlineEntry } from "@/lib/tax-types";

interface TaxCockpitData {
  returns: BrainPage[];
  assessments: BrainPage[];
  audits: BrainPage[];
  deadlines: TaxDeadlineEntry[];
}

export function TaxWidgetBoard() {
  const { t, lang } = useLang();
  const [data, setData] = useState<TaxCockpitData>({
    returns: [],
    assessments: [],
    audits: [],
    deadlines: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [returns, assessments, audits] = await Promise.all([
        api.tax.returns.list({ limit: 200 }),
        api.tax.assessments.list({ limit: 200 }),
        api.tax.audits.list({ limit: 200 }),
      ]);
      setData({
        returns,
        assessments,
        audits,
        deadlines: upcomingTaxDeadlines(new Date(), 90),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.cockpit.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = lang === "en" ? "en-GB" : "de-DE";

  const recentItems = useMemo(() => {
    const all = [
      ...data.returns.map((p) => ({ type: "return" as const, page: p })),
      ...data.assessments.map((p) => ({ type: "assessment" as const, page: p })),
      ...data.audits.map((p) => ({ type: "audit" as const, page: p })),
    ];
    return all
      .sort((a, b) => new Date(b.page.updated_at).getTime() - new Date(a.page.updated_at).getTime())
      .slice(0, 5);
  }, [data]);

  const activeAudits = data.audits.filter((a) => {
    const fm = (a.frontmatter ?? {}) as Record<string, unknown>;
    return fm.phase !== "abgeschlossen";
  }).length;
  const openAssessments = data.assessments.filter((a) => {
    const fm = (a.frontmatter ?? {}) as Record<string, unknown>;
    return !fm.paid_date && !fm.contested;
  }).length;
  const pendingReturns = data.returns.filter((r) => {
    const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
    return fm.status === "draft" || fm.status === "in_progress";
  }).length;

  const overdue = data.deadlines.filter((d) => d.isOverdue);
  const urgent = data.deadlines.filter((d) => d.isUrgent && !d.isOverdue);
  const upcoming = data.deadlines.filter((d) => !d.isOverdue && !d.isUrgent);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ds-text-subtle)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("tax.cockpit.title")}
        </h2>
        {error && (
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <RotateCcw size={12} /> {t("tax.cockpit.retry")}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-600">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={FileText}
          href="/dashboard/tax-returns"
          label={t("tax.cockpit.stat_returns")}
          value={data.returns.length}
          sublabel={`${pendingReturns} ${t("tax.cockpit.stat_pending")}`}
        />
        <StatCard
          icon={FileCheck}
          href="/dashboard/tax-assessments"
          label={t("tax.cockpit.stat_assessments")}
          value={data.assessments.length}
          sublabel={`${openAssessments} ${t("tax.cockpit.stat_open")}`}
        />
        <StatCard
          icon={ClipboardCheck}
          href="/dashboard/tax-audit"
          label={t("tax.cockpit.stat_audits")}
          value={data.audits.length}
          sublabel={`${activeAudits} ${t("tax.cockpit.stat_active")}`}
        />
      </div>

      {/* Deadlines */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock size={16} className="text-[color:var(--brand-primary)]" />
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("tax.cockpit.deadlines_title")}
          </h3>
        </div>
        {[...overdue, ...urgent, ...upcoming].length === 0 ? (
          <p className="text-sm text-[color:var(--ds-text-subtle)]">{t("tax.deadlines.empty")}</p>
        ) : (
          <div className="space-y-2">
            {[...overdue, ...urgent, ...upcoming].slice(0, 5).map((d) => (
              <div
                key={d.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  d.isOverdue
                    ? "border-rose-500/20 bg-rose-500/5"
                    : d.isUrgent
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
                }`}
              >
                <span className="text-sm text-[color:var(--ds-text)]">{d.label}</span>
                <span
                  className={`text-xs ${
                    d.isOverdue
                      ? "text-rose-600"
                      : d.isUrgent
                        ? "text-amber-600"
                        : "text-[color:var(--ds-text-subtle)]"
                  }`}
                >
                  {new Date(d.dueDate).toLocaleDateString(locale, {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-right">
          <Link
            href="/dashboard/tax-deadlines"
            className="text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
          >
            {t("tax.deadlines.title")} →
          </Link>
        </div>
      </Card>

      {/* Recent items + Quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Search size={16} className="text-[color:var(--brand-primary)]" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("tax.cockpit.recent_title")}
            </h3>
          </div>
          {recentItems.length === 0 ? (
            <p className="text-sm text-[color:var(--ds-text-subtle)]">{t("tax.cockpit.empty")}</p>
          ) : (
            <div className="space-y-1">
              {recentItems.map(({ type, page }) => (
                <Link
                  key={page.slug}
                  href={`/dashboard/${type === "return" ? "tax-returns" : type === "assessment" ? "tax-assessments" : "tax-audit"}/${encodeSlugPath(page.slug)}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[color:var(--ds-hover)]"
                >
                  {type === "return" ? (
                    <FileText size={14} className="text-emerald-500" />
                  ) : type === "assessment" ? (
                    <FileCheck size={14} className="text-amber-500" />
                  ) : (
                    <ClipboardCheck size={14} className="text-rose-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--ds-text)]">
                    {page.title}
                  </span>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    {new Date(page.updated_at).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus size={16} className="text-[color:var(--brand-primary)]" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("tax.cockpit.quick_actions")}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Link href="/dashboard/tax-returns">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <FileText size={14} /> {t("tax.cockpit.new_return")}
              </Button>
            </Link>
            <Link href="/dashboard/tax-assessments">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <FileCheck size={14} /> {t("tax.cockpit.new_assessment")}
              </Button>
            </Link>
            <Link href="/dashboard/tax-audit">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <ClipboardCheck size={14} /> {t("tax.cockpit.new_audit")}
              </Button>
            </Link>
            <Link href="/dashboard/elster">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Send size={14} /> {t("tax.cockpit.new_elster")}
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  href,
  label,
  value,
  sublabel,
}: {
  icon: typeof FileText;
  href: string;
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-[color:var(--ds-hover)]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10">
          <Icon size={18} className="text-[color:var(--brand-primary)]" />
        </div>
        <div>
          <p className="text-lg font-semibold text-[color:var(--ds-text)]">{value}</p>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">{label}</p>
          {sublabel && <p className="text-[10px] text-[color:var(--ds-text-muted)]">{sublabel}</p>}
        </div>
      </Card>
    </Link>
  );
}
