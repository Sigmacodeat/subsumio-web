import Link from "next/link";
import { getOrgStore, getStore } from "@/lib/auth/store";
import { PlanBadge } from "@/components/admin/admin-stat-card";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata = { title: "Kanzleien" };
export const dynamic = "force-dynamic";

export default async function OpsFirmsPage() {
  const [orgs, users] = await Promise.all([getOrgStore().list(), getStore().list()]);
  const usersById = new Map(users.map((u) => [u.id, u] as const));

  const rows = orgs
    .map((org) => {
      const members = users.filter((u) => u.orgId === org.id);
      const active = members.filter((u) => !u.deactivatedAt);
      const owner = usersById.get(org.ownerId);
      return {
        org,
        owner,
        activeCount: active.length,
        adminCount: active.filter((u) => u.role === "admin").length,
        lawyerCount: active.filter((u) => u.role === "lawyer").length,
        twoFactorCount: active.filter((u) => u.twoFactorEnabled).length,
      };
    })
    .sort((a, b) => b.org.createdAt.localeCompare(a.org.createdAt));

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Kanzleien"
        breadcrumbs={[{ label: "Betreiber-Konsole", href: "/ops" }, { label: "Kanzleien" }]}
      />

      <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              <th className="px-5 py-3 font-medium">Kanzlei</th>
              <th className="px-5 py-3 font-medium">Inhaber</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 text-right font-medium">Aktiv</th>
              <th className="px-5 py-3 text-right font-medium">Admins</th>
              <th className="px-5 py-3 text-right font-medium">Anwälte</th>
              <th className="px-5 py-3 text-right font-medium">2FA</th>
              <th className="px-5 py-3 font-medium">Seit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-10 text-center text-[color:var(--ds-text-subtle)]"
                >
                  Noch keine Kanzleien angelegt.
                </td>
              </tr>
            )}
            {rows.map(({ org, owner, activeCount, adminCount, lawyerCount, twoFactorCount }) => (
              <tr
                key={org.id}
                className="border-b border-[color:var(--ds-border)]/50 last:border-0 hover:bg-[color:var(--ds-surface-hover)]"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/ops/kanzleien/${org.id}`}
                    className="font-medium text-[color:var(--ds-text)] hover:[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                  >
                    {org.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                  {owner?.email ?? "—"}
                </td>
                <td className="px-5 py-3">{owner ? <PlanBadge plan={owner.plan} /> : "—"}</td>
                <td className="px-5 py-3 text-right">{activeCount}</td>
                <td
                  className={`px-5 py-3 text-right ${adminCount === 0 ? "text-[color:var(--ds-warning-text)]" : ""}`}
                  title={adminCount === 0 ? "Kanzlei ohne Admin" : undefined}
                >
                  {adminCount}
                </td>
                <td className="px-5 py-3 text-right">{lawyerCount}</td>
                <td className="px-5 py-3 text-right text-[color:var(--ds-text-muted)]">
                  {twoFactorCount}/{activeCount}
                </td>
                <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                  {org.createdAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
