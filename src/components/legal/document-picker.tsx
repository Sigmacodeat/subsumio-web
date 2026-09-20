"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { api } from "@/lib/api";
import { CaseSelect } from "@/components/legal/case-select";

export interface PickedDocument {
  slug: string;
  name: string;
}

/** A matter's document list (frontmatter.documents), only entries with an engine page. */
export function caseDocumentsFrom(
  frontmatter: Record<string, unknown> | undefined
): PickedDocument[] {
  const raw = Array.isArray(frontmatter?.documents) ? frontmatter.documents : [];
  const seen = new Set<string>();
  const out: PickedDocument[] = [];
  for (const d of raw as Array<Record<string, unknown>>) {
    const slug = typeof d?.slug === "string" ? d.slug : "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const name =
      (typeof d.name === "string" && d.name) ||
      (typeof d.title === "string" && d.title) ||
      slug.split("/").pop() ||
      slug;
    out.push({ slug, name });
  }
  return out;
}

/**
 * Pick documents by matter instead of typing engine slugs: choose the matter,
 * then tick its documents. `max` caps the selection (e.g. 25 for deep analysis).
 */
export function DocumentPicker({
  id,
  selected,
  onChange,
  max,
  disabled,
  initialCase = "",
  onCaseChange,
}: {
  id: string;
  selected: PickedDocument[];
  onChange: (docs: PickedDocument[]) => void;
  max?: number;
  disabled?: boolean;
  initialCase?: string;
  onCaseChange?: (caseSlug: string) => void;
}) {
  const [caseSlug, setCaseSlugState] = useState(initialCase);
  const setCaseSlug = (slug: string) => {
    setCaseSlugState(slug);
    onCaseChange?.(slug);
  };
  const docsQuery = useQuery({
    queryKey: ["legal", "case-documents", caseSlug],
    queryFn: async () => caseDocumentsFrom((await api.brain.getPage(caseSlug)).frontmatter),
    enabled: !!caseSlug,
    staleTime: 30_000,
  });
  const docs = docsQuery.data ?? [];
  const isSelected = (slug: string) => selected.some((d) => d.slug === slug);
  const full = max !== undefined && selected.length >= max;

  function toggle(doc: PickedDocument) {
    if (isSelected(doc.slug)) onChange(selected.filter((d) => d.slug !== doc.slug));
    else if (!full) onChange([...selected, doc]);
  }

  function selectAll() {
    const add = docs.filter((d) => !isSelected(d.slug));
    const room = max === undefined ? add.length : Math.max(0, max - selected.length);
    onChange([...selected, ...add.slice(0, room)]);
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label htmlFor={`${id}-case`} className="text-sm font-medium text-[color:var(--ds-text)]">
          Akte
        </label>
        <CaseSelect
          id={`${id}-case`}
          value={caseSlug}
          onChange={setCaseSlug}
          disabled={disabled}
          placeholder="Akte wählen, um ihre Dokumente zu sehen …"
        />
      </div>

      {caseSlug && (
        <fieldset
          disabled={disabled}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
        >
          <legend className="sr-only">Dokumente der Akte</legend>
          <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">
            <span>
              {docsQuery.isLoading
                ? "Dokumente werden geladen …"
                : docsQuery.isError
                  ? "Dokumente konnten nicht geladen werden."
                  : `${docs.length} Dokument${docs.length === 1 ? "" : "e"} in dieser Akte`}
            </span>
            {docs.length > 1 && (
              <button
                type="button"
                onClick={selectAll}
                disabled={full}
                className="rounded px-1.5 py-0.5 text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50"
              >
                Alle auswählen
              </button>
            )}
          </div>
          {docs.length > 0 && (
            <ul className="max-h-64 overflow-y-auto py-1">
              {docs.map((doc) => {
                const checked = isSelected(doc.slug);
                return (
                  <li key={doc.slug}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => toggle(doc)}
                        className="h-4 w-4 accent-[color:var(--brand-primary)]"
                      />
                      <FileText
                        size={14}
                        aria-hidden="true"
                        className="shrink-0 text-[color:var(--ds-text-muted)]"
                      />
                      <span className="min-w-0 truncate">{doc.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[color:var(--ds-text-muted)]">
            Ausgewählt ({selected.length}
            {max !== undefined ? ` von max. ${max}` : ""}):
          </span>
          {selected.map((d) => (
            <button
              key={d.slug}
              type="button"
              onClick={() => onChange(selected.filter((x) => x.slug !== d.slug))}
              disabled={disabled}
              aria-label={`${d.name} entfernen`}
              className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-[color:var(--ds-border)] px-2 py-0.5 text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
            >
              <span className="truncate">{d.name}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
