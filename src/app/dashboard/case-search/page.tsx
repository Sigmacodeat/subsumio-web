"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Loader2,
  Scale,
  Users,
  Gavel,
  Tag,
  Globe,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/use-lang";
import { caseFrontmatter } from "@/lib/legal-types";
import type { BrainPage } from "@/lib/types";
import { cn, encodeSlugPath } from "@/lib/utils";
import { STATUS_TEXT, STATUS_BG, STATUS_BORDER, type StatusColor } from "@/lib/status-colors";

interface FacetItem {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  legalArea: string;
  priority: string;
  jurisdiction: string;
  clientName?: string;
  opponentName?: string;
  courtName?: string;
  lawyerName?: string;
  tags: string[];
  conflictStatus?: string;
  estimatedValue?: { min: number; max: number; currency: string };
  updatedAt: string;
}

interface FacetConfig {
  key: keyof FacetFilters;
  label: string;
  labelEn: string;
  icon: React.ElementType;
  extract: (item: FacetItem) => string[];
}

interface FacetFilters {
  status: string[];
  legalArea: string[];
  priority: string[];
  jurisdiction: string[];
  lawyer: string[];
  court: string[];
  tags: string[];
  conflictStatus: string[];
}

const STATUS_COLORS: Record<string, StatusColor> = {
  open: "blue",
  pending: "amber",
  settled: "emerald",
  won: "emerald",
  lost: "red",
  appealed: "orange",
  dormant: "gray",
  archived: "gray",
};

const STATUS_LABELS_DE: Record<string, string> = {
  open: "Offen",
  pending: "Wartend",
  settled: "Verglichen",
  won: "Gewonnen",
  lost: "Verloren",
  appealed: "Berufung",
  dormant: "Ruht",
  archived: "Archiviert",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  medium:
    "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)] border-[color:var(--ds-info-border)]",
  high: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] border-[color:var(--ds-warning-border)]",
  critical:
    "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]",
};

const FACETS: FacetConfig[] = [
  {
    key: "status",
    label: "Status",
    labelEn: "Status",
    icon: Briefcase,
    extract: (i) => (i.status ? [i.status] : []),
  },
  {
    key: "legalArea",
    label: "Rechtsgebiet",
    labelEn: "Legal Area",
    icon: Scale,
    extract: (i) => (i.legalArea ? [i.legalArea] : []),
  },
  {
    key: "priority",
    label: "Priorität",
    labelEn: "Priority",
    icon: AlertTriangle,
    extract: (i) => (i.priority ? [i.priority] : []),
  },
  {
    key: "jurisdiction",
    label: "Gerichtsbarkeit",
    labelEn: "Jurisdiction",
    icon: Globe,
    extract: (i) => (i.jurisdiction ? [i.jurisdiction] : []),
  },
  {
    key: "lawyer",
    label: "Bearbeiter",
    labelEn: "Lawyer",
    icon: Users,
    extract: (i) => (i.lawyerName ? [i.lawyerName] : []),
  },
  {
    key: "court",
    label: "Gericht",
    labelEn: "Court",
    icon: Gavel,
    extract: (i) => (i.courtName ? [i.courtName] : []),
  },
  {
    key: "tags",
    label: "Tags",
    labelEn: "Tags",
    icon: Tag,
    extract: (i) => i.tags,
  },
  {
    key: "conflictStatus",
    label: "Konflikt-Status",
    labelEn: "Conflict Status",
    icon: AlertTriangle,
    extract: (i) => (i.conflictStatus ? [i.conflictStatus] : []),
  },
];

function parseFacetItem(page: BrainPage): FacetItem {
  const fm = caseFrontmatter(page);
  return {
    slug: page.slug,
    title: page.title,
    caseNumber: fm.case_number || page.slug,
    status: fm.status || "open",
    legalArea: fm.legal_area || "",
    priority: fm.priority || "medium",
    jurisdiction: fm.jurisdiction || "",
    clientName: fm.client_name || undefined,
    opponentName: fm.opponent_name || undefined,
    courtName: fm.court_name || undefined,
    lawyerName: fm.own_lawyer_name || undefined,
    tags: fm.tags || [],
    conflictStatus:
      typeof fm.conflict_status === "string" ? (fm.conflict_status as string) : undefined,
    estimatedValue: fm.estimated_value,
    updatedAt: page.updated_at,
  };
}

