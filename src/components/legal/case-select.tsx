"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CaseOption {
  slug: string;
  title: string;
  fileNumber?: string;
}

/** Open matters first, archived last; each group alphabetically. */
export function toCaseOptions(pages: BrainPage[]): CaseOption[] {
  const rows = pages.map((p) => {
    const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
    const fileNumber = [fm.case_number, fm.file_number, fm.aktenzeichen].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    );
    return {
      slug: p.slug,
      title: p.title || p.slug.split("/").pop() || p.slug,
      fileNumber,
      archived: fm.status === "archived" || fm.status === "closed",
    };
  });
  rows.sort(
    (a, b) => Number(a.archived) - Number(b.archived) || a.title.localeCompare(b.title, "de")
  );
  return rows.map(({ slug, title, fileNumber }) => ({ slug, title, fileNumber }));
}

/** All matters of the firm (paged past the engine's 100-row cap, tombstones dropped). */
export function useCaseOptions(enabled = true) {
  return useQuery({
    queryKey: ["legal", "case-options"],
    queryFn: async () => toCaseOptions(await api.brain.listAllPages({ type: "legal_case" })),
    staleTime: 60_000,
    enabled,
  });
}

/**
 * Matter picker — replaces hand-typed matter slugs. Native <select> so it works
 * with keyboard, screen readers and mobile pickers without extra wiring.
 */
export function CaseSelect({
  id,
  value,
  onChange,
  placeholder = "Akte wählen …",
  allowEmpty = true,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (slug: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const { data: options = [], isLoading, isError } = useCaseOptions();
  // Keep a value that is not (yet) in the list selectable, e.g. a matter
  // suggested by the system while the list is still loading.
  const known = !value || options.some((o) => o.slug === value);
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled || isLoading}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-11 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-base text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 disabled:opacity-60 sm:h-9 sm:text-sm",
        className
      )}
    >
      {(allowEmpty || !value) && (
        <option value="">
          {isLoading ? "Akten werden geladen …" : isError ? "Akten nicht ladbar" : placeholder}
        </option>
      )}
      {!known && <option value={value}>{value.split("/").pop()}</option>}
      {options.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.fileNumber ? `${o.fileNumber} · ${o.title}` : o.title}
        </option>
      ))}
    </select>
  );
}
