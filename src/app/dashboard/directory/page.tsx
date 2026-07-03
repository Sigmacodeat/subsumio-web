"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { navForIndustry } from "@/components/dashboard/sidebar";
import { PageHeader } from "@/components/dashboard/page-header";
import { useMe } from "@/lib/queries/auth";
import type { DashboardKey } from "@/content/dashboard";

interface DirectoryEntry {
  href: string;
  labelKey: string;
  sectionKey: string;
}

export default function DirectoryPage() {
  const { t } = useLang();
  const meQuery = useMe();
  const industry = meQuery.data?.user?.industry ?? null;

  const [query, setQuery] = useState("");

  const allEntries = useMemo<DirectoryEntry[]>(() => {
    const cfg = navForIndustry(industry);
    const entries: DirectoryEntry[] = [];
    const seen = new Set<string>();

    for (const item of cfg.primaryItems) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      entries.push({ href: item.href, labelKey: item.labelKey, sectionKey: "nav.section.cockpit" });
    }
    for (const section of cfg.sections) {
      for (const item of section.items) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);
        entries.push({ href: item.href, labelKey: item.labelKey, sectionKey: section.titleKey });
      }
    }
    for (const item of cfg.adminSection.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      entries.push({
        href: item.href,
        labelKey: item.labelKey,
        sectionKey: cfg.adminSection.titleKey,
      });
    }
    return entries;
  }, [industry]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allEntries;
    const q = query.toLowerCase();
    return allEntries.filter((e) => {
      const label = t(e.labelKey as DashboardKey).toLowerCase();
      const href = e.href.toLowerCase();
      return label.includes(q) || href.includes(q);
    });
  }, [query, allEntries, t]);

  const grouped = useMemo(() => {
    const map = new Map<string, DirectoryEntry[]>();
    for (const entry of filtered) {
      const arr = map.get(entry.sectionKey) ?? [];
      arr.push(entry);
      map.set(entry.sectionKey, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("directory.title")}
        description={t("directory.description")}
        breadcrumbs={[
          { label: t("nav.overview"), href: "/dashboard" },
          { label: t("directory.title") },
        ]}
      />

      <div className="relative">
        <Search
          size={16}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("directory.search_placeholder")}
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          autoFocus
        />
      </div>

      <div className="text-xs text-[color:var(--ds-text-muted)]">
        {filtered.length} / {allEntries.length} {t("directory.items")}
      </div>

      <div className="space-y-6">
        {grouped.map(([sectionKey, entries]) => (
          <div key={sectionKey}>
            <h2 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
              {t(sectionKey as DashboardKey)}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                >
                  <span className="truncate">{t(entry.labelKey as DashboardKey)}</span>
                  <ArrowRight
                    size={14}
                    className="shrink-0 text-[color:var(--ds-text-subtle)] transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-[color:var(--ds-text-muted)]">
            {t("directory.no_results")}
          </div>
        )}
      </div>
    </div>
  );
}
