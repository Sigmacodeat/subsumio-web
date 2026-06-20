"use client";

// Billing & plan management. Talks to /api/auth/me and /api/billing/checkout.
// Shows an honest "not configured" state until Stripe env vars are set.

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Check, ArrowRight, AlertTriangle, Sparkles, Gift, Gauge, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BILLING_PLANS_DISPLAY } from "@/lib/billing/plans";
import { useMe } from "@/lib/queries/auth";
import { useUsage, useCheckout } from "@/lib/queries/settings";
import { useBrainStats } from "@/lib/queries/brain";
import { PageHeader } from "@/components/dashboard/page-header";

interface Usage {
  month: string;
  queries: number;
  plan: string;
  limits: { pages: number; queriesPerMonth: number; seats: number };
  shared: boolean;
}

/** Fair-use meter — the "live usage display" the pricing page promises. */
function UsageCard() {
  const usageQuery = useUsage();
  const statsQuery = useBrainStats();

  const usage = (usageQuery.data ?? null) as Usage | null;
  const stats = statsQuery.data ? { total_pages: statsQuery.data.total_pages } : null;

  if (!usage) return null;

  const rows = [
    { label: `Queries (${usage.month})`, used: usage.queries, max: usage.limits.queriesPerMonth },
    ...(stats ? [{ label: "Seiten im Brain", used: stats.total_pages, max: usage.limits.pages }] : []),
  ];

  return (
    <Card>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Gauge size={16} className="brand-text" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Verbrauch (Fair Use)</h2>
          </div>
          {usage.shared && <Badge>Team-Pool</Badge>}
        </div>
        {rows.map((row) => {
          const pct = Math.min(100, Math.round((row.used / row.max) * 100));
          const warn = pct >= 80;
          return (
            <div key={row.label}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-[color:var(--ds-text-muted)]">{row.label}</span>
                <span className={`text-xs font-mono ${warn ? "text-amber-600" : "text-[color:var(--ds-text-muted)]"}`}>
                  {row.used.toLocaleString("de-DE")} / {row.max.toLocaleString("de-DE")}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full bg-[color:var(--ds-border)] overflow-hidden"
                role="progressbar"
                aria-valuenow={row.used}
                aria-valuemin={0}
                aria-valuemax={row.max}
                aria-label={row.label}
              >
                <div
                  className={`h-full rounded-full transition-all ${warn ? "bg-amber-500" : "brand-soft"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        <p className="text-xs text-[color:var(--ds-text-muted)] leading-relaxed">
          Fair Use heißt: Beim Erreichen des Limits drosseln wir nicht still und es gibt keine
          Überraschungsrechnung — wir melden uns und besprechen das passende Paket.
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
      setNotice(data?.message ?? "Checkout fehlgeschlagen. Bitte erneut versuchen.");
    } catch {
      setNotice("Netzwerkfehler. Bitte erneut versuchen.");
    }
    setBusy(null);
  }

  async function openPortal() {
    setBusy("portal");
    setNotice(null);
    try {
      const csrfToken = document.cookie.match(/sb_csrf=([^;]+)/)?.[1] ?? "";
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setNotice(data?.error ?? "Portal konnte nicht geöffnet werden.");
    } catch {
      setNotice("Netzwerkfehler. Bitte erneut versuchen.");
    }
    setBusy(null);
  }

  const currentPlan = me?.user?.plan ?? "free";

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Abrechnung"
        description="Plan, Zahlung und Empfehlungs-Guthaben"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Abrechnung" }]}
      />

      {status === "success" && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <Sparkles size={16} className="text-emerald-600" />
          <p className="text-sm text-emerald-700">Zahlung erfolgreich — dein Plan wird in Kürze aktualisiert.</p>
        </div>
      )}
      {status === "cancelled" && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle size={16} className="text-amber-600" />
          <p className="text-sm text-amber-700">Checkout abgebrochen — dein bisheriger Plan bleibt aktiv.</p>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-500/10">
          <CreditCard size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">{notice}</p>
        </div>
      )}

      <UsageCard />

      {/* Current plan */}
      <Card>
        <div className="p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-1">Aktueller Plan</p>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-[color:var(--ds-text)] capitalize">{currentPlan}</span>
              <Badge variant={currentPlan === "free" ? "default" : "accent"}>
                {currentPlan === "free" ? "Kostenlos" : "Aktiv"}
              </Badge>
            </div>
            {me?.user && <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">{me.user.email}</p>}
            {me?.user?.stripeCustomerId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                loading={busy === "portal"}
                onClick={openPortal}
              >
                <Settings size={14} /> Plan verwalten
              </Button>
            )}
          </div>
          {typeof me?.referrals === "number" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <Gift size={16} className="text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-[color:var(--ds-text)]">{me.referrals} Empfehlung{me.referrals === 1 ? "" : "en"}</p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">= {me.referrals} Gratismonat{me.referrals === 1 ? "" : "e"} verdient</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Plans */}
      <div className="grid md:grid-cols-3 gap-4">
        {BILLING_PLANS_DISPLAY.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={`p-6 rounded-2xl border flex flex-col ${
                plan.highlight && !isCurrent
                  ? "brand-border bg-gradient-to-b from-[color:var(--brand-primary)]/10 to-[color:var(--ds-surface)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-[color:var(--ds-text-muted)]">{plan.name}</p>
                {isCurrent && <Badge variant="success">Aktiv</Badge>}
              </div>
              <p className="text-2xl font-bold text-[color:var(--ds-text)] mb-4">{plan.price}</p>
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[color:var(--ds-text-muted)]">
                    <Check size={13} className="brand-text shrink-0 mt-0.5" />
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
                  Upgrade <ArrowRight size={13} />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[color:var(--ds-text-muted)]">
        Enterprise (EU-/On-Prem-Hosting, AVV, SSO)?{" "}
        <a href="mailto:hello@subsum.eu" className="brand-text hover:underline">Sprich mit uns</a>.
        Jahreszahlung −20 % — im Checkout wählbar.
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
