"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDocs } from "@/content/docs";
import { type Lang } from "@/content/site";
import { p, UI_STRINGS } from "@/content/site";
import { ICONS, PageHero, CTASection, Section, H2_CTA_CLASS, H3_CLASS } from "./chrome";
import DocsWorkflowShowcase from "./docs-workflow-showcase";
import { GlowCard, Reveal, StaggerContainer, StaggerItem, VIEWPORT } from "./motion-system";

function FeatureCard({
  icon,
  title,
  desc,
  index,
  dimmed = false,
}: {
  icon: string;
  title: string;
  desc: string;
  index: number;
  dimmed?: boolean;
}) {
  const Icon = ICONS[icon];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT.tight}
      transition={{ duration: 0.4, delay: (index % 3) * 0.06 }}
      className={
        dimmed ? "opacity-30 transition-opacity duration-300" : "transition-opacity duration-300"
      }
    >
      <GlowCard className="h-full rounded-2xl p-6 transition-all duration-200 [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-lg hover:[background:var(--mk-surface-2)]">
        <div className="flex items-start gap-3.5">
          {Icon && (
            <div className="brand-soft mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 hover:scale-110">
              <Icon size={17} className="brand-text" />
            </div>
          )}
          <div>
            <h4 className={`mb-1.5 ${H3_CLASS}`}>{title}</h4>
            <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{desc}</p>
          </div>
        </div>
      </GlowCard>
    </motion.div>
  );
}

