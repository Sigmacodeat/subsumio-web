import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Calendar, Brain, Building2, Gift, Shield } from "lucide-react";
import { getSessionUser } from "@/lib/auth/server";
import { getStore, toPublic, type PublicUser } from "@/lib/auth/store";
import { PlanBadge } from "@/components/admin/admin-stat-card";
import { UserDetailForm } from "@/components/admin/user-detail-form";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Benutzer — Admin" };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/dashboard/admin/users");
  if (me.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const user = await getStore().getById(id);
  if (!user) redirect("/dashboard/admin/users");

  const safe = toPublic(user) as PublicUser;

  const infoItems = [
    { icon: Mail, label: "E-Mail", value: safe.email },
    { icon: Calendar, label: "Registriert", value: safe.createdAt.slice(0, 10) },
    { icon: Brain, label: "Brain ID", value: safe.brainId },
    { icon: Building2, label: "Organisation", value: safe.orgId ?? "—" },
    { icon: Gift, label: "Empfehlungscode", value: safe.referralCode },
    { icon: Gift, label: "Geworben von", value: safe.referredBy ?? "—" },
    { icon: Shield, label: "2FA", value: safe.twoFactorEnabled ? "Aktiv" : "Inaktiv" },
    {
      icon: Mail,
      label: "E-Mail verifiziert",
      value: safe.emailVerifiedAt ? safe.emailVerifiedAt.slice(0, 10) : "Nein",
    },
  ];

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={safe.name} breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin", href: "/dashboard/admin" }, { label: "Kunden", href: "/dashboard/admin/users" }, { label: safe.email }]} />

      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/admin/users"
          className="inline-flex items-center gap-1 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
        >
          <ArrowLeft size={14} /> Kunden
        </Link>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-3">
          <PlanBadge plan={safe.plan} />
          {safe.deactivatedAt && (
            <span className="rounded-full bg-[color:var(--ds-danger-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-danger-text)]">
              Deaktiviert
            </span>
          )}
        </div>
        <p className="text-sm text-[color:var(--ds-text-muted)]">{safe.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {infoItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-xl border border-[color:var(--ds-border)] p-4 bg-[color:var(--ds-surface)]"
            >
              <Icon size={14} className="brand-text mb-2" />
              <p className="text-xs text-[color:var(--ds-text-muted)]">{item.label}</p>
              <p
                className="mt-0.5 truncate text-sm font-medium text-[color:var(--ds-text)]"
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
