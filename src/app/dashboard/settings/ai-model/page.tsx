"use client";

import { useState } from "react";
import { Cpu, Check, Zap, DollarSign, Gauge, Shield, Loader2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  useModelPreference,
  useUpdateModelPreference,
  type ModelPreferenceResponse,
} from "@/lib/queries/settings";
import {
  formatCost,
  formatContextWindow,
  getSpeedLabel,
  getProviderLabel,
} from "@/lib/model-config";

export default function AIModelSettingsPage() {
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

  if (query.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-6 py-8">
        <PageHeader
          title="KI-Modell"
          description="Wähle das primäre AI-Modell für dein Brain."
          breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "KI-Modell" }]}
        />
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-600">Modelle konnten nicht geladen werden.</p>
          <button
            onClick={() => query.refetch()}
            className="mt-3 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="KI-Modell"
        description="Wähle das primäre AI-Modell für dein Brain. Der Override im Query-UI hat Vorrang für einzelne Anfragen."
        breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "KI-Modell" }]}
        actions={
          saving ? (
            <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <Loader2 size={12} className="animate-spin" />
              Speichern…
            </div>
          ) : mutation.isSuccess ? (
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <Check size={12} />
              Gespeichert
            </div>
          ) : undefined
        }
      />

      {/* Auto / Default card */}
      <div
        className={cn(
          "mb-4 cursor-pointer rounded-2xl border-2 p-5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
                  Auto (Engine-Default)
                </h3>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                Die Subsumio Engine wählt automatisch das optimale Modell basierend auf
                Query-Komplexität und Größe der Wissensbasis.
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {models.map((model) => {
          const isActive = model.id === activeId;
          const isSavingThis = saving && selectedId === model.id;
          return (
            <div
              key={model.id}
              className={cn(
                "group cursor-pointer rounded-2xl border-2 p-5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors",
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
                      <span className="text-xs font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                        {getProviderLabel(model.provider as never)}
                      </span>
                      {"dataResidency" in model && model.dataResidency === "eu" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
                          <Globe size={9} />
                          EU
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Gauge size={11} className="text-[color:var(--ds-text-subtle)]" />
                    <span className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      Context
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
                      Cost/1M
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[color:var(--ds-text)] tabular-nums">
                    {formatCost(model.costPer1MInput)}
                    <span className="text-xs text-[color:var(--ds-text-subtle)]"> in</span>
                  </p>
                  <p className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                    {formatCost(model.costPer1MOutput)}
                    <span className="text-[color:var(--ds-text-subtle)]"> out</span>
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Zap size={11} className="text-[color:var(--ds-text-subtle)]" />
                    <span className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      Speed
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          i < model.speedRating
                            ? "bg-emerald-500"
                            : "bg-[color:var(--ds-border-strong)]"
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {getSpeedLabel(model.speedRating as 1 | 2 | 3 | 4 | 5)}
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
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info note */}
      <div className="mt-6 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
        <div className="flex items-start gap-3">
          <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
            <Cpu size={14} className="brand-text" />
          </div>
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              Brain-scoped Preference
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              Die Modell-Auswahl gilt für dein gesamtes Brain. Im Query-UI kannst du pro Anfrage
              einen Override setzen, ohne die globale Einstellung zu ändern. Die Engine benötigt den
              konfigurierten API-Key des jeweiligen Providers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
