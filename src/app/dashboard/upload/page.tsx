"use client";

import { useState, useCallback, useEffect } from "react";
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
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { MAX_FILE_SIZE } from "@/lib/upload-validation";
import { runUploadPool } from "@/lib/upload-queue";
import { inferUploadRouting, type KnownCase } from "@/lib/upload-routing";
import { isOnline, enqueueFileUpload } from "@/lib/offline-store";
import { sha256HexBytes, gobdFrontmatter } from "@/lib/gobd";
import { PageHeader } from "@/components/dashboard/page-header";
import type { BrainPage } from "@/lib/types";

interface FileOverrides {
  source?: string;
  case_slug?: string;
  tags?: string[];
}

interface UploadFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error" | "skipped";
  progress: number;
  error?: string;
  slug?: string;
  gobdStamped?: boolean;
  /** Per-file bulk-rule overrides; fall back to the batch-wide defaults. */
  overrides?: FileOverrides;
  /** Auto-routing suggestion derived from the filename (informational). */
  routingHint?: string;
}

// Aligned with the server-side allowlist in upload-validation.ts (ALLOWED_MIME_TYPES).
const ACCEPTED_TYPES = {
  "text/markdown": [".md"],
  "text/plain": [".txt"],
  "application/pdf": [".pdf"],
  "application/json": [".json"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/rtf": [".rtf"],
  "text/html": [".html", ".htm"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/tiff": [".tif", ".tiff"],
};
const FOLDER_ACCEPT_RE = /\.(md|txt|pdf|json|docx?|rtf|html?|png|jpe?g|tiff?)$/i;
const FOLDER_MAX_BYTES = MAX_FILE_SIZE;

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const colors: Record<string, string> = {
    md: "text-blue-600",
    txt: "text-[color:var(--ds-text-muted)]",
    pdf: "text-red-600",
    json: "text-amber-600",
  };
  return <File size={20} className={colors[ext || ""] || "text-[color:var(--ds-text-muted)]"} />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type UploadMode = "case" | "knowledge";

const KNOWLEDGE_SOURCES = [
  {
    value: "kanzleiwissen",
    label: "Kanzleiwissen",
    desc: "Playbooks, Vorlagen, Präzedenzfälle, interne Standards",
  },
  { value: "wiki", label: "Kanzlei-Wiki", desc: "Allgemeines Wissen, FAQs, Handbücher" },
  { value: "meetings", label: "Besprechungen", desc: "Team-Meetings, Notizen" },
  { value: "people", label: "Kontakte", desc: "Mandanten, Gegenseite, Experten" },
  { value: "companies", label: "Unternehmen", desc: "Firmen, Behörden, Institutionen" },
  { value: "ideas", label: "Ideen", desc: "Strategien, Verbesserungsvorschläge" },
];

export default function UploadPage() {
  const router = useRouter();
  const { t } = useLang();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<UploadMode>(
    (searchParams.get("mode") as UploadMode) === "knowledge" ? "knowledge" : "case"
  );
  const [source, setSource] = useState("kanzleiwissen");
  const [tags, setTags] = useState("");
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState("");
  const [casesLoading, setCasesLoading] = useState(true);
  // GoBD-Baustein: steuerlich relevante Belege beim Ingest mit Aufbewahrungs-
  // frist + Inhalts-Hash stempeln (§ 147 AO / § 146 Abs. 4 AO). Bewusst opt-in:
  // nicht jeder Upload ist ein Buchungsbeleg.
  const [gobdReceipt, setGobdReceipt] = useState(false);

  // File System Access API (Chromium) — feature-detected client-side so we can
  // show an IDE-style "ganzen Ordner einlesen"-Button only where it actually works.
  const [folderApi, setFolderApi] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    setFolderApi(typeof window !== "undefined" && "showDirectoryPicker" in window);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const pages = await api.brain.listPages({ type: "legal_case", limit: 200 });
        setCases(pages);
      } catch {
        setCases([]);
      } finally {
        setCasesLoading(false);
      }
    })();
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
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
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
            if (FOLDER_ACCEPT_RE.test(f.name) && f.size <= FOLDER_MAX_BYTES) out.push(f);
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

    // Staggered upload: large files (>= 50 MB) run max 2 at once, small files
    // fill the remaining slots, so 1 GB uploads never pile up in memory.
    const items = pending.map((f) => ({ ...f, size: f.file.size }));
    await runUploadPool(items, async (uploadFile) => {
      // Per-file overrides win over the batch-wide defaults (bulk rules).
      const ov = uploadFile.overrides;
      const fileSource = ov?.source ?? effectiveSource;
      const fileCaseSlug = ov?.case_slug ?? caseSlug;
      const fileTags = ov?.tags ?? tagList;

      setFiles((prev) =>
        prev.map((f) => (f.id === uploadFile.id ? { ...f, status: "uploading", progress: 0 } : f))
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
          },
          (progress) => {
            setFiles((prev) => prev.map((f) => (f.id === uploadFile.id ? { ...f, progress } : f)));
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

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: "done", progress: 100, slug: result.slug, gobdStamped }
              : f
          )
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("upload.err_failed");
        // Duplicate (409) is a benign conflict, not a hard failure — mark the row
        // as skipped so the batch can finish cleanly.
        const isDuplicate = /duplicate|bereits vorhanden|409/i.test(msg);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: isDuplicate ? "skipped" : "error", error: msg }
              : f
          )
        );
      }
    });
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("upload.title")}
        description={t("upload.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("upload.breadcrumb") },
        ]}
      />

      {/* ── Mode Selector: Two-tier architecture (Akte vs. Kanzlei-Wissen) ── */}
      <div className="grid grid-cols-2 gap-3">
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
                Dokument zu Akte
              </span>
              <Lock size={11} className="text-[color:var(--ds-text-subtle)]" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              Fallbezogene Dokumente mit Ethical-Wall-Isolation. Pflicht-Zuordnung zu einer Akte.
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
                Kanzlei-Wissen
              </span>
              <BookOpen size={11} className="text-[color:var(--ds-text-subtle)]" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              Firmenweites Wissen: Präzedenzfälle, Vorlagen, Playbooks. Der Assistent konsolidiert
              automatisch aus Akten.
            </p>
          </div>
        </button>
      </div>

      {/* ── Mode: Case — Akten-Auswahl (Pflichtfeld) ── */}
      {mode === "case" && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <label
            htmlFor="upload-case"
            className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
          >
            <Briefcase size={13} />
            Akte (Pflichtfeld)
          </label>
          <select
            id="upload-case"
            value={selectedCaseSlug}
            onChange={(e) => setSelectedCaseSlug(e.target.value)}
            disabled={casesLoading}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none disabled:opacity-50"
          >
            <option value="">
              {casesLoading ? "Akten werden geladen…" : "— Bitte Akte auswählen —"}
            </option>
            {cases.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
          {!selectedCaseSlug && !casesLoading && cases.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle size={12} />
              Bitte wählen Sie eine Akte aus. Dokumente ohne Aktenbezug werden nicht akzeptiert.
            </p>
          )}
          {!casesLoading && cases.length === 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle size={12} />
              Keine Akten vorhanden. Bitte erstellen Sie zuerst eine Akte.
            </p>
          )}
        </div>
      )}

      {/* ── Mode: Knowledge — Source-Auswahl ── */}
      {mode === "knowledge" && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <label
            htmlFor="upload-source"
            className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
          >
            <BookOpen size={13} />
            Wissensbereich
          </label>
          <select
            id="upload-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
          >
            {KNOWLEDGE_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} — {s.desc}
              </option>
            ))}
          </select>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-xs text-[color:var(--ds-text-muted)]">
            <Info size={13} className="mt-0.5 shrink-0 text-[color:var(--brand-primary)]" />
            <span>
              Der Assistent konsolidiert automatisch Wissen aus allen Akten in diese Bereiche.
              Präzedenzfälle und Muster werden über den{" "}
              <strong className="text-[color:var(--ds-text)]">Consolidate-Cycle</strong> extrahiert
              — ohne manuellen Aufwand.
            </span>
          </div>
        </div>
      )}

      {/* Tags — immer verfügbar */}
      <div>
        <label
          htmlFor="upload-tags"
          className="mb-2 block text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
        >
          Tags (kommasepariert)
        </label>
        <input
          id="upload-tags"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={t("upload.tags_placeholder")}
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
        />
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

      {/* Offline warning */}
      {!isOnline() && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600">
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
            {[".md", ".txt", ".pdf", ".json"].map((ext) => (
              <Badge key={ext} variant="default" className="font-mono text-xs">
                {ext}
              </Badge>
            ))}
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              · {t("upload.max_size")}
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
      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <Info size={15} className="mt-0.5 shrink-0 text-blue-600" />
        <div className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          <strong className="text-[color:var(--ds-text)]">{t("upload.how_title")}</strong>{" "}
          {t("upload.how_desc")}
          <br />
          <strong className="mt-1 block text-blue-600">{t("upload.hint_label")}</strong>{" "}
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
                <span className="ml-2 text-emerald-600">
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
                  {f.status === "uploading" && (
                    <div className="h-1 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                      <div
                        className="brand-bg h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                  {f.status === "done" && f.slug && (
                    <span className="flex flex-wrap items-center gap-2">
                      {f.slug === "offline-queued" ? (
                        <span className="text-xs text-amber-600">
                          Offline-Warteschlange — wird automatisch synchronisiert
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-emerald-600">→ {f.slug}</span>
                      )}
                      {f.gobdStamped && (
                        <Badge
                          variant="default"
                          className="brand-soft brand-text brand-border gap-1 text-xs"
                        >
                          <Archive size={10} /> {t("upload.gobd_stamped")}
                        </Badge>
                      )}
                    </span>
                  )}
                  {f.status === "error" && <span className="text-xs text-red-600">{f.error}</span>}
                  {f.status === "skipped" && (
                    <span className="text-xs text-amber-600">
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
                      className="text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {f.status === "uploading" && (
                    <Loader size={14} className="brand-text animate-spin" />
                  )}
                  {f.status === "done" && (
                    <CheckCircle
                      size={14}
                      className={
                        f.slug === "offline-queued" ? "text-amber-500" : "text-emerald-600"
                      }
                    />
                  )}
                  {f.status === "error" && <XCircle size={14} className="text-red-600" />}
                  {f.status === "skipped" && <Info size={14} className="text-amber-500" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next steps after upload */}
      {doneCount > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-600">
              {doneCount}{" "}
              {doneCount !== 1 ? t("upload.files_count_plural") : t("upload.files_count")}{" "}
              {t("upload.uploaded")}
            </span>
          </div>
          <p className="mb-4 text-sm text-[color:var(--ds-text-muted)]">{t("upload.indexing")}</p>
          <div className="flex gap-3">
            <Button size="sm" variant="success" onClick={() => router.push("/dashboard/query")}>
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
