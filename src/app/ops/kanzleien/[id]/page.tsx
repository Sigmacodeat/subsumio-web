import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Coins, ShieldCheck, Users } from "lucide-react";
import { getOrgStore, getStore } from "@/lib/auth/store";
import { checkSpendCap, getBalance } from "@/lib/billing/credits";
import { listSupportSessionsForOrg } from "@/lib/support-session";
import { StatCard, PlanBadge } from "@/components/admin/admin-stat-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { SpendCapForm } from "@/components/ops/spend-cap-form";
import { SupportSessionPanel } from "@/components/ops/support-session-panel";

export const metadata = { title: "Kanzlei" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  lawyer: "Anwalt",
  assistant: "Assistenz",
  client_viewer: "Mandant (lesend)",
};

export default async function OpsFirmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getOrgStore().getById(id);
  if (!org) notFound();

  const [members, balance, spend, supportSessions] = await Promise.all([
    getStore().listByOrg(org.id),
    getBalance(org.id, "org"),
    checkSpendCap(org.id, "org", 0),
    listSupportSessionsForOrg(org.id, 10),
  ]);
  const active = members.filter((u) => !u.deactivatedAt);
  const owner = members.find((u) => u.id === org.ownerId);
  const twoFactor = active.filter((u) => u.twoFactorEnabled).length;

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={org.name}
        breadcrumbs={[
          { label: "Betreiber-Konsole", href: "/ops" },
          { label: "Kanzleien", href: "/ops/kanzleien" },
          { label: org.name },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={Users}
          label="Aktive Mitglieder"
          value={active.length}
          hint={`${members.length - active.length} deaktiviert`}
        />
        <StatCard icon={ShieldCheck} label="Mit 2FA" value={`${twoFactor}/${active.length}`} />
        <StatCard
          icon={Coins}
          label="Credits verfügbar"
          value={balance.balance.toLocaleString("de-DE")}
          hint={`${balance.usedCredit.toLocaleString("de-DE")} verbraucht`}
        />
        <StatCard
          icon={Building2}
          label="Modell-Policy"
          value={org.modelPolicy === "eu_only" ? "Nur EU" : "Alle"}
        />
      </div>

      <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold">Stammdaten</h2>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-[color:var(--ds-text-muted)]">Inhaber</dt>
            <dd>{owner?.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[color:var(--ds-text-muted)]">Plan</dt>
            <dd>{owner ? <PlanBadge plan={owner.plan} /> : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[color:var(--ds-text-muted)]">Angelegt</dt>
            <dd>{org.createdAt.slice(0, 10)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[color:var(--ds-text-muted)]">Kanzlei-ID</dt>
            <dd className="font-mono text-xs">{org.id}</dd>
          </div>
        </dl>
      </section>

      <section className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <h2 className="px-5 pt-4 pb-2 text-sm font-semibold">Mitglieder</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">E-Mail</th>
              <th className="px-5 py-3 font-medium">Rolle</th>
              <th className="px-5 py-3 font-medium">2FA</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr
                key={u.id}
                className="border-b border-[color:var(--ds-border)]/50 last:border-0 hover:bg-[color:var(--ds-surface-hover)]"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/ops/users/${u.id}`}
                    className="font-medium hover:[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                  >
                    {u.name}
                  </Link>
                  {u.id === org.ownerId && (
                    <span className="ml-2 text-xs text-[color:var(--ds-text-subtle)]">Inhaber</span>
                  )}
                </td>
                <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">{u.email}</td>
                <td className="px-5 py-3">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-5 py-3">{u.twoFactorEnabled ? "aktiv" : "—"}</td>
                <td className="px-5 py-3">
                  {u.deactivatedAt ? (
                    <span className="text-[color:var(--ds-danger-text)]">deaktiviert</span>
                  ) : (
                    <span className="text-[color:var(--ds-success-text)]">aktiv</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <SpendCapForm
        ownerId={org.id}
        currentLimit={spend.cap?.creditLimit ?? null}
        currentPeriod={spend.cap?.period ?? "monthly"}
        spentInPeriod={spend.cap?.spentInPeriod ?? null}
      />

      <SupportSessionPanel orgId={org.id} orgName={org.name} />

      {supportSessions.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <h2 className="px-5 pt-4 pb-2 text-sm font-semibold">Letzte Support-Zugriffe</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                <th className="px-5 py-3 font-medium">Betreiber</th>
                <th className="px-5 py-3 font-medium">Grund</th>
                <th className="px-5 py-3 font-medium">Gestartet</th>
                <th className="px-5 py-3 font-medium">Beendet</th>
              </tr>
            </thead>
            <tbody>
              {supportSessions.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[color:var(--ds-border)]/50 last:border-0"
                >
                  <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">{s.operatorEmail}</td>
                  <td className="px-5 py-3">{s.reason}</td>
                  <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                    {new Date(s.startedAt).toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                    {s.endedAt
                      ? new Date(s.endedAt).toLocaleString("de-DE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : new Date(s.expiresAt) > new Date()
                        ? "läuft"
                        : "abgelaufen"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-[color:var(--ds-text-subtle)]">
        Diese Konsolenseite zeigt nur Verwaltungsdaten. Akten, Dokumente und Mandantenkommunikation
        der Kanzlei sind hier nicht einsehbar — ein Support-Zugriff (oben) ist nötig, um sie im
        Kanzlei-Dashboard selbst zu sehen.
      </p>
    </div>
  );
}
