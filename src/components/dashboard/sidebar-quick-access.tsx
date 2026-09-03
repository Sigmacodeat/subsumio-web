"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pin, Clock, ChevronRight } from "lucide-react";
import { useRecentMatters } from "@/lib/use-recent-matters";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

interface SidebarQuickAccessProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function SidebarQuickAccess({ collapsed, onNavigate }: SidebarQuickAccessProps) {
  const { pinned, recent } = useRecentMatters();
  const { lang } = useLang();
  const pathname = usePathname();

  if (collapsed) return null;
  if (pinned.length === 0 && recent.length === 0) return null;

  const isActive = (slug: string) => {
    const encoded = slug.split("/").map(encodeURIComponent).join("/");
    return (
      pathname === `/dashboard/cases/${encoded}` ||
      pathname.startsWith(`/dashboard/cases/${encoded}/`)
    );
  };

  const renderMatter = (slug: string, title: string | undefined, isPinned: boolean) => {
    const encoded = slug.split("/").map(encodeURIComponent).join("/");
    const href = `/dashboard/cases/${encoded}`;
    const active = isActive(slug);
    const displayTitle = title || slug.split("/").pop() || slug;

    return (
      <Link
        key={`${isPinned ? "pin" : "rec"}-${slug}`}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "group flex h-7 items-center gap-2 rounded-md px-3 text-[12px] transition-colors",
          active
            ? "brand-soft brand-text font-medium"
            : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
        )}
      >
        {isPinned ? (
          <Pin size={10} className="shrink-0 fill-current opacity-60" />
        ) : (
          <Clock size={10} className="shrink-0 opacity-40" />
        )}
        <span className="min-w-0 flex-1 truncate">{displayTitle}</span>
        {active && <ChevronRight size={10} className="shrink-0 opacity-50" />}
      </Link>
    );
  };

  return (
    <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
      {pinned.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
            <Pin size={9} className="shrink-0" />
            {lang === "en" ? "Pinned" : "Angeheftet"}
          </div>
          <div className="space-y-0.5">
            {pinned.slice(0, 5).map((m) => renderMatter(m.slug, m.title, true))}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
            <Clock size={9} className="shrink-0" />
            {lang === "en" ? "Recent" : "Zuletzt"}
          </div>
          <div className="space-y-0.5">
            {recent.slice(0, 5).map((m) => renderMatter(m.slug, m.title, false))}
          </div>
        </div>
      )}
    </div>
  );
}
