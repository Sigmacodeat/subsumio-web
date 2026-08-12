"use client";

import Link from "next/link";
import {
  TrendingUp,
  BarChart3,
  FileBarChart,
  Activity,
  ChartNoAxesColumn,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";

const I18N: Record<string, { de: string; en: string }> = {
  title: { de: "Berichte & Insights", en: "Reports & Insights" },
  description: {
    de: "Alle Kennzahlen, Berichte und Analysen an einem Ort — Prozessergebnisse, Portfolio, Kanzlei-Reports und KI-Nutzung.",
    en: "All metrics, reports and analytics in one place — litigation outcomes, portfolio, firm reports and AI usage.",
  },
  litigation_analytics: { de: "Prozessanalyse", en: "Litigation Analytics" },
  litigation_analytics_desc: {
    de: "Gerichtsstatistiken, Erfolgsquoten, Richter-Analysen",
    en: "Court statistics, success rates, judge analytics",
  },
  portfolio_insights: { de: "Portfolio-Insights", en: "Portfolio Insights" },
  portfolio_insights_desc: {
    de: "Akten-Portfolio, Kennzahlen, Trends",
    en: "Case portfolio, KPIs, trends",
  },
  reports: { de: "Kanzlei-Berichte", en: "Firm Reports" },
  reports_desc: {
    de: "Umsatz, Auslastung, Produktivität der Kanzlei",
    en: "Revenue, utilization, firm productivity",
  },
  adoption: { de: "Nutzungs-Analyse", en: "Adoption Analytics" },
  adoption_desc: {
    de: "KI-Nutzung, Feature-Adoption, Team-Aktivität",
    en: "AI usage, feature adoption, team activity",
  },
  chat_analytics: { de: "Chat-Analytics", en: "Chat Analytics" },
  chat_analytics_desc: {
    de: "Copilot-Nutzung, Modellvergleich, Token-Verbrauch",
    en: "Copilot usage, model comparison, token consumption",
  },
};

function tr(key: string, lang: Lang): string {
  const entry = I18N[key];
  return entry ? (lang === "en" ? entry.en : entry.de) : key;
}

const CARDS = [
  {
    href: "/dashboard/litigation-analytics",
    icon: TrendingUp,
    titleKey: "litigation_analytics",
    descKey: "litigation_analytics_desc",
    color: "text-[color:var(--ds-info-text)]",
    bg: "bg-[color:var(--ds-info-bg)]",
    border: "border-[color:var(--ds-info-border)]",
  },
  {
    href: "/dashboard/portfolio-insights",
    icon: BarChart3,
    titleKey: "portfolio_insights",
    descKey: "portfolio_insights_desc",
    color: "text-violet-600",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  {
    href: "/dashboard/reports",
    icon: FileBarChart,
    titleKey: "reports",
    descKey: "reports_desc",
    color: "text-[color:var(--ds-success-text)]",
    bg: "bg-[color:var(--ds-success-bg)]",
    border: "border-[color:var(--ds-success-border)]",
  },
  {
    href: "/dashboard/adoption-analytics",
    icon: Activity,
    titleKey: "adoption",
    descKey: "adoption_desc",
    color: "text-[color:var(--ds-warning-text)]",
    bg: "bg-[color:var(--ds-warning-bg)]",
    border: "border-[color:var(--ds-warning-border)]",
  },
  {
    href: "/dashboard/chat/analytics",
    icon: ChartNoAxesColumn,
    titleKey: "chat_analytics",
    descKey: "chat_analytics_desc",
    color: "text-[color:var(--ds-danger-text)]",
    bg: "bg-[color:var(--ds-danger-bg)]",
    border: "border-[color:var(--ds-danger-border)]",
  },
];

export default function AnalyticsHubPage() {
  const { t, lang } = useLang();

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={tr("title", lang)}
        description={tr("description", lang)}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: tr("title", lang) },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className={`group flex items-start gap-4 rounded-xl border ${card.border} bg-[color:var(--ds-surface)] p-5 transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${card.bg}`}
              >
                <Icon size={20} className={card.color} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {tr(card.titleKey, lang)}
                  </h3>
                  <ArrowUpRight
                    size={14}
                    className="text-[color:var(--ds-text-subtle)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                  {tr(card.descKey, lang)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
