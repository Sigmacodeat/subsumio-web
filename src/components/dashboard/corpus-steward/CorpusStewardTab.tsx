"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useOptimisticMutation } from "@/lib/hooks/use-optimistic-mutation";
import {
  FileText, Search, Shuffle, Save, X, Edit3, Eye, Flag,
  CheckCircle2, AlertTriangle, XCircle, FolderOpen, ChevronLeft,
  RefreshCw, Plus, Trash2, History, GitCompare, Download, Upload,
  ListChecks, FileEdit, AlertCircle, Archive,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  name: string;
  size: number;
  modified: string;
  flag: string | null;
}

interface FileDetail {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
  flag: string | null;
  flagNote: string | null;
  size: number;
}

interface ListResponse {
  corpus: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  files: FileEntry[];
}

interface SampleResponse {
  corpus: string;
  total: number;
  sample: FileEntry[];
}

interface SearchResponse {
  query: string;
  corpus: string;
  total: number;
  results: Array<{ path: string; name: string; snippet?: string; matchIn: string }>;
}

interface CorpusSummary {
  name: string;
  fileCount: number;
  totalSizeMB: number;
  flaggedVerified: number;
  flaggedNeedsReview: number;
  flaggedDefective: number;
  flaggedArchived: number;
  unreviewed: number;
  oldestFile: string | null;
  newestFile: string | null;
}

interface OverviewResponse {
  corpora: CorpusSummary[];
  totals: {
    corporaCount: number;
    totalFiles: number;
    totalSizeMB: number;
    totalVerified: number;
    totalNeedsReview: number;
    totalDefective: number;
    totalArchived: number;
    totalUnreviewed: number;
  };
}

interface VersionEntry {
  version: number;
  timestamp: string;
  user: string;
  size: number;
  action: string;
  note?: string;
}

interface VersionDetail extends VersionEntry {
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  oldLine?: number;
  newLine?: number;
  content: string;
}

interface DiffResponse {
  path: string;
  v1: number;
  v2: number | string;
  diff: DiffLine[];
  stats: { added: number; removed: number; unchanged: number };
}

interface AuditEntry {
  action: string;
  path?: string;
  paths?: number;
  user: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ─── API Helpers ────────────────────────────────────────────────────────

const API_BASE = "/api/admin/corpus-files";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrf() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

async function putJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrf() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

function getCsrf(): string {
  const match = document.cookie.match(/sb_csrf=([^;]+)/);
  return match?.[1] ?? "";
}

// ─── Flag Badge ─────────────────────────────────────────────────────────

function FlagBadge({ flag }: { flag: string | null }) {
  if (!flag || flag === "unreviewed") {
    return <Badge variant="default" className="text-xs">unreviewed</Badge>;
  }
  const config: Record<string, { icon: typeof CheckCircle2; variant: "default" | "warning" | "danger" | "success" }> = {
    verified: { icon: CheckCircle2, variant: "success" },
    needs_review: { icon: AlertTriangle, variant: "warning" },
    defective: { icon: XCircle, variant: "danger" },
    unreviewed: { icon: Flag, variant: "default" },
    archived: { icon: Archive, variant: "default" },
  };
  const c = config[flag] ?? { icon: Flag, variant: "default" };
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="text-xs gap-1">
      <Icon className="h-3 w-3" />
      {flag}
    </Badge>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export function CorpusStewardTab() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [corpus, setCorpus] = useState("at-judikatur-vwgh");
  const [page, setPage] = useState(1);
  const [flagFilter, setFlagFilter] = useState("all");
  const [hideArchived, setHideArchived] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState("both");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showImportQueue, setShowImportQueue] = useState(false);
  const [diffVersions, setDiffVersions] = useState<{ v1: number; v2: number }>({ v1: 1, v2: 2 });
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [previewMode, setPreviewMode] = useState(false);

  // ── Overview ──
  const overviewQuery = useQuery({
    queryKey: ["corpus-files-overview"],
    queryFn: () => fetchJSON<OverviewResponse>(`${API_BASE}/overview`),
    staleTime: 60_000,
  });

