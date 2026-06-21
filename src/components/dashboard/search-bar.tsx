"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  placeholder?: string;
  defaultValue?: string;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  className?: string;
}

export function SearchBar({
  placeholder = "Suchen…",
  defaultValue = "",
  onSearch,
  onClear,
  className,
}: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className={cn("relative", className)}>
      <Search
        size={15}
        className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch?.(value);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-9 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
      />
      {value && (
        <button
          onClick={() => {
            setValue("");
            onClear?.();
          }}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          aria-label="Suche löschen"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
