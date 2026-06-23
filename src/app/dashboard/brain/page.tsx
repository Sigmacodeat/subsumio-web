"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  BookOpen,
  Users,
  Building2,
  Lightbulb,
  FileText,
  Calendar,
  MapPin,
  Filter,
  SortAsc,
  ChevronRight,
  Clock,
  Hash,
  Loader2,
  Briefcase,
  CalendarClock,
  Scale,
  Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { BrainQualityPanel } from "@/components/legal/BrainQualityPanel";
import type { BrainPage, Entity, SearchResult } from "@/lib/types";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

type FilterType =
  | "all"
  | Entity["type"]
  | "document"
  | "legal_case"
  | "legal_actor"
  | "legal_deadline"
  | "court"
  | "statute"
  | "norm";
type PageItem = BrainPage & { type: string; words: number; updated: string };

const TYPE_FILTERS: {
  key: FilterType;
  labelKey: DashboardKey;
  icon: React.ElementType;
  color: string;
}[] = [
  { key: "all", labelKey: "brain.filter_all", icon: BookOpen, color: "default" },
  { key: "person", labelKey: "brain.filter_persons", icon: Users, color: "person" },
  { key: "company", labelKey: "brain.filter_companies", icon: Building2, color: "company" },
  { key: "idea", labelKey: "brain.filter_ideas", icon: Lightbulb, color: "idea" },
  { key: "document", labelKey: "brain.filter_documents", icon: FileText, color: "document" },
  { key: "event", labelKey: "brain.filter_events", icon: Calendar, color: "event" },
  { key: "place", labelKey: "brain.filter_places", icon: MapPin, color: "place" },
  { key: "legal_case", labelKey: "brain.filter_cases", icon: Briefcase, color: "accent" },
  { key: "legal_actor", labelKey: "brain.filter_actors", icon: Scale, color: "accent" },
  {
    key: "legal_deadline",
    labelKey: "brain.filter_deadlines",
    icon: CalendarClock,
    color: "accent",
  },
  { key: "court", labelKey: "brain.filter_courts", icon: Landmark, color: "accent" },
  { key: "statute", labelKey: "brain.filter_statutes", icon: BookOpen, color: "accent" },
  { key: "norm", labelKey: "brain.filter_norms", icon: BookOpen, color: "accent" },
];

