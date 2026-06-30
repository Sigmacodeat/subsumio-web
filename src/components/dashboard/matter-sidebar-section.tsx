"use client";

/**
 * MatterSidebarSection — Shows matter-scoped navigation in the sidebar
 * when the user is inside a matter page.
 * Renders a compact list of matter tabs (Overview, Documents, Deadlines, etc.)
 * with the active matter title as a header.
 * Falls back to null when not on a matter page.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  FileText,
  CalendarClock,
  Lightbulb,
  Activity,
  Receipt,
  Mail,
  Users,
  Brain,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";
import { useMatterDataSafe } from "@/lib/matter-data-context";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

interface MatterNavItem {
  tab: string;
  icon: typeof Briefcase;
  labelDe: string;
  labelEn: string;
}

const MATTER_NAV_ITEMS: MatterNavItem[] = [
  { tab: "overview", icon: Briefcase, labelDe: "Übersicht", labelEn: "Overview" },
  { tab: "documents", icon: FileText, labelDe: "Dokumente", labelEn: "Documents" },
  {
    tab: "deadlines",
    icon: CalendarClock,
    labelDe: "Fristen & Aufgaben",
    labelEn: "Deadlines & Tasks",
  },
  { tab: "strategy", icon: Lightbulb, labelDe: "Strategie", labelEn: "Strategy" },
  { tab: "evidence", icon: ShieldAlert, labelDe: "Beweise", labelEn: "Evidence" },
  { tab: "activity", icon: Activity, labelDe: "Aktivität", labelEn: "Activity" },
  { tab: "billing", icon: Receipt, labelDe: "Kosten", labelEn: "Billing" },
  { tab: "communications", icon: Mail, labelDe: "Kommunikation", labelEn: "Communications" },
  { tab: "contacts", icon: Users, labelDe: "Beteiligte", labelEn: "Contacts" },
  { tab: "ai", icon: Brain, labelDe: "KI-Analyse", labelEn: "AI Analysis" },
];

interface MatterSidebarSectionProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function MatterSidebarSection({ collapsed, onNavigate }: MatterSidebarSectionProps) {
  const ctx = useMatterDataSafe();
  const { lang } = useLang();
  const pathname = usePathname();

  // Parse slug from pathname as fallback when outside MatterDataProvider
  const pathSlug = pathname?.startsWith("/dashboard/cases/")
    ? decodeURIComponent(pathname.replace("/dashboard/cases/", "").split("/")[0] || "")
    : "";
  const pathTab = pathname?.startsWith("/dashboard/cases/")
    ? decodeURIComponent(pathname.replace("/dashboard/cases/", "").split("/")[1] || "overview")
    : "overview";

  const matter = ctx?.matter ?? null;
  const activeTab = ctx?.activeTab ?? pathTab;
  const caseSlug = ctx?.caseSlug ?? pathSlug;

  // Only render when on a matter page with a valid slug
  const isOnMatter = pathname?.startsWith("/dashboard/cases/") && caseSlug;
  if (!isOnMatter || !caseSlug) return null;

  const encodedSlug = caseSlug.split("/").map(encodeURIComponent).join("/");

  return (
    <div className={cn("mt-3 border-t border-[color:var(--ds-border)] pt-3", collapsed && "px-0")}>
      {/* Matter header */}
      {!collapsed && (
        <div className="mb-2 px-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
            <Briefcase size={10} className="shrink-0" />
            {lang === "en" ? "Matter" : "Akte"}
          </div>
          <div className="mt-1 truncate text-[12px] font-medium text-[color:var(--ds-text)]">
            {matter?.title ?? caseSlug}
          </div>
        </div>
      )}

      {/* Matter nav items */}
      <div className="space-y-0.5">
        {MATTER_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const itemTab = item.tab === "overview" ? "" : item.tab;
          const href = itemTab
            ? `/dashboard/cases/${encodedSlug}/${itemTab}`
            : `/dashboard/cases/${encodedSlug}`;
          const isActive = activeTab === item.tab;

          if (collapsed) {
            return (
              <Link
                key={item.tab}
                href={href}
                aria-current={isActive ? "page" : undefined}
                aria-label={lang === "en" ? item.labelEn : item.labelDe}
                onClick={onNavigate}
                title={lang === "en" ? item.labelEn : item.labelDe}
                className={cn(
                  "group flex h-9 w-full items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "brand-soft brand-text"
                    : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                )}
              >
                <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
              </Link>
            );
          }

          return (
            <Link
              key={item.tab}
              href={href}
              aria-current={isActive ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "group flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors",
                isActive
                  ? "brand-soft brand-text"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <Icon size={15} className="shrink-0" strokeWidth={isActive ? 2 : 1.75} />
              <span className="flex-1 truncate">{lang === "en" ? item.labelEn : item.labelDe}</span>
              {isActive && <ChevronRight size={12} className="shrink-0 opacity-50" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
