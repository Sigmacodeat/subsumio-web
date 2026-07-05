"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import type { DashboardKey } from "@/content/dashboard";
import { evaluateCaseCloseChecklist, type CaseCloseChecklist } from "@/lib/case-close-checklist";

interface CaseCloseChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseSlug: string;
  caseTitle: string;
  onConfirmArchive: () => void;
}

export function CaseCloseChecklistDialog({
  open,
  onOpenChange,
  caseSlug,
  caseTitle: _caseTitle,
  onConfirmArchive,
}: CaseCloseChecklistDialogProps) {
  const { t } = useLang();
  const [checklist, setChecklist] = useState<CaseCloseChecklist | null>(null);
  const [loading, setLoading] = useState(false);
  const [forceArchive, setForceArchive] = useState(false);

  const loadChecklist = useCallback(async () => {
    if (!caseSlug) return;
    setLoading(true);
    try {
      const casePage = await api.brain.getPage(caseSlug);
      const fm = caseFrontmatter(casePage);

      // Fetch invoices for this case
      let invoices: Array<{ status?: string }> = [];
      try {
        const invoicePages = await api.brain.listPages({ type: "invoice", limit: 200 });
        invoices = invoicePages
          .map((p) => {
            const ifm = p.frontmatter as Record<string, unknown>;
            const caseSlugs = Array.isArray(ifm.case_slugs) ? ifm.case_slugs : [];
            if (caseSlugs.includes(caseSlug)) {
              return { status: ifm.status as string | undefined };
            }
            return null;
          })
          .filter((x): x is { status: string | undefined } => x !== null);
      } catch {
        // Invoices may not be available offline
      }

      const result = evaluateCaseCloseChecklist({
        timeEntries: (fm.time_entries ?? []) as Array<{ billed?: boolean; billable?: boolean }>,
        expenses: (fm.expenses ?? []) as Array<{ billed?: boolean; billable?: boolean }>,
        deadlines: (fm.deadlines ?? []) as Array<{ status?: string }>,
        documentRequests: ((fm as Record<string, unknown>).document_requests ?? []) as Array<{
          status?: string;
        }>,
        invoices,
      });
      setChecklist(result);
    } catch {
      // If we can't load the case, allow archive (don't block on network error)
      setChecklist({
        items: [],
        hasBlockers: false,
        blockerCount: 0,
        warningCount: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [caseSlug]);

  useEffect(() => {
    if (open) {
      setForceArchive(false);
      void loadChecklist();
    }
  }, [open, loadChecklist]);

  const canArchive = !checklist?.hasBlockers || forceArchive;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{t("cases.close_checklist_title" as DashboardKey)}</DialogTitle>
          <DialogDescription>{t("cases.close_checklist_desc" as DashboardKey)}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
            </div>
          ) : checklist ? (
            <>
              {checklist.items.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    item.passed
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : item.severity === "blocker"
                        ? "border-red-500/20 bg-red-500/5"
                        : "border-amber-500/20 bg-amber-500/5"
                  }`}
                >
                  {item.passed ? (
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : item.severity === "blocker" ? (
                    <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
                  ) : (
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {t(item.labelKey as DashboardKey)}
                      </span>
                      {!item.passed && (
                        <span
                          className={`shrink-0 text-xs font-semibold ${
                            item.severity === "blocker" ? "text-red-600" : "text-amber-600"
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                      {t(item.descriptionKey as DashboardKey)}
                    </p>
                  </div>
                </div>
              ))}

              {checklist.hasBlockers && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                  <XCircle size={14} />
                  {t("cases.close_checklist_has_blockers" as DashboardKey)}
                </div>
              )}
              {!checklist.hasBlockers && checklist.warningCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle size={14} />
                  {t("cases.close_checklist_warnings" as DashboardKey)}
                </div>
              )}
              {!checklist.hasBlockers && checklist.warningCount === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle2 size={14} />
                  {t("cases.close_checklist_all_passed" as DashboardKey)}
                </div>
              )}

              {checklist.hasBlockers && (
                <label className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                  <input
                    type="checkbox"
                    checked={forceArchive}
                    onChange={(e) => setForceArchive(e.target.checked)}
                    className="accent-[var(--brand-primary)]"
                  />
                  {t("cases.close_checklist_force" as DashboardKey)}
                </label>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-[color:var(--ds-text-muted)]"
            >
              {t("cases.btn_cancel" as DashboardKey)}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!canArchive || loading}
              onClick={() => {
                onConfirmArchive();
                onOpenChange(false);
              }}
              className="gap-2"
            >
              {t("cases.btn_archive" as DashboardKey)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
