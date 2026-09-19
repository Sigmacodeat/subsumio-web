"use client";

import { useState } from "react";
import { Cpu, Check, Zap, DollarSign, Gauge, Shield, Loader2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import {
  useModelPreference,
  useUpdateModelPreference,
  type ModelPreferenceResponse,
} from "@/lib/queries/settings";
import {
  formatCost,
  formatContextWindow,
  getProviderLabel,
} from "@/lib/model-config";

const SPEED_LABELS: Record<number, { de: string; en: string }> = {
  1: { de: "sehr langsam", en: "very slow" },
  2: { de: "langsam", en: "slow" },
  3: { de: "mittel", en: "medium" },
  4: { de: "schnell", en: "fast" },
  5: { de: "sehr schnell", en: "very fast" },
};

const CAPABILITY_LABELS: Record<string, { de: string; en: string }> = {
  "tool-use": { de: "Aktenzugriff", en: "Tool use" },
  vision: { de: "Liest Bilder und Scans", en: "Reads images and scans" },
  "extended-thinking": { de: "Gründliche Abwägung", en: "Extended reasoning" },
  "structured-output": { de: "Strukturierte Ausgabe", en: "Structured output" },
};

export default function AIModelSettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const query = useModelPreference();
  const mutation = useUpdateModelPreference();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = query.data?.data as ModelPreferenceResponse | undefined;
  const models = data?.models ?? [];
  const serverPreferredId = data?.preferredModelId ?? "auto";
  const activeId = selectedId ?? serverPreferredId;

  const saving = mutation.isPending;

  function handleSelect(modelId: string) {
    setSelectedId(modelId);
    if (modelId === "auto") {
      // "auto" means no explicit preference — clear it
      // We still send it; the server treats "auto" as DEFAULT_MODEL_ID
      mutation.mutate("auto", {
        onError: () => setSelectedId(null),
      });
    } else {
      mutation.mutate(modelId, {
        onError: () => setSelectedId(null),
      });
    }
  }

  const description = L(
    "Legt fest, welches KI-Modell Assistent, Dokumentanalyse und Entwürfe standardmäßig verwenden.",
    "Sets which AI model the assistant, document analysis and drafts use by default."
  );
  const breadcrumbs = [
    { label: t("breadcrumb.dashboard"), href: "/dashboard" },
    { label: t("settings.title"), href: "/dashboard/settings" },
    { label: t("settings.aimodel.breadcrumb") },
  ];

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-[720px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("settings.aimodel.title")}
          description={description}
          breadcrumbs={breadcrumbs}
        />
        <div className="space-y-3" role="status" aria-label={L("Wird geladen", "Loading")}>
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-[720px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("settings.aimodel.title")}
          description={description}
          breadcrumbs={breadcrumbs}
        />
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-6 text-center"
        >
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            {L(
              "Die verfügbaren Modelle konnten nicht geladen werden.",
              "The available models could not be loaded."
            )}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>
            {L("Erneut versuchen", "Try again")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("settings.aimodel.title")}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={
          saving ? (
            <div
              className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]"
              role="status"
              aria-live="polite"
            >
              <Loader2 size={12} className="animate-spin" />
              {t("settings.kanzlei.btn_saving")}
            </div>
          ) : mutation.isError ? (
            <div role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
              {t("settings.aimodel.error_save")}
            </div>
          ) : mutation.isSuccess ? (
            <div className="flex items-center gap-2 text-xs text-[color:var(--ds-success-text)]">
              <Check size={12} />
              {t("settings.aimodel.toast_saved")}
            </div>
          ) : undefined
        }
      />

      {/* Auto / Default card */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={activeId === "auto"}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelect("auto");
          }
        }}
        className={cn(
          "cursor-pointer rounded-2xl border-2 p-5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
          activeId === "auto"
            ? "brand-border brand-soft"
            : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
        )}
        onClick={() => handleSelect("auto")}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                activeId === "auto"
                  ? "brand-bg"
                  : "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
              )}
            >
              <Cpu
                size={20}
                className={activeId === "auto" ? "text-white" : "text-[color:var(--ds-text-muted)]"}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    "text-base font-semibold",
                    activeId === "auto" ? "brand-text" : "text-[color:var(--ds-text)]"
                  )}
                >
                  {L("Automatisch (empfohlen)", "Automatic (recommended)")}
                </h3>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                {L(
                  "Subsumio wählt je Anfrage das passende Modell – für einfache Fragen ein schnelles, für umfangreiche Akten ein leistungsstärkeres.",
                  "Subsumio picks a suitable model for each request – a fast one for simple questions, a stronger one for large matters."
                )}
              </p>
            </div>
          </div>
          {activeId === "auto" && (
            <div className="brand-bg flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Check size={14} className="text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Model cards grid */}
      <div className="grid grid-cols-1 gap-4">
        {models.map((model) => {
          const isActive = model.id === activeId;
          const isSavingThis = saving && selectedId === model.id;
          return (
            <div
              key={model.id}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(model.id);
                }
              }}
              className={cn(
                "group cursor-pointer rounded-2xl border-2 p-5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                isActive
                  ? "brand-border brand-soft"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
              )}
              onClick={() => handleSelect(model.id)}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-[background-color,border-color,color] motion-reduce:transition-none",
                      isActive
                        ? "brand-bg"
                        : "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] group-hover:border-[color:var(--ds-border-strong)]"
                    )}
                  >
                    <Cpu
                      size={20}
                      className={isActive ? "text-white" : "text-[color:var(--ds-text-muted)]"}
                    />
                  </div>
                  <div>
                    <h3
                      className={cn(
                        "text-base font-semibold",
                        isActive ? "brand-text" : "text-[color:var(--ds-text)]"
                      )}
                    >
                      {model.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                        {getProviderLabel(model.provider as never)}
                      </span>
                      {"dataResidency" in model && model.dataResidency === "eu" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-1.5 py-0.5 text-xs font-medium text-[color:var(--ds-success-text)]">
                          <Globe size={9} />
                          EU
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2" role="status" aria-live="polite">
                  {isSavingThis && (
                    <Loader2 size={14} className="animate-spin text-[color:var(--ds-text-muted)]" />
                  )}
                  {isActive && !isSavingThis && (
                    <div className="brand-bg flex h-6 w-6 items-center justify-center rounded-full">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </div>
              </div>

              <p className="mb-4 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                {model.description}
              </p>

              {/* Stats row */}
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Gauge size={11} className="text-[color:var(--ds-text-subtle)]" />
                    <span className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      {L("Textumfang", "Context")}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[color:var(--ds-text)] tabular-nums">
                    {formatContextWindow(model.contextWindow)}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <DollarSign size={11} className="text-[color:var(--ds-text-subtle)]" />
                    <span className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      {L("Kosten je 1 Mio. Einheiten", "Cost per 1M units")}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[color:var(--ds-text)] tabular-nums">
                    {formatCost(model.costPer1MInput)}
                    <span className="text-xs text-[color:var(--ds-text-subtle)]">
                      {" "}
                      {L("Eingabe", "input")}
                    </span>
                  </p>
                  <p className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                    {formatCost(model.costPer1MOutput)}
                    <span className="text-[color:var(--ds-text-subtle)]">
                      {" "}
                      {L("Ausgabe", "output")}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Zap size={11} className="text-[color:var(--ds-text-subtle)]" />
                    <span className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      {L("Tempo", "Speed")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          i < model.speedRating
                            ? "bg-[color:var(--ds-success-solid)]"
                            : "bg-[color:var(--ds-border-strong)]"
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {SPEED_LABELS[model.speedRating]?.[lang === "en" ? "en" : "de"] ?? ""}
                  </p>
                </div>
              </div>

              {/* Capabilities */}
              <div className="flex flex-wrap items-center gap-1.5">
                {model.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-text-muted)]"
                  >
                    <Shield size={9} />
                    {CAPABILITY_LABELS[cap]?.[lang === "en" ? "en" : "de"] ?? cap}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info note */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
        <div className="flex items-start gap-3">
          <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
            <Cpu size={14} className="brand-text" />
          </div>
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {L("Gilt für die ganze Kanzlei", "Applies to the whole firm")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {L(
                "Im Assistenten können Sie für eine einzelne Anfrage ein anderes Modell wählen, ohne diese Einstellung zu ändern. Ein Modell funktioniert nur, wenn der Zugangsschlüssel des jeweiligen Anbieters hinterlegt ist.",
                "In the assistant you can choose a different model for a single request without changing this setting. A model only works if the provider's access key is set up."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
