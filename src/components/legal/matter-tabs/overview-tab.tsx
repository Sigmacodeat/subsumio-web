"use client";

import { useState, useRef, useEffect } from "react";
import {
  Loader2,
  Lightbulb,
  ChevronRight,
  Mail,
  PenTool,
  Scale,
  Plus,
  X,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
  Check,
  Copy,
  Trash2,
  MoreHorizontal,
  Briefcase,
  Link2,
  Building2,
  Users,
  Hourglass,
  XCircle as XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail, STATUS_CONFIG } from "@/lib/matter-detail-context";
import { CitationLink, parseCitations } from "@/components/legal/CitationLink";
import {
  ContactCreateDialog,
  type ContactCreateResult,
} from "@/components/legal/ContactCreateDialog";
import { CaseOverviewWidgets } from "@/components/legal/CaseOverviewWidgets";
import { EmailComposeDialog } from "@/components/legal/EmailComposeDialog";
import { DocuSignSendDialog } from "@/components/legal/DocuSignSendDialog";
import {
  validateTransition,
  getAllowedTransitions,
  transitionDescription,
  STATUS_LABELS_DE,
  type CaseStatus,
} from "@/lib/case-status";
import { csrfFetch } from "@/lib/csrf";
import { api } from "@/lib/api";
import type { DashboardKey } from "@/content/dashboard";
import type { CaseDetail } from "@/lib/matter-detail-types";
import { MatterWorkflowCockpit } from "@/components/legal/MatterWorkflowCockpit";
import { VerjaehrungPanel } from "@/components/legal/VerjaehrungPanel";

