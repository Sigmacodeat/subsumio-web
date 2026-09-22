"use client";

import { useEffect, useRef } from "react";
import { ListTodo, Loader2, Sparkles } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { useCaseNextSteps, useTriggerCaseNextSteps } from "@/lib/queries/agents";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { renderMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { AI_BADGE_LABEL } from "@/lib/ai-act";

/**
 * Per-case "Nächste Schritte" widget (WP-5.25) — triggers a case-scoped
 * supervisor agent run and renders its prioritized recommendations.
 * AI output → grounding via useGroundedAnswer + CitationPanel (invariant).
 */
export function CaseNextStepsPanel({ caseSlug }: { caseSlug: string }) {
  const { t } = useLang();
  const runsQuery = useCaseNextSteps(caseSlug);
  const trigger = useTriggerCaseNextSteps(caseSlug);
  const { grounding, isGrounding, groundAnswer } = useGroundedAnswer();
  const groundedFor = useRef<string | null>(null);

  const runs = runsQuery.data ?? [];
  const latest = runs[0];
  const isRunning = runs.some((r) => r.status === "active" || r.status === "waiting");
  const result = latest?.result;

  useEffect(() => {
    if (result && groundedFor.current !== `${latest?.id}`) {
      groundedFor.current = `${latest?.id}`;
      void groundAnswer(result);
    }
  }, [result, latest?.id, groundAnswer]);

  return (
    <div className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-gradient-to-br from-[color:var(--brand-glow)] to-transparent p-4 shadow-[var(--card-shadow)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
            <ListTodo size={15} className="brand-text" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("cases.next_steps_title")}
            </h3>
            {isRunning && (
              <p className="flex items-center gap-1 text-xs text-[color:var(--ds-text-subtle)]">
                <Loader2 size={10} className="animate-spin" />
                {t("cases.next_steps_running")}
              </p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending || isRunning}
        >
          {trigger.isPending || isRunning ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          {result ? t("cases.next_steps_refresh") : t("cases.next_steps_generate")}
        </Button>
      </div>

      {trigger.isError && (
        <p role="alert" className="mb-2 text-xs text-[color:var(--ds-danger-text)]">
          {trigger.error instanceof Error ? trigger.error.message : "Error"}
        </p>
      )}

      {runsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-3" role="status">
          <Loader2 size={12} className="animate-spin text-[color:var(--brand-primary)]" />
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {t("cases.next_steps_loading")}
          </span>
        </div>
      ) : result ? (
        <>
          <div
            className="prose prose-sm max-w-none text-[color:var(--ds-text-muted)] [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[color:var(--ds-text)] [&_li]:text-xs [&_li]:leading-relaxed [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(result) }}
          />
          <div className="mt-3 space-y-2">
            <CitationPanel
              data={
                {
                  grounding: grounding ?? null,
                  citations: [],
                  isStreaming: isGrounding,
                } satisfies CitationPanelData
              }
              compact
            />
            <Badge variant="default" className="text-[10px] text-[color:var(--ds-text-muted)]">
              {AI_BADGE_LABEL}
            </Badge>
          </div>
        </>
      ) : (
        <p className="py-2 text-xs text-[color:var(--ds-text-subtle)]">
          {t("cases.next_steps_empty")}
        </p>
      )}
    </div>
  );
}
