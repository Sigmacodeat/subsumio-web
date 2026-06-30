"use client";

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

export function OverviewTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Quick actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="gap-2 text-sm"
          onClick={() => {
            ctx.navigateToTab("strategy");
            ctx.setQuery(t("cases.detail_qb_strategy"));
          }}
        >
          <Lightbulb size={14} />
          {t("cases.detail_btn_strategy")}
        </Button>
        <Button
          variant="secondary"
          disabled={ctx.userRole !== "admin" && ctx.userRole !== "lawyer"}
          className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          onClick={() => ctx.setShowStatusDialog(true)}
        >
          <ChevronRight size={14} />
          {t("cases.detail_btn_status_change")}
        </Button>
        <Button
          variant="secondary"
          className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          onClick={() => ctx.setShowEmailDialog(true)}
        >
          <Mail size={14} />
          {t("email.compose_title")}
        </Button>
        <Button
          variant="secondary"
          className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          onClick={() => ctx.setShowDocuSignDialog(true)}
        >
          <PenTool size={14} />
          {t("docusign.send_title")}
        </Button>
        <Button
          variant="secondary"
          className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          onClick={() => {
            ctx.navigateToTab("strategy");
            ctx.setQuery(t("cases.detail_qb_chances"));
          }}
        >
          <Scale size={14} />
          {t("cases.detail_btn_assess")}
        </Button>
        {(ctx.userRole === "admin" || ctx.userRole === "lawyer") && (
          <>
            <Button
              variant="secondary"
              disabled={caseData.status === "archived"}
              className={cn(
                "border text-sm",
                caseData.portalEnabled
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
              )}
              onClick={() => {
                const updated = { ...caseData, portalEnabled: !caseData.portalEnabled };
                ctx.setCaseData(updated);
                ctx.saveCaseUpdate({ ...updated });
              }}
            >
              {caseData.portalEnabled
                ? t("cases.detail_btn_portal_enabled")
                : t("cases.detail_btn_portal_enable")}
            </Button>
            {caseData.portalEnabled && (
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
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
                }}
                disabled={ctx.generatingPortal}
              >
                {ctx.generatingPortal ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Copy size={14} />
                )}
                {ctx.generatingPortal
                  ? t("cases.detail_btn_portal_generating")
                  : ctx.copied
                    ? t("cases.detail_btn_portal_copied")
                    : t("cases.detail_btn_portal_link")}
              </Button>
            )}
          </>
        )}
      </div>

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
            <p className="flex items-center gap-1.5 text-xs text-red-600">
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
        <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="mb-1 text-xs font-medium text-emerald-600">
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
              className="shrink-0 text-xs text-red-600 hover:underline"
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
                ? "border-red-500/30 bg-red-500/5 text-red-600"
                : "border-amber-500/30 bg-amber-500/5 text-amber-600"
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
              <Sparkles size={12} className="text-amber-500" />
              {t("casesdetail.ai_parties")}
            </div>
            {caseData.suggestedParties
              .filter((sp) => !sp.confirmed)
              .map((sp, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
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
                      className="border-emerald-500/30 text-xs text-emerald-600 hover:bg-emerald-500/10"
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
                        ctx.setPendingSuggestedPartyIndex(i);
                      }}
                    >
                      <Plus size={12} /> Als Kontakt
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                      onClick={() => ctx.confirmSuggestedParty(i, false)}
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
          <p className="text-xs text-amber-600">
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
                <span className="mt-0.5 text-emerald-600">•</span>
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
                <h4 className="mb-1 text-xs font-semibold text-red-600">
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
                      className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600"
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

      {/* Contradictions */}
      {caseData.contradictions && caseData.contradictions.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-700">
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
                  <Badge
                    variant={c.severity === "high" ? "danger" : "warning"}
                    className="text-[10px]"
                  >
                    {c.severity}
                  </Badge>
                  <span className="text-xs font-medium text-[color:var(--ds-text)]">{c.field}</span>
                </div>
                <p className="text-xs text-[color:var(--ds-text-muted)]">{c.description}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[color:var(--ds-text-muted)]">
                  <span className="truncate">{c.value_a}</span>
                  <span className="shrink-0 text-amber-600">vs</span>
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
