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

export function SearchBar({ placeholder = "Suchen…", defaultValue = "", onSearch, onClear, className }: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className={cn("relative", className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch?.(value);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg pl-9 pr-9 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:border-[color:var(--brand-primary)] transition-all"
      />
      {value && (
        <button
          onClick={() => { setValue(""); onClear?.(); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] transition-colors"
          aria-label="Suche löschen"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
