"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Shield, ShieldOff, Loader2, Lock, Unlock } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface CasePage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}

interface LegalHoldEntry {
  caseSlug: string;
  caseTitle: string;
  reason: string;
  setAt: string;
  setBy: string;
  status: string;
}

async function fetchLegalHolds(): Promise<{ holds: LegalHoldEntry[]; total: number }> {
  const pages = await api.brain.listPages({ type: "legal_case", limit: 200 });
  const holds: LegalHoldEntry[] = [];

  for (const page of pages as CasePage[]) {
    const fm = page.frontmatter ?? {};
    if (fm.legal_hold === true) {
      holds.push({
        caseSlug: page.slug,
        caseTitle: page.title,
        reason: String(fm.legal_hold_reason ?? ""),
        setAt: String(fm.legal_hold_set_at ?? ""),
        setBy: String(fm.legal_hold_set_by ?? ""),
        status: String(fm.status ?? "active"),
      });
    }
  }

  holds.sort((a, b) => b.setAt.localeCompare(a.setAt));
  return { holds, total: pages.length };
}

export function LegalHoldWidget() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["legal-holds"],
    queryFn: fetchLegalHolds,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const stats = useMemo(() => {
    if (!data) return { total: 0, onHold: 0 };
    return { total: data.total, onHold: data.holds.length };
  }, [data]);

  const releaseHold = async (caseSlug: string) => {
    try {
      const res = await csrfFetch("/api/cases/legal-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_slug: caseSlug, legal_hold: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({
        type: "success",
        title: isEn ? "Legal Hold released" : "Legal Hold aufgehoben",
        description: caseSlug,
        duration: 3000,
      });
      void queryClient.invalidateQueries({ queryKey: ["legal-holds"] });
    } catch (err) {
      addToast({
        type: "error",
        title: isEn ? "Failed to release hold" : "Aufhebung fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unknown error",
        duration: 5000,
      });
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Shield size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Legal Holds" : "Legal Holds"}
          </span>
        </div>
        <div className="flex h-20 items-center justify-center">
          <Loader2 size={18} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      </section>
    );
  }

  const holds = data?.holds ?? [];

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield
            size={15}
            className={
              holds.length > 0
                ? "text-[color:var(--ds-danger-text)]"
                : "text-[color:var(--ds-text-muted)]"
            }
          />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Legal Holds" : "Legal Holds"}
          </span>
        </div>
        {holds.length > 0 && (
          <span className="rounded-full border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--ds-danger-text)]">
            {holds.length} {isEn ? "active" : "aktiv"}
          </span>
        )}
      </div>

      {holds.length === 0 ? (
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {isEn
            ? "No legal holds active. All matters are available for normal operations."
            : "Keine Legal Holds aktiv. Alle Akten sind für normale Vorgänge verfügbar."}
        </p>
      ) : (
        <div className="space-y-2">
          {holds.slice(0, 6).map((hold) => {
            const encoded = hold.caseSlug.split("/").map(encodeURIComponent).join("/");
            return (
              <div
                key={hold.caseSlug}
                className="rounded-md border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/dashboard/cases/${encoded}`}
                    className="flex min-w-0 items-center gap-1.5 hover:opacity-80"
                  >
                    <Lock size={12} className="shrink-0 text-[color:var(--ds-danger-text)]" />
                    <span className="truncate text-[12px] font-medium text-[color:var(--ds-text)]">
                      {hold.caseTitle}
                    </span>
                  </Link>
                  <button
                    onClick={() => releaseHold(hold.caseSlug)}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
                    title={isEn ? "Release hold" : "Hold aufheben"}
                  >
                    <Unlock size={10} />
                    {isEn ? "Release" : "Aufheben"}
                  </button>
                </div>
                {hold.reason && (
                  <p className="mt-1 truncate text-[11px] text-[color:var(--ds-text-muted)]">
                    {hold.reason}
                  </p>
                )}
                {hold.setAt && (
                  <p className="mt-0.5 text-[10px] text-[color:var(--ds-text-subtle)]">
                    {new Date(hold.setAt).toLocaleDateString(isEn ? "en-GB" : "de-DE")}
                    {hold.setBy && ` · ${hold.setBy}`}
                  </p>
                )}
              </div>
            );
          })}
          {holds.length > 6 && (
            <Link
              href="/dashboard/legal-hold"
              className="block px-1 text-[11px] text-[color:var(--brand-primary)] hover:underline"
            >
              {isEn ? `View all ${holds.length} holds` : `Alle ${holds.length} Holds ansehen`}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
