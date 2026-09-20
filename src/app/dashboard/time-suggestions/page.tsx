"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Clock, Check, X, Loader2, Pencil } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton } from "@/components/dashboard/skeleton";
import { Switch } from "@/components/ui/switch";
import { encodeSlugPath, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CaseSelect } from "@/components/legal/case-select";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { useMe } from "@/lib/queries/auth";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { getActivityLabel, formatDuration, type TimeSuggestion } from "@/lib/passive-time";
import { draftError, draftFrom, type TimeDraft as Draft } from "@/lib/time-suggestion-draft";

export default function TimeSuggestionsPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [suggestions, setSuggestions] = useState<TimeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  // Suggestions are personal (built from the user's own activity): show only
  // the signed-in user's, never a colleague's.
  const myEmail = (useMe().data?.user?.email as string | undefined)?.toLowerCase();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const draftFor = (s: TimeSuggestion) => drafts[s.id] ?? draftFrom(s);
  const patchDraft = (s: TimeSuggestion, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [s.id]: { ...draftFor(s), ...patch } }));

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
    const draft = draftFor(suggestion);
    const invalid = draftError(draft);
    if (invalid) {
      setEditing(suggestion.id);
      addToast({ type: "error", title: invalid });
      return;
    }
    const minutes = Number(draft.minutes);
    const modified =
      draft.case_slug !== (suggestion.case_slug ?? "") ||
      minutes !== suggestion.duration_minutes ||
      draft.description.trim() !== suggestion.description ||
      !draft.billable;
    setActing(suggestion.id);
    let entryId: string | undefined;
    try {
      const entry = await api.time.create({
        date: suggestion.date,
        minutes,
        description: draft.description.trim(),
        case_slug: draft.case_slug,
        billable: draft.billable,
      });
      entryId = entry.id;
    } catch (e) {
      console.error("[time-suggestions] accept failed:", e instanceof Error ? e.message : e);
      addToast({
        type: "error",
        title: "Vorschlag konnte nicht übernommen werden",
        description: "Bitte versuchen Sie es erneut oder erfassen Sie die Zeit manuell.",
      });
      setActing(null);
      return;
    }

    // The entry is booked. Record that on the suggestion so it cannot be
    // booked twice; if this write fails the booking still stands.
    const updated: TimeSuggestion = {
      ...suggestion,
      status: modified ? "modified" : "accepted",
      case_slug: draft.case_slug,
      duration_minutes: minutes,
      description: draft.description.trim(),
    };
    try {
      await api.brain.createPage({
        slug: `legal/time-suggestions/${suggestion.id}`,
        title: `Zeitvorschlag: ${suggestion.date} ${suggestion.start_time}-${suggestion.end_time}`,
        type: "time_suggestion",
        frontmatter: {
          ...(updated as unknown as Record<string, unknown>),
          time_entry_id: entryId,
          original: modified
            ? {
                case_slug: suggestion.case_slug ?? null,
                duration_minutes: suggestion.duration_minutes,
                description: suggestion.description,
              }
            : undefined,
        },
      });
      addToast({ type: "success", title: "Zeiteintrag übernommen" });
    } catch (e) {
      console.error("[time-suggestions] mark failed:", e instanceof Error ? e.message : e);
      addToast({
        type: "error",
        title: "Zeit gebucht, Vorschlag nicht aktualisiert",
        description:
          "Der Zeiteintrag ist gespeichert. Bitte übernehmen Sie diesen Vorschlag nicht noch einmal.",
      });
    }
    setSuggestions((prev) => prev.map((s) => (s.id === suggestion.id ? updated : s)));
    setEditing(null);
    setActing(null);
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

  const mine = myEmail
    ? suggestions.filter((s) => (s.user_email ?? "").toLowerCase() === myEmail)
    : [];
  const pending = mine.filter((s) => s.status === "suggested");
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

      {loading || !myEmail ? (
        <div role="status" aria-label="Vorschläge werden geladen">
          <RowSkeleton count={4} />
        </div>
      ) : mine.length === 0 ? (
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
          {mine.map((s) => {
            const isPending = s.status === "suggested";
            const draft = draftFor(s);
            // A suggestion without a matter opens straight in edit mode.
            const isEditing = isPending && (editing === s.id || !s.case_slug);
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
                    {s.status === "modified" && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                      >
                        Geändert übernommen
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
                  {isEditing ? (
                    <TimeDraftEditor
                      id={s.id}
                      draft={draft}
                      suggestedCase={s.case_slug}
                      onChange={(patch) => patchDraft(s, patch)}
                    />
                  ) : (
                    <>
                      <p className="text-xs text-[color:var(--ds-text-muted)]">{s.description}</p>
                      {s.case_slug && (
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          Akte:{" "}
                          <Link
                            href={`/dashboard/cases/${encodeSlugPath(s.case_slug)}`}
                            className="text-[color:var(--ds-text)] underline-offset-2 hover:underline"
                          >
                            {s.case_slug.split("/").pop()}
                          </Link>
                        </p>
                      )}
                    </>
                  )}
                </div>
                {isPending && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="whitespace-nowrap"
                      disabled={acting === s.id || draftError(draft) !== null}
                      title={draftError(draft) ?? undefined}
                      onClick={() => void acceptSuggestion(s)}
                    >
                      {acting === s.id ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Check size={12} aria-hidden="true" />
                      )}
                      Übernehmen
                    </Button>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Vorschlag vor dem Übernehmen ändern"
                        title="Ändern"
                        disabled={acting === s.id}
                        onClick={() => setEditing(s.id)}
                      >
                        <Pencil size={14} />
                      </Button>
                    )}
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

function TimeDraftEditor({
  id,
  draft,
  suggestedCase,
  onChange,
}: {
  id: string;
  draft: Draft;
  suggestedCase?: string;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const error = draftError(draft);
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,2fr)_7rem]">
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`ts-case-${id}`} className="text-xs text-[color:var(--ds-text-muted)]">
          Akte{suggestedCase ? "" : " (nicht erkannt, bitte wählen)"}
        </label>
        <CaseSelect
          id={`ts-case-${id}`}
          value={draft.case_slug}
          onChange={(case_slug) => onChange({ case_slug })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`ts-desc-${id}`} className="text-xs text-[color:var(--ds-text-muted)]">
          Tätigkeit
        </label>
        <Input
          id={`ts-desc-${id}`}
          value={draft.description}
          maxLength={500}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`ts-min-${id}`} className="text-xs text-[color:var(--ds-text-muted)]">
          Minuten
        </label>
        <Input
          id={`ts-min-${id}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          step={1}
          value={draft.minutes}
          onChange={(e) => onChange({ minutes: e.target.value })}
          className="tabular-nums"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-[color:var(--ds-text)] sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.billable}
          onChange={(e) => onChange({ billable: e.target.checked })}
          className="h-4 w-4 accent-[color:var(--brand-primary)]"
        />
        Abrechenbar
      </label>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)] sm:col-span-2">
          {error}
        </p>
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