export function OverviewTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);

  // Close "More actions" on outside click
  useEffect(() => {
    if (!moreActionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as Node)) {
        setMoreActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreActionsOpen]);

  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Quick actions bar — max 3 primary + "More" dropdown (Hick's Law) */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary action 1: AI Strategy */}
        <Button
          variant="primary"
          className="brand-bg gap-2 text-sm text-white"
          onClick={() => {
            ctx.navigateToTab("strategy");
            ctx.setQuery(t("cases.detail_qb_strategy"));
          }}
        >
          <Lightbulb size={14} />
          {t("cases.detail_btn_strategy")}
        </Button>
        {/* Primary action 2: Status Change */}
        <Button
          variant="secondary"
          disabled={ctx.userRole !== "admin" && ctx.userRole !== "lawyer"}
          className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          onClick={() => ctx.setShowStatusDialog(true)}
        >
          <ChevronRight size={14} />
          {t("cases.detail_btn_status_change")}
        </Button>
        {/* Primary action 3: Email */}
        <Button
          variant="secondary"
          className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          onClick={() => ctx.setShowEmailDialog(true)}
        >
          <Mail size={14} />
          {t("email.compose_title")}
        </Button>

        {/* More actions dropdown — secondary actions (Progressive Disclosure) */}
        <div className="relative ml-auto" ref={moreActionsRef}>
          <button
            onClick={() => setMoreActionsOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors md:text-sm",
              moreActionsOpen
                ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            )}
          >
            <MoreHorizontal size={14} className="shrink-0" />
            <span className="hidden sm:inline">{t("overviewtab.more")}</span>
          </button>
          {moreActionsOpen && (
            <div className="absolute top-full right-0 mt-1 min-w-[200px] rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-1 shadow-lg">
              {/* Assess Chances → Strategy tab */}
              <button
                onClick={() => {
                  ctx.navigateToTab("strategy");
                  ctx.setQuery(t("cases.detail_qb_chances"));
                  setMoreActionsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:text-sm"
              >
                <Scale size={14} className="shrink-0" />
                {t("cases.detail_btn_assess")}
              </button>
              {/* DocuSign → open DocuSign send dialog */}
              <button
                disabled={caseData?.status === "archived"}
                onClick={() => {
                  ctx.setShowDocuSignDialog(true);
                  setMoreActionsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:text-sm"
              >
                <PenTool size={14} className="shrink-0" />
                {t("docusign.send_title")}
              </button>
              {/* Portal toggle (admin/lawyer only) */}
              {(ctx.userRole === "admin" || ctx.userRole === "lawyer") && (
                <button
                  disabled={caseData.status === "archived"}
                  onClick={() => {
                    const updated = { ...caseData, portalEnabled: !caseData.portalEnabled };
                    ctx.setCaseData(updated);
                    ctx.saveCaseUpdate({ ...updated });
                    setMoreActionsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors md:text-sm",
                    caseData.portalEnabled
                      ? "text-[color:var(--ds-success-text)] hover:bg-[color:var(--ds-success-bg)]"
                      : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  )}
                >
                  <Sparkles size={14} className="shrink-0" />
                  {caseData.portalEnabled
                    ? t("cases.detail_btn_portal_enabled")
                    : t("cases.detail_btn_portal_enable")}
                </button>
              )}
              {/* Portal link copy (if enabled) */}
              {(ctx.userRole === "admin" || ctx.userRole === "lawyer") &&
                caseData.portalEnabled && (
                  <button
                    onClick={async () => {
                      ctx.setGeneratingPortal(true);
                      try {
                        const res = await csrfFetch("/api/portal/generate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ caseSlug: caseData.slug }),
                        });
                        const data = await res.json();
                        if (res.ok && data.url) {
                          const fullUrl = `${window.location.origin}${data.url}`;
                          ctx.setPortalUrl(fullUrl);
                          await navigator.clipboard.writeText(fullUrl);
                          ctx.setCopied(true);
                          setTimeout(() => ctx.setCopied(false), 2000);
                        } else {
                          ctx.setSaveError(t("cases.detail_portal_error"));
                        }
                      } catch (err) {
                        console.error(
                          "[portal] generate failed:",
                          err instanceof Error ? err.message : String(err)
                        );
                        ctx.setSaveError(t("cases.detail_portal_error"));
                      } finally {
                        ctx.setGeneratingPortal(false);
                      }
                      setMoreActionsOpen(false);
                    }}
                    disabled={ctx.generatingPortal}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:text-sm"
                  >
                    {ctx.generatingPortal ? (
                      <Loader2 size={14} className="shrink-0 animate-spin" />
                    ) : (
                      <Copy size={14} className="shrink-0" />
                    )}
                    {ctx.generatingPortal
                      ? t("cases.detail_btn_portal_generating")
                      : ctx.copied
                        ? t("cases.detail_btn_portal_copied")
                        : t("cases.detail_btn_portal_link")}
                  </button>
                )}
            </div>
          )}
        </div>
      </div>

      <MatterWorkflowCockpit />

      <VerjaehrungPanel caseSlug={caseData.slug} />

      {/* Status Change Dialog */}
      {ctx.showStatusDialog && (
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("cases.detail_status_dialog_title")}
            </h3>
            <button
              onClick={() => {
                ctx.setShowStatusDialog(false);
                ctx.setStatusError(null);
                ctx.setPendingStatus(null);
              }}
              className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              {t("cases.detail_status_dialog_cancel")}
            </button>
          </div>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {t("cases.detail_status_current")}{" "}
            <span className="font-semibold">
              {STATUS_LABELS_DE[caseData.status as CaseStatus] ?? caseData.status}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {getAllowedTransitions(caseData.status as CaseStatus).map((target) => {
              const cfg = STATUS_CONFIG[target];
              const Icon = cfg?.icon ?? ChevronRight;
              return (
                <button
                  key={target}
                  onClick={() => {
                    const result = validateTransition(caseData.status as CaseStatus, target);
                    if (result.allowed) {
                      ctx.setPendingStatus(target);
                      ctx.setStatusError(null);
                    } else {
                      ctx.setStatusError(
                        result.reason || t("cases.detail_status_transition_not_allowed")
                      );
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    ctx.pendingStatus === target
                      ? "brand-bg border-transparent text-white"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-text)]"
                  )}
                >
                  <Icon size={12} />
                  {cfg ? t(cfg.labelKey as DashboardKey) : (STATUS_LABELS_DE[target] ?? target)}
                </button>
              );
            })}
          </div>
          {ctx.statusError && (
            <p className="flex items-center gap-1.5 text-xs text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={12} />
              {ctx.statusError}
            </p>
          )}
          {ctx.pendingStatus && (
            <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] pt-2">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {transitionDescription(caseData.status as CaseStatus, ctx.pendingStatus)}
              </p>
              <Button
                variant="primary"
                className="brand-bg gap-1.5 text-xs text-white"
                onClick={() => {
                  if (caseData.status === "archived") {
                    ctx.setShowStatusDialog(false);
                    ctx.setStatusError(null);
                    void ctx.handleRestore(ctx.pendingStatus ?? undefined);
                    ctx.setPendingStatus(null);
                  } else {
                    const updated = { ...caseData, status: ctx.pendingStatus ?? caseData.status };
                    ctx.setCaseData(updated);
                    ctx.saveCaseUpdate(updated);
                    ctx.setShowStatusDialog(false);
                    ctx.setPendingStatus(null);
                    ctx.setStatusError(null);
                  }
                }}
              >
                <Check size={12} />
                {t("cases.detail_status_confirm")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Portal link display */}
      {ctx.portalUrl && (ctx.userRole === "admin" || ctx.userRole === "lawyer") && (
        <div className="space-y-2 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-3">
          <p className="mb-1 text-xs font-medium text-[color:var(--ds-success-text)]">
            {t("cases.detail_portal_valid")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs break-all text-[color:var(--ds-text-muted)]">
              {ctx.portalUrl}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(ctx.portalUrl!);
                ctx.setCopied(true);
                setTimeout(() => ctx.setCopied(false), 2000);
              }}
              className="brand-text shrink-0 text-xs hover:underline"
            >
              {ctx.copied ? t("cases.detail_portal_copied") : t("cases.detail_portal_copy")}
            </button>
            <button
              onClick={async () => {
                const token = ctx.portalUrl!.split("/portal/")[1];
                if (!token) return;
                try {
                  const res = await csrfFetch("/api/portal/revoke", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                  });
                  if (res.ok) {
                    ctx.setPortalUrl(null);
                    ctx.setSaveError(null);
                  } else {
                    ctx.setSaveError(t("cases.detail_portal_revoke_error"));
                  }
                } catch {
                  ctx.setSaveError(t("cases.detail_portal_revoke_error"));
                }
              }}
              className="shrink-0 text-xs text-[color:var(--ds-danger-text)] hover:underline"
            >
              {t("cases.detail_portal_revoke")}
            </button>
          </div>
        </div>
      )}

      {/* Stammdaten — Kontakte verknüpfen */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("cases.detail_stammdaten")}
        </h3>
        {ctx.contactConflict && (
          <div
            role="alert"
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs",
              ctx.contactConflict.severity === "critical"
                ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
            )}
          >
            {ctx.contactConflict.severity === "critical" ? (
              <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">{ctx.contactConflict.warning}</p>
              {ctx.contactConflict.hits.slice(0, 3).map((hit, i) => (
                <p key={i} className="opacity-90">
                  {hit.reason}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* B4: KI-extrahierte Parteien-Vorschläge */}
        {caseData.suggestedParties && caseData.suggestedParties.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--ds-text)]">
              <Sparkles size={12} className="text-[color:var(--ds-warning-text)]" />
              {t("casesdetail.ai_parties")}
            </div>
            {caseData.suggestedParties
              .map((sp, originalIndex) => ({ sp, originalIndex }))
              .filter(({ sp }) => !sp.confirmed)
              .map(({ sp, originalIndex }) => (
                <div
                  key={originalIndex}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-[color:var(--ds-text)]">{sp.name}</span>
                    <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
                      {sp.role} · Quelle: {sp.source}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="border-[color:var(--ds-success-border)] text-xs text-[color:var(--ds-success-text)] hover:bg-[color:var(--ds-success-bg)]"
                      onClick={() => {
                        ctx.setContactDialogRole(
                          sp.role === "Kläger" ||
                            sp.role === "Mandant" ||
                            sp.role === "Klient" ||
                            sp.role === "client"
                            ? "client"
                            : sp.role === "Beklagter" ||
                                sp.role === "Gegner" ||
                                sp.role === "opponent"
                              ? "opponent"
                              : sp.role === "Gericht" ||
                                  sp.role === "Behörde" ||
                                  sp.role === "court" ||
                                  sp.role === "authority"
                                ? "court"
                                : "other"
                        );
                        ctx.setContactDialogName(sp.name);
                        ctx.setContactDialogOpen(true);
                        ctx.setPendingSuggestedPartyIndex(originalIndex);
                      }}
                    >
                      <Plus size={12} /> Als Kontakt
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                      onClick={() => ctx.confirmSuggestedParty(originalIndex, false)}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Client */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_client")}
              </label>
              <button
                type="button"
                onClick={() => {
                  ctx.setContactDialogRole("client");
                  ctx.setContactDialogName(caseData.clientName);
                  ctx.setContactDialogOpen(true);
                  ctx.setPendingSuggestedPartyIndex(null);
                }}
                className="brand-text flex items-center gap-0.5 text-xs hover:underline"
                aria-label="Neuen Mandanten erstellen"
              >
                <Plus size={12} /> erstellen
              </button>
            </div>
            <select
              value={caseData.clientSlug || ""}
              onChange={(e) => {
                const selected = ctx.contacts.find((c) => c.slug === e.target.value);
                const updated: CaseDetail = {
                  ...caseData,
                  clientSlug: e.target.value || undefined,
                  clientName: selected?.name ?? caseData.clientName,
                };
                ctx.setCaseData(updated);
                ctx.saveCaseUpdate({
                  clientSlug: updated.clientSlug,
                  clientName: updated.clientName,
                });
              }}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              <option value="">{t("cases.detail_select_placeholder")}</option>
              {ctx.contacts
                .filter((c) => c.role === "client")
                .map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          {/* Opponent */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_opponent")}
              </label>
              <button
                type="button"
                onClick={() => {
                  ctx.setContactDialogRole("opponent");
                  ctx.setContactDialogName(caseData.opponentName);
                  ctx.setContactDialogOpen(true);
                  ctx.setPendingSuggestedPartyIndex(null);
                }}
                className="brand-text flex items-center gap-0.5 text-xs hover:underline"
                aria-label="Neuen Gegner erstellen"
              >
                <Plus size={12} /> erstellen
              </button>
            </div>
            <select
              value={(caseData.opponentSlugs ?? [])[0] || ""}
              onChange={(e) => {
                const selected = ctx.contacts.find((c) => c.slug === e.target.value);
                const slugs = e.target.value ? [e.target.value] : undefined;
                const updated: CaseDetail = {
                  ...caseData,
                  opponentSlugs: slugs,
                  opponentName: selected?.name ?? caseData.opponentName,
                };
                ctx.setCaseData(updated);
                ctx.saveCaseUpdate({
                  opponentSlugs: updated.opponentSlugs,
                  opponentName: updated.opponentName,
                });
              }}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              <option value="">{t("cases.detail_select_placeholder")}</option>
              {ctx.contacts
                .filter((c) => c.role === "opponent")
                .map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          {/* Court */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_court")}
              </label>
              <button
                type="button"
                onClick={() => {
                  ctx.setContactDialogRole("court");
                  ctx.setContactDialogName(caseData.courtName);
                  ctx.setContactDialogOpen(true);
                  ctx.setPendingSuggestedPartyIndex(null);
                }}
                className="brand-text flex items-center gap-0.5 text-xs hover:underline"
                aria-label="Neues Gericht erstellen"
              >
                <Plus size={12} /> erstellen
              </button>
            </div>
            <select
              value={caseData.courtSlug || ""}
              onChange={(e) => {
                const selected = ctx.contacts.find((c) => c.slug === e.target.value);
                const updated: CaseDetail = {
                  ...caseData,
                  courtSlug: e.target.value || undefined,
                  courtName: selected?.name ?? caseData.courtName,
                };
                ctx.setCaseData(updated);
                ctx.saveCaseUpdate({ courtSlug: updated.courtSlug, courtName: updated.courtName });
              }}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              <option value="">{t("cases.detail_select_placeholder")}</option>
              {ctx.contacts
                .filter((c) => c.role === "court")
                .map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        {ctx.contactsLoading && (
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {t("cases.detail_contacts_loading")}
          </p>
        )}
        {ctx.contacts.length === 0 && !ctx.contactsLoading && (
          <p className="text-xs text-[color:var(--ds-warning-text)]">
            {t("cases.detail_no_contacts")}{" "}
            <Link href="/dashboard/contacts" className="brand-text hover:underline">
              {t("cases.detail_create_contact")}
            </Link>
          </p>
        )}
      </div>

      {/* Inline contact creation dialog */}
      <ContactCreateDialog
        open={ctx.contactDialogOpen}
        onOpenChange={(open) => {
          ctx.setContactDialogOpen(open);
          if (!open) ctx.setPendingSuggestedPartyIndex(null);
        }}
        defaultRole={ctx.contactDialogRole}
        defaultName={ctx.contactDialogName}
        existingContacts={ctx.contacts}
        onCreated={(contact: ContactCreateResult) => {
          // Add to contacts list
          ctx.setContactsList((prev) => [
            ...prev,
            {
              slug: contact.slug,
              name: contact.name,
              role: contact.role,
              email: contact.email,
              phone: contact.phone,
            },
          ]);
          // B4: Confirm the suggested party if one was pending
          if (ctx.pendingSuggestedPartyIndex !== null) {
            ctx.confirmSuggestedParty(ctx.pendingSuggestedPartyIndex, true);
            ctx.setPendingSuggestedPartyIndex(null);
          }
          // Assign to case based on role
          if (contact.role === "client") {
            const updated: CaseDetail = {
              ...caseData,
              clientSlug: contact.slug,
              clientName: contact.name,
            };
            ctx.setCaseData(updated);
            ctx.saveCaseUpdate({ clientSlug: updated.clientSlug, clientName: updated.clientName });
          } else if (contact.role === "opponent") {
            const updated: CaseDetail = {
              ...caseData,
              opponentSlugs: [contact.slug],
              opponentName: contact.name,
            };
            ctx.setCaseData(updated);
            ctx.saveCaseUpdate({
              opponentSlugs: updated.opponentSlugs,
              opponentName: updated.opponentName,
            });
          } else if (contact.role === "court") {
            const updated: CaseDetail = {
              ...caseData,
              courtSlug: contact.slug,
              courtName: contact.name,
            };
            ctx.setCaseData(updated);
            ctx.saveCaseUpdate({ courtSlug: updated.courtSlug, courtName: updated.courtName });
          }
        }}
      />

      {/* Facts */}
      {caseData.facts && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
            {t("cases.detail_facts")}
          </h3>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
            {parseCitations(caseData.facts).map((segment, i) =>
              segment.isCitation ? (
                <CitationLink key={i} citation={segment.text} />
              ) : (
                <span key={i}>{segment.text}</span>
              )
            )}
          </div>
        </div>
      )}

      {/* Claims */}
      {caseData.claims.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
            {t("cases.detail_claims")}
          </h3>
          <ul className="space-y-1.5">
            {caseData.claims.map((claim, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
              >
                <span className="brand-text mt-0.5">•</span>
                {claim}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Defenses */}
      {caseData.defenses.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
            {t("cases.detail_defenses")}
          </h3>
          <ul className="space-y-1.5">
            {caseData.defenses.map((def, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
              >
                <span className="mt-0.5 text-[color:var(--ds-success-text)]">•</span>
                {def}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strategy */}
      <div className="brand-border brand-soft rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="brand-text text-sm font-semibold">{t("cases.detail_strategy")}</h3>
          <Button
            size="sm"
            variant="ghost"
            disabled={caseData?.status === "archived" || ctx.strategyLoading}
            onClick={async () => {
              if (!caseData) return;
              ctx.setStrategyLoading(true);
              try {
                const result = await api.legal.caseStrategy(caseData.slug);
                ctx.setCaseData({
                  ...caseData,
                  strategy: {
                    summary: result.summary,
                    recommended: result.recommended,
                    recommendedApproach: result.recommendedApproach,
                    risks: result.risks.map((r) => ({
                      description: r.description,
                      probability: r.probability,
                      impact: r.impact,
                    })),
                    generatedAt: result.generatedAt,
                  },
                });
              } catch (err) {
                ctx.setSaveError(
                  err instanceof Error ? err.message : "Strategie-Generierung fehlgeschlagen"
                );
              } finally {
                ctx.setStrategyLoading(false);
              }
            }}
            className="text-xs"
          >
            {ctx.strategyLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            {caseData?.strategy ? "Neu generieren" : "Strategie generieren"}
          </Button>
        </div>
        {caseData?.strategy ? (
          <>
            <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
              {caseData.strategy.recommended}
            </p>
            {caseData.strategy.recommendedApproach && (
              <p className="mb-3 text-xs text-[color:var(--ds-text-muted)]">
                {caseData.strategy.recommendedApproach}
              </p>
            )}
            {caseData.strategy.risks && caseData.strategy.risks.length > 0 && (
              <div className="mt-3">
                <h4 className="mb-1 text-xs font-semibold text-[color:var(--ds-danger-text)]">
                  {t("cases.detail_risks")}
                </h4>
                <ul className="space-y-1">
                  {(caseData.strategy.risks ?? []).map((r, i) => (
                    <li key={i} className="text-xs text-[color:var(--ds-text-muted)]">
                      • {r.description} ({r.probability} / {r.impact})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Noch keine Strategie generiert. Klicke auf &ldquo;Strategie generieren&rdquo; für eine
            KI-gestützte Empfehlung.
          </p>
        )}
      </div>

      {/* Expenses (Auslagen) */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("cases.detail_exp_title")}
        </h3>
        <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_130px_auto_auto]">
          <input
            {...ctx.expenseForm.register("description")}
            placeholder={t("cases.detail_exp_desc_ph")}
            aria-label={t("cases.expense")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          <input
            {...ctx.expenseForm.register("amount")}
            type="number"
            step="0.01"
            placeholder={t("cases.detail_exp_amount_ph")}
            aria-label={t("cases.amount")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-[color:var(--ds-text-muted)]">
            <input
              type="checkbox"
              {...ctx.expenseForm.register("billable")}
              className="accent-[var(--brand-primary)]"
            />
            {t("cases.detail_exp_billable")}
          </label>
          <Button
            variant="primary"
            disabled={caseData?.status === "archived"}
            className="brand-bg brand-bg gap-2 text-sm text-white"
            onClick={ctx.expenseForm.handleSubmit(ctx.onExpenseSubmit)}
          >
            <Plus size={14} />
            {t("cases.detail_exp_add")}
          </Button>
        </div>
        {ctx.expensesList.length > 0 && (
          <div className="space-y-2 border-t border-[color:var(--ds-border)] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("cases.detail_exp_total")}{" "}
                {ctx.expensesList.reduce((s, e) => s + e.amount, 0).toFixed(2)} €
              </span>
            </div>
            {ctx.expensesList.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] py-2 last:border-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[color:var(--ds-text)]">{entry.description}</span>
                    {entry.billed && (
                      <Badge variant="success" className="text-xs">
                        {t("cases.detail_exp_billed")}
                      </Badge>
                    )}
                    {entry.billable === false && (
                      <Badge variant="warning" className="text-xs">
                        {t("cases.detail_exp_internal")}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(entry.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                    {entry.invoice_number ? ` · ${entry.invoice_number}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-sm text-[color:var(--ds-text-muted)]">
                    {entry.amount.toFixed(2)} €
                  </span>
                  {!entry.billed && (
                    <button
                      disabled={caseData?.status === "archived"}
                      onClick={() => {
                        const updated = ctx.expensesList.filter((e) => e.id !== entry.id);
                        ctx.setExpensesList(updated);
                        ctx.saveCaseUpdate({ expenses: updated });
                      }}
                      className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
                      title={t("cases.detail_exp_delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verjährungs-Scan (Limitation Scanner) — highest liability risk */}
      <VerjaehrungsScanCard caseSlug={caseData.slug} lang={lang as "de" | "en"} />

      {/* Contradictions */}
      {caseData.contradictions && caseData.contradictions.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-[color:var(--ds-warning-text)]" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-warning-text)]">
              Widersprüche erkannt ({caseData.contradictions.length})
            </h3>
          </div>
          <div className="space-y-2">
            {caseData.contradictions.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant={c.severity === "high" ? "danger" : "warning"} className="text-xs">
                    {c.severity}
                  </Badge>
                  <span className="text-xs font-medium text-[color:var(--ds-text)]">{c.field}</span>
                </div>
                <p className="text-xs text-[color:var(--ds-text-muted)]">{c.description}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                  <span className="truncate">{c.value_a}</span>
                  <span className="shrink-0 text-[color:var(--ds-warning-text)]">vs</span>
                  <span className="truncate">{c.value_b}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {caseData.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {caseData.tags.map((tag) => (
            <Badge
              key={tag}
              variant="default"
              className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Mandat & Related Cases (Phase B3) */}
      {(caseData.mandateId ||
        (caseData.relatedCaseSlugs && caseData.relatedCaseSlugs.length > 0)) && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Link2 size={14} className="brand-text" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {lang === "en" ? "Mandate & Related Cases" : "Mandat & Verknüpfte Akten"}
            </h3>
          </div>
          {caseData.mandateId && (
            <div className="mb-3 flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <span className="font-medium text-[color:var(--ds-text)]">
                {lang === "en" ? "Mandate ID:" : "Mandats-ID:"}
              </span>
              <code className="rounded bg-[color:var(--ds-hover)] px-2 py-0.5 font-mono text-xs">
                {caseData.mandateId}
              </code>
            </div>
          )}
          {caseData.relatedCaseSlugs && caseData.relatedCaseSlugs.length > 0 && (
            <div className="space-y-1.5">
              {caseData.relatedCaseSlugs.map((slug) => (
                <Link
                  key={slug}
                  href={`/dashboard/cases/${slug.split("/").map(encodeURIComponent).join("/")}`}
                  className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-2 text-sm transition-colors hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-active)]"
                >
                  <Briefcase size={14} className="text-[color:var(--ds-text-muted)]" />
                  <span className="font-mono text-xs text-[color:var(--ds-text)]">{slug}</span>
                  <ChevronRight size={14} className="ml-auto text-[color:var(--ds-text-subtle)]" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Additional Opponents (Phase A) */}
      {caseData.additionalOpponents && caseData.additionalOpponents.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={14} className="brand-text" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {lang === "en" ? "Additional Opponents" : "Zusätzliche Gegner"}
            </h3>
          </div>
          <div className="space-y-2">
            {caseData.additionalOpponents.map((opp, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[color:var(--ds-text)]">{opp.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge variant="default" className="text-xs">
                      {opp.rolle}
                    </Badge>
                    {opp.verfahrensschiene && (
                      <Badge
                        variant="default"
                        className="text-xs text-[color:var(--ds-text-muted)]"
                      >
                        {opp.verfahrensschiene}
                      </Badge>
                    )}
                  </div>
                  {opp.haftungsgrund && (
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {opp.haftungsgrund}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Institutionen-Checkliste (Phase D2) */}
      <InstitutionChecklistCard caseSlug={caseData.slug} lang={lang as "de" | "en"} />

      {/* Overview widgets */}
      <CaseOverviewWidgets
        caseData={caseData}
        onTabChange={(tab: string) => ctx.navigateToTab(tab)}
      />

      {/* Email Dialog */}
      {ctx.showEmailDialog && (
        <EmailComposeDialog
          open={ctx.showEmailDialog}
          onOpenChange={ctx.setShowEmailDialog}
          caseSlug={caseData?.slug}
          caseNumber={caseData?.caseNumber}
        />
      )}

      {/* DocuSign Dialog */}
      {ctx.showDocuSignDialog && (
        <DocuSignSendDialog
          open={ctx.showDocuSignDialog}
          onOpenChange={ctx.setShowDocuSignDialog}
          caseSlug={caseData?.slug}
          caseTitle={caseData?.title}
          documents={
            caseData?.documents?.map((d) => ({
              name: d.name || "Dokument",
              slug: d.slug || "",
              url: d.url,
            })) ?? []
          }
        />
      )}
    </div>
  );
}

// ── Verjährungs-Scan Card (Layer 5l output) ────────────────────

interface VerjaehrungsAnspruch {
  anspruch?: string;
  gegner?: string;
  restzeit_tage?: number;
  handlungsbedarf?: string;
  paragraph?: string;
  anspruchshoehe?: number;
  verjaehrungsfrist_jahre?: number;
  beginn?: string;
  frist_ende?: string;
  verjaehrt?: boolean;
  hemmung?: boolean;
  hemmung_grund?: string | null;
  grund?: string;
}

function VerjaehrungsScanCard({ caseSlug, lang }: { caseSlug: string; lang: "de" | "en" }) {
  const [data, setData] = useState<{
    score: number;
    urgent: VerjaehrungsAnspruch[];
    verjaehrte: VerjaehrungsAnspruch[];
    ansprueche: VerjaehrungsAnspruch[];
    empfehlung: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const page = await api.brain.getPage(`limitation-scan/${caseSlug}`);
        if (cancelled) return;
        if (!page) {
          setData(null);
          return;
        }
        const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
        const score =
          typeof fm.verjaehrung_risiko_score === "number" ? fm.verjaehrung_risiko_score : 0;

        const parseArr = (raw: unknown): VerjaehrungsAnspruch[] => {
          if (Array.isArray(raw)) return raw as VerjaehrungsAnspruch[];
          if (typeof raw === "string") {
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? (parsed as VerjaehrungsAnspruch[]) : [];
            } catch {
              return [];
            }
          }
          return [];
        };

        const urgent = parseArr(fm.urgent_ansprueche);
        const verjaehrte = parseArr(fm.verjaehrte_ansprueche);

        // Backend does NOT store ansprueche[] in frontmatter — only in the
        // markdown table "Alle Ansprüche im Überblick". Parse it from there.
        const ansprueche: VerjaehrungsAnspruch[] = [];
        if (page.content) {
          const tableMatch = page.content.match(
            /## Alle Ansprüche im Überblick[\s\S]*?\n\| ([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/
          );
          if (tableMatch) {
            const tableSection = page.content.slice(
              page.content.indexOf("## Alle Ansprüche im Überblick")
            );
            const dataLines = tableSection
              .split("\n")
              .filter(
                (l) =>
                  l.startsWith("| ") &&
                  !l.includes("---") &&
                  !l.includes("Anspruch") &&
                  !l.includes("|----------")
              );
            for (const line of dataLines) {
              const cells = line
                .split("|")
                .map((c) => c.trim())
                .filter(Boolean);
              if (cells.length >= 10) {
                ansprueche.push({
                  anspruch: cells[0],
                  gegner: cells[1],
                  anspruchshoehe: parseFloat(cells[2]?.replace(/[€\s.]/g, "")) || undefined,
                  verjaehrungsfrist_jahre: parseInt(cells[3]?.replace("J", "")) || undefined,
                  paragraph: cells[4],
                  beginn: cells[5],
                  frist_ende: cells[6],
                  verjaehrt: cells[7]?.toLowerCase().includes("ja") || false,
                  restzeit_tage: parseInt(cells[8]?.replace("T", "")) || undefined,
                  handlungsbedarf: cells[9]?.replace(/[🚨⚠️✅\s]/g, ""),
                });
              }
            }
          }
        }

        const empfehlungMatch = page.content?.match(/\*\*Empfehlung:\*\*\s*(.+)/);
        const empfehlung = empfehlungMatch ? empfehlungMatch[1].trim() : "";

        // Show card if we have any data: score > 0, urgent/verjaehrte arrays,
        // or parsed ansprueche from the table
        const hasData =
          urgent.length > 0 || verjaehrte.length > 0 || ansprueche.length > 0 || score > 0;
        if (!hasData) {
          setData(null);
        } else {
          setData({ score, urgent, verjaehrte, ansprueche, empfehlung });
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseSlug]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm text-[color:var(--ds-text-muted)]">
        <Loader2 size={14} className="animate-spin" />
        {lang === "en" ? "Loading limitation scan..." : "Verjährungs-Scan wird geladen..."}
      </div>
    );
  }

  if (!data) return null;

  const hasUrgent = data.urgent.length > 0;
  const hasVerjaehrt = data.verjaehrte.length > 0;
  const isCritical = hasUrgent || hasVerjaehrt;
  const isWarning = !isCritical && data.score >= 40;

  const cardClass = isCritical
    ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
    : isWarning
      ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
      : "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]";

  const iconClass = isCritical ? "text-[color:var(--ds-danger-text)]" : isWarning ? "text-[color:var(--ds-warning-text)]" : "text-[color:var(--ds-success-text)]";

  const titleText = isCritical
    ? lang === "en"
      ? "Limitation Risk — Action Required"
      : "Verjährungsrisiko — Handlungsbedarf"
    : isWarning
      ? lang === "en"
        ? "Limitation Risk — Warning"
        : "Verjährungsrisiko — Warnung"
      : lang === "en"
        ? "Limitation Scan — OK"
        : "Verjährungs-Scan — OK";

  return (
    <div className={cn("rounded-xl border p-4", cardClass)}>
      <div className="mb-3 flex items-center gap-2">
        <Hourglass size={16} className={iconClass} />
        <h3 className={cn("text-sm font-semibold", iconClass)}>{titleText}</h3>
        <div className="ml-auto flex items-center gap-1.5">
          {hasVerjaehrt && (
            <Badge variant="danger" className="text-xs">
              <XCircleIcon size={10} className="mr-1" />
              {data.verjaehrte.length} {lang === "en" ? "expired" : "verjährt"}
            </Badge>
          )}
          {hasUrgent && (
            <Badge variant="danger" className="text-xs">
              🚨 {data.urgent.length} {lang === "en" ? "urgent" : "dringend"}
            </Badge>
          )}
          {!hasUrgent && !hasVerjaehrt && data.ansprueche.length > 0 && (
            <Badge variant="success" className="text-xs">
              ✅ {data.ansprueche.length} OK
            </Badge>
          )}
          <Badge
            variant="default"
            className={cn(
              "border text-xs",
              data.score >= 75
                ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                : data.score >= 40
                  ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                  : "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
            )}
          >
            {lang === "en" ? "Risk" : "Risiko"}: {data.score}/100
          </Badge>
        </div>
      </div>

      {data.empfehlung && (
        <p className="mb-3 text-xs text-[color:var(--ds-text)]">{data.empfehlung}</p>
      )}

      {hasVerjaehrt && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold text-[color:var(--ds-danger-text)]">
            ⛔{" "}
            {lang === "en"
              ? "Expired claims — no longer enforceable"
              : "Verjährte Ansprüche — nicht mehr durchsetzbar"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-surface)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]">
                  <th className="px-2 py-1.5 text-left font-medium">
                    {lang === "en" ? "Claim" : "Anspruch"}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {lang === "en" ? "Opponent" : "Gegner"}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">§</th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {lang === "en" ? "Reason" : "Grund"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.verjaehrte.map((v, i) => (
                  <tr key={i} className="border-b border-[color:var(--ds-border)] last:border-0">
                    <td className="px-2 py-1.5 text-[color:var(--ds-text)]">{v.anspruch ?? "—"}</td>
                    <td className="px-2 py-1.5 text-[color:var(--ds-text-muted)]">
                      {v.gegner ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[color:var(--ds-text-muted)]">
                      {v.paragraph ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[color:var(--ds-text-muted)]">
                      {v.grund ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasUrgent && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold text-[color:var(--ds-danger-text)]">
            🚨{" "}
            {lang === "en"
              ? "Urgent — claims expiring soon"
              : "Dringend — Ansprüche verjähren bald"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-surface)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]">
                  <th className="px-2 py-1.5 text-left font-medium">
                    {lang === "en" ? "Claim" : "Anspruch"}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {lang === "en" ? "Opponent" : "Gegner"}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {lang === "en" ? "Days left" : "Restzeit"}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {lang === "en" ? "Action" : "Handlungsbedarf"}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">§</th>
                </tr>
              </thead>
              <tbody>
                {data.urgent.map((u, i) => (
                  <tr key={i} className="border-b border-[color:var(--ds-border)] last:border-0">
                    <td className="px-2 py-1.5 text-[color:var(--ds-text)]">{u.anspruch ?? "—"}</td>
                    <td className="px-2 py-1.5 text-[color:var(--ds-text-muted)]">
                      {u.gegner ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 font-mono font-medium",
                        (u.restzeit_tage ?? 0) <= 30 ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-warning-text)]"
                      )}
                    >
                      {u.restzeit_tage ?? "—"} {lang === "en" ? "d" : "T"}
                    </td>
                    <td className="px-2 py-1.5 text-[color:var(--ds-text-muted)]">
                      {u.handlungsbedarf ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[color:var(--ds-text-muted)]">
                      {u.paragraph ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasUrgent && !hasVerjaehrt && data.ansprueche.length > 0 && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          ✅{" "}
          {lang === "en"
            ? `All ${data.ansprueche.length} claims within limitation period.`
            : `Alle ${data.ansprueche.length} Ansprüche innerhalb der Verjährungsfrist.`}
        </p>
      )}
    </div>
  );
}

// ── Phase D2: Institutionen-Checkliste Card ────────────────────

function InstitutionChecklistCard({ caseSlug, lang }: { caseSlug: string; lang: "de" | "en" }) {
  const [institutions, setInstitutions] = useState<Array<{
    name: string;
    reason?: string;
    priority?: string;
    deadline?: string;
    draft_type?: string;
    address?: string;
  }> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const page = await api.brain.getPage(`institution-checklists/${caseSlug}`);
        if (cancelled) return;
        if (page && page.content) {
          const text = page.content;
          const lines = text.split("\n");
          const parsed: Array<{
            name: string;
            reason?: string;
            priority?: string;
            deadline?: string;
            draft_type?: string;
            address?: string;
          }> = [];
          for (const line of lines) {
            const m = line.match(
              /^\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|$/
            );
            if (m && !m[1].includes("Institution") && !m[1].includes("---")) {
              parsed.push({
                name: m[1].trim(),
                priority: m[2]
                  .trim()
                  .replace(/[🚨⚠️ℹ️]/g, "")
                  .trim(),
                reason: m[3].trim(),
                deadline: m[4].trim() || undefined,
                draft_type: m[5].trim() === "—" ? undefined : m[5].trim(),
                address: m[6].trim() === "—" ? undefined : m[6].trim(),
              });
            }
          }
          setInstitutions(parsed.length > 0 ? parsed : []);
        } else {
          setInstitutions(null);
        }
      } catch {
        if (!cancelled) setInstitutions(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseSlug]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm text-[color:var(--ds-text-muted)]">
        <Loader2 size={14} className="animate-spin" />
        {lang === "en"
          ? "Loading institution checklist..."
          : "Institutionen-Checkliste wird geladen..."}
      </div>
    );
  }

  if (!institutions) return null;

  const urgent = institutions.filter((i) => i.priority?.includes("URGENT"));
  const warnings = institutions.filter((i) => i.priority?.includes("WARNUNG"));
  const infos = institutions.filter((i) => i.priority?.includes("INFO"));

  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Building2 size={14} className="brand-text" />
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {lang === "en" ? "Institution Checklist" : "Institutionen-Checkliste"}
        </h3>
        {(urgent.length > 0 || warnings.length > 0) && (
          <div className="ml-auto flex items-center gap-1.5">
            {urgent.length > 0 && (
              <Badge variant="danger" className="text-xs">
                🚨 {urgent.length} {lang === "en" ? "urgent" : "dringend"}
              </Badge>
            )}
            {warnings.length > 0 && (
              <Badge variant="warning" className="text-xs">
                ⚠️ {warnings.length} {lang === "en" ? "warning" : "Warnung"}
              </Badge>
            )}
            {infos.length > 0 && (
              <Badge variant="default" className="text-xs">
                ℹ️ {infos.length}
              </Badge>
            )}
          </div>
        )}
      </div>
      {institutions.length === 0 ? (
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          {lang === "en"
            ? "No institutions need to be notified for this case."
            : "Keine Institutionen-Meldung für diesen Fall erforderlich."}
        </p>
      ) : (
        <div className="space-y-2">
          {institutions.map((inst, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2",
                inst.priority?.includes("URGENT")
                  ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
                  : inst.priority?.includes("WARNUNG")
                    ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[color:var(--ds-text)]">
                    {inst.name}
                  </span>
                  {inst.priority && (
                    <Badge
                      variant={
                        inst.priority.includes("URGENT")
                          ? "danger"
                          : inst.priority.includes("WARNUNG")
                            ? "warning"
                            : "default"
                      }
                      className="text-xs"
                    >
                      {inst.priority}
                    </Badge>
                  )}
                </div>
                {inst.reason && (
                  <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{inst.reason}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                  {inst.deadline && (
                    <span>
                      <span className="font-medium">⏰</span> {inst.deadline}
                    </span>
                  )}
                  {inst.draft_type && (
                    <span>
                      <span className="font-medium">📄</span> {inst.draft_type}
                    </span>
                  )}
                  {inst.address && (
                    <span>
                      <span className="font-medium">📍</span> {inst.address}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
