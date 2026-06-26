"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, Briefcase } from "lucide-react";
import { usePages } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import type { BrainPage } from "@/lib/types";

interface MonthlyData {
  month: string;
  revenue: number;
  cases: number;
  hours: number;
}

export function KanzleiInsights() {
  const { lang } = useLang();
  const { data: invoicePages } = usePages({ type: "invoice", limit: 200 });
  const { data: casePages } = usePages({ type: "legal_case", limit: 200 });

  const chartData = useMemo<MonthlyData[]>(() => {
    const months: Record<string, MonthlyData> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { month: "short" });
      months[key] = { month: key, revenue: 0, cases: 0, hours: 0 };
    }

    (invoicePages ?? []).forEach((page: BrainPage) => {
      const fm = page.frontmatter as Record<string, unknown>;
      const total = typeof fm.total === "number" ? fm.total : 0;
      const date = typeof fm.date === "string" ? fm.date : page.created_at;
      if (date) {
        const d = new Date(date);
        const key = d.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { month: "short" });
        if (months[key]) {
          months[key].revenue += total;
        }
      }
    });

    (casePages ?? []).forEach((page: BrainPage) => {
      const date = page.created_at;
      if (date) {
        const d = new Date(date);
        const key = d.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { month: "short" });
        if (months[key]) {
          months[key].cases += 1;
        }
      }
    });

    return Object.values(months);
  }, [invoicePages, casePages, lang]);

  const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
  const totalCases = chartData.reduce((sum, d) => sum + d.cases, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp size={15} className="text-[color:var(--brand-secondary)]" />
        <h3 className="text-[13px] font-semibold text-[color:var(--ds-text)]">
          {lang === "en" ? "Firm Insights" : "Kanzlei-Insights"}
        </h3>
        <span className="text-[11px] text-[color:var(--ds-text-subtle)]">
          {lang === "en" ? "Last 6 months" : "Letzte 6 Monate"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Revenue Chart */}
        <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={13} className="text-[color:var(--ds-text-muted)]" />
              <span className="text-[11px] font-medium text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "Revenue" : "Umsatz"}
              </span>
            </div>
            <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
              {totalRevenue.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "var(--ds-text-subtle)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--ds-text-subtle)" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--ds-surface)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
                labelStyle={{ color: "var(--ds-text)" }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--brand-primary)"
                strokeWidth={2}
                fill="url(#revGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cases Chart */}
        <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Briefcase size={13} className="text-[color:var(--ds-text-muted)]" />
              <span className="text-[11px] font-medium text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "New Cases" : "Neue Akten"}
              </span>
            </div>
            <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
              {totalCases}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "var(--ds-text-subtle)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--ds-text-subtle)" }}
                axisLine={false}
                tickLine={false}
                width={20}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--ds-surface)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
                labelStyle={{ color: "var(--ds-text)" }}
              />
              <Bar
                dataKey="cases"
                fill="var(--brand-secondary)"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
