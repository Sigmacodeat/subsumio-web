"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/lib/use-lang";
import {
  BookOpen,
  Search,
  ArrowLeft,
  ChevronRight,
  Scale,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { frontmatterOf, type NormFrontmatter } from "@/lib/legal-types";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";

const LAW_PAGES_LIMIT = 300;

interface NormItem {
  slug: string;
  title: string;
  code: string; // ABGB, ZPO, UGB, etc.
  section: string; // § number
  content: string;
  jurisdiction: string;
}

const CODE_LABELS: Record<string, string> = {
  zpo: "Zivilprozessordnung (ZPO)",
  stgb: "Strafgesetzbuch (StGB)",
  "stgb-at": "Strafgesetzbuch (StGB)",
  stpo: "Strafprozessordnung (StPO)",
  "stpo-at": "Strafprozessordnung (StPO)",
  abgb: "Allgemeines bürgerliches Gesetzbuch (ABGB)",
  estg: "Einkommensteuergesetz (EStG)",
  ugb: "Unternehmensgesetzbuch (UGB)",
  eo: "Exekutionsordnung (EO)",
  ahg: "Amtshaftungsgesetz (AHG)",
  asvg: "Allgemeines Sozialversicherungsgesetz (ASVG)",
  rao: "Rechtsanwaltsordnung (RAO)",
  kschg: "Konsumentenschutzgesetz (KSchG)",
  io: "Insolvenzordnung (IO)",
  bao: "Bundesabgabenordnung (BAO)",
  gmbhg: "GmbH-Gesetz (GmbHG)",
  ustg: "Umsatzsteuergesetz (UStG)",
  uwg: "Gesetz gegen unlauteren Wettbewerb (UWG)",
};

// useSearchParams() braucht eine Suspense-Grenze, sonst scheitert das
// Prerendering der Seite im Production-Build.
export default function NormsPage() {
  const { t } = useLang();
  return (
    <Suspense fallback={<NormsSkeleton label={t("aria.loading")} />}>
      <NormsPageInner />
    </Suspense>
  );
}

function NormsSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

function NormsPageInner() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("citation") || "";
  const [initialSearchQuery] = useState(initialQuery);

  const [query, setQuery] = useState(initialQuery);
  const [norms, setNorms] = useState<NormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNorm, setSelectedNorm] = useState<NormItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pages, lawPages] = await Promise.all([
          api.brain.search(initialSearchQuery || "§ Gesetz", 50),
          api.brain.listPages({ limit: LAW_PAGES_LIMIT }),
        ]);
        if (cancelled) return;
        setCapped(lawPages.length >= LAW_PAGES_LIMIT);

        const items: NormItem[] = [];
        for (const page of pages) {
          const fm = frontmatterOf<NormFrontmatter>(page);
          // Erkenne Gesetze: type=statute, legal/statutes/..., law-corpus/..., norms/...
          const pageType = (page as { type?: string }).type ?? fm.type;
          const isStatute =
            pageType === "statute" ||
            pageType === "norm" ||
            page.slug.includes("/law-corpus/") ||
            page.slug.includes("/norms/") ||
            page.slug.startsWith("legal/statutes/");
          if (isStatute) {
            const codeMatch = page.slug.match(/\/([a-z-]+)$/);
            const codeFromSlug = codeMatch?.[1] || "";
            items.push({
              slug: page.slug,
              title: page.title,
              code: fm.code || codeFromSlug || "allg",
              section: fm.section || fm.paragraph || "",
              content: page.snippet || "",
              jurisdiction:
                (fm.jurisdiction as string) ||
                (page.slug.includes("/at/") ? "at" : page.slug.includes("/ch/") ? "ch" : "de"),
            });
          }
        }

        // Also check all pages for statutes
        for (const page of lawPages) {
          const isLawPage =
            page.slug.startsWith("law-corpus/") ||
            page.slug.startsWith("legal/statutes/") ||
            page.slug.includes("-gesetz") ||
            page.slug.includes("-recht");
          if (isLawPage && !items.find((i) => i.slug === page.slug)) {
            const fm = frontmatterOf<NormFrontmatter>(page);
            const codeMatch = page.slug.match(/\/([a-z-]+)$/);
            items.push({
              slug: page.slug,
              title: page.title,
              code: fm.code || codeMatch?.[1] || page.slug.split("/").pop() || "allg",
              section: "",
              content: page.content?.slice(0, 2000) || "",
              jurisdiction:
                (fm.jurisdiction as string) ||
                (page.slug.includes("/at/") ? "at" : page.slug.includes("/ch/") ? "ch" : "de"),
            });
          }
        }

        setNorms(items.filter((item) => item.jurisdiction === "at" || item.jurisdiction === "eu"));
      } catch {
        if (!cancelled) setLoadError(t("norms.error_load"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSearchQuery, t]);

  useEffect(() => {
    if (!selectedNorm) {
      setFullContent(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const page = await api.brain.getPage(selectedNorm.slug);
        if (!cancelled) setFullContent(page.content || "");
      } catch {
        if (!cancelled) setFullContent(selectedNorm.content);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedNorm]);

  const filtered = norms.filter((n) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.code.toLowerCase().includes(q) ||
      n.section.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    );
  });

  // Group by code
  const byCode = filtered.reduce(
    (acc, n) => {
      if (!acc[n.code]) acc[n.code] = [];
      acc[n.code].push(n);
      return acc;
    },
    {} as Record<string, NormItem[]>
  );

  return (
    // Embedded in the research page, which owns the page header (one h1 per page).
    <div className="space-y-6">
      {capped && <CappedResultsNotice limit={LAW_PAGES_LIMIT} />}

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-lg min-w-[12rem] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("norms.search_placeholder")}
            aria-label={t("aria.search_norms")}
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
        </div>
        <span className="text-xs text-[color:var(--ds-text-muted)]">Österreich · EU-Recht</span>
      </div>

      {/* Selected norm detail */}
      {selectedNorm && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Zurück zur Liste"
                onClick={() => setSelectedNorm(null)}
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <ArrowLeft size={16} />
              </Button>
              <div>
                <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                  {selectedNorm.title}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {CODE_LABELS[selectedNorm.code] || selectedNorm.code.toUpperCase()}
                  </Badge>
                  <Badge variant="default" className="text-xs">
                    {selectedNorm.jurisdiction === "at"
                      ? t("norms.jurisdiction_at")
                      : selectedNorm.jurisdiction.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(fullContent || selectedNorm.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
              title={t("norms.copy_title")}
            >
              {copied ? (
                <Check size={12} className="text-[color:var(--ds-success-text)]" />
              ) : (
                <Copy size={12} />
              )}
              {copied ? t("norms.copied") : t("norms.copy")}
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
            {detailLoading ? (
              <div className="space-y-2 py-1" aria-busy="true" aria-label={t("norms.loading_detail")}>
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-11/12 rounded" />
                <Skeleton className="h-3 w-4/5 rounded" />
              </div>
            ) : (
              fullContent || selectedNorm.content
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          {loadError}
        </div>
      )}

      {/* Stats bar */}
      {!loading && norms.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
          <span className="flex items-center gap-1">
            <Scale size={12} />{" "}
            <strong className="text-[color:var(--ds-text)]">{norms.length}</strong>{" "}
            {t("norms.laws_count")}
          </span>
          <span className="flex items-center gap-1">
            <Globe size={12} /> Österreich: {norms.filter((n) => n.jurisdiction === "at").length}
          </span>
        </div>
      )}

      {/* Norm list grouped by code */}
      {loading ? (
        <NormsSkeleton label={t("aria.loading")} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t("norms.empty")}
          description={norms.length > 0 ? t("norms.empty_filter") : t("norms.empty_import")}
          actionLabel={query ? "Suche zurücksetzen" : undefined}
          onAction={query ? () => setQuery("") : undefined}
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(byCode).map(([code, items]) => (
            <div key={code} className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <BookOpen size={12} />
                {CODE_LABELS[code] || code.toUpperCase()}
                <span className="rounded bg-[color:var(--ds-border)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {items.length}
                </span>
              </h3>
              <div className="space-y-1">
                {items.map((n) => (
                  <button
                    key={n.slug}
                    onClick={() => setSelectedNorm(n)}
                    className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color,color] hover:border-[color:var(--ds-border)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                  >
                    <span className="flex-1 truncate text-sm text-[color:var(--ds-text-muted)] group-hover:text-[color:var(--ds-text)]">
                      {n.title}
                    </span>
                    {n.jurisdiction && (
                      <span className="rounded bg-[color:var(--ds-border)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)] uppercase">
                        {n.jurisdiction}
                      </span>
                    )}
                    <ChevronRight
                      size={12}
                      className="shrink-0 text-[color:var(--ds-text-muted)]"
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
