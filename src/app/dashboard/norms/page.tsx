"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Search,
  Loader2,
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
import { PageHeader } from "@/components/dashboard/page-header";

interface NormItem {
  slug: string;
  title: string;
  code: string; // BGB, BRAO, ABGB, etc.
  section: string; // § number
  content: string;
  jurisdiction: string;
}

const CODE_LABELS: Record<string, string> = {
  bgb: "Bürgerliches Gesetzbuch (BGB)",
  brao: "Bundesrechtsanwaltsordnung (BRAO)",
  zpo: "Zivilprozessordnung (ZPO)",
  "zpo-de": "Zivilprozessordnung (ZPO)",
  stgb: "Strafgesetzbuch (StGB)",
  "stgb-de": "Strafgesetzbuch (StGB)",
  "stgb-at": "Strafgesetzbuch (AT)",
  "stgb-ch": "Strafgesetzbuch (CH)",
  stpo: "Strafprozessordnung (StPO)",
  "stpo-de": "Strafprozessordnung (StPO)",
  "stpo-at": "Strafprozessordnung (AT)",
  abgb: "Allgemeines bürgerliches Gesetzbuch (ABGB)",
  ao: "Abgabenordnung (AO)",
  estg: "Einkommensteuergesetz (EStG)",
  ugb: "Unternehmensgesetzbuch (UGB)",
  eo: "Exekutionsordnung (EO)",
  ahg: "Arbeits- und Sozialversicherungsgesetz (ASVG/AHG)",
  bao: "Bundesabgabenordnung (BAO)",
  famfg: "Gesetz über das Verfahren in Familiensachen (FamFG)",
  gg: "Grundgesetz (GG)",
  gmbhg: "GmbH-Gesetz (GmbHG)",
  hgb: "Handelsgesetzbuch (HGB)",
  inso: "Insolvenzordnung (InsO)",
  ustg: "Umsatzsteuergesetz (UStG)",
  uwg: "Gesetz gegen unlauteren Wettbewerb (UWG)",
  or: "Obligationenrecht (OR)",
  zgb: "Zivilgesetzbuch (ZGB)",
};

// useSearchParams() braucht eine Suspense-Grenze, sonst scheitert das
// Prerendering der Seite im Production-Build.
export default function NormsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label="Wird geladen"
        >
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      }
    >
      <NormsPageInner />
    </Suspense>
  );
}

function NormsPageInner() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("citation") || "";
  const [initialSearchQuery] = useState(initialQuery);

  const [query, setQuery] = useState(initialQuery);
  const [norms, setNorms] = useState<NormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNorm, setSelectedNorm] = useState<NormItem | null>(null);
  const [jurisdiction, setJurisdiction] = useState<"all" | "at" | "de" | "ch">("all");
  const [copied, setCopied] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Search for norm pages in the brain
        const pages = await api.brain.search(initialSearchQuery || "§ Gesetz", 50);
        if (cancelled) return;

        const items: NormItem[] = [];
        for (const page of pages) {
          const fm = frontmatterOf<NormFrontmatter>(page);
          // Erkenne Gesetze: type=statute, legal/statutes/..., law-corpus/..., norms/...
          const isStatute =
            fm.type === "statute" ||
            fm.type === "norm" ||
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
        const lawPages = await api.brain.listPages({ limit: 300 });
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

        setNorms(items);
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : "Normen konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSearchQuery]);

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
    const jMatch = jurisdiction === "all" || n.jurisdiction === jurisdiction;
    if (!query) return jMatch;
    const q = query.toLowerCase();
    return (
      jMatch &&
      (n.title.toLowerCase().includes(q) ||
        n.code.toLowerCase().includes(q) ||
        n.section.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q))
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
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Normen"
        description="Gesetze und Rechtsvorschriften durchsuchen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Normen" }]}
      />

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative max-w-lg flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Norm suchen… z.B. § 823 BGB, Art. 5 GG"
            aria-label="Norm suchen… z.B. § 823 BGB, Art. 5 GG"
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
        </div>
      </div>

      {/* Jurisdiction Tabs */}
      <div className="flex gap-2">
        {(["all", "at", "de", "ch"] as const).map((j) => {
          const counts = norms.filter((n) => n.jurisdiction === j).length;
          return (
            <button
              key={j}
              onClick={() => setJurisdiction(j)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                jurisdiction === j
                  ? "brand-soft brand-border brand-text"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)]"
              }`}
            >
              {j === "all" ? "Alle" : j === "at" ? "🇦🇹 AT" : j === "de" ? "🇩🇪 DE" : "🇨🇭 CH"}
              {j !== "all" && counts > 0 && (
                <span className="ml-1.5 rounded bg-[color:var(--ds-border)] px-1 py-0.5 text-xs">
                  {counts}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected norm detail */}
      {selectedNorm && (
        <div className="brand-border brand-soft space-y-4 rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedNorm(null)}
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <ArrowLeft size={16} />
              </Button>
              <div>
                <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                  {selectedNorm.title}
                </h2>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    variant="default"
                    className="border-blue-500/20 bg-blue-600/10 text-xs text-blue-600"
                  >
                    {CODE_LABELS[selectedNorm.code] || selectedNorm.code.toUpperCase()}
                  </Badge>
                  <Badge
                    variant="default"
                    className={`border text-xs ${
                      selectedNorm.jurisdiction === "at"
                        ? "border-red-500/20 bg-red-500/10 text-red-600"
                        : selectedNorm.jurisdiction === "ch"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                          : "border-blue-500/20 bg-blue-500/10 text-blue-600"
                    }`}
                  >
                    {selectedNorm.jurisdiction === "at"
                      ? "🇦🇹 Österreich"
                      : selectedNorm.jurisdiction === "ch"
                        ? "🇨🇭 Schweiz"
                        : "🇩🇪 Deutschland"}
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
              className="hover:brand-text hover:brand-border flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-all"
              title="Text kopieren"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
            {detailLoading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 size={14} className="brand-text animate-spin" />
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  Gesetzestext wird geladen…
                </span>
              </div>
            ) : (
              fullContent || selectedNorm.content
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Stats bar */}
      {!loading && norms.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
          <span className="flex items-center gap-1">
            <Scale size={12} />{" "}
            <strong className="text-[color:var(--ds-text)]">{norms.length}</strong> Gesetze
          </span>
          <span className="flex items-center gap-1">
            <Globe size={12} /> AT: {norms.filter((n) => n.jurisdiction === "at").length}
          </span>
          <span className="flex items-center gap-1">
            <Globe size={12} /> DE: {norms.filter((n) => n.jurisdiction === "de").length}
          </span>
          <span className="flex items-center gap-1">
            <Globe size={12} /> CH: {norms.filter((n) => n.jurisdiction === "ch").length}
          </span>
        </div>
      )}

      {/* Norm list grouped by code */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label="Wird geladen"
        >
          <Loader2 size={24} className="brand-text animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-3 py-16 text-center">
          <BookOpen size={40} className="mx-auto text-[color:var(--ds-border)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">Keine Gesetze gefunden.</p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {norms.length > 0
              ? "Passe den Filter oder die Suche an."
              : "Importiere Gesetze über das CLI."}
          </p>
        </div>
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
                    className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-[color:var(--ds-border)] hover:bg-[color:var(--ds-hover)]"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        n.jurisdiction === "at"
                          ? "bg-red-400"
                          : n.jurisdiction === "ch"
                            ? "bg-emerald-400"
                            : "bg-blue-400"
                      }`}
                    />
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
                      className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-muted)]"
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
