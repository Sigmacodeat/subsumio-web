"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { sha256HexBytes } from "@/lib/gobd";
import { runUploadPool } from "@/lib/upload-queue";
import type { ActImportItem, ActImportMetrics } from "@/lib/act-import";
import { isSupportedUploadName } from "@/lib/upload-formats";

interface ImportSummary {
  session: { frontmatter?: Record<string, unknown> };
  metrics: ActImportMetrics;
  item_count: number;
}

const EMPTY: ActImportMetrics = {
  total: 0,
  bytes: 0,
  pending: 0,
  processing: 0,
  ready: 0,
  partial: 0,
  review: 0,
  duplicates: 0,
  failed: 0,
  classified: 0,
  withOnNumbers: 0,
  pages: 0,
  warnings: 0,
  readinessPercent: 0,
  classificationPercent: 0,
  onCoveragePercent: 0,
  canFinalize: false,
};

export function ActImportCockpit({ caseSlug }: { caseSlug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const retryInputRef = useRef<HTMLInputElement>(null);
  const storageKey = `subsumio:act-import:${caseSlug}`;
  const [sessionId, setSessionId] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [items, setItems] = useState<ActImportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setSessionId(localStorage.getItem(storageKey) ?? ""), [storageKey]);

  const load = useCallback(
    async (id = sessionId) => {
      if (!id) return;
      const [summaryRes, itemRes] = await Promise.all([
        csrfFetch(`/api/act-imports/${encodeURIComponent(id)}`),
        csrfFetch(`/api/act-imports/${encodeURIComponent(id)}/items?limit=100&offset=0`),
      ]);
      if (!summaryRes.ok || !itemRes.ok)
        throw new Error("Importstatus konnte nicht geladen werden");
      setSummary((await summaryRes.json()) as ImportSummary);
      setItems(((await itemRes.json()) as { items: ActImportItem[] }).items);
    },
    [sessionId]
  );

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const writeItem = useCallback(async (id: string, body: Record<string, unknown>) => {
    const response = await csrfFetch(`/api/act-imports/${encodeURIComponent(id)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
  }, []);

  const startImport = async (selected: FileList | null) => {
    if (!selected?.length) return;
    const files = Array.from(selected).filter((file) => isSupportedUploadName(file.name));
    if (!files.length) {
      setMessage("Keine unterstützten Aktenformate gefunden.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const expectedBytes = files.reduce((sum, file) => sum + file.size, 0);
      const create = await csrfFetch("/api/act-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: caseSlug,
          title: `Aktenimport ${new Date().toLocaleString("de-DE")}`,
          expected_files: files.length,
          expected_bytes: expectedBytes,
          jurisdiction: "at",
        }),
      });
      if (!create.ok) throw new Error(await create.text());
      const created = (await create.json()) as { id: string };
      setSessionId(created.id);
      localStorage.setItem(storageKey, created.id);
      await api.brain.updatePage({
        slug: caseSlug,
        frontmatter: { active_import_session_id: created.id },
      });

      const jobs = files.map((file) => ({
        file,
        size: file.size,
        id: crypto.randomUUID(),
        relativePath:
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      }));
      await runUploadPool(
        jobs,
        async (job) => {
          const base = {
            item_id: job.id,
            case_slug: caseSlug,
            relative_path: job.relativePath,
            filename: job.file.name,
            size: job.file.size,
            mime_type: job.file.type || undefined,
          };
          await writeItem(created.id, { ...base, status: "uploading", attempts: 1 });
          try {
            const bytes = await job.file.arrayBuffer();
            const sha256 = await sha256HexBytes(bytes);
            const result = await api.upload.file(job.file, {
              title: job.file.name.replace(/\.[^.]+$/, ""),
              source: "documents",
              case_slug: caseSlug,
              defer_pipeline: true,
            });
            await writeItem(created.id, {
              ...base,
              sha256,
              document_slug: result.slug,
              part_slugs: (result as unknown as { part_slugs?: string[] }).part_slugs ?? [],
              status: result.extraction_status === "processing" ? "processing" : "ready",
              extraction_status: result.extraction_status,
              extraction_method: result.extraction_method,
              warning_count: result.extraction_warnings ? 1 : 0,
              attempts: 1,
            });
          } catch (error) {
            await writeItem(created.id, {
              ...base,
              status: "failed",
              error_code: "upload_failed",
              error: error instanceof Error ? error.message : String(error),
              attempts: 1,
            });
          }
        },
        { smallParallel: 4, largeParallel: 1 }
      );
      await csrfFetch(`/api/act-imports/${encodeURIComponent(created.id)}/refresh`, {
        method: "POST",
      });
      await load(created.id);
      setMessage("Upload abgeschlossen. Readiness und Problemdateien können jetzt geprüft werden.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aktenimport fehlgeschlagen");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const refresh = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await csrfFetch(`/api/act-imports/${encodeURIComponent(sessionId)}/refresh`, {
        method: "POST",
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const retryFailed = async (selected: FileList | null) => {
    if (!selected?.length || !sessionId) return;
    const files = Array.from(selected).filter((file) => isSupportedUploadName(file.name));
    if (!files.length) {
      setMessage("Keine unterstützten Aktenformate für Retry gefunden.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const failedFilenames = new Set(
        items.filter((i) => i.status === "failed").map((i) => i.filename)
      );
      const retryFiles = files.filter((f) => failedFilenames.has(f.name));
      if (!retryFiles.length) {
        setMessage("Keine der ausgewählten Dateien entsprechen fehlgeschlagenen Uploads.");
        return;
      }
      const jobs = retryFiles.map((file) => ({
        file,
        size: file.size,
        id: crypto.randomUUID(),
        relativePath:
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      }));
      await runUploadPool(
        jobs,
        async (job) => {
          const existingItem = items.find(
            (i) => i.filename === job.file.name && i.status === "failed"
          );
          const base = {
            item_id: existingItem?.id ?? job.id,
            case_slug: caseSlug,
            relative_path: job.relativePath,
            filename: job.file.name,
            size: job.file.size,
            mime_type: job.file.type || undefined,
          };
          await writeItem(sessionId, {
            ...base,
            status: "uploading",
            attempts: (existingItem?.attempts ?? 0) + 1,
          });
          try {
            const bytes = await job.file.arrayBuffer();
            const sha256 = await sha256HexBytes(bytes);
            const result = await api.upload.file(job.file, {
              title: job.file.name.replace(/\.[^.]+$/, ""),
              source: "documents",
              case_slug: caseSlug,
              defer_pipeline: true,
            });
            await writeItem(sessionId, {
              ...base,
              sha256,
              document_slug: result.slug,
              part_slugs: (result as unknown as { part_slugs?: string[] }).part_slugs ?? [],
              status: result.extraction_status === "processing" ? "processing" : "ready",
              extraction_status: result.extraction_status,
              extraction_method: result.extraction_method,
              warning_count: result.extraction_warnings ? 1 : 0,
              attempts: (existingItem?.attempts ?? 0) + 1,
              error: undefined,
              error_code: undefined,
            });
          } catch (error) {
            await writeItem(sessionId, {
              ...base,
              status: "failed",
              error_code: "upload_failed",
              error: error instanceof Error ? error.message : String(error),
              attempts: (existingItem?.attempts ?? 0) + 1,
            });
          }
        },
        { smallParallel: 4, largeParallel: 1 }
      );
      await csrfFetch(`/api/act-imports/${encodeURIComponent(sessionId)}/refresh`, {
        method: "POST",
      });
      await load();
      setMessage("Retry abgeschlossen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Retry fehlgeschlagen");
    } finally {
      setBusy(false);
      if (retryInputRef.current) retryInputRef.current.value = "";
    }
  };

  const finalize = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const response = await csrfFetch(
        `/api/act-imports/${encodeURIComponent(sessionId)}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allow_partial: false }),
        }
      );
      if (!response.ok)
        throw new Error(
          ((await response.json().catch(() => ({}))) as { message?: string }).message ??
            "Freigabe fehlgeschlagen"
        );
      setMessage("Snapshot erstellt. Die gemeinsame Aktenanalyse läuft.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Freigabe fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const metrics = summary?.metrics ?? EMPTY;
  const status = String(summary?.session?.frontmatter?.status ?? "not_started");
  const problemCount = metrics.failed + metrics.partial + metrics.review;
  const topItems = useMemo(
    () =>
      items
        .filter((i) => ["failed", "partial", "review", "processing"].includes(i.status))
        .slice(0, 12),
    [items]
  );

  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSearch size={18} className="brand-text" />
            <h3 className="font-semibold">Forensischer Aktenimport</h3>
            <Badge variant="info">{status}</Badge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Originale → OCR → Brain → Qualitätsgate → ein gemeinsamer Snapshot
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void startImport(e.target.files)}
            {...({ webkitdirectory: "" } as Record<string, string>)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen size={14} /> Ordner importieren
          </Button>
          {sessionId && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
              <RefreshCw size={14} /> Prüfen
            </Button>
          )}
          {sessionId && metrics.failed > 0 && (
            <>
              <input
                ref={retryInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void retryFailed(e.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => retryInputRef.current?.click()}
              >
                <RotateCw size={14} /> Retry ({metrics.failed})
              </Button>
            </>
          )}
          {sessionId && (
            <Button
              size="sm"
              disabled={busy || !metrics.canFinalize}
              onClick={() => void finalize()}
            >
              <Play size={14} /> Snapshot analysieren
            </Button>
          )}
        </div>
      </div>
      {sessionId && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {[
              ["Dokumente", metrics.total],
              ["Bereit", metrics.ready],
              ["Verarbeitung", metrics.processing + metrics.pending],
              ["Probleme", problemCount],
              ["Klassifiziert", `${metrics.classificationPercent}%`],
              ["ON-Abdeckung", `${metrics.onCoveragePercent}%`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-[color:var(--ds-surface-2)] p-2">
                <div className="text-lg font-semibold">{value}</div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
              </div>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded bg-[color:var(--ds-border)]">
            <div
              className="h-full bg-[color:var(--ds-success-solid)]"
              style={{ width: `${metrics.readinessPercent}%` }}
            />
          </div>
          {topItems.length > 0 && (
            <div className="space-y-1">
              {topItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <AlertTriangle
                    size={12}
                    className={
                      item.status === "failed"
                        ? "text-[color:var(--ds-danger-text)]"
                        : "text-[color:var(--ds-warning-text)]"
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{item.relativePath}</span>
                  <Badge variant="info">{item.status}</Badge>
                </div>
              ))}
            </div>
          )}
          {metrics.canFinalize && (
            <p className="flex items-center gap-2 text-xs text-[color:var(--ds-success-text)]">
              <CheckCircle2 size={13} /> Alle Dokumente sind für den Snapshot bereit.
            </p>
          )}
        </>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-xs">
          <Loader2 size={13} className="animate-spin" /> Verarbeitung läuft – diese Session bleibt
          im Brain gespeichert.
        </p>
      )}
      {message && <p className="text-xs text-[color:var(--ds-text-muted)]">{message}</p>}
    </section>
  );
}
