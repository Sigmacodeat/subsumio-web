"use client";

import {
  CalendarClock,
  Briefcase,
  Users,
  ShieldAlert,
  Landmark,
  User,
  Scale,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail, STATUS_CONFIG } from "@/lib/matter-detail-context";
import { parseCitations } from "@/components/legal/CitationLink";
import type { DashboardKey } from "@/content/dashboard";

export function ActivityTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Timeline */}
      <div className="max-w-3xl space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <Button
            variant="primary"
            className="brand-bg brand-bg gap-2 text-sm text-white"
            onClick={() => {
              ctx.navigateToTab("strategy");
              ctx.setQuery(t("cases.detail_qb_timeline"));
            }}
          >
            <CalendarClock size={14} />
            {t("cases.detail_timeline_generate")}
          </Button>
        </div>
        <div className="relative space-y-4 pl-6">
          <div className="absolute top-0 bottom-0 left-2 w-px bg-[color:var(--ds-border)]" />
          {/* Creation */}
          <div className="relative">
            <div className="brand-soft absolute -left-4 h-2 w-2 rounded-full" />
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
              <div className="text-xs text-[color:var(--ds-text-muted)]">
                {new Date(caseData.createdAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
              </div>
              <div className="text-sm text-[color:var(--ds-text)]">
                {t("cases.detail_timeline_case_created")}
              </div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">{caseData.caseNumber}</div>
            </div>
          </div>
          {/* Dynamic timeline events */}
          {caseData.timelineEvents?.map((ev) => (
            <div key={ev.id} className="relative">
              <div
                className={`absolute -left-4 h-2 w-2 rounded-full ${ev.type === "deadline" ? "bg-amber-500" : ev.type === "hearing" ? "bg-blue-500" : ev.type === "filing" ? "bg-emerald-500" : ev.type === "status_change" ? "brand-soft" : "bg-[color:var(--ds-text-subtle)]"}`}
              />
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {ev.timestamp || ev.date
                      ? new Date(ev.timestamp || ev.date || "").toLocaleString(
                          lang === "en" ? "en-GB" : "de-DE"
                        )
                      : "—"}
                  </div>
                  {ev.type === "status_change" && (
                    <span className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--ds-text-muted)]">
                      {lang === "en" ? "Status Change" : t("casesdetail.status_change")}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-[color:var(--ds-text)]">{ev.title}</div>
                {ev.description && (
                  <div className="text-xs text-[color:var(--ds-text-muted)]">{ev.description}</div>
                )}
              </div>
            </div>
          ))}
          {/* Status changes */}
          {caseData.status !== "open" && (
            <div className="relative">
              <div className="absolute -left-4 h-2 w-2 rounded-full bg-amber-500" />
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {new Date(caseData.updatedAt).toLocaleDateString(
                    lang === "en" ? "en-GB" : "de-DE"
                  )}
                </div>
                <div className="text-sm text-[color:var(--ds-text)]">
                  {t("cases.detail_timeline_status_changed")}{" "}
                  {STATUS_CONFIG[caseData.status]
                    ? t(STATUS_CONFIG[caseData.status].labelKey as DashboardKey)
                    : caseData.status}
                </div>
              </div>
            </div>
          )}
          {/* Strategy generated */}
          {caseData.strategy && (
            <div className="relative">
              <div className="absolute -left-4 h-2 w-2 rounded-full bg-emerald-500" />
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {new Date(caseData.strategy.generatedAt || caseData.updatedAt).toLocaleDateString(
                    lang === "en" ? "en-GB" : "de-DE"
                  )}
                </div>
                <div className="text-sm text-[color:var(--ds-text)]">
                  {t("cases.detail_timeline_strategy_generated")}
                </div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {caseData.strategy.recommendedApproach}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Entity Graph */}
      <div className="max-w-3xl space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="brand-border brand-soft flex items-center gap-3 rounded-xl border p-4 md:col-span-2">
            <div className="brand-soft flex h-10 w-10 items-center justify-center rounded-lg">
              <Briefcase size={20} className="brand-text" />
            </div>
            <div>
              <div className="brand-text text-sm font-semibold">{caseData.title}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">
                {caseData.caseNumber} · {caseData.legalArea}
              </div>
            </div>
          </div>
          {caseData.clientName && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/15">
                <Users size={20} className="text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_client")}
                </div>
                <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {caseData.clientName}
                </div>
              </div>
            </div>
          )}
          {caseData.opponentName && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600/15">
                <ShieldAlert size={20} className="text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_opponent")}
                </div>
                <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {caseData.opponentName}
                </div>
              </div>
            </div>
          )}
          {caseData.courtName && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/15">
                <Landmark size={20} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_court")}
                </div>
                <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {caseData.courtName}
                </div>
              </div>
            </div>
          )}
          {caseData.ownLawyerName && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600/15">
                <User size={20} className="text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_lawyer")}
                </div>
                <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {caseData.ownLawyerName}
                </div>
              </div>
            </div>
          )}
          {caseData.claims.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="brand-soft flex h-10 w-10 items-center justify-center rounded-lg">
                <Scale size={20} className="brand-text" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_claims")}
                </div>
                <div className="text-sm font-medium text-[color:var(--ds-text)]">
                  {caseData.claims.length} {t("cases.detail_graph_claims_count")}
                </div>
              </div>
            </div>
          )}
          {ctx.evidenceList.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600/15">
                <ShieldAlert size={20} className="text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_evidence")}
                </div>
                <div className="text-sm font-medium text-[color:var(--ds-text)]">
                  {ctx.evidenceList.length} {t("cases.detail_graph_evidence_count")}
                </div>
              </div>
            </div>
          )}
          {caseData.documents.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-600/15">
                <FileText size={20} className="text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_documents")}
                </div>
                <div className="text-sm font-medium text-[color:var(--ds-text)]">
                  {caseData.documents.length} {t("cases.detail_graph_documents_count")}
                </div>
              </div>
            </div>
          )}
          {ctx.deadlinesList.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-600/15">
                <CalendarClock size={20} className="text-pink-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_graph_deadlines")}
                </div>
                <div className="text-sm font-medium text-[color:var(--ds-text)]">
                  {ctx.deadlinesList.length} {t("cases.detail_graph_deadlines_count")}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cited norms */}
        {caseData.facts && (
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
              {t("cases.detail_graph_cited_norms")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const citations = parseCitations(caseData.facts)
                  .filter((s) => s.isCitation)
                  .map((s) => s.text);
                if (citations.length === 0)
                  return (
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_no_norms")}
                    </p>
                  );
                return citations.map((c, i) => (
                  <Link
                    key={i}
                    href={`/dashboard/norms?citation=${encodeURIComponent(c)}`}
                    className="brand-soft brand-text brand-border hover:brand-soft rounded-lg border px-2.5 py-1 text-xs transition-colors"
                  >
                    {c}
                  </Link>
                ));
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div className="max-w-3xl space-y-4">
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("cases.detail_audit_title")}
          </h3>
          {caseData.auditLog && caseData.auditLog.length > 0 ? (
            <div className="space-y-2">
              {caseData.auditLog
                .slice()
                .reverse()
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                  >
                    <div className="brand-bg mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--ds-text)]">{entry.note}</span>
                        <Badge
                          variant="default"
                          className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                        >
                          {entry.field}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {entry.actor} ·{" "}
                        {new Date(entry.at).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
              {t("cases.detail_audit_empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
