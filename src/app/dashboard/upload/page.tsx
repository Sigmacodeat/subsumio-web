"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/use-lang";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  File,
  CheckCircle,
  XCircle,
  Loader,
  X,
  CloudUpload,
  Info,
  Archive,
  FolderOpen,
  Briefcase,
  AlertCircle,
  BookOpen,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { DIRECT_UPLOAD_MAX_SIZE } from "@/lib/upload-validation";
import { UPLOAD_ACCEPT, UPLOAD_FOLDER_ACCEPT_RE } from "@/lib/upload-formats";
import { runUploadPool } from "@/lib/upload-queue";
import { inferUploadRouting, type KnownCase } from "@/lib/upload-routing";
import { isOnline, enqueueFileUpload } from "@/lib/offline-store";
import { sha256HexBytes, gobdFrontmatter } from "@/lib/gobd";
import { PageHeader } from "@/components/dashboard/page-header";
import { UploadLifecycle, uploadStageIndex } from "@/components/dashboard/upload-lifecycle";
import type { BrainPage } from "@/lib/types";

interface FileOverrides {
  source?: string;
  case_slug?: string;
  tags?: string[];
}

interface UploadFile {
  id: string;
  file: File;
  status: "pending" | "preparing" | "uploading" | "processing" | "done" | "error" | "skipped";
  progress: number;
  uploadedBytes?: number;
  startedAt?: number;
  speedBps?: number;
  etaSeconds?: number;
  error?: string;
  slug?: string;
  gobdStamped?: boolean;
  /** Engine reported the original file bytes were NOT persisted (GoBD risk). */
  persistWarning?: string;
  /** Parser/OCR completed only partially or failed; original remains stored. */
  extractionWarning?: string;
  /** Per-file bulk-rule overrides; fall back to the batch-wide defaults. */
  overrides?: FileOverrides;
  /** Auto-routing suggestion derived from the filename (informational). */
  routingHint?: string;
  /** D2: Recognition results from pipeline — shown as badges after upload */
  recognizedJurisdiction?: string;
  recognizedDocType?: string;
  gzValidated?: boolean;
  gzLeitzahl?: string;
  /** Server-side sub-phase during processing (downloading/verifying/scanning/extracting) */
  serverPhase?: "downloading" | "verifying" | "scanning" | "extracting";
  /** Whether ANY server sub-phase was ever observed (false ⇒ sync-fallback path, no per-stage telemetry). */
  hadSubPhase?: boolean;
  /** Whether the "verifying" sub-phase was ever observed for this file. */
  sawVerifying?: boolean;
}

const FOLDER_MAX_BYTES = DIRECT_UPLOAD_MAX_SIZE;

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const colors: Record<string, string> = {
    md: "text-[color:var(--ds-info-text)]",
    txt: "text-[color:var(--ds-text-muted)]",
    pdf: "text-[color:var(--ds-danger-text)]",
    json: "text-[color:var(--ds-warning-text)]",
  };
  return <File size={20} className={colors[ext || ""] || "text-[color:var(--ds-text-muted)]"} />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatEta(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 1) return "< 1s";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}

type UploadMode = "case" | "knowledge";

