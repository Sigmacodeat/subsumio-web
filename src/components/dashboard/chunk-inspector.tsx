"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Download,
  FileText,
  Zap,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  Pencil,
  Save,
  Trash2,
  RefreshCw,
  Flag,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

// ── Types ────────────────────────────────────────────────────────────────

interface ChunkRow {
  id: string;
  chunkIndex: number;
  chunkRole: string;
  chunkTextPreview: string;
  chunkLength: number;
  court: string | null;
  ecli: string | null;
  caseNumber: string | null;
  statuteAbbr: string | null;
  paragraphRef: string | null;
  embeddingStatus: "embedded" | "pending";
  pageSlug: string;
  pageTitle: string;
  sourceId: string;
}

interface ChunkDetail {
  id: string;
  chunkIndex: number;
  chunkRole: string;
  chunkText: string;
  chunkLength: number;
  court: string | null;
  ecli: string | null;
  caseNumber: string | null;
  statuteAbbr: string | null;
  paragraphRef: string | null;
  documentType: string | null;
  legalArea: string | null;
  decisionDate: string | null;
  embeddingStatus: "embedded" | "pending";
  embeddedAt: string | null;
  model: string | null;
  tokenCount: number | null;
  pageId: string;
  pageSlug: string;
  pageTitle: string;
  sourceId: string;
  chunkerVersion: number | null;
  frontmatter: Record<string, unknown> | null;
}

interface ListResponse {
  data: ChunkRow[];
  meta: { page: number; limit: number; total: number };
}

const API_BASE = "/api/admin/chunk-inspector";

const ROLE_OPTIONS = [
  { value: "all", label: "Alle Rollen" },
  { value: "leitsatz", label: "Leitsatz" },
  { value: "entscheidungsgruende", label: "Entscheidungsgründe" },
  { value: "tenor", label: "Tenor" },
  { value: "sachverhalt", label: "Sachverhalt" },
  { value: "metadata", label: "Metadaten" },
  { value: "full", label: "Volltext" },
  { value: "entscheidungstext", label: "Entscheidungstext" },
  { value: "absatz", label: "Absatz" },
  { value: "remainder", label: "Rest" },
];

const ROLE_LABELS: Record<string, string> = {
  leitsatz: "Leitsatz",
  entscheidungsgruende: "Entscheidungsgründe",
  tenor: "Tenor",
  sachverhalt: "Sachverhalt",
  metadata: "Metadaten",
  full: "Volltext",
  entscheidungstext: "Entscheidungstext",
  absatz: "Absatz",
  remainder: "Rest",
};

const SOURCE_OPTIONS = [
  { value: "all", label: "Alle Sources" },
  { value: "law-at-normen", label: "AT Normen" },
  { value: "law-at-landesrecht", label: "AT Landesrecht" },
  { value: "law-at-judikatur", label: "AT Judikatur (OGH)" },
  { value: "law-at-judikatur-vwgh", label: "VwGH" },
  { value: "law-at-judikatur-vfgh", label: "VfGH" },
  { value: "law-at-judikatur-lvwg", label: "LVwG" },
  { value: "law-at-judikatur-bvwg", label: "BVwG" },
  { value: "law-at-judikatur-asylgh", label: "AsylGH" },
  { value: "law-at-judikatur-uvs", label: "UVS" },
  { value: "law-at-judikatur-ubas", label: "UBAS" },
  { value: "law-at-judikatur-dsk", label: "DSK" },
  { value: "law-at-judikatur-dok", label: "DOK" },
  { value: "law-at-judikatur-gbk", label: "GBK" },
  { value: "law-at-judikatur-pvak", label: "PVAK" },
  { value: "law-at-judikatur-umse", label: "UMSE" },
  { value: "law-at-gemeinden", label: "Gemeinden" },
  { value: "law-at-bezirke", label: "Bezirke" },
  { value: "law-at-bmerl", label: "Erlasse" },
  { value: "law-at-avn", label: "AVN" },
  { value: "law-at-avsv", label: "AVSV" },
  { value: "law-at-staatsvertraege", label: "Staatsverträge" },
  { value: "law-at-spg", label: "SPG" },
  { value: "law-at-kmger", label: "KmGer" },
  { value: "law-at-literatur", label: "Literatur" },
  { value: "law-at", label: "AT Spezialgesetze" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "length_asc", label: "Länge ↑ (kürzeste)" },
  { value: "length_desc", label: "Länge ↓ (längste)" },
  { value: "role", label: "Rolle A→Z" },
];

