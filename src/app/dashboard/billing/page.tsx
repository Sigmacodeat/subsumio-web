"use client";

// Billing & plan management. Talks to /api/auth/me and /api/billing/checkout.
// Shows an honest "not configured" state until Stripe env vars are set.

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Check,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Gift,
  Gauge,
  Settings,
  Cpu,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BILLING_PLANS_DISPLAY } from "@/lib/billing/plans";
import { useMe } from "@/lib/queries/auth";
import { useUsage, useCheckout } from "@/lib/queries/settings";
import { useBrainStats } from "@/lib/queries/brain";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { getModelById, formatCost } from "@/lib/model-config";
import { csrfFetch } from "@/lib/csrf";

interface ModelBreakdownRow {
  modelId: string;
  queries: number;
  inputTokens: number;
  outputTokens: number;
}

interface Usage {
  month: string;
  queries: number;
  plan: string;
  limits: { pages: number; queriesPerMonth: number; seats: number };
  shared: boolean;
  modelBreakdown?: ModelBreakdownRow[];
}

/** Fair-use meter — the "live usage display" the pricing page promises. */
function UsageCard() {
  const { t } = useLang();
  const usageQuery = useUsage();
  const statsQuery = useBrainStats();

  const usage = (usageQuery.data ?? null) as Usage | null;
  const stats = statsQuery.data ? { total_pages: statsQuery.data.total_pages } : null;

  if (!usage) return null;

  const rows = [
    { label: `Queries (${usage.month})`, used: usage.queries, max: usage.limits.queriesPerMonth },
    ...(stats
      ? [{ label: t("billing.pages_in_brain"), used: stats.total_pages, max: usage.limits.pages }]
      : []),
  ];

  return (
    <Card>
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Gauge size={16} className="brand-text" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("billing.usage_title")}
            </h2>
          </div>
          {usage.shared && <Badge>{t("billing.team_pool")}</Badge>}
        </div>
        {rows.map((row) => {
          const pct = Math.min(100, Math.round((row.used / row.max) * 100));
          const warn = pct >= 80;
          return (
            <div key={row.label}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs text-[color:var(--ds-text-muted)]">{row.label}</span>
                <span
                  className={`font-mono text-xs ${warn ? "text-amber-600" : "text-[color:var(--ds-text-muted)]"}`}
                >
                  {row.used.toLocaleString("de-DE")} / {row.max.toLocaleString("de-DE")}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                role="progressbar"
                aria-valuenow={row.used}
                aria-valuemin={0}
                aria-valuemax={row.max}
                aria-label={row.label}
              >
                <div
                  className={`h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${warn ? "bg-amber-500" : "brand-soft"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          {t("billing.fair_use_note")}
        </p>
      </div>
    </Card>
  );
}

/** Per-model usage breakdown — shows which models the brain used this month. */
function ModelBreakdownCard() {
  const { t } = useLang();
  const usageQuery = useUsage();
  const usage = (usageQuery.data ?? null) as Usage | null;
  if (!usage?.modelBreakdown?.length) return null;

  const totalQueries = usage.modelBreakdown.reduce((sum, r) => sum + r.queries, 0);

  return (
    <Card>
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="brand-text" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("billing.model_usage")} ({usage.month})
            </h2>
          </div>
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {totalQueries.toLocaleString("de-DE")} {t("billing.queries_total")}
          </span>
        </div>
        <div className="space-y-3">
          {usage.modelBreakdown.map((row) => {
            const model = getModelById(row.modelId);
            const pct = totalQueries > 0 ? Math.round((row.queries / totalQueries) * 100) : 0;
            const modelName = model?.name ?? row.modelId;
            const provider = model ? model.provider : "—";
            const estCostUsd = model
              ? (row.inputTokens / 1_000_000) * model.costPer1MInput +
                (row.outputTokens / 1_000_000) * model.costPer1MOutput
              : 0;
            return (
              <div key={row.modelId}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      {modelName}
                    </span>
                    <span className="text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      {provider}
                    </span>
                    {model?.dataResidency === "eu" && (
                      <span className="text-xs font-medium text-emerald-600">EU</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs text-[color:var(--ds-text-muted)]">
                    <span>
                      {row.queries.toLocaleString("de-DE")} {t("billing.queries")}
                    </span>
                    {estCostUsd > 0 && (
                      <span className="flex items-center gap-1" title={t("billing.token_cost_est")}>
                        <TrendingUp size={9} />~{formatCost(estCostUsd)}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                  role="progressbar"
                  aria-valuenow={row.queries}
                  aria-valuemin={0}
                  aria-valuemax={totalQueries}
                  aria-label={`${modelName} usage`}
                >
                  <div
                    className="brand-soft h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                  <span>{Math.round(row.inputTokens / 1000).toLocaleString("de-DE")}K in</span>
                  <span>{Math.round(row.outputTokens / 1000).toLocaleString("de-DE")}K out</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          {t("billing.token_note")}
        </p>
      </div>
    </Card>
  );
}

interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    plan: string;
    referralCode: string;
    stripeCustomerId?: string | null;
  } | null;
  referrals?: number;
}

function BillingInner() {
  const { t } = useLang();
  const params = useSearchParams();
  const status = params.get("status");
  const meQuery = useMe();
  const checkoutMutation = useCheckout();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  const me = (meQuery.data ?? { user: null }) as Me;

  // Auto-start checkout when arriving from a pricing-tier CTA
  // (/dashboard/billing?checkout=pro|team), once the session is loaded.
  useEffect(() => {
    if (!me?.user || autoTriggered.current) return;
    const checkout = params.get("checkout");
    if ((checkout === "pro" || checkout === "team") && me.user.plan !== checkout) {
      autoTriggered.current = true;
      void upgrade(checkout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, params]);

  async function upgrade(plan: string) {
    setBusy(plan);
    setNotice(null);
    try {
      const data = await checkoutMutation.mutateAsync(plan);
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      setNotice(data?.message ?? t("billing.checkout_failed"));
    } catch {
      setNotice(t("billing.network_error"));
    }
    setBusy(null);
  }

  async function openPortal() {
    setBusy("portal");
    setNotice(null);
    try {
      const res = await csrfFetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setNotice(data?.error ?? t("billing.portal_failed"));
    } catch {
      setNotice(t("billing.network_error"));
    }
    setBusy(null);
  }

  const currentPlan = me?.user?.plan ?? "free";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("billing.title")}
        description={t("billing.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("billing.breadcrumb") },
        ]}
      />

      {status === "success" && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <Sparkles size={16} className="text-emerald-600" />
          <p className="text-sm text-emerald-700">{t("billing.success")}</p>
        </div>
      )}
      {status === "cancelled" && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle size={16} className="text-amber-600" />
          <p className="text-sm text-amber-700">{t("billing.cancelled")}</p>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
          <CreditCard size={16} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-sm text-blue-700">{notice}</p>
        </div>
      )}

      <UsageCard />
      <ModelBreakdownCard />

      {/* Current plan */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="mb-1 text-xs tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              {t("billing.current_plan")}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-[color:var(--ds-text)] capitalize">
                {currentPlan}
              </span>
              <Badge variant={currentPlan === "free" ? "default" : "accent"}>
                {currentPlan === "free" ? t("billing.free") : t("billing.active")}
              </Badge>
            </div>
            {me?.user && (
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{me.user.email}</p>
            )}
            {me?.user?.stripeCustomerId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                loading={busy === "portal"}
                onClick={openPortal}
              >
                <Settings size={14} /> {t("billing.manage_plan")}
              </Button>
            )}
          </div>
          {typeof me?.referrals === "number" && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <Gift size={16} className="text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {me.referrals}{" "}
                  {me.referrals === 1 ? t("billing.referrals") : t("billing.referrals_plural")}
                </p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  = {me.referrals}{" "}
                  {me.referrals === 1 ? t("billing.free_months") : t("billing.free_months_plural")}{" "}
                  {t("billing.free_months_earned")}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Plans */}
      <div className="grid gap-4 md:grid-cols-3">
        {BILLING_PLANS_DISPLAY.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border p-6 ${
                plan.highlight && !isCurrent
                  ? "brand-border bg-gradient-to-b from-[color:var(--brand-primary)]/10 to-[color:var(--ds-surface)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium text-[color:var(--ds-text-muted)]">{plan.name}</p>
                {isCurrent && <Badge variant="success">{t("billing.active")}</Badge>}
              </div>
              <p className="mb-4 text-2xl font-bold text-[color:var(--ds-text)]">{plan.price}</p>
              <ul className="mb-6 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-xs text-[color:var(--ds-text-muted)]"
                  >
                    <Check size={13} className="brand-text mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.id !== "free" && !isCurrent && (
                <Button
                  variant={plan.highlight ? "glow" : "secondary"}
                  size="md"
                  className="w-full"
                  loading={busy === plan.id}
                  onClick={() => upgrade(plan.id)}
                >
                  {t("billing.upgrade")} <ArrowRight size={13} />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[color:var(--ds-text-muted)]">
        {t("billing.enterprise_q")}{" "}
        <a href="mailto:hello@subsum.eu" className="brand-text hover:underline">
          {t("billing.contact_us")}
        </a>
        . {t("billing.annual_note")}
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-6" />}>
      <BillingInner />
    </Suspense>
  );
}
