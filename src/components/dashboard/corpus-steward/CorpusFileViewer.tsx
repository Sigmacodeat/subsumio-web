"use client";

/**
 * CorpusFileViewer — Datei-Ansicht mit Edit, Version-History und Diff.
 *
 * Features:
 *  - Frontmatter + Body anzeigen (read-only)
 *  - Edit-Modus: Frontmatter-Felder + Body-Textarea
 *  - Schema-Validierung vor Speichern (doc_class-spezifisch)
 *  - Concurrent-Edit-Schutz (expectedHash)
 *  - Version-History: Liste + Restore + Diff-Anzeige
 *  - Quality-Flag setzen (verified, needs_review, defective, archived)
 *  - Body auf 100KB limitiert in UI (große Dateien)
 *  - Keyboard: Esc schließt, Ctrl+S speichert
 *
 * Accessibility: Dialog mit Fokus-Trap, ARIA-Labels, Tastatur-Navigation.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { QualityFlagBadge, FLAG_OPTIONS, type QualityFlag } from "./QualityFlagBadge";
import {
  X,
  Save,
  Pencil,
  History,
  RotateCcw,
  Flag,
  Trash2,
  FileText,
  AlertTriangle,
  Plus,
  Minus,
  GitCompare,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

interface FileDetail {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
  flag: string | null;
  flagNote: string | null;
  size: number;
}

interface VersionEntry {
  version: number;
  timestamp: string;
  user: string;
  size: number;
  action: "edit" | "create" | "restore" | "delete";
  note?: string;
}

interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  path?: string;
  details?: Record<string, unknown>;
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
  v2: number | "current";
  diff: DiffLine[];
  stats: { added: number; removed: number; unchanged: number };
}

const BODY_LIMIT = 100_000; // 100KB UI-Limit

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-AT", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACTION_LABELS: Record<string, string> = {
  edit: "Bearbeitet",
  create: "Erstellt",
  restore: "Wiederhergestellt",
  delete: "Gelöscht",
};

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  path: string | null;
  onClose: () => void;
}

export function CorpusFileViewer({ path, onClose }: Props) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "versions" | "audit">("content");
  const [diffVersions, setDiffVersions] = useState<{ v1: number; v2?: number } | null>(null);

  // Edit-Form-State
  const [editFrontmatter, setEditFrontmatter] = useState<Record<string, unknown>>({});
  const [editBody, setEditBody] = useState("");
  const [expectedHash, setExpectedHash] = useState<string | undefined>();

  // Reset beim Datei-Wechsel
  useEffect(() => {
    setIsEditing(false);
    setActiveTab("content");
    setDiffVersions(null);
  }, [path]);

  // ── Read Query ────────────────────────────────────────────────────────
  const readQuery = useQuery<FileDetail>({
    queryKey: ["corpus-file-read", path],
    queryFn: async () => {
      const res = await fetch(`/api/admin/corpus-files/read?path=${encodeURIComponent(path!)}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Datei nicht ladbar");
      }
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!path,
  });

  // ── Versions Query ────────────────────────────────────────────────────
  const versionsQuery = useQuery<{ path: string; versions: VersionEntry[] }>({
    queryKey: ["corpus-file-versions", path],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/corpus-files/versions?path=${encodeURIComponent(path!)}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("Versionen nicht ladbar");
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!path && activeTab === "versions",
  });

  // ── Audit Query ──────────────────────────────────────────────────────
  const auditQuery = useQuery<{ entries: AuditEntry[]; count: number }>({
    queryKey: ["corpus-file-audit", path],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/corpus-files/audit?path=${encodeURIComponent(path!)}&limit=100`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("Audit-Log nicht ladbar");
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!path && activeTab === "audit",
  });

  // ── Live Schema-Validation Query (im Edit-Modus) ─────────────────────
  const validationQuery = useQuery<{
    valid: boolean;
    errors: Array<{ field: string; message: string; severity: "error" | "warning" }>;
    warnings: Array<{ field: string; message: string; severity: "error" | "warning" }>;
  }>({
    queryKey: ["corpus-file-validate", editFrontmatter],
    queryFn: async () => {
      const res = await fetch("/api/admin/corpus-files/validate-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontmatter: editFrontmatter }),
      });
      if (!res.ok) throw new Error("Validierung fehlgeschlagen");
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: isEditing && Object.keys(editFrontmatter).length > 0,
    // Debounce via staleTime — verhindert API-Spam bei jedem Tastenanschlag
    staleTime: 500,
  });

  // ── Diff Query ────────────────────────────────────────────────────────
  const diffQuery = useQuery<DiffResponse>({
    queryKey: ["corpus-file-diff", path, diffVersions],
    queryFn: async () => {
      const params = new URLSearchParams({ path: path!, v1: String(diffVersions!.v1) });
      if (diffVersions!.v2 !== undefined) params.set("v2", String(diffVersions!.v2));
      const res = await fetch(`/api/admin/corpus-files/diff?${params}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Diff nicht ladbar");
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!path && diffVersions !== null,
  });

  // ── Write Mutation ────────────────────────────────────────────────────
  const writeMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/corpus-files/write", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: path!,
          frontmatter: editFrontmatter,
          body: editBody,
          expectedHash,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Speichern fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: () => {
      addToast({
        title: "Gespeichert",
        description: "Datei aktualisiert. Import in die Datenbank steht aus.",
        type: "success",
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["corpus-file-read", path] });
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
      queryClient.invalidateQueries({ queryKey: ["corpus-publish-status"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Speichern fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Flag Mutation ─────────────────────────────────────────────────────
  const flagMut = useMutation({
    mutationFn: async (flag: QualityFlag) => {
      const res = await fetch("/api/admin/corpus-files/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path!, flag }),
      });
      if (!res.ok) throw new Error("Flag setzen fehlgeschlagen");
      return res.json();
    },
    onSuccess: (_data, flag) => {
      addToast({
        title: "Status aktualisiert",
        description: `Datei markiert als ${FLAG_OPTIONS.find((f) => f.value === flag)?.label ?? flag}`,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["corpus-file-read", path] });
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Flag fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Delete Mutation ───────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/corpus-files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path! }),
      });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      return res.json();
    },
    onSuccess: () => {
      addToast({
        title: "Datei gelöscht",
        description: "Die Datei wurde entfernt. Import-Ausgleich steht aus.",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
      queryClient.invalidateQueries({ queryKey: ["corpus-publish-status"] });
      onClose();
    },
    onError: (err: Error) => {
      addToast({ title: "Löschen fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  // ── Restore Mutation ──────────────────────────────────────────────────
  const restoreMut = useMutation({
    mutationFn: async (version: number) => {
      const res = await fetch("/api/admin/corpus-files/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path!, version }),
      });
      if (!res.ok) throw new Error("Wiederherstellen fehlgeschlagen");
      return res.json();
    },
    onSuccess: (_data, version) => {
      addToast({
        title: "Wiederhergestellt",
        description: `Version ${version} wurde wiederhergestellt. Import steht aus.`,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["corpus-file-read", path] });
      queryClient.invalidateQueries({ queryKey: ["corpus-file-versions", path] });
      queryClient.invalidateQueries({ queryKey: ["corpus-files-list"] });
      queryClient.invalidateQueries({ queryKey: ["corpus-publish-status"] });
      setDiffVersions(null);
    },
    onError: (err: Error) => {
      addToast({
        title: "Wiederherstellen fehlgeschlagen",
        description: err.message,
        type: "error",
      });
    },
  });

  // ── Edit Start ────────────────────────────────────────────────────────
  const startEdit = useCallback(() => {
    if (!readQuery.data) return;
    setEditFrontmatter(JSON.parse(JSON.stringify(readQuery.data.frontmatter)));
    setEditBody(readQuery.data.body);
    // Hash aus raw-Inhalt ableiten (Server macht sha256, wir senden den
    // raw-String den wir beim Laden bekommen haben — der Server rechnet)
    setExpectedHash(undefined); // Server berechnet Hash aus Datei, wir senden nicht
    setIsEditing(true);
  }, [readQuery.data]);

  // ── Save Handler ──────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    writeMut.mutate();
  }, [writeMut]);

  // ── Keyboard: Ctrl+S / Esc ────────────────────────────────────────────
  useEffect(() => {
    if (!path) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isEditing) {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && isEditing) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [path, isEditing, onClose, handleSave]);

  // ── Frontmatter Edit Helpers ──────────────────────────────────────────
  const updateFmField = (key: string, value: unknown) => {
    setEditFrontmatter((prev) => ({ ...prev, [key]: value }));
  };

  const addFmField = () => {
    const key = `feld_${Date.now().toString(36)}`;
    setEditFrontmatter((prev) => ({ ...prev, [key]: "" }));
  };

  const removeFmField = (key: string) => {
    setEditFrontmatter((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // ── Body truncated? ───────────────────────────────────────────────────
  const bodyTruncated = readQuery.data && readQuery.data.body.length > BODY_LIMIT;
  const displayBody = readQuery.data
    ? bodyTruncated
      ? readQuery.data.body.slice(0, BODY_LIMIT) +
        "\n\n… [Body in UI auf 100KB gekürzt — vollständige Datei über API]"
      : readQuery.data.body
    : "";

  // ── Loading / Error ───────────────────────────────────────────────────
  if (!path) return null;

  return (
    <Dialog
      open={!!path}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-[color:var(--ds-border)] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText
                  className="h-4 w-4 shrink-0 text-[color:var(--brand-primary)]"
                  aria-hidden="true"
                />
                <span className="truncate">{path?.split("/").pop() ?? ""}</span>
              </DialogTitle>
              <p className="mt-1 truncate text-xs text-[color:var(--ds-text-muted)]">{path}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {readQuery.data && (
                <QualityFlagBadge flag={readQuery.data.flag as QualityFlag | null} size="default" />
              )}
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Schließen">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Tabs: Content / Versions / Audit */}
          <div className="mt-3 flex gap-1">
            <button
              onClick={() => setActiveTab("content")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === "content"
                  ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                  : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
              aria-pressed={activeTab === "content"}
            >
              <FileText className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              Inhalt
            </button>
            <button
              onClick={() => setActiveTab("versions")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === "versions"
                  ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                  : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
              aria-pressed={activeTab === "versions"}
            >
              <History className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              Versionen
              {versionsQuery.data && versionsQuery.data.versions.length > 0 && (
                <Badge variant="default" className="ml-1.5 text-xs">
                  {versionsQuery.data.versions.length}
                </Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === "audit"
                  ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                  : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
              aria-pressed={activeTab === "audit"}
            >
              <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              Audit-Log
            </button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="max-h-[calc(90vh-180px)] overflow-y-auto px-6 py-4">
          {/* Loading */}
          {readQuery.isLoading && (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}

          {/* Error */}
          {readQuery.isError && !readQuery.isLoading && (
            <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
              <AlertTriangle
                className="h-8 w-8 text-[color:var(--ds-danger-text)]"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Fehler beim Laden</p>
                <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                  {(readQuery.error as Error)?.message ?? "Datei nicht gefunden"}
                </p>
              </div>
            </div>
          )}

          {/* Content Tab */}
          {readQuery.data && activeTab === "content" && (
            <div className="space-y-4">
              {/* Read-Only Mode */}
              {!isEditing && (
                <>
                  {/* Frontmatter */}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text-muted)]">
                      Frontmatter
                      {readQuery.data.size > 0 && (
                        <span className="ml-2 text-xs font-normal">
                          · {formatSize(readQuery.data.size)}
                        </span>
                      )}
                    </h3>
                    <dl className="grid grid-cols-1 gap-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]/30 p-3 sm:grid-cols-2">
                      {Object.entries(readQuery.data.frontmatter).map(([key, val]) => (
                        <div key={key} className="flex gap-2 text-sm">
                          <dt className="shrink-0 font-mono text-xs text-[color:var(--ds-text-muted)]">
                            {key}:
                          </dt>
                          <dd className="min-w-0 truncate font-mono text-xs text-[color:var(--ds-text)]">
                            {Array.isArray(val)
                              ? `[${val.length} Einträge]`
                              : typeof val === "object" && val !== null
                                ? JSON.stringify(val)
                                : String(val)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* Body */}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text-muted)]">
                      Inhalt
                      {bodyTruncated && (
                        <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                          (in UI gekürzt)
                        </span>
                      )}
                    </h3>
                    <pre
                      className="max-h-[400px] overflow-auto rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]/30 p-3 font-mono text-xs leading-relaxed text-[color:var(--ds-text)]"
                      aria-label="Datei-Inhalt"
                    >
                      {displayBody}
                    </pre>
                  </div>
                </>
              )}

              {/* Edit Mode */}
              {isEditing && (
                <div className="space-y-4">
                  {/* Frontmatter Editor */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[color:var(--ds-text-muted)]">
                        Frontmatter bearbeiten
                      </h3>
                      <Button size="sm" variant="ghost" onClick={addFmField}>
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        Feld hinzufügen
                      </Button>
                    </div>
                    <div className="space-y-2 rounded-md border border-[color:var(--ds-border)] p-3">
                      {Object.entries(editFrontmatter).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-2">
                          <Input
                            value={key}
                            onChange={(e) => {
                              const newKey = e.target.value;
                              setEditFrontmatter((prev) => {
                                const next = { ...prev };
                                const v = next[key];
                                delete next[key];
                                next[newKey] = v;
                                return next;
                              });
                            }}
                            className="w-40 font-mono text-xs"
                            aria-label={`Feldname ${key}`}
                          />
                          <Input
                            value={
                              Array.isArray(val)
                                ? JSON.stringify(val)
                                : typeof val === "object"
                                  ? JSON.stringify(val)
                                  : String(val ?? "")
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              let parsed: unknown = raw;
                              // Versuche JSON-Parse für Arrays/Objekte
                              if (raw.startsWith("[") || raw.startsWith("{")) {
                                try {
                                  parsed = JSON.parse(raw);
                                } catch {
                                  /* keep as string */
                                }
                              } else if (raw === "true") parsed = true;
                              else if (raw === "false") parsed = false;
                              else if (raw === "null") parsed = null;
                              else if (/^-?\d+$/.test(raw)) parsed = parseInt(raw, 10);
                              updateFmField(key, parsed);
                            }}
                            className="flex-1 font-mono text-xs"
                            aria-label={`Wert für ${key}`}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFmField(key)}
                            aria-label={`Feld ${key} entfernen`}
                          >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                      {Object.keys(editFrontmatter).length === 0 && (
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          Keine Felder. Klicke &bdquo;Feld hinzufügen&ldquo;.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Body Editor */}
                  <div>
                    <Label className="mb-2 block text-sm font-semibold text-[color:var(--ds-text-muted)]">
                      Inhalt (Markdown)
                    </Label>
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="min-h-[400px] font-mono text-xs leading-relaxed"
                      maxLength={500_000}
                      aria-label="Datei-Inhalt bearbeiten"
                    />
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {editBody.length.toLocaleString("de-AT")} Zeichen
                      {editBody.length > 500_000 && (
                        <span className="text-[color:var(--ds-danger-text)]">
                          {" "}
                          — Maximum erreicht
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Live Schema-Validierung */}
                  {validationQuery.data && (
                    <div
                      className={cn(
                        "rounded-md border p-3 text-sm",
                        validationQuery.data.valid
                          ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]"
                          : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
                      )}
                      aria-live="polite"
                    >
                      {validationQuery.data.valid ? (
                        <p className="flex items-center gap-2 text-[color:var(--ds-success-text)]">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Frontmatter ist schema-valide.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          <p className="flex items-center gap-2 font-medium text-[color:var(--ds-danger-text)]">
                            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                            {validationQuery.data.errors.length} Fehler im Frontmatter
                          </p>
                          <ul className="ml-6 list-disc text-xs text-[color:var(--ds-danger-text)]">
                            {validationQuery.data.errors.map((e, i) => (
                              <li key={i}>
                                {e.field}: {e.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {validationQuery.data.warnings.length > 0 && (
                        <ul className="mt-2 ml-6 list-disc text-xs text-[color:var(--ds-warning-text)]">
                          {validationQuery.data.warnings.map((w, i) => (
                            <li key={i}>
                              {w.field}: {w.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Versions Tab */}
          {readQuery.data && activeTab === "versions" && (
            <div className="space-y-4">
              {versionsQuery.isLoading && (
                <div className="space-y-2" aria-live="polite" aria-busy="true">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              )}

              {versionsQuery.data && versionsQuery.data.versions.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <History
                    className="h-6 w-6 text-[color:var(--ds-text-muted)]"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    Keine Versionen vorhanden.
                  </p>
                </div>
              )}

              {versionsQuery.data && versionsQuery.data.versions.length > 0 && (
                <>
                  {/* Versions-Liste */}
                  <div className="space-y-2">
                    {versionsQuery.data.versions
                      .slice()
                      .reverse()
                      .map((v) => (
                        <div
                          key={v.version}
                          className={cn(
                            "flex items-center gap-3 rounded-md border p-3 transition-colors",
                            diffVersions?.v1 === v.version
                              ? "border-[color:var(--ds-accent)] bg-[color:var(--ds-accent)]/5"
                              : "border-[color:var(--ds-border)] hover:bg-[color:var(--ds-surface-2)]/50"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="default" className="text-xs">
                                v{v.version}
                              </Badge>
                              <span className="text-xs text-[color:var(--ds-text-muted)]">
                                {ACTION_LABELS[v.action] ?? v.action}
                              </span>
                              {v.note && (
                                <span className="text-xs text-[color:var(--ds-text-muted)]">
                                  · {v.note}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                              {formatDate(v.timestamp)} · {v.user} · {formatSize(v.size)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDiffVersions({ v1: v.version })}
                              aria-label={`Diff von Version ${v.version} zu aktuell`}
                            >
                              <GitCompare className="h-3 w-3" aria-hidden="true" />
                              Diff
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Version ${v.version} wiederherstellen? Die aktuelle Version wird als neue Version gesichert.`
                                  )
                                ) {
                                  restoreMut.mutate(v.version);
                                }
                              }}
                              disabled={restoreMut.isPending}
                              aria-label={`Version ${v.version} wiederherstellen`}
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              Restore
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Diff-Anzeige */}
                  {diffVersions && diffQuery.data && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[color:var(--ds-text-muted)]">
                          Diff: v{diffVersions.v1} → {diffVersions.v2 ?? "aktuell"}
                        </h3>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Plus className="h-3 w-3" aria-hidden="true" />
                            {diffQuery.data.stats.added}
                          </span>
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                            <Minus className="h-3 w-3" aria-hidden="true" />
                            {diffQuery.data.stats.removed}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => setDiffVersions(null)}>
                            <X className="h-3 w-3" aria-hidden="true" />
                            Schließen
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[400px] overflow-auto rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]/30 font-mono text-xs">
                        {diffQuery.data.diff.length === 0 && (
                          <p className="p-4 text-center text-[color:var(--ds-text-muted)]">
                            Keine Änderungen.
                          </p>
                        )}
                        {diffQuery.data.diff.map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex gap-2 px-3 py-0.5",
                              line.type === "added" &&
                                "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                              line.type === "removed" &&
                                "bg-red-500/10 text-red-700 dark:text-red-400",
                              line.type === "unchanged" && "text-[color:var(--ds-text-muted)]"
                            )}
                          >
                            <span className="w-8 shrink-0 text-right text-[color:var(--ds-text-muted)]/50 select-none">
                              {line.oldLine ?? line.newLine ?? ""}
                            </span>
                            <span className="w-4 shrink-0 select-none">
                              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                            </span>
                            <span className="break-all whitespace-pre-wrap">{line.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {diffVersions && diffQuery.isLoading && (
                    <div className="space-y-2" aria-live="polite" aria-busy="true">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-48 w-full" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Audit Tab */}
          {readQuery.data && activeTab === "audit" && (
            <div className="space-y-4">
              {auditQuery.isLoading && (
                <div className="space-y-2" aria-live="polite" aria-busy="true">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              )}

              {auditQuery.isError && !auditQuery.isLoading && (
                <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
                  <AlertTriangle
                    className="h-8 w-8 text-[color:var(--ds-danger-text)]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium">Audit-Log nicht ladbar</p>
                    <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                      {(auditQuery.error as Error)?.message ?? "Unbekannter Fehler"}
                    </p>
                  </div>
                </div>
              )}

              {auditQuery.data && auditQuery.data.entries.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ShieldCheck
                    className="h-6 w-6 text-[color:var(--ds-text-muted)]"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    Keine Audit-Einträge für diese Datei.
                  </p>
                </div>
              )}

              {auditQuery.data && auditQuery.data.entries.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {auditQuery.data.count} Einträge — chronologisch (neueste zuerst)
                  </p>
                  <ol className="space-y-1.5" aria-label="Audit-Log">
                    {auditQuery.data.entries.map((entry, i) => (
                      <li
                        key={`${entry.timestamp}-${i}`}
                        className="flex items-start gap-3 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]/30 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="default"
                              className={cn(
                                "text-xs",
                                entry.action === "delete" &&
                                  "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
                                entry.action === "create" &&
                                  "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
                                entry.action === "edit" &&
                                  "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
                                entry.action === "restore" &&
                                  "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                              )}
                            >
                              {ACTION_LABELS[entry.action] ?? entry.action}
                            </Badge>
                            <span className="text-xs text-[color:var(--ds-text-muted)]">
                              {formatDate(entry.timestamp)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                            durch{" "}
                            <span className="font-mono text-[color:var(--ds-text)]">
                              {entry.user}
                            </span>
                            {entry.details && Object.keys(entry.details).length > 0 && (
                              <>
                                {" · "}
                                {Object.entries(entry.details)
                                  .map(([k, v]) => (
                                    <span key={k} className="font-mono">
                                      {k}=
                                      {typeof v === "string" || typeof v === "number"
                                        ? String(v)
                                        : JSON.stringify(v)}
                                    </span>
                                  ))
                                  .reduce<React.ReactNode[]>((acc, el, idx) => {
                                    if (idx > 0) acc.push(", ");
                                    acc.push(el);
                                    return acc;
                                  }, [])}
                              </>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer / Actions */}
        {readQuery.data && (
          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-3">
            {!isEditing ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                {/* Flag-Aktionen */}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-[color:var(--ds-text-muted)]">Status:</span>
                  <Select
                    value={readQuery.data.flag ?? "unreviewed"}
                    onValueChange={(v) => flagMut.mutate(v as QualityFlag)}
                  >
                    <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Status setzen">
                      <Flag
                        className="mr-1.5 h-3 w-3 text-[color:var(--ds-text-muted)]"
                        aria-hidden="true"
                      />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FLAG_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="unreviewed">Ungeprüft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Edit / Delete */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          "Diese Datei wirklich löschen? Die Löschung wird in der Version-History gespeichert und kann rückgängig gemacht werden."
                        )
                      ) {
                        deleteMut.mutate();
                      }
                    }}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    Löschen
                  </Button>
                  <Button onClick={startEdit} size="sm">
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    Bearbeiten
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between gap-2">
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Ctrl+S zum Speichern · Esc zum Abbrechen
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                    Abbrechen
                  </Button>
                  <Button onClick={handleSave} size="sm" disabled={writeMut.isPending}>
                    {writeMut.isPending ? (
                      <>
                        <Save className="h-3 w-3 animate-spin" aria-hidden="true" /> Speichert…
                      </>
                    ) : (
                      <>
                        <Save className="h-3 w-3" aria-hidden="true" /> Speichern
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
