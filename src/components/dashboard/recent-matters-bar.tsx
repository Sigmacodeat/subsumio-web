"use client";

import Link from "next/link";
import { Pin, Clock, ChevronRight, Briefcase } from "lucide-react";
import { useRecentMatters } from "@/lib/use-recent-matters";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

/**
 * RecentMattersBar — zeigt die 3-5 zuletzt geöffneten Akten als
 * 1-Klick-Chips direkt unter dem Greeting auf dem Dashboard.
 * Beschleunigt den häufigsten Flow: "zurück zur Akte von gestern".
 */
export function RecentMattersBar() {
  const { pinned, recent } = useRecentMatters();
  const { lang } = useLang();

  const items = [...pinned.slice(0, 3), ...recent.slice(0, 5 - Math.min(pinned.length, 3))];
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={lang === "en" ? "Recently opened cases" : "Zuletzt geöffnete Akten"}
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
        <Clock size={11} aria-hidden="true" />
        {lang === "en" ? "Recent" : "Zuletzt"}
      </span>
      {items.map((m, idx) => {
        const encoded = m.slug.split("/").map(encodeURIComponent).join("/");
        const href = `/dashboard/cases/${encoded}`;
        const isPinned = pinned.some((p) => p.slug === m.slug);
        const displayTitle = m.title || m.slug.split("/").pop() || m.slug;
        return (
          <Link
            key={`${m.slug}-${idx}`}
            href={href}
            className={cn(
              "group inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              "focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none",
              "active:scale-[0.98]",
              isPinned
                ? "border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-glow)] text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)]/60 hover:bg-[color:var(--brand-glow)]"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-hover)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            )}
          >
            {isPinned ? (
              <Pin size={11} className="shrink-0 fill-current opacity-70" aria-hidden="true" />
            ) : (
              <Briefcase size={11} className="shrink-0 opacity-50" aria-hidden="true" />
            )}
            <span className="max-w-[180px] truncate">{displayTitle}</span>
            <ChevronRight
              size={11}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </nav>
  );
}
