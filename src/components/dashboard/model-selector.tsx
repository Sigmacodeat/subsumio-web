"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Cpu, Zap, DollarSign, Gauge, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
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

interface ModelSelectorProps {
  /** Optional override: when provided, this local state takes precedence over the server preference. */
  selectedModelId?: string;
  onSelect?: (modelId: string) => void;
  /** When true, selecting a model also persists to the server. Default: false (query-page override only). */
  persistToServer?: boolean;
  className?: string;
}

export function ModelSelector({
  selectedModelId,
  onSelect,
  persistToServer = false,
  className,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const query = useModelPreference();
  const mutation = useUpdateModelPreference();

  const data = query.data?.data as ModelPreferenceResponse | undefined;
  const models = data?.models ?? [];
  const serverPreferred = data?.preferredModelId;

  const activeModelId = selectedModelId ?? serverPreferred ?? "auto";
  const activeModel = models.find((m) => m.id === activeModelId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(modelId: string) {
    if (persistToServer) {
      mutation.mutate(modelId);
    }
    onSelect?.(modelId);
    setOpen(false);
  }

  if (query.isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)]",
          className
        )}
      >
        <Cpu size={12} className="animate-pulse" />
        Loading…
      </div>
    );
  }

  if (query.isError || !models.length) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)]",
          className
        )}
      >
        <Cpu size={12} />
        Auto
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)]"
        title={
          activeModel
            ? `${activeModel.name} · ${getProviderLabel(activeModel.provider as never)}`
            : "Modell wählen"
        }
      >
        <Cpu size={12} />
        {activeModel ? activeModel.name : "Auto"}
        <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="card-shadow-elevated absolute top-full right-0 z-50 mt-1 max-h-[28rem] w-80 overflow-hidden overflow-y-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {/* Auto / Default option */}
          <button
            onClick={() => handleSelect("auto")}
            className={cn(
              "flex w-full items-start gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 text-left transition-colors hover:bg-[color:var(--ds-hover)]",
              activeModelId === "auto" && "brand-soft"
            )}
          >
            <div className="flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  activeModelId === "auto" ? "brand-text" : "text-[color:var(--ds-text)]"
                )}
              >
                Auto (Engine-Default)
              </p>
              <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                Engine wählt automatisch das optimale Modell
              </p>
            </div>
            {activeModelId === "auto" && <Check size={14} className="brand-text mt-0.5 shrink-0" />}
          </button>

          {/* Model list */}
          {models.map((model) => {
            const isActive = model.id === activeModelId;
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[color:var(--ds-hover)]",
                  isActive && "brand-soft"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        isActive ? "brand-text" : "text-[color:var(--ds-text)]"
                      )}
                    >
                      {model.name}
                    </p>
                    <span className="shrink-0 text-xs font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      {getProviderLabel(model.provider as never)}
                    </span>
                    {"dataResidency" in model && model.dataResidency === "eu" && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-xs font-medium text-emerald-600">
                        <Globe size={8} />
                        EU
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                    {model.description}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                    <span className="flex items-center gap-1" title="Context Window">
                      <Gauge size={9} />
                      {formatContextWindow(model.contextWindow)}
                    </span>
                    <span
                      className="flex items-center gap-1"
                      title="Cost per 1M tokens (input/output)"
                    >
                      <DollarSign size={9} />
                      {formatCost(model.costPer1MInput)}/{formatCost(model.costPer1MOutput)}
                    </span>
                    <span className="flex items-center gap-1" title="Speed rating">
                      <Zap size={9} />
                      {getSpeedLabel(model.speedRating as 1 | 2 | 3 | 4 | 5)}
                    </span>
                  </div>
                </div>
                {isActive && <Check size={14} className="brand-text mt-0.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
