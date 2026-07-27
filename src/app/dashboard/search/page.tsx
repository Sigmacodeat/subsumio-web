"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Search,
  FileText,
  Briefcase,
  Clock,
  FileSearch,
  MessageSquare,
  Receipt,
  FolderOpen,
  Loader2,
  X,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { SearchResult as EngineSearchResult } from "@/lib/types";

type ScopeFilter =
  | "all"
  | "case"
  | "document"
  | "deadline"
  | "note"
  | "invoice"
  | "chat"
  | "contact";

interface DisplayResult {
  slug: string;
  title: string;
  type: string;
  snippet: string;
  score: number;
  source?: string;
}

const SCOPE_CONFIG: Array<{
  id: ScopeFilter;
  labelKey: DashboardKey;
  icon: typeof FileText;
  types: string[];
}> = [
  { id: "all", labelKey: "search.scope_all", icon: Search, types: [] },
  { id: "case", labelKey: "search.scope_cases", icon: Briefcase, types: ["legal_case", "case"] },
  {
    id: "document",
    labelKey: "search.scope_documents",
    icon: FileText,
    types: ["legal_document", "document"],
  },
  {
    id: "deadline",
    labelKey: "search.scope_deadlines",
    icon: Clock,
    types: ["legal_deadline", "deadline"],
  },
  { id: "note", labelKey: "search.scope_notes", icon: FileSearch, types: ["note", "legal_note"] },
  { id: "invoice", labelKey: "search.scope_invoices", icon: Receipt, types: ["invoice"] },
  {
    id: "chat",
    labelKey: "search.scope_chats",
    icon: MessageSquare,
    types: ["chat_inbox", "chat_outbox", "conversation_event"],
  },
  {
    id: "contact",
    labelKey: "search.scope_contacts",
    icon: FolderOpen,
    types: ["contact", "client"],
  },
];

function matchType(pageType: string, scope: ScopeFilter): boolean {
  if (scope === "all") return true;
  const config = SCOPE_CONFIG.find((s) => s.id === scope);
  if (!config) return true;
  return config.types.some((t) => pageType === t || pageType.startsWith(t));
}

function getScopeIcon(type: string): typeof FileText {
  for (const scope of SCOPE_CONFIG) {
    if (scope.id === "all") continue;
    if (scope.types.some((t) => type === t || type.startsWith(t))) {
      return scope.icon;
    }
  }
  return FileText;
}

function inferTypeFromSlug(slug: string): string {
  if (slug.includes("legal/case") || slug.includes("cases/")) return "legal_case";
  if (slug.includes("legal/document") || slug.includes("documents/")) return "legal_document";
  if (slug.includes("legal/deadline") || slug.includes("deadlines/")) return "legal_deadline";
  if (slug.includes("invoice")) return "invoice";
  if (slug.includes("chat/whatsapp")) return "chat_inbox";
  if (slug.includes("contact") || slug.includes("client")) return "contact";
  if (slug.includes("note")) return "note";
  return "page";
}

function getHref(result: DisplayResult): string {
  const type = result.type;
  if (type === "legal_case" || type === "case") {
    return `/dashboard/cases/${encodeURIComponent(result.slug)}`;
  }
  if (type === "legal_document" || type === "document") {
    return `/dashboard/documents/${encodeURIComponent(result.slug)}`;
  }
  if (type === "legal_deadline" || type === "deadline") {
    return `/dashboard/deadlines`;
  }
  if (type === "invoice") {
    return `/dashboard/invoices`;
  }
  if (type === "chat_inbox" || type === "chat_outbox") {
    return `/dashboard/whatsapp`;
  }
  return `/dashboard/pages/${encodeURIComponent(result.slug)}`;
}

export default function GlobalSearchPage() {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const raw = await api.brain.search(q, 50);
      const mapped: DisplayResult[] = raw.map((r: EngineSearchResult) => ({
        slug: r.slug,
        title: r.title,
        type: r.source ?? inferTypeFromSlug(r.slug),
        snippet: r.snippet,
        score: r.score,
        source: r.source,
      }));
      setResults(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredResults = useMemo(() => {
    if (scope === "all") return results;
    return results.filter((r) => matchType(r.type, scope));
  }, [results, scope]);

  const scopeCounts = useMemo(() => {
    const counts: Record<ScopeFilter, number> = {
      all: results.length,
      case: 0,
      document: 0,
      deadline: 0,
      note: 0,
      invoice: 0,
      chat: 0,
      contact: 0,
    };
    for (const r of results) {
      for (const s of SCOPE_CONFIG) {
        if (s.id === "all") continue;
        if (matchType(r.type, s.id)) counts[s.id]++;
      }
    }
    return counts;
  }, [results]);

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("search.title" as DashboardKey)}
        description={t("search.description" as DashboardKey)}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("search.title" as DashboardKey) },
        ]}
      />

      {/* Search input */}
      <div className="relative">
        <Search
          size={18}
          className="absolute top-1/2 left-4 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void doSearch(query);
          }}
          placeholder={t("search.placeholder" as DashboardKey)}
          className="h-12 pr-12 pl-12 text-base"
          autoFocus
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setHasSearched(false);
            }}
            aria-label="Suche zurücksetzen"
            className="absolute top-1/2 right-4 -translate-y-1/2 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Scope filters */}
      {hasSearched && (
        <div className="flex flex-wrap gap-2">
          {SCOPE_CONFIG.map((s) => {
            const count = scopeCounts[s.id];
            const Icon = s.icon;
            const isActive = scope === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                <Icon size={12} />
                {t(s.labelKey)}
                {count > 0 && (
                  <Badge variant="default" className="ml-1 text-xs opacity-70">
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      )}

      {/* Results */}
      {!loading && hasSearched && filteredResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search size={32} className="mb-2 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {t("search.no_results" as DashboardKey)}
          </p>
        </div>
      )}

      {!loading && filteredResults.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {filteredResults.length} {t("search.results_count" as DashboardKey)}
          </div>
          {filteredResults.map((result) => {
            const Icon = getScopeIcon(result.type);
            const snippet = result.snippet || "";
            const caseNumber = undefined;
            const status = undefined;

            return (
              <Link
                key={result.slug}
                href={getHref(result)}
                className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 transition-colors hover:bg-[color:var(--ds-surface-2)]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
                  <Icon size={14} className="text-[color:var(--ds-text-muted)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {result.title}
                    </span>
                    {caseNumber && (
                      <Badge variant="default" className="shrink-0 text-xs">
                        {caseNumber}
                      </Badge>
                    )}
                    {status && (
                      <Badge variant="default" className="shrink-0 text-xs opacity-70">
                        {status}
                      </Badge>
                    )}
                  </div>
                  {snippet && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                      {snippet}
                    </p>
                  )}
                  <div className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                    {result.type.replace(/_/g, " ")}
                    {result.score !== undefined && ` · ${Math.round(result.score * 100)}%`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty state - not searched yet */}
      {!hasSearched && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search size={48} className="mb-3 text-[color:var(--ds-border)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {t("search.hint" as DashboardKey)}
          </p>
        </div>
      )}
    </div>
  );
}