  // ── File List ──
  const listQuery = useQuery({
    queryKey: ["corpus-files-list", corpus, page, flagFilter, hideArchived],
    queryFn: () =>
      fetchJSON<ListResponse>(
        `${API_BASE}/list?corpus=${encodeURIComponent(corpus)}&page=${page}&pageSize=50&flag=${flagFilter}&hideArchived=${hideArchived}`,
      ),
    enabled: !showSample && !showSearch,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // ── Sample ──
  const sampleQuery = useQuery({
    queryKey: ["corpus-files-sample", corpus],
    queryFn: () => fetchJSON<SampleResponse>(`${API_BASE}/sample?corpus=${encodeURIComponent(corpus)}&n=10`),
    enabled: showSample,
    staleTime: 60_000,
  });

  // ── Search ──
  const searchQueryFn = useQuery({
    queryKey: ["corpus-files-search", searchQuery, searchMode, corpus],
    queryFn: () =>
      fetchJSON<SearchResponse>(
        `${API_BASE}/search?q=${encodeURIComponent(searchQuery)}&mode=${searchMode}&corpus=${corpus === "all" ? "all" : corpus}&limit=30`,
      ),
    enabled: showSearch && searchQuery.length >= 2,
    staleTime: 30_000,
  });

  // ── File Detail ──
  const detailQuery = useQuery({
    queryKey: ["corpus-file-detail", selectedPath],
    queryFn: () => fetchJSON<FileDetail>(`${API_BASE}/read?path=${encodeURIComponent(selectedPath!)}`),
    enabled: !!selectedPath,
    staleTime: 60_000,
  });

  // ── Write Mutation — Optimistic (Detail sofort updaten) ──
  const writeMutation = useOptimisticMutation<
    unknown,
    Error,
    { path: string; frontmatter: Record<string, unknown>; body: string },
    { rollback: () => void },
    FileDetail
  >({
    mutationFn: (data: { path: string; frontmatter: Record<string, unknown>; body: string }) =>
      putJSON(`${API_BASE}/write`, data),
    targets: [
      {
        queryKey: ["corpus-file-detail", selectedPath],
        updater: (old: unknown, vars) => {
          const data = old as FileDetail | undefined;
          if (!data) return data;
          // Optimistic: frontmatter + body sofort updaten.
          // `raw` wird NICHT optimistisch rekonstruiert — die naive
          // String-Concat würde nicht serializeDoc entsprechen (Arrays,
          // Special-Chars, Escaping). Nach Server-Success invalidiert
          // der Cache und `raw` wird mit Server-Truth gefüllt.
          return {
            ...data,
            frontmatter: vars.frontmatter,
            body: vars.body,
          };
        },
      },
    ],
    invalidates: [["corpus-file-detail", selectedPath], ["corpus-files-list"], ["corpus-files-overview"]],
    onSuccess: () => {
      addToast({ title: "Gespeichert", description: "Datei erfolgreich aktualisiert", type: "success" });
      setEditMode(false);
    },
    onError: (err: Error, _vars, hadSnapshot) => {
      addToast({ title: "Speichern fehlgeschlagen", description: hadSnapshot ? `${err.message} — Änderung wurde zurückgesetzt.` : err.message, type: "error" });
    },
  });

  // ── Create Mutation ──
  // BEWUSST NICHT optimistisch: Der Server liefert size/modified/flag die
  // wir client-seitig nicht kennen. Optimistic würde einen falschen Eintrag
  // in der Liste zeigen. Nach Success wird die Liste invalidated → Server-Truth.
  const createMutation = useMutation({
    mutationFn: (data: { path: string; frontmatter: Record<string, unknown>; body: string }) =>
      postJSON(`${API_BASE}/create`, data),
    onSuccess: () => {
      addToast({ title: "Erstellt", description: "Datei erfolgreich erstellt", type: "success" });
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
      queryClient.invalidateQueries({ queryKey: ["corpus-files-overview"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  // ── Delete Mutation — Optimistic (Liste + Overview) ──
  const deleteMutation = useOptimisticMutation<
    unknown,
    Error,
    { path: string },
    { rollback: () => void },
    ListResponse | OverviewResponse
  >({
    mutationFn: (data: { path: string }) => postJSON(`${API_BASE}/delete`, data),
    targets: [
      {
        queryKey: ["corpus-files-list"],
        updater: (old: unknown, vars) => {
          const data = old as ListResponse | undefined;
          if (!data) return data;
          return { ...data, files: data.files.filter((f) => f.path !== vars.path), total: data.total - 1 };
        },
      },
      {
        queryKey: ["corpus-files-overview"],
        updater: (old: unknown) => {
          const data = old as OverviewResponse | undefined;
          if (!data) return data;
          return { ...data, totals: { ...data.totals, totalFiles: data.totals.totalFiles - 1 } };
        },
      },
    ],
    invalidates: [["corpus-files-list"], ["corpus-files-overview"], ["corpus-file-detail"]],
    onSuccess: () => {
      addToast({ title: "Gelöscht", description: "Datei erfolgreich gelöscht", type: "success" });
      setSelectedPath(null);
    },
    onError: (err: Error, _vars, hadSnapshot) => {
      addToast({ title: "Löschen fehlgeschlagen", description: hadSnapshot ? `${err.message} — Datei wurde wiederhergestellt.` : err.message, type: "error" });
    },
  });

  // ── Bulk Delete Mutation — Optimistic (Liste + Overview) ──
  const bulkDeleteMutation = useOptimisticMutation<
    { deleted: number; failed: number; errors: string[] },
    Error,
    { paths: string[] },
    { rollback: () => void },
    ListResponse | OverviewResponse
  >({
    mutationFn: (data: { paths: string[] }) => postJSON<{ deleted: number; failed: number; errors: string[] }>(`${API_BASE}/delete`, data),
    targets: [
      {
        queryKey: ["corpus-files-list"],
        updater: (old: unknown, vars) => {
          const data = old as ListResponse | undefined;
          if (!data) return data;
          const toRemove = new Set(vars.paths);
          const remaining = data.files.filter((f) => !toRemove.has(f.path));
          // Nur tatsächlich entfernte Files abziehen (nicht vars.paths.length,
          // weil einige Pfade nicht auf der aktuellen Seite sein könnten).
          const removed = data.files.length - remaining.length;
          return { ...data, files: remaining, total: Math.max(0, data.total - removed) };
        },
      },
      {
        queryKey: ["corpus-files-overview"],
        updater: (old: unknown, vars) => {
          const data = old as OverviewResponse | undefined;
          if (!data) return data;
          // Overview totalFiles um vars.paths.length reduzieren, aber nicht
          // negativ werden. Nach invalidate korrigiert der Server.
          return { ...data, totals: { ...data.totals, totalFiles: Math.max(0, data.totals.totalFiles - vars.paths.length) } };
        },
      },
    ],
    invalidates: [["corpus-files-list"], ["corpus-files-overview"], ["corpus-file-detail"]],
    onSuccess: (data) => {
      addToast({
        title: "Bulk-Löschung",
        description: `${data.deleted} gelöscht, ${data.failed} fehlgeschlagen`,
        type: data.failed > 0 ? "error" : "success",
      });
      setSelectedPaths(new Set());
    },
    onError: (err: Error, _vars, hadSnapshot) => {
      addToast({ title: "Bulk-Löschung fehlgeschlagen", description: hadSnapshot ? `${err.message} — Alle Dateien wurden wiederhergestellt.` : err.message, type: "error" });
    },
  });

  // ── Flag Mutation — Optimistic (Detail + Liste + Overview) ──
  const flagMutation = useOptimisticMutation<
    unknown,
    Error,
    { path: string; flag: string; note?: string },
    { rollback: () => void },
    FileDetail | ListResponse | OverviewResponse
  >({
    mutationFn: (data: { path: string; flag: string; note?: string }) =>
      postJSON(`${API_BASE}/flag`, data),
    targets: [
      {
        // selectedPath wird zur Render-Zeit im queryKey frozen — wenn der
        // Nutzer die Datei wechselt während die Mutation läuft, wird der
        // Cache der NEUEN Datei fälschlicherweise aktualisiert. Das ist
        // ein bekanntes Limitierung von useOptimisticMutation (queryKey
        // ist statisch). In der Praxis selten (Flag-Setzen ist schnell).
        // Bei Problemen: auf nicht-optimistische Mutation umstellen.
        queryKey: ["corpus-file-detail", selectedPath],
        updater: (old: unknown, vars) => {
          const data = old as FileDetail | undefined;
          if (!data) return data;
          // Safety: nur updaten wenn der Cache-Pfad zum vars.path passt
          if (data.path !== vars.path) return data;
          return { ...data, flag: vars.flag, flagNote: vars.note ?? null };
        },
      },
      {
        queryKey: ["corpus-files-list"],
        updater: (old: unknown, vars) => {
          const data = old as ListResponse | undefined;
          if (!data) return data;
          return {
            ...data,
            files: data.files.map((f) => (f.path === vars.path ? { ...f, flag: vars.flag } : f)),
          };
        },
      },
      {
        queryKey: ["corpus-files-overview"],
        updater: (old: unknown) => old, // Overview-Counts werden via invalidate refetched
      },
    ],
    invalidates: [["corpus-file-detail", selectedPath], ["corpus-files-list"], ["corpus-files-overview"], ["corpus-command-center"]],
    onSuccess: (_data, vars) => {
      addToast({ title: "Flag gesetzt", description: `${vars.flag}: ${vars.path}`, type: "success" });
    },
    onError: (err: Error, _vars, hadSnapshot) => {
      addToast({ title: "Flag fehlgeschlagen", description: hadSnapshot ? `${err.message} — Flag wurde zurückgesetzt.` : err.message, type: "error" });
    },
  });

  // ── Bulk Flag Mutation — Optimistic (Liste) ──
  const bulkFlagMutation = useOptimisticMutation<
    { flagged: number; flag: string },
    Error,
    { paths: string[]; flag: string },
    { rollback: () => void },
    ListResponse
  >({
    mutationFn: (data: { paths: string[]; flag: string }) =>
      postJSON<{ flagged: number; flag: string }>(`${API_BASE}/flag`, data),
    targets: [
      {
        queryKey: ["corpus-files-list"],
        updater: (old: unknown, vars) => {
          const data = old as ListResponse | undefined;
          if (!data) return data;
          const toFlag = new Set(vars.paths);
          return {
            ...data,
            files: data.files.map((f) => (toFlag.has(f.path) ? { ...f, flag: vars.flag } : f)),
          };
        },
      },
    ],
    invalidates: [["corpus-files-list"], ["corpus-files-overview"], ["corpus-file-detail"], ["corpus-command-center"]],
    onSuccess: (data) => {
      addToast({ title: "Bulk-Flag", description: `${data.flagged} Dateien → ${data.flag}`, type: "success" });
      setSelectedPaths(new Set());
    },
    onError: (err: Error, _vars, hadSnapshot) => {
      addToast({ title: "Bulk-Flag fehlgeschlagen", description: hadSnapshot ? `${err.message} — Flags wurden zurückgesetzt.` : err.message, type: "error" });
    },
  });

  // ── Bulk Edit Mutation ──
  // BEWUSST NICHT optimistisch: Die Operationen (set_field/delete_field/
  // prepend/append) verändern die Dateien auf komplexe Weise. Wir können
  // client-seitig nicht vorhersagen wie die Dateien danach aussehen.
  // Server muss validieren + serialisieren. Nach Success → invalidate.
  const bulkEditMutation = useMutation({
    mutationFn: (data: { paths: string[]; operation: string; field?: string; value?: unknown; text?: string }) =>
      postJSON<{ success: number; failed: number; errors: string[] }>(`${API_BASE}/bulk-edit`, data),
    onSuccess: (data: { success: number; failed: number; errors: string[] }) => {
      addToast({
        title: "Bulk-Edit",
        description: `${data.success} erfolgreich, ${data.failed} fehlgeschlagen`,
        type: data.failed > 0 ? "error" : "success",
      });
      setShowBulkEdit(false);
      setSelectedPaths(new Set());
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  // ── Restore Mutation ──
  // BEWUSST NICHT optimistisch: Die alte Version liegt nur als Metadaten
  // (VersionEntry) im Cache, nicht als vollständiger FileDetail. Wir können
  // den Detail-View nicht optimistisch updaten ohne die Datei zu lesen.
  // Nach Success → invalidate → Server liefert die wiederhergestellte Version.
  const restoreMutation = useMutation({
    mutationFn: (data: { path: string; version: number }) =>
      postJSON(`${API_BASE}/restore`, data),
    onSuccess: (_data, vars) => {
      addToast({ title: "Wiederhergestellt", description: `v${vars.version} wiederhergestellt`, type: "success" });
      setShowVersions(false);
      queryClient.invalidateQueries({ queryKey: ["corpus-file-detail", selectedPath] });
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  // ── Import-Queue Query ──
  const importQueueQuery = useQuery({
    queryKey: ["corpus-import-queue"],
    queryFn: () => fetchJSON<{ offen: number; eintraege: Array<{ pfad: string; benutzer: string; seit: string; art: string }> }>(`${API_BASE}/publish`),
    staleTime: 10_000,
  });

  // ── Publish Mutation (Import anstoßen) ──
  // KEIN Optimistic Update: im Trigger-Modus bleibt die Queue sichtbar bis
  // die Pipeline den Import bestätigt. Optimistic würde fälschlich Items
  // entfernen.
  const publishMutation = useMutation({
    mutationFn: (data: { paths?: string[] }) => postJSON<{ abgeraeumt: number; verbleibend: number; triggered?: boolean; message?: string }>(`${API_BASE}/publish`, data),
    onSuccess: (data) => {
      if (data.triggered) {
        addToast({ title: "Import angestoßen", description: data.message ?? "Die Pipeline übernimmt den Import beim nächsten Zyklus.", type: "success" });
      } else {
        addToast({ title: "Import-Queue", description: `${data.abgeraeumt} Einträge abgeräumt, ${data.verbleibend} verbleibend`, type: "success" });
      }
      queryClient.invalidateQueries({ queryKey: ["corpus-import-queue"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  const corpora = overviewQuery.data?.corpora.map((c) => c.name) ?? ["at-judikatur-vwgh"];

  // ── Pending-Paths für visuelles Optimistic-Feedback ──
  // Sammelt alle Pfade die gerade von einer optimistischen Mutation bearbeitet
  // werden. Die FileList zeigt diese Zeilen mit opacity-50 + aria-busy.
  const pendingPaths = new Set<string>();
  if (deleteMutation.isPending && deleteMutation.variables?.path) {
    pendingPaths.add(deleteMutation.variables.path);
  }
  if (bulkDeleteMutation.isPending && bulkDeleteMutation.variables?.paths) {
    for (const p of bulkDeleteMutation.variables.paths) pendingPaths.add(p);
  }
  if (flagMutation.isPending && flagMutation.variables?.path) {
    pendingPaths.add(flagMutation.variables.path);
  }
  if (bulkFlagMutation.isPending && bulkFlagMutation.variables?.paths) {
    for (const p of bulkFlagMutation.variables.paths) pendingPaths.add(p);
  }

  const handleFlag = (path: string, flag: string) => {
    flagMutation.mutate({ path, flag });
  };

  const handleSave = (frontmatter: Record<string, unknown>, body: string) => {
    if (!selectedPath) return;
    writeMutation.mutate({ path: selectedPath, frontmatter, body });
  };

  // ── Detail View ──
  if (selectedPath && detailQuery.data) {
    return (
      <FileDetailView
        detail={detailQuery.data}
        editMode={editMode}
        setEditMode={setEditMode}
        previewMode={previewMode}
        setPreviewMode={setPreviewMode}
        onBack={() => { setSelectedPath(null); setEditMode(false); setPreviewMode(false); }}
        onSave={handleSave}
        onFlag={handleFlag}
        onDelete={() => {
          if (confirm(`"${selectedPath}" wirklich löschen?\n\nEs wird eine Version-Snapshot gespeichert.`)) {
            deleteMutation.mutate({ path: selectedPath });
          }
        }}
        onShowVersions={() => setShowVersions(true)}
        saving={writeMutation.isPending}
        flagPending={flagMutation.isPending}
        deleting={deleteMutation.isPending}
      />
    );
  }

  // ── List View ──
  return (
    <div className="space-y-4">
      {/* Overview */}
      {showOverview && overviewQuery.data && (
        <OverviewCard
          data={overviewQuery.data}
          onOpenCorpus={(c) => { setCorpus(c); setPage(1); setShowOverview(false); setShowSample(false); setShowSearch(false); }}
          onHide={() => setShowOverview(false)}
          onRebuildIndex={async () => {
            addToast({ title: "Index wird neu gebaut...", description: "~30s für 713K Dateien", type: "info" });
            try {
              const res = await postJSON<{ totalFiles: number; totalMs: number }>(`${API_BASE}/build-index`, {});
              addToast({
                title: "Index aktualisiert",
                description: `${res.totalFiles.toLocaleString("de-AT")} Dateien in ${(res.totalMs / 1000).toFixed(1)}s`,
                type: "success",
              });
              queryClient.invalidateQueries({ queryKey: ["corpus-files-overview"] });
              queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
            } catch (err) {
              addToast({ title: "Fehler", description: (err as Error).message, type: "error" });
            }
          }}
        />
      )}

      {!showOverview && (
        <Button size="sm" variant="outline" onClick={() => setShowOverview(true)}>
          <FolderOpen className="h-4 w-4" /> Korpus-Übersicht
        </Button>
      )}

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
              <Select value={corpus} onValueChange={(v) => { setCorpus(v); setPage(1); setShowSample(false); setShowSearch(false); setSelectedPaths(new Set()); }}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {corpora.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Select value={flagFilter} onValueChange={(v) => { setFlagFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Flags</SelectItem>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="defective">Defective</SelectItem>
                <SelectItem value="archived">Archiviert</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={hideArchived ? "outline" : "ghost"}
              size="sm"
              onClick={() => { setHideArchived(!hideArchived); setPage(1); }}
              disabled={flagFilter === "archived"}
              title={flagFilter === "archived" ? "Archiv-Filter ist aktiv — Toggle irrelevant" : hideArchived ? "Archivierte Dateien sind ausgeblendet" : "Archivierte Dateien werden angezeigt"}
              className="h-9"
            >
              <Archive className="h-4 w-4 mr-1" />
              {hideArchived ? "Fertige sichtbar machen" : "Fertige ausblenden"}
            </Button>

            <Button variant={showSample ? "primary" : "outline"} size="sm" onClick={() => { setShowSample(!showSample); setShowSearch(false); }}>
              <Shuffle className="h-4 w-4 mr-1" /> Stichprobe
            </Button>

            <Button variant={showSearch ? "primary" : "outline"} size="sm" onClick={() => { setShowSearch(!showSearch); setShowSample(false); }}>
              <Search className="h-4 w-4 mr-1" /> Suche
            </Button>

            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Neue Datei
            </Button>

            <Button variant="outline" size="sm" onClick={() => setShowAudit(true)}>
              <History className="h-4 w-4 mr-1" /> Audit-Log
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.open(`${API_BASE}/export?corpus=${encodeURIComponent(corpus)}&format=json`, "_blank");
              }}
            >
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>

            <Button
              variant={importQueueQuery.data?.offen ? "primary" : "outline"}
              size="sm"
              onClick={() => setShowImportQueue(true)}
            >
              <Upload className="h-4 w-4 mr-1" /> Import-Queue
              {importQueueQuery.data?.offen ? (
                <Badge variant="danger" className="ml-1 text-xs">{importQueueQuery.data.offen}</Badge>
              ) : null}
            </Button>

            {selectedPaths.size > 0 && (
              <>
                <Badge variant="accent" className="gap-1">
                  <ListChecks className="h-3 w-3" /> {selectedPaths.size} ausgewählt
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setShowBulkEdit(true)}>
                  <FileEdit className="h-4 w-4 mr-1" /> Bulk-Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    bulkFlagMutation.mutate({ paths: [...selectedPaths], flag: "verified" });
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Bulk-Verify
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    bulkFlagMutation.mutate({ paths: [...selectedPaths], flag: "archived" });
                  }}
                  title="Als fertig archivieren — verschwindet aus der Bearbeitungsliste"
                >
                  <Archive className="h-4 w-4 mr-1" /> Bulk-Archiv
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (confirm(`${selectedPaths.size} Dateien wirklich löschen?`)) {
                      bulkDeleteMutation.mutate({ paths: [...selectedPaths] });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Bulk-Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPaths(new Set())}>
                  <X className="h-4 w-4" /> Auswahl leeren
                </Button>
              </>
            )}
          </div>

          {showSearch && (
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Suchbegriff (min. 2 Zeichen)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Select value={searchMode} onValueChange={setSearchMode}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Name + Inhalt</SelectItem>
                  <SelectItem value="filename">Nur Dateiname</SelectItem>
                  <SelectItem value="content">Nur Inhalt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {showSearch && searchQueryFn.data && (
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-[color:var(--ds-text-muted)] mb-3">
              {searchQueryFn.data.total} Treffer für &quot;{searchQueryFn.data.query}&quot;
            </div>
            <div className="space-y-2">
              {searchQueryFn.data.results.map((r) => (
                <button
                  key={r.path}
                  onClick={() => { setSelectedPath(r.path); setShowSearch(false); }}
                  className="w-full text-left p-3 rounded-lg border hover:bg-[color:var(--ds-surface-hover)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[color:var(--ds-text-muted)] flex-shrink-0" />
                    <span className="font-mono text-sm truncate">{r.path}</span>
                    <Badge variant="default" className="text-xs ml-auto">{r.matchIn}</Badge>
                  </div>
                  {r.snippet && (
                    <div className="mt-1 text-xs text-[color:var(--ds-text-muted)] pl-6 truncate">...{r.snippet}...</div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sample Results */}
      {showSample && sampleQuery.data && (
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-[color:var(--ds-text-muted)] mb-3">
              Zufallsstichprobe (10 von {sampleQuery.data.total.toLocaleString("de-AT")} Dateien)
            </div>
            <FileList files={sampleQuery.data.sample} onSelect={setSelectedPath} selectedPaths={selectedPaths} onToggleSelect={toggleSelect} pendingPaths={pendingPaths} />
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {!showSample && !showSearch && listQuery.data && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-[color:var(--ds-text-muted)]">
                {listQuery.data.total.toLocaleString("de-AT")} Dateien · Seite {page} von {listQuery.data.totalPages}
              </div>
              {listQuery.data.files.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const pagePaths = new Set(listQuery.data!.files.map((f) => f.path));
                    if (pagePaths.size === selectedPaths.size || [...pagePaths].every((p) => selectedPaths.has(p))) {
                      setSelectedPaths(new Set());
                    } else {
                      setSelectedPaths(new Set([...selectedPaths, ...pagePaths]));
                    }
                  }}
                >
                  <ListChecks className="h-4 w-4 mr-1" /> Alle auf Seite {selectedPaths.size > 0 ? "abwählen" : "auswählen"}
                </Button>
              )}
            </div>
            <FileList files={listQuery.data.files} onSelect={setSelectedPath} selectedPaths={selectedPaths} onToggleSelect={toggleSelect} pendingPaths={pendingPaths} />

            {listQuery.data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" /> Zurück
                </Button>
                <span className="px-4 text-sm text-[color:var(--ds-text-muted)]">
                  {page} / {listQuery.data.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(Math.min(listQuery.data.totalPages, page + 1))}
                  disabled={page === listQuery.data.totalPages}
                >
                  Weiter <ChevronLeft className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(listQuery.isLoading || sampleQuery.isLoading) && (
        <div className="space-y-2" aria-busy="true" aria-label="Datei-Liste wird geladen">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-2.5 rounded-lg border flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {listQuery.isError && (
        <Card className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-[color:var(--ds-danger-text)]">
              <XCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Fehler beim Laden der Datei-Liste</span>
            </div>
            <p className="text-xs text-[color:var(--ds-danger-text)] mt-1 ml-7">
              {(listQuery.error as Error)?.message ?? "Unbekannter Fehler"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 ml-7"
              onClick={() => listQuery.refetch()}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {listQuery.data && !listQuery.isLoading && listQuery.data.files.length === 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-[color:var(--ds-text-subtle)] mb-3" />
            <p className="text-sm font-medium text-[color:var(--ds-text-muted)]">Keine Dateien gefunden</p>
            <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">
              {searchQuery
                ? `Keine Treffer für "${searchQuery}" in ${corpus}.`
                : `Der Corpus ${corpus} ist leer oder der Index muss neu gebaut werden.`}
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {searchQuery && (
                <Button size="sm" variant="outline" onClick={() => setSearchQuery("")}>
                  Filter zurücksetzen
                </Button>
              )}
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3 w-3 mr-1" /> Neue Datei
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      {showCreate && (
        <CreateFileDialog
          corpus={corpus}
          onClose={() => setShowCreate(false)}
          onCreate={(path, fm, body) => createMutation.mutate({ path, frontmatter: fm, body })}
          pending={createMutation.isPending}
        />
      )}

      {/* Audit Dialog */}
      {showAudit && (
        <AuditLogDialog onClose={() => setShowAudit(false)} pathFilter={selectedPath ?? undefined} />
      )}

      {/* Bulk Edit Dialog */}
      {showBulkEdit && (
        <BulkEditDialog
          selectedCount={selectedPaths.size}
          onClose={() => setShowBulkEdit(false)}
          onApply={(operation, field, value, text) =>
            bulkEditMutation.mutate({ paths: [...selectedPaths], operation, field, value, text })
          }
          pending={bulkEditMutation.isPending}
        />
      )}

      {/* Versions Dialog */}
      {showVersions && selectedPath && (
        <VersionsDialog
          path={selectedPath}
          onClose={() => setShowVersions(false)}
          onRestore={(version) => restoreMutation.mutate({ path: selectedPath, version })}
          onDiff={(v1, v2) => { setDiffVersions({ v1, v2 }); setShowVersions(false); setShowDiff(true); }}
          pending={restoreMutation.isPending}
        />
      )}

      {/* Diff Dialog */}
      {showDiff && selectedPath && (
        <DiffDialog
          path={selectedPath}
          initialV1={diffVersions.v1}
          initialV2={diffVersions.v2}
          onClose={() => { setShowDiff(false); setShowVersions(true); }}
        />
      )}

      {/* Import-Queue Dialog */}
      {showImportQueue && (
        <ImportQueueDialog
          onClose={() => setShowImportQueue(false)}
          onPublish={(paths) => publishMutation.mutate({ paths })}
          pending={publishMutation.isPending}
        />
      )}
    </div>
  );

  function toggleSelect(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
}

// ─── Overview Card ──────────────────────────────────────────────────────

function OverviewCard({
  data, onOpenCorpus, onHide, onRebuildIndex,
}: {
  data: OverviewResponse;
  onOpenCorpus: (c: string) => void;
  onHide: () => void;
  onRebuildIndex: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Korpus-Übersicht ({data.totals.corporaCount} Korpora)</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRebuildIndex}>
              <RefreshCw className="h-4 w-4" /> Index neu bauen
            </Button>
            <Button size="sm" variant="ghost" onClick={onHide}>
              <X className="h-4 w-4" /> Ausblenden
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">Dateien gesamt</div>
            <div className="text-xl font-semibold">{data.totals.totalFiles.toLocaleString("de-AT")}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">{data.totals.totalSizeMB.toLocaleString("de-AT")} MB</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)] flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-[color:var(--ds-success-text)]" /> Verified</div>
            <div className="text-xl font-semibold text-[color:var(--ds-success-text)]">{data.totals.totalVerified.toLocaleString("de-AT")}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)] flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-[color:var(--ds-warning-text)]" /> Needs Review</div>
            <div className="text-xl font-semibold text-[color:var(--ds-warning-text)]">{data.totals.totalNeedsReview.toLocaleString("de-AT")}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)] flex items-center gap-1"><XCircle className="h-3 w-3 text-[color:var(--ds-danger-text)]" /> Defective</div>
            <div className="text-xl font-semibold text-[color:var(--ds-danger-text)]">{data.totals.totalDefective.toLocaleString("de-AT")}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)] flex items-center gap-1"><Archive className="h-3 w-3 text-[color:var(--ds-text-muted)]" /> Archiviert</div>
            <div className="text-xl font-semibold text-[color:var(--ds-text-muted)]">{data.totals.totalArchived.toLocaleString("de-AT")}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[color:var(--ds-text-muted)]">
                <th className="py-2 pr-4 font-medium">Korpus</th>
                <th className="py-2 px-4 font-medium text-right">Dateien</th>
                <th className="py-2 px-4 font-medium text-right">Größe</th>
                <th className="py-2 px-4 font-medium text-right">Verified</th>
                <th className="py-2 px-4 font-medium text-right">Review</th>
                <th className="py-2 px-4 font-medium text-right">Defective</th>
                <th className="py-2 px-4 font-medium text-right">Archiv</th>
                <th className="py-2 pl-4 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {data.corpora.map((c) => (
                <tr key={c.name} className="border-b hover:bg-[color:var(--ds-surface-hover)]">
                  <td className="py-2 pr-4 font-mono">{c.name}</td>
                  <td className="py-2 px-4 text-right">{c.fileCount.toLocaleString("de-AT")}</td>
                  <td className="py-2 px-4 text-right text-[color:var(--ds-text-muted)]">{c.totalSizeMB} MB</td>
                  <td className="py-2 px-4 text-right text-[color:var(--ds-success-text)]">{c.flaggedVerified || "—"}</td>
                  <td className="py-2 px-4 text-right text-[color:var(--ds-warning-text)]">{c.flaggedNeedsReview || "—"}</td>
                  <td className="py-2 px-4 text-right text-[color:var(--ds-danger-text)]">{c.flaggedDefective || "—"}</td>
                  <td className="py-2 px-4 text-right text-[color:var(--ds-text-muted)]">{c.flaggedArchived || "—"}</td>
                  <td className="py-2 pl-4 text-right">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpenCorpus(c.name)}>
                      Öffnen →
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── File List ──────────────────────────────────────────────────────────

function FileList({
  files, onSelect, selectedPaths, onToggleSelect, pendingPaths,
}: {
  files: FileEntry[];
  onSelect: (path: string) => void;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string) => void;
  pendingPaths?: Set<string>;
}) {
  return (
    <div className="space-y-1 max-h-[600px] overflow-y-auto">
      {files.map((f) => {
        const isPending = pendingPaths?.has(f.path) ?? false;
        return (
        <div
          key={f.path}
          className={`p-2.5 rounded-lg border hover:bg-[color:var(--ds-surface-hover)] transition-colors flex items-center gap-3 ${
            isPending ? "opacity-50" : ""
          }`}
          aria-busy={isPending}
        >
          <Checkbox
            checked={selectedPaths.has(f.path)}
            onCheckedChange={() => onToggleSelect(f.path)}
            disabled={isPending}
          />
          <button onClick={() => onSelect(f.path)} className="flex-1 min-w-0 text-left flex items-center gap-3" disabled={isPending}>
            <FileText className="h-4 w-4 text-[color:var(--ds-text-muted)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm truncate">{f.name}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)] truncate">{f.path}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-[color:var(--ds-text-muted)]">{(f.size / 1024).toFixed(1)} KB</span>
              <FlagBadge flag={f.flag} />
            </div>
          </button>
        </div>
        );
      })}
    </div>
  );
}

// ─── File Detail View ───────────────────────────────────────────────────

function FileDetailView({
  detail, editMode, setEditMode, previewMode, setPreviewMode, onBack, onSave, onFlag, onDelete, onShowVersions,
  saving, flagPending, deleting,
}: {
  detail: FileDetail;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  previewMode: boolean;
  setPreviewMode: (v: boolean) => void;
  onBack: () => void;
  onSave: (fm: Record<string, unknown>, body: string) => void;
  onFlag: (path: string, flag: string) => void;
  onDelete: () => void;
  onShowVersions: () => void;
  saving: boolean;
  flagPending: boolean;
  deleting: boolean;
}) {
  const [fmDraft, setFmDraft] = useState<Record<string, unknown>>(detail.frontmatter);
  const [bodyDraft, setBodyDraft] = useState(detail.body);
  const [showValidation, setShowValidation] = useState(false);

  // Sync drafts when detail changes (e.g. after save + invalidateQueries)
  useEffect(() => {
    setFmDraft(detail.frontmatter);
    setBodyDraft(detail.body);
  }, [detail.path, detail.raw]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: validation } = useQuery({
    queryKey: ["validate-fm", fmDraft],
    queryFn: () => postJSON<ValidationResult>(`${API_BASE}/validate-schema`, { frontmatter: fmDraft }),
    enabled: showValidation && editMode,
  });

  const fmEntries = Object.entries(editMode ? fmDraft : detail.frontmatter);

  // Visuelles Feedback bei optimistischen Mutationen — der ganze Detail-View
  // wird leicht transparent + aria-busy während Save/Flag/Delete läuft.
  const anyPending = saving || flagPending || deleting;

  return (
    <div
      className={`space-y-4 transition-opacity motion-reduce:transition-none ${anyPending ? "opacity-60" : ""}`}
      aria-busy={anyPending}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> Zurück
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm truncate">{detail.path}</div>
        </div>
        <FlagBadge flag={detail.flag} />
        <Button size="sm" variant="ghost" onClick={onShowVersions}>
          <History className="h-4 w-4" /> Versionen
        </Button>
        {editMode ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setPreviewMode(!previewMode)}>
              {previewMode ? <Edit3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {previewMode ? "Edit" : "Preview"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditMode(false); setFmDraft(detail.frontmatter); setBodyDraft(detail.body); setShowValidation(false); }}>
              <X className="h-4 w-4" /> Abbrechen
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowValidation(true)}>
              <AlertCircle className="h-4 w-4" /> Validieren
            </Button>
            <Button size="sm" onClick={() => onSave(fmDraft, bodyDraft)} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "Speichere..." : "Speichern"}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="danger" onClick={onDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> {deleting ? "..." : "Löschen"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditMode(true); setFmDraft(detail.frontmatter); setBodyDraft(detail.body); }}>
              <Edit3 className="h-4 w-4" /> Bearbeiten
            </Button>
          </>
        )}
      </div>

      {/* Validation Results */}
      {validation && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              {validation.valid ? (
                <CheckCircle2 className="h-4 w-4 text-[color:var(--ds-success-text)]" />
              ) : (
                <XCircle className="h-4 w-4 text-[color:var(--ds-danger-text)]" />
              )}
              <span className="text-sm font-medium">
                {validation.valid ? "Schema valide" : `${validation.errors.length} Fehler`}
              </span>
              {validation.warnings.length > 0 && (
                <span className="text-xs text-[color:var(--ds-warning-text)]">{validation.warnings.length} Warnungen</span>
              )}
            </div>
            {validation.errors.map((e, i) => (
              <div key={`e${i}`} className="text-xs text-[color:var(--ds-danger-text)] flex items-center gap-1">
                <XCircle className="h-3 w-3" /> {e.message}
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={`w${i}`} className="text-xs text-[color:var(--ds-warning-text)] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {w.message}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Flag Actions */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium mr-2">Quality Flag:</span>
            <Button size="sm" variant="outline" onClick={() => onFlag(detail.path, "verified")} disabled={flagPending}>
              <CheckCircle2 className="h-4 w-4 text-[color:var(--ds-success-text)]" /> Verified
            </Button>
            <Button size="sm" variant="outline" onClick={() => onFlag(detail.path, "needs_review")} disabled={flagPending}>
              <AlertTriangle className="h-4 w-4 text-[color:var(--ds-warning-text)]" /> Needs Review
            </Button>
            <Button size="sm" variant="outline" onClick={() => onFlag(detail.path, "defective")} disabled={flagPending}>
              <XCircle className="h-4 w-4 text-[color:var(--ds-danger-text)]" /> Defective
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onFlag(detail.path, "unreviewed")} disabled={flagPending}>
              <Flag className="h-4 w-4" /> Reset
            </Button>
            <div className="mx-1 h-5 w-px bg-[color:var(--ds-border)]" />
            {detail.flag === "archived" ? (
              <Button size="sm" variant="outline" onClick={() => onFlag(detail.path, "verified")} disabled={flagPending}>
                <Archive className="h-4 w-4" /> Aus Archiv holen
              </Button>
            ) : (
              <Button
                size="sm"
                variant={detail.flag === "verified" ? "primary" : "outline"}
                onClick={() => onFlag(detail.path, "archived")}
                disabled={flagPending}
                title="Als fertig markieren — verschwindet aus der Bearbeitungsliste"
              >
                <Archive className="h-4 w-4" /> Archivieren
              </Button>
            )}
            {detail.flagNote && (
              <span className="text-xs text-[color:var(--ds-text-muted)] ml-2">Notiz: {detail.flagNote}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Frontmatter */}
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm font-medium mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4" /> Frontmatter ({fmEntries.length} Felder)
          </div>
          <div className="space-y-1.5">
            {fmEntries.map(([key, val]) => (
              <div key={key} className="grid grid-cols-[200px_1fr_auto] gap-2 items-start">
                <span className="font-mono text-xs text-[color:var(--ds-text-muted)] pt-1.5">{key}</span>
                {editMode ? (
                  <>
                    <Input
                      value={typeof val === "string" || typeof val === "number" ? String(val) : JSON.stringify(val)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Type-Erhaltung: wenn der Originalwert eine Number war,
                        // versuche den neuen Wert als Number zu parsen. Wenn der
                        // Originalwert ein Array/Object war, versuche JSON-Parse.
                        // Fallback: String. Verhindert Datenverlust (Number→String,
                        // Array→String) beim Bearbeiten von Frontmatter-Feldern.
                        const originalVal = detail.frontmatter[key];
                        let parsed: unknown = raw;
                        if (typeof originalVal === "number") {
                          const n = Number(raw);
                          parsed = isNaN(n) ? raw : n;
                        } else if (Array.isArray(originalVal) || (originalVal !== null && typeof originalVal === "object")) {
                          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
                        } else if (typeof originalVal === "boolean") {
                          parsed = raw === "true" ? true : raw === "false" ? false : raw;
                        }
                        setFmDraft((prev) => ({ ...prev, [key]: parsed }));
                      }}
                      className="font-mono text-xs h-8"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                      onClick={() => {
                        setFmDraft((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }}
                      aria-label={`Feld "${key}" entfernen`}
                      title={`Feld "${key}" entfernen`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <span className="font-mono text-xs pt-1.5 break-all col-span-2">
                    {typeof val === "string" || typeof val === "number" || typeof val === "boolean"
                      ? String(val)
                      : JSON.stringify(val)}
                  </span>
                )}
              </div>
            ))}
            {editMode && (
              <AddFieldRow onAdd={(key, val) => setFmDraft((prev) => ({ ...prev, [key]: val }))} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Body */}
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm font-medium mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Body ({(detail.size / 1024).toFixed(1)} KB)
          </div>
          {editMode && previewMode ? (
            <MarkdownPreview body={bodyDraft} />
          ) : editMode ? (
            <Textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              className="font-mono text-xs min-h-[400px] max-h-[600px] resize-y"
            />
          ) : (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[600px] overflow-y-auto p-3 rounded bg-[color:var(--ds-surface-2)]">
              {detail.body}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Add Field Row ──────────────────────────────────────────────────────

function AddFieldRow({ onAdd }: { onAdd: (key: string, val: string) => void }) {
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");
  return (
    <div className="grid grid-cols-[200px_1fr_auto] gap-2 items-start pt-2 border-t">
      <Input placeholder="neuer key" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono text-xs h-8" />
      <Input placeholder="wert" value={val} onChange={(e) => setVal(e.target.value)} className="font-mono text-xs h-8" />
      <Button size="sm" variant="outline" onClick={() => { if (key) { onAdd(key, val); setKey(""); setVal(""); } }}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Markdown Preview (simple) ──────────────────────────────────────────

function MarkdownPreview({ body }: { body: string }) {
  // Simple markdown rendering — headers, bold, lists
  const lines = body.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(<ul key={`ul-${key++}`} className="list-disc pl-6 space-y-1 my-2">{listItems}</ul>);
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      flushList();
      blocks.push(<h3 key={key++} className="text-base font-semibold mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flushList();
      blocks.push(<h2 key={key++} className="text-lg font-semibold mt-4 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      flushList();
      blocks.push(<h1 key={key++} className="text-xl font-bold mt-4 mb-2">{line.slice(2)}</h1>);
    } else if (line.match(/^[-*]\s+/)) {
      listItems.push(<li key={key++} className="text-sm">{renderInline(line.replace(/^[-*]\s+/, ""))}</li>);
    } else if (line.trim() === "") {
      flushList();
      blocks.push(<div key={key++} className="h-2" />);
    } else {
      flushList();
      blocks.push(<p key={key++} className="text-sm leading-relaxed">{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className="prose prose-sm max-w-none p-3 rounded bg-white border max-h-[600px] overflow-y-auto">{blocks}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ─── Create File Dialog ─────────────────────────────────────────────────

function CreateFileDialog({
  corpus, onClose, onCreate, pending,
}: {
  corpus: string;
  onClose: () => void;
  onCreate: (path: string, fm: Record<string, unknown>, body: string) => void;
  pending: boolean;
}) {
  const [filename, setFilename] = useState("");
  const [title, setTitle] = useState("");
  const [docClass, setDocClass] = useState("statute");
  const [jurisdiction, setJurisdiction] = useState("at");
  const [docId, setDocId] = useState("");
  const [body, setBody] = useState("");

  const path = `${corpus}/${filename.replace(/\.md$/, "")}.md`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Neue Datei erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[color:var(--ds-text-muted)]">Dateiname (ohne .md)</label>
            <Input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="z.B. abgb-2024-paragraf-1" />
            <div className="text-xs text-[color:var(--ds-text-muted)] mt-1 font-mono">→ {path}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[color:var(--ds-text-muted)]">Titel</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[color:var(--ds-text-muted)]">Doc ID</label>
              <Input value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="NOR..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[color:var(--ds-text-muted)]">Dokumentklasse</label>
              <Select value={docClass} onValueChange={setDocClass}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="statute">statute</SelectItem>
                  <SelectItem value="decision">decision</SelectItem>
                  <SelectItem value="literature">literature</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-[color:var(--ds-text-muted)]">Jurisdiction</label>
              <Select value={jurisdiction} onValueChange={setJurisdiction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="at">at</SelectItem>
                  <SelectItem value="de">de</SelectItem>
                  <SelectItem value="ch">ch</SelectItem>
                  <SelectItem value="eu">eu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[color:var(--ds-text-muted)]">Body (Markdown)</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs min-h-[200px]" placeholder="# Titel&#10;&#10;Inhalt..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={() => onCreate(path, { title, doc_class: docClass, jurisdiction, doc_id: docId }, body)}
            disabled={pending || !filename || !title || (docClass !== "literature" && !docId)}
          >
            {pending ? "Erstelle..." : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit Log Dialog ───────────────────────────────────────────────────

function AuditLogDialog({ onClose, pathFilter }: { onClose: () => void; pathFilter?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", pathFilter],
    queryFn: () => fetchJSON<{ entries: AuditEntry[]; count: number }>(`${API_BASE}/audit?limit=100${pathFilter ? `&path=${encodeURIComponent(pathFilter)}` : ""}`),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit-Log {pathFilter ? `(${pathFilter})` : ""}</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="space-y-2" aria-busy="true" aria-label="Audit-Log wird geladen">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded border">
                <Skeleton className="h-3 w-28 flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
              </div>
            ))}
          </div>
        )}
        {data && (
          <div className="space-y-1">
            {data.entries.length === 0 && <div className="text-sm text-[color:var(--ds-text-muted)]">Keine Einträge</div>}
            {data.entries.map((e, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded border text-xs">
                <div className="font-mono text-[color:var(--ds-text-muted)] flex-shrink-0">{new Date(e.timestamp).toLocaleString("de-AT")}</div>
                <div className="flex-1">
                  <span className="font-medium">{e.action}</span>
                  {e.path && <span className="text-[color:var(--ds-text-muted)] ml-2 font-mono">{e.path}</span>}
                  {e.paths && <span className="text-[color:var(--ds-text-muted)] ml-2">{e.paths} Dateien</span>}
                  <span className="text-[color:var(--ds-text-muted)] ml-2">— {e.user}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Edit Dialog ───────────────────────────────────────────────────

function BulkEditDialog({
  selectedCount, onClose, onApply, pending,
}: {
  selectedCount: number;
  onClose: () => void;
  onApply: (operation: string, field?: string, value?: unknown, text?: string) => void;
  pending: boolean;
}) {
  const [operation, setOperation] = useState("set_field");
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [text, setText] = useState("");

  const needsField = operation === "set_field" || operation === "delete_field";
  const needsValue = operation === "set_field";
  const needsText = operation === "replace_body" || operation === "prepend_body" || operation === "append_body";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk-Edit ({selectedCount} Dateien)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[color:var(--ds-text-muted)]">Operation</label>
            <Select value={operation} onValueChange={setOperation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="set_field">Frontmatter-Feld setzen</SelectItem>
                <SelectItem value="delete_field">Frontmatter-Feld löschen</SelectItem>
                <SelectItem value="replace_body">Body ersetzen</SelectItem>
                <SelectItem value="prepend_body">Text vor Body</SelectItem>
                <SelectItem value="append_body">Text an Body anhängen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {needsField && (
            <div>
              <label className="text-xs text-[color:var(--ds-text-muted)]">Feldname</label>
              <Input value={field} onChange={(e) => setField(e.target.value)} placeholder="z.B. jurisdiction" className="font-mono" />
            </div>
          )}
          {needsValue && (
            <div>
              <label className="text-xs text-[color:var(--ds-text-muted)]">Wert</label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="z.B. AT" className="font-mono" />
            </div>
          )}
          {needsText && (
            <div>
              <label className="text-xs text-[color:var(--ds-text-muted)]">Text</label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs min-h-[150px]" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={() => onApply(operation, needsField ? field : undefined, needsValue ? value : undefined, needsText ? text : undefined)}
            disabled={pending || (needsField && !field)}
          >
            {pending ? "Verarbeite..." : `Auf ${selectedCount} Dateien anwenden`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Versions Dialog ────────────────────────────────────────────────────

function VersionsDialog({
  path, onClose, onRestore, onDiff, pending,
}: {
  path: string;
  onClose: () => void;
  onRestore: (version: number) => void;
  onDiff: (v1: number, v2: number) => void;
  pending: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["versions", path],
    queryFn: () => fetchJSON<{ path: string; versions: VersionEntry[] }>(`${API_BASE}/versions?path=${encodeURIComponent(path)}`),
  });
  const [diffV1, setDiffV1] = useState<number | null>(null);
  const [diffV2, setDiffV2] = useState<number | null>(null);

  const versions = data?.versions ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version-History — {path}</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="space-y-2" aria-busy="true" aria-label="Version-History wird geladen">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded border">
                <Skeleton className="h-5 w-10 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
                <Skeleton className="h-7 w-20" />
              </div>
            ))}
          </div>
        )}
        {data && (
          <div className="space-y-2">
            {versions.length === 0 && <div className="text-sm text-[color:var(--ds-text-muted)]">Keine Versionen</div>}
            {versions.slice().reverse().map((v) => (
              <div key={v.version} className="flex items-center gap-3 p-3 rounded border">
                <Badge variant="default" className="font-mono">v{v.version}</Badge>
                <div className="flex-1">
                  <div className="text-sm font-medium">{v.action}</div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(v.timestamp).toLocaleString("de-AT")} · {v.user} · {v.size} bytes
                    {v.note && ` · ${v.note}`}
                  </div>
                </div>
                <Checkbox
                  checked={diffV1 === v.version}
                  onCheckedChange={() => setDiffV1(diffV1 === v.version ? null : v.version)}
                />
                <span className="text-xs text-[color:var(--ds-text-muted)]">v1</span>
                <Checkbox
                  checked={diffV2 === v.version}
                  onCheckedChange={() => setDiffV2(diffV2 === v.version ? null : v.version)}
                />
                <span className="text-xs text-[color:var(--ds-text-muted)]">v2</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRestore(v.version)}
                  disabled={pending || v.version === versions[versions.length - 1]?.version}
                >
                  Restore
                </Button>
              </div>
            ))}
            {diffV1 !== null && diffV2 !== null && (
              <Button onClick={() => onDiff(diffV1, diffV2)} className="w-full">
                <GitCompare className="h-4 w-4 mr-2" /> Diff v{diffV1} ↔ v{diffV2}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Diff Dialog ────────────────────────────────────────────────────────

function DiffDialog({
  path, onClose, initialV1, initialV2,
}: {
  path: string;
  onClose: () => void;
  initialV1: number;
  initialV2: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["versions-for-diff", path],
    queryFn: () => fetchJSON<{ path: string; versions: VersionEntry[] }>(`${API_BASE}/versions?path=${encodeURIComponent(path)}`),
  });

  const versions = data?.versions ?? [];
  const [v1, setV1] = useState(initialV1);
  const [v2, setV2] = useState(initialV2);

  const { data: diffData, isLoading: diffLoading } = useQuery({
    queryKey: ["diff", path, v1, v2],
    queryFn: () => fetchJSON<DiffResponse>(`${API_BASE}/diff?path=${encodeURIComponent(path)}&v1=${v1}&v2=${v2}`),
    enabled: versions.length >= 2,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diff — {path}</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="space-y-2" aria-busy="true" aria-label="Diff wird geladen">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}
        {versions.length >= 2 && (
          <div className="flex items-center gap-2 mb-3">
            <Select value={String(v1)} onValueChange={(v) => setV1(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => <SelectItem key={v.version} value={String(v.version)}>v{v.version}</SelectItem>)}
              </SelectContent>
            </Select>
            <GitCompare className="h-4 w-4" />
            <Select value={String(v2)} onValueChange={(v) => setV2(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => <SelectItem key={v.version} value={String(v.version)}>v{v.version}</SelectItem>)}
              </SelectContent>
            </Select>
            {diffData && (
              <div className="text-xs text-[color:var(--ds-text-muted)] ml-4">
                +{diffData.stats.added} / -{diffData.stats.removed} / ={diffData.stats.unchanged}
              </div>
            )}
          </div>
        )}
        {diffLoading && <div className="text-center py-4 text-[color:var(--ds-text-muted)]">Diff wird berechnet...</div>}
        {diffData && (
          <div className="font-mono text-xs border rounded max-h-[500px] overflow-y-auto">
            {diffData.diff.map((line, i) => (
              <div
                key={i}
                className={`px-2 py-0.5 ${
                  line.type === "added" ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]" :
                  line.type === "removed" ? "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]" :
                  ""
                }`}
              >
                <span className="inline-block w-6 text-[color:var(--ds-text-muted)]">
                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                </span>
                {line.content}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Import-Queue Dialog ────────────────────────────────────────────────

type ImportQueueEntry = { pfad: string; benutzer: string; seit: string; art: string };
type ImportQueueData = { offen: number; eintraege: ImportQueueEntry[] };

function ImportQueueDialog({
  onClose, onPublish, pending,
}: {
  onClose: () => void;
  onPublish: (paths?: string[]) => void;
  pending: boolean;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["corpus-import-queue"],
    queryFn: () => fetchJSON<ImportQueueData>(`${API_BASE}/publish`),
  });

  const eintraege = data?.eintraege ?? [];

  const artBadge = (art: string) => {
    if (art === "create") return <Badge variant="success" className="text-xs">create</Badge>;
    if (art === "delete") return <Badge variant="danger" className="text-xs">delete</Badge>;
    return <Badge variant="warning" className="text-xs">edit</Badge>;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        // Mobile: Bottom-Sheet (thumb-reach, slide-up). Desktop: zentriert.
        className="max-w-3xl max-h-[85vh] overflow-y-auto
          fixed bottom-0 inset-x-0 top-auto translate-x-0 translate-y-0
          rounded-t-2xl rounded-none
          sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl"
      >
        {/* Grab-Handle — nur Mobile, signalisiert Bottom-Sheet */}
        <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
          <div className="h-1.5 w-10 rounded-full bg-[color:var(--ds-border)]" />
        </div>

        <DialogHeader>
          <DialogTitle>Import-Warteschlange ({data?.offen ?? 0} offen)</DialogTitle>
        </DialogHeader>

        {/* aria-live: Screen-Reader erfährt Loading→Data→Error-Wechsel */}
        <div aria-live="polite" aria-busy={isLoading}>
          {isLoading && (
            // Skeleton — spiegelt das echte Layout (3 Karten), shimmer via animate-pulse.
            // motion-reduce: keine Animation, nur graue Blöcke.
            <div className="space-y-2" aria-label="Warteschlange wird geladen">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded border">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="text-sm text-[color:var(--ds-danger-text)] dark:text-[color:var(--ds-danger-text)] py-4 text-center space-y-2">
              <XCircle className="h-8 w-8 mx-auto" />
              <div>Warteschlange konnte nicht geladen werden.</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">{(error as Error)?.message}</div>
            </div>
          )}

          {data && !isError && (
            <div className="space-y-2">
              {eintraege.length === 0 && (
                <div className="text-sm text-[color:var(--ds-text-muted)] py-4 text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-[color:var(--ds-success-text)]" />
                  Warteschlange ist leer — alle Änderungen sind in der Datenbank.
                </div>
              )}
              {eintraege.map((e) => (
                <div
                  key={e.pfad}
                  className="flex items-center gap-3 p-2 rounded border text-xs
                    hover:bg-[color:var(--ds-surface-hover)] transition-colors motion-reduce:transition-none"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{e.pfad}</div>
                    <div className="text-[color:var(--ds-text-muted)]">
                      {new Date(e.seit).toLocaleString("de-AT")} · {e.benutzer}
                    </div>
                  </div>
                  {artBadge(e.art)}
                </div>
              ))}
              {eintraege.length > 0 && (
                <div className="text-xs text-[color:var(--ds-text-muted)] pt-2 border-t">
                  Diese Dateien wurden im Dashboard geändert, aber noch nicht in die
                  Such- und Antwort-DB importiert. Die Pipeline übernimmt den Import
                  automatisch (alle ~10 Min) und leert die Warteschlange nach Erfolg.
                  &bdquo;Import anstoßen&ldquo; startet einen sofortigen Zyklus.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} aria-label="Dialog schließen">Schließen</Button>
          {eintraege.length > 0 && (
            <Button
              onClick={() => onPublish()}
              disabled={pending}
              className="active:scale-[0.98] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {pending ? "wird angestoßen ..." : `Import für ${eintraege.length} Dateien anstoßen`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
