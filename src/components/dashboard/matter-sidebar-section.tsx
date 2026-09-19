"use client";

/**
 * MatterSidebarSection — Shows matter-scoped navigation in the sidebar
 * when the user is inside a matter page.
 * Renders one entry for the open matter (title and case number); the matter's
 * registers live in the page's tab bar.
 * Falls back to null when not on a matter page.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { caseSlugFromDashboardPath } from "@/lib/matter-route-path";
import { usePage } from "@/lib/queries/brain";
import { Briefcase, ChevronRight } from "lucide-react";
import { useMatterDataSafe } from "@/lib/matter-data-context";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

interface MatterSidebarSectionProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function MatterSidebarSection({ collapsed, onNavigate }: MatterSidebarSectionProps) {
  const ctx = useMatterDataSafe();
  const { t, lang } = useLang();
  const pathname = usePathname();

  // Parse slug from pathname as fallback when outside MatterDataProvider.
  // Slugs span several segments ("legal/cases/<id>"); the helper also knows
  // the reserved sibling routes (/cases/new) and the tab suffix.
  const pathSlug = caseSlugFromDashboardPath(pathname ?? "") ?? "";
  const pathTab = (() => {
    if (!pathSlug || !pathname) return "overview";
    const rest = pathname.slice("/dashboard/cases/".length).split("/").filter(Boolean);
    const last = decodeURIComponent(rest[rest.length - 1] ?? "");
    return pathSlug.endsWith(last) ? "overview" : last || "overview";
  })();

  const matter = ctx?.matter ?? null;
  // Outside the matter provider (the sidebar renders above it) show the
  // matter's title instead of its raw slug; the page fetch is deduplicated.
  const fallbackPage = usePage(!matter && pathSlug ? pathSlug : "");
  const matterTitle = matter?.title ?? fallbackPage.data?.title ?? "";
  const activeTab = ctx?.activeTab ?? pathTab;
  const caseSlug = ctx?.caseSlug ?? pathSlug;

  // Only render when on a matter page with a valid slug
  const isOnMatter = pathname?.startsWith("/dashboard/cases/") && caseSlug;
  if (!isOnMatter || !caseSlug) return null;

  const encodedSlug = caseSlug.split("/").map(encodeURIComponent).join("/");

  const caseNumber =
    matter?.caseNumber ??
    (fallbackPage.data?.frontmatter as Record<string, unknown> | undefined)?.case_number;
  const label = matterTitle || t("mattersidebar.matter");
  const isOverview = activeTab === "overview";

  // One entry for the open matter. Its registers are the tab bar on the page;
  // listing them here as well doubled the navigation and pushed the firm-wide
  // groups off screen.
  return (
    <div className={cn("mt-3 border-t border-[color:var(--ds-border)] pt-3", collapsed && "px-0")}>
      <Link
        href={`/dashboard/cases/${encodedSlug}`}
        aria-current={isOverview ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        onClick={onNavigate}
        className={cn(
          "group flex items-center rounded-lg transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
          collapsed ? "h-9 w-full justify-center" : "gap-2.5 px-3 py-2",
          "brand-soft brand-text"
        )}
      >
        <Briefcase size={collapsed ? 18 : 15} className="shrink-0" aria-hidden />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
              {lang === "en" ? "Open matter" : "Geöffnete Akte"}
            </span>
            <span className="block truncate text-[13px] font-medium text-[color:var(--ds-text)]">
              {matterTitle || "…"}
            </span>
            {typeof caseNumber === "string" && (
              <span className="block text-[11px] text-[color:var(--ds-text-muted)] tabular-nums">
                {caseNumber}
              </span>
            )}
          </span>
        )}
        {!collapsed && <ChevronRight size={12} className="shrink-0 opacity-50" aria-hidden />}
      </Link>
    </div>
  );
}
