"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, Cpu, Info, Lock, Save, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/use-lang";
import {
  ModelProfileSaveError,
  useModelProfile,
  useUpdateModelProfile,
} from "@/lib/queries/settings";
import { modelDisplayName } from "@/lib/model-display";
import type {
  AreaChoice,
  ModelArea,
  ModelProfileAreaView,
  ModelProfileResponse,
} from "@/lib/model-profile-types";
import type { DashboardKey } from "@/content/dashboard";

type Draft = Partial<Record<ModelArea, AreaChoice>>;

/** Price level of a model relative to the cheapest priced model on the page. */
function priceLevels(pricing: ModelProfileResponse["pricing"]): Map<string, number> {
  const avg = new Map<string, number>();
  for (const [model, p] of Object.entries(pricing)) {
    if (p) avg.set(model, (p.input + p.output) / 2);
  }
  const min = Math.min(...avg.values());
  const levels = new Map<string, number>();
  if (!Number.isFinite(min) || min <= 0) return levels;
  for (const [model, a] of avg) levels.set(model, Math.max(1, Math.round(a / min)));
  return levels;
}

function saveErrorKey(err: unknown): DashboardKey {
  if (err instanceof ModelProfileSaveError) {
    if (err.code === "below_floor") return "settings.aimodel.error_below_floor";
    if (err.code === "area_locked") return "settings.aimodel.error_area_locked";
    if (err.status === 403) return "settings.aimodel.error_forbidden";
  }
  return "settings.aimodel.error_save";
}

