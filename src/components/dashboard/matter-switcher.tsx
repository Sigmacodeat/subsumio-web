"use client";

/**
 * MatterSwitcher — Topbar dropdown for quick matter switching.
 * Shows pinned matters first, then recent matters.
 * Highlights the active matter if currently on a matter page.
 * Follows Doherty Threshold (<400ms response) via instant localStorage read.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, ChevronDown, Pin, Search, FolderOpen, ArrowRight } from "lucide-react";
import { useRecentMatters, type MatterRef } from "@/lib/use-recent-matters";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

export function MatterSwitcher() {
  const { lang } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const { pinned, recent, togglePin } = useRecentMatters();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine if we're currently on a matter page
  const isOnMatter = pathname?.startsWith("/dashboard/cases/");
  const currentSlug = isOnMatter
    ? decodeURIComponent(pathname!.replace("/dashboard/cases/", "").split("/")[0] || "")
    : "";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Combine pinned + recent, deduplicated
  const allMatters = useMemo(() => {
    const seen = new Set<string>();
    const combined: Array<MatterRef & { pinned: boolean }> = [];
    for (const m of pinned) {
      if (!seen.has(m.slug)) {
        seen.add(m.slug);
        combined.push({ ...m, pinned: true });
      }
    }
    for (const m of recent) {
      if (!seen.has(m.slug)) {
        seen.add(m.slug);
        combined.push({ ...m, pinned: false });
      }
    }
    return combined;
  }, [pinned, recent]);

  const filtered = searchQuery.trim()
    ? allMatters.filter(
        (m) =>
          (m.title ?? m.slug).toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.slug.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allMatters;

  const pinnedFiltered = filtered.filter((m) => m.pinned);
  const recentFiltered = filtered.filter((m) => !m.pinned);

  function navigateToMatter(slug: string) {
    const encoded = slug.split("/").map(encodeURIComponent).join("/");
    router.push(`/dashboard/cases/${encoded}`);
    setOpen(false);
    setSearchQuery("");
  }

  const currentMatter = allMatters.find((m) => m.slug === currentSlug);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={lang === "en" ? "Switch matter" : "Akte wechseln"}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
          open
            ? "brand-soft brand-text brand-border"
            : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
        )}
      >
        <Briefcase size={14} className="shrink-0" />
        <span className="hidden max-w-[120px] truncate sm:inline">
          {currentMatter?.title ?? currentMatter?.slug ?? (lang === "en" ? "Matters" : "Akten")}
        </span>
        <ChevronDown
          size={12}
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="card-shadow-elevated absolute top-full left-0 z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {/* Search */}
          <div className="border-b border-[color:var(--ds-border)] p-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === "en" ? "Search matters…" : "Akten durchsuchen…"}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-8 text-[13px] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderOpen size={20} className="mb-2 text-[color:var(--ds-text-subtle)]" />
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {searchQuery.trim()
                    ? lang === "en"
                      ? "No matters found"
                      : "Keine Akten gefunden"
                    : lang === "en"
                      ? "No recent matters"
                      : "Keine recente Akten"}
                </p>
              </div>
            ) : (
              <>
                {/* Pinned section */}
                {pinnedFiltered.length > 0 && (
                  <div className="mb-1">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                      <Pin size={10} />
                      {lang === "en" ? "Pinned" : "Angeheftet"}
                    </div>
                    {pinnedFiltered.map((m) => (
                      <MatterSwitcherItem
                        key={m.slug}
                        slug={m.slug}
                        title={m.title ?? m.slug}
                        isActive={m.slug === currentSlug}
                        isPinned={true}
                        onNavigate={navigateToMatter}
                        onTogglePin={togglePin}
                        lang={lang}
                      />
                    ))}
                  </div>
                )}

                {/* Recent section */}
                {recentFiltered.length > 0 && (
                  <div>
                    {pinnedFiltered.length > 0 && (
                      <div className="mt-2 mb-1 border-t border-[color:var(--ds-border)] pt-1">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                          <FolderOpen size={10} />
                          {lang === "en" ? "Recent" : "Zuletzt"}
                        </div>
                      </div>
                    )}
                    {recentFiltered.map((m) => (
                      <MatterSwitcherItem
                        key={m.slug}
                        slug={m.slug}
                        title={m.title ?? m.slug}
                        isActive={m.slug === currentSlug}
                        isPinned={false}
                        onNavigate={navigateToMatter}
                        onTogglePin={togglePin}
                        lang={lang}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[color:var(--ds-border)] p-1.5">
            <Link
              href="/dashboard/cases"
              onClick={() => {
                setOpen(false);
                setSearchQuery("");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            >
              <ArrowRight size={13} className="shrink-0" />
              {lang === "en" ? "All matters" : "Alle Akten"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Item ──────────────────────────────────────────────────────────────

interface MatterSwitcherItemProps {
  slug: string;
  title: string;
  isActive: boolean;
  isPinned: boolean;
  onNavigate: (slug: string) => void;
  onTogglePin: (slug: string) => void;
  lang: string;
}

function MatterSwitcherItem({
  slug,
  title,
  isActive,
  isPinned,
  onNavigate,
  onTogglePin,
  lang,
}: MatterSwitcherItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
        isActive
          ? "brand-soft brand-text"
          : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
      )}
    >
      <button
        onClick={() => onNavigate(slug)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Briefcase
          size={13}
          className={cn("shrink-0", isActive ? "brand-text" : "text-[color:var(--ds-text-subtle)]")}
        />
        <span className="truncate text-[13px] font-medium">{title}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(slug);
        }}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
          isPinned
            ? "brand-text"
            : "text-[color:var(--ds-text-subtle)] opacity-0 group-hover:opacity-100 hover:text-[color:var(--ds-text)]"
        )}
        aria-label={
          isPinned ? (lang === "en" ? "Unpin" : "Loslösen") : lang === "en" ? "Pin" : "Anheften"
        }
        title={
          isPinned ? (lang === "en" ? "Unpin" : "Loslösen") : lang === "en" ? "Pin" : "Anheften"
        }
      >
        <Pin size={11} className={isPinned ? "fill-current" : ""} />
      </button>
    </div>
  );
}
