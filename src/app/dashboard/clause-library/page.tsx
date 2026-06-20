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
  const [clauses, setClauses] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedClause, setSelectedClause] = useState<BrainPage | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  const loadClauses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pages = await api.brain.listPages({ type: "clause_library", limit: 200 });
      setClauses(pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klausel-Bibliothek konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClauses();
  }, [loadClauses]);

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

  async function createClause() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setCreating(true);
    try {
      await api.brain.createPage({
        slug: `clause/${newCategory}/${Date.now()}`,
        title: newTitle.trim(),
        type: "clause_library",
        content: newContent.trim(),
        frontmatter: { category: newCategory, tags: [newCategory] },
      });
      setNewTitle("");
      setNewContent("");
      setShowCreate(false);
      await loadClauses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klausel konnte nicht erstellt werden.");
    } finally {
      setCreating(false);
    }
  }

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
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Klausel-Bibliothek"
        description="Wiederverwendbare Klausel-Bausteine aus Ihrem Brain — kopieren, durchsuchen und in Verträge einfügen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Klausel-Bibliothek" }]}
        actions={
          <Button
            onClick={() => setShowCreate(!showCreate)}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Plus size={15} /> Neue Klausel
          </Button>
        }
      />

      {/* Create form */}
      {showCreate && (
        <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Klausel-Titel (z.B. Geheimhaltungsklausel)"
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
          >
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Klauseltext…"
            className="h-32 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-emerald-500/50 focus:outline-none"
          />
          <div className="flex gap-2">
            <Button
              onClick={createClause}
              disabled={creating || !newTitle.trim() || !newContent.trim()}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Speichern
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Klauseln durchsuchen…"
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
                "group cursor-pointer rounded-xl border p-4 transition-all",
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
              {copied ? "Kopiert" : "Kopieren"}
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
            {search
              ? "Keine Klauseln gefunden."
              : "Noch keine Klauseln in der Bibliothek. Erstellen Sie die erste Klausel."}
          </p>
        </div>
      )}
    </div>
  );
}
