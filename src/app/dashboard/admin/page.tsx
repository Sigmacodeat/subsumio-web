// SaaS admin overview — stats, sales leads, audit trail.
// Server component; layout.tsx already gates this to role=admin.

import Link from "next/link";
import {
  Users,
  CreditCard,
  Gift,
  MessageSquare,
  ClipboardList,
  ArrowRight,
  Scale,
  Calculator,
  Mail,
  Database,
  Activity,
  ToggleRight,
  MessageCircle,
  ShieldCheck,
  Brain,
  HardDrive,
  FileSearch,
  GitBranch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getStore } from "@/lib/auth/store";
import { listMarketingLeads } from "@/lib/marketing/leads";
import { BILLABLE_PLANS } from "@/lib/billing/plans";
import { StatCard, PlanBadge } from "@/components/admin/admin-stat-card";
import AuditTrail from "@/components/admin/audit-trail";
import { SecretaryGateCard } from "@/components/admin/secretary-gate-card";
import { CreditsHealthCard } from "@/components/admin/credits-health-card";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params?.tab || "overview";

  const users = await getStore().list();
  const leads = await listMarketingLeads();
  const active = users.filter((u) => !u.deactivatedAt);
  const paying = users.filter((u) => u.plan !== "free" && !u.deactivatedAt);
  const referred = users.filter((u) => u.referredBy);

  const mrr = paying.reduce((sum, u) => {
    const plan = BILLABLE_PLANS[u.plan as "pro" | "team"];
    return sum + (plan?.monthlyEur ?? 0);
  }, 0);

  const referralCounts = new Map<string, number>();
  for (const u of referred) {
    referralCounts.set(u.referredBy!, (referralCounts.get(u.referredBy!) ?? 0) + 1);
  }

  const byCode = new Map(users.map((u) => [u.referralCode, u] as const));
  const indirectCounts = new Map<string, number>();
  let level2Total = 0;
  for (const u of referred) {
    const directReferrer = byCode.get(u.referredBy!);
    if (directReferrer?.referredBy) {
      indirectCounts.set(
        directReferrer.referredBy,
        (indirectCounts.get(directReferrer.referredBy) ?? 0) + 1
      );
      level2Total++;
    }
  }

  const planBreakdown = {
    free: users.filter((u) => u.plan === "free").length,
    pro: users.filter((u) => u.plan === "pro").length,
    team: users.filter((u) => u.plan === "team").length,
    enterprise: users.filter((u) => u.plan === "enterprise").length,
  };

  const industryBreakdown = {
    legal: users.filter((u) => u.industry === "legal").length,
    tax: users.filter((u) => u.industry === "tax").length,
    other: users.filter((u) => u.industry === "other").length,
    none: users.filter((u) => !u.industry).length,
  };

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Admin Dashboard"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Übersicht" },
        ]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={Users}
          label="Kunden gesamt"
          value={users.length}
          hint={`${active.length} aktiv`}
        />
        <StatCard icon={CreditCard} label="Zahlende Kunden" value={paying.length} />
        <StatCard icon={CreditCard} label="MRR" value={`${mrr.toLocaleString("de-DE")} €`} />
        <StatCard
          icon={Gift}
          label="Über Empfehlung"
          value={referred.length}
          hint={`${level2Total} Ebene 2`}
        />
      </div>

      {/* Provider Credits Health — live status widget */}
      <CreditsHealthCard />

      {/* Plan distribution + Industry breakdown + Quick links */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">
            Plan-Verteilung
          </h2>
          <div className="space-y-3">
            {(["free", "pro", "team", "enterprise"] as const).map((p) => (
              <div key={p} className="flex items-center justify-between">
                <PlanBadge plan={p} />
                <span className="text-sm font-medium text-[color:var(--ds-text)]">
                  {planBreakdown[p]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">Produkte</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[color:var(--ds-info-text)]">
                <Scale size={14} /> Subsumio Legal
              </span>
              <span className="text-sm font-medium text-[color:var(--ds-text)]">
                {industryBreakdown.legal}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[color:var(--ds-success-text)]">
                <Calculator size={14} /> Taxumio
              </span>
              <span className="text-sm font-medium text-[color:var(--ds-text)]">
                {industryBreakdown.tax}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[color:var(--ds-category-violet-text)]">
                <Users size={14} /> Other
              </span>
              <span className="text-sm font-medium text-[color:var(--ds-text)]">
                {industryBreakdown.other}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[color:var(--ds-text-subtle)]">
                <Users size={14} /> Ohne Branche
              </span>
              <span className="text-sm font-medium text-[color:var(--ds-text)]">
                {industryBreakdown.none}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">Schnellzugriff</h2>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                Kanzlei-Operationen
              </p>
              <div className="grid grid-cols-2 gap-3">
                <QuickLink
                  href="/dashboard/operations"
                  icon={Activity}
                  label="Operations-Cockpit"
                />
                <QuickLink href="/dashboard/admin/users" icon={Users} label="Kunden verwalten" />
                <QuickLink href="/dashboard/admin/mailbox" icon={Mail} label="Mailbox" />
                <QuickLink
                  href="/dashboard/admin/feature-flags"
                  icon={ToggleRight}
                  label="Feature Flags"
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                AI-Qualität &amp; Pipeline
              </p>
              <div className="grid grid-cols-2 gap-3">
                <QuickLink
                  href="/dashboard/admin/pipeline"
                  icon={GitBranch}
                  label="Pipeline-Monitor"
                />
                <QuickLink
                  href="/dashboard/admin/rag-optimizer"
                  icon={Scale}
                  label="AI Eval &amp; RAG"
                />
                <QuickLink
                  href="/dashboard/admin/guardrails"
                  icon={ShieldCheck}
                  label="Guardrails"
                />
                <QuickLink
                  href="/dashboard/admin/decision-records"
                  icon={FileSearch}
                  label="Decision Records"
                />
                <QuickLink href="/dashboard/admin/dissensus" icon={Brain} label="Dissensus" />
                <QuickLink
                  href="/dashboard/admin/token-usage"
                  icon={Activity}
                  label="Token-Usage"
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                Compliance &amp; System
              </p>
              <div className="grid grid-cols-2 gap-3">
                <QuickLink href="/dashboard/admin/slo" icon={Activity} label="SLO-Monitoring" />
                <QuickLink
                  href="/dashboard/admin/compliance-export"
                  icon={Database}
                  label="Compliance Export"
                />
                <QuickLink href="/dashboard/admin/backup" icon={HardDrive} label="Backup" />
                <QuickLink
                  href="/dashboard/admin/dr"
                  icon={ShieldCheck}
                  label="Disaster Recovery"
                />
                <QuickLink
                  href="/dashboard/admin/feedback-triage"
                  icon={MessageCircle}
                  label="Feedback"
                />
                <QuickLink
                  href="/dashboard/admin/corpus"
                  icon={Database}
                  label="Corpus &amp; Chunks"
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                Vertrieb &amp; Audit
              </p>
              <div className="grid grid-cols-2 gap-3">
                <QuickLink
                  href="/dashboard/admin?tab=leads"
                  icon={MessageSquare}
                  label="Sales-Leads"
                />
                <QuickLink
                  href="/dashboard/admin?tab=audit"
                  icon={ClipboardList}
                  label="Audit-Trail"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secretary compliance gate */}
      <SecretaryGateCard />

      {/* Tab content */}
      {tab === "audit" ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Audit-Trail</h2>
          <AuditTrail />
        </div>
      ) : tab === "leads" ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            Sales-Leads aus dem Product Advisor
          </h2>
          <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <div className="divide-y divide-[color:var(--ds-border)]">
              {leads.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-[color:var(--ds-text-subtle)]">
                  Noch keine gespeicherten Advisor-Leads.
                </div>
              )}
              {leads.map((lead) => (
                <div key={lead.id} className="p-5 hover:bg-[color:var(--ds-surface-hover)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                          {lead.email}
                        </h3>
                        <span className="brand-border brand-soft rounded-full border px-2 py-0.5 text-xs text-[color:var(--ds-category-violet-text)]">
                          {lead.product} · {lead.plan}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            lead.leadScore === "enterprise"
                              ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                              : lead.leadScore === "high"
                                ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                                : "border-[color:var(--ds-border-hover)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]"
                          }`}
                        >
                          {lead.leadScore}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                        {lead.createdAt.slice(0, 16).replace("T", " ")} · {lead.path}
                      </p>
                    </div>
                    <div className="text-right text-xs text-[color:var(--ds-text-subtle)]">
                      Mail: {lead.notified.email ? "sent" : "not configured"} · Slack:{" "}
                      {lead.notified.slack ? "sent" : "off"}
                    </div>
                  </div>
                  <pre className="mt-4 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                    {lead.summary}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Neueste Kunden</h2>
            <Link
              href="/dashboard/admin/users"
              className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:[color:var(--brand-primary)]"
            >
              Alle anzeigen <ArrowRight size={12} />
            </Link>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">E-Mail</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Rolle</th>
                  <th className="px-5 py-3 font-medium">Registriert</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-[color:var(--ds-text-subtle)]"
                    >
                      Noch keine Kunden.
                    </td>
                  </tr>
                )}
                {users
                  .slice(-5)
                  .reverse()
                  .map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-[color:var(--ds-border)]/50 last:border-0 hover:bg-[color:var(--ds-surface-hover)]"
                    >
                      <td className="px-5 py-3 font-medium text-[color:var(--ds-text)]">
                        {u.name}
                      </td>
                      <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">{u.email}</td>
                      <td className="px-5 py-3">
                        <PlanBadge plan={u.plan} />
                      </td>
                      <td className="px-5 py-3 text-[color:var(--ds-text-muted)] capitalize">
                        {u.role}
                      </td>
                      <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                        {u.createdAt.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg border border-[color:var(--ds-border)] px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-colors hover:[border-color:var(--brand-primary)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)]"
    >
      <Icon size={15} className="shrink-0" />
      {label}
    </Link>
  );
}
