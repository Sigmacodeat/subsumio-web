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
  /** "compact" = footer-style: pill trigger, dropdown opens upward, narrower panel */
  variant?: "default" | "compact";
}

export function ModelSelector({
  selectedModelId,
  onSelect,
  persistToServer = false,
  className,
  variant = "default",
}: ModelSelectorProps) {
  const isCompact = variant === "compact";
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
          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-[color:var(--ds-text-muted)]",
          isCompact && "bg-[color:var(--ds-surface-2)]",
          !isCompact &&
            "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs",
          className
        )}
      >
        <Cpu size={isCompact ? 11 : 12} className="animate-pulse" />
        Loading…
      </div>
    );
  }

  if (query.isError || !models.length) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-[color:var(--ds-text-muted)]",
          isCompact && "bg-[color:var(--ds-surface-2)]",
          !isCompact &&
            "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs",
          className
        )}
      >
        <Cpu size={isCompact ? 11 : 12} />
        Auto
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[color:var(--ds-text)]",
          isCompact
            ? "bg-[color:var(--ds-surface-2)] px-2 py-1 text-[11px] hover:bg-[color:var(--ds-hover)]"
            : "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs hover:border-[color:var(--ds-border-strong)]"
        )}
        title={
          activeModel
            ? `${activeModel.name} · ${getProviderLabel(activeModel.provider as never)}`
            : "Modell wählen"
        }
      >
        <Cpu size={isCompact ? 11 : 12} />
        {activeModel ? activeModel.name : "Auto"}
        <ChevronDown
          size={isCompact ? 10 : 11}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          className={cn(
            "card-shadow-elevated absolute z-50 max-h-[24rem] overflow-hidden overflow-y-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
            isCompact ? "bottom-full left-0 mb-1.5 w-72" : "top-full right-0 mt-1 w-80"
          )}
        >
          {/* Auto / Default option */}
          <button
            onClick={() => handleSelect("auto")}
            className={cn(
              "flex w-full items-start gap-2.5 border-b border-[color:var(--ds-border)] text-left transition-colors hover:bg-[color:var(--ds-hover)]",
              isCompact ? "px-3 py-2" : "px-4 py-3",
              activeModelId === "auto" && "brand-soft"
            )}
          >
            <div className="flex-1">
              <p
                className={cn(
                  "font-medium",
                  isCompact ? "text-[12px]" : "text-sm",
                  activeModelId === "auto" ? "brand-text" : "text-[color:var(--ds-text)]"
                )}
              >
                Auto (Engine-Default)
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[color:var(--ds-text-muted)]",
                  isCompact ? "text-[10px]" : "text-xs"
                )}
              >
                Engine wählt automatisch das optimale Modell
              </p>
            </div>
            {activeModelId === "auto" && (
              <Check size={isCompact ? 12 : 14} className="brand-text mt-0.5 shrink-0" />
            )}
          </button>

          {/* Model list */}
          {models.map((model) => {
            const isActive = model.id === activeModelId;
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-[color:var(--ds-border)] text-left transition-colors last:border-0 hover:bg-[color:var(--ds-hover)]",
                  isCompact ? "px-3 py-2" : "px-4 py-3",
                  isActive && "brand-soft"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={cn(
                        "truncate font-medium",
                        isCompact ? "text-[12px]" : "text-sm",
                        isActive ? "brand-text" : "text-[color:var(--ds-text)]"
                      )}
                    >
                      {model.name}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase",
                        isCompact ? "text-[9px]" : "text-xs"
                      )}
                    >
                      {getProviderLabel(model.provider as never)}
                    </span>
                    {"dataResidency" in model && model.dataResidency === "eu" && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-medium text-emerald-600">
                        <Globe size={7} />
                        EU
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 line-clamp-2 text-[color:var(--ds-text-muted)]",
                      isCompact ? "text-[10px]" : "text-xs"
                    )}
                  >
                    {model.description}
                  </p>
                  <div
                    className={cn(
                      "mt-1.5 flex items-center gap-2.5 text-[color:var(--ds-text-subtle)]",
                      isCompact ? "text-[10px]" : "text-xs"
                    )}
                  >
                    <span className="flex items-center gap-0.5" title="Context Window">
                      <Gauge size={isCompact ? 8 : 9} />
                      {formatContextWindow(model.contextWindow)}
                    </span>
                    <span
                      className="flex items-center gap-0.5"
                      title="Cost per 1M tokens (input/output)"
                    >
                      <DollarSign size={isCompact ? 8 : 9} />
                      {formatCost(model.costPer1MInput)}/{formatCost(model.costPer1MOutput)}
                    </span>
                    <span className="flex items-center gap-0.5" title="Speed rating">
                      <Zap size={isCompact ? 8 : 9} />
                      {getSpeedLabel(model.speedRating as 1 | 2 | 3 | 4 | 5)}
                    </span>
                  </div>
                </div>
                {isActive && (
                  <Check size={isCompact ? 12 : 14} className="brand-text mt-0.5 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
