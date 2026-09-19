"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, BookOpen, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { RetrievalFeedbackButtons } from "@/components/legal/RetrievalFeedbackButtons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import type { BrainPage, SearchResult } from "@/lib/types";
import { useLang } from "@/lib/use-lang";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  BRAIN_TYPE_PLURALS,
  brainEntryHref,
  brainTypeIcon,
  brainTypeLabel,
  isInternalBrainType,
} from "./brain-types";

type PageItem = { slug: string; title: string; type: string; tags: string[]; updated: string };
type DisplayItem = PageItem & { snippet?: string };
type SortKey = "updated" | "title";

const SORTS: { key: SortKey; labelKey: "brain.sort_updated" | "brain.sort_title" }[] = [
  { key: "updated", labelKey: "brain.sort_updated" },
  { key: "title", labelKey: "brain.sort_title" },
];

function toItem(p: BrainPage): PageItem {
  return {
    slug: p.slug,
    // Seeded titles may start with an emoji — the list stays text-only.
    title: (p.title || p.slug).replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "") || p.slug,
    type: p.type ?? "document",
    tags: Array.isArray(p.tags) ? p.tags : [],
    updated: p.updated_at || p.created_at || "",
  };
}

export default function BrainPage() {
  const { t } = useLang();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.brain.listPages({ limit: 200 });
        if (cancelled) return;
        setPages(list.filter((p) => !isInternalBrainType(p.type)).map(toItem));
      } catch (err) {
        console.error(
          "[brain] failed to load pages:",
          err instanceof Error ? err.message : String(err)
        );
        if (!cancelled) {
          setPages([]);
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // All state writes live inside the (deferred) timer callback so the
    // effect body itself never calls setState synchronously.
    const trimmed = query.trim();
    const timer = setTimeout(
      async () => {
        if (!trimmed) {
          setSearchResults(null);
          return;
        }
        setSearching(true);
        try {
          const results = await api.brain.search(trimmed, 20);
          setSearchResults(results);
        } catch (err) {
          console.error("[brain] search failed:", err instanceof Error ? err.message : String(err));
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      },
      trimmed ? 350 : 0
    );
    return () => clearTimeout(timer);
  }, [query]);

  // Filter chips only for types that actually occur — no "(0)" chips.
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pages) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [pages]);

  const displayed = useMemo<DisplayItem[]>(() => {
    if (searchResults !== null) {
      const known = new Map(pages.map((p) => [p.slug, p]));
      return searchResults
        .filter((r) => !isInternalBrainType(known.get(r.slug)?.type))
        .map((r) => ({
          slug: r.slug,
          title: r.title || r.slug,
          type: known.get(r.slug)?.type ?? "document",
          tags: [],
          updated: known.get(r.slug)?.updated ?? r.created_at ?? "",
          snippet: r.snippet,
        }));
    }
    let list = [...pages];
    if (filter !== "all") list = list.filter((p) => p.type === filter);
    list.sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title, "de") : b.updated.localeCompare(a.updated)
    );
    return list;
  }, [pages, filter, sort, searchResults]);

  const isEmpty = !loading && pages.length === 0 && !query;
  const chipClass = (active: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
      active
        ? "brand-soft brand-text brand-border"
        : "border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
    );

  return (
    <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("nav.brain")}
        description="Akten, Dokumente, Fristen und Kontakte der Kanzlei an einer Stelle durchsuchen."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("nav.brain") },
        ]}
        actions={
          <Button onClick={() => router.push("/dashboard/upload")} className="whitespace-nowrap">
            {t("brain.btn_upload")}
          </Button>
        }
      />

      {loading ? (
        <PageSkeleton rows={6} className="p-0" />
      ) : isEmpty ? (
        <EmptyState
          icon={BookOpen}
          title={loadFailed ? "Kanzleiwissen derzeit nicht erreichbar" : t("brain.empty_title")}
          description={
            loadFailed
              ? "Die Einträge konnten nicht geladen werden. Bitte laden Sie die Seite in einigen Minuten neu."
              : "Laden Sie Dokumente hoch oder legen Sie Akten an — sie erscheinen danach hier."
          }
          actionLabel={loadFailed ? "Neu laden" : t("brain.btn_upload")}
          onAction={() =>
            loadFailed ? window.location.reload() : router.push("/dashboard/upload")
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Input
                icon={
                  searching ? (
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Search size={15} aria-hidden="true" />
                  )
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("brain.search_placeholder")}
                aria-label={t("brain.search_placeholder")}
              />
            </div>
            {searchResults === null && (
              <div
                className="flex shrink-0 items-center gap-1"
                role="group"
                aria-label={t("brain.sort")}
              >
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSort(s.key)}
                    aria-pressed={sort === s.key}
                    className={chipClass(sort === s.key)}
                  >
                    {t(s.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {searchResults === null && typeCounts.length > 1 && (
            <div
              className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
              role="group"
              aria-label={t("brain.type")}
            >
              <button
                type="button"
                onClick={() => setFilter("all")}
                aria-pressed={filter === "all"}
                className={chipClass(filter === "all")}
              >
                {t("brain.filter_all")}
                <span className="tabular-nums opacity-70">{pages.length}</span>
              </button>
              {typeCounts.map(([type, count]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilter(type)}
                  aria-pressed={filter === type}
                  className={chipClass(filter === type)}
                >
                  {BRAIN_TYPE_PLURALS[type] ?? brainTypeLabel(type)}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              ))}
            </div>
          )}

          {displayed.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-12 text-sm text-[color:var(--ds-text-muted)]">
              <AlertCircle size={15} aria-hidden="true" />
              {t("brain.no_results").replace("{{query}}", query)}
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
              {displayed.map((page, pageIndex) => {
                const TypeIcon = brainTypeIcon(page.type);
                return (
                  <li key={page.slug} className="group flex items-center gap-3">
                    <Link
                      href={brainEntryHref(page.slug, page.type)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]">
                        <TypeIcon size={15} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                            {page.title}
                          </span>
                          <Badge variant="default" className="shrink-0">
                            {brainTypeLabel(page.type)}
                          </Badge>
                        </span>
                        {page.snippet ? (
                          <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                            {page.snippet}
                          </span>
                        ) : page.tags.length > 0 ? (
                          <span className="mt-1 block truncate text-xs text-[color:var(--ds-text-subtle)]">
                            {page.tags.map((tag) => `#${tag}`).join("  ")}
                          </span>
                        ) : null}
                      </span>
                      {page.updated && (
                        <span className="hidden shrink-0 text-xs text-[color:var(--ds-text-subtle)] tabular-nums sm:block">
                          {formatDate(page.updated)}
                        </span>
                      )}
                      <ChevronRight
                        size={16}
                        className="shrink-0 text-[color:var(--ds-text-subtle)]"
                        aria-hidden="true"
                      />
                    </Link>
                    {searchResults !== null && (
                      <RetrievalFeedbackButtons
                        query={query}
                        resultSlug={page.slug}
                        resultTitle={page.title}
                        rankPosition={pageIndex + 1}
                        className="mr-3 shrink-0"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