export default function CaseSearchPage() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FacetFilters>({
    status: [],
    legalArea: [],
    priority: [],
    jurisdiction: [],
    lawyer: [],
    court: [],
    tags: [],
    conflictStatus: [],
  });
  const [expandedFacets, setExpandedFacets] = useState<Set<string>>(
    new Set(["status", "legalArea", "priority"])
  );
  const [sortBy, setSortBy] = useState<"updatedAt" | "title" | "priority">("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: items, isLoading } = useQuery<FacetItem[]>({
    queryKey: ["facet-cases"],
    queryFn: async () => {
      const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });
      return pages.map(parseFacetItem);
    },
    staleTime: 60_000,
  });

  // Build facet value counts
  const facetValues = useMemo(() => {
    const map: Record<string, Map<string, number>> = {};
    for (const facet of FACETS) {
      const counts = new Map<string, number>();
      for (const item of items ?? []) {
        for (const val of facet.extract(item)) {
          counts.set(val, (counts.get(val) ?? 0) + 1);
        }
      }
      map[facet.key] = counts;
    }
    return map;
  }, [items]);

  // Apply filters
  const filtered = useMemo(() => {
    if (!items) return [];
    let result = items;

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.caseNumber.toLowerCase().includes(q) ||
          i.legalArea.toLowerCase().includes(q) ||
          (i.clientName ?? "").toLowerCase().includes(q) ||
          (i.opponentName ?? "").toLowerCase().includes(q) ||
          (i.lawyerName ?? "").toLowerCase().includes(q) ||
          (i.courtName ?? "").toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Facet filters
    for (const facet of FACETS) {
      const selected = filters[facet.key];
      if (selected.length === 0) continue;
      result = result.filter((item) => {
        const vals = facet.extract(item);
        return selected.some((s) => vals.includes(s));
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") cmp = a.title.localeCompare(b.title);
      else if (sortBy === "priority") {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        cmp =
          (order[a.priority as keyof typeof order] ?? 2) -
          (order[b.priority as keyof typeof order] ?? 2);
      } else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, search, filters, sortBy, sortDir]);

  const activeFilterCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);

  const toggleFacet = (key: string) => {
    setExpandedFacets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFilter = (facetKey: keyof FacetFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [facetKey]: prev[facetKey].includes(value)
        ? prev[facetKey].filter((v) => v !== value)
        : [...prev[facetKey], value],
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      status: [],
      legalArea: [],
      priority: [],
      jurisdiction: [],
      lawyer: [],
      court: [],
      tags: [],
      conflictStatus: [],
    });
    setSearch("");
  };

  const fmtValue = (facetKey: string, value: string): string => {
    if (facetKey === "status") return STATUS_LABELS_DE[value] ?? value;
    if (facetKey === "jurisdiction") {
      const labels: Record<string, string> = {
        de: "Deutschland",
        at: "Österreich",
        ch: "Schweiz",
        eu: "EU",
      };
      return labels[value] ?? value.toUpperCase();
    }
    if (facetKey === "conflictStatus") {
      const labels: Record<string, string> = {
        conflict_pending: isEn ? "Pending" : "Prüfung offen",
        conflict_clear: isEn ? "Clear" : "Kein Konflikt",
        conflict_waived: isEn ? "Waived" : "Waiver erteilt",
      };
      return labels[value] ?? value;
    }
    return value;
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={isEn ? "Faceted Case Search" : "Fakettierte Akten-Suche"}
        description={
          isEn
            ? "Search and filter cases across multiple dimensions — status, legal area, priority, lawyer, court, tags, and more."
            : "Akten suchen und filtern über mehrere Dimensionen — Status, Rechtsgebiet, Priorität, Bearbeiter, Gericht, Tags und mehr."
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: isEn ? "Case Search" : "Akten-Suche" },
        ]}
      />

      {/* Search bar */}
      <div className="relative">
        <Search
          size={16}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            isEn
              ? "Search by title, case number, client, opponent, lawyer, court, tags..."
              : "Suche nach Titel, Aktenzeichen, Mandant, Gegner, Bearbeiter, Gericht, Tags..."
          }
          className="pl-10"
        />
      </div>

      <div className="flex gap-4">
        {/* Facet sidebar */}
        <aside className="hidden w-64 shrink-0 space-y-3 lg:block">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-[color:var(--ds-text-muted)]" />
              <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                {isEn ? "Filters" : "Filter"}
              </span>
              {activeFilterCount > 0 && (
                <Badge variant="default" className="text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <RotateCcw size={11} />
                {isEn ? "Clear" : "Zurücksetzen"}
              </button>
            )}
          </div>

          {FACETS.map((facet) => {
            const isExpanded = expandedFacets.has(facet.key);
            const values = Array.from(facetValues[facet.key]?.entries() ?? []).sort(
              (a, b) => b[1] - a[1]
            );
            if (values.length === 0) return null;
            const Icon = facet.icon;
            const selected = filters[facet.key];

            return (
              <div
                key={facet.key}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
              >
                <button
                  onClick={() => toggleFacet(facet.key)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Icon size={13} className="text-[color:var(--ds-text-muted)]" />
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      {isEn ? facet.labelEn : facet.label}
                    </span>
                    {selected.length > 0 && (
                      <span className="rounded-full bg-[color:var(--brand-primary)]/10 px-1.5 text-[10px] font-bold text-[color:var(--brand-primary)]">
                        {selected.length}
                      </span>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={13} className="text-[color:var(--ds-text-muted)]" />
                  ) : (
                    <ChevronDown size={13} className="text-[color:var(--ds-text-muted)]" />
                  )}
                </button>
                {isExpanded && (
                  <div className="max-h-48 space-y-0.5 overflow-y-auto px-2 pb-2">
                    {values.slice(0, 20).map(([value, count]) => {
                      const isSelected = selected.includes(value);
                      return (
                        <button
                          key={value}
                          onClick={() => toggleFilter(facet.key, value)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs transition-colors",
                            isSelected
                              ? "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]"
                              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                          )}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span
                              className={cn(
                                "flex h-3 w-3 shrink-0 items-center justify-center rounded border",
                                isSelected
                                  ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
                                  : "border-[color:var(--ds-border)]"
                              )}
                            >
                              {isSelected && (
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path
                                    d="M1 4l2 2 4-4"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </span>
                            <span className="truncate">{fmtValue(facet.key, value)}</span>
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums opacity-60">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {values.length > 20 && (
                      <p className="px-2 pt-1 text-[10px] text-[color:var(--ds-text-subtle)]">
                        {isEn ? `+${values.length - 20} more` : `+${values.length - 20} weitere`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Active filter chips + sort */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                {filtered.length} {isEn ? "results" : "Ergebnisse"}
              </span>
              {Object.entries(filters).map(([facetKey, selected]) =>
                selected.map((value: string) => (
                  <button
                    key={`${facetKey}-${value}`}
                    onClick={() => toggleFilter(facetKey as keyof FacetFilters, value)}
                    className="flex items-center gap-1 rounded-full border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/10"
                  >
                    {fmtValue(facetKey, value)}
                    <X size={10} />
                  </button>
                ))
              )}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-[10px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                >
                  {isEn ? "Clear all" : "Alle entfernen"}
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none"
              >
                <option value="updatedAt">{isEn ? "Last updated" : "Zuletzt aktualisiert"}</option>
                <option value="title">{isEn ? "Title" : "Titel"}</option>
                <option value="priority">{isEn ? "Priority" : "Priorität"}</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)]"
              >
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>

          {/* Results list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center">
              <Briefcase className="mx-auto mb-3 h-12 w-12 text-[color:var(--ds-text-muted)] opacity-40" />
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {activeFilterCount > 0 || search
                  ? isEn
                    ? "No cases match your filters."
                    : "Keine Akten entsprechen Ihren Filtern."
                  : isEn
                    ? "No cases found."
                    : "Keine Akten gefunden."}
              </p>
              {(activeFilterCount > 0 || search) && (
                <Button variant="secondary" className="mt-3 text-xs" onClick={clearAllFilters}>
                  <RotateCcw size={12} className="mr-1" />
                  {isEn ? "Clear filters" : "Filter zurücksetzen"}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => {
                const color = STATUS_COLORS[item.status] ?? "blue";
                return (
                  <Link
                    key={item.slug}
                    href={`/dashboard/cases/${encodeSlugPath(item.slug)}`}
                    className="group flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 transition-colors hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)]"
                  >
                    {/* Status icon */}
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        STATUS_BG[color],
                        STATUS_BORDER[color]
                      )}
                    >
                      <Briefcase size={14} className={STATUS_TEXT[color]} />
                    </div>

                    {/* Title + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {item.title}
                        </span>
                        <Badge
                          variant="default"
                          className={cn(
                            "shrink-0 border text-[10px]",
                            STATUS_BG[color],
                            STATUS_TEXT[color],
                            STATUS_BORDER[color]
                          )}
                        >
                          {STATUS_LABELS_DE[item.status] ?? item.status}
                        </Badge>
                        <Badge
                          variant="default"
                          className={cn(
                            "shrink-0 border text-[10px]",
                            PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium
                          )}
                        >
                          {item.priority}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[color:var(--ds-text-muted)]">
                        <span className="font-mono">{item.caseNumber}</span>
                        {item.legalArea && (
                          <span className="flex items-center gap-0.5">
                            <Scale size={9} />
                            {item.legalArea}
                          </span>
                        )}
                        {item.clientName && (
                          <span className="flex items-center gap-0.5">
                            <Users size={9} />
                            {item.clientName}
                          </span>
                        )}
                        {item.opponentName && (
                          <span className="text-[color:var(--ds-text-subtle)]">
                            vs. {item.opponentName}
                          </span>
                        )}
                        {item.lawyerName && (
                          <span className="text-[color:var(--ds-text-subtle)]">
                            · {item.lawyerName}
                          </span>
                        )}
                        {item.courtName && (
                          <span className="flex items-center gap-0.5">
                            <Gavel size={9} />
                            {item.courtName}
                          </span>
                        )}
                        {item.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="flex items-center gap-0.5 text-[color:var(--ds-text-subtle)]"
                          >
                            <Tag size={8} />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Updated date */}
                    <span className="shrink-0 text-[10px] text-[color:var(--ds-text-subtle)]">
                      {new Date(item.updatedAt).toLocaleDateString(isEn ? "en-GB" : "de-DE")}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
