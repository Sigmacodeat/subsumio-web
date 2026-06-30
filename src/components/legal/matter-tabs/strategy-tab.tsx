"use client";

import { lazy, Suspense } from "react";
import {
  Loader2,
  AlertTriangle,
  ListChecks,
  RefreshCw,
  MessageSquare,
  Send,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { RetrievalFeedbackButtons } from "@/components/legal/RetrievalFeedbackButtons";
import { api } from "@/lib/api";

const ChatPanel = lazy(() =>
  import("@/components/chat/chat-panel").then((m) => ({ default: m.ChatPanel }))
);
const MatterContextPanel = lazy(() =>
  import("@/components/legal/MatterContextPanel").then((m) => ({ default: m.MatterContextPanel }))
);
const PipelinePanel = lazy(() =>
  import("@/components/legal/PipelinePanel").then((m) => ({ default: m.PipelinePanel }))
);

export function StrategyTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Semantic Contradictions */}
      <div className="max-w-3xl space-y-4">
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-[color:var(--ds-text-secondary)]" />
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {lang === "en" ? "Semantic Contradictions" : "Semantische Widersprüche"}
              </h3>
            </div>
            {ctx.probeLastRun && (
              <span className="text-xs text-[color:var(--ds-text-secondary)]">
                {lang === "en" ? "Last probe:" : "Letzter Scan:"}{" "}
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
                  {lang === "en" ? "Field-Level Contradictions" : "Feld-Ebene Widersprüche"}
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
                {lang === "en" ? "Re-check" : "Neu prüfen"}
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

      {/* Pipeline Panel */}
      <div className="max-w-4xl space-y-4">
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
        <div className="h-[500px]">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
              </div>
            }
          >
            <ChatPanel
              context={{ type: "case", caseSlug: caseData.slug }}
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
                className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
              >
                {ctx.copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
              {ctx.queryResult}
            </div>
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
    </div>
  );
}
