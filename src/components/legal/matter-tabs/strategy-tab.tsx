"use client";

import { lazy, Suspense, useState, useCallback, useEffect } from "react";
import {
  Loader2,
  AlertTriangle,
  ListChecks,
  RefreshCw,
  MessageSquare,
  Send,
  Copy,
  Check,
  Sparkles,
  Scale,
  CalendarClock,
  FileText,
  Lightbulb,
  ClipboardList,
  AlertCircle,
  UserPlus,
  CalendarPlus,
  Plus,
  X,
  Coins,
  Handshake,
  Gavel,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { RetrievalFeedbackButtons } from "@/components/legal/RetrievalFeedbackButtons";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { HearingChecklist } from "@/components/legal/hearing-checklist";
import { CaseHandover } from "@/components/legal/case-handover";
import { ClientMeetingPrep } from "@/components/legal/client-meeting-prep";
import { HearingFollowupWorkflow } from "@/components/legal/hearing-followup";

const ChatPanel = lazy(() =>
  import("@/components/chat/chat-panel").then((m) => ({ default: m.ChatPanel }))
);
const MatterContextPanel = lazy(() =>
  import("@/components/legal/MatterContextPanel").then((m) => ({ default: m.MatterContextPanel }))
);
const PipelinePanel = lazy(() =>
  import("@/components/legal/PipelinePanel").then((m) => ({ default: m.PipelinePanel }))
);
const ActIntelligencePanel = lazy(() =>
  import("@/components/legal/ActIntelligencePanel").then((m) => ({
    default: m.ActIntelligencePanel,
  }))
);
const CaseInsightsPanel = lazy(() =>
  import("@/components/legal/CaseInsightsPanel").then((m) => ({ default: m.CaseInsightsPanel }))
);

/** Pipeline slug prefixes of the litigation-economics analyses (see
 * server/src/core/minions/handlers/legal-pipeline.ts, Layer 5c–5f). */
const ECONOMY_ANALYSES = [
  {
    slugPrefix: "cost-benefit",
    icon: Coins,
    labelDe: "Kosten-Nutzen-Analyse",
    labelEn: "Cost-benefit analysis",
    hintDe: "Erwartungswert, Break-Even, Risiko",
    hintEn: "Expected value, break-even, risk",
  },
  {
    slugPrefix: "settlement-analysis",
    icon: Handshake,
    labelDe: "Vergleichsanalyse",
    labelEn: "Settlement analysis",
    hintDe: "BATNA, ZOPA, Verhandlungsstrategie",
    hintEn: "BATNA, ZOPA, negotiation strategy",
  },
  {
    slugPrefix: "enforcement-analysis",
    icon: Gavel,
    labelDe: "Vollstreckungsanalyse",
    labelEn: "Enforcement analysis",
    hintDe: "Vollstreckung, Arrest, Sicherung",
    hintEn: "Enforcement, attachment, securing",
  },
  {
    slugPrefix: "appeal-risk",
    icon: TrendingUp,
    labelDe: "Berufungsrisiko",
    labelEn: "Appeal risk",
    hintDe: "Berufung, Revision, Instanzenzug",
    hintEn: "Appeal, revision, court hierarchy",
  },
] as const;

function ProzessOekonomieSection({ caseSlug, lang }: { caseSlug: string; lang: string }) {
  const [pages, setPages] = useState<Record<string, BrainPage>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const slugs = ECONOMY_ANALYSES.map((a) => `${a.slugPrefix}/${caseSlug}`);
        const result = await api.brain.getPages(slugs);
        if (!cancelled) setPages(result);
      } catch {
        if (!cancelled) setPages({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseSlug]);

  const available = ECONOMY_ANALYSES.filter((a) => pages[`${a.slugPrefix}/${caseSlug}`]);

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center gap-2">
        <Coins size={16} className="text-[color:var(--ds-text-secondary)]" />
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {lang === "en" ? "Litigation Economics" : "Prozess-Ökonomie"}
        </h3>
        {available.length > 0 && (
          <Badge variant="default" className="text-[10px]">
            {available.length}/{ECONOMY_ANALYSES.length}
          </Badge>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-[color:var(--ds-text-secondary)]">
          <Loader2 size={14} className="animate-spin" />
          {lang === "en" ? "Loading analyses..." : "Analysen werden geladen..."}
        </div>
      ) : available.length === 0 ? (
        <p className="py-2 text-sm text-[color:var(--ds-text-secondary)]">
          {lang === "en"
            ? "No litigation-economics analyses yet. They are generated automatically when the case analysis pipeline runs after document upload."
            : "Noch keine Prozess-Ökonomie-Analysen. Sie entstehen automatisch, wenn die Aktenanalyse nach dem Dokumenten-Upload läuft."}
        </p>
      ) : (
        <div className="space-y-2">
          {available.map((a) => {
            const slug = `${a.slugPrefix}/${caseSlug}`;
            const page = pages[slug]!;
            const Icon = a.icon;
            const isOpen = expanded === slug;
            return (
              <div
                key={slug}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : slug)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                  ) : (
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-[color:var(--ds-text-muted)]"
                    />
                  )}
                  <Icon size={14} className="shrink-0 text-[color:var(--ds-text-secondary)]" />
                  <span className="text-xs font-medium text-[color:var(--ds-text)]">
                    {lang === "en" ? a.labelEn : a.labelDe}
                  </span>
                  <span className="hidden text-xs text-[color:var(--ds-text-muted)] sm:inline">
                    {lang === "en" ? a.hintEn : a.hintDe}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(page.updated_at).toLocaleDateString(
                      lang === "en" ? "en-GB" : "de-DE"
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-[color:var(--ds-border)] p-3">
                    <div className="max-h-[300px] overflow-y-auto rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-2">
                      <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                        {page.content || ""}
                      </pre>
                    </div>
                    <Link
                      href={`/dashboard/brain/${encodeURIComponent(slug)}`}
                      className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
                    >
                      <ExternalLink size={12} />
                      {lang === "en" ? "Open full analysis" : "Vollständige Analyse öffnen"}
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StrategyTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  const [queryNonce, setQueryNonce] = useState(0);
  const { grounding, groundAnswer, reset } = useGroundedAnswer();

  const handleQuickAction = useCallback(
    (action: { key: string; queryDe: string; queryEn: string }) => {
      const query = lang === "en" ? action.queryEn : action.queryDe;
      setInitialQuery(query);
      setQueryNonce((n) => n + 1);
    },
    [lang]
  );

  // A.3: Ground AI query results — run corpus grounding when queryResult changes
  useEffect(() => {
    if (ctx.queryResult && !ctx.queryLoading) {
      groundAnswer(ctx.queryResult);
    } else if (!ctx.queryResult) {
      reset();
    }
  }, [ctx.queryResult, ctx.queryLoading, groundAnswer, reset]);

  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const isArchived = caseData.status === "archived";

  const QUICK_ACTIONS = [
    {
      key: "strategy",
      icon: Lightbulb,
      labelDe: "Strategie empfehlen",
      labelEn: "Recommend strategy",
      queryDe: "Welche Strategie empfiehlst du für diese Akte?",
      queryEn: "What strategy do you recommend for this case?",
    },
    {
      key: "chances",
      icon: Scale,
      labelDe: "Prozessaussichten bewerten",
      labelEn: "Assess chances",
      queryDe: "Wie stehen die Prozessaussichten in dieser Akte?",
      queryEn: "What are the chances of success in this case?",
    },
    {
      key: "timeline",
      icon: CalendarClock,
      labelDe: "Timeline generieren",
      labelEn: "Generate timeline",
      queryDe: "Erstelle eine Timeline der wichtigsten Ereignisse dieser Akte.",
      queryEn: "Create a timeline of the key events in this case.",
    },
    {
      key: "summary",
      icon: FileText,
      labelDe: "Aktenzusammenfassung",
      labelEn: "Case summary",
      queryDe: "Fasse diese Akte prägnant zusammen.",
      queryEn: "Summarize this case concisely.",
    },
    {
      key: "contradictions",
      icon: AlertCircle,
      labelDe: "Widersprüche finden",
      labelEn: "Find contradictions",
      queryDe: "Gibt es Widersprüche in den Aussagen oder Dokumenten dieser Akte?",
      queryEn: "Are there contradictions in the statements or documents of this case?",
    },
    {
      key: "deadlines",
      icon: ClipboardList,
      labelDe: "Fristen prüfen",
      labelEn: "Check deadlines",
      queryDe: "Welche Fristen sind in dieser Akte aktuell und welche drohen zu verstreichen?",
      queryEn: "Which deadlines are current in this case and which are at risk?",
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Proactive Case Insights + Brain Quality (migrated from former AI-Tab) */}
      <div className="max-w-3xl">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
            </div>
          }
        >
          <CaseInsightsPanel caseSlug={caseData.slug} />
        </Suspense>
      </div>

      {/* AI-Suggested Deadlines & Parties — Partner-Cockpit proactive cards */}
      {((caseData.suggestedDeadlines && caseData.suggestedDeadlines.some((sd) => !sd.confirmed)) ||
        (caseData.suggestedParties && caseData.suggestedParties.some((sp) => !sp.confirmed))) && (
        <div className="max-w-3xl rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {lang === "en" ? "AI Suggestions" : "KI-Vorschläge"}
            </h3>
          </div>

          <div className="space-y-2">
            {/* Suggested Deadlines */}
            {caseData.suggestedDeadlines
              ?.map((sd, originalIndex) => ({ sd, originalIndex }))
              .filter(({ sd }) => !sd.confirmed)
              .map(({ sd, originalIndex }) => (
                <div
                  key={`sd-${originalIndex}`}
                  className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5"
                >
                  <CalendarPlus size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[color:var(--ds-text)]">
                        {sd.title}
                      </span>
                      <Badge
                        variant={
                          sd.urgency === "high"
                            ? "danger"
                            : sd.urgency === "medium"
                              ? "warning"
                              : "default"
                        }
                        className="text-[10px]"
                      >
                        {sd.urgency}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                      {sd.due_date}
                      {sd.source_quote && (
                        <span className="ml-1 italic">
                          — &quot;{sd.source_quote.slice(0, 120)}&quot;
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isArchived}
                      onClick={async () => {
                        const entry = {
                          title: sd.title,
                          due_date: sd.due_date,
                          status: "pending" as const,
                          type: "deadline",
                          source: sd.source,
                        };
                        const updated = [...ctx.deadlinesList, entry];
                        ctx.setDeadlinesList(updated);
                        await ctx.saveCaseUpdate({ deadlines: updated });
                        await ctx.confirmSuggestedDeadline(originalIndex, true);
                      }}
                      className="h-7 px-2 text-xs"
                    >
                      <Check size={12} />
                      {t("casesdetail.accept")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isArchived}
                      onClick={() => ctx.confirmSuggestedDeadline(originalIndex, false)}
                      className="h-7 px-2 text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                    >
                      <X size={12} />
                    </Button>
                  </div>
                </div>
              ))}

            {/* Suggested Parties */}
            {caseData.suggestedParties
              ?.map((sp, originalIndex) => ({ sp, originalIndex }))
              .filter(({ sp }) => !sp.confirmed)
              .map(({ sp, originalIndex }) => (
                <div
                  key={`sp-${originalIndex}`}
                  className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5"
                >
                  <UserPlus size={14} className="mt-0.5 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[color:var(--ds-text)]">
                        {sp.name}
                      </span>
                      <Badge variant="info" className="text-[10px]">
                        {sp.role}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                      {lang === "en" ? "Source:" : "Quelle:"} {sp.source}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isArchived}
                      onClick={() => {
                        ctx.setContactDialogRole(
                          sp.role === "mandant" || sp.role === "client"
                            ? "client"
                            : sp.role === "gegner" || sp.role === "opponent"
                              ? "opponent"
                              : sp.role === "gericht" || sp.role === "court"
                                ? "court"
                                : "other"
                        );
                        ctx.setContactDialogName(sp.name);
                        ctx.setContactDialogOpen(true);
                        ctx.setPendingSuggestedPartyIndex(originalIndex);
                      }}
                      className="h-7 px-2 text-xs"
                    >
                      <Plus size={12} />
                      {lang === "en" ? "Add" : "Anlegen"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isArchived}
                      onClick={() => ctx.confirmSuggestedParty(originalIndex, false)}
                      className="h-7 px-2 text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                    >
                      <X size={12} />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Semantic Contradictions */}
      <div className="max-w-3xl space-y-4">
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-[color:var(--ds-text-secondary)]" />
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("strategytab.semantic_contradictions")}
              </h3>
            </div>
            {ctx.probeLastRun && (
              <span className="text-xs text-[color:var(--ds-text-secondary)]">
                {t("strategytab.last_probe")}{" "}
                {new Date(ctx.probeLastRun).toLocaleDateString(lang === "en" ? "en-US" : "de-DE", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          {ctx.probeLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[color:var(--ds-text-secondary)]">
              <Loader2 size={14} className="animate-spin" />
              {lang === "en"
                ? "Loading contradiction findings..."
                : "Widersprüche werden geladen..."}
            </div>
          ) : ctx.probeFindings.length > 0 ? (
            <div className="space-y-2">
              {ctx.probeFindings.map((f, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge
                      variant={
                        f.severity === "high"
                          ? "danger"
                          : f.severity === "medium"
                            ? "warning"
                            : f.severity === "low"
                              ? "info"
                              : "default"
                      }
                    >
                      {f.severity.toUpperCase()}
                    </Badge>
                    {f.axis && (
                      <span className="text-xs text-[color:var(--ds-text-secondary)]">
                        {f.axis}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div>
                      <span className="font-medium text-[color:var(--ds-text)]">A: </span>
                      <span className="text-[color:var(--ds-text-secondary)]">
                        {f.chunk_a.slice(0, 200)}
                        {f.chunk_a.length > 200 ? "..." : ""}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-[color:var(--ds-text)]">B: </span>
                      <span className="text-[color:var(--ds-text-secondary)]">
                        {f.chunk_b.slice(0, 200)}
                        {f.chunk_b.length > 200 ? "..." : ""}
                      </span>
                    </div>
                    {f.explanation && (
                      <div className="pt-1 text-xs text-[color:var(--ds-text-secondary)] italic">
                        {f.explanation}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : ctx.probeAvailable ? (
            <div className="py-4 text-center text-sm text-[color:var(--ds-text-secondary)]">
              {lang === "en"
                ? "No contradictions found in the latest probe."
                : "Keine Widersprüche im letzten Scan gefunden."}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-[color:var(--ds-text-secondary)]">
              {lang === "en"
                ? "No contradiction probe has run yet. The nightly probe scans for semantic contradictions automatically."
                : "Es wurde noch kein Widerspruchs-Scan durchgeführt. Der nächtliche Scan sucht automatisch nach semantischen Widersprüchen."}
            </div>
          )}
        </div>

        {/* Field-Level Contradictions */}
        {caseData.contradictions && caseData.contradictions.length > 0 && (
          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-[color:var(--ds-text-secondary)]" />
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("strategytab.field_contradictions")}
                </h3>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={caseData.status === "archived"}
                onClick={async () => {
                  try {
                    await api.legal.contradictionsCheck(caseData.slug);
                    window.location.reload();
                  } catch (err) {
                    ctx.setSaveError(
                      err instanceof Error ? err.message : "Widerspruchsprüfung fehlgeschlagen"
                    );
                  }
                }}
                className="text-xs"
              >
                <RefreshCw size={12} />
                {t("strategytab.recheck")}
              </Button>
            </div>
            <div className="space-y-2">
              {caseData.contradictions.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge
                      variant={
                        c.severity === "high"
                          ? "danger"
                          : c.severity === "medium"
                            ? "warning"
                            : "info"
                      }
                    >
                      {c.severity.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-xs text-[color:var(--ds-text-secondary)]">
                      {c.field}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium text-[color:var(--ds-text)]">A: </span>
                      <span className="text-[color:var(--ds-text-secondary)]">{c.value_a}</span>
                    </div>
                    <div>
                      <span className="font-medium text-[color:var(--ds-text)]">B: </span>
                      <span className="text-[color:var(--ds-text-secondary)]">{c.value_b}</span>
                    </div>
                    {c.description && (
                      <div className="pt-1 text-xs text-[color:var(--ds-text-secondary)] italic">
                        {c.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Litigation economics — pipeline layer 5c–5f outputs */}
      <div className="max-w-3xl">
        <ProzessOekonomieSection caseSlug={caseData.slug} lang={lang} />
      </div>

      {/* Pipeline Panel */}
      <div className="max-w-4xl space-y-4">
        <ActIntelligencePanel caseSlug={caseData.slug} />
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
            </div>
          }
        >
          <PipelinePanel
            caseSlug={caseData.slug}
            caseTitle={caseData.title}
            kanzleiName={caseData.ownLawyerName}
            recipientName={caseData.opponentName ?? undefined}
          />
        </Suspense>
      </div>

      {/* Matter Context + Chat */}
      <div className="max-w-3xl space-y-4">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
            </div>
          }
        >
          <MatterContextPanel caseSlug={caseData.slug} defaultOpen={true} />
        </Suspense>

        {/* Quick Actions Bar (migrated from former AI-Tab) */}
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--ds-text-muted)]">
              <Sparkles size={12} className="text-blue-600" />
              {t("aitab.quick_actions")}
            </div>
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.key}
                  variant="ghost"
                  size="sm"
                  disabled={isArchived}
                  onClick={() => handleQuickAction(action)}
                  className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                >
                  <Icon size={12} />
                  {lang === "en" ? action.labelEn : action.labelDe}
                </Button>
              );
            })}
          </div>
          {isArchived && (
            <p className="mt-2 text-xs text-amber-600">
              {lang === "en"
                ? "AI features are disabled for archived cases."
                : "KI-Funktionen sind für archivierte Akten deaktiviert."}
            </p>
          )}
        </div>

        <div className="h-[500px]">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
              </div>
            }
          >
            <ChatPanel
              key={queryNonce}
              context={{ type: "case", caseSlug: caseData.slug }}
              initialQuery={initialQuery}
              persistHistory
              features={{
                caseSelector: false,
                jurisdictionSelector: true,
                modelSelector: true,
                modeSelector: true,
                fileUpload: true,
                sessionHistory: true,
                tokenWidget: true,
                brainStatus: true,
                exampleQueries: true,
                exportChat: true,
                messageActions: true,
              }}
              className="h-full"
              title={`${t("cases.detail_chat_title")}: ${caseData.title}`}
            />
          </Suspense>
        </div>
      </div>

      {/* AI Query */}
      <div className="max-w-3xl space-y-4">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
            {t("cases.detail_query_desc")}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MessageSquare
                size={14}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
              />
              <input
                value={ctx.query}
                onChange={(e) => ctx.setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ctx.handleQuery()}
                placeholder={t("cases.detail_query_ph")}
                aria-label={t("cases.ask_case")}
                disabled={caseData?.status === "archived"}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
              />
            </div>
            <Button
              onClick={ctx.handleQuery}
              disabled={ctx.queryLoading || !ctx.query.trim() || caseData?.status === "archived"}
              className="brand-bg brand-bg gap-2 text-white"
            >
              {ctx.queryLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {t("cases.detail_query_send")}
            </Button>
          </div>
        </div>
        {ctx.queryResult && (
          <div className="brand-border brand-soft space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="brand-text text-xs font-medium">
                {t("cases.detail_query_ai_answer")}
              </span>
              <button
                onClick={() => ctx.queryResult && ctx.copyToClipboard(ctx.queryResult)}
                aria-label="Antwort kopieren"
                className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
              >
                {ctx.copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
              {ctx.queryResult}
            </div>
            {/* A.3: CitationPanel with grounding for strategy-tab AI query results — mandatory */}
            <CitationPanel
              data={
                {
                  grounding: grounding ?? null,
                  isStreaming: false,
                } satisfies CitationPanelData
              }
              compact
            />
            <div className="flex items-center justify-end pt-1">
              <RetrievalFeedbackButtons
                query={ctx.query}
                resultSlug={caseData?.slug ?? ("ai-answer" as string)}
                resultTitle={t("cases.detail_query_ai_answer")}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hearing Checklist, Case Handover, Client Meeting Prep */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HearingChecklist />
        <CaseHandover />
      </div>
      <ClientMeetingPrep />
      <HearingFollowupWorkflow />
    </div>
  );
}
