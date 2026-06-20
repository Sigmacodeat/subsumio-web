"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray } from "react-hook-form";
import {
  Search,
  Loader2,
  FileText,
  X,
  Trash2,
  Download,
  Sparkles,
  Table2,
  Filter,
  Clock,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { BrainPage, TabularReviewResponse } from "@/lib/types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useDashboardForm } from "@/lib/hooks/use-dashboard-form";
import { vaultReviewSchema } from "@/lib/schemas/vault";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePaginatedList } from "@/lib/hooks/use-pagination";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/dashboard/page-header";
import { RotateCcw } from "lucide-react";

interface VaultDoc {
  slug: string;
  title: string;
  type: string;
  source?: string;
  tags: string[];
  size?: number;
  createdAt: string;
  content: string;
}

const TYPE_LABELS: Record<string, string> = {
  legal_case: "Akte",
  legal_contract: "Vertrag",
  legal_document: "Dokument",
  bea_message: "beA-Nachricht",
  court_decision: "Urteil",
  invoice: "Rechnung",
  contact: "Kontakt",
  evidence: "Beweismittel",
};

const TYPE_COLORS: Record<string, string> = {
  legal_case: "brand-soft brand-border brand-text",
  legal_contract: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  legal_document: "bg-blue-500/10 border-blue-500/20 text-blue-600",
  bea_message: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  court_decision: "bg-red-500/10 border-red-500/20 text-red-600",
  invoice: "bg-cyan-500/10 border-cyan-500/20 text-cyan-600",
  contact: "bg-pink-500/10 border-pink-500/20 text-pink-600",
  evidence: "bg-orange-500/10 border-orange-500/20 text-orange-600",
};

function parseDoc(page: BrainPage): VaultDoc {
  const fm = page.frontmatter ?? {};
  return {
    slug: page.slug,
    title: page.title,
    type: page.type || "legal_document",
    source: (fm.source as string) || undefined,
    tags: page.tags || [],
    size: (fm.size as number) || undefined,
    createdAt: (page as unknown as Record<string, unknown>).createdAt as string || (page as unknown as Record<string, unknown>).created_at as string || new Date().toISOString(),
    content: page.content || "",
  };
}

