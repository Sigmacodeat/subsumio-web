"use client";

/**
 * CorpusFileBrowser — Haupt-UI für den Corpus-Steward-Tab.
 *
 * Features:
 *  - Korpus-Auswahl (at, at-judikatur-vwgh, de, ch, eu, …)
 *  - Server-side Pagination (50/page) — 713K Dateien, nicht client-side
 *  - Sortierung (Name, Datum, Größe)
 *  - Flag-Filter (verified, needs_review, defective, unreviewed, archived, all)
 *  - Volltext-Suche (Filename + Content via grep)
 *  - Stichprobe (Zufalls-Sample)
 *  - Index-Build-Trigger (wenn Index fehlt/veraltet)
 *  - Bulk-Aktionen: Flag setzen, Löschen, Bulk-Edit (5 Operationen)
 *  - Neue Datei erstellen (Create-Dialog)
 *  - Export (JSON/CSV, einzelne Datei oder ganzes Korpus)
 *  - Klick → Öffnet CorpusFileViewer
 *
 * URL-State: corpus, page, sort, flag, q — teilbar und bookmarkbar.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { QualityFlagBadge, FLAG_OPTIONS, type QualityFlag } from "./QualityFlagBadge";
import {
  Search,
  FileText,
  RefreshCw,
  Shuffle,
  Trash2,
  Flag,
  Database,
  AlertTriangle,
  ChevronRight,
  Layers,
  Plus,
  Download,
  Edit3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  name: string;
  size: number;
  modified: string;
  flag: string | null;
}

interface ListResponse {
  corpus: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  files: FileEntry[];
  indexMissing: boolean;
  indexStale: boolean;
}

interface SearchResult {
  path: string;
  name: string;
  snippet?: string;
  matchIn: "filename" | "content" | "both";
}

interface SearchResponse {
  query: string;
  corpus: string;
  total: number;
  results: SearchResult[];
}

interface SampleResponse {
  corpus: string;
  total: number;
  sample: FileEntry[];
}

interface CreateResponse {
  created: boolean;
  path: string;
  size: number;
  importAusstehend: boolean;
}

interface BulkEditResponse {
  success: number;
  failed: number;
  errors: string[];
  operation: string;
}

type BulkEditOperation =
  | "set_field"
  | "delete_field"
  | "replace_body"
  | "prepend_body"
  | "append_body";

const BULK_EDIT_OPTIONS: {
  value: BulkEditOperation;
  label: string;
  needsField: boolean;
  needsValue: boolean;
  needsText: boolean;
}[] = [
  {
    value: "set_field",
    label: "Feld setzen",
    needsField: true,
    needsValue: true,
    needsText: false,
  },
  {
    value: "delete_field",
    label: "Feld löschen",
    needsField: true,
    needsValue: false,
    needsText: false,
  },
  {
    value: "replace_body",
    label: "Body ersetzen",
    needsField: false,
    needsValue: false,
    needsText: true,
  },
  {
    value: "prepend_body",
    label: "Body voranstellen",
    needsField: false,
    needsValue: false,
    needsText: true,
  },
  {
    value: "append_body",
    label: "Body anhängen",
    needsField: false,
    needsValue: false,
    needsText: true,
  },
];

// ── Corpus Labels ────────────────────────────────────────────────────────

const CORPUS_LABELS: Record<string, string> = {
  at: "AT — Bundesrecht (gesplittet)",
  "at-normen": "AT — Bundesrecht konsolidiert (BrKons)",
  "at-judikatur-vwgh": "AT — VwGH Judikatur",
  "at-judikatur-bvwg": "AT — BVWG Judikatur",
  "at-judikatur-lvwg": "AT — LVWG Judikatur",
  "at-judikatur-pvak": "AT — PVAK Judikatur",
  "at-judikatur-asylgh": "AT — AsylGH Judikatur",
  "at-judikatur-ubas": "AT — UBA Senat",
  "at-judikatur-dsk": "AT — DSK Judikatur",
  "at-judikatur-gbk": "AT — GBK Judikatur",
  "at-judikatur-dok": "AT — Dokumentation",
  "at-landesrecht": "AT — Landesrecht",
  "at-staatsvertraege": "AT — Staatsverträge",
  "at-avn": "AT — AVN",
  "at-avsv": "AT — AVSV",
  "at-bmerl": "AT — Bmerl",
  "at-bezirke": "AT — Bezirke",
  "at-gemeinden": "AT — Gemeinden",
  de: "DE — Bundesrecht",
  "de-openrewi": "DE — OpenRewi",
  "de-gesetzesmaterialien": "DE — Gesetzesmaterialien",
  ch: "CH — Bundesrecht",
  "ch-onlinekommentar": "CH — Online-Kommentar",
  eu: "EU — Recht",
};

function corpusLabel(key: string): string {
  return CORPUS_LABELS[key] ?? key;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-AT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  onSelectFile: (path: string) => void;
  selectedCorpus: string;
  onCorpusChange: (corpus: string) => void;
}

export function CorpusFileBrowser({ onSelectFile, selectedCorpus, onCorpusChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  // URL-State (teilbar, bookmarkbar)
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const sort = (searchParams.get("sort") as "name" | "date" | "size") ?? "name";
  const flagFilter = (searchParams.get("flag") ?? "all") as QualityFlag | "all";
  const searchQuery = searchParams.get("q") ?? "";
  const searchMode =
    searchParams.get("mode") === "sample" ? "sample" : searchQuery ? "search" : "list";

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(searchQuery);

  // Create-Dialog State
  const [createOpen, setCreateOpen] = useState(false);
  const [createPath, setCreatePath] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDocClass, setCreateDocClass] = useState<"statute" | "decision" | "literature">(
    "statute"
  );
  const [createJurisdiction, setCreateJurisdiction] = useState<"at" | "de" | "ch" | "eu">("at");
  const [createDocId, setCreateDocId] = useState("");
  const [createBody, setCreateBody] = useState("");

  // Bulk-Edit-Dialog State
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditOp, setBulkEditOp] = useState<BulkEditOperation>("set_field");
  const [bulkEditField, setBulkEditField] = useState("");
  const [bulkEditValue, setBulkEditValue] = useState("");
  const [bulkEditText, setBulkEditText] = useState("");

  // Export-Dialog State
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");

  // URL-Update-Helper
  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // ── List Query ────────────────────────────────────────────────────────
  const listQuery = useQuery<ListResponse>({
    queryKey: ["corpus-files-list", selectedCorpus, page, sort, flagFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        corpus: selectedCorpus,
        page: String(page),
        pageSize: "50",
        sort,
        flag: flagFilter,
      });
      const res = await fetch(`/api/admin/corpus-files/list?${params}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Liste nicht ladbar");
      }
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: searchMode === "list" && !!selectedCorpus,
  });

  // ── Search Query ──────────────────────────────────────────────────────
  const searchQueryFn = useQuery<SearchResponse>({
    queryKey: ["corpus-files-search", selectedCorpus, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        corpus: selectedCorpus,
        q: searchQuery,
        limit: "50",
        mode: "both",
      });
      const res = await fetch(`/api/admin/corpus-files/search?${params}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Suche fehlgeschlagen");
      }
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: searchMode === "search" && searchQuery.length >= 2,
  });

  // ── Sample Query ──────────────────────────────────────────────────────
  const sampleQuery = useQuery<SampleResponse>({
    queryKey: ["corpus-files-sample", selectedCorpus],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/corpus-files/sample?corpus=${encodeURIComponent(selectedCorpus)}&n=20`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("Stichprobe fehlgeschlagen");
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: searchMode === "sample",
  });

  // ── Build Index Mutation ──────────────────────────────────────────────
  const buildIndexMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/corpus-files/build-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpus: selectedCorpus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Index-Build fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const result = data.data ?? data;
      addToast({
        title: "Index erstellt",
        description: `${result.totalFiles?.toLocaleString("de-AT") ?? 0} Dateien indiziert`,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list", selectedCorpus] });
    },
    onError: (err: Error) => {
      addToast({ title: "Index-Build fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Flag Mutation ─────────────────────────────────────────────────────
  const flagMut = useMutation({
    mutationFn: async ({ paths, flag }: { paths: string[]; flag: QualityFlag }) => {
      const res = await fetch("/api/admin/corpus-files/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths, flag }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Flag setzen fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      addToast({
        title: "Status aktualisiert",
        description: `${vars.paths.length} Datei(en) markiert als ${FLAG_OPTIONS.find((f) => f.value === vars.flag)?.label ?? vars.flag}`,
        type: "success",
      });
      setSelectedPaths(new Set());
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list", selectedCorpus] });
    },
    onError: (err: Error) => {
      addToast({ title: "Flag fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Delete Mutation ───────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async (paths: string[]) => {
      const res = await fetch("/api/admin/corpus-files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Löschen fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      const result = data.data ?? data;
      addToast({
        title: "Dateien gelöscht",
        description: `${result.deleted ?? vars.length} Datei(en) gelöscht, ${result.failed ?? 0} fehlgeschlagen`,
        type: result.failed > 0 ? "warning" : "success",
      });
      setSelectedPaths(new Set());
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list", selectedCorpus] });
      queryClient.invalidateQueries({ queryKey: ["corpus-publish-status"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Löschen fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Create Mutation ──────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: async () => {
      // Pfad: {corpus}/{createPath} — createPath darf Unterverzeichnisse enthalten
      const fullPath = createPath.endsWith(".md")
        ? `${selectedCorpus}/${createPath}`
        : `${selectedCorpus}/${createPath}.md`;
      const frontmatter: Record<string, unknown> = {
        title: createTitle,
        doc_class: createDocClass,
        jurisdiction: createJurisdiction,
        doc_id: createDocId,
      };
      const res = await fetch("/api/admin/corpus-files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, frontmatter, body: createBody }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Erstellen fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const result = (data.data ?? data) as CreateResponse;
      addToast({
        title: "Datei erstellt",
        description: `${result.path} wurde angelegt. Import steht aus.`,
        type: "success",
      });
      // Create-Dialog zurücksetzen
      setCreateOpen(false);
      setCreatePath("");
      setCreateTitle("");
      setCreateDocId("");
      setCreateBody("");
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list", selectedCorpus] });
      queryClient.invalidateQueries({ queryKey: ["corpus-publish-status"] });
      // Neue Datei direkt im Viewer öffnen
      onSelectFile(result.path);
    },
    onError: (err: Error) => {
      addToast({ title: "Erstellen fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Bulk-Edit Mutation ───────────────────────────────────────────────
  const bulkEditMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        paths: Array.from(selectedPaths),
        operation: bulkEditOp,
      };
      if (bulkEditOp === "set_field" || bulkEditOp === "delete_field") {
        payload.field = bulkEditField;
      }
      if (bulkEditOp === "set_field") {
        // Versuche JSON-Parse für Arrays/Objekte
        let parsed: unknown = bulkEditValue;
        if (bulkEditValue.startsWith("[") || bulkEditValue.startsWith("{")) {
          try {
            parsed = JSON.parse(bulkEditValue);
          } catch {
            /* keep string */
          }
        } else if (bulkEditValue === "true") parsed = true;
        else if (bulkEditValue === "false") parsed = false;
        else if (bulkEditValue === "null") parsed = null;
        else if (/^-?\d+$/.test(bulkEditValue)) parsed = parseInt(bulkEditValue, 10);
        payload.value = parsed;
      }
      if (
        bulkEditOp === "replace_body" ||
        bulkEditOp === "prepend_body" ||
        bulkEditOp === "append_body"
      ) {
        payload.text = bulkEditText;
      }
      const res = await fetch("/api/admin/corpus-files/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Bulk-Edit fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const result = (data.data ?? data) as BulkEditResponse;
      addToast({
        title: "Bulk-Edit durchgeführt",
        description: `${result.success} Datei(en) aktualisiert, ${result.failed} fehlgeschlagen`,
        type: result.failed > 0 ? "warning" : "success",
      });
      if (result.failed > 0 && result.errors.length > 0) {
        // Erste Fehler anzeigen — Rest im Audit-Log
        addToast({
          title: "Fehler-Details",
          description:
            result.errors.slice(0, 3).join("; ") +
            (result.errors.length > 3 ? ` … (+${result.errors.length - 3})` : ""),
          type: "error",
        });
      }
      setBulkEditOpen(false);
      setBulkEditField("");
      setBulkEditValue("");
      setBulkEditText("");
      setSelectedPaths(new Set());
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list", selectedCorpus] });
      queryClient.invalidateQueries({ queryKey: ["corpus-publish-status"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Bulk-Edit fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Export Handler ───────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams({ corpus: selectedCorpus, format: exportFormat });
      const res = await fetch(`/api/admin/corpus-files/export?${params}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Export fehlgeschlagen");
      }
      if (exportFormat === "csv") {
        // CSV: direkter Download
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedCorpus}-index.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // JSON: als Datei speichern
        const json = await res.json();
        const data = json.data ?? json;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedCorpus}-index.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      addToast({
        title: "Export erstellt",
        description: `${selectedCorpus} als ${exportFormat.toUpperCase()} heruntergeladen`,
        type: "success",
      });
      setExportOpen(false);
    } catch (err) {
      addToast({
        title: "Export fehlgeschlagen",
        description: (err as Error).message,
        type: "error",
      });
    }
  }, [selectedCorpus, exportFormat, addToast]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleCorpusChange = (corpus: string) => {
    onCorpusChange(corpus);
    updateUrl({ page: undefined, q: undefined, mode: undefined });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim().length >= 2) {
      updateUrl({ q: searchInput.trim(), page: undefined, mode: undefined });
    } else if (searchInput.trim() === "") {
      updateUrl({ q: undefined, mode: undefined });
    }
  };

  const handleSample = () => {
    updateUrl({ mode: "sample", q: undefined, page: undefined });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    updateUrl({ q: undefined, mode: undefined, page: undefined });
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = (entries: FileEntry[]) => {
    setSelectedPaths((prev) => {
      if (prev.size === entries.length && entries.every((e) => prev.has(e.path))) {
        return new Set();
      }
      return new Set(entries.map((e) => e.path));
    });
  };

  const handleBulkDelete = async () => {
    if (selectedPaths.size === 0) return;
    if (
      !confirm(
        `${selectedPaths.size} Datei(en) wirklich löschen? Die Löschung wird in der Version-History gespeichert und kann rückgängig gemacht werden.`
      )
    )
      return;
    deleteMut.mutate(Array.from(selectedPaths));
  };

  const handleBulkFlag = (flag: QualityFlag) => {
    if (selectedPaths.size === 0) return;
    flagMut.mutate({ paths: Array.from(selectedPaths), flag });
  };

  // ── Render ────────────────────────────────────────────────────────────
  const isLoading = listQuery.isLoading || searchQueryFn.isLoading || sampleQuery.isLoading;
  const isError = listQuery.isError || searchQueryFn.isError || sampleQuery.isError;
  const error =
    (listQuery.error as Error) ?? (searchQueryFn.error as Error) ?? (sampleQuery.error as Error);

  // Aktuelle Dateien (Liste, Suche oder Stichprobe)
  const currentEntries: FileEntry[] = useMemo(() => {
    if (searchMode === "search" && searchQueryFn.data) {
      return searchQueryFn.data.results.map((r) => ({
        path: r.path,
        name: r.name,
        size: 0,
        modified: "",
        flag: null,
      }));
    }
    if (searchMode === "sample" && sampleQuery.data) {
      return sampleQuery.data.sample;
    }
    if (listQuery.data) {
      return listQuery.data.files;
    }
    return [];
  }, [searchMode, searchQueryFn.data, sampleQuery.data, listQuery.data]);

  const totalCount =
    searchMode === "search"
      ? (searchQueryFn.data?.total ?? 0)
      : searchMode === "sample"
        ? (sampleQuery.data?.total ?? 0)
        : (listQuery.data?.total ?? 0);

  const totalPages = listQuery.data?.totalPages ?? 0;
  const indexMissing = listQuery.data?.indexMissing ?? false;
  const indexStale = listQuery.data?.indexStale ?? false;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-[color:var(--brand-primary)]" aria-hidden="true" />
            Corpus-Steward
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Korpus-Auswahl + Aktionen */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedCorpus} onValueChange={handleCorpusChange}>
              <SelectTrigger className="w-[280px]" aria-label="Korpus auswählen">
                <Layers
                  className="mr-2 h-4 w-4 text-[color:var(--ds-text-muted)]"
                  aria-hidden="true"
                />
                <SelectValue placeholder="Korpus wählen" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(CORPUS_LABELS).map((key) => (
                  <SelectItem key={key} value={key}>
                    {corpusLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <form onSubmit={handleSearch} className="flex min-w-[200px] flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Volltext-Suche (min. 2 Zeichen)…"
                  className="pl-9"
                  aria-label="Volltext-Suche im Corpus"
                  minLength={2}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={searchInput.trim().length > 0 && searchInput.trim().length < 2}
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Suchen</span>
              </Button>
            </form>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSample}
              disabled={!selectedCorpus || searchMode === "sample"}
              aria-label="Zufallsstichprobe"
            >
              <Shuffle className="h-4 w-4" aria-hidden="true" />
              Stichprobe
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              disabled={!selectedCorpus}
              aria-label="Korpus exportieren"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!selectedCorpus}
              aria-label="Neue Datei erstellen"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Neue Datei</span>
            </Button>

            {searchMode !== "list" && (
              <Button variant="ghost" size="sm" onClick={handleClearSearch}>
                Zurück zur Liste
              </Button>
            )}
          </div>

          {/* Filter + Sort (nur im Listen-Modus) */}
          {searchMode === "list" && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={flagFilter}
                onValueChange={(v) =>
                  updateUrl({ flag: v === "all" ? undefined : v, page: undefined })
                }
              >
                <SelectTrigger className="w-[160px]" aria-label="Status-Filter">
                  <Flag
                    className="mr-2 h-4 w-4 text-[color:var(--ds-text-muted)]"
                    aria-hidden="true"
                  />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  {FLAG_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="unreviewed">Ungeprüft</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sort}
                onValueChange={(v) =>
                  updateUrl({ sort: v === "name" ? undefined : v, page: undefined })
                }
              >
                <SelectTrigger className="w-[140px]" aria-label="Sortierung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name (A–Z)</SelectItem>
                  <SelectItem value="date">Datum (neu zuerst)</SelectItem>
                  <SelectItem value="size">Größe (groß zuerst)</SelectItem>
                </SelectContent>
              </Select>

              <span
                className="ml-auto text-sm text-[color:var(--ds-text-muted)]"
                aria-live="polite"
              >
                {totalCount.toLocaleString("de-AT")} Dateien
              </span>
            </div>
          )}

          {/* Index-Status Warnung */}
          {(indexMissing || indexStale) && searchMode === "list" && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle
                className="h-4 w-4 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span className="flex-1">
                {indexMissing ? "Datei-Index fehlt." : "Datei-Index ist veraltet."} Die Liste ist
                eventuell unvollständig.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => buildIndexMut.mutate()}
                disabled={buildIndexMut.isPending}
              >
                {buildIndexMut.isPending ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> wird gebaut…
                  </>
                ) : (
                  <>
                    <Database className="h-3 w-3" aria-hidden="true" /> Index erstellen
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Bulk-Aktionen */}
          {selectedPaths.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--ds-accent)]/30 bg-[color:var(--ds-accent)]/5 p-3">
              <span className="text-sm font-medium">{selectedPaths.size} ausgewählt</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-xs text-[color:var(--ds-text-muted)]">Status setzen:</span>
                {FLAG_OPTIONS.map((f) => (
                  <Button
                    key={f.value}
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkFlag(f.value)}
                    disabled={flagMut.isPending}
                  >
                    {f.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkEditOpen(true)}
                  disabled={bulkEditMut.isPending}
                >
                  <Edit3 className="h-3 w-3" aria-hidden="true" />
                  Bulk-Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleBulkDelete}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  Löschen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPaths(new Set())}>
                  Aufheben
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Datei-Liste ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {/* Loading */}
          {isLoading && (
            <div className="space-y-2 p-4" aria-live="polite" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-3 p-12 text-center" role="alert">
              <AlertTriangle
                className="h-8 w-8 text-[color:var(--ds-danger-text)]"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium text-[color:var(--ds-text)]">Fehler beim Laden</p>
                <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                  {error?.message ?? "Unbekannter Fehler"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !isError && currentEntries.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <FileText className="h-8 w-8 text-[color:var(--ds-text-muted)]" aria-hidden="true" />
              <div>
                <p className="font-medium text-[color:var(--ds-text)]">
                  {searchMode === "search" ? "Keine Treffer" : "Keine Dateien"}
                </p>
                <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                  {searchMode === "search"
                    ? `Keine Dateien gefunden für „${searchQuery}".`
                    : indexMissing
                      ? "Der Datei-Index fehlt. Bitte Index erstellen."
                      : "Dieses Korpus ist leer oder der Filter trifft auf keine Datei zu."}
                </p>
              </div>
              {searchMode === "search" && (
                <Button variant="outline" size="sm" onClick={handleClearSearch}>
                  Suche zurücksetzen
                </Button>
              )}
              {indexMissing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => buildIndexMut.mutate()}
                  disabled={buildIndexMut.isPending}
                >
                  <Database className="h-3 w-3" aria-hidden="true" />
                  Index erstellen
                </Button>
              )}
            </div>
          )}

          {/* Tabelle */}
          {!isLoading && !isError && currentEntries.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead className="border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]/50">
                    <tr>
                      <th className="w-10 px-3 py-2 text-left">
                        <Checkbox
                          checked={
                            currentEntries.length > 0 &&
                            currentEntries.every((e) => selectedPaths.has(e.path))
                          }
                          onCheckedChange={() => toggleSelectAll(currentEntries)}
                          aria-label="Alle auswählen"
                        />
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]">
                        Datei
                      </th>
                      <th className="hidden px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)] md:table-cell">
                        Status
                      </th>
                      <th className="hidden px-3 py-2 text-right font-medium text-[color:var(--ds-text-muted)] lg:table-cell">
                        Größe
                      </th>
                      <th className="hidden px-3 py-2 text-right font-medium text-[color:var(--ds-text-muted)] lg:table-cell">
                        Geändert
                      </th>
                      <th className="w-10 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--ds-border)]">
                    {currentEntries.map((entry) => {
                      const isSelected = selectedPaths.has(entry.path);
                      return (
                        <tr
                          key={entry.path}
                          className={cn(
                            "group cursor-pointer transition-colors hover:bg-[color:var(--ds-surface-2)]/50",
                            isSelected && "bg-[color:var(--ds-accent)]/5"
                          )}
                          onClick={() => onSelectFile(entry.path)}
                        >
                          <td
                            className="px-3 py-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelect(entry.path);
                            }}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(entry.path)}
                              aria-label={`Datei ${entry.name} auswählen`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <FileText
                                className="h-4 w-4 shrink-0 text-[color:var(--ds-text-muted)]"
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-[color:var(--ds-text)]">
                                  {entry.name}
                                </p>
                                <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                                  {entry.path}
                                </p>
                                {/* Mobile: Status inline */}
                                <div className="mt-1 md:hidden">
                                  <QualityFlagBadge flag={entry.flag as QualityFlag | null} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-3 py-2 md:table-cell">
                            <QualityFlagBadge flag={entry.flag as QualityFlag | null} />
                          </td>
                          <td className="hidden px-3 py-2 text-right text-[color:var(--ds-text-muted)] lg:table-cell">
                            {entry.size > 0 ? formatSize(entry.size) : "—"}
                          </td>
                          <td className="hidden px-3 py-2 text-right text-[color:var(--ds-text-muted)] lg:table-cell">
                            {entry.modified ? formatDate(entry.modified) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <ChevronRight
                              className="h-4 w-4 text-[color:var(--ds-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                              aria-hidden="true"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination (nur Listen-Modus) */}
              {searchMode === "list" && totalPages > 1 && (
                <div className="flex items-center justify-center border-t border-[color:var(--ds-border)] p-4">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={(p) => updateUrl({ page: p === 1 ? undefined : String(p) })}
                  />
                </div>
              )}

              {/* Search/Sample: Hinweis */}
              {searchMode !== "list" && (
                <div className="border-t border-[color:var(--ds-border)] p-3 text-center text-xs text-[color:var(--ds-text-muted)]">
                  {searchMode === "search" && searchQueryFn.data
                    ? `${searchQueryFn.data.total} Treffer für „${searchQuery}" — begrenzt auf 50 Ergebnisse`
                    : searchMode === "sample" && sampleQuery.data
                      ? `Zufallsstichprobe aus ${sampleQuery.data.total.toLocaleString("de-AT")} Dateien`
                      : null}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Create-Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[color:var(--brand-primary)]" aria-hidden="true" />
              Neue Datei in {corpusLabel(selectedCorpus)}
            </DialogTitle>
            <DialogDescription>
              Erstellt eine neue Markdown-Datei mit Frontmatter. Der Import in die Datenbank steht
              nach dem Speichern aus.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Pfad */}
            <div className="space-y-1.5">
              <Label htmlFor="create-path" className="text-sm font-medium">
                Pfad <span className="text-[color:var(--ds-danger-text)]">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-[color:var(--ds-surface-2)] px-2 py-1.5 font-mono text-xs text-[color:var(--ds-text-muted)]">
                  {selectedCorpus}/
                </span>
                <Input
                  id="create-path"
                  value={createPath}
                  onChange={(e) => setCreatePath(e.target.value)}
                  placeholder="unterverzeichnis/dateiname.md"
                  className="font-mono text-xs"
                  aria-describedby="create-path-hint"
                />
              </div>
              <p id="create-path-hint" className="text-xs text-[color:var(--ds-text-muted)]">
                Relativer Pfad innerhalb des Korpus. Endet automatisch auf .md falls weggelassen.
              </p>
            </div>

            {/* Titel */}
            <div className="space-y-1.5">
              <Label htmlFor="create-title" className="text-sm font-medium">
                Titel <span className="text-[color:var(--ds-danger-text)]">*</span>
              </Label>
              <Input
                id="create-title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="z.B. ABGB § 1234 — Schadenersatz"
              />
            </div>

            {/* doc_class + Jurisdiction */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-doc-class" className="text-sm font-medium">
                  Dokumentklasse <span className="text-[color:var(--ds-danger-text)]">*</span>
                </Label>
                <Select
                  value={createDocClass}
                  onValueChange={(v) => setCreateDocClass(v as typeof createDocClass)}
                >
                  <SelectTrigger id="create-doc-class" aria-label="Dokumentklasse wählen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="statute">Gesetz / Verordnung</SelectItem>
                    <SelectItem value="decision">Gerichtsentscheidung</SelectItem>
                    <SelectItem value="literature">Literatur / Kommentar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-jurisdiction" className="text-sm font-medium">
                  Rechtsraum <span className="text-[color:var(--ds-danger-text)]">*</span>
                </Label>
                <Select
                  value={createJurisdiction}
                  onValueChange={(v) => setCreateJurisdiction(v as typeof createJurisdiction)}
                >
                  <SelectTrigger id="create-jurisdiction" aria-label="Rechtsraum wählen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="at">AT — Österreich</SelectItem>
                    <SelectItem value="de">DE — Deutschland</SelectItem>
                    <SelectItem value="ch">CH — Schweiz</SelectItem>
                    <SelectItem value="eu">EU — Europäisch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* doc_id */}
            <div className="space-y-1.5">
              <Label htmlFor="create-doc-id" className="text-sm font-medium">
                Dokument-ID <span className="text-[color:var(--ds-danger-text)]">*</span>
              </Label>
              <Input
                id="create-doc-id"
                value={createDocId}
                onChange={(e) => setCreateDocId(e.target.value)}
                placeholder="z.B. 10001290, ECLI:AT:VwGH:2024:1234"
                className="font-mono text-xs"
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="create-body" className="text-sm font-medium">
                Inhalt (optional)
              </Label>
              <Textarea
                id="create-body"
                value={createBody}
                onChange={(e) => setCreateBody(e.target.value)}
                placeholder="Markdown-Inhalt der Datei…"
                className="min-h-[150px] font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={
                createMut.isPending ||
                !createPath.trim() ||
                !createTitle.trim() ||
                !createDocId.trim()
              }
            >
              {createMut.isPending ? "wird erstellt…" : "Datei erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk-Edit-Dialog ───────────────────────────────────────────── */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-[color:var(--brand-primary)]" aria-hidden="true" />
              Bulk-Edit — {selectedPaths.size} Dateien
            </DialogTitle>
            <DialogDescription>
              Wendet eine Operation auf alle ausgewählten Dateien an. Schema-Validierung verhindert
              ungültige Werte bei &bdquo;Feld setzen&ldquo;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Operation wählen */}
            <div className="space-y-1.5">
              <Label htmlFor="bulk-op" className="text-sm font-medium">
                Operation
              </Label>
              <Select
                value={bulkEditOp}
                onValueChange={(v) => setBulkEditOp(v as BulkEditOperation)}
              >
                <SelectTrigger id="bulk-op" aria-label="Operation wählen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BULK_EDIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Feld (für set_field / delete_field) */}
            {(bulkEditOp === "set_field" || bulkEditOp === "delete_field") && (
              <div className="space-y-1.5">
                <Label htmlFor="bulk-field" className="text-sm font-medium">
                  Feldname <span className="text-[color:var(--ds-danger-text)]">*</span>
                </Label>
                <Input
                  id="bulk-field"
                  value={bulkEditField}
                  onChange={(e) => setBulkEditField(e.target.value)}
                  placeholder="z.B. court, decision_date, ecli, doc_subtype"
                  className="font-mono text-xs"
                />
              </div>
            )}

            {/* Wert (für set_field) */}
            {bulkEditOp === "set_field" && (
              <div className="space-y-1.5">
                <Label htmlFor="bulk-value" className="text-sm font-medium">
                  Wert <span className="text-[color:var(--ds-danger-text)]">*</span>
                </Label>
                <Input
                  id="bulk-value"
                  value={bulkEditValue}
                  onChange={(e) => setBulkEditValue(e.target.value)}
                  placeholder="String, Zahl, true/false, null, oder JSON-Array/Objekt"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  JSON-Syntax für Arrays/Objekte:{" "}
                  <code className="font-mono">[&quot;a&quot;,&quot;b&quot;]</code> oder{" "}
                  <code className="font-mono">{`{"key":"val"}`}</code>
                </p>
              </div>
            )}

            {/* Text (für Body-Operationen) */}
            {(bulkEditOp === "replace_body" ||
              bulkEditOp === "prepend_body" ||
              bulkEditOp === "append_body") && (
              <div className="space-y-1.5">
                <Label htmlFor="bulk-text" className="text-sm font-medium">
                  Text <span className="text-[color:var(--ds-danger-text)]">*</span>
                </Label>
                <Textarea
                  id="bulk-text"
                  value={bulkEditText}
                  onChange={(e) => setBulkEditText(e.target.value)}
                  placeholder="Markdown-Text…"
                  className="min-h-[150px] font-mono text-xs"
                />
              </div>
            )}

            {/* Warnung */}
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <div>
                <strong className="text-amber-700 dark:text-amber-400">Riskant.</strong>{" "}
                {selectedPaths.size} Dateien werden geändert. Jede Änderung wird in der
                Version-History gesichert und kann pro Datei rückgängig gemacht werden. Der Import
                in die Datenbank steht aus.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkEditOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => bulkEditMut.mutate()}
              disabled={
                bulkEditMut.isPending ||
                ((bulkEditOp === "set_field" || bulkEditOp === "delete_field") &&
                  !bulkEditField.trim()) ||
                (bulkEditOp === "set_field" && !bulkEditValue.trim()) ||
                ((bulkEditOp === "replace_body" ||
                  bulkEditOp === "prepend_body" ||
                  bulkEditOp === "append_body") &&
                  !bulkEditText.trim())
              }
            >
              {bulkEditMut.isPending ? "wird angewendet…" : `${selectedPaths.size} Dateien ändern`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export-Dialog ──────────────────────────────────────────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-[color:var(--brand-primary)]" aria-hidden="true" />
              Korpus exportieren
            </DialogTitle>
            <DialogDescription>
              Exportiert den Datei-Index von {corpusLabel(selectedCorpus)} als JSON oder CSV.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Format</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setExportFormat("json")}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    exportFormat === "json"
                      ? "border-[color:var(--ds-accent)] bg-[color:var(--ds-accent)]/10"
                      : "border-[color:var(--ds-border)] hover:bg-[color:var(--ds-surface-2)]"
                  )}
                  aria-pressed={exportFormat === "json"}
                >
                  <p className="text-sm font-medium">JSON</p>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    Strukturiert, mit Frontmatter
                  </p>
                </button>
                <button
                  onClick={() => setExportFormat("csv")}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    exportFormat === "csv"
                      ? "border-[color:var(--ds-accent)] bg-[color:var(--ds-accent)]/10"
                      : "border-[color:var(--ds-border)] hover:bg-[color:var(--ds-surface-2)]"
                  )}
                  aria-pressed={exportFormat === "csv"}
                >
                  <p className="text-sm font-medium">CSV</p>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    Tabelle: Pfad, Größe, Datum
                  </p>
                </button>
              </div>
            </div>

            <div className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]/30 p-3 text-xs text-[color:var(--ds-text-muted)]">
              <p>
                <strong className="text-[color:var(--ds-text)]">
                  {corpusLabel(selectedCorpus)}
                </strong>
              </p>
              <p className="mt-1">
                {totalCount.toLocaleString("de-AT")} Dateien im Index. Export enthält nur Metadaten
                (Pfad, Größe, Datum) — nicht die Dateiinhalte.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleExport} disabled={totalCount === 0}>
              <Download className="h-3 w-3" aria-hidden="true" />
              Herunterladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