export default function BrainPage() {
  const { t } = useLang();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<"updated" | "title" | "words">("updated");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [stats, setStats] = useState({ pages: 0, entities: 0, edges: 0 });
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, brainStats] = await Promise.all([
          api.brain.listPages({ limit: 200 }),
          api.brain.stats(),
        ]);
        if (cancelled) return;
        const items: PageItem[] = list.map((p) => ({
          ...p,
          type: (p as PageItem).type ?? "document",
          words: p.word_count ?? 0,
          updated: p.updated_at ? p.updated_at.slice(0, 10) : "",
        }));
        setPages(items);
        setStats({
          pages: brainStats.total_pages,
          entities: brainStats.total_entities,
          edges: brainStats.total_edges,
        });
      } catch (err) {
        console.error(
          "[brain] failed to load pages:",
          err instanceof Error ? err.message : String(err)
        );
        if (!cancelled) setPages([]);
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

  const displayed = useMemo(() => {
    if (searchResults !== null) {
      return searchResults.map((r) => ({
        slug: r.slug,
        title: r.title,
        type: "document" as const,
        tags: [] as string[],
        words: 0,
        updated: r.created_at?.slice(0, 10) ?? "",
        snippet: r.snippet,
      }));
    }
    let list = [...pages];
    if (filter !== "all") {
      list = list.filter((p) => p.type === filter);
    }
    list.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "words") return b.words - a.words;
      return b.updated.localeCompare(a.updated);
    });
    return list;
  }, [pages, filter, sort, searchResults]);

  const isEmpty = !loading && pages.length === 0 && !query;

  const typeColorMap: Record<string, string> = {
    person: "person",
    company: "company",
    idea: "idea",
    document: "document",
    event: "event",
    place: "place",
  };

  const typeIconMap: Record<string, React.ElementType> = {
    person: Users,
    company: Building2,
    idea: Lightbulb,
    document: FileText,
    event: Calendar,
    place: MapPin,
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-52 shrink-0 space-y-1 overflow-y-auto border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
          {t("brain.type")}
        </p>
        {TYPE_FILTERS.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                filter === f.key
                  ? "brand-soft brand-text brand-border border"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <Icon size={15} className="shrink-0" />
              {t(f.labelKey)}
            </button>
          );
        })}

        <div className="pt-4 pb-2">
          <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
            {t("brain.sort")}
          </p>
          {[
            { key: "updated" as const, labelKey: "brain.sort_updated" as const },
            { key: "title" as const, labelKey: "brain.sort_title" as const },
            { key: "words" as const, labelKey: "brain.sort_words" as const },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                sort === s.key
                  ? "brand-soft brand-text brand-border border"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <SortAsc size={15} className="shrink-0" />
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        <div className="pt-2">
          <BrainQualityPanel />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                icon={<Search size={15} />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("brain.search_placeholder")}
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              className="shrink-0"
              disabled
              title={t("brain.filter_tooltip")}
            >
              <Filter size={15} />
              {t("brain.btn_filter")}
            </Button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-6 flex items-center gap-4 text-sm text-[color:var(--ds-text-muted)]">
            <span>
              <strong className="text-[color:var(--ds-text)]">{stats.pages}</strong>{" "}
              {t("brain.stats_pages")}
            </span>
            <span>·</span>
            <span>
              <strong className="text-[color:var(--ds-text)]">{stats.entities}</strong>{" "}
              {t("brain.stats_entities")}
            </span>
            <span>·</span>
            <span>
              <strong className="text-[color:var(--ds-text)]">{stats.edges}</strong>{" "}
              {t("brain.stats_edges")}
            </span>
            {searching && (
              <>
                <span>·</span>
                <Loader2 size={14} className="brand-text animate-spin" />
              </>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={28} className="animate-spin text-[color:var(--ds-text-muted)]" />
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
                <BookOpen size={28} className="text-[color:var(--ds-border-strong)]" />
              </div>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                {t("brain.empty_title")}
              </h3>
              <p className="mb-6 max-w-sm text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                {t("brain.empty_hint")}
              </p>
              <div className="flex gap-3">
                <Button variant="glow" size="md" onClick={() => router.push("/dashboard/upload")}>
                  {t("brain.btn_upload")}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => router.push("/dashboard/settings")}
                >
                  {t("brain.btn_setup")}
                </Button>
              </div>
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-16 text-center text-sm text-[color:var(--ds-text-muted)]">
              {t("brain.no_results").replace("{{query}}", query)}
            </div>
          ) : (
            <div className="space-y-2">
              {displayed.map((page) => {
                const TypeIcon = typeIconMap[page.type] || FileText;
                const tags = "tags" in page ? page.tags : [];
                return (
                  <a
                    key={page.slug}
                    href={`/dashboard/brain/${encodeURIComponent(page.slug)}`}
                    className="group card-shadow flex items-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)]"
                  >
                    <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                      <TypeIcon size={17} className="brand-text" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {page.title}
                        </span>
                        <Badge
                          variant={
                            typeColorMap[page.type] as Parameters<typeof Badge>[0]["variant"]
                          }
                        >
                          {page.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                        <span className="font-mono">{page.slug}</span>
                        {page.words > 0 && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Hash size={10} />
                              {page.words} {t("brain.words")}
                            </span>
                          </>
                        )}
                        {page.updated && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {page.updated}
                            </span>
                          </>
                        )}
                      </div>
                      {"snippet" in page && page.snippet && (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                          {page.snippet}
                        </p>
                      )}
                      {tags && tags.length > 0 && (
                        <div className="mt-2 flex items-center gap-1">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--ds-text-subtle)]"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronRight
                      size={16}
                      className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-subtle)] transition-colors"
                    />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