export default function VaultPage() {
  const confirm = useConfirm();
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");

  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [showReview, setShowReview] = useState(false);
  const [reviewResult, setReviewResult] = useState<TabularReviewResponse | null>(null);

  const reviewForm = useDashboardForm({
    schema: vaultReviewSchema,
    defaultValues: {
      questions: [
        "Welche Fristen werden genannt?",
        "Welche Parteien sind beteiligt?",
        "Gibt es Haftungsklauseln?",
      ],
    },
    onSubmit: async (data) => {
      if (selectedSlugs.size === 0) {
        throw new Error("Mindestens ein Dokument auswählen.");
      }
      const qs = data.questions.map((q) => q.trim()).filter(Boolean);
      const res = await api.legal.tabularReview({ slugs: Array.from(selectedSlugs), questions: qs });
      setReviewResult(res);
      if (res.rows.length === 0) {
        throw new Error("Keine Ergebnisse.");
      }
    },
  });

  const { fields, append, remove } = useFieldArray({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control: reviewForm.form.control as any,
    name: "questions",
  });

  useEffect(() => { loadDocs(); }, []);

  async function loadDocs() {
    setLoading(true); setLoadError(null);
    try {
      const pages = await api.brain.listPages({ limit: 200 });
      const nextDocs = pages.map(parseDoc);
      setDocs(nextDocs);
      await setCache(OFFLINE_KEYS.vault, nextDocs);
    } catch (err) {
      const cached = await getCache<VaultDoc[]>(OFFLINE_KEYS.vault);
      if (cached) {
        setDocs(cached);
        setLoadError("Cloud-Brain gerade nicht erreichbar. Es werden zwischengespeicherte Dokumente angezeigt.");
      } else {
        setLoadError(err instanceof Error ? err.message : "Dokumente konnten nicht geladen werden.");
      }
    } finally { setLoading(false); }
  }

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    docs.forEach((d) => d.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [docs]);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    docs.forEach((d) => types.add(d.type));
    return Array.from(types).sort();
  }, [docs]);

  const filtered = useMemo(() => {
    let result = docs;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
    }
    if (typeFilter) result = result.filter((d) => d.type === typeFilter);
    if (tagFilter) result = result.filter((d) => d.tags.includes(tagFilter));
    return result;
  }, [docs, query, typeFilter, tagFilter]);

  const reviewLoading = reviewForm.status === "submitting";

  const { items: paginatedDocs, page, totalPages, setPage, startIndex, endIndex } = usePaginatedList(filtered, 24);

  async function deleteDoc(slug: string) {
    const ok = await confirm({
      title: "Dokument löschen",
      message: "Möchten Sie dieses Dokument wirklich löschen?",
      confirmLabel: "Löschen",
      variant: "danger",
    });
    if (!ok) return;
    try {
      if (isOnline()) {
        await api.brain.deletePage(slug);
      } else {
        await enqueueMutation({ type: "deletePage", payload: { slug } });
      }
      const nextDocs = docs.filter((d) => d.slug !== slug);
      setDocs(nextDocs);
      await setCache(OFFLINE_KEYS.vault, nextDocs);
      setSelectedSlugs((s) => { const ns = new Set(s); ns.delete(slug); return ns; });
    }
    catch (err) { setLoadError(err instanceof Error ? err.message : "Löschen fehlgeschlagen."); }
  }

  function toggleSelect(slug: string) {
    setSelectedSlugs((s) => { const ns = new Set(s); if (ns.has(slug)) ns.delete(slug); else ns.add(slug); return ns; });
  }

  function selectAll() {
    setSelectedSlugs(new Set(filtered.map((d) => d.slug)));
  }

  function deselectAll() {
    setSelectedSlugs(new Set());
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Dokumenten-Vault"
        description="Zentraler Dokumentenspeicher mit Bulk-Analyse und Review Tables"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Dokumenten-Vault" }]}
        actions={
          selectedSlugs.size > 0 ? (
            <Button variant="secondary" className="bg-[color:var(--ds-hover)] border border-[color:var(--ds-border)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] gap-2" onClick={() => setShowReview(!showReview)}>
              <Table2 size={14} /> Bulk-Review ({selectedSlugs.size})
            </Button>
          ) : undefined
        }
      />

      {showReview && (
        <form onSubmit={reviewForm.handleSubmit} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Bulk-Analyse über {selectedSlugs.size} ausgewählte Dokumente</h3>
            <button type="button" onClick={() => setShowReview(false)} className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"><X size={16} /></button>
          </div>
          {reviewForm.error && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertTriangle size={14} /> {reviewForm.error}
            </div>
          )}
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  {...reviewForm.form.register(`questions.${i}`)}
                  placeholder={`Frage ${i + 1}`}
                  className="flex-1 bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                />
                <button type="button" onClick={() => remove(i)} className="text-[color:var(--ds-text-muted)] hover:text-red-600"><X size={14} /></button>
              </div>
            ))}
            {fields.length < 8 && (
              <button type="button" onClick={() => append("")} className="text-xs brand-text hover:underline">+ Frage hinzufügen</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={reviewLoading} className="brand-bg brand-bg text-white gap-2">
              {reviewLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {reviewLoading ? "Wird analysiert…" : "Bulk-Review starten"}
            </Button>
            {reviewResult && reviewResult.rows.length > 0 && (
              <Button type="button" variant="secondary" className="bg-[color:var(--ds-hover)] border border-[color:var(--ds-border)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] gap-2" onClick={() => {
                const csv = [["Dokument", ...reviewResult.questions].join(";"), ...reviewResult.rows.map((r) => [r.title, ...r.cells.map((cell) => cell.answer.replace(/"/g, '""'))].join(";"))].join("\n");
                const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `vault-review-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
              }}><Download size={14} /> CSV Export</Button>
            )}
          </div>
          {reviewResult && reviewResult.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[color:var(--ds-border)]"><th className="text-left px-3 py-2 text-[color:var(--ds-text-muted)] font-medium">Dokument</th>{reviewResult.questions.map((q, i) => <th key={i} className="text-left px-3 py-2 text-[color:var(--ds-text-muted)] font-medium min-w-[200px]">{q}</th>)}</tr></thead>
                <tbody>{reviewResult.rows.map((row, i) => <tr key={i} className="border-b border-[color:var(--ds-border)]/50 hover:bg-[color:var(--ds-hover)]"><td className="px-3 py-2 text-[color:var(--ds-text)] whitespace-nowrap">{row.title}</td>{row.cells.map((cell, j) => <td key={j} className="px-3 py-2 text-[color:var(--ds-text-muted)] max-w-xs truncate" title={cell.answer}>{cell.answer}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </form>
      )}

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Dokumente durchsuchen…" aria-label="Dokumente durchsuchen" className="w-full bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:border-[color:var(--brand-primary)] transition-all" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-[color:var(--ds-text-subtle)]" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:border-[color:var(--brand-primary)] transition-all">
            <option value="">Alle Typen</option>
            {allTypes.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:border-[color:var(--brand-primary)] transition-all">
            <option value="">Alle Tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {selectedSlugs.size > 0 && (
        <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
          <span>{selectedSlugs.size} ausgewählt</span>
          <button onClick={selectAll} className="brand-text hover:underline">Alle auswählen</button>
          <button onClick={deselectAll} className="brand-text hover:underline">Alle abwählen</button>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadDocs()} className="text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10 gap-1.5 shrink-0">
            <RotateCcw size={13} /> Erneut versuchen
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Lädt">
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)]">
          <div className="w-16 h-16 rounded-2xl bg-[color:var(--ds-surface-2)] flex items-center justify-center mb-5">
            <FileText size={26} className="text-[color:var(--ds-text-subtle)]" />
          </div>
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">Keine Dokumente gefunden</h3>
          <p className="mt-2 text-xs text-[color:var(--ds-text-muted)] max-w-sm leading-relaxed">
            {docs.length === 0 ? "Lade Dokumente über den Upload-Bereich hoch." : "Passe deine Suche oder Filter an."}
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {paginatedDocs.map((doc) => (
            <div key={doc.slug} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-2.5 group hover:border-[color:var(--ds-border-strong)] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selectedSlugs.has(doc.slug)} onChange={() => toggleSelect(doc.slug)} className="accent-[var(--brand-primary)]" />
                  <Badge variant="default" className={`text-[10px] border ${TYPE_COLORS[doc.type] || "bg-[color:var(--ds-hover)] border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]"}`}>
                    {TYPE_LABELS[doc.type] || doc.type}
                  </Badge>
                </div>
                <button onClick={() => deleteDoc(doc.slug)} className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-[color:var(--ds-text-muted)] hover:text-red-600 hover:bg-red-500/10 transition-all" title="Löschen">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="text-sm font-medium text-[color:var(--ds-text)] truncate" title={doc.title}>{doc.title}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)] line-clamp-2 leading-relaxed">{doc.content.slice(0, 120)}…</div>
              {doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {doc.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--ds-hover)] border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]"><Tag size={9} />{t}</span>)}
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-[color:var(--ds-text-muted)]">
                <span className="flex items-center gap-1"><Clock size={10} />{new Date(doc.createdAt).toLocaleDateString("de-DE")}</span>
                {doc.size && <span>{(doc.size / 1024).toFixed(0)} KB</span>}
              </div>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-1 py-3 text-sm">
            <span className="text-[color:var(--ds-text-muted)]">
              {startIndex + 1}–{endIndex} von {filtered.length}
            </span>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
        </>
      )}
    </div>
  );
}
