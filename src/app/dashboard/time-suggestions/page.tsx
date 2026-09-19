"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Clock, Check, X, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton } from "@/components/dashboard/skeleton";
import { Switch } from "@/components/ui/switch";
import { encodeSlugPath, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { getActivityLabel, formatDuration, type TimeSuggestion } from "@/lib/passive-time";

export default function TimeSuggestionsPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [suggestions, setSuggestions] = useState<TimeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "time_suggestion", limit: 100 });
      const items = pages
        .map((p) => p.frontmatter as unknown as TimeSuggestion)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSuggestions(items);
    } catch {
      addToast({ type: "error", title: t("time_sugg.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
    void fetch("/api/time-tracking/passive-preference")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setEnabled(data?.data?.enabled === true))
      .catch(() => setEnabled(false));
  }, [load]);

  async function togglePassiveTime() {
    const next = !enabled;
    const response = await csrfFetch("/api/time-tracking/passive-preference", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!response.ok)
      return addToast({ type: "error", title: "Einstellung konnte nicht gespeichert werden" });
    setEnabled(next);
    addToast({
      type: "success",
      title: next ? "Zeitvorschläge eingeschaltet" : "Zeitvorschläge ausgeschaltet",
    });
  }

  async function acceptSuggestion(suggestion: TimeSuggestion) {
    setActing(suggestion.id);
    try {
      // Create a time entry from the suggestion
      await api.time.create({
        date: suggestion.date,
        minutes: suggestion.duration_minutes,
        description: suggestion.description,
        case_slug: suggestion.case_slug ?? "",
        billable: true,
      });

      // Mark suggestion as accepted
      const updated = { ...suggestion, status: "accepted" as const };
      await api.brain.createPage({
        slug: `legal/time-suggestions/${suggestion.id}`,
        title: `Zeitvorschlag: ${suggestion.date} ${suggestion.start_time}-${suggestion.end_time}`,
        type: "time_suggestion",
        frontmatter: updated as unknown as Record<string, unknown>,
      });

      setSuggestions((prev) => prev.map((s) => (s.id === suggestion.id ? updated : s)));
      addToast({ type: "success", title: "Zeiteintrag übernommen" });
    } catch (e) {
      console.error("[time-suggestions] accept failed:", e instanceof Error ? e.message : e);
      addToast({
        type: "error",
        title: "Vorschlag konnte nicht übernommen werden",
        description: "Bitte versuchen Sie es erneut oder erfassen Sie die Zeit manuell.",
      });
    } finally {
      setActing(null);
    }
  }

  async function rejectSuggestion(suggestion: TimeSuggestion) {
    setActing(suggestion.id);
    try {
      const updated = { ...suggestion, status: "rejected" as const };
      await api.brain.createPage({
        slug: `legal/time-suggestions/${suggestion.id}`,
        title: `Zeitvorschlag: ${suggestion.date} ${suggestion.start_time}-${suggestion.end_time}`,
        type: "time_suggestion",
        frontmatter: updated as unknown as Record<string, unknown>,
      });

      setSuggestions((prev) => prev.map((s) => (s.id === suggestion.id ? updated : s)));
      addToast({ type: "success", title: "Vorschlag abgelehnt" });
    } catch (e) {
      console.error("[time-suggestions] reject failed:", e instanceof Error ? e.message : e);
      addToast({
        type: "error",
        title: "Vorschlag konnte nicht abgelehnt werden",
        description: "Bitte versuchen Sie es erneut.",
      });
    } finally {
      setActing(null);
    }
  }

  const pending = suggestions.filter((s) => s.status === "suggested");
  const totalMinutes = pending.reduce((acc, s) => acc + s.duration_minutes, 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("time_sugg.title")}
        description={t("time_sugg.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("time_sugg.title") },
        ]}
      />

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="min-w-0">
          <label htmlFor="passive-time" className="text-sm font-medium text-[color:var(--ds-text)]">
            Zeitvorschläge für mich erstellen
          </label>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {enabled
              ? "Aktiv: Ihre Arbeit an Akten wird nachts zu Vorschlägen gebündelt. Nichts wird ohne Ihre Übernahme gebucht."
              : "Aus: Es werden keine Aktivitäten ausgewertet. Nach dem Einschalten bündelt ein nächtlicher Lauf Ihre Arbeit an Akten zu Vorschlägen."}
          </p>
        </div>
        <Switch
          id="passive-time"
          checked={enabled}
          onCheckedChange={() => void togglePassiveTime()}
        />
      </div>

      {/* Summary */}
      {pending.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SuggStat label="Offene Vorschläge" value={String(pending.length)} />
          <SuggStat label="Vorgeschlagene Zeit" value={formatDuration(totalMinutes)} />
          <SuggStat
            label="Gut belegt"
            value={String(pending.filter((s) => s.confidence === "high").length)}
          />
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Vorschläge werden geladen">
          <RowSkeleton count={4} />
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Keine Zeitvorschläge"
          description={
            enabled
              ? "Sobald Sie an Akten arbeiten, erscheinen hier am nächsten Morgen Vorschläge zum Übernehmen."
              : "Schalten Sie die Zeitvorschläge ein, um aus Ihrer Aktenarbeit Buchungsvorschläge zu erhalten."
          }
          actionLabel={enabled ? undefined : "Einschalten"}
          onAction={enabled ? undefined : () => void togglePassiveTime()}
        />
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {suggestions.map((s) => {
            const isPending = s.status === "suggested";
            return (
              <li
                key={s.id}
                className={`flex items-start gap-3 px-4 py-3 ${isPending ? "" : "opacity-60"}`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)] tabular-nums">
                      {formatDate(s.date)} · {s.start_time}–{s.end_time}
                    </span>
                    <Badge variant="default" className="border text-xs tabular-nums">
                      {formatDuration(s.duration_minutes)}
                    </Badge>
                    <Badge
                      variant="default"
                      className="border text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {getActivityLabel(s.activity_type)}
                    </Badge>
                    {isPending && s.confidence === "high" && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                      >
                        Gut belegt
                      </Badge>
                    )}
                    {s.status === "accepted" && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                      >
                        Übernommen
                      </Badge>
                    )}
                    {s.status === "rejected" && (
                      <Badge variant="default" className="border text-xs text-[color:var(--ds-text-muted)]">
                        Abgelehnt
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">{s.description}</p>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {s.case_slug ? (
                      <>
                        Akte:{" "}
                        <Link
                          href={`/dashboard/cases/${encodeSlugPath(s.case_slug)}`}
                          className="text-[color:var(--ds-text)] underline-offset-2 hover:underline"
                        >
                          {s.case_slug.split("/").pop()}
                        </Link>
                      </>
                    ) : (
                      "Keine Akte erkannt — bitte manuell in der Zeiterfassung buchen."
                    )}
                  </p>
                </div>
                {isPending && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="whitespace-nowrap"
                      disabled={acting === s.id || !s.case_slug}
                      title={s.case_slug ? undefined : "Ohne Akte nicht übernehmbar"}
                      onClick={() => void acceptSuggestion(s)}
                    >
                      {acting === s.id ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Check size={12} aria-hidden="true" />
                      )}
                      Übernehmen
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Vorschlag ablehnen"
                      title="Ablehnen"
                      disabled={acting === s.id}
                      onClick={() => void rejectSuggestion(s)}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SuggStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[color:var(--ds-text)] tabular-nums">{value}</div>
    </div>
  );
}