function getKnowledgeSources(t: (key: import("@/content/dashboard").DashboardKey) => string) {
  return [
    {
      value: "kanzleiwissen",
      label: t("upload.source_kanzleiwissen"),
      desc: t("upload.source_kanzleiwissen_desc"),
    },
    { value: "wiki", label: t("upload.source_wiki"), desc: t("upload.source_wiki_desc") },
    {
      value: "meetings",
      label: t("upload.source_meetings"),
      desc: t("upload.source_meetings_desc"),
    },
    { value: "people", label: t("upload.source_people"), desc: t("upload.source_people_desc") },
    {
      value: "companies",
      label: t("upload.source_companies"),
      desc: t("upload.source_companies_desc"),
    },
    { value: "ideas", label: t("upload.source_ideas"), desc: t("upload.source_ideas_desc") },
  ];
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-6" />}>
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const router = useRouter();
  const { t } = useLang();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<UploadMode>(
    (searchParams.get("mode") as UploadMode) === "knowledge" ? "knowledge" : "case"
  );
  const [source, setSource] = useState("kanzleiwissen");
  const [tags, setTags] = useState("");
  const [documentPassword, setDocumentPassword] = useState("");
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState(searchParams.get("case") || "");
  const [casesLoading, setCasesLoading] = useState(true);
  // GoBD-Baustein: steuerlich relevante Belege beim Ingest mit Aufbewahrungs-
  // frist + Inhalts-Hash stempeln (§ 147 AO / § 146 Abs. 4 AO). Bewusst opt-in:
  // nicht jeder Upload ist ein Buchungsbeleg.
  const [gobdReceipt, setGobdReceipt] = useState(false);
  // HITL: Pause pipeline after Layer 2 for attorney review of extracted entities.
  // When enabled, the pipeline sets status 'awaiting_review' and waits for a
  // resume job with manual_overrides before continuing to Layer 3+.
  const [pauseForReview, setPauseForReview] = useState(false);
  // Optional overrides — let the user explicitly set jurisdiction or doc_type
  // instead of relying on heuristic detection.
  const [jurisdictionOverride, setJurisdictionOverride] = useState("");
  const [docTypeOverride, setDocTypeOverride] = useState("");

  // File System Access API (Chromium) — feature-detected client-side so we can
  // show an IDE-style "ganzen Ordner einlesen"-Button only where it actually works.
  const [folderApi, setFolderApi] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    setFolderApi(typeof window !== "undefined" && "showDirectoryPicker" in window);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pages = await api.brain.listPages({ type: "legal_case", limit: 200 });
        if (cancelled) return;
        setCases(pages);
      } catch {
        if (!cancelled) setCases([]);
      } finally {
        if (!cancelled) setCasesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return;
      if (!isOnline()) {
        // C2: Enqueue files in IndexedDB instead of showing error
        const tagList = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const effectiveSource = mode === "case" ? "documents" : source;
        const caseSlug = mode === "case" ? selectedCaseSlug : undefined;

        for (const f of accepted) {
          const bytes = await f.arrayBuffer();
          await enqueueFileUpload({
            fileName: f.name,
            fileSize: f.size,
            fileType: f.type,
            bytes,
            metadata: {
              title: f.name.replace(/\.[^.]+$/, ""),
              source: effectiveSource,
              tags: tagList.length > 0 ? tagList : undefined,
              case_slug: caseSlug,
            },
          });
        }
        // C2 UX: Don't add to file list with error status — files are
        // successfully queued in IndexedDB and will auto-sync when online.
        // Show a brief success indicator instead.
        const queuedFiles: UploadFile[] = accepted.map((f) => ({
          id: crypto.randomUUID(),
          file: f,
          status: "done" as const,
          progress: 100,
          slug: "offline-queued",
        }));
        setFiles((prev) => [...prev, ...queuedFiles]);
        return;
      }
      const knownCases: KnownCase[] = cases.map((c) => ({
        slug: c.slug,
        title: c.title ?? "",
        aktenzeichen:
          typeof (c.frontmatter as Record<string, unknown> | undefined)?.aktenzeichen === "string"
            ? ((c.frontmatter as Record<string, unknown>).aktenzeichen as string)
            : undefined,
      }));
      const newFiles: UploadFile[] = accepted.map((f) => {
        const routing = inferUploadRouting(f.name, knownCases);
        const overrides: FileOverrides = {};
        if (routing.matchedCaseSlug) overrides.case_slug = routing.matchedCaseSlug;
        return {
          id: crypto.randomUUID(),
          file: f,
          status: "pending" as const,
          progress: 0,
          routingHint: routing.hint,
          overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        };
      });
      setFiles((prev) => [...prev, ...newFiles]);
    },
    [cases, mode, selectedCaseSlug, source, tags]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addFiles,
    onDropRejected: (rejections) => {
      const rejectedFiles = rejections.map(({ file, errors }) => {
        const tooLarge = errors.some((err) => err.code === "file-too-large");
        const unsupported = errors.some((err) => err.code === "file-invalid-type");
        const reason = tooLarge
          ? `${t("upload.err_too_large")} (${formatBytes(file.size)}). ${t("upload.err_max_channel")} ${formatBytes(DIRECT_UPLOAD_MAX_SIZE)}.`
          : unsupported
            ? t("upload.err_unsupported_type")
            : errors[0]?.message || t("upload.err_rejected");
        return {
          id: crypto.randomUUID(),
          file,
          status: "error" as const,
          progress: 0,
          uploadedBytes: 0,
          error: reason,
        };
      });
      setFiles((prev) => [...prev, ...rejectedFiles]);
    },
    accept: UPLOAD_ACCEPT,
    maxSize: DIRECT_UPLOAD_MAX_SIZE,
  });

  // Walk a chosen local folder (recursively, like an IDE "open folder") and pull
  // every supported file into the same upload queue. No server round-trip until
  // the user clicks "Upload" — the files stay client-side until then.
  const pickFolder = useCallback(async () => {
    interface FsHandle {
      kind: "file" | "directory";
      getFile?: () => Promise<File>;
      values?: () => AsyncIterable<FsHandle>;
    }
    const picker = (
      window as unknown as {
        showDirectoryPicker?: () => Promise<FsHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) return;
    try {
      setScanning(true);
      const dir = await picker();
      const out: File[] = [];
      const walk = async (handle: FsHandle, depth: number) => {
        if (depth > 5 || !handle.values) return;
        for await (const entry of handle.values()) {
          if (entry.kind === "file" && entry.getFile) {
            const f = await entry.getFile();
            if (UPLOAD_FOLDER_ACCEPT_RE.test(f.name) && f.size <= FOLDER_MAX_BYTES) out.push(f);
          } else if (entry.kind === "directory") {
            await walk(entry, depth + 1);
          }
        }
      };
      await walk(dir, 0);
      addFiles(out);
    } catch {
      // user dismissed the picker, or the browser blocked it — no-op
    } finally {
      setScanning(false);
    }
  }, [addFiles]);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const canUpload = mode === "knowledge" || (mode === "case" && !!selectedCaseSlug);

  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) return;
    if (!canUpload) return;

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const effectiveSource = mode === "case" ? "documents" : source;
    const caseSlug = mode === "case" ? selectedCaseSlug : undefined;

    // Staggered upload: large files run max 2 at once, small files fill the
    // remaining slots. Self-hosted/direct-upload deployments can raise the
    // browser limit without piling transfers up in memory.
    const items = pending.map((f) => ({ ...f, size: f.file.size }));
    await runUploadPool(items, async (uploadFile) => {
      // Per-file overrides win over the batch-wide defaults (bulk rules).
      const ov = uploadFile.overrides;
      const fileSource = ov?.source ?? effectiveSource;
      const fileCaseSlug = ov?.case_slug ?? caseSlug;
      const fileTags = ov?.tags ?? tagList;

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? {
                ...f,
                status: "preparing",
                progress: 0,
                uploadedBytes: 0,
                startedAt: Date.now(),
                speedBps: undefined,
                etaSeconds: undefined,
                serverPhase: undefined,
                hadSubPhase: undefined,
                sawVerifying: undefined,
              }
            : f
        )
      );

      try {
        const title = uploadFile.file.name.replace(/\.[^.]+$/, "");
        const result = await api.upload.file(
          uploadFile.file,
          {
            title,
            source: fileSource,
            tags: fileTags.length > 0 ? fileTags : undefined,
            case_slug: fileCaseSlug,
            password: documentPassword || undefined,
            pause_for_review: pauseForReview || undefined,
            jurisdiction: jurisdictionOverride || undefined,
            doc_type: docTypeOverride || undefined,
          },
          (progress, transfer) => {
            const phase = transfer?.phase;
            const uploadedBytes =
              transfer?.loaded ??
              Math.min(uploadFile.file.size, Math.round((uploadFile.file.size * progress) / 100));
            const nextProgress =
              phase === "server_processing"
                ? 96
                : uploadedBytes > 0
                  ? Math.max(1, Math.min(95, Math.round(progress)))
                  : 0;
            const now = Date.now();
            setFiles((prev) =>
              prev.map((f) =>
                f.id === uploadFile.id
                  ? (() => {
                      const loaded = Math.min(uploadFile.file.size, uploadedBytes);
                      const startedAt = f.startedAt ?? now;
                      const elapsedSeconds = Math.max(0.25, (now - startedAt) / 1000);
                      const speedBps =
                        phase === "uploading" && loaded > 0 ? loaded / elapsedSeconds : f.speedBps;
                      const etaSeconds =
                        speedBps && phase === "uploading"
                          ? Math.max(0, (uploadFile.file.size - loaded) / speedBps)
                          : undefined;
                      return {
                        ...f,
                        status:
                          phase === "server_processing" ||
                          phase === "downloading" ||
                          phase === "verifying" ||
                          phase === "scanning" ||
                          phase === "extracting"
                            ? "processing"
                            : phase === "uploading"
                              ? "uploading"
                              : "preparing",
                        progress: nextProgress,
                        uploadedBytes: loaded,
                        speedBps,
                        etaSeconds,
                        serverPhase:
                          phase === "downloading" ||
                          phase === "verifying" ||
                          phase === "scanning" ||
                          phase === "extracting"
                            ? phase
                            : f.serverPhase,
                        hadSubPhase:
                          f.hadSubPhase ||
                          phase === "downloading" ||
                          phase === "verifying" ||
                          phase === "scanning" ||
                          phase === "extracting",
                        sawVerifying: f.sawVerifying || phase === "verifying",
                      };
                    })()
                  : f
              )
            );
          }
        );

        // GoBD-Stempel: Hash über die hochgeladenen Datei-Bytes + 10-Jahre-
        // Aufbewahrungsfrist ins Frontmatter mergen. Eine spätere Verifikation
        // (Originaldatei erneut hashen) deckt jede Byte-Änderung auf.
        let gobdStamped = false;
        if (gobdReceipt && result.slug) {
          try {
            const bytes = await uploadFile.file.arrayBuffer();
            const hash = await sha256HexBytes(bytes);
            await api.brain.updatePage({
              slug: result.slug,
              frontmatter: { belegart: "steuerbeleg", ...gobdFrontmatter(hash) },
            });
            gobdStamped = true;
          } catch (stampErr) {
            // Upload ist erfolgt; nur der Stempel fehlt — sichtbar machen, nicht
            // den ganzen Upload als Fehler werten.
            console.error(
              "[upload] GoBD-Stempel fehlgeschlagen:",
              stampErr instanceof Error ? stampErr.message : String(stampErr)
            );
          }
        }

        // Surface engine-side persistence failures (GoBD § 147 AO).
        // The upload succeeded (markdown extracted), but the original bytes
        // may not have been stored — the user needs to know.
        const persistWarning =
          (result as { original_persisted?: boolean; persist_error?: string })
            .original_persisted === false
            ? ((result as { persist_error?: string }).persist_error ??
              "Originaldatei nicht gespeichert")
            : undefined;
        const extractionStatus = result.extraction_status;
        const extractionWarning =
          extractionStatus === "failed"
            ? result.extraction_warnings ||
              "Kein durchsuchbarer Text extrahiert; Originaldatei wurde gespeichert."
            : extractionStatus === "partial"
              ? result.extraction_warnings || "Dokument wurde nur teilweise extrahiert."
              : result.extraction_warnings;
        const pipelineWarning =
          result.post_upload_queued === false
            ? "Dokument gespeichert, automatische Analyse konnte aber nicht eingeplant werden."
            : undefined;

        const stillProcessing = extractionStatus === "processing";

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? {
                  ...f,
                  status:
                    extractionStatus === "failed"
                      ? "error"
                      : stillProcessing
                        ? "processing"
                        : "done",
                  progress: stillProcessing ? 97 : 100,
                  uploadedBytes: f.file.size,
                  slug: result.slug,
                  gobdStamped,
                  persistWarning,
                  serverPhase: undefined,
                  extractionWarning:
                    [extractionWarning, pipelineWarning].filter(Boolean).join(" ") || undefined,
                  error: extractionStatus === "failed" ? extractionWarning : undefined,
                  // D2: Recognition metadata from engine response
                  recognizedJurisdiction: (result as { jurisdiction?: string }).jurisdiction,
                  recognizedDocType: (result as { doc_type?: string }).doc_type,
                  gzValidated: (result as { aktenzeichen_validated?: boolean })
                    .aktenzeichen_validated,
                  gzLeitzahl: (result as { aktenzeichen?: string }).aktenzeichen,
                }
              : f
          )
        );
        if (stillProcessing && result.slug) {
          void api.upload
            .waitUntilQueryable(result.slug)
            .then(() => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === uploadFile.id
                    ? { ...f, status: "done", progress: 100, serverPhase: undefined }
                    : f
                )
              );
            })
            .catch((readinessError) => {
              const message =
                readinessError instanceof Error
                  ? readinessError.message
                  : "Dokumentverarbeitung fehlgeschlagen.";
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === uploadFile.id
                    ? { ...f, status: "error", error: message, serverPhase: undefined }
                    : f
                )
              );
            });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("upload.err_failed");
        // Duplicate (409) is a benign conflict, not a hard failure — mark the row
        // as skipped so the batch can finish cleanly.
        const isDuplicate = /duplicate|bereits vorhanden|409/i.test(msg);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? {
                  ...f,
                  status: isDuplicate ? "skipped" : "error",
                  error: msg,
                  serverPhase: undefined,
                }
              : f
          )
        );
      }
    });
    // Only clear the password when no pending files remain — otherwise the
    // user may need it for the next batch round.
    setFiles((prev) => {
      if (!prev.some((f) => f.status === "pending")) {
        setDocumentPassword("");
      }
      return prev;
    });
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const activeCount = files.filter(
    (f) => f.status === "preparing" || f.status === "uploading" || f.status === "processing"
  ).length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const transferredBytes = files.reduce((sum, f) => {
    if (f.status === "done" || f.status === "skipped" || f.status === "processing")
      return sum + f.file.size;
    return sum + (f.uploadedBytes ?? 0);
  }, 0);
  const overallProgress =
    totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0;

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("upload.title")}
        description={t("upload.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("upload.breadcrumb") },
        ]}
      />

      {/* ── Mode Selector: Two-tier architecture (Akte vs. Kanzlei-Wissen) ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={() => setMode("case")}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            mode === "case"
              ? "brand-border brand-soft ring-1 ring-[color:var(--brand-primary)]/20"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
          )}
        >
          <Briefcase
            size={18}
            className={mode === "case" ? "brand-text" : "text-[color:var(--ds-text-muted)]"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("upload.mode_case")}
              </span>
              <Lock size={11} className="text-[color:var(--ds-text-subtle)]" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {t("upload.mode_case_desc")}
            </p>
          </div>
        </button>
        <button
          onClick={() => setMode("knowledge")}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            mode === "knowledge"
              ? "brand-border brand-soft ring-1 ring-[color:var(--brand-primary)]/20"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
          )}
        >
          <BookOpen
            size={18}
            className={mode === "knowledge" ? "brand-text" : "text-[color:var(--ds-text-muted)]"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("upload.mode_knowledge")}
              </span>
              <BookOpen size={11} className="text-[color:var(--ds-text-subtle)]" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {t("upload.mode_knowledge_desc")}
            </p>
          </div>
        </button>
      </div>

      {/* ── Mode: Case — Akten-Auswahl (Pflichtfeld) ── */}
      {mode === "case" && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <Label
            htmlFor="upload-case"
            className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
          >
            <Briefcase size={13} />
            {t("upload.case_required")}
          </Label>
          <Select
            value={selectedCaseSlug}
            onValueChange={setSelectedCaseSlug}
            disabled={casesLoading}
          >
            <SelectTrigger id="upload-case" className="w-full">
              <SelectValue
                placeholder={casesLoading ? t("upload.case_loading") : t("upload.case_select")}
              />
            </SelectTrigger>
            <SelectContent>
              {cases.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedCaseSlug && !casesLoading && cases.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--ds-warning-text)]">
              <AlertCircle size={12} />
              Bitte wähle eine Akte aus. Dokumente ohne Aktenbezug werden nicht akzeptiert.
            </p>
          )}
          {!casesLoading && cases.length === 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--ds-warning-text)]">
              <AlertCircle size={12} />
              Keine Akten vorhanden. Bitte erstelle zuerst eine Akte.
            </p>
          )}
        </div>
      )}

      {/* ── Mode: Knowledge — Source-Auswahl ── */}
      {mode === "knowledge" && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <Label
            htmlFor="upload-source"
            className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
          >
            <BookOpen size={13} />
            {t("upload.knowledge_area_label")}
          </Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id="upload-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getKnowledgeSources(t).map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label} — {s.desc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-xs text-[color:var(--ds-text-muted)]">
            <Info size={13} className="mt-0.5 shrink-0 text-[color:var(--brand-primary)]" />
            <span>
              {t("upload.knowledge_area_hint")}{" "}
              <strong className="text-[color:var(--ds-text)]">
                {t("upload.consolidate_cycle")}
              </strong>{" "}
              {t("upload.knowledge_area_hint_2")}
            </span>
          </div>
        </div>
      )}

      {/* Tags — immer verfügbar */}
      <div>
        <Label
          htmlFor="upload-tags"
          className="mb-2 block text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
        >
          Tags (kommasepariert)
        </Label>
        <Input
          id="upload-tags"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={t("upload.tags_placeholder")}
        />
      </div>

      {/* Optionales Kennwort wird nur für die laufende Extraktion übertragen. */}
      <div>
        <Label
          htmlFor="upload-document-password"
          className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
        >
          <Lock size={13} /> Dokumentkennwort (optional)
        </Label>
        <Input
          id="upload-document-password"
          type="password"
          autoComplete="off"
          maxLength={255}
          value={documentPassword}
          onChange={(event) => setDocumentPassword(event.target.value)}
          placeholder="Nur für passwortgeschützte PDF-/Office-Dateien"
          disabled={!isOnline()}
        />
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          Das Kennwort wird nur im Arbeitsspeicher zum Entschlüsseln verwendet und nicht
          gespeichert.
        </p>
      </div>

      {/* GoBD-Belegstempel (opt-in) */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-colors hover:border-[color:var(--ds-border-strong)]">
        <input
          type="checkbox"
          checked={gobdReceipt}
          onChange={(e) => setGobdReceipt(e.target.checked)}
          className="mt-0.5 accent-[var(--brand-primary)]"
        />
        <span className="flex items-start gap-2.5 text-sm">
          <Archive size={15} className="brand-text mt-0.5 shrink-0" />
          <span className="leading-relaxed text-[color:var(--ds-text-muted)]">
            <strong className="text-[color:var(--ds-text)]">{t("upload.gobd_label")}</strong>{" "}
            {t("upload.gobd_desc")}
            <span className="mt-1 block text-xs text-[color:var(--ds-text-muted)]">
              {t("upload.gobd_note")}
            </span>
          </span>
        </span>
      </label>

      {/* HITL: Pause for attorney review + optional overrides */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={pauseForReview}
            onChange={(e) => setPauseForReview(e.target.checked)}
            className="mt-0.5 accent-[var(--brand-primary)]"
          />
          <span className="flex items-start gap-2.5 text-sm">
            <AlertCircle size={15} className="brand-text mt-0.5 shrink-0" />
            <span className="leading-relaxed text-[color:var(--ds-text-muted)]">
              <strong className="text-[color:var(--ds-text)]">Human-in-the-Loop</strong> Pipeline
              nach Layer 2 (Entity-Extraktion) pausieren. Extrahierte Parteien, Gericht und
              Aktenzeichen müssen vor der Analyse freigegeben werden.
              <span className="mt-1 block text-xs text-[color:var(--ds-text-muted)]">
                Die Pipeline wartet im Status &ldquo;awaiting_review&rdquo; — Freigabe über die
                Review-Queue.
              </span>
            </span>
          </span>
        </label>

        {/* Optional overrides */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              Juristiktion (optional)
            </Label>
            <Select value={jurisdictionOverride} onValueChange={setJurisdictionOverride}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Automatisch erkennen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="at">Österreich</SelectItem>
                <SelectItem value="de">Deutschland</SelectItem>
                <SelectItem value="ch">Schweiz</SelectItem>
                <SelectItem value="eu">EU</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              Dokumenttyp (optional)
            </Label>
            <Select value={docTypeOverride} onValueChange={setDocTypeOverride}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Automatisch klassifizieren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="court_judgment">Urteil</SelectItem>
                <SelectItem value="court_order">Gerichtsbeschluss</SelectItem>
                <SelectItem value="pleading">Schriftsatz</SelectItem>
                <SelectItem value="contract">Vertrag</SelectItem>
                <SelectItem value="correspondence">Korrespondenz</SelectItem>
                <SelectItem value="witness_statement">Zeugenaussage</SelectItem>
                <SelectItem value="expert_report">Gutachten</SelectItem>
                <SelectItem value="police_report">Ermittlungsakte</SelectItem>
                <SelectItem value="ladung">Ladung</SelectItem>
                <SelectItem value="zahlungsbefehl">Zahlungsbefehl</SelectItem>
                <SelectItem value="erv_erledigung">ERV-Erledigung</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Offline warning */}
      {!isOnline() && (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]">
          <CloudUpload size={16} />
          <span>{t("upload.offline_msg")}</span>
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative cursor-pointer rounded-2xl border border-dashed p-12 text-center transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isDragActive
            ? "brand-border brand-soft ring-1 ring-[color:var(--brand-primary)]/20"
            : "hover:brand-border hover:brand-soft border-[color:var(--ds-border-strong)]",
          !isOnline() && "cursor-not-allowed opacity-50",
          !canUpload && "cursor-not-allowed opacity-50"
        )}
      >
        <input {...getInputProps()} aria-label={t("aria.file_upload")} />
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-2xl transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
              isDragActive ? "brand-soft" : "bg-[color:var(--ds-surface-2)]"
            )}
          >
            <CloudUpload
              size={28}
              className={isDragActive ? "brand-text" : "text-[color:var(--ds-text-subtle)]"}
            />
          </div>
          <div>
            <p className="mb-1 text-base font-semibold text-[color:var(--ds-text)]">
              {isDragActive ? t("upload.drop_release") : t("upload.drop_text")}
            </p>
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              oder <span className="brand-text hover:underline">{t("upload.browse_link")}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[".pdf", ".docx", ".eml", ".jpg"].map((ext) => (
              <Badge key={ext} variant="default" className="font-mono text-xs">
                {ext}
              </Badge>
            ))}
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              max. {formatBytes(DIRECT_UPLOAD_MAX_SIZE)} pro Datei
            </span>
          </div>
        </div>
      </div>

      {/* IDE-style folder import (Chromium only) */}
      {folderApi && (
        <div className="-mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="secondary"
            onClick={pickFolder}
            disabled={scanning || !isOnline()}
            className="gap-2"
          >
            <FolderOpen size={15} />
            {scanning ? t("upload.folder_scanning") : t("upload.folder_scan")}
          </Button>
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("upload.folder_desc")}</p>
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4">
        <Info size={15} className="mt-0.5 shrink-0 text-[color:var(--ds-info-text)]" />
        <div className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          <strong className="text-[color:var(--ds-text)]">{t("upload.how_title")}</strong>{" "}
          {t("upload.how_desc")}
          <br />
          <strong className="mt-1 block text-[color:var(--ds-info-text)]">{t("upload.hint_label")}</strong>{" "}
          {t("upload.hint_desc")}
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {files.length}{" "}
              {files.length !== 1 ? t("upload.files_count_plural") : t("upload.files_count")}
              {doneCount > 0 && (
                <span className="ml-2 text-[color:var(--ds-success-text)]">
                  · {doneCount} {t("upload.done_count")}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Button size="sm" variant="glow" onClick={uploadAll} disabled={!canUpload}>
                  <Upload size={13} />
                  {pendingCount} {t("upload.upload_btn")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setFiles([])}>
                {t("upload.clear_all")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {(activeCount > 0 || doneCount > 0 || errorCount > 0) && (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--ds-text-muted)]">
                  <span>
                    {doneCount}/{files.length} fertig
                    {activeCount > 0 ? ` · ${activeCount} aktiv` : ""}
                    {errorCount > 0 ? ` · ${errorCount} Fehler` : ""}
                  </span>
                  <span className="font-semibold text-[color:var(--ds-text)]">
                    {overallProgress}% · {formatBytes(transferredBytes)} / {formatBytes(totalBytes)}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={overallProgress}
                  aria-label="Gesamtfortschritt Upload"
                >
                  <div
                    className="brand-bg h-full rounded-full transition-all"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>
            )}
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-colors hover:border-[color:var(--ds-border-strong)]"
              >
                <FileIcon name={f.file.name} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {f.file.name}
                    </span>
                    <span className="shrink-0 text-xs text-[color:var(--ds-text-muted)]">
                      {formatBytes(f.file.size)}
                    </span>
                  </div>
                  {(f.status === "preparing" ||
                    f.status === "uploading" ||
                    f.status === "processing") && (
                    <div>
                      <div className="mb-1.5 overflow-x-auto">
                        <UploadLifecycle
                          stage={uploadStageIndex(f)}
                          verifySkipped={
                            !f.sawVerifying &&
                            (f.serverPhase === "scanning" || f.serverPhase === "extracting")
                          }
                        />
                      </div>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[color:var(--ds-text-muted)]">
                        {f.status === "preparing" ? (
                          <span>Initialisiert · {formatBytes(f.file.size)}</span>
                        ) : f.status === "processing" ? (
                          <span>
                            {f.serverPhase === "downloading"
                              ? "Datei wird vom Storage heruntergeladen"
                              : f.serverPhase === "verifying"
                                ? "Prüfsumme wird verifiziert"
                                : f.serverPhase === "scanning"
                                  ? "Virenscan wird durchgeführt"
                                  : f.serverPhase === "extracting"
                                    ? "Inhalt wird extrahiert und indexiert"
                                    : "Datei übertragen · Server prüft, speichert und indexiert"}
                          </span>
                        ) : (
                          <span>
                            {formatBytes(f.uploadedBytes ?? 0)} / {formatBytes(f.file.size)}
                            {f.speedBps
                              ? ` · ${formatBytes(f.speedBps)}/s · Rest ${formatEta(f.etaSeconds)}`
                              : ""}
                          </span>
                        )}
                        <span className="font-semibold text-[color:var(--ds-text)]">
                          {Math.round(f.progress)}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(f.progress)}
                        aria-label={`Upload ${f.file.name}`}
                      >
                        <div
                          className="brand-bg h-full rounded-full transition-all"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {f.status === "done" && f.slug && (
                    <span className="flex flex-wrap items-center gap-2">
                      {f.slug === "offline-queued" ? (
                        <span className="text-xs text-[color:var(--ds-warning-text)]">
                          Offline-Warteschlange — wird automatisch synchronisiert
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-[color:var(--ds-success-text)]">→ {f.slug}</span>
                      )}
                      {f.gobdStamped && (
                        <Badge
                          variant="default"
                          className="brand-soft brand-text brand-border gap-1 text-xs"
                        >
                          <Archive size={10} /> {t("upload.gobd_stamped")}
                        </Badge>
                      )}
                      {f.recognizedJurisdiction && (
                        <Badge
                          variant="default"
                          className="border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                        >
                          {f.recognizedJurisdiction.toUpperCase()}
                        </Badge>
                      )}
                      {f.recognizedDocType && (
                        <Badge
                          variant="default"
                          className="border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-xs text-[color:var(--ds-info-text)]"
                        >
                          {f.recognizedDocType}
                        </Badge>
                      )}
                      {f.gzLeitzahl && (
                        <Badge
                          variant="default"
                          className={`border font-mono text-xs ${
                            f.gzValidated === true
                              ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                              : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                          }`}
                          title={f.gzValidated ? "GZ strukturell validiert" : "GZ nicht validiert"}
                        >
                          {f.gzValidated ? "✓ " : "⚠ "}
                          {f.gzLeitzahl}
                        </Badge>
                      )}
                      {f.persistWarning && (
                        <span className="flex items-center gap-1 text-xs text-[color:var(--ds-warning-text)]">
                          <AlertCircle size={11} />
                          GoBD-Warnung: Original nicht gespeichert ({f.persistWarning})
                        </span>
                      )}
                      {f.extractionWarning && (
                        <p className="mt-1 text-xs text-[color:var(--ds-warning-text)] dark:text-[color:var(--ds-warning-text)]">
                          Extraktionshinweis: {f.extractionWarning}
                        </p>
                      )}
                    </span>
                  )}
                  {f.status === "error" && <span className="text-xs text-[color:var(--ds-danger-text)]">{f.error}</span>}
                  {f.status === "skipped" && (
                    <span className="text-xs text-[color:var(--ds-warning-text)]">
                      Übersprungen — bereits vorhanden (Duplikat)
                    </span>
                  )}
                  {f.status === "pending" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        {t("upload.pending")}
                      </span>
                      {f.routingHint && (
                        <Badge
                          variant="default"
                          className="brand-soft brand-text brand-border gap-1 text-[0.6875rem]"
                        >
                          {f.routingHint}
                        </Badge>
                      )}
                      {/* Per-file override: route this single file to a different Akte. */}
                      {mode === "case" && cases.length > 0 && (
                        <select
                          aria-label={`Akte für ${f.file.name}`}
                          value={f.overrides?.case_slug ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFiles((prev) =>
                              prev.map((x) =>
                                x.id === f.id
                                  ? {
                                      ...x,
                                      overrides: val
                                        ? { ...x.overrides, case_slug: val }
                                        : (() => {
                                            const rest = { ...x.overrides };
                                            delete rest.case_slug;
                                            return Object.keys(rest).length ? rest : undefined;
                                          })(),
                                    }
                                  : x
                              )
                            );
                          }}
                          className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-[0.6875rem] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                        >
                          <option value="">Akte aus Auswahl oben</option>
                          {cases.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {f.status === "pending" && (
                    <button
                      onClick={() => removeFile(f.id)}
                      className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-danger-text)]"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {(f.status === "preparing" ||
                    f.status === "uploading" ||
                    f.status === "processing") && (
                    <Loader size={14} className="brand-text animate-spin" />
                  )}
                  {f.status === "done" && (
                    <CheckCircle
                      size={14}
                      className={
                        f.slug === "offline-queued" ? "text-[color:var(--ds-warning-text)]" : "text-[color:var(--ds-success-text)]"
                      }
                    />
                  )}
                  {f.status === "error" && <XCircle size={14} className="text-[color:var(--ds-danger-text)]" />}
                  {f.status === "skipped" && <Info size={14} className="text-[color:var(--ds-warning-text)]" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next steps after upload */}
      {doneCount > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle size={16} className="text-[color:var(--ds-success-text)]" />
            <span className="text-sm font-semibold text-[color:var(--ds-success-text)]">
              {doneCount}{" "}
              {doneCount !== 1 ? t("upload.files_count_plural") : t("upload.files_count")}{" "}
              {t("upload.uploaded")}
            </span>
          </div>
          <p className="mb-4 text-sm text-[color:var(--ds-text-muted)]">{t("upload.indexing")}</p>
          <div className="flex gap-3">
            <Button size="sm" variant="success" onClick={() => router.push("/dashboard/chat")}>
              {t("upload.ask_brain")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => router.push("/dashboard/brain")}>
              {t("upload.explore_brain")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
