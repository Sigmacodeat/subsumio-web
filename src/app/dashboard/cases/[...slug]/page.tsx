"use client";

import {
  Loader2,
  Briefcase,
  AlertTriangle,
  Archive,
  RotateCcw,
  PauseCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatDate } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
// Direct file import — the matter-tabs barrel re-exports all 10 tabs, which
// would keep the whole ~300KB module in the eager graph.
import { OverviewTab } from "@/components/legal/matter-tabs/overview-tab";

// Lazy-load non-default tabs: only one tab renders at a time.
// OverviewTab stays eager (the default view).
const tabFallback = (
  <div className="space-y-3" role="status" aria-live="polite">
    <Skeleton className="h-5 w-48" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>
);
const DocumentsTab = dynamic(
  () => import("@/components/legal/matter-tabs/documents-tab").then((m) => m.DocumentsTab),
  {
    loading: () => tabFallback,
  }
);
const DeadlinesTasksTab = dynamic(
  () =>
    import("@/components/legal/matter-tabs/deadlines-tasks-tab").then((m) => m.DeadlinesTasksTab),
  { loading: () => tabFallback }
);
const ActivityTab = dynamic(
  () => import("@/components/legal/matter-tabs/activity-tab").then((m) => m.ActivityTab),
  {
    loading: () => tabFallback,
  }
);
const EvidenceTab = dynamic(
  () => import("@/components/legal/matter-tabs/evidence-tab").then((m) => m.EvidenceTab),
  {
    loading: () => tabFallback,
  }
);
const StrategyTab = dynamic(
  () => import("@/components/legal/matter-tabs/strategy-tab").then((m) => m.StrategyTab),
  {
    loading: () => tabFallback,
  }
);
const BillingTab = dynamic(
  () => import("@/components/legal/matter-tabs/billing-tab").then((m) => m.BillingTab),
  {
    loading: () => tabFallback,
  }
);
const ContactsTab = dynamic(
  () => import("@/components/legal/matter-tabs/contacts-tab").then((m) => m.ContactsTab),
  {
    loading: () => tabFallback,
  }
);
const NotesTab = dynamic(
  () => import("@/components/legal/matter-tabs/notes-tab").then((m) => m.NotesTab),
  {
    loading: () => tabFallback,
  }
);
const PhoneNotesTab = dynamic(
  () => import("@/components/legal/matter-tabs/phone-notes-tab").then((m) => m.PhoneNotesTab),
  {
    loading: () => tabFallback,
  }
);
const EmailsTab = dynamic(
  () => import("@/components/legal/matter-tabs/emails-tab").then((m) => m.EmailsTab),
  {
    loading: () => tabFallback,
  }
);

export type { CaseDetail } from "@/lib/matter-detail-types";

export default function CaseDetailPage() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const router = useRouter();

  if (ctx.loading) {
    return <div className="mx-auto w-full max-w-[1200px] p-4 md:p-6">{tabFallback}</div>;
  }

  if (!ctx.caseData) {
    // The header above already names the problem; this offers the way back.
    return (
      <div className="mx-auto w-full max-w-[720px] p-4 md:p-6">
        <EmptyState
          icon={Briefcase}
          title={t("cases.detail_not_found")}
          description={
            lang === "en"
              ? "The matter may have been archived or you may not have access to it."
              : "Die Akte wurde möglicherweise archiviert, oder Ihnen fehlt die Berechtigung."
          }
          actionLabel={t("cases.detail_back")}
          onAction={() => router.push("/dashboard/cases")}
        />
      </div>
    );
  }

  const { caseData, activeTab } = ctx;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1200px] min-w-0 flex-col">
      {/* Save errors / conflict warnings / archived banner */}
      <div aria-live="assertive" className="empty:hidden">
        {ctx.saveError && (
          <div
            className="flex items-center gap-2 border-b border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-6 py-2 text-sm text-[color:var(--ds-danger-text)]"
            role="alert"
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {ctx.saveError}
          </div>
        )}
        {ctx.conflictWarning && (
          <div
            className="flex items-center gap-2 border-b border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-6 py-2 text-sm text-[color:var(--ds-warning-text)]"
            role="alert"
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {ctx.conflictWarning}
            <button
              onClick={() => window.location.reload()}
              className="brand-text ml-auto rounded text-xs transition-[color,transform] duration-[var(--ds-duration-fast)] hover:underline focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.95] motion-reduce:transition-none"
            >
              {t("cases.detail_refresh_now")}
            </button>
          </div>
        )}
        {caseData.status === "archived" && (
          <div
            className="flex items-center gap-2 border-b border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] px-6 py-2.5 text-sm text-[color:var(--ds-neutral-text)]"
            role="status"
          >
            <Archive size={14} aria-hidden="true" className="shrink-0" />
            <span>
              {lang === "en"
                ? `Archived${caseData.archivedAt ? ` on ${formatDate(caseData.archivedAt)}` : ""}${caseData.archivedBy ? ` by ${caseData.archivedBy}` : ""}`
                : `Archiviert${caseData.archivedAt ? ` am ${formatDate(caseData.archivedAt)}` : ""}${caseData.archivedBy ? ` von ${caseData.archivedBy}` : ""}`}
            </span>
            {ctx.userRole === "admin" || ctx.userRole === "lawyer" ? (
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => ctx.handleRestore("open")}
                  disabled={ctx.restoring}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.95] disabled:opacity-50 motion-reduce:transition-none"
                >
                  {ctx.restoring ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {t("casesdetail.restore_open")}
                </button>
                <button
                  onClick={() => ctx.handleRestore("dormant")}
                  disabled={ctx.restoring}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.95] disabled:opacity-50 motion-reduce:transition-none"
                >
                  <PauseCircle size={12} />
                  {t("casesdetail.as_dormant")}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="min-w-0 flex-1 p-4 md:p-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "activity" && <ActivityTab />}
        {activeTab === "documents" && <DocumentsTab />}
        {activeTab === "deadlines" && <DeadlinesTasksTab />}
        {activeTab === "evidence" && <EvidenceTab />}
        {activeTab === "strategy" && <StrategyTab />}
        {activeTab === "billing" && <BillingTab />}
        {activeTab === "contacts" && <ContactsTab />}
        {activeTab === "notes" && <NotesTab />}
        {activeTab === "phone-notes" && <PhoneNotesTab />}
        {activeTab === "emails" && <EmailsTab />}
        {![
          "overview",
          "activity",
          "documents",
          "deadlines",
          "evidence",
          "strategy",
          "billing",
          "contacts",
          "notes",
          "phone-notes",
          "emails",
        ].includes(activeTab) && (
          <EmptyState
            icon={AlertTriangle}
            title={t("casesdetail.tab_unavailable")}
            actionLabel={t("cases.detail_back")}
            onAction={() => router.push("/dashboard/cases")}
          />
        )}
      </div>
    </div>
  );
}
