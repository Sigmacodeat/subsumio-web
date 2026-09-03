"use client";

import { Fragment } from "react";
import { Check, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

export interface StepperStep {
  id: number;
  label: string;
  icon: LucideIcon;
}

interface BerufungsAgentStepperProps {
  steps: ReadonlyArray<StepperStep>;
  currentStep: number;
  onStepClick: (step: number) => void;
}

export function BerufungsAgentStepper({
  steps,
  currentStep,
  onStepClick,
}: BerufungsAgentStepperProps) {
  const { t } = useLang();
  return (
    <nav aria-label={t("stepper.aria_nav")}>
      <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
        {steps.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isComplete = step.id < currentStep;
          const isLast = idx === steps.length - 1;
          const Icon = step.icon;
          return (
            <Fragment key={step.id}>
              <li className="flex items-center">
                <button
                  type="button"
                  onClick={() => onStepClick(step.id)}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={t("stepper.aria_step")
                    .replace("{{id}}", String(step.id))
                    .replace("{{label}}", step.label)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200",
                    "hover:bg-[color:var(--ds-surface-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none",
                    "active:scale-[0.98] motion-reduce:transition-none",
                    isActive && "bg-[color:var(--ds-surface-hover)]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                      "motion-reduce:transition-none",
                      isActive &&
                        "scale-110 border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[color:var(--brand-primary-foreground)]",
                      isComplete &&
                        "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[color:var(--brand-primary-foreground)]",
                      !isActive &&
                        !isComplete &&
                        "border-[color:var(--ds-text-muted)]/30 text-[color:var(--ds-text-muted)]"
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "hidden text-sm font-medium sm:block",
                      isActive && "text-[color:var(--ds-text)]",
                      !isActive && !isComplete && "text-[color:var(--ds-text-muted)]",
                      isComplete && "text-[color:var(--ds-text)]/70"
                    )}
                  >
                    <span className="text-xs text-[color:var(--ds-text-muted)]">{step.id}.</span>{" "}
                    {step.label}
                  </span>
                </button>
                {!isLast && (
                  <div
                    className={cn(
                      "mx-2 hidden h-px w-8 sm:block lg:w-16",
                      isComplete ? "bg-[color:var(--brand-primary)]" : "bg-border"
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
