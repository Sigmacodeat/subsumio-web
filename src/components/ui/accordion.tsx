"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionProps {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

const AccordionContext = React.createContext<{
  value: string | null;
  onValueChange: (value: string) => void;
} | null>(null);

function useAccordionContext() {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error("AccordionItem must be used within Accordion");
  return ctx;
}

export function Accordion({
  children,
  defaultValue,
  value,
  onValueChange,
  className,
}: AccordionProps) {
  const [internalValue, setInternalValue] = React.useState<string | null>(defaultValue ?? null);
  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = React.useCallback(
    (v: string) => {
      const next = currentValue === v ? null : v;
      if (value === undefined) setInternalValue(next);
      onValueChange?.(next ?? "");
    },
    [currentValue, onValueChange, value]
  );

  return (
    <AccordionContext.Provider value={{ value: currentValue, onValueChange: handleChange }}>
      <div
        className={cn(
          "divide-y divide-[color:var(--ds-border)] rounded-lg border border-[color:var(--ds-border)]",
          className
        )}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div className={cn("", className)} data-value={value}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

export function AccordionTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { value, onValueChange } = useAccordionContext();
  const itemValue = (React.useContext(AccordionItemContext) as { value: string })?.value;
  const isOpen = value === itemValue;

  return (
    <button
      onClick={() => onValueChange(itemValue)}
      className={cn(
        "flex w-full items-center justify-between px-4 py-4 text-left text-sm font-medium transition-all hover:bg-[color:var(--ds-surface-2)]",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
      />
    </button>
  );
}

const AccordionItemContext = React.createContext<{ value: string } | null>(null);

export function AccordionContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { value } = useAccordionContext();
  const itemValue = (React.useContext(AccordionItemContext) as { value: string })?.value;
  const isOpen = value === itemValue;

  if (!isOpen) return null;
  return (
    <div
      className={cn(
        "overflow-hidden px-4 pb-4 text-sm text-[color:var(--ds-text-muted)]",
        className
      )}
    >
      {children}
    </div>
  );
}
