"use client";

import { useState, useCallback, useEffect } from "react";
import {
  History,
  Loader2,
  AlertTriangle,
  Search,
  FileText,
  User,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

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
        fetch("/api/audit?entityType=page&limit=200").then((r) => r.json()).catch(() => ({ entries: [] })),
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

  const currentVersion = typeof page?.frontmatter?.version === "number" ? page.frontmatter.version : undefined;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Versionshistorie"
        description="Änderungshistorie einer Brain-Page — Audit-Trail mit Versionierung"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Versionshistorie" }]}
      />

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="Page-Slug eingeben (z.B. case/mustermann-vs-beispiel)"
            className="pl-10 bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)]"
          />
        </div>
        <Button onClick={search} disabled={loading || !slug.trim()} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Suchen
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Page info */}
      {page && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-start gap-3">
            <FileText size={18} className="text-[color:var(--ds-text-muted)] mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)] truncate">{page.title}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-[color:var(--ds-text-muted)]">
                <span className="font-mono">{page.slug}</span>
                <span>·</span>
                <span>{page.type ?? "page"}</span>
                {currentVersion !== undefined && (
                  <>
                    <span>·</span>
                    <Badge variant="default" className="text-xs bg-emerald-500/10 border-emerald-500/20 text-emerald-600">
                      v{currentVersion}
                    </Badge>
                  </>
                )}
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(page.updated_at).toLocaleDateString("de-DE", { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {entries.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold mb-4 flex items-center gap-2">
            <History size={14} /> Änderungshistorie ({entries.length})
          </h3>
          <div className="space-y-0">
            {entries.map((entry, i) => (
              <div key={entry.id} className="flex gap-4">
                {/* Timeline dot + line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={cn(
                    "w-3 h-3 rounded-full border-2 mt-1",
                    ACTION_COLORS[entry.action] ? "border-emerald-500" : "border-[color:var(--ds-border-strong)]",
                  )} />
                  {i < entries.length - 1 && <div className="w-px flex-1 bg-[color:var(--ds-border)] my-1" style={{ minHeight: "40px" }} />}
                </div>

                {/* Content */}
                <div className="flex-1 pb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="default" className={cn("text-xs border", ACTION_COLORS[entry.action] ?? "bg-[color:var(--ds-hover)] border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]")}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                    <span className="text-xs text-[color:var(--ds-text-muted)] flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(entry.timestamp).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                  {entry.details && (
                    <div className="text-xs text-[color:var(--ds-text-muted)] mt-1">
                      {Object.entries(entry.details).slice(0, 4).map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-1 mr-3">
                          <span className="font-mono text-[color:var(--ds-text-subtle)]">{k}:</span>
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
        <div className="text-center py-16">
          <History size={40} className="mx-auto text-[color:var(--ds-text-muted)] opacity-40 mb-3" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Keine Änderungshistorie für <code className="text-xs bg-[color:var(--ds-hover)] px-1 rounded">{slug}</code> gefunden.
          </p>
        </div>
      )}
    </div>
  );
}
