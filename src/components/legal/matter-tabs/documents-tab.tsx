"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  FileText,
  Plus,
  Download,
  Trash2,
  Network,
  XCircle,
  Lock,
  FolderOpen,
  CloudUpload,
  CheckCircle2,
  XCircle as XIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMe } from "@/lib/queries/auth";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { isOnline } from "@/lib/offline-store";
import { UPLOAD_ACCEPT_ATTRIBUTE } from "@/lib/upload-formats";
import { csrfFetch } from "@/lib/csrf";
import { api } from "@/lib/api";
import { isDocumentLock, type DocumentLock } from "@/lib/document-versions";
import { ActImportCockpit } from "@/components/legal/ActImportCockpit";
import { QesSignButton } from "@/components/legal/QesSignButton";
import { suggestFolder } from "@/lib/vault-organization";
import { buildFolderTree, folderMatches } from "@/lib/folder-tree";
import { FolderTree, FOLDER_DND_MIME } from "@/components/legal/folder-tree";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  partialLabel,
  statusFieldsFromFrontmatter,
  type DocStatusFields,
} from "@/lib/doc-processing-status";

interface DocJurisdiction {
  jurisdiction: string;
  confidence?: number;
  unverified: boolean;
}

export function DocumentsTab() {
  const ctx = useMatterDetail();
  const { t } = useLang();
  // Releasing to the client is a lawyer/admin decision (server-enforced too).
  const meQuery = useMe();
  const myRole = meQuery.data?.user?.role;
  const mayReleaseToClient = myRole === "admin" || myRole === "lawyer";
  const { addToast } = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // G27 fix: debounce search + AbortController to prevent out-of-order
  // responses and cancel in-flight requests on new input.
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const qesResult = searchParams.get("qes");
  const qesReason = searchParams.get("reason");

  useEffect(() => {
    // Debounce: wait 250ms after last keystroke before searching.
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!ctx.linkSearchQuery.trim() || ctx.linkSearchQuery.trim().length <= 2) {
      setDebouncedSearch("");
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(ctx.linkSearchQuery);
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [ctx.linkSearchQuery]);

  const { setLinkSearchResults, setLinkSearching } = ctx;
  useEffect(() => {
    if (!debouncedSearch) {
      setLinkSearchResults([]);
      return;
    }
    // Abort any previous in-flight search to prevent out-of-order responses.
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;
    setLinkSearching(true);
    api.brain
      .search(debouncedSearch, 10)
      .then((results) => {
        if (!ac.signal.aborted) {
          setLinkSearchResults(results);
          setLinkSearching(false);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setLinkSearching(false);
      });
    return () => ac.abort();
  }, [debouncedSearch, setLinkSearchResults, setLinkSearching]);

  useEffect(() => {
    if (searchParams.get("action") !== "upload") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("matter-document-upload-zone")?.focus();
      router.replace(pathname, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, router, searchParams]);
  // Jurisdiction lives on the doc pages (stamped by the pipeline), not on the
  // case's documents[] entries — batch-fetch it like the evidence tab does.
  const [docJurisdictions, setDocJurisdictions] = useState<Record<string, DocJurisdiction>>({});
  const [docLocks, setDocLocks] = useState<Record<string, DocumentLock>>({});
  const [docFolders, setDocFolders] = useState<Record<string, string>>({});
  const [docStatuses, setDocStatuses] = useState<Record<string, DocStatusFields>>({});
  const [folderFilter, setFolderFilter] = useState("all");
  const [folderEditSlug, setFolderEditSlug] = useState<string | null>(null);
  const [folderEditValue, setFolderEditValue] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [autoOrganizing, setAutoOrganizing] = useState(false);
  const [folderTreeOpen, setFolderTreeOpen] = useState(false);
  // WP-2.8: Baum-Persistenz + Ordner-Verwaltung (Umbenennen/Unterordner).
  // Leere Ordner existieren nicht serverseitig (Ordner leben im
  // Doc-Frontmatter) — neu angelegte Unterordner werden daher pro Akte
  // in localStorage „gepinnt", bis ein Dokument sie befüllt.
  const [pinnedFolders, setPinnedFolders] = useState<string[]>([]);
  // Einmaliger Inline-Hint für Drag&Drop — der title-Tooltip ist auf
  // Touch-Geräten unsichtbar; nach Wegklicken nicht mehr zeigen.
  const [dndHintDismissed, setDndHintDismissed] = useState(true);
  const [folderRename, setFolderRename] = useState<{ path: string; value: string } | null>(null);
  const [folderCreate, setFolderCreate] = useState<{ parent: string; value: string } | null>(null);
  const [folderBulkBusy, setFolderBulkBusy] = useState(false);
  const caseSlug = ctx.caseData?.slug ?? "";
  const treeOpenKey = caseSlug ? `subsumio:folder-tree-open:${caseSlug}` : null;
  const pinnedKey = caseSlug ? `subsumio:pinned-folders:${caseSlug}` : null;
  const treeHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!treeOpenKey || treeHydratedRef.current === treeOpenKey) return;
    treeHydratedRef.current = treeOpenKey;
    try {
      if (localStorage.getItem(treeOpenKey) === "1") setFolderTreeOpen(true);
      const rawPinned = pinnedKey ? localStorage.getItem(pinnedKey) : null;
      setPinnedFolders(rawPinned ? (JSON.parse(rawPinned) as string[]) : []);
      setDndHintDismissed(localStorage.getItem("subsumio:folder-dnd-hint-seen") === "1");
    } catch {
      /* localStorage verweigert — Defaults bleiben */
    }
  }, [treeOpenKey, pinnedKey]);
  const toggleFolderTree = () => {
    setFolderTreeOpen((o) => {
      const next = !o;
      if (treeOpenKey) {
        try {
          localStorage.setItem(treeOpenKey, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };
  const updatePinnedFolders = (fn: (prev: string[]) => string[]) => {
    setPinnedFolders((prev) => {
      const next = fn(prev);
      if (pinnedKey) {
        try {
          localStorage.setItem(pinnedKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };
  const docSlugsKey = (ctx.caseData?.documents ?? [])
    .map((d) => d.slug || d.url || "")
    .filter(Boolean)
    .join(",");
  useEffect(() => {
    if (!docSlugsKey) return;
    let cancelled = false;
    (async () => {
      try {
        // Every document of the matter, in batches — the processing status
        // lives on the document page, not in the matter's document list.
        const slugs = docSlugsKey.split(",");
        const pagesMap: Awaited<ReturnType<typeof api.brain.getPages>> = {};
        for (let i = 0; i < slugs.length; i += 50) {
          Object.assign(pagesMap, await api.brain.getPages(slugs.slice(i, i + 50)));
          if (cancelled) return;
        }
        const next: Record<string, DocJurisdiction> = {};
        const locks: Record<string, DocumentLock> = {};
        const folders: Record<string, string> = {};
        const statuses: Record<string, DocStatusFields> = {};
        for (const [pageSlug, page] of Object.entries(pagesMap)) {
          const fm = (page?.frontmatter ?? {}) as Record<string, unknown>;
          statuses[pageSlug] = statusFieldsFromFrontmatter(fm);
          if (isDocumentLock(fm.checked_out_by)) locks[pageSlug] = fm.checked_out_by;
          if (typeof fm.folder === "string" && fm.folder.trim()) {
            folders[pageSlug] = fm.folder.trim();
          }
          if (typeof fm.jurisdiction !== "string" || !fm.jurisdiction) continue;
          next[pageSlug] = {
            jurisdiction: fm.jurisdiction,
            confidence:
              typeof fm.jurisdiction_confidence === "number"
                ? fm.jurisdiction_confidence
                : undefined,
            unverified:
              fm.jurisdiction_unverified === true || fm.jurisdiction_unverified === "true",
          };
        }
        setDocJurisdictions(next);
        setDocLocks(locks);
        setDocFolders(folders);
        setDocStatuses(statuses);
      } catch {
        // Best-effort enrichment — the tab stays fully usable without it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docSlugsKey]);
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const allFolders = [...new Set([...Object.values(docFolders), ...pinnedFolders])].sort((a, b) =>
    a.localeCompare(b, "de")
  );
  const docKey = (d: { slug?: string; url?: string }) => d.slug || d.url || "";
  // WP-2.8: Prefix-Matching — ein gewählter Baum-Knoten filtert auch seine
  // Unterordner-Dokumente mit („Korrespondenz" fängt „Korrespondenz/Ausgehend").
  const matchesFolder = (d: { slug?: string; url?: string }) =>
    folderMatches(docFolders[docKey(d)], folderFilter);
  const folderCounts: Record<string, number> = {};
  for (const d of caseData.documents) {
    const f = docFolders[docKey(d)];
    if (f) folderCounts[f] = (folderCounts[f] ?? 0) + 1;
  }
  const folderTreeNodes = buildFolderTree(allFolders, folderCounts);
  const unfiledCount = caseData.documents.filter((d) => !docFolders[docKey(d)]).length;

  async function saveFolder(docSlug: string, folder: string) {
    setFolderSaving(true);
    try {
      const res = await csrfFetch(
        `/api/pages/${docSlug.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frontmatter: { folder: folder.trim() || null },
            merge: true,
          }),
        }
      );
      if (!res.ok) {
        ctx.setUploadError("Ordner konnte nicht gespeichert werden.");
        return;
      }
      setDocFolders((prev) => {
        const next = { ...prev };
        if (folder.trim()) next[docSlug] = folder.trim();
        else delete next[docSlug];
        return next;
      });
      setFolderEditSlug(null);
    } catch {
      ctx.setUploadError("Ordner konnte nicht gespeichert werden.");
    } finally {
      setFolderSaving(false);
    }
  }

  /** Normalisiert Nutzereingabe zu einem sauberen Ordner-Pfad. */
  function normalizeFolderPath(raw: string): string {
    return raw
      .trim()
      .replace(/\/{2,}/g, "/")
      .replace(/^\/+|\/+$/g, "");
  }

  /** Drag & Drop: Dokument auf einen Baum-Knoten fallen lassen. */
  function dropDocumentOnFolder(docSlug: string, folderPath: string) {
    if ((docFolders[docSlug] ?? "") === folderPath) return;
    void saveFolder(docSlug, folderPath);
  }

  /** Prefix-Rename: Ordner inkl. aller Unterordner umbenennen. */
  async function renameFolder(oldPath: string, rawNew: string) {
    const newPath = normalizeFolderPath(rawNew);
    if (!newPath || newPath === oldPath) {
      setFolderRename(null);
      return;
    }
    if (newPath.startsWith(`${oldPath}/`) || allFolders.includes(newPath)) {
      ctx.setUploadError(
        allFolders.includes(newPath)
          ? t("casesdetail.folder_exists")
          : t("casesdetail.folder_invalid")
      );
      return;
    }
    const affected = Object.entries(docFolders).filter(
      ([, f]) => f === oldPath || f.startsWith(`${oldPath}/`)
    );
    // Gepinnter Leerordner ohne Dokumente — nur lokales Remap, kein Call.
    if (affected.length === 0) {
      updatePinnedFolders((prev) =>
        prev.map((p) =>
          p === oldPath || p.startsWith(`${oldPath}/`) ? `${newPath}${p.slice(oldPath.length)}` : p
        )
      );
      if (folderFilter === oldPath || folderFilter.startsWith(`${oldPath}/`)) {
        setFolderFilter(`${newPath}${folderFilter.slice(oldPath.length)}`);
      }
      setFolderRename(null);
      addToast({
        type: "success",
        title: t("casesdetail.folder_renamed").replace("{{count}}", "0"),
      });
      return;
    }
    setFolderBulkBusy(true);
    try {
      // Bulk-Endpoint: der Server verifiziert pro Seite den Prefix und
      // schreibt gelockt — ein Request statt N sequentieller PATCHes.
      const res = await csrfFetch("/api/legal/folders/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugs: affected.map(([slug]) => slug),
          from: oldPath,
          to: newPath,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        moved?: number;
        failed?: number;
        moved_slugs?: string[];
      };
      if (!res.ok) {
        ctx.setUploadError(t("casesdetail.folder_rename_failed"));
        return;
      }
      const movedSet = new Set(data.moved_slugs ?? affected.map(([slug]) => slug));
      setDocFolders((prev) => {
        const next = { ...prev };
        for (const [slug, f] of Object.entries(prev)) {
          if (!movedSet.has(slug)) continue;
          if (f === oldPath || f.startsWith(`${oldPath}/`)) {
            next[slug] = `${newPath}${f.slice(oldPath.length)}`;
          }
        }
        return next;
      });
      updatePinnedFolders((prev) =>
        prev.map((p) =>
          p === oldPath || p.startsWith(`${oldPath}/`) ? `${newPath}${p.slice(oldPath.length)}` : p
        )
      );
      if (folderFilter === oldPath || folderFilter.startsWith(`${oldPath}/`)) {
        setFolderFilter(`${newPath}${folderFilter.slice(oldPath.length)}`);
      }
      setFolderRename(null);
      const moved = data.moved ?? movedSet.size;
      const failed = data.failed ?? 0;
      if (failed > 0) {
        ctx.setUploadError(
          t("casesdetail.folder_rename_partial").replace("{{count}}", String(failed))
        );
      } else {
        addToast({
          type: "success",
          title: t("casesdetail.folder_renamed").replace("{{count}}", String(moved)),
        });
      }
    } catch {
      ctx.setUploadError(t("casesdetail.folder_rename_failed"));
    } finally {
      setFolderBulkBusy(false);
    }
  }

  /** Neuen (leeren) Unterordner pinnen — wird serverseitig real, sobald
   *  das erste Dokument zugeordnet ist. */
  function createSubfolder(parentPath: string, rawName: string) {
    const name = normalizeFolderPath(rawName);
    if (!name) return;
    const newPath = `${parentPath}/${name}`;
    if (allFolders.includes(newPath)) {
      ctx.setUploadError(t("casesdetail.folder_exists"));
      return;
    }
    updatePinnedFolders((prev) => [...new Set([...prev, newPath])]);
    setFolderCreate(null);
    if (!folderTreeOpen) toggleFolderTree();
    addToast({ type: "info", title: t("casesdetail.folder_created") });
  }

  async function autoOrganize() {
    const unsorted = (caseData?.documents ?? []).filter((d) => !docFolders[docKey(d)]);
    if (unsorted.length === 0) {
      ctx.setUploadError(null);
      return;
    }
    setAutoOrganizing(true);
    let applied = 0;
    try {
      for (const d of unsorted.slice(0, 50)) {
        const suggestion = suggestFolder({
          name: d.name,
          doc_type: d.doc_type,
          kind: d.kind,
          source: d.source,
        });
        const key = docKey(d);
        if (!suggestion || !key || !d.slug) continue;
        const res = await csrfFetch(
          `/api/pages/${key.split("/").map(encodeURIComponent).join("/")}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frontmatter: { folder: suggestion.folder },
              merge: true,
            }),
          }
        );
        if (res.ok) {
          applied += 1;
          setDocFolders((prev) => ({ ...prev, [key]: suggestion.folder }));
        }
      }
      if (applied === 0) {
        ctx.setUploadError(t("casesdetail.auto_organize_none"));
      }
    } catch {
      ctx.setUploadError(t("casesdetail.auto_organize_error"));
    } finally {
      setAutoOrganizing(false);
    }
  }

  return (
    <div className="space-y-4">
      {(qesResult === "signed" || qesResult === "failed" || qesResult === "processing") && (
        <div
          role={qesResult === "failed" ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            qesResult === "signed"
              ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
              : qesResult === "processing"
                ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
          }`}
        >
          <span className="flex-1">
            {qesResult === "signed"
              ? "Das Dokument wurde qualifiziert signiert. Das signierte PDF liegt jetzt zusätzlich in dieser Akte."
              : qesResult === "processing"
                ? "Die qualifizierte Signatur wird gerade abgeschlossen. Die Liste aktualisiert sich nach einem Neuladen."
                : `Die qualifizierte Signatur wurde nicht abgeschlossen${qesReason ? `: ${qesReason}` : "."} Das Original ist unverändert.`}
          </span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => router.replace(pathname)}
          >
            Ausblenden
          </button>
        </div>
      )}
      <ActImportCockpit caseSlug={caseData.slug} />
      {/* Upload zone */}
      <div
        id="matter-document-upload-zone"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add(
            "border-[color:var(--brand-primary)]",
            "bg-[color:var(--brand-primary)]/5"
          );
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove(
            "border-[color:var(--brand-primary)]",
            "bg-[color:var(--brand-primary)]/5"
          );
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove(
            "border-[color:var(--brand-primary)]",
            "bg-[color:var(--brand-primary)]/5"
          );
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0 && caseData) ctx.handleMultiUpload(files);
        }}
        className={cn(
          "rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center transition-[background-color,border-color,color] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none",
          caseData?.status === "archived" && "pointer-events-none opacity-50"
        )}
        tabIndex={caseData?.status === "archived" ? -1 : 0}
        role="button"
        aria-label="Dateien hochladen"
        aria-disabled={caseData?.status === "archived"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const input = e.currentTarget.querySelector(
              'input[type="file"]'
            ) as HTMLInputElement | null;
            input?.click();
          }
        }}
      >
        <FileText size={24} className="mx-auto mb-2 text-[color:var(--ds-text-muted)]" />
        <p className="text-sm font-medium text-[color:var(--ds-text)]">
          Dokumente hochladen oder hier ablegen
        </p>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          PDF, Office/iWork, E-Mail/PST, ZIP, Bild, Audio oder Text · bis 500 MB (Tabellen 20 MB) ·
          wird automatisch dieser Akte zugeordnet
        </p>
        {!isOnline() && (
          <p className="mt-2 text-xs text-[color:var(--ds-warning-text)]">
            {t("casesdetail.upload.offline_mode")}
          </p>
        )}
        <label className="mt-3 inline-block cursor-pointer">
          <input
            type="file"
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0 && caseData) ctx.handleMultiUpload(files);
              e.target.value = "";
            }}
          />
          <span className="brand-bg brand-bg inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-[background-color,border-color,color] motion-reduce:transition-none">
            <Plus size={14} /> {t("cases.detail_doc_upload")}
          </span>
        </label>
        <div className="mx-auto mt-3 max-w-sm text-left">
          <label
            htmlFor="case-upload-document-password"
            className="mb-1 flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]"
          >
            <Lock size={11} /> Dokumentkennwort (optional, wird nicht gespeichert)
          </label>
          <input
            id="case-upload-document-password"
            type="password"
            autoComplete="off"
            maxLength={255}
            value={ctx.documentPassword}
            onChange={(event) => ctx.setDocumentPassword(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            disabled={!isOnline()}
            className="w-full rounded-lg border border-[color:var(--ds-border-control)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] transition-[border-color,box-shadow] focus:border-[color:var(--ds-ring)] focus:ring-2 focus:ring-[color:var(--ds-ring)]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] motion-reduce:transition-none"
          />
        </div>
        {ctx.folderApi && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void ctx.pickFolderForCase();
            }}
            disabled={ctx.scanningFolder || !isOnline() || caseData?.status === "archived"}
            className="mt-3 ml-2 inline-flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text)] transition-[background-color,border-color,color] hover:border-[color:var(--ds-border-strong)] active:scale-[0.99] disabled:opacity-50 motion-reduce:transition-none"
          >
            <FolderOpen size={14} />
            {ctx.scanningFolder ? "Ordner wird eingelesen…" : "Ganzen Ordner einlesen"}
          </button>
        )}
      </div>

      {/* Upload progress queue */}
      {ctx.uploadQueue.length > 0 && (
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("casesdetail.upload.in_progress")}
              </div>
              <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                {ctx.uploadStats.completedFiles}/{ctx.uploadStats.totalFiles}{" "}
                {t("casesdetail.upload.files_label")} ·{" "}
                {ctx.formatUploadBytes(ctx.uploadStats.uploadedBytes)} von{" "}
                {ctx.formatUploadBytes(ctx.uploadStats.totalBytes)}
                {ctx.uploadStats.failedFiles > 0 ? ` · ${ctx.uploadStats.failedFiles} Fehler` : ""}
              </div>
            </div>
            <div className="text-sm font-semibold text-[color:var(--ds-text)]">
              {ctx.uploadOverallProgress}%
            </div>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--ds-border)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ctx.uploadOverallProgress}
            aria-label="Gesamtfortschritt Hochladen"
          >
            <div
              className="brand-bg h-full rounded-full transition-[background-color,border-color,color,box-shadow,transform,opacity] motion-reduce:transition-none"
              style={{ width: `${ctx.uploadOverallProgress}%` }}
            />
          </div>
          {ctx.uploadQueue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5"
            >
              {item.status === "preparing" ||
              item.status === "uploading" ||
              item.status === "processing" ? (
                <Loader2 size={16} className="brand-text shrink-0 animate-spin" />
              ) : item.status === "done" ? (
                <CheckCircle2 size={16} className="shrink-0 text-[color:var(--ds-success-text)]" />
              ) : item.status === "error" ? (
                <XIcon size={16} className="shrink-0 text-[color:var(--ds-danger-text)]" />
              ) : (
                <FileText size={16} className="brand-text shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {item.fileName}
                  </div>
                  <div className="shrink-0 text-xs font-semibold text-[color:var(--ds-text)]">
                    {item.progress}%
                  </div>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                  <span>{ctx.uploadStatusLabel(item.status)}</span>
                  {item.status === "preparing" ? (
                    <span>
                      Verbindung wird vorbereitet · {ctx.formatUploadBytes(item.fileSize)}
                    </span>
                  ) : item.status === "processing" ? (
                    <span>{t("casesdetail.upload.server_processing")}</span>
                  ) : (
                    <span>
                      {ctx.formatUploadBytes(
                        item.status === "done" ? item.fileSize : item.uploadedBytes
                      )}{" "}
                      / {ctx.formatUploadBytes(item.fileSize)}
                    </span>
                  )}
                  {item.status === "uploading" && item.speedBps ? (
                    <span>
                      {ctx.formatUploadBytes(item.speedBps)}/s · Rest{" "}
                      {ctx.formatUploadEta(item.etaSeconds)}
                    </span>
                  ) : null}
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress}
                  aria-label={`Upload ${item.fileName}`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[background-color,border-color,color,box-shadow,transform,opacity] motion-reduce:transition-none",
                      item.status === "error" ? "bg-[color:var(--ds-danger-solid)]" : "brand-bg"
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.status === "error" && (
                  <div className="mt-1 text-xs text-[color:var(--ds-danger-text)]">
                    {item.error}
                  </div>
                )}
              </div>
              {item.status === "error" && (
                <button
                  onClick={() => ctx.setUploadQueue((q) => q.filter((i) => i.id !== item.id))}
                  className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                >
                  Entfernen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {ctx.uploadError && (
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          {ctx.uploadError}
        </div>
      )}

      {ctx.offlinePendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2.5 text-xs text-[color:var(--ds-warning-text)]">
          <CloudUpload size={14} className="shrink-0" />
          <span>
            {ctx.offlinePendingCount} {t("casesdetail.upload.offline_queue")}
            {ctx.offlineSyncing ? ` — ${t("casesdetail.upload.syncing")}` : ""}
          </span>
        </div>
      )}

      {/* Document filter + link */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <span className="font-medium text-[color:var(--ds-text)]">Dokumentenliste</span>
          <select
            value={ctx.docTypeFilter}
            onChange={(e) => ctx.setDocTypeFilter(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          >
            <option value="all">Alle Typen</option>
            <option value="Vollmacht">Vollmacht</option>
            <option value="Klage">Klage</option>
            <option value="Schriftsatz">Schriftsatz</option>
            <option value="Beweis">Beweis</option>
            <option value="Korrespondenz">Korrespondenz</option>
            <option value="Vertrag">Vertrag</option>
            <option value="Sonstiges">Sonstiges</option>
            <option value="witness_statement">Zeugenaussage</option>
            <option value="expert_report">Gutachten</option>
            <option value="medical_report">Arztbericht</option>
            <option value="court_order">Gerichtsbeschluss</option>
            <option value="court_judgment">Urteil</option>
            <option value="pleading">Schriftsatz (KI)</option>
            <option value="invoice">Rechnung</option>
            <option value="police_report">Ermittlungsakte</option>
            <option value="financial_record">Finanzunterlage</option>
          </select>
          {allFolders.length > 0 && (
            <button
              type="button"
              onClick={toggleFolderTree}
              aria-expanded={folderTreeOpen}
              aria-label={t("casesdetail.folder_tree_toggle")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                folderFilter !== "all"
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <FolderOpen size={13} />
              {folderFilter !== "all"
                ? folderFilter === ""
                  ? t("casesdetail.folder_unfiled")
                  : folderFilter
                : t("casesdetail.folder_all")}
            </button>
          )}
          {/* WP-7.45: Vault auto-einordnen (ungeordnete Dokumente) */}
          <button
            type="button"
            onClick={() => void autoOrganize()}
            disabled={autoOrganizing || caseData?.status === "archived"}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none disabled:opacity-50"
          >
            {autoOrganizing
              ? t("casesdetail.auto_organize_running")
              : t("casesdetail.auto_organize")}
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => ctx.setShowLinkDialog(true)}
          disabled={caseData?.status === "archived"}
          className="gap-1.5 text-xs"
        >
          <Network size={13} /> {t("casesdetail.link_existing")}
        </Button>
      </div>

      {/* Drag&Drop-Hint: der title-Tooltip an Doc-Rows ist auf Touch
          unsichtbar — einmalig inline zeigen, wegklickbar. */}
      {folderTreeOpen && allFolders.length > 0 && !dndHintDismissed && (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-3 py-2 text-xs text-[color:var(--ds-info-text)]">
          <FolderOpen size={13} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{t("casesdetail.folder_dnd_hint")}</span>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => {
              setDndHintDismissed(true);
              try {
                localStorage.setItem("subsumio:folder-dnd-hint-seen", "1");
              } catch {
                /* ignore */
              }
            }}
            className="shrink-0 rounded-md p-1 transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
          >
            <XCircle size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Link existing document dialog */}
      {ctx.showLinkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("casesdetail.link_document")}
              </h3>
              <button
                onClick={() => ctx.setShowLinkDialog(false)}
                aria-label="Dialog schließen"
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <XCircle size={16} />
              </button>
            </div>
            <input
              type="text"
              value={ctx.linkSearchQuery}
              onChange={(e) => {
                ctx.setLinkSearchQuery(e.target.value);
                // G27 fix: search is now debounced + abort-controlled via useEffect above.
              }}
              placeholder={t("casesdetail.search_placeholder")}
              className="mb-3 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              autoFocus
            />
            {ctx.linkSearching && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("casesdetail.searching")}
              </p>
            )}
            {!ctx.linkSearching && ctx.linkSearchResults.length > 0 && (
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {ctx.linkSearchResults.map((page) => {
                  const alreadyLinked = caseData?.documents.some((d) => d.slug === page.slug);
                  return (
                    <button
                      key={page.slug}
                      disabled={alreadyLinked}
                      onClick={async () => {
                        if (!caseData) return;
                        try {
                          const docSlugPath = page.slug
                            .split("/")
                            .map(encodeURIComponent)
                            .join("/");
                          await csrfFetch(`/api/pages/${docSlugPath}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              frontmatter: {
                                case_slug: caseData.slug,
                                assignment_status: "assigned",
                                intake_status: "assigned",
                                assigned_at: new Date().toISOString(),
                              },
                              merge: true,
                            }),
                          });
                          await ctx.refreshCaseData();
                          ctx.setShowLinkDialog(false);
                          ctx.setLinkSearchQuery("");
                          ctx.setLinkSearchResults([]);
                        } catch {
                          ctx.setUploadError(t("casesdetail.link_failed"));
                        }
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color,color] motion-reduce:transition-none ${alreadyLinked ? "cursor-not-allowed border-[color:var(--ds-border)] opacity-50" : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5"} active:scale-[0.99]`}
                    >
                      <FileText size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[color:var(--ds-text)]">{page.title}</div>
                        <div className="text-xs text-[color:var(--ds-text-muted)]">{page.slug}</div>
                      </div>
                      {alreadyLinked && (
                        <Badge variant="default" className="shrink-0 text-xs">
                          {t("casesdetail.already_linked")}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {!ctx.linkSearching &&
              ctx.linkSearchQuery.trim().length > 2 &&
              ctx.linkSearchResults.length === 0 && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Keine Ergebnisse gefunden.
                </p>
              )}
          </div>
        </div>
      )}

      {/* Folder assignment dialog */}
      {folderEditSlug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="In Ordner ablegen"
            className="w-full max-w-sm rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                In Ordner ablegen
              </h3>
              <button
                onClick={() => setFolderEditSlug(null)}
                aria-label="Dialog schließen"
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <XCircle size={16} />
              </button>
            </div>
            <input
              type="text"
              value={folderEditValue}
              onChange={(e) => setFolderEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !folderSaving) {
                  void saveFolder(folderEditSlug, folderEditValue);
                }
              }}
              placeholder="Ordnername, z. B. Schriftsätze"
              list="matter-folder-suggestions"
              aria-label="Ordnername"
              autoFocus
              className="mb-3 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
            <datalist id="matter-folder-suggestions">
              {allFolders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <p className="mb-4 text-xs text-[color:var(--ds-text-muted)]">
              Unterordner mit „/“ anlegen, z. B. „Schriftsätze/Klagen“. Leer = kein Ordner.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFolderEditSlug(null)}
                disabled={folderSaving}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                disabled={folderSaving}
                onClick={() => void saveFolder(folderEditSlug, folderEditValue)}
              >
                {folderSaving ? "Speichern…" : "Speichern"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* WP-2.8: Ordner-Baum (echte Baum-Ansicht, „/" verschachtelt) */}
      {folderTreeOpen && allFolders.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
          <FolderTree
            nodes={folderTreeNodes}
            selected={folderFilter}
            onSelect={setFolderFilter}
            labels={{
              all: t("casesdetail.folder_all"),
              unfiled: t("casesdetail.folder_unfiled"),
              heading: t("casesdetail.folder_tree_toggle"),
              menu: t("casesdetail.folder_menu"),
              rename: t("casesdetail.folder_rename"),
              newSubfolder: t("casesdetail.folder_new_subfolder"),
            }}
            unfiledCount={unfiledCount}
            totalCount={caseData.documents.length}
            persistKey={caseData.slug}
            onDropDocument={caseData.status !== "archived" ? dropDocumentOnFolder : undefined}
            onRenameFolder={
              caseData.status !== "archived"
                ? (p) => setFolderRename({ path: p, value: p })
                : undefined
            }
            onCreateSubfolder={
              caseData.status !== "archived"
                ? (p) => setFolderCreate({ parent: p, value: "" })
                : undefined
            }
          />
        </div>
      )}

      {/* Ordner umbenennen (Prefix-Rename über alle Dokumente + Unterordner) */}
      {folderRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("casesdetail.folder_rename_title")}
            className="w-full max-w-sm rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("casesdetail.folder_rename_title")}
              </h3>
              <button
                onClick={() => setFolderRename(null)}
                disabled={folderBulkBusy}
                aria-label={t("casesdetail.folder_dialog_close")}
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <XCircle size={16} />
              </button>
            </div>
            <input
              type="text"
              value={folderRename.value}
              onChange={(e) =>
                setFolderRename((prev) => (prev ? { ...prev, value: e.target.value } : prev))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !folderBulkBusy) {
                  void renameFolder(folderRename.path, folderRename.value);
                }
                if (e.key === "Escape") setFolderRename(null);
              }}
              aria-label={t("casesdetail.folder_name")}
              autoFocus
              className="mb-3 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
            <p className="mb-4 text-xs text-[color:var(--ds-text-muted)]">
              {t("casesdetail.folder_rename_affects").replace(
                "{{count}}",
                String(
                  Object.values(docFolders).filter(
                    (f) => f === folderRename.path || f.startsWith(`${folderRename.path}/`)
                  ).length
                )
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFolderRename(null)}
                disabled={folderBulkBusy}
              >
                {t("casesdetail.folder_dialog_cancel")}
              </Button>
              <Button
                size="sm"
                disabled={folderBulkBusy}
                onClick={() => void renameFolder(folderRename.path, folderRename.value)}
              >
                {folderBulkBusy
                  ? t("casesdetail.folder_dialog_busy")
                  : t("casesdetail.folder_dialog_save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Neuen Unterordner anlegen (gepinnt bis erste Zuordnung) */}
      {folderCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("casesdetail.folder_new_sub_title")}
            className="w-full max-w-sm rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("casesdetail.folder_new_sub_title")}
              </h3>
              <button
                onClick={() => setFolderCreate(null)}
                aria-label={t("casesdetail.folder_dialog_close")}
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <XCircle size={16} />
              </button>
            </div>
            <input
              type="text"
              value={folderCreate.value}
              onChange={(e) =>
                setFolderCreate((prev) => (prev ? { ...prev, value: e.target.value } : prev))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") createSubfolder(folderCreate.parent, folderCreate.value);
                if (e.key === "Escape") setFolderCreate(null);
              }}
              placeholder={t("casesdetail.folder_name")}
              aria-label={t("casesdetail.folder_name")}
              autoFocus
              className="mb-3 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
            <p className="mb-4 text-xs text-[color:var(--ds-text-muted)]">
              {t("casesdetail.folder_new_sub_in").replace("{{name}}", folderCreate.parent)}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setFolderCreate(null)}>
                {t("casesdetail.folder_dialog_cancel")}
              </Button>
              <Button
                size="sm"
                onClick={() => createSubfolder(folderCreate.parent, folderCreate.value)}
              >
                {t("casesdetail.folder_dialog_save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document list */}
      {caseData.documents.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-6 text-center">
          <FileText size={30} className="mx-auto text-[color:var(--ds-border)]" />
          <p className="mt-2 text-sm font-medium text-[color:var(--ds-text)]">
            {t("cases.detail_doc_empty")}
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("casesdetail.doc_empty_desc")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {caseData.documents
            .filter(
              (d) =>
                (ctx.docTypeFilter === "all" ||
                  d.kind === ctx.docTypeFilter ||
                  d.doc_type === ctx.docTypeFilter) &&
                matchesFolder(d)
            )
            .map((doc) => (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Drag-Quelle für Ordner-Zuordnung; Tastatur-Nutzer ordnen über das Ordner-Bearbeiten-Feld pro Dokument zu.
              <div
                key={doc.id}
                draggable={caseData.status !== "archived" && Boolean(doc.slug)}
                onDragStart={(e) => {
                  if (!doc.slug) return;
                  e.dataTransfer.setData(FOLDER_DND_MIME, doc.slug);
                  e.dataTransfer.effectAllowed = "move";
                }}
                title={doc.slug ? t("casesdetail.folder_drag_hint") : undefined}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5"
              >
                <FileText size={16} className="brand-text shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-[color:var(--ds-text)]">{doc.name}</span>
                    {doc.kind && (
                      <Badge variant="accent" className="shrink-0 text-xs">
                        {doc.kind}
                      </Badge>
                    )}
                    {doc.doc_type_label && doc.doc_type && doc.doc_type !== "legal_document" && (
                      <Badge variant="info" className="shrink-0 text-xs">
                        {doc.doc_type_label}
                      </Badge>
                    )}
                    {(() => {
                      const jur = docJurisdictions[doc.slug || doc.url || ""];
                      if (!jur) return null;
                      return (
                        <Badge
                          variant="default"
                          className={`shrink-0 border text-xs ${
                            jur.unverified
                              ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                              : "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                          }`}
                          title={
                            jur.unverified
                              ? t("docstab.jurisdiction_unverified")
                              : jur.confidence !== undefined
                                ? `Confidence: ${Math.round(jur.confidence * 100)}%`
                                : undefined
                          }
                        >
                          {jur.jurisdiction.toUpperCase()}
                          {jur.unverified && " ⚠"}
                          {jur.confidence !== undefined && !jur.unverified && (
                            <span className="ml-0.5 opacity-60">
                              {Math.round(jur.confidence * 100)}%
                            </span>
                          )}
                        </Badge>
                      );
                    })()}
                    {doc.privileged && (
                      <Badge variant="warning" className="shrink-0 text-xs">
                        {t("docstab.privileged")}
                      </Badge>
                    )}
                    {docFolders[docKey(doc)] && (
                      <Badge variant="default" className="shrink-0 text-xs">
                        <FolderOpen size={10} className="mr-0.5" aria-hidden />
                        {docFolders[docKey(doc)]}
                      </Badge>
                    )}
                    {(() => {
                      const lock = docLocks[doc.slug || doc.url || ""];
                      if (!lock) return null;
                      return (
                        <Badge
                          variant="warning"
                          className="shrink-0 text-xs"
                          title={`Ausgecheckt seit ${new Date(lock.at).toLocaleString("de-AT")}`}
                        >
                          <Lock size={10} className="mr-0.5" aria-hidden />
                          {lock.userEmail || "ausgecheckt"}
                        </Badge>
                      );
                    })()}
                    {(() => {
                      // The page's own status wins over the list entry.
                      const fields = {
                        ...doc,
                        ...(doc.slug ? docStatuses[doc.slug] : undefined),
                      };
                      const ps = ctx.docProcessingStatus(fields);
                      const labelMap: Record<string, string> = {
                        confirmed: t("cases.detail_doc_status_confirmed"),
                        review_open: t("cases.detail_doc_status_review_open"),
                        analyzed: t("cases.detail_doc_status_analyzed"),
                        ocr_processing: t("cases.detail_doc_status_ocr_processing"),
                        ocr_needed: t("cases.detail_doc_status_ocr_needed"),
                        text_layer: t("cases.detail_doc_status_text_layer"),
                        uploaded: t("cases.detail_doc_status_uploaded"),
                        analysis_failed: "Analyse fehlgeschlagen",
                        analysis_retrying: "Analyse wird wiederholt",
                        analysis_permanently_failed: "Analyse dauerhaft fehlgeschlagen",
                        extraction_failed: t("docstab.extraction_failed"),
                        extraction_password: t("docstab.extraction_password"),
                        extraction_unsupported: t("docstab.extraction_unsupported"),
                        extraction_partial: partialLabel(fields),
                        processing: "Wird verarbeitet",
                      };
                      return (
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${ps.color}`}
                        >
                          {labelMap[ps.key] ?? ps.key}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {formatDate(doc.uploadedAt)}
                    {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    caseData?.status === "archived" ||
                    doc.privileged === true ||
                    !mayReleaseToClient
                  }
                  aria-pressed={doc.portal_visible === true}
                  onClick={() => {
                    const next = !(doc.portal_visible === true);
                    void ctx.saveCaseUpdate({
                      documents: caseData.documents.map((d) =>
                        d.id === doc.id ? { ...d, portal_visible: next } : d
                      ),
                    });
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-[background-color,border-color,color] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
                    doc.portal_visible === true
                      ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                      : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  )}
                  title={
                    doc.privileged === true
                      ? t("docstab.portal_blocked_privileged")
                      : !mayReleaseToClient
                        ? t("docstab.portal_release_lawyer_only")
                        : doc.portal_visible === true
                          ? t("docstab.portal_visible_hint")
                          : t("docstab.portal_hidden_hint")
                  }
                >
                  {doc.portal_visible === true ? <Eye size={12} /> : <EyeOff size={12} />}
                  {doc.portal_visible === true
                    ? t("docstab.portal_visible")
                    : t("docstab.portal_hidden")}
                </button>
                {(doc.slug || doc.url) && (
                  <Link
                    href={`/dashboard/brain/${encodeURIComponent(doc.slug || doc.url || "")}`}
                    className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] motion-reduce:transition-none"
                  >
                    {t("cases.detail_doc_open")}
                  </Link>
                )}
                {(doc.slug || doc.url) && (
                  <QesSignButton
                    documentSlug={doc.slug || doc.url || ""}
                    documentName={doc.name}
                    mimeType={doc.mime_type}
                    disabled={caseData?.status === "archived"}
                  />
                )}
                {(doc.slug || doc.url) && (
                  <a
                    href={`/api/files/${(doc.slug || doc.url || "").split("/").map(encodeURIComponent).join("/")}`}
                    className="hover:brand-text px-2 py-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] motion-reduce:transition-none"
                    title="Originaldatei herunterladen"
                    aria-label="Originaldatei herunterladen"
                  >
                    <Download size={14} />
                  </a>
                )}
                {(doc.slug || doc.url) && (
                  <button
                    disabled={caseData?.status === "archived"}
                    onClick={() => {
                      const k = docKey(doc);
                      setFolderEditSlug(k);
                      setFolderEditValue(docFolders[k] ?? "");
                    }}
                    className="text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
                    title="In Ordner ablegen"
                    aria-label={`${doc.name} in Ordner ablegen`}
                  >
                    <FolderOpen size={14} />
                  </button>
                )}
                <button
                  disabled={caseData?.status === "archived"}
                  onClick={async () => {
                    const docSlug = doc.slug || doc.url;
                    if (!docSlug || !caseData?.slug) return;
                    if (!isOnline()) {
                      addToast({
                        type: "error",
                        title: "Keine Verbindung",
                        description: "Dokumente können nur online aus der Akte entfernt werden.",
                      });
                      return;
                    }
                    const ok = await confirm({
                      title: "Aus Akte entfernen?",
                      message: `„${doc.name}" wird aus dieser Akte entfernt und kommt zur Zuordnung in den Posteingang. Das Dokument selbst wird nicht gelöscht.`,
                      confirmLabel: "Entfernen",
                      variant: "danger",
                    });
                    if (!ok) return;
                    // Removing a document from the wrong matter is a triage
                    // action, never a deletion: it leaves the matter's list
                    // (and its export) and can be reassigned from the inbox.
                    try {
                      const res = await csrfFetch("/api/cases/documents/detach", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ case_slug: caseData.slug, doc_slug: docSlug }),
                      });
                      if (!res.ok) {
                        // apiError: { error: "<deutscher Text>", code }
                        const payload = (await res.json().catch(() => ({}))) as {
                          error?: string;
                        };
                        throw new Error(payload.error ?? "");
                      }
                      addToast({ type: "success", title: "Dokument aus der Akte entfernt" });
                    } catch (err) {
                      addToast({
                        type: "error",
                        title: "Entfernen fehlgeschlagen",
                        description:
                          (err instanceof Error && err.message) ||
                          "Das Dokument ist weiterhin in der Akte. Bitte erneut versuchen.",
                      });
                    }
                    await ctx.refreshCaseData();
                  }}
                  className="text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-danger-text)] active:scale-[0.99] motion-reduce:transition-none"
                  title="Aus Akte entfernen und zur Zuordnung zurückgeben"
                  aria-label="Aus Akte entfernen und zur Zuordnung zurückgeben"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
