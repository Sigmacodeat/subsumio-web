// Betreiber-Konsole — Übersicht über alle Kanzleien und Kunden.
// Server component; ops/layout.tsx gates this to platform operators.
//
// Zeigt nur Verwaltungs-Metadaten (Pläne, Mitglieder, Umsatz). Akten- und
// Mandanteninhalte gehören nie in die Betreiber-Konsole.

import Link from "next/link";
import { Building2, Users, CreditCard, Gift, ArrowRight } from "lucide-react";
import { getOrgStore, getStore } from "@/lib/auth/store";
import { BILLABLE_PLANS } from "@/lib/billing/plans";
import { StatCard, PlanBadge } from "@/components/admin/admin-stat-card";
import { CreditsHealthCard } from "@/components/admin/credits-health-card";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata = { title: "Betreiber-Konsole" };
export const dynamic = "force-dynamic";

export default async function OpsOverviewPage() {
  const [users, orgs] = await Promise.all([getStore().list(), getOrgStore().list()]);
  const active = users.filter((u) => !u.deactivatedAt);
  const paying = active.filter((u) => u.plan !== "free");
  const referred = users.filter((u) => u.referredBy);
  const withoutFirm = active.filter((u) => !u.orgId);

  const mrr = paying.reduce((sum, u) => {
    const plan = BILLABLE_PLANS[u.plan as "pro" | "team"];
    return sum + (plan?.monthlyEur ?? 0);
  }, 0);

  const planBreakdown = {
    free: users.filter((u) => u.plan === "free").length,
    pro: users.filter((u) => u.plan === "pro").length,
    team: users.filter((u) => u.plan === "team").length,
    enterprise: users.filter((u) => u.plan === "enterprise").length,
  };

  const newestFirms = [...orgs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const membersByOrg = new Map<string, number>();
  for (const u of active) {
    if (u.orgId) membersByOrg.set(u.orgId, (membersByOrg.get(u.orgId) ?? 0) + 1);
  }

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader title="Übersicht" breadcrumbs={[{ label: "Betreiber-Konsole" }]} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Building2} label="Kanzleien" value={orgs.length} />
        <StatCard
          icon={Users}
          label="Nutzer"
          value={users.length}
          hint={`${active.length} aktiv · ${withoutFirm.length} ohne Kanzlei`}
        />
        <StatCard
          icon={CreditCard}
          label="MRR"
          value={`${mrr.toLocaleString("de-DE")} €`}
          hint={`${paying.length} zahlend`}
        />
        <StatCard icon={Gift} label="Über Empfehlung" value={referred.length} />
      </div>

      <CreditsHealthCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
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
        </section>

        <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Neueste Kanzleien</h2>
            <Link
              href="/ops/kanzleien"
              className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
            >
              Alle Kanzleien <ArrowRight size={12} />
            </Link>
          </div>
          {newestFirms.length === 0 ? (
            <p className="py-6 text-center text-sm text-[color:var(--ds-text-subtle)]">
              Noch keine Kanzleien angelegt.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--ds-border)]">
              {newestFirms.map((org) => (
                <li key={org.id} className="flex items-center justify-between py-2.5">
                  <Link
                    href={`/ops/kanzleien/${org.id}`}
                    className="text-sm font-medium text-[color:var(--ds-text)] hover:[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                  >
                    {org.name}
                  </Link>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    {membersByOrg.get(org.id) ?? 0} Mitglieder · seit {org.createdAt.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
