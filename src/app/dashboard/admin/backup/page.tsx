"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Database,
  Download,
  Upload,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Clock,
  FileBox,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { tracking } from "@/lib/tracking";

type BackupItem = {
  id: string;
  filename: string;
  createdAt: string;
  createdBy: string;
  totalPages: number;
  totalSize: number;
  pageTypes: Record<string, number>;
  status: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BackupRestorePage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<BackupItem | null>(null);
  const [restorePageTypes, setRestorePageTypes] = useState<string[]>([]);
  const [restoreResult, setRestoreResult] = useState<{
    restored: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: () => api.backup.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.backup.create(),
    onSuccess: (result) => {
      const totalPages = (result.backup as { total_pages?: number })?.total_pages ?? 0;
      tracking.backup.created(totalPages);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      addToast({
        title: t("admin.backup.created"),
        description: t("admin.backup.created_desc"),
        type: "success",
      });
    },
    onError: (err: Error) => {
      addToast({ title: t("admin.backup.failed"), description: err.message, type: "error" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ id, pageTypes }: { id: string; pageTypes?: string[] }) =>
      api.backup.restore(id, pageTypes),
    onSuccess: (result) => {
      tracking.backup.restored(result.restored, result.failed);
      setRestoreResult({
        restored: result.restored,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
      });
      addToast({
        title: t("admin.backup.restore_done"),
        description: `${result.restored} Pages wiederhergestellt, ${result.skipped} übersprungen, ${result.failed} fehlgeschlagen`,
        type: result.failed > 0 ? "warning" : "success",
      });
    },
    onError: (err: Error) => {
      addToast({
        title: t("admin.backup.restore_failed"),
        description: err.message,
        type: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.backup.delete(id),
    onSuccess: (_data, id) => {
      tracking.backup.deleted(id);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      addToast({ title: t("admin.backup.deleted"), type: "success" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      addToast({ title: t("admin.backup.delete_failed"), description: err.message, type: "error" });
    },
  });

  const backups = data?.backups ?? [];
  const stats = data?.stats;

  const allPageTypes = backups.reduce<Set<string>>((acc, b) => {
    Object.keys(b.pageTypes).forEach((t) => acc.add(t));
    return acc;
  }, new Set());

  function togglePageType(type: string) {
    setRestorePageTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function handleDownload(id: string) {
    tracking.backup.downloaded(id);
    const url = api.backup.download(id);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin.backup.title")}
        description={t("admin.backup.desc")}
        actions={[
          <Button
            key="create"
            variant="primary"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <Database className="mr-2 h-4 w-4" />
            {createMutation.isPending ? t("admin.backup.creating") : t("admin.backup.new")}
          </Button>,
        ]}
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Backups</CardTitle>
            <FileBox className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBackups ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtgröße</CardTitle>
            <HardDrive className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? formatBytes(stats.totalSize) : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Letztes Backup</CardTitle>
            <Clock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {stats?.lastBackupAt ? formatDate(stats.lastBackupAt) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ältestes Backup</CardTitle>
            <Clock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {stats?.oldestBackupAt ? formatDate(stats.oldestBackupAt) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backup List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup-Historie</CardTitle>
          <CardDescription>Alle gespeicherten Voll-Backups auf dem Server</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-muted-foreground p-8 text-center">Laden...</div>
          ) : backups.length > 0 ? (
            <div className="divide-y divide-[color:var(--ds-border)]">
              {backups.map((backup) => (
                <div key={backup.id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {formatDate(backup.createdAt)}
                      </span>
                      <Badge variant="default" className="text-xs">
                        {backup.totalPages} Pages
                      </Badge>
                      <Badge variant="default" className="text-xs">
                        {formatBytes(backup.totalSize)}
                      </Badge>
                      {backup.status === "failed" && (
                        <Badge variant="danger" className="text-xs">
                          Fehlgeschlagen
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      Erstellt von {backup.createdBy}
                      {Object.keys(backup.pageTypes).length > 0 && (
                        <>
                          {" "}
                          —{" "}
                          {Object.entries(backup.pageTypes)
                            .map(([t, c]) => `${t}: ${c}`)
                            .join(", ")}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPreviewTarget(backup);
                      }}
                      aria-label="Vorschau"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDownload(backup.id)}
                      aria-label="Herunterladen"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRestoreTarget(backup);
                        setRestorePageTypes([]);
                        setRestoreResult(null);
                      }}
                      aria-label="Einspielen"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(backup)}
                      aria-label={t("admin.backup.aria_delete")}
                    >
                      <Trash2 className="h-4 w-4 text-[color:var(--ds-danger-text)]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Database className="mb-3 h-10 w-10 text-[color:var(--ds-border-strong)]" />
              <p className="font-medium text-[color:var(--ds-text)]">Keine Backups vorhanden</p>
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                Erstellen Sie Ihr erstes Voll-Backup mit dem Button oben.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Backup einspielen</DialogTitle>
            <DialogDescription>
              {restoreTarget && (
                <>
                  Backup vom {formatDate(restoreTarget.createdAt)} — {restoreTarget.totalPages}{" "}
                  Pages
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {restoreResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-[color:var(--ds-success-text)]" />
                <span className="font-medium">Restore abgeschlossen</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-[color:var(--ds-border)] p-3 text-center">
                  <div className="text-xl font-bold text-[color:var(--ds-success-text)]">
                    {restoreResult.restored}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">Wiederhergestellt</div>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] p-3 text-center">
                  <div className="text-xl font-bold text-[color:var(--ds-text-muted)]">
                    {restoreResult.skipped}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">Übersprungen</div>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] p-3 text-center">
                  <div className="text-xl font-bold text-[color:var(--ds-danger-text)]">
                    {restoreResult.failed}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">Fehlgeschlagen</div>
                </div>
              </div>
              {restoreResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-xs text-[color:var(--ds-danger-text)]">
                  {restoreResult.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestoreTarget(null)}>
                  Schließen
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ds-warning-text)]" />
                  <div className="text-sm text-[color:var(--ds-text-muted)]">
                    Vorhandene Pages mit gleichem Slug werden überschrieben. Dies kann nicht
                    rückgängig gemacht werden.
                  </div>
                </div>

                {allPageTypes.size > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-[color:var(--ds-text)]">
                      Page-Typen filtern (optional)
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      Wählen Sie spezifische Typen aus, um nur diese einzuspielen. Leer = alle.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(allPageTypes)
                        .sort()
                        .map((type) => (
                          <button
                            key={type}
                            onClick={() => togglePageType(type)}
                            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                              restorePageTypes.includes(type)
                                ? "border-[color:var(--ds-brand)] bg-[color:var(--ds-brand)] text-white"
                                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)]"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestoreTarget(null)}>
                  Abbrechen
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (restoreTarget) {
                      restoreMutation.mutate({
                        id: restoreTarget.id,
                        pageTypes: restorePageTypes.length > 0 ? restorePageTypes : undefined,
                      });
                    }
                  }}
                  disabled={restoreMutation.isPending}
                >
                  {restoreMutation.isPending
                    ? t("admin.backup.restoring")
                    : t("admin.backup.restore_confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Backup löschen</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  Möchten Sie das Backup vom {formatDate(deleteTarget.createdAt)} wirklich löschen?
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("admin.backup.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("admin.backup.deleting") : t("admin.backup.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <PreviewDialog backup={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
}

function PreviewDialog({ backup, onClose }: { backup: BackupItem | null; onClose: () => void }) {
  const { data: previewData, isLoading } = useQuery({
    queryKey: ["backup-preview", backup?.id],
    queryFn: () => api.backup.preview(backup!.id),
    enabled: !!backup,
  });

  return (
    <Dialog open={!!backup} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Backup-Vorschau</DialogTitle>
          <DialogDescription>
            {backup && (
              <>
                {backup.totalPages} Pages — {formatBytes(backup.totalSize)} —{" "}
                {formatDate(backup.createdAt)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="text-muted-foreground py-8 text-center">Laden...</div>
        ) : previewData ? (
          <div className="space-y-3">
            <div className="text-sm text-[color:var(--ds-text-muted)]">
              Zeige {previewData.preview.length} von {previewData.totalPages} Pages:
            </div>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-[color:var(--ds-border)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[color:var(--ds-surface)]">
                  <tr className="border-b border-[color:var(--ds-border)]">
                    <th className="px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]">
                      Slug
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]">
                      Titel
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]">
                      Typ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--ds-border)]">
                  {previewData.preview.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">
                        {p.slug}
                      </td>
                      <td className="px-3 py-2 text-[color:var(--ds-text)]">{p.title}</td>
                      <td className="px-3 py-2">
                        <Badge variant="default" className="text-xs">
                          {p.type}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
