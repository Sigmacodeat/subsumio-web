"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  Coins,
  Database,
  FlaskConical,
  Gauge,
  HardDrive,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  ShieldAlert,
  ToggleRight,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogout } from "@/lib/queries/auth";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const OPS_NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Kunden",
    items: [
      { href: "/ops", label: "Übersicht", icon: LayoutDashboard },
      { href: "/ops/kanzleien", label: "Kanzleien", icon: Building2 },
      { href: "/ops/users", label: "Nutzer", icon: Users },
      { href: "/ops/mailbox", label: "Support-Mailbox", icon: Mail },
      { href: "/ops/leads", label: "Anfragen", icon: Inbox },
      { href: "/ops/demo", label: "Live-Demo", icon: FlaskConical },
    ],
  },
  {
    title: "Nutzung & Kosten",
    items: [
      { href: "/ops/saas-usage", label: "Nutzung & Margen", icon: Coins },
      { href: "/ops/token-usage", label: "KI-Token-Kosten", icon: Gauge },
    ],
  },
  {
    title: "Betrieb",
    items: [
      { href: "/ops/engine", label: "Engine & Queue", icon: Activity },
      { href: "/ops/slo", label: "SLO", icon: ShieldAlert },
      { href: "/ops/backup", label: "Backup", icon: HardDrive },
      { href: "/ops/dr", label: "Disaster Recovery", icon: LifeBuoy },
    ],
  },
  {
    title: "Plattform",
    items: [
      { href: "/ops/corpus", label: "Korpus-Pflege", icon: Database },
      { href: "/ops/feature-flags", label: "Feature-Flags", icon: ToggleRight },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/ops") return pathname === "/ops";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OpsShell({
  operatorEmail,
  children,
}: {
  operatorEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/ops";
  const logout = useLogout();

  return (
    <div
      className="flex min-h-screen bg-[color:var(--ds-bg)] text-[color:var(--ds-text)]"
      data-app="dashboard"
      data-theme="dark"
    >
      <meta name="robots" content="noindex, nofollow" />
      <a
        href="#ops-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[color:var(--brand-solid)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Zum Inhalt springen
      </a>
      <aside
        aria-label="Betreiber-Navigation"
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] md:flex"
      >
        <div className="border-b border-[color:var(--ds-border)] px-5 py-4">
          <p className="text-sm font-semibold">Subsumio Ops</p>
          <p className="mt-0.5 text-[11px] text-[color:var(--ds-warning-text)]">
            Betreiber-Konsole · alle Kanzleien
          </p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {OPS_NAV.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                          active
                            ? "bg-[color:var(--ds-surface-2)] font-medium text-[color:var(--ds-text)]"
                            : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)]"
                        )}
                      >
                        <Icon size={15} className="shrink-0" aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-[color:var(--ds-border)] px-5 py-3">
          <p className="truncate text-xs text-[color:var(--ds-text-muted)]" title={operatorEmail}>
            {operatorEmail}
          </p>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50"
          >
            <LogOut size={12} aria-hidden /> Abmelden
          </button>
        </div>
      </aside>
      <main id="ops-main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        {/* 44px Touch-Targets, Scrollbar versteckt, aktiver Eintrag als Pill */}
        <nav
          aria-label="Betreiber-Navigation (mobil)"
          className="flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-[color:var(--ds-border)] px-3 py-1.5 [-ms-overflow-style:none] md:hidden [&::-webkit-scrollbar]:hidden"
        >
          {OPS_NAV.flatMap((g) => g.items).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors active:scale-[0.97] active:bg-[color:var(--ds-surface-2)] motion-reduce:transition-none",
                isActive(pathname, href)
                  ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                  : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
