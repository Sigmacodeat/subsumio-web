"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Library,
  Loader2,
  AlertTriangle,
  Plus,
  Search,
  Copy,
  Check,
  FileText,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { ClauseQuickCreateDialog } from "@/components/legal/ClauseQuickCreateDialog";

const CATEGORY_LABELS: Record<string, string> = {
  nda: "NDA",
  employment: "Arbeitsrecht",
  service: "Dienstleistung",
  sale: "Kaufvertrag",
  lease: "Mietvertrag",
  partnership: "Partnerschaft",
  licensing: "Lizenz",
  settlement: "Vergleich",
  general: "Allgemein",
};

export default function ClauseLibraryPage() {
  const { t } = useLang();
  const [clauses, setClauses] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedClause, setSelectedClause] = useState<BrainPage | null>(null);
  const [copied, setCopied] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const loadClauses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pages = await api.brain.listPages({ type: "clause_library", limit: 200 });
      setClauses(pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("clauses.toast_create_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadClauses();
  }, [loadClauses]);

  useEffect(() => {
    const handler = () => setQuickCreateOpen(true);
    window.addEventListener("subsumio:create-clause", handler);
    return () => window.removeEventListener("subsumio:create-clause", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clauses;
    const q = search.toLowerCase();
    return clauses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        c.tags?.some((t) => t.toLowerCase().includes(q)) ||
        (Array.isArray(c.frontmatter?.tags) &&
          (c.frontmatter!.tags as unknown[]).some(
            (t) => typeof t === "string" && t.toLowerCase().includes(q)
          ))
    );
  }, [clauses, search]);

  function copyClause(clause: BrainPage) {
    void navigator.clipboard.writeText(clause.content);
    setCopied(true);
    setSelectedClause(clause);
    setTimeout(() => setCopied(false), 2000);
  }

  const categories = useMemo(() => {
    const cats = new Set<string>();
    clauses.forEach((c) => {
      const fmTags = c.frontmatter?.tags;
      if (Array.isArray(fmTags))
        fmTags.forEach((t: unknown) => {
          if (typeof t === "string") cats.add(t);
        });
      c.tags?.forEach((t) => cats.add(t));
    });
    return Array.from(cats).sort();
  }, [clauses]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("clauses.title")}
        description={t("clauses.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("clauses.breadcrumb") },
        ]}
        actions={
          <Button
            onClick={() => setQuickCreateOpen(true)}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Plus size={15} /> {t("clauses.btn_create")}
          </Button>
        }
      />

      {/* Quick create dialog */}
      <ClauseQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={() => void loadClauses()}
      />

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("clauses.search_placeholder")}
          className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-10 text-[color:var(--ds-text)]"
        />
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant="default"
              className="cursor-pointer border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-2)]"
              onClick={() => setSearch(cat)}
            >
              <Tag size={9} className="mr-1" />
              {CATEGORY_LABELS[cat] ?? cat}
            </Badge>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      )}

      {/* Clause grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((clause) => (
            <div
              key={clause.slug}
              className={cn(
                "group cursor-pointer rounded-xl border p-4 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                selectedClause?.slug === clause.slug
                  ? "brand-border brand-soft"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
              )}
              onClick={() => setSelectedClause(clause)}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-[color:var(--ds-text-muted)]" />
                  <h3 className="line-clamp-1 text-sm font-medium text-[color:var(--ds-text)]">
                    {clause.title}
                  </h3>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyClause(clause);
                  }}
                  className="text-[color:var(--ds-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-emerald-600"
                >
                  {copied && selectedClause?.slug === clause.slug ? (
                    <Check size={14} className="text-emerald-600" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                {clause.content}
              </p>
              {clause.tags && clause.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {clause.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {CATEGORY_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
              {!clause.tags && Array.isArray(clause.frontmatter?.tags) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(clause.frontmatter!.tags as string[]).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {CATEGORY_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected clause detail */}
      {selectedClause && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {selectedClause.title}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyClause(selectedClause)}
              className="gap-1.5 text-xs"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              {copied ? t("clauses.btn_copy") : t("clauses.btn_copy")}
            </Button>
          </div>
          <div className="prose prose-sm max-w-none leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
            {selectedClause.content}
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="py-16 text-center">
          <Library
            size={40}
            className="mx-auto mb-3 text-[color:var(--ds-text-muted)] opacity-40"
          />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {search ? t("clauses.empty_title") : t("clauses.empty_hint")}
          </p>
        </div>
      )}
    </div>
  );
}