const ROLE_COLORS: Record<string, string> = {
  leitsatz: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  entscheidungsgruende: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  tenor: "bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  sachverhalt:
    "bg-[color:var(--ds-category-violet-bg)] text-[color:var(--ds-category-violet-text)]",
  metadata:
    "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]",
  full: "bg-[color:var(--ds-category-teal-bg)] text-[color:var(--ds-category-teal-text)]",
  entscheidungstext: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  absatz: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  remainder: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
};

const fmt = (n: number) => n.toLocaleString("de-DE");
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

// ── Component ────────────────────────────────────────────────────────────

export function ChunkInspector({ initialSource = "all" }: { initialSource?: string } = {}) {
  const { addToast } = useToast();
  const [source, setSource] = useState(initialSource);
  const [role, setRole] = useState("all");

  useEffect(() => {
    if (source !== initialSource) {
      setSource(initialSource);
      setPage(1);
    }
  }, [initialSource, source]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action mutation
  const queryClient = useQueryClient();
  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, ids }: { action: string; ids: string[] }) => {
      const res = await fetch("/api/admin/chunk-inspector/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, chunkIds: ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (_data, { action }) => {
      const labels: Record<string, string> = {
        reembed: "Re-Embed angestoßen",
        flag_defective: "Als defekt markiert",
        flag_needs_review: "Zur Review markiert",
        flag_verified: "Als verifiziert markiert",
        clear_flag: "Markierung entfernt",
      };
      addToast({
        title: labels[action] ?? action,
        description: `${selectedIds.size} Chunks`,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["chunk-inspector"] });
      setSelectedIds(new Set());
    },
    onError: (err: Error) => {
      addToast({ title: "Bulk-Aktion fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === chunks.length) return new Set();
      return new Set(chunks.map((c) => c.id));
    });
  };

  // Debounced search
  const onSearchSubmit = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const onSearchClear = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  // Build query URL
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("source", source);
    p.set("role", role);
    if (search) p.set("q", search);
    p.set("sort", sort);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [source, role, search, sort, page, pageSize]);

  const listQuery = useQuery<ListResponse>({
    queryKey: ["chunk-inspector", source, role, search, sort, page, pageSize],
    queryFn: () =>
      fetch(`${API_BASE}?${queryParams}`, { credentials: "same-origin" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ListResponse>;
      }),
    enabled: true,
    staleTime: 15_000,
  });

  const detailQuery = useQuery<{ data: ChunkDetail }>({
    queryKey: ["chunk-detail", selectedChunkId],
    queryFn: () =>
      selectedChunkId
        ? fetch(`${API_BASE}/detail?id=${encodeURIComponent(selectedChunkId)}`, {
            credentials: "same-origin",
          }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<{ data: ChunkDetail }>;
          })
        : Promise.reject(new Error("No chunk selected")),
    enabled: !!selectedChunkId,
    staleTime: 60_000,
  });

  const total = listQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const chunks = useMemo(() => listQuery.data?.data ?? [], [listQuery.data?.data]);

  // CSV Export
  const onExportCSV = useCallback(() => {
    if (!chunks.length) {
      addToast({ title: "Keine Daten", description: "Nichts zu exportieren", type: "warning" });
      return;
    }
    const headers = [
      "ID",
      "Index",
      "Rolle",
      "Text",
      "Länge",
      "Court",
      "ECLI",
      "Case#",
      "Statute",
      "Paragraph",
      "Embedded",
      "Page Slug",
      "Page Title",
      "Source",
    ];
    const rows = chunks.map((c) => [
      c.id,
      c.chunkIndex,
      c.chunkRole,
      `"${c.chunkTextPreview.replace(/"/g, '""')}"`,
      c.chunkLength,
      `"${c.court ?? ""}"`,
      `"${c.ecli ?? ""}"`,
      `"${c.caseNumber ?? ""}"`,
      `"${c.statuteAbbr ?? ""}"`,
      `"${c.paragraphRef ?? ""}"`,
      c.embeddingStatus,
      `"${c.pageSlug}"`,
      `"${c.pageTitle.replace(/"/g, '""')}"`,
      c.sourceId,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chunks-${source}-${role}-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({
      title: "Export",
      description: `${chunks.length} Chunks exportiert`,
      type: "success",
    });
  }, [chunks, source, role, page, addToast]);

  const onSourceChange = (v: string) => {
    setSource(v);
    setPage(1);
  };
  const onRoleChange = (v: string) => {
    setRole(v);
    setPage(1);
  };
  const onSortChange = (v: string) => {
    setSort(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={source} onValueChange={onSourceChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Quelle" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={role} onValueChange={onRoleChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Rolle" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={onSortChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sortierung" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text)]" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
                placeholder="Suche im Chunk-Text…"
                className="pr-8 pl-9"
              />
              {searchInput && (
                <button
                  onClick={onSearchClear}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[color:var(--ds-text)] hover:text-[color:var(--ds-text)]"
                  aria-label="Suche löschen"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={onExportCSV} disabled={!chunks.length}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>

          {/* Result count */}
          <div className="mt-3 flex items-center gap-2 text-xs text-[color:var(--ds-text)]">
            {listQuery.isLoading ? (
              <span>Lädt…</span>
            ) : listQuery.isError ? (
              <span className="text-[color:var(--ds-danger-text)]">
                Fehler: {listQuery.error instanceof Error ? listQuery.error.message : "unbekannt"}
              </span>
            ) : (
              <span>
                {fmt(total)} Chunks · Seite {page} von {totalPages}
                {search && <span className="ml-2">· Suche: &quot;{search}&quot;</span>}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chunk Table */}
      <Card>
        <CardContent className="pt-4">
          {listQuery.isLoading && (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {listQuery.isError && (
            <div className="py-12 text-center">
              <p className="text-sm text-[color:var(--ds-danger-text)]">
                Fehler beim Laden der Chunks.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => listQuery.refetch()}
              >
                Neu laden
              </Button>
            </div>
          )}

          {!listQuery.isLoading && !listQuery.isError && chunks.length === 0 && (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-[color:var(--ds-text)]" />
              <p className="text-sm font-medium">Keine Chunks gefunden</p>
              <p className="mt-1 text-xs text-[color:var(--ds-text)]">
                {search
                  ? `Keine Treffer für &quot;${search}&quot; mit diesen Filtern.`
                  : "Diese Source hat noch keine Chunks — Import läuft?"}
              </p>
            </div>
          )}

          {!listQuery.isLoading && !listQuery.isError && chunks.length > 0 && (
            <>
              {/* Bulk Action Bar */}
              {selectedIds.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2">
                  <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {selectedIds.size} ausgewählt
                  </span>
                  <div className="mx-1 h-4 w-px bg-[color:var(--ds-border)]" />
                  <div className="inline-flex items-center gap-0.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs hover:bg-[color:var(--ds-surface)]"
                      onClick={() =>
                        bulkActionMutation.mutate({ action: "reembed", ids: [...selectedIds] })
                      }
                      disabled={bulkActionMutation.isPending}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" /> Re-Embed
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs hover:bg-[color:var(--ds-surface)]"
                      onClick={() =>
                        bulkActionMutation.mutate({
                          action: "flag_verified",
                          ids: [...selectedIds],
                        })
                      }
                      disabled={bulkActionMutation.isPending}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3 text-[color:var(--ds-success-text)]" />{" "}
                      Verifiziert
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs hover:bg-[color:var(--ds-surface)]"
                      onClick={() =>
                        bulkActionMutation.mutate({
                          action: "flag_needs_review",
                          ids: [...selectedIds],
                        })
                      }
                      disabled={bulkActionMutation.isPending}
                    >
                      <Flag className="mr-1 h-3 w-3 text-[color:var(--ds-warning-text)]" /> Review
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs hover:bg-[color:var(--ds-surface)]"
                      onClick={() =>
                        bulkActionMutation.mutate({
                          action: "flag_defective",
                          ids: [...selectedIds],
                        })
                      }
                      disabled={bulkActionMutation.isPending}
                    >
                      <AlertTriangle className="mr-1 h-3 w-3 text-[color:var(--ds-danger-text)]" />{" "}
                      Defekt
                    </Button>
                  </div>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Auswahl aufheben
                  </Button>
                </div>
              )}

              {/* Desktop: Table */}
              <div className="hidden max-h-[60vh] overflow-auto md:block">
                <table className="w-full text-sm text-[color:var(--ds-text)]">
                  <thead>
                    <tr className="border-b border-[color:var(--ds-border)] text-left text-xs text-[color:var(--ds-text)]">
                      <th scope="col" className="pr-2 pb-2">
                        <Checkbox
                          checked={selectedIds.size === chunks.length && chunks.length > 0}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Alle auswählen"
                        />
                      </th>
                      <th scope="col" className="pr-3 pb-2 font-medium">
                        #
                      </th>
                      <th scope="col" className="pr-3 pb-2 font-medium">
                        Rolle
                      </th>
                      <th scope="col" className="pr-3 pb-2 font-medium">
                        Text-Preview
                      </th>
                      <th scope="col" className="pr-3 pb-2 font-medium">
                        Court / ECLI
                      </th>
                      <th scope="col" className="pr-3 pb-2 text-right font-medium">
                        Länge
                      </th>
                      <th scope="col" className="pr-3 pb-2 text-center font-medium">
                        Embed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedChunkId(c.id)}
                        className={`cursor-pointer border-b border-[color:var(--ds-border)] transition-colors duration-150 hover:bg-[color:var(--ds-surface-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none ${selectedIds.has(c.id) ? "bg-[color:var(--brand-primary-bg)]" : ""}`}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setSelectedChunkId(c.id);
                        }}
                      >
                        <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleSelect(c.id)}
                            aria-label={`Chunk ${c.chunkIndex} auswählen`}
                          />
                        </td>
                        <td className="py-2 pr-3 text-xs text-[color:var(--ds-text)] tabular-nums">
                          {c.chunkIndex}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge
                            variant="default"
                            className={`text-xs ${ROLE_COLORS[c.chunkRole] ?? ""}`}
                          >
                            {ROLE_LABELS[c.chunkRole] || c.chunkRole || "—"}
                          </Badge>
                        </td>
                        <td className="max-w-[400px] py-2 pr-3">
                          <div className="truncate font-mono text-xs text-[color:var(--ds-text)]">
                            {truncate(c.chunkTextPreview.replace(/\n/g, " "), 120)}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text)]">
                            {truncate(c.pageTitle, 60)}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {c.court && (
                            <div className="max-w-[180px] truncate text-[color:var(--ds-text)]">
                              {c.court}
                            </div>
                          )}
                          {c.ecli && (
                            <div className="max-w-[180px] truncate text-[color:var(--ds-text)]">
                              {c.ecli}
                            </div>
                          )}
                          {!c.court && !c.ecli && c.statuteAbbr && (
                            <div className="text-[color:var(--ds-text)]">
                              {c.statuteAbbr} {c.paragraphRef ?? ""}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-xs text-[color:var(--ds-text)] tabular-nums">
                          {fmt(c.chunkLength)}
                        </td>
                        <td
                          className="py-2 pr-3 text-center"
                          title={
                            c.embeddingStatus === "embedded" ? "Eingebettet" : "Nicht eingebettet"
                          }
                        >
                          {c.embeddingStatus === "embedded" ? (
                            <Zap
                              className="inline h-4 w-4 text-[color:var(--ds-success-text)]"
                              aria-label="Eingebettet"
                            />
                          ) : (
                            <CircleDot
                              className="inline h-4 w-4 text-[color:var(--ds-text)]"
                              aria-label="Nicht eingebettet"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: Cards */}
              <div className="max-h-[55vh] space-y-2 overflow-y-auto md:hidden">
                {chunks.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 transition-colors duration-150 motion-reduce:transition-none ${selectedIds.has(c.id) ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary-bg)]" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                        aria-label={`Chunk ${c.chunkIndex} auswählen`}
                        className="mt-1"
                      />
                      <button onClick={() => setSelectedChunkId(c.id)} className="flex-1 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant="default"
                            className={`text-xs ${ROLE_COLORS[c.chunkRole] ?? ""}`}
                          >
                            {ROLE_LABELS[c.chunkRole] || c.chunkRole || "—"}
                          </Badge>
                          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text)]">
                            <span className="tabular-nums">{fmt(c.chunkLength)} Zchn</span>
                            {c.embeddingStatus === "embedded" ? (
                              <Zap className="h-3.5 w-3.5 text-[color:var(--ds-success-text)]" />
                            ) : (
                              <CircleDot className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 font-mono text-xs">
                          {truncate(c.chunkTextPreview.replace(/\n/g, " "), 100)}
                        </p>
                        {c.court && (
                          <p className="mt-1 truncate text-xs text-[color:var(--ds-text)]">
                            {c.court}
                          </p>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-[color:var(--ds-text)]">
                  {fmt((page - 1) * pageSize + 1)}–{fmt(Math.min(page * pageSize, total))} von{" "}
                  {fmt(total)}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedChunkId} onOpenChange={(open) => !open && setSelectedChunkId(null)}>
        <DialogContent className="flex h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 p-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              {detailQuery.isLoading && <Skeleton className="h-6 w-40" />}
              {detailQuery.data && (
                <>
                  <Badge
                    variant="default"
                    className={ROLE_COLORS[detailQuery.data.data.chunkRole] ?? ""}
                  >
                    {ROLE_LABELS[detailQuery.data.data.chunkRole] ??
                      detailQuery.data.data.chunkRole}
                  </Badge>
                  <span className="text-sm font-normal text-[color:var(--ds-text-muted)]">
                    Chunk {detailQuery.data.data.chunkIndex} ·{" "}
                    {fmt(detailQuery.data.data.chunkLength)} Zchn
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-2">
            {detailQuery.isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            {detailQuery.isError && (
              <p className="text-sm text-[color:var(--ds-danger-text)]">
                Fehler beim Laden des Chunk-Details.
              </p>
            )}

            {detailQuery.data && (
              <ChunkDetailContent
                detail={detailQuery.data.data}
                onClose={() => setSelectedChunkId(null)}
                onOpenInSteward={(slug) => {
                  // Switch to file-steward tab with pre-selected file
                  const event = new CustomEvent("corpus-steward-open-file", { detail: slug });
                  window.dispatchEvent(event);
                  setSelectedChunkId(null);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Detail Content ───────────────────────────────────────────────────────

function ChunkDetailContent({
  detail,
  onOpenInSteward,
  onClose,
}: {
  detail: ChunkDetail;
  onOpenInSteward: (slug: string) => void;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(detail.chunkText);
  const [editRole, setEditRole] = useState(detail.chunkRole);
  const [editCourt, setEditCourt] = useState(detail.court ?? "");
  const [editCaseNumber, setEditCaseNumber] = useState(detail.caseNumber ?? "");
  const [editEcli, setEditEcli] = useState(detail.ecli ?? "");
  const [editStatuteAbbr, setEditStatuteAbbr] = useState(detail.statuteAbbr ?? "");
  const [editParagraphRef, setEditParagraphRef] = useState(detail.paragraphRef ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset edit state when detail changes
  useEffect(() => {
    setEditText(detail.chunkText);
    setEditRole(detail.chunkRole);
    setEditCourt(detail.court ?? "");
    setEditCaseNumber(detail.caseNumber ?? "");
    setEditEcli(detail.ecli ?? "");
    setEditStatuteAbbr(detail.statuteAbbr ?? "");
    setEditParagraphRef(detail.paragraphRef ?? "");
    setIsEditing(false);
  }, [
    detail.id,
    detail.chunkText,
    detail.chunkRole,
    detail.court,
    detail.caseNumber,
    detail.ecli,
    detail.statuteAbbr,
    detail.paragraphRef,
  ]);

  // PATCH mutation
  const patchMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/admin/chunk-inspector/detail", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      addToast({
        title: "Chunk aktualisiert",
        description: "Änderungen gespeichert, Embedding invalidiert",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["chunk-detail", detail.id] });
      queryClient.invalidateQueries({ queryKey: ["chunk-inspector"] });
      setIsEditing(false);
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler beim Speichern", description: err.message, type: "error" });
    },
  });

  // DELETE mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/chunk-inspector/detail", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detail.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      addToast({ title: "Chunk gelöscht", description: "Chunk wurde entfernt", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["chunk-inspector"] });
      onClose();
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler beim Löschen", description: err.message, type: "error" });
    },
  });

  // Action mutation (re-embed, flag)
  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch("/api/admin/chunk-inspector/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, chunkIds: [detail.id] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (_data, action) => {
      const labels: Record<string, string> = {
        reembed: "Re-Embed angestoßen",
        flag_defective: "Als defekt markiert",
        flag_needs_review: "Zur Review markiert",
        flag_verified: "Als verifiziert markiert",
        clear_flag: "Markierung entfernt",
      };
      addToast({ title: labels[action] ?? action, type: "success" });
      queryClient.invalidateQueries({ queryKey: ["chunk-detail", detail.id] });
      queryClient.invalidateQueries({ queryKey: ["chunk-inspector"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Aktion fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  const onSave = () => {
    if (!editText.trim()) {
      addToast({
        title: "Leerer Text",
        description: "Chunk-Text darf nicht leer sein",
        type: "warning",
      });
      return;
    }
    patchMutation.mutate({
      id: detail.id,
      chunkText: editText,
      chunkRole: editRole,
      court: editCourt || null,
      caseNumber: editCaseNumber || null,
      ecli: editEcli || null,
      statuteAbbr: editStatuteAbbr || null,
      paragraphRef: editParagraphRef || null,
    });
  };

  const metaEntries: Array<[string, string | null]> = [
    ["Dokumenttyp", detail.documentType],
    ["Rechtsgebiet", detail.legalArea],
    ["Entscheidungsdatum", detail.decisionDate],
    ["Embedding", detail.embeddingStatus === "embedded" ? "✅ Eingebettet" : "⏳ Ausstehend"],
    [
      "Eingebettet am",
      detail.embeddedAt ? new Date(detail.embeddedAt).toLocaleString("de-AT") : null,
    ],
    ["Modell", detail.model],
    ["Token-Anzahl", detail.tokenCount != null ? String(detail.tokenCount) : null],
    ["Chunker-Version", detail.chunkerVersion != null ? `v${detail.chunkerVersion}` : null],
    ["Quell-ID", detail.sourceId],
  ];

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={isEditing ? "primary" : "ghost"}
          size="sm"
          onClick={() => {
            if (!isEditing) setIsEditing(true);
            else {
              setEditText(detail.chunkText);
              setEditRole(detail.chunkRole);
              setEditCourt(detail.court ?? "");
              setEditCaseNumber(detail.caseNumber ?? "");
              setEditEcli(detail.ecli ?? "");
              setEditStatuteAbbr(detail.statuteAbbr ?? "");
              setEditParagraphRef(detail.paragraphRef ?? "");
              setIsEditing(false);
            }
          }}
          disabled={patchMutation.isPending}
        >
          {isEditing ? (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
          )}
          {isEditing ? "Bearbeiten beenden" : "Bearbeiten"}
        </Button>
        {isEditing && (
          <>
            <Button variant="primary" size="sm" onClick={onSave} disabled={patchMutation.isPending}>
              {patchMutation.isPending ? "Speichert…" : "Speichern"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditText(detail.chunkText);
                setEditRole(detail.chunkRole);
                setEditCourt(detail.court ?? "");
                setEditCaseNumber(detail.caseNumber ?? "");
                setEditEcli(detail.ecli ?? "");
                setEditStatuteAbbr(detail.statuteAbbr ?? "");
                setEditParagraphRef(detail.paragraphRef ?? "");
              }}
              disabled={patchMutation.isPending}
            >
              Abbrechen
            </Button>
          </>
        )}

        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actionMutation.mutate("reembed")}
            disabled={actionMutation.isPending}
            title="Embedding invalidieren — Pipeline re-embeddet automatisch"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Re-Embed
          </Button>
        )}

        <div className="mx-1 h-5 w-px bg-[color:var(--ds-border)]" />

        {/* Flag group — connected, visually distinct */}
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actionMutation.mutate("flag_verified")}
            disabled={actionMutation.isPending}
            title="Als verifiziert markieren"
            className="hover:bg-[color:var(--ds-surface-2)]"
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-[color:var(--ds-success-text)]" />
            Verifiziert
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actionMutation.mutate("flag_needs_review")}
            disabled={actionMutation.isPending}
            title="Zur Review markieren"
            className="hover:bg-[color:var(--ds-surface-2)]"
          >
            <Flag className="mr-1.5 h-3.5 w-3.5 text-[color:var(--ds-warning-text)]" />
            Review
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actionMutation.mutate("flag_defective")}
            disabled={actionMutation.isPending}
            title="Als defekt markieren"
            className="hover:bg-[color:var(--ds-surface-2)]"
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-[color:var(--ds-danger-text)]" />
            Defekt
          </Button>
          <div className="mx-0.5 h-4 w-px bg-[color:var(--ds-border)]" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actionMutation.mutate("clear_flag")}
            disabled={actionMutation.isPending}
            title="Markierung entfernen"
            className="hover:bg-[color:var(--ds-surface-2)]"
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Flag löschen
          </Button>
        </div>

        <div className="flex-1" />

        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          title="Chunk löschen"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Löschen
        </Button>
      </div>

      {/* Parent Page Info */}
      <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">Parent-Datei</p>
            <p className="mt-1 truncate text-sm font-medium text-[color:var(--ds-text)]">
              {detail.pageTitle}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-[color:var(--ds-text-muted)]">
              {detail.pageSlug}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenInSteward(detail.pageSlug)}
            className="shrink-0"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Im Steward öffnen
          </Button>
        </div>
      </div>

      {/* Chunk Text — Edit or Read mode */}
      <div>
        <p className="mb-2 text-xs font-medium text-[color:var(--ds-text-muted)]">
          Chunk-Text ({fmt(isEditing ? editText.length : detail.chunkLength)} Zeichen)
          {isEditing && editText !== detail.chunkText && (
            <span className="ml-2 text-[color:var(--ds-warning-text)]">· ungespeichert</span>
          )}
        </p>
        {isEditing ? (
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="max-h-[300px] min-h-[150px] font-mono text-xs leading-relaxed"
            autoFocus
          />
        ) : (
          <pre className="max-h-[300px] overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-[color:var(--ds-text)]">
            {detail.chunkText}
          </pre>
        )}
      </div>

      {/* Editable Metadata (in edit mode) or Read-only Grid */}
      {isEditing ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">Rolle</label>
            <Input
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">Gericht</label>
            <Input
              value={editCourt}
              onChange={(e) => setEditCourt(e.target.value)}
              className="mt-1 text-xs"
              placeholder="z.B. OGH, VwGH"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              Aktenzahl
            </label>
            <Input
              value={editCaseNumber}
              onChange={(e) => setEditCaseNumber(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">ECLI</label>
            <Input
              value={editEcli}
              onChange={(e) => setEditEcli(e.target.value)}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">Gesetz</label>
            <Input
              value={editStatuteAbbr}
              onChange={(e) => setEditStatuteAbbr(e.target.value)}
              className="mt-1 text-xs"
              placeholder="z.B. ABGB, BGB"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              Paragraph
            </label>
            <Input
              value={editParagraphRef}
              onChange={(e) => setEditParagraphRef(e.target.value)}
              className="mt-1 text-xs"
              placeholder="z.B. § 1, Art 2"
            />
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium text-[color:var(--ds-text-muted)]">Metadaten</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {metaEntries.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-[color:var(--ds-text-muted)]">{label}</dt>
                <dd className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                  {value ?? <span className="text-[color:var(--ds-text-muted)]">—</span>}
                </dd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frontmatter (if available) */}
      {detail.frontmatter && Object.keys(detail.frontmatter).length > 0 && (
        <details className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
          <summary className="cursor-pointer text-xs font-medium text-[color:var(--ds-text-muted)]">
            Frontmatter der Parent-Datei ({Object.keys(detail.frontmatter).length} Felder)
          </summary>
          <pre className="mt-2 max-h-[200px] overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 font-mono text-xs whitespace-pre-wrap text-[color:var(--ds-text)]">
            {JSON.stringify(detail.frontmatter, null, 2)}
          </pre>
        </details>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chunk löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Chunk {detail.chunkIndex} aus &quot;{detail.pageTitle}&quot; wird permanent gelöscht.
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setConfirmDelete(false);
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="bg-[color:var(--ds-danger)] text-white hover:bg-[color:var(--ds-danger-hover)]"
            >
              {deleteMutation.isPending ? "Löscht…" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
