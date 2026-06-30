"use client";

import {
  Loader2,
  Briefcase,
  ArrowLeft,
  AlertTriangle,
  Archive,
  RotateCcw,
  PauseCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import {
  OverviewTab,
  DocumentsTab,
  DeadlinesTasksTab,
  ActivityTab,
  EvidenceTab,
  StrategyTab,
  BillingTab,
  CommunicationsTab,
  ContactsTab,
  AiTab,
} from "@/components/legal/matter-tabs";

export type { CaseDetail } from "@/lib/matter-detail-types";

export default function CaseDetailPage() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();

  if (ctx.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="brand-text animate-spin" />
      </div>
    );
  }

  if (!ctx.caseData) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4">
        <Briefcase size={48} className="text-[color:var(--ds-border)]" />
        <p className="text-[color:var(--ds-text-muted)]">{t("cases.detail_not_found")}</p>
        <Link href="/dashboard/cases">
          <Button variant="primary" className="brand-bg brand-bg gap-2 text-white">
            <ArrowLeft size={16} />
            {t("cases.detail_back")}
          </Button>
        </Link>
      </div>
    );
  }

  const { caseData, activeTab } = ctx;

  return (
    <div className="flex h-full flex-col">
      {/* Save errors / conflict warnings / archived banner */}
      <div aria-live="assertive">
        {ctx.saveError && (
          <div
            className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-sm text-red-600"
            role="alert"
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {ctx.saveError}
          </div>
        )}
        {ctx.conflictWarning && (
          <div
            className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-6 py-2 text-sm text-amber-600"
            role="alert"
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {ctx.conflictWarning}
            <button
              onClick={() => window.location.reload()}
              className="brand-text ml-auto text-xs hover:underline"
            >
              {t("cases.detail_refresh_now")}
            </button>
          </div>
        )}
        {caseData.status === "archived" && (
          <div
            className="flex items-center gap-2 border-b border-gray-500/20 bg-gray-500/10 px-6 py-2.5 text-sm text-gray-700"
            role="status"
          >
            <Archive size={14} aria-hidden="true" className="shrink-0" />
            <span>
              {lang === "en"
                ? `Archived${caseData.archivedAt ? ` on ${new Date(caseData.archivedAt).toLocaleDateString("en-GB")}` : ""}${caseData.archivedBy ? ` by ${caseData.archivedBy}` : ""}`
                : `Archiviert${caseData.archivedAt ? ` am ${new Date(caseData.archivedAt).toLocaleDateString("de-DE")}` : ""}${caseData.archivedBy ? ` von ${caseData.archivedBy}` : ""}`}
            </span>
            {ctx.userRole === "admin" || ctx.userRole === "lawyer" ? (
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => ctx.handleRestore("open")}
                  disabled={ctx.restoring}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-500/10 hover:text-gray-900 disabled:opacity-50"
                >
                  {ctx.restoring ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {lang === "en" ? "Restore as Open" : "Als Offen wiederherstellen"}
                </button>
                <button
                  onClick={() => ctx.handleRestore("dormant")}
                  disabled={ctx.restoring}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-500/10 hover:text-gray-900 disabled:opacity-50"
                >
                  <PauseCircle size={12} />
                  {lang === "en" ? "as Dormant" : "als Ruhend"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "activity" && <ActivityTab />}
        {activeTab === "documents" && <DocumentsTab />}
        {activeTab === "deadlines_tasks" && <DeadlinesTasksTab />}
        {activeTab === "evidence" && <EvidenceTab />}
        {activeTab === "strategy" && <StrategyTab />}
        {activeTab === "billing" && <BillingTab />}
        {activeTab === "communications" && <CommunicationsTab />}
        {activeTab === "contacts" && <ContactsTab />}
        {activeTab === "ai" && <AiTab />}
        {![
          "overview",
          "activity",
          "documents",
          "deadlines_tasks",
          "evidence",
          "strategy",
          "billing",
          "communications",
          "contacts",
          "ai",
        ].includes(activeTab) && (
          <div className="flex h-full flex-col items-center justify-center space-y-3 py-20">
            <AlertTriangle size={32} className="text-[color:var(--ds-border)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {lang === "en" ? "This tab is not available." : "Dieser Tab ist nicht verfügbar."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
