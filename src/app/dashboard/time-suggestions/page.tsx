"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, Check, X, Loader2, Timer, TrendingUp } from "lucide-react";
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
      .then((response) => response.json())
      .then((data) => setEnabled(data.data?.enabled === true));
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
      title: next ? "Passive Zeiterfassung aktiviert" : "Passive Zeiterfassung pausiert",
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
      addToast({
        type: "error",
        title: "Fehler",
        description: e instanceof Error ? e.message : undefined,
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
      addToast({
        type: "error",
        title: "Fehler",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setActing(null);
    }
  }

  const pending = suggestions.filter((s) => s.status === "suggested");
  const totalMinutes = pending.reduce((acc, s) => acc + s.duration_minutes, 0);

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("time_sugg.title")}
        description={t("time_sugg.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("time_sugg.title") },
        ]}
      />

      <div className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div>
          <p className="text-sm font-medium">Persönliches Opt-in</p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Nur bei Aktivierung verarbeitet der Nachtlauf Ihre Aktivitätssignale.
          </p>
        </div>
        <Button
          variant={enabled ? "secondary" : "primary"}
          onClick={() => void togglePassiveTime()}
        >
          {enabled ? "Pausieren" : "Aktivieren"}
        </Button>
      </div>

      {/* Summary */}
      {pending.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <Clock size={12} /> Offene Vorschläge
            </div>
            <div className="mt-1 text-lg font-bold text-[color:var(--ds-text)]">
              {pending.length}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <Timer size={12} /> Gesamtzeit
            </div>
            <div className="mt-1 text-lg font-bold text-[color:var(--ds-text)]">
              {formatDuration(totalMinutes)}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <TrendingUp size={12} /> Hohe Konfidenz
            </div>
            <div className="mt-1 text-lg font-bold text-[color:var(--ds-text)]">
              {pending.filter((s) => s.confidence === "high").length}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <Clock size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium text-[color:var(--ds-text)]">Keine Zeitvorschläge</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Vorschläge werden automatisch aus Ihren Aktivitäten generiert.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const isPending = s.status === "suggested";
            return (
              <div
                key={s.id}
                className={`flex items-start gap-3 rounded-xl border bg-[color:var(--ds-surface)] px-4 py-3 ${
                  isPending
                    ? "border-[color:var(--ds-border)]"
                    : "border-[color:var(--ds-border)] opacity-60"
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
                  <Clock size={14} className="text-[color:var(--ds-text-muted)]" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {s.date} · {s.start_time}–{s.end_time}
                    </span>
                    <Badge
                      variant="default"
                      className="brand-soft brand-border brand-text border text-xs"
                    >
                      {formatDuration(s.duration_minutes)}
                    </Badge>
                    <Badge
                      variant="default"
                      className="border text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {getActivityLabel(s.activity_type)}
                    </Badge>
                    {s.confidence === "high" && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                      >
                        Hohe Konfidenz
                      </Badge>
                    )}
                    {s.status === "accepted" && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                      >
                        <Check size={10} className="mr-1 inline" /> Übernommen
                      </Badge>
                    )}
                    {s.status === "rejected" && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                      >
                        <X size={10} className="mr-1 inline" /> Abgelehnt
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">{s.description}</p>
                  {s.case_slug && (
                    <p className="text-xs text-[color:var(--ds-info-text)]">Akte: {s.case_slug}</p>
                  )}
                </div>
                {isPending && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={acting === s.id}
                      onClick={() => void acceptSuggestion(s)}
                    >
                      {acting === s.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Übernehmen
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={acting === s.id}
                      onClick={() => void rejectSuggestion(s)}
                    >
                      <X size={12} />
                    </Button>
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
