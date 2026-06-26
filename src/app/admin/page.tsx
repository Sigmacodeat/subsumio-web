// SaaS admin overview — stats, sales leads, audit trail.
// Server component; layout.tsx already gates this to role=admin.

import Link from "next/link";
import { Users, CreditCard, Gift, MessageSquare, ClipboardList, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getStore } from "@/lib/auth/store";
import { listMarketingLeads } from "@/lib/marketing/leads";
import { BILLABLE_PLANS } from "@/lib/billing/plans";
import { StatCard, PlanBadge } from "@/components/admin/admin-stat-card";
import AuditTrail from "@/components/admin/audit-trail";

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold [color:var(--mk-text)]">Dashboard</h1>
        <p className="text-sm [color:var(--mk-text-muted)]">
          Überblick über Kunden, Umsatz und Empfehlungen
        </p>
      </div>

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

      {/* Plan distribution + Quick links */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border [border-color:var(--mk-border)] p-5 [background:var(--mk-surface)] lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold [color:var(--mk-text)]">Plan-Verteilung</h2>
          <div className="space-y-3">
            {(["free", "pro", "team", "enterprise"] as const).map((p) => (
              <div key={p} className="flex items-center justify-between">
                <PlanBadge plan={p} />
                <span className="text-sm font-medium [color:var(--mk-text)]">
                  {planBreakdown[p]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border [border-color:var(--mk-border)] p-5 [background:var(--mk-surface)] lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold [color:var(--mk-text)]">Schnellzugriff</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <QuickLink href="/admin/users" icon={Users} label="Kunden verwalten" />
            <QuickLink href="/admin?tab=leads" icon={MessageSquare} label="Sales-Leads" />
            <QuickLink href="/admin?tab=audit" icon={ClipboardList} label="Audit-Trail" />
            <QuickLink href="/admin/mailbox" icon={MessageSquare} label="Mailbox" />
            <QuickLink href="/admin/system" icon={CreditCard} label="System-Health" />
            <QuickLink href="/admin/config" icon={CreditCard} label="Konfiguration" />
          </div>
        </div>
      </div>

      {/* Tab content */}
      {tab === "audit" ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold [color:var(--mk-text)]">Audit-Trail</h2>
          <AuditTrail />
        </div>
      ) : tab === "leads" ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold [color:var(--mk-text)]">
            Sales-Leads aus dem Product Advisor
          </h2>
          <div className="overflow-hidden rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
            <div className="divide-y divide-[color:var(--mk-border)]">
              {leads.length === 0 && (
                <div className="px-5 py-10 text-center text-sm [color:var(--mk-text-subtle)]">
                  Noch keine gespeicherten Advisor-Leads.
                </div>
              )}
              {leads.map((lead) => (
                <div key={lead.id} className="p-5 hover:[background:var(--mk-surface)]/45">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                          {lead.email}
                        </h3>
                        <span className="brand-border brand-soft rounded-full border px-2 py-0.5 text-xs text-violet-300">
                          {lead.product} · {lead.plan}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            lead.leadScore === "enterprise"
                              ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                              : lead.leadScore === "high"
                                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                : "[border-color:var(--mk-border-strong)] [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]"
                          }`}
                        >
                          {lead.leadScore}
                        </span>
                      </div>
                      <p className="mt-1 text-xs [color:var(--mk-text-subtle)]">
                        {lead.createdAt.slice(0, 16).replace("T", " ")} · {lead.path}
                      </p>
                    </div>
                    <div className="text-right text-xs [color:var(--mk-text-subtle)]">
                      Mail: {lead.notified.email ? "sent" : "not configured"} · Slack:{" "}
                      {lead.notified.slack ? "sent" : "off"}
                    </div>
                  </div>
                  <pre className="mt-4 rounded-lg border [border-color:var(--mk-border)] p-3 text-xs leading-relaxed whitespace-pre-wrap [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]">
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
            <h2 className="text-sm font-semibold [color:var(--mk-text)]">Neueste Kunden</h2>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-xs [color:var(--mk-text-muted)] hover:[color:var(--brand-primary)]"
            >
              Alle anzeigen <ArrowRight size={12} />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b [border-color:var(--mk-border)] text-left text-xs tracking-wider [color:var(--mk-text-subtle)] uppercase">
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
                        className="px-5 py-10 text-center [color:var(--mk-text-subtle)]"
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
                        className="border-b [border-color:var(--mk-border)]/50 last:border-0 hover:[background:var(--mk-surface)]/50"
                      >
                        <td className="px-5 py-3 font-medium [color:var(--mk-text)]">{u.name}</td>
                        <td className="px-5 py-3 [color:var(--mk-text-muted)]">{u.email}</td>
                        <td className="px-5 py-3">
                          <PlanBadge plan={u.plan} />
                        </td>
                        <td className="px-5 py-3 [color:var(--mk-text-muted)] capitalize">
                          {u.role}
                        </td>
                        <td className="px-5 py-3 text-xs [color:var(--mk-text-subtle)]">
                          {u.createdAt.slice(0, 10)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
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
      className="flex items-center gap-2.5 rounded-lg border [border-color:var(--mk-border)] px-3 py-2.5 text-sm [color:var(--mk-text-muted)] transition-colors hover:[border-color:var(--brand-primary)] hover:[color:var(--mk-text)] hover:[background:var(--mk-surface-2)]"
    >
      <Icon size={15} className="shrink-0" />
      {label}
    </Link>
  );
}
