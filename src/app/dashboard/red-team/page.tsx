"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Shield, AlertTriangle, FileText, Send, Scale } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import {
  RED_TEAM_MAX_CONTEXT_CHARS,
  RED_TEAM_MAX_DRAFT_CHARS,
  type RedTeamResult,
  type RedTeamAnnotation,
} from "@/lib/red-team-agent";
import { csrfFetch } from "@/lib/csrf";
import { LoadErrorNotice } from "@/components/dashboard/load-error-notice";

import { unwrapApiBody } from "@/lib/api-body";
import { CaseSelect } from "@/components/legal/case-select";
const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  medium: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  low: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "hoch",
  medium: "mittel",
  low: "gering",
};

/** The route's German error text: a field issue first, else the message. */
async function errorText(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: unknown;
    details?: { issues?: Array<{ message?: unknown }> };
  } | null;
  const issue = body?.details?.issues?.[0]?.message;
  if (typeof issue === "string" && issue) return issue;
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

const TYPE_LABELS: Record<string, string> = {
  weakness: "Schwäche",
  counterargument: "Gegenargument",
  missing_argument: "Fehlendes Argument",
  risk: "Risiko",
  precedent: "Präzedenzfall",
};

export default function RedTeamPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [results, setResults] = useState<RedTeamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState({
    case_slug: "",
    draft_text: "",
    case_context: "",
    legal_area: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const pages = await api.brain.listPages({ type: "red_team_result", limit: 50 });
      setResults(pages.map((p) => p.frontmatter as unknown as RedTeamResult));
    } catch {
      // A failed load is not an empty list: shown as an error with retry.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!form.case_slug || !form.draft_text || !form.case_context) {
      addToast({ type: "error", title: t("redteam.err_required") });
      return;
    }
    setAnalyzing(true);
    try {
      const res = await csrfFetch("/api/red-team", {
        method: "POST",
        // Long-running: csrfFetch would otherwise abort after 30s.
        signal: AbortSignal.timeout(300_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: form.case_slug,
          draft_text: form.draft_text,
          case_context: form.case_context,
          legal_area: form.legal_area || undefined,
        }),
      });
      if (!res.ok) {
        const clone = res.clone();
        const message = await errorText(res, t("redteam.err_analyze"));
        // Created but not filed: show it anyway, and say it is not saved.
        const unsaved = (await clone.json().catch(() => null)) as {
          details?: { result?: RedTeamResult };
        } | null;
        if (unsaved?.details?.result) {
          setResults((prev) => [unsaved.details!.result!, ...prev]);
        }
        addToast({ type: "error", title: message });
        return;
      }
      const data = unwrapApiBody(await res.json());
      setResults((prev) => [data.result, ...prev]);
      setForm({ case_slug: "", draft_text: "", case_context: "", legal_area: "" });
      addToast({ type: "success", title: t("redteam.ok_analyze") });
    } catch {
      addToast({ type: "error", title: t("redteam.err_analyze") });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("redteam.title")}
        description={t("redteam.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: "Red-Team" },
        ]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5" /> {t("redteam.new")}
        </h2>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="redteam-case">{t("redteam.case_slug")} *</Label>
            <CaseSelect
              id="redteam-case"
              value={form.case_slug}
              onChange={(case_slug) => setForm({ ...form, case_slug })}
            />
          </div>
          <div>
            <Label>{t("redteam.legal_area")}</Label>
            <Input
              value={form.legal_area}
              onChange={(e) => setForm({ ...form, legal_area: e.target.value })}
              placeholder="z.B. Mietrecht, Arbeitsrecht"
            />
          </div>
          <div>
            <Label>{t("redteam.context")} *</Label>
            <textarea
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-sm"
              rows={3}
              maxLength={RED_TEAM_MAX_CONTEXT_CHARS}
              value={form.case_context}
              onChange={(e) => setForm({ ...form, case_context: e.target.value })}
              placeholder={t("redteam.ph_summary")}
            />
            <p className="mt-1 text-right text-xs text-[color:var(--ds-text-subtle)]">
              {form.case_context.length.toLocaleString("de-AT")} /{" "}
              {RED_TEAM_MAX_CONTEXT_CHARS.toLocaleString("de-AT")} Zeichen
            </p>
          </div>
          <div>
            <Label>{t("redteam.draft")} *</Label>
            <textarea
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 font-mono text-sm"
              rows={6}
              maxLength={RED_TEAM_MAX_DRAFT_CHARS}
              value={form.draft_text}
              onChange={(e) => setForm({ ...form, draft_text: e.target.value })}
              placeholder={t("redteam.ph_pleading")}
            />
            <p className="mt-1 text-right text-xs text-[color:var(--ds-text-subtle)]">
              {form.draft_text.length.toLocaleString("de-AT")} /{" "}
              {RED_TEAM_MAX_DRAFT_CHARS.toLocaleString("de-AT")} Zeichen — längere Schriftsätze
              bitte abschnittsweise prüfen
            </p>
          </div>
          <Button onClick={submit} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("redteam.analyzing")}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> {t("redteam.submit")}
              </>
            )}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : loadError ? (
        <LoadErrorNotice message={t("redteam.err_load")} onRetry={() => void load()} />
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <FileText className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("redteam.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result, i) => (
            <RedTeamResultCard key={result.id} result={result} autoGround={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function RedTeamResultCard({
  result,
  autoGround,
}: {
  result: RedTeamResult;
  /** Only the newest result is checked on load; older ones on request
   *  (one citation check per stored result used to run on every visit). */
  autoGround: boolean;
}) {
  const { grounding, isGrounding, groundAnswer } = useGroundedAnswer();
  const [groundRequested, setGroundRequested] = useState(autoGround);

  useEffect(() => {
    if (!groundRequested) return;
    const groundingText = [
      result.summary,
      ...result.annotations.map((ann) =>
        [ann.annotation, ann.suggestion, ann.grounded_in].filter(Boolean).join(" — ")
      ),
    ].join("\n\n");
    groundAnswer(groundingText).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.id, groundRequested]);

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">{result.case_slug}</span>
          <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
            {new Date(result.created_at).toLocaleString("de-AT", { timeZone: "Europe/Vienna" })}
          </span>
        </div>
        <Badge className={SEVERITY_COLORS[result.overall_risk] ?? ""}>
          Risiko: {SEVERITY_LABELS[result.overall_risk] ?? result.overall_risk}
        </Badge>
      </div>
      <p className="text-xs text-[color:var(--ds-text-muted)]">{result.summary}</p>
      <div className="space-y-2">
        {result.annotations.map((ann: RedTeamAnnotation, idx: number) => (
          <div
            key={idx}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
          >
            <div className="flex items-center gap-2">
              <Badge className={SEVERITY_COLORS[ann.severity] ?? ""}>
                {SEVERITY_LABELS[ann.severity] ?? ann.severity}
              </Badge>
              <span className="text-xs font-medium">{TYPE_LABELS[ann.type] ?? ann.type}</span>
              <span className="text-xs text-[color:var(--ds-text-muted)]">· {ann.section}</span>
            </div>
            <p className="mt-1 text-sm">{ann.annotation}</p>
            {ann.suggestion && (
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                {ann.suggestion}
              </p>
            )}
            {ann.grounded_in && (
              <p className="mt-1 flex items-start gap-1 text-xs text-[color:var(--ds-text-muted)]">
                <Scale className="mt-0.5 h-3 w-3 shrink-0" />
                {ann.grounded_in}
              </p>
            )}
          </div>
        ))}
      </div>
      {!groundRequested && (
        <Button size="sm" variant="secondary" onClick={() => setGroundRequested(true)}>
          <Scale className="mr-1 h-3 w-3" /> Zitate prüfen
        </Button>
      )}
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
    </div>
  );
}
