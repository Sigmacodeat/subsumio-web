"use client";

import { useState, useCallback } from "react";
import { History, Loader2, AlertTriangle, Search, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

const ACTION_LABELS: Record<string, string> = {
  "case.update": "vhist.case_update",
  "case.create": "vhist.case_create",
  "case.delete": "vhist.case_delete",
  "document.delete": "vhist.doc_delete",
  "document.upload": "vhist.doc_upload",
  "document.review": "vhist.doc_review",
} as const;

/** Actions without a dictionary key — plain German labels, never the raw code. */
const PLAIN_ACTION_LABELS: Record<string, string> = {
  "brain.write": "Gespeichert",
  "brain.delete": "Gelöscht",
};

const ACTION_COLORS: Record<string, string> = {
  "case.create":
    "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
  "case.update":
    "bg-[color:var(--ds-info-bg)] border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]",
  "case.delete":
    "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
  "document.delete":
    "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
  "document.upload":
    "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
};

export default function VersionHistoryPage() {
  const { t } = useLang();
  const [slug, setSlug] = useState("");
  const [candidates, setCandidates] = useState<BrainPage[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState<BrainPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const loadHistory = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setSearched(true);
    setCandidates([]);
    try {
      const [pageData, auditData] = await Promise.all([
        api.brain.getPage(target).catch(() => null),
        fetch("/api/audit?entityType=page&limit=200", { signal: AbortSignal.timeout(30_000) })
          .then((r) => (r.ok ? r.json() : { entries: [] }))
          .catch(() => ({ entries: [] })),
      ]);

      if (pageData) {
        setPage(pageData as BrainPage);
        const allEntries = (auditData as { entries?: AuditEntry[] }).entries ?? [];
        const filtered = allEntries.filter((e) => e.entityId === target);
        setEntries(filtered);
      } else {
        setPage(null);
        const allEntries = (auditData as { entries?: AuditEntry[] }).entries ?? [];
        const filtered = allEntries.filter((e) => e.entityId === target);
        setEntries(filtered);
      }
    } catch {
      setError(t("vhist.err_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Lawyers search by title; an exact identifier still works as before.
  const search = useCallback(async () => {
    const q = slug.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setPage(null);
    setEntries([]);
    const matches = await api.brain.listPages({ q, limit: 10 }).catch(() => [] as BrainPage[]);
    if (matches.length === 1) {
      await loadHistory(matches[0].slug);
    } else if (matches.length > 1) {
      setCandidates(matches);
      setSearched(false);
      setLoading(false);
    } else {
      await loadHistory(q);
    }
  }, [slug, loadHistory]);

  const currentVersion =
    typeof page?.frontmatter?.version === "number" ? page.frontmatter.version : undefined;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("vhist.title")}
        description={t("vhist.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("vhist.title") },
        ]}
      />

      {/* Search */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder={t("vhist.search_placeholder")}
            aria-label={t("vhist.search_placeholder")}
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-10 text-[color:var(--ds-text)]"
          />
        </div>
        <Button
          onClick={search}
          disabled={loading || !slug.trim()}
          className="gap-2 whitespace-nowrap"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Suchen
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2">
          <p className="px-2 py-1.5 text-xs text-[color:var(--ds-text-muted)]">
            {candidates.length} Treffer — bitte wählen Sie ein Dokument:
          </p>
          <ul>
            {candidates.map((c) => (
              <li key={c.slug}>
                <button
                  type="button"
                  onClick={() => void loadHistory(c.slug)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                >
                  <FileText size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                  <span className="truncate">{c.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Page info */}
      {page && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-start gap-3">
            <FileText size={18} className="mt-0.5 text-[color:var(--ds-text-muted)]" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
                {page.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                {currentVersion !== undefined && (
                  <Badge variant="default" className="text-xs tabular-nums">
                    Version {currentVersion}
                  </Badge>
                )}
                <span className="flex items-center gap-1 tabular-nums">
                  <Clock size={10} />
                  Zuletzt geändert {formatDate(page.updated_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {entries.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
            <History size={14} /> Änderungshistorie ({entries.length})
          </h3>
          <div className="space-y-0">
            {entries.map((entry, i) => (
              <div key={entry.id} className="flex gap-4">
                {/* Timeline dot + line */}
                <div className="flex shrink-0 flex-col items-center">
                  <div
                    className={cn(
                      "mt-1 h-3 w-3 rounded-full border-2",
                      ACTION_COLORS[entry.action]
                        ? "border-[color:var(--ds-success-solid)]"
                        : "border-[color:var(--ds-border-strong)]"
                    )}
                  />
                  {i < entries.length - 1 && (
                    <div
                      className="my-1 w-px flex-1 bg-[color:var(--ds-border)]"
                      style={{ minHeight: "40px" }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-6">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="default"
                      className={cn(
                        "border text-xs",
                        ACTION_COLORS[entry.action] ??
                          "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {ACTION_LABELS[entry.action]
                        ? t(ACTION_LABELS[entry.action] as never)
                        : (PLAIN_ACTION_LABELS[entry.action] ?? "Änderung")}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                      <Clock size={10} />
                      {formatDateTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {searched && !loading && entries.length === 0 && !error && (
        <EmptyState
          icon={History}
          title="Keine Änderungen gefunden"
          description={
            page
              ? `Für „${page.title}“ sind keine protokollierten Änderungen vorhanden.`
              : "Zu diesem Suchbegriff wurde kein Dokument gefunden."
          }
          actionLabel="Neue Suche"
          onAction={() => {
            setSlug("");
            setSearched(false);
            setPage(null);
          }}
        />
      )}
    </div>
  );
}