function QuickStartSection({ d }: { d: ReturnType<typeof getDocs> }) {
  return (
    <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal variant="up" className="mb-10 text-center">
          <h2 className={`mb-3 ${H2_CTA_CLASS}`}>{d.quickstart.title}</h2>
          <p className="text-sm text-pretty [color:var(--mk-text-muted)]">{d.quickstart.sub}</p>
        </Reveal>
        <StaggerContainer
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5"
          stagger={0.08}
        >
          {d.quickstart.steps.map((step) => (
            <StaggerItem key={step.num}>
              <div className="relative h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all duration-200 [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-md">
                <div className="brand-text mb-3 text-2xl font-bold tabular-nums">{step.num}</div>
                <h4 className="mb-1.5 text-sm font-semibold [color:var(--mk-text)]">
                  {step.title}
                </h4>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{step.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </Section>
  );
}

function StickyCategoryNav({
  categories,
  activeId,
  search,
  onSearch,
  resultCount,
  total,
  lang,
  searchRef,
}: {
  categories: { id: string; title: string; count: number }[];
  activeId: string | null;
  search: string;
  onSearch: (v: string) => void;
  resultCount: number;
  total: number;
  lang: Lang;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const t = UI_STRINGS[lang];
  return (
    <div className="sticky top-[var(--header-h,56px)] z-30 border-b [border-color:var(--mk-border)] backdrop-blur-md [background:var(--mk-bg)]/80">
      <div className="mx-auto max-w-7xl px-6 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav className="-mx-1 flex scrollbar-none gap-1.5 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
            {categories.map((cat) => (
              <a
                key={cat.id}
                href={`#cat-${cat.id}`}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  activeId === cat.id
                    ? "brand-soft brand-text"
                    : "text-[var(--mk-text-muted)] hover:bg-[var(--mk-surface-2)] hover:text-[var(--mk-text)]"
                }`}
              >
                {cat.title}
                <span className="ml-1 text-[10px] [color:var(--mk-text-muted)]">{cat.count}</span>
              </a>
            ))}
          </nav>
          <div className="relative flex items-center gap-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onSearch("");
                  searchRef.current?.blur();
                }
              }}
              aria-label={t.docsSearchPlaceholder ?? "Search features…"}
              placeholder={t.docsSearchPlaceholder ?? "Search features…"}
              className="w-full rounded-lg border [border-color:var(--mk-border)] bg-[var(--mk-surface)] px-3 py-1.5 text-sm text-[var(--mk-text)] placeholder:text-[var(--mk-text-subtle)] focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)] focus:outline-none sm:w-56"
            />
            {search ? (
              <button
                onClick={() => onSearch("")}
                aria-label="Clear search"
                className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-[var(--mk-text-subtle)] transition-colors hover:bg-[var(--mk-surface-2)] hover:text-[var(--mk-text)]"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 2l6 6M8 2l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2 hidden text-[10px] text-[var(--mk-text-subtle)] sm:block">
                ⌘K
              </kbd>
            )}
            {search && (
              <span className="absolute right-9 text-[10px] text-[var(--mk-text-subtle)]">
                {resultCount}/{total}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocsPage({ lang }: { lang: Lang }) {
  const d = getDocs(lang);
  const t = UI_STRINGS[lang];
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const totalFeatures = useMemo(
    () => d.categories.reduce((acc, c) => acc + c.features.length, 0),
    [d]
  );

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return d.categories;
    const q = search.toLowerCase();
    return d.categories
      .map((cat) => ({
        ...cat,
        features: cat.features.filter(
          (f) => f.title.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.features.length > 0);
  }, [d, search]);

  const resultCount = filteredCategories.reduce((acc, c) => acc + c.features.length, 0);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusSearch]);

  useEffect(() => {
    const handler = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div
      data-tone="light"
      className="relative min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero */}
      <PageHero
        badge={d.hero.badge}
        h1a={d.hero.title}
        h1b={d.hero.claim}
        sub={d.hero.sub}
        accentVariant="gradient"
      />
      <Section tone="light" className="-mt-8 px-4 pb-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto mb-6 max-w-xl text-sm leading-relaxed [color:var(--mk-text-subtle)]">
            {d.intro}
          </p>
          {/* Stats badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 text-sm font-medium [color:var(--mk-text)] [background:var(--mk-surface)]">
              <span className="brand-text font-bold">{totalFeatures}</span>
              {t.docsFeatureCount ?? "features"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 text-sm font-medium [color:var(--mk-text)] [background:var(--mk-surface)]">
              <span className="brand-text font-bold">{d.categories.length}</span>
              {t.docsCategoryCount ?? "categories"}
            </span>
            <span className="brand-soft brand-text inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium">
              {t.docsStatsBadge ?? "Fully documented"}
            </span>
          </div>
        </div>
      </Section>

      <DocsWorkflowShowcase lang={lang} />

      {/* Quick Start */}
      <QuickStartSection d={d} />

      {/* Sticky Category Nav + Search */}
      <StickyCategoryNav
        categories={d.categories.map((c) => ({
          id: c.id,
          title: c.title,
          count: c.features.length,
        }))}
        activeId={activeId}
        search={search}
        onSearch={setSearch}
        resultCount={resultCount}
        total={totalFeatures}
        lang={lang}
        searchRef={searchRef}
      />

      {/* Categories */}
      <Section tone="light" className="px-4 pt-12 pb-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-20">
          {filteredCategories.length === 0 && search && (
            <div className="py-20 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full [background:var(--mk-surface-2)]">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle
                      cx="9"
                      cy="9"
                      r="6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-[var(--mk-text-subtle)]"
                    />
                    <path
                      d="M14 14l3 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      className="text-[var(--mk-text-subtle)]"
                    />
                  </svg>
                </div>
              </div>
              <p className="mb-3 text-sm text-[var(--mk-text-muted)]">
                {t.docsNoResults ?? "No features found for"} &quot;{search}&quot;
              </p>
              <button
                onClick={() => setSearch("")}
                className="rounded-full border [border-color:var(--mk-border)] px-4 py-1.5 text-sm font-medium [color:var(--mk-text)] transition-colors hover:bg-[var(--mk-surface-2)]"
              >
                {t.docsClearSearch ?? "Clear search"}
              </button>
            </div>
          )}
          {filteredCategories.map((cat) => (
            <Reveal
              key={cat.id}
              id={`cat-${cat.id}`}
              variant="up"
              className="scroll-mt-[120px]"
              onViewportEnter={() => setActiveId(cat.id)}
            >
              <div className="mb-8 flex items-end justify-between gap-6">
                <div>
                  <h2 className={`mb-2 ${H2_CTA_CLASS}`}>{cat.title}</h2>
                  <p className="text-sm [color:var(--mk-text-muted)]">{cat.sub}</p>
                </div>
                <span className="shrink-0 rounded-full border [border-color:var(--mk-border)] px-2.5 py-1 text-[10px] font-medium [color:var(--mk-text-muted)] [background:var(--mk-surface)]">
                  {cat.features.length}
                </span>
              </div>
              <StaggerContainer
                className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
                stagger={0.06}
              >
                {cat.features.map((f, i) => (
                  <FeatureCard
                    key={f.title}
                    icon={f.icon}
                    title={f.title}
                    desc={f.desc}
                    index={i}
                  />
                ))}
              </StaggerContainer>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Architecture */}
      <Section tone="light" className="px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal variant="up" className="mb-12 text-center">
            <h2 className={`mb-3 ${H2_CTA_CLASS}`}>{d.arch.title}</h2>
            <p className="text-sm text-pretty [color:var(--mk-text-muted)]">{d.arch.sub}</p>
          </Reveal>
          <StaggerContainer
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            stagger={0.06}
          >
            {d.arch.items.map((item, i) => (
              <FeatureCard
                key={item.title}
                icon={item.icon}
                title={item.title}
                desc={item.desc}
                index={i}
              />
            ))}
          </StaggerContainer>
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title={d.cta.title}
        sub={d.cta.sub}
        href={p(lang, "/login")}
        label={d.cta.button}
        secondaryHref={p(lang, "/contact")}
        secondaryLabel={UI_STRINGS[lang].writeUs}
      />

      {/* Scroll to top */}
      {showTop && (
        <button
          onClick={scrollToTop}
          aria-label={t.backToTopAria ?? "Back to top"}
          className="fixed right-6 bottom-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border [border-color:var(--mk-border)] [color:var(--mk-text)] shadow-lg transition-all duration-200 [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-xl"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 12V4M4 8l4-4 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
