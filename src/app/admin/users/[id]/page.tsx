import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Calendar, Brain, Building2, Gift, Shield } from "lucide-react";
import { getSessionUser } from "@/lib/auth/server";
import { getStore, toPublic, type PublicUser } from "@/lib/auth/store";
import { PlanBadge } from "@/components/admin/admin-stat-card";
import { UserDetailForm } from "@/components/admin/user-detail-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Benutzer — Admin" };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const user = await getStore().getById(id);
  if (!user) redirect("/admin/users");

  const safe = toPublic(user) as PublicUser;

  const infoItems = [
    { icon: Mail, label: "E-Mail", value: safe.email },
    { icon: Calendar, label: "Registriert", value: safe.createdAt.slice(0, 10) },
    { icon: Brain, label: "Brain ID", value: safe.brainId },
    { icon: Building2, label: "Organisation", value: safe.orgId ?? "—" },
    { icon: Gift, label: "Referral Code", value: safe.referralCode },
    { icon: Gift, label: "Geworben von", value: safe.referredBy ?? "—" },
    { icon: Shield, label: "2FA", value: safe.twoFactorEnabled ? "Aktiv" : "Inaktiv" },
    {
      icon: Mail,
      label: "E-Mail verifiziert",
      value: safe.emailVerifiedAt ? safe.emailVerifiedAt.slice(0, 10) : "Nein",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm [color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
        >
          <ArrowLeft size={14} /> Kunden
        </Link>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-xl font-bold [color:var(--mk-text)]">{safe.name}</h1>
          <PlanBadge plan={safe.plan} />
          {safe.deactivatedAt && (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-400">
              Deaktiviert
            </span>
          )}
        </div>
        <p className="text-sm [color:var(--mk-text-muted)]">{safe.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {infoItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]"
            >
              <Icon size={14} className="brand-text mb-2" />
              <p className="text-xs [color:var(--mk-text-muted)]">{item.label}</p>
              <p
                className="mt-0.5 truncate text-sm font-medium [color:var(--mk-text)]"
                title={item.value}
              >
                {item.value}
              </p>
            </div>
          );
        })}
      </div>

      <UserDetailForm user={safe} />
    </div>
  );
}
