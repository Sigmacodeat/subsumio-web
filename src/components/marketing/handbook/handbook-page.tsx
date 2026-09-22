"use client";

/**
 * Subsumio Handbuch (/at/docs). A product manual, not a feature grid: every
 * chapter says what a function is for, where it lives, how to use it and what
 * to know — with a replica of the real view built from the product's own
 * components. Content: src/content/handbook.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Info, Search, X } from "lucide-react";
import {
  HANDBOOK,
  HANDBOOK_FAQ,
  HANDBOOK_META,
  type HandbookChapter,
  type HandbookReplica,
} from "@/content/handbook";
import { cn } from "@/lib/utils";
import {
  AssistantReplica,
  DeadlineCalculatorReplica,
  ImportReplica,
  InvoiceReplica,
  OverviewReplicaFrame,
  RemindersReplica,
  TrustReplica,
} from "./replicas";
import {
  CalendarConflictsReplica,
  ConflictCheckReplica,
  DeadlineRegisterReplica,
  MatterReplica,
} from "./replicas-pages";
import { useMarket } from "@/lib/use-market";

function Replica({ kind, caption }: { kind: HandbookReplica; caption?: string }) {
  switch (kind) {
    case "overview":
      return <OverviewReplicaFrame caption={caption} />;
    case "matter":
      return <MatterReplica caption={caption} />;
    case "deadline-register":
      return <DeadlineRegisterReplica caption={caption} />;
    case "deadline-calculator":
      return <DeadlineCalculatorReplica caption={caption} />;
    case "reminders":
      return <RemindersReplica caption={caption} />;
    case "calendar-conflicts":
      return <CalendarConflictsReplica caption={caption} />;
    case "conflict-check":
      return <ConflictCheckReplica caption={caption} />;
    case "assistant":
      return <AssistantReplica caption={caption} />;
    case "invoice":
      return <InvoiceReplica caption={caption} />;
    case "trust":
      return <TrustReplica caption={caption} />;
    case "import":
      return <ImportReplica caption={caption} />;
  }
}

function chapterText(c: HandbookChapter): string {
  return [
    c.title,
    c.lead,
    c.where,
    c.note ?? "",
    ...(c.steps ?? []).flatMap((s) => [s.title, s.body]),
    ...(c.facts ?? []).flatMap((f) => [f.term, f.body]),
  ]
    .join(" ")
    .toLowerCase();
}

function Chapter({ chapter }: { chapter: HandbookChapter }) {
  return (
    <article
      id={chapter.id}
      aria-labelledby={`${chapter.id}-title`}
      className="scroll-mt-[calc(var(--header-h,64px)+24px)] border-t [border-color:var(--mk-border)] pt-12 first:border-t-0 first:pt-0"
    >
      <h3
        id={`${chapter.id}-title`}
        className="font-display text-2xl font-semibold tracking-[-0.01em] [color:var(--mk-text)] md:text-[1.75rem]"
      >
        {chapter.title}
      </h3>
      <p className="mt-2 max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)]">
        {chapter.lead}
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="[color:var(--mk-text-subtle)]">Im Produkt:</span>
        <span className="font-medium [color:var(--mk-text)]">{chapter.where}</span>
        <Link
          href={chapter.href}
          className="brand-text inline-flex items-center gap-0.5 font-medium hover:underline"
        >
          Öffnen <ArrowUpRight size={14} aria-hidden />
        </Link>
      </p>

      {chapter.replica && <Replica kind={chapter.replica} caption={chapter.replicaCaption} />}

      {chapter.steps && chapter.steps.length > 0 && (
        <section aria-label="So gehen Sie vor" className="mt-8">
          <h4 className="text-xs font-semibold tracking-wide [color:var(--mk-text-subtle)] uppercase">
            So gehen Sie vor
          </h4>
          <ol className="mt-4 space-y-4">
            {chapter.steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="brand-soft brand-text flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium [color:var(--mk-text)]">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {chapter.facts && chapter.facts.length > 0 && (
        <section aria-label="Gut zu wissen" className="mt-8">
          <h4 className="text-xs font-semibold tracking-wide [color:var(--mk-text-subtle)] uppercase">
            Gut zu wissen
          </h4>
          <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {chapter.facts.map((f) => (
              <div key={f.term} className="border-l-2 [border-color:var(--mk-border)] pl-4">
                <dt className="text-sm font-semibold [color:var(--mk-text)]">{f.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {f.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {chapter.note && (
        <p className="mt-8 flex gap-2.5 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm leading-relaxed [color:var(--mk-text-muted)] [background:var(--mk-surface)]">
          <Info size={16} aria-hidden className="brand-text mt-0.5 shrink-0" />
          {chapter.note}
        </p>
      )}
    </article>
  );
}

export default function HandbookPage() {
  const { p } = useMarket();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>(HANDBOOK[0].chapters[0].id);
  const searchRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return HANDBOOK;
    return HANDBOOK.map((g) => ({
      ...g,
      chapters: g.chapters.filter((c) => chapterText(c).includes(q)),
    })).filter((g) => g.chapters.length > 0);
  }, [q]);
  const total = HANDBOOK.reduce((n, g) => n + g.chapters.length, 0);
  const shown = groups.reduce((n, g) => n + g.chapters.length, 0);

  // Table of contents follows the chapter in view.
  useEffect(() => {
    const els = groups.flatMap((g) => g.chapters.map((c) => document.getElementById(c.id)));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" }
    );
    els.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [groups]);

  // "/" focuses the search, as in the product's command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div data-tone="light" className="min-h-screen [background:var(--mk-bg)]">
      <header className="mx-auto max-w-[1240px] px-4 pt-28 pb-10 sm:px-6 md:pt-32 lg:px-8">
        <p className="brand-text text-sm font-semibold">{HANDBOOK_META.eyebrow}</p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.02em] [color:var(--mk-text)] md:text-5xl">
          {HANDBOOK_META.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]">
          {HANDBOOK_META.lead}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Handbuch durchsuchen</span>
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 [color:var(--mk-text-subtle)]"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder={HANDBOOK_META.searchPlaceholder}
              className="h-11 w-full rounded-xl border [border-color:var(--mk-border)] pr-10 pl-10 text-sm [color:var(--mk-text)] shadow-[var(--ds-shadow-1)] [background:var(--mk-surface)] placeholder:[color:var(--mk-text-subtle)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Suche leeren"
                className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md [color:var(--mk-text-subtle)] hover:[background:var(--mk-surface-2)]"
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </label>
          <p className="text-sm [color:var(--mk-text-subtle)]">
            {q ? `${shown} von ${total} Kapiteln` : `${total} Kapitel`} · {HANDBOOK_META.updated}
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-12 px-4 pb-28 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <nav aria-label="Inhalt" className="hidden lg:block">
          <div className="sticky top-[calc(var(--header-h,64px)+24px)] max-h-[calc(100vh-var(--header-h,64px)-48px)] overflow-y-auto pr-2">
            {groups.map((g) => (
              <div key={g.id} className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-wide [color:var(--mk-text-subtle)] uppercase">
                  {g.title}
                </p>
                <ul className="space-y-0.5 border-l [border-color:var(--mk-border)]">
                  {g.chapters.map((c) => (
                    <li key={c.id}>
                      <a
                        href={`#${c.id}`}
                        aria-current={active === c.id ? "true" : undefined}
                        className={cn(
                          "-ml-px block border-l-2 py-1 pl-3 text-sm transition-[color,border-color] duration-[var(--ds-duration-fast)]",
                          active === c.id
                            ? "border-[color:var(--brand-primary)] font-medium [color:var(--mk-text)]"
                            : "border-transparent [color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
                        )}
                      >
                        {c.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <a
              href="#faq"
              className="text-sm [color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
            >
              Häufige Fragen
            </a>
          </div>
        </nav>

        <main className="min-w-0">
          {/* Mobile chapter picker */}
          <div className="mb-8 lg:hidden">
            <label className="block text-xs font-semibold tracking-wide [color:var(--mk-text-subtle)] uppercase">
              Kapitel
              <select
                className="mt-2 h-11 w-full rounded-xl border [border-color:var(--mk-border)] px-3 text-sm [color:var(--mk-text)] [background:var(--mk-surface)]"
                value={active}
                onChange={(e) => {
                  setActive(e.target.value);
                  document.getElementById(e.target.value)?.scrollIntoView({ block: "start" });
                }}
              >
                {groups.map((g) => (
                  <optgroup key={g.id} label={g.title}>
                    {g.chapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          {groups.length === 0 && (
            <div className="rounded-2xl border [border-color:var(--mk-border)] px-6 py-14 text-center [background:var(--mk-surface)]">
              <p className="font-medium [color:var(--mk-text)]">Kein Kapitel zu „{query.trim()}“</p>
              <p className="mt-1 text-sm [color:var(--mk-text-muted)]">
                Versuchen Sie einen anderen Begriff, etwa „Frist“, „Rechnung“ oder „Akte“.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="brand-text mt-4 text-sm font-medium hover:underline"
              >
                Suche zurücksetzen
              </button>
            </div>
          )}

          <div className="space-y-20">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`group-${g.id}`}>
                <p
                  role="heading"
                  aria-level={2}
                  id={`group-${g.id}`}
                  className="mb-10 text-xs font-semibold tracking-[0.12em] [color:var(--mk-text-subtle)] uppercase"
                >
                  {g.title}
                </p>
                <div className="space-y-12">
                  {g.chapters.map((c) => (
                    <Chapter key={c.id} chapter={c} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {!q && (
            <section
              id="faq"
              aria-labelledby="faq-title"
              className="mt-24 scroll-mt-[calc(var(--header-h,64px)+24px)] border-t [border-color:var(--mk-border)] pt-12"
            >
              <h2
                id="faq-title"
                className="font-display text-2xl font-semibold [color:var(--mk-text)]"
              >
                Häufige Fragen
              </h2>
              <div className="mt-6 divide-y [border-color:var(--mk-border)]">
                {HANDBOOK_FAQ.map((f) => (
                  <details key={f.q} className="group [border-color:var(--mk-border)] py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [color:var(--mk-text)]">
                      {f.q}
                      <span
                        aria-hidden
                        className="text-lg leading-none [color:var(--mk-text-subtle)] transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {f.a}
                    </p>
                  </details>
                ))}
              </div>
              <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)] sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold [color:var(--mk-text)]">Frage nicht beantwortet?</p>
                  <p className="mt-1 text-sm [color:var(--mk-text-muted)]">
                    Schreiben Sie uns — wir antworten an Werktagen innerhalb eines Tages.
                  </p>
                </div>
                <Link
                  href={p("/contact")}
                  className="brand-bg inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-white"
                >
                  Kontakt aufnehmen
                </Link>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
