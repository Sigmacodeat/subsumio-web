"use client";

import { Loader2, FileText, Plus, Trash2, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import CommentThread from "@/components/legal/CommentThread";
import type { EvidenceFormData } from "@/lib/schemas/case-detail";

export function EvidenceTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const slug = ctx.slug;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Evidence Position Summary */}
      <div className="max-w-3xl space-y-4">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("cases.detail_evidence_position_title")}
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                {t("cases.detail_evidence_position_desc")}
              </p>
            </div>
            <Badge
              variant={ctx.evidenceSourceCount > 0 ? "success" : "warning"}
              className="shrink-0"
            >
              {ctx.evidenceSourceCount} {t("cases.detail_evidence_sources")}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <div className="text-xl font-semibold text-[color:var(--ds-text)]">
                {caseData.documents.length}
              </div>
              <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_evidence_metric_documents")}
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <div className="text-xl font-semibold text-[color:var(--ds-text)]">
                {ctx.evidenceDocuments.length}
              </div>
              <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_evidence_metric_relevant")}
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <div className="text-xl font-semibold text-[color:var(--ds-text)]">
                {ctx.evidenceList.length}
              </div>
              <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_evidence_metric_manual")}
              </div>
            </div>
          </div>
        </div>

        {/* AI Evidence Cards */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-blue-600" />
              <h3 className="text-sm font-semibold text-blue-600">
                {t("cases.detail_evidence_ai_title")}
              </h3>
            </div>
            <Badge
              variant="default"
              className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
            >
              {ctx.aiEvidenceCards.length}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("cases.detail_evidence_ai_desc")}
          </p>
          {ctx.aiEvidenceLoading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <Loader2 size={14} className="animate-spin" />
              {t("cases.detail_evidence_ai_loading")}
            </div>
          )}
          {!ctx.aiEvidenceLoading && ctx.aiEvidenceCards.length === 0 && (
            <p className="mt-3 text-xs text-[color:var(--ds-text-muted)]">
              {t("cases.detail_evidence_ai_empty")}
            </p>
          )}
          {!ctx.aiEvidenceLoading && ctx.aiEvidenceCards.length > 0 && (
            <div className="mt-3 space-y-3">
              {ctx.aiEvidenceCards.map((card, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <FileText size={14} className="shrink-0 text-blue-600" />
                    <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {card.docName}
                    </span>
                    {card.documentType && (
                      <Badge variant="accent" className="shrink-0 text-[10px]">
                        {card.documentType}
                      </Badge>
                    )}
                    {card.docSlug && (
                      <Link
                        href={`/dashboard/brain/${encodeURIComponent(card.docSlug)}`}
                        className="ml-auto text-xs text-blue-600 hover:underline"
                      >
                        {t("cases.detail_doc_open")}
                      </Link>
                    )}
                  </div>
                  {card.keyFacts.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                        {t("cases.detail_evidence_ai_keyfacts")}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {card.keyFacts.map((fact, j) => (
                          <li key={j} className="text-xs text-[color:var(--ds-text)]">
                            • {fact}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {card.parties.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                        {t("cases.detail_evidence_ai_parties")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {card.parties.map((p, j) => (
                          <span
                            key={j}
                            className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text)]"
                          >
                            {p.name}
                            {p.role && ` (${p.role})`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {card.evidenceRefs.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                        {t("cases.detail_evidence_ai_refs")}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {card.evidenceRefs.map((ref, j) => (
                          <li key={j} className="text-xs text-[color:var(--ds-text)]">
                            • {ref}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {card.citedStatutes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                        {t("cases.detail_evidence_ai_statutes")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {card.citedStatutes.map((s, j) => (
                          <span
                            key={j}
                            className="rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[10px] text-amber-700"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Evidence Documents */}
        {ctx.evidenceDocuments.length > 0 && (
          <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("cases.detail_evidence_documents_title")}
              </h3>
              <button
                onClick={() => ctx.navigateToTab("documents")}
                className="brand-text text-xs font-medium hover:underline"
              >
                {t("cases.detail_evidence_open_documents")}
              </button>
            </div>
            {ctx.evidenceDocuments.map((doc) => (
              <div
                key={doc.slug ?? doc.id}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2"
              >
                <FileText size={15} className="brand-text shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[color:var(--ds-text)]">{doc.name}</div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {doc.kind ?? t("cases.detail_ev_type_document")} ·{" "}
                    {new Date(doc.uploadedAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
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
              </div>
            ))}
          </div>
        )}

        {/* Manual Evidence */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("cases.detail_evidence_manual_title")}
            </h3>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {t("cases.detail_evidence_manual_desc")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={caseData?.status === "archived"}
            onClick={() => {
              if (ctx.showEvidenceForm || ctx.editingEvidenceIndex !== null) {
                ctx.setEditingEvidenceIndex(null);
                ctx.evidenceForm.reset({
                  title: "",
                  type: "",
                  description: "",
                  source: "",
                  weight: 0.5,
                });
                ctx.setShowEvidenceForm(false);
              } else {
                ctx.setShowEvidenceForm(true);
              }
            }}
            className="gap-1.5 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          >
            <Plus size={13} />
            {ctx.showEvidenceForm || ctx.editingEvidenceIndex !== null
              ? t("cases.detail_ev_cancel")
              : t("cases.detail_evidence_manual_add")}
          </Button>
        </div>

        {/* Evidence Form */}
        {(ctx.showEvidenceForm || ctx.editingEvidenceIndex !== null) && (
          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {ctx.editingEvidenceIndex !== null
                ? t("cases.detail_ev_edit")
                : t("cases.detail_ev_add")}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_ev_title")}
                </label>
                <input
                  {...ctx.evidenceForm.register("title")}
                  placeholder={t("cases.detail_ev_title_ph")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                {ctx.evidenceForm.formState.errors.title && (
                  <p className="mt-1 text-xs text-red-600">
                    {ctx.evidenceForm.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_ev_type")}
                </label>
                <select
                  {...ctx.evidenceForm.register("type")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="">{t("cases.detail_ev_type_ph")}</option>
                  <option value="Dokument">{t("cases.detail_ev_type_document")}</option>
                  <option value="Zeugnis">{t("cases.detail_ev_type_testimony")}</option>
                  <option value="Sachverständigengutachten">
                    {t("cases.detail_ev_type_expert")}
                  </option>
                  <option value="Vertrag">{t("cases.detail_ev_type_contract")}</option>
                  <option value="Fotos/Videos">{t("cases.detail_ev_type_media")}</option>
                  <option value="E-Mail/Schriftverkehr">{t("cases.detail_ev_type_email")}</option>
                  <option value="Sonstiges">{t("cases.detail_ev_type_other")}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_ev_description")}
              </label>
              <textarea
                {...ctx.evidenceForm.register("description")}
                rows={2}
                placeholder={t("cases.detail_ev_description_ph")}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_ev_source")}
                </label>
                {caseData.documents.length > 0 && (
                  <select
                    value={ctx.evidenceSourceMode}
                    onChange={(e) => {
                      const mode = e.target.value as "document" | "other";
                      ctx.setEvidenceSourceMode(mode);
                      if (mode === "document")
                        ctx.evidenceForm.setValue("source", "", { shouldDirty: true });
                    }}
                    className="mb-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="document">{t("cases.detail_ev_source_mode_document")}</option>
                    <option value="other">{t("cases.detail_ev_source_mode_other")}</option>
                  </select>
                )}
                {ctx.evidenceSourceMode === "document" && caseData.documents.length > 0 ? (
                  <select
                    {...ctx.evidenceForm.register("source")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="">{t("cases.detail_ev_source_select_ph")}</option>
                    {caseData.documents.map((doc) => (
                      <option key={doc.slug ?? doc.id} value={doc.name}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...ctx.evidenceForm.register("source")}
                    placeholder={t("cases.detail_ev_source_ph")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_ev_weight")} (
                  {Math.round((ctx.evidenceForm.watch("weight") ?? 0.5) * 100)}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  {...ctx.evidenceForm.register("weight", { valueAsNumber: true })}
                  className="w-full accent-[var(--brand-primary)]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={ctx.evidenceForm.handleSubmit(ctx.onEvidenceSubmit)}
              >
                <Plus size={14} />
                {ctx.editingEvidenceIndex !== null
                  ? t("cases.detail_ev_save")
                  : t("cases.detail_ev_add_btn")}
              </Button>
              {ctx.editingEvidenceIndex !== null && (
                <Button
                  variant="ghost"
                  className="text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  onClick={() => {
                    ctx.setEditingEvidenceIndex(null);
                    ctx.setShowEvidenceForm(false);
                    ctx.evidenceForm.reset({
                      title: "",
                      type: "",
                      description: "",
                      source: "",
                      weight: 0.5,
                    });
                  }}
                >
                  {t("cases.detail_ev_cancel")}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Evidence List */}
        {ctx.evidenceList.length === 0 ? (
          <div className="space-y-3 py-12 text-center">
            <ShieldAlert size={40} className="mx-auto text-[color:var(--ds-border)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("cases.detail_ev_empty")}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {t("cases.detail_ev_empty_hint")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {ctx.evidenceList.map((ev, i) => (
              <div
                key={i}
                className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {ev.type && (
                      <Badge
                        variant="default"
                        className="brand-soft brand-border/10 brand-text text-xs"
                      >
                        {ev.type}
                      </Badge>
                    )}
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {ev.title || t("cases.detail_ev_default_title")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={caseData?.status === "archived"}
                      onClick={() => {
                        ctx.setEditingEvidenceIndex(i);
                        ctx.setShowEvidenceForm(true);
                        ctx.evidenceForm.reset(ev as EvidenceFormData);
                      }}
                      className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                    >
                      {t("cases.detail_ev_edit_btn")}
                    </button>
                    <button
                      disabled={caseData?.status === "archived"}
                      onClick={() => {
                        const updated = ctx.evidenceList.filter((_, idx) => idx !== i);
                        ctx.setEvidenceList(updated);
                        ctx.saveCaseUpdate({ evidence: updated });
                      }}
                      className="px-2 py-1 text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {ev.description && (
                  <p className="mb-2 text-sm text-[color:var(--ds-text-muted)]">{ev.description}</p>
                )}
                <div className="flex items-center gap-3">
                  {ev.source && (
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_ev_source_label")} {ev.source}
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                          (ev.weight || 0) >= 0.7
                            ? "bg-emerald-500"
                            : (ev.weight || 0) >= 0.4
                              ? "bg-amber-500"
                              : "bg-red-500"
                        )}
                        style={{ width: `${Math.round((ev.weight || 0) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-right text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_ev_weight_label")} {Math.round((ev.weight || 0) * 100)}%
                    </div>
                  </div>
                </div>
                <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
                  <CommentThread
                    parentSlug={`${slug}/evidence/${i}`}
                    parentType="evidence"
                    currentUserId={ctx.currentUserId}
                    currentUserName={ctx.currentUserName}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
