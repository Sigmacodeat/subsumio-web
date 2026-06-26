"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Activity,
  Settings,
  BarChart3,
  Building2,
  ShieldCheck,
  Mail,
  MessageSquare,
  ClipboardList,
  ArrowLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Übersicht",
    items: [{ href: "/admin", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    title: "Verwaltung",
    items: [
      { href: "/admin/users", icon: Users, label: "Kunden" },
      { href: "/admin/billing", icon: CreditCard, label: "Billing" },
      { href: "/admin/orgs", icon: Building2, label: "Organisationen" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/system", icon: Activity, label: "System-Health" },
      { href: "/admin/config", icon: Settings, label: "Konfiguration" },
      { href: "/admin/usage", icon: BarChart3, label: "Usage & Quota" },
    ],
  },
  {
    title: "Sicherheit",
    items: [
      { href: "/admin/security", icon: ShieldCheck, label: "Security" },
      { href: "/admin/audit", icon: ClipboardList, label: "Audit-Trail" },
    ],
  },
  {
    title: "Kommunikation",
    items: [
      { href: "/admin/mailbox", icon: Mail, label: "Mailbox" },
      { href: "/admin/comms", icon: MessageSquare, label: "Templates" },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2 px-2">
        <ShieldCheck size={18} className="brand-text" />
        <span className="text-sm font-bold [color:var(--mk-text)]">Admin</span>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="px-2 text-xs font-medium tracking-wider text-[color:var(--mk-text-subtle)] uppercase">
              {section.title}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    active
                      ? "brand-soft brand-text font-medium"
                      : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)] hover:[background:var(--mk-surface-2)]"
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm [color:var(--mk-text-muted)] transition-colors hover:[color:var(--mk-text)] hover:[background:var(--mk-surface-2)]"
      >
        <ArrowLeft size={15} />
        Zum Dashboard
      </Link>
    </nav>
  );
}
