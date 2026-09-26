"use client";

/**
 * The result of one case scan run, shown inside its review item. Loaded on
 * demand (listings carry no page bodies), always with the grounding panel
 * (verified/unverified citations, "anwaltlich zu prüfen"). Nothing of it is in
 * the matter until a lawyer takes it over.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { extractScanFinding } from "@/lib/legal/case-scan";
import { GroundedOutputPanel } from "@/components/legal/GroundedOutputPanel";

export function CaseScanFinding({ pageSlug, lang }: { pageSlug: string; lang: "de" | "en" }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["case-scan-finding", pageSlug],
    queryFn: () => api.brain.getPage(pageSlug),
    enabled: open,
    staleTime: 60_000,
  });
  const text = extractScanFinding(query.data?.content);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] hover:underline focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {open
          ? lang === "en"
            ? "Hide result"
            : "Ergebnis ausblenden"
          : lang === "en"
            ? "Show result"
            : "Ergebnis anzeigen"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
          <p className="text-xs font-medium text-[color:var(--ds-warning-text)]">
            {lang === "en"
              ? "AI result — to be reviewed by a lawyer. Nothing has been added to the matter."
              : "KI-Ergebnis — anwaltlich zu prüfen. Nichts davon wurde in die Akte übernommen."}
          </p>
          {query.isLoading && (
            <Loader2 size={14} className="animate-spin text-[color:var(--ds-text-muted)]" />
          )}
          {query.isError && (
            <p className="text-xs text-[color:var(--ds-danger-text)]">
              {lang === "en"
                ? "The result could not be loaded."
                : "Das Ergebnis konnte nicht geladen werden."}
            </p>
          )}
          {text && (
            <>
              <div className="max-h-96 overflow-y-auto overscroll-contain text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                {text}
              </div>
              <GroundedOutputPanel text={text} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
