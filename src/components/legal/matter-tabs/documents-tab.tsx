"use client";

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
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { isOnline } from "@/lib/offline-store";
import { UPLOAD_ACCEPT_ATTRIBUTE } from "@/lib/upload-formats";
import { csrfFetch } from "@/lib/csrf";
import { api } from "@/lib/api";

export function DocumentsTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Upload zone */}
      <div
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
          "rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center transition-colors focus:border-[color:var(--brand-primary)] focus:outline-none",
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
          <p className="mt-2 text-xs text-amber-600">{t("casesdetail.upload.offline_mode")}</p>
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
          <span className="brand-bg brand-bg inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors">
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
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none"
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
            className="mt-3 ml-2 inline-flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text)] transition-colors hover:border-[color:var(--ds-border-strong)] disabled:opacity-50"
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
            aria-label="Gesamtfortschritt Upload"
          >
            <div
              className="brand-bg h-full rounded-full transition-all"
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
                <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              ) : item.status === "error" ? (
                <XIcon size={16} className="shrink-0 text-red-500" />
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
                      "h-full rounded-full transition-all",
                      item.status === "error" ? "bg-red-500" : "brand-bg"
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.status === "error" && (
                  <div className="mt-1 text-xs text-red-600">{item.error}</div>
                )}
              </div>
              {item.status === "error" && (
                <button
                  onClick={() => ctx.setUploadQueue((q) => q.filter((i) => i.id !== item.id))}
                  className="text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                >
                  Entfernen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {ctx.uploadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {ctx.uploadError}
        </div>
      )}

      {ctx.offlinePendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700">
          <CloudUpload size={14} className="shrink-0" />
          <span>
            {ctx.offlinePendingCount}{" "}
            {lang === "en" ? "pending offline upload(s)" : t("casesdetail.upload.offline_queue")}
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
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
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
                if (e.target.value.trim().length > 2) {
                  ctx.setLinkSearching(true);
                  api.brain
                    .search(e.target.value, 10)
                    .then((results) => {
                      ctx.setLinkSearchResults(results);
                      ctx.setLinkSearching(false);
                    })
                    .catch(() => ctx.setLinkSearching(false));
                } else {
                  ctx.setLinkSearchResults([]);
                }
              }}
              placeholder={t("casesdetail.search_placeholder")}
              className="mb-3 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
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
                              },
                              merge: true,
                            }),
                          });
                          await ctx.refreshCaseData();
                          ctx.setShowLinkDialog(false);
                          ctx.setLinkSearchQuery("");
                          ctx.setLinkSearchResults([]);
                        } catch (err) {
                          ctx.setUploadError(
                            err instanceof Error ? err.message : t("casesdetail.link_failed")
                          );
                        }
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${alreadyLinked ? "cursor-not-allowed border-[color:var(--ds-border)] opacity-50" : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5"}`}
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
                ctx.docTypeFilter === "all" ||
                d.kind === ctx.docTypeFilter ||
                d.doc_type === ctx.docTypeFilter
            )
            .map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5"
              >
                <FileText size={16} className="brand-text shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-[color:var(--ds-text)]">{doc.name}</span>
                    {doc.kind && (
                      <Badge variant="accent" className="shrink-0 text-[10px]">
                        {doc.kind}
                      </Badge>
                    )}
                    {doc.doc_type_label && doc.doc_type && doc.doc_type !== "legal_document" && (
                      <Badge variant="info" className="shrink-0 text-[10px]">
                        {doc.doc_type_label}
                      </Badge>
                    )}
                    {doc.privileged && (
                      <Badge variant="warning" className="shrink-0 text-[10px]">
                        {lang === "en" ? "Privileged" : "Privilegiert"}
                      </Badge>
                    )}
                    {(() => {
                      const ps = ctx.docProcessingStatus(doc);
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
                        extraction_failed:
                          lang === "en" ? "Extraction failed" : "Extraktion fehlgeschlagen",
                        extraction_password:
                          lang === "en"
                            ? "Password required — re-upload"
                            : "Passwort nötig — neu hochladen",
                        extraction_unsupported:
                          lang === "en" ? "Unsupported format" : "Format nicht unterstützt",
                      };
                      return (
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${ps.color}`}
                        >
                          {labelMap[ps.key] ?? ps.key}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(doc.uploadedAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                    {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ""}
                  </div>
                </div>
                {(doc.slug || doc.url) && (
                  <Link
                    href={`/dashboard/brain/${encodeURIComponent(doc.slug || doc.url || "")}`}
                    className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                  >
                    {t("cases.detail_doc_open")}
                  </Link>
                )}
                {(doc.slug || doc.url) && (
                  <a
                    href={`/api/files/${(doc.slug || doc.url || "").split("/").map(encodeURIComponent).join("/")}`}
                    className="hover:brand-text px-2 py-1 text-[color:var(--ds-text-muted)] transition-colors"
                    title="Originaldatei herunterladen"
                    aria-label="Originaldatei herunterladen"
                  >
                    <Download size={14} />
                  </a>
                )}
                <button
                  disabled={caseData?.status === "archived"}
                  onClick={async () => {
                    const docSlug = doc.slug || doc.url;
                    if (docSlug && isOnline()) {
                      try {
                        const docSlugPath = docSlug.split("/").map(encodeURIComponent).join("/");
                        await csrfFetch(`/api/pages/${docSlugPath}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            frontmatter: {
                              case_slug: null,
                              assignment_status: "unassigned",
                              tombstoned_at: new Date().toISOString(),
                            },
                            merge: true,
                          }),
                        });
                      } catch {
                        /* best effort */
                      }
                    }
                    await ctx.refreshCaseData();
                  }}
                  className="text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
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