export default function AIModelSettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const query = useModelProfile();
  const mutation = useUpdateModelProfile();
  const [draft, setDraft] = useState<Draft>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const data = query.data;
  const levels = useMemo(() => (data ? priceLevels(data.pricing) : new Map()), [data]);

  const changes = useMemo(() => {
    if (!data) return {} as Draft;
    const out: Draft = {};
    for (const area of data.areas) {
      const next = draft[area.id];
      if (next !== undefined && next !== area.choice) out[area.id] = next;
    }
    return out;
  }, [data, draft]);
  const changeCount = Object.keys(changes).length;

  const header = (
    <PageHeader
      title={t("settings.aimodel.title")}
      description={t("settings.aimodel.description")}
      breadcrumbs={[
        { label: t("breadcrumb.dashboard"), href: "/dashboard" },
        { label: t("settings.title"), href: "/dashboard/settings" },
        { label: t("settings.aimodel.breadcrumb") },
      ]}
    />
  );

  if (query.isLoading) {
    return (
      <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
        {header}
        <div className="space-y-3" role="status" aria-label={L("Wird geladen", "Loading")}>
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (query.isError || !data) {
    return (
      <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
        {header}
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-6 text-center"
        >
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            {t("settings.aimodel.error_load")}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>
            {t("settings.aimodel.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    if (changeCount === 0) return;
    setSavedAt(null);
    mutation.mutate(changes, {
      onSuccess: () => {
        setDraft({});
        setSavedAt(Date.now());
      },
    });
  };

  const locale = lang === "en" ? "en-GB" : "de-AT";
  const updatedAt = data.profile.updated_at
    ? new Date(data.profile.updated_at).toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      {header}

      <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
        <Info size={16} className="brand-text mt-0.5 shrink-0" aria-hidden />
        <div className="space-y-1.5 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          <p>{t("settings.aimodel.intro")}</p>
          <p>{t("settings.aimodel.per_user_hint")}</p>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            {updatedAt
              ? data.updatedByName
                ? t("settings.aimodel.last_changed")
                    .replace("{date}", updatedAt)
                    .replace("{name}", data.updatedByName)
                : t("settings.aimodel.last_changed_no_name").replace("{date}", updatedAt)
              : t("settings.aimodel.never_changed")}
          </p>
          {!data.canEdit && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text)]">
              <Lock size={12} aria-hidden />
              {t("settings.aimodel.readonly")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {data.areas.map((area) => (
          <AreaCard
            key={area.id}
            area={area}
            value={draft[area.id] ?? area.choice}
            dirty={changes[area.id] !== undefined}
            disabled={!data.canEdit || mutation.isPending}
            levels={levels}
            onChange={(choice) => {
              setSavedAt(null);
              mutation.reset();
              setDraft((d) => ({ ...d, [area.id]: choice }));
            }}
          />
        ))}
      </div>

      {data.canEdit && (changeCount > 0 || mutation.isError || savedAt !== null) && (
        <div className="sticky bottom-4 z-30 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]/95 shadow-[var(--ds-shadow-3)] backdrop-blur">
          <div
            className="flex flex-wrap items-center gap-3 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            {mutation.isError ? (
              <p className="text-sm text-[color:var(--ds-danger-text)]" role="alert">
                {t(saveErrorKey(mutation.error))}
              </p>
            ) : changeCount > 0 ? (
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {changeCount === 1
                  ? t("settings.aimodel.unsaved_one")
                  : t("settings.aimodel.unsaved_many").replace("{n}", String(changeCount))}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-[color:var(--ds-success-text)]">
                <CheckCircle2 size={14} aria-hidden />
                {t("settings.aimodel.toast_saved")}
              </p>
            )}
            <div className="ml-auto flex items-center gap-2">
              {changeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setDraft({});
                    mutation.reset();
                  }}
                >
                  {t("settings.aimodel.btn_discard")}
                </Button>
              )}
              {changeCount > 0 && (
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleSave}
                  disabled={mutation.isPending}
                  loading={mutation.isPending}
                >
                  {!mutation.isPending && <Save size={14} aria-hidden />}
                  {mutation.isPending
                    ? t("settings.aimodel.btn_saving")
                    : t("settings.aimodel.btn_save")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AreaCard({
  area,
  value,
  dirty,
  disabled,
  levels,
  onChange,
}: {
  area: ModelProfileAreaView;
  value: AreaChoice;
  dirty: boolean;
  disabled: boolean;
  levels: Map<string, number>;
  onChange: (choice: AreaChoice) => void;
}) {
  const { t } = useLang();
  const titleKey = `settings.aimodel.area.${area.id}.title` as DashboardKey;
  const descKey = `settings.aimodel.area.${area.id}.desc` as DashboardKey;
  const floorModel = area.options.find((o) => o.choice === area.floor)?.models[0];
  const legendId = `model-area-${area.id}`;

  return (
    <fieldset
      className={cn(
        "rounded-2xl border bg-[color:var(--ds-surface)] p-5 transition-[border-color] motion-reduce:transition-none",
        dirty ? "brand-border" : "border-[color:var(--ds-border)]"
      )}
      aria-describedby={`${legendId}-desc`}
    >
      <legend
        id={legendId}
        className="mb-1 flex flex-wrap items-center gap-2 text-base font-semibold text-[color:var(--ds-text)]"
      >
        {t(titleKey)}
        {area.locked ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
            <Lock size={10} aria-hidden />
            {t("settings.aimodel.locked_badge")}
          </span>
        ) : (
          area.floor !== "utility" &&
          floorModel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-success-text)]">
              <ShieldCheck size={10} aria-hidden />
              {t("settings.aimodel.floor_note").replace("{model}", modelDisplayName(floorModel))}
            </span>
          )
        )}
      </legend>
      <p
        id={`${legendId}-desc`}
        className="mb-4 text-sm leading-relaxed text-[color:var(--ds-text-muted)]"
      >
        {t(descKey)}
      </p>

      <div
        className={cn(
          "grid gap-2",
          area.options.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
          area.options.length === 1 && "sm:grid-cols-1"
        )}
      >
        {area.options.map((option) => {
          const checked = value === option.choice;
          const isAuto = option.choice === "auto";
          const level = !isAuto && option.models[0] ? levels.get(option.models[0]) : undefined;
          const optionDisabled = disabled || area.locked;
          return (
            <label
              key={option.choice}
              className={cn(
                "relative flex min-h-[76px] flex-col gap-1 rounded-xl border-2 px-3.5 py-3 text-left transition-[background-color,border-color] focus-within:ring-2 focus-within:ring-[color:var(--brand-primary)] motion-reduce:transition-none",
                checked
                  ? "brand-border brand-soft"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
                optionDisabled
                  ? "cursor-default"
                  : "cursor-pointer hover:border-[color:var(--ds-border-strong)]"
              )}
            >
              <input
                type="radio"
                name={legendId}
                value={option.choice}
                checked={checked}
                disabled={optionDisabled}
                onChange={() => onChange(option.choice)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-semibold",
                    checked ? "brand-text" : "text-[color:var(--ds-text)]"
                  )}
                >
                  {!isAuto && <Cpu size={13} aria-hidden />}
                  {isAuto
                    ? t("settings.aimodel.option_auto")
                    : modelDisplayName(option.models[0] ?? option.choice)}
                </span>
                {checked && (
                  <span className="brand-bg flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                    <Check size={12} className="text-white" aria-hidden />
                  </span>
                )}
              </span>
              <span className="text-xs leading-snug text-[color:var(--ds-text-muted)]">
                {isAuto
                  ? area.locked
                    ? option.models.map(modelDisplayName).join(" · ")
                    : `${t("settings.aimodel.option_auto_hint")}: ${option.models
                        .map(modelDisplayName)
                        .join(" · ")}`
                  : level !== undefined
                    ? t("settings.aimodel.price_factor").replace("{n}", String(level))
                    : t("settings.aimodel.price_unknown")}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
