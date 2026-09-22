"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarDays, UserCheck, Plus, Loader2, Plane, AlertCircle, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { cn, daysUntil, formatDate } from "@/lib/utils";
import type { AbsenceRecord } from "@/lib/absence";
import type { DashboardKey } from "@/content/dashboard";

type DisplayStatus = AbsenceRecord["status"];

/**
 * Der gespeicherte Status wird nicht automatisch fortgeschrieben; maßgeblich für die
 * Anzeige ist der Zeitraum (Kalendertage, Ortszeit — der letzte Tag zählt mit).
 */
function displayStatus(a: AbsenceRecord): DisplayStatus {
  if (a.status === "cancelled") return "cancelled";
  const fromStart = daysUntil(a.start_date);
  const toEnd = daysUntil(a.end_date);
  if (fromStart === null || toEnd === null) return a.status;
  if (toEnd < 0) return "completed";
  if (fromStart <= 0) return "active";
  return "planned";
}

const STATUS_BADGE: Record<DisplayStatus, { labelKey: DashboardKey; className: string }> = {
  planned: {
    labelKey: "absence.status_planned",
    className:
      "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  },
  active: {
    labelKey: "absence.status_active",
    className:
      "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  },
  completed: {
    labelKey: "absence.status_completed",
    className:
      "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
  },
  cancelled: {
    labelKey: "absence.status_cancelled",
    className:
      "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  },
};

const STATUS_ORDER: Record<DisplayStatus, number> = {
  active: 0,
  planned: 1,
  completed: 2,
  cancelled: 3,
};

const EMPTY_FORM = {
  user_name: "",
  user_email: "",
  delegate_name: "",
  delegate_email: "",
  start_date: "",
  end_date: "",
  reason: "",
  notes: "",
};

export default function AbsencePage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [absences, setAbsences] = useState<Array<AbsenceRecord & { slug: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadAbsences = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "absence_record", limit: 100 });
      const records = pages
        .map((p) => ({
          ...(p.frontmatter as unknown as AbsenceRecord),
          slug: p.slug,
        }))
        .filter((r) => r.user_name && r.start_date && r.end_date);
      setAbsences(records);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAbsences();
  }, [loadAbsences]);

  async function handleCreate() {
    setFormError(null);
    if (
      !form.user_name.trim() ||
      !form.user_email.trim() ||
      !form.delegate_name.trim() ||
      !form.delegate_email.trim() ||
      !form.start_date ||
      !form.end_date
    ) {
      setFormError(t("absence.err_required"));
      return;
    }
    if (form.end_date < form.start_date) {
      setFormError("Das Enddatum liegt vor dem Beginn der Abwesenheit.");
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: form.user_name.trim(),
          user_email: form.user_email.trim(),
          delegate_name: form.delegate_name.trim(),
          delegate_email: form.delegate_email.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setFormError(
          res.status === 400 || res.status === 422
            ? "Bitte prüfen Sie die Eingaben — insbesondere die beiden E-Mail-Adressen und den Zeitraum."
            : "Die Abwesenheit konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."
        );
        return;
      }
      addToast({ type: "success", title: t("absence.created") });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      void loadAbsences();
    } catch {
      setFormError(
        "Die Abwesenheit konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."
      );
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...absences].sort(
    (a, b) =>
      STATUS_ORDER[displayStatus(a)] - STATUS_ORDER[displayStatus(b)] ||
      a.start_date.localeCompare(b.start_date)
  );
  const activeCount = absences.filter((a) => displayStatus(a) === "active").length;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("absence.title")}
        description="Erfassen Sie Urlaube und Abwesenheiten samt Vertretung, damit die Kanzlei weiß, wer während der Abwesenheit Fristen und Post übernimmt."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("absence.title") },
        ]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowCreate(!showCreate);
              setFormError(null);
            }}
            aria-expanded={showCreate}
            className="gap-2 whitespace-nowrap"
          >
            <Plus size={14} aria-hidden="true" />
            {t("absence.plan")}
          </Button>
        }
      />

      {activeCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] px-4 py-3">
          <AlertCircle
            size={16}
            className="mt-0.5 shrink-0 text-[color:var(--ds-attention-text)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[color:var(--ds-attention-text)]">
            {activeCount === 1
              ? "Eine Abwesenheit läuft gerade."
              : `${activeCount} Abwesenheiten laufen gerade.`}{" "}
            Fristen der abwesenden Person tragen in der Fristenliste den Hinweis „Vertretung“.
            Zuständig bleibt die Akte — die Übergabe selbst besprechen Sie wie gewohnt.
          </p>
        </div>
      )}

      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
          noValidate
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("absence.new")}
            </h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              aria-label="Formular schließen"
              className="rounded-md p-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="absence-user" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("absence.employee")} *
              </Label>
              <Input
                id="absence-user"
                value={form.user_name}
                onChange={(e) => setForm({ ...form, user_name: e.target.value })}
                placeholder={t("absence.ph_name")}
                required
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="absence-user-email"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                {t("absence.email")} *
              </Label>
              <Input
                id="absence-user-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={form.user_email}
                onChange={(e) => setForm({ ...form, user_email: e.target.value })}
                placeholder="max@kanzlei.at"
                required
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="absence-delegate"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                {t("absence.delegate")} *
              </Label>
              <Input
                id="absence-delegate"
                value={form.delegate_name}
                onChange={(e) => setForm({ ...form, delegate_name: e.target.value })}
                placeholder={t("absence.ph_representative")}
                required
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="absence-delegate-email"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                {t("absence.delegate_email")} *
              </Label>
              <Input
                id="absence-delegate-email"
                type="email"
                autoComplete="off"
                inputMode="email"
                value={form.delegate_email}
                onChange={(e) => setForm({ ...form, delegate_email: e.target.value })}
                placeholder="anna@kanzlei.at"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="absence-from" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("absence.from")} *
              </Label>
              <Input
                id="absence-from"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="absence-to" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("absence.to")} *
              </Label>
              <Input
                id="absence-to"
                type="date"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="absence-reason" className="text-xs text-[color:var(--ds-text-muted)]">
              {t("absence.reason")}
            </Label>
            <Input
              id="absence-reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={t("absence.reason_placeholder")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="absence-notes" className="text-xs text-[color:var(--ds-text-muted)]">
              {t("absence.notes")}
            </Label>
            <textarea
              id="absence-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              placeholder={t("absence.notes_placeholder")}
            />
          </div>
          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
            >
              {formError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {t("absence.save")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <span>Die Abwesenheiten konnten nicht geladen werden.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoading(true);
              void loadAbsences();
            }}
            className="shrink-0 text-[color:var(--ds-danger-text)]"
          >
            Erneut laden
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        !showCreate && (
          <EmptyState
            icon={Plane}
            title={t("absence.empty_title")}
            description="Erfassen Sie Urlaub oder Abwesenheit mit Vertretung, damit das Team weiß, wer zuständig ist."
            actionLabel={t("absence.plan")}
            onAction={() => setShowCreate(true)}
          />
        )
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {sorted.map((absence) => {
            const status = displayStatus(absence);
            const badge = STATUS_BADGE[status];
            const active = status === "active";
            const forwarded = absence.forwarded_deadlines?.length ?? 0;
            return (
              <li key={absence.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    active ? "bg-[color:var(--ds-attention-bg)]" : "bg-[color:var(--ds-surface-2)]"
                  )}
                  aria-hidden="true"
                >
                  {active ? (
                    <Plane size={14} className="text-[color:var(--ds-attention-text)]" />
                  ) : (
                    <CalendarDays size={14} className="text-[color:var(--ds-text-muted)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {absence.user_name}
                    </span>
                    <Badge variant="default" className={cn("border text-xs", badge.className)}>
                      {t(badge.labelKey)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[color:var(--ds-text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <UserCheck size={10} aria-hidden="true" />
                      {t("absence.delegate_label")} {absence.delegate_name}
                    </span>
                    {absence.reason && <span>· {absence.reason}</span>}
                    {forwarded > 0 && (
                      <span>
                        · {forwarded} {t("absence.deadlines_forwarded")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full pl-11 text-sm text-[color:var(--ds-text)] tabular-nums sm:w-auto sm:shrink-0 sm:pl-0 sm:text-right">
                  {formatDate(absence.start_date)} – {formatDate(absence.end_date)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
