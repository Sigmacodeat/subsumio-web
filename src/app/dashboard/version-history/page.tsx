"use client";

import { useState, useCallback } from "react";
import { History, Loader2, AlertTriangle, Search, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  "case.update": "Bearbeitet",
  "case.create": "Erstellt",
  "case.delete": "Gelöscht",
  "document.delete": "Gelöscht",
  "document.upload": "Hochgeladen",
  "document.review": "Review",
  "brain.write": "Brain-Write",
  "brain.delete": "Brain-Delete",
};

const ACTION_COLORS: Record<string, string> = {
  "case.create": "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  "case.update": "bg-blue-500/10 border-blue-500/20 text-blue-600",
  "case.delete": "bg-red-500/10 border-red-500/20 text-red-600",
  "document.delete": "bg-red-500/10 border-red-500/20 text-red-600",
  "document.upload": "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
};

export default function VersionHistoryPage() {
  const { lang } = useLang();
  const [slug, setSlug] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState<BrainPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!slug.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const [pageData, auditData] = await Promise.all([
        api.brain.getPage(slug.trim()).catch(() => null),
        fetch("/api/audit?entityType=page&limit=200")
          .then((r) => r.json())
          .catch(() => ({ entries: [] })),
      ]);

      if (pageData) {
        setPage(pageData as BrainPage);
        const allEntries = (auditData as { entries?: AuditEntry[] }).entries ?? [];
        const filtered = allEntries.filter((e) => e.entityId === slug.trim());
        setEntries(filtered);
      } else {
        setPage(null);
        const allEntries = (auditData as { entries?: AuditEntry[] }).entries ?? [];
        const filtered = allEntries.filter((e) => e.entityId === slug.trim());
        setEntries(filtered);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Versionshistorie konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const currentVersion =
    typeof page?.frontmatter?.version === "number" ? page.frontmatter.version : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Versionshistorie"
        description="Änderungshistorie einer Brain-Page — Audit-Trail mit Versionierung"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Versionshistorie" }]}
      />

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
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
            placeholder="Page-Slug eingeben (z.B. case/mustermann-vs-beispiel)"
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-10 text-[color:var(--ds-text)]"
          />
        </div>
        <Button
          onClick={search}
          disabled={loading || !slug.trim()}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Suchen
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
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
              <div className="mt-1 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                <span className="font-mono">{page.slug}</span>
                <span>·</span>
                <span>{page.type ?? "page"}</span>
                {currentVersion !== undefined && (
                  <>
                    <span>·</span>
                    <Badge
                      variant="default"
                      className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
                    >
                      v{currentVersion}
                    </Badge>
                  </>
                )}
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(page.updated_at).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
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
                        ? "border-emerald-500"
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
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      variant="default"
                      className={cn(
                        "border text-xs",
                        ACTION_COLORS[entry.action] ??
                          "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                      <Clock size={10} />
                      {new Date(entry.timestamp).toLocaleString(lang === "en" ? "en-GB" : "de-DE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  {entry.details && (
                    <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {Object.entries(entry.details)
                        .slice(0, 4)
                        .map(([k, v]) => (
                          <span key={k} className="mr-3 inline-flex items-center gap-1">
                            <span className="font-mono text-[color:var(--ds-text-subtle)]">
                              {k}:
                            </span>
                            <span>{typeof v === "string" ? v : JSON.stringify(v)}</span>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {searched && !loading && entries.length === 0 && !error && (
        <div className="py-16 text-center">
          <History
            size={40}
            className="mx-auto mb-3 text-[color:var(--ds-text-muted)] opacity-40"
          />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Keine Änderungshistorie für{" "}
            <code className="rounded bg-[color:var(--ds-hover)] px-1 text-xs">{slug}</code>{" "}
            gefunden.
          </p>
        </div>
      )}
    </div>
  );
}
