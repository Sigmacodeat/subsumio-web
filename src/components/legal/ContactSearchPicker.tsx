"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { CONTACT_SEARCH_MIN, useContactSearch } from "@/lib/matter-contacts";
import type { CaseContact } from "@/lib/matter-detail-types";

interface ContactSearchPickerProps {
  id: string;
  /** Accessible name of the search field, e.g. "Mandant". */
  label: string;
  /** Only contacts of this role are offered. */
  role: string;
  /** Slug of the current selection. */
  value?: string;
  /** Display name of the current selection. */
  valueName?: string;
  onSelect: (contact: CaseContact | null) => void;
}

/**
 * Picks a contact of one role by a server-side search over every contact of
 * the firm (not from a preloaded, capped list).
 */
export function ContactSearchPicker({
  id,
  label,
  role,
  value,
  valueName,
  onSelect,
}: ContactSearchPickerProps) {
  const { lang } = useLang();
  const en = lang === "en";
  const [term, setTerm] = useState("");
  const { results, state, limited } = useContactSearch(term);
  const matches = (results ?? []).filter((c) => c.role === role && c.slug !== value);
  const listId = `${id}-results`;

  return (
    <div className="space-y-1">
      {value && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)]">
          <span className="truncate">{valueName || value}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label={en ? `Remove ${label}` : `${label} entfernen`}
            className="shrink-0 rounded p-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
      <label className="relative block">
        <span className="sr-only">{en ? `Search ${label}` : `${label} suchen`}</span>
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <input
          id={id}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-controls={listId}
          placeholder={
            value ? (en ? "Search to change…" : "Suchen zum Ändern…") : en ? "Search…" : "Suchen…"
          }
          className="h-9 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pr-3 pl-8 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        />
      </label>
      {term.trim().length > 0 && term.trim().length < CONTACT_SEARCH_MIN && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          {en ? "Type at least two characters." : "Mindestens zwei Zeichen eingeben."}
        </p>
      )}
      {state === "loading" && (
        <p role="status" className="text-xs text-[color:var(--ds-text-muted)]">
          {en ? "Searching…" : "Suche läuft…"}
        </p>
      )}
      {state === "failed" && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          {en ? "The search is currently unavailable." : "Die Suche ist derzeit nicht verfügbar."}
        </p>
      )}
      {state === "idle" && results !== null && matches.length === 0 && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          {en ? "No matching contact with this role." : "Kein passender Kontakt mit dieser Rolle."}
        </p>
      )}
      <ul id={listId} className="space-y-0.5">
        {matches.map((c) => (
          <li key={c.slug}>
            <button
              type="button"
              onClick={() => {
                onSelect(c);
                setTerm("");
              }}
              className="w-full truncate rounded px-2 py-1 text-left text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              {c.name}
              {c.email && (
                <span className="ml-1 text-xs text-[color:var(--ds-text-muted)]">{c.email}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {limited && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          {en ? "More contacts match — refine the search." : "Weitere Treffer — Suche verfeinern."}
        </p>
      )}
    </div>
  );
}
