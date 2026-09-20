"use client";

// Product demo — a faithful replica of the real Subsumio dashboard, not a
// generic mockup. It renders inside the dashboard token scope
// (`data-app="dashboard"`), uses the real navigation labels and icons, the
// real UI primitives (Badge, Button) and the real CitationPanel, so every
// colour, radius and shadow is the product's own.
//
// Scenes follow one Austrian example end to end:
//   frage → akte → fundstelle → frist
// `scene` makes it controlled (scroll story); without it the demo autoplays.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import {
  Bell,
  Briefcase,
  CalendarClock,
  Check,
  ChevronDown,
  Command,
  FileText,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageSquareText,
  Plus,
  Search,
  SearchCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { SubsumioMark, SubsumioWordmark } from "@/components/brand/subsumio-logo";
import { PRODUCT_DEMO } from "@/content/site";

export type DemoScene = "frage" | "akte" | "fundstelle" | "frist";
const ORDER: DemoScene[] = ["frage", "akte", "fundstelle", "frist"];
const SCENE_MS: Record<DemoScene, number> = {
  frage: 3200,
  akte: 3800,
  fundstelle: 6200,
  frist: 4600,
};

const NAV: Array<{ key: string; label: string; icon: LucideIcon; scenes: DemoScene[] }> = [
  { key: "overview", label: "Übersicht", icon: LayoutDashboard, scenes: [] },
  { key: "cases", label: "Akten", icon: Briefcase, scenes: ["akte"] },
  { key: "deadlines", label: "Fristen", icon: CalendarClock, scenes: ["frist"] },
  { key: "intake", label: "Posteingang", icon: Inbox, scenes: [] },
  { key: "research", label: "Rechtsrecherche", icon: SearchCheck, scenes: [] },
  { key: "chat", label: "Assistent", icon: MessageSquareText, scenes: ["frage", "fundstelle"] },
];

const CITATIONS: CitationPanelData = {
  citations: [
    {
      slug: "legal/cases/2026-003/klage-zustellnachweis",
      title: "Klage_Zustellnachweis.pdf, S. 2",
    },
    { slug: "law/at/zpo/230", title: "§ 230 ZPO" },
  ],
  gaps: [],
  grounding: {
    citations_verified: 2,
    citations_unverified: 0,
    corpus_checked: true,
    analyzed_at: "2026-09-17T09:12:00.000Z",
    grounded_citations: [
      {
        code: "ZPO",
        paragraph: "§ 230 Abs. 1",
        verified: true,
        category: "statute",
        jurisdiction: "at",
        context: "Frist zur Klagebeantwortung: vier Wochen, nicht verlängerbar",
      },
    ],
  },
  isStreaming: false,
  attorneyReviewRequired: true,
  jurisdiction: "AT",
};

export default function ProductDemo({
  scene,
  className = "",
  theme = "light",
}: {
  scene?: DemoScene;
  className?: string;
  theme?: "light" | "dark";
}) {
  const reduce = useReducedMotion();
  const controlled = scene !== undefined;
  const [auto, setAuto] = useState<DemoScene>(reduce ? "fundstelle" : "frage");
  const current = controlled ? scene : auto;

  useEffect(() => {
    if (controlled || reduce) return;
    const id = window.setTimeout(() => {
      setAuto((s) => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length]);
    }, SCENE_MS[auto]);
    return () => window.clearTimeout(id);
  }, [auto, controlled, reduce]);

  const d = PRODUCT_DEMO;

  return (
    <div
      data-app="dashboard"
      data-theme={theme}
      data-product-demo
      className={`relative overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] text-left text-[color:var(--ds-text)] ${className}`}
      style={{ boxShadow: "var(--ds-shadow-3)" }}
    >
      {/* The replica is a picture of the product: described once, not operable
          (inert keeps the real CitationPanel's buttons out of the tab order). */}
      <div
        role="img"
        aria-label={d.ariaLabel}
        inert
        // A fixed height, not a minimum: the scenes differ in height, and the
        // tallest one used to stretch the frame mid-cycle, which moved the hero
        // and everything below it down by ~40 px.
        className="grid h-[470px] grid-cols-1 sm:grid-cols-[196px_minmax(0,1fr)]"
      >
        {/* ── Sidebar (real labels, icons and active style) ── */}
        <aside className="hidden flex-col border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] sm:flex">
          <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-3 py-3">
            <SubsumioMark size={22} animated={false} />
            <SubsumioWordmark className="text-[14px]" />
          </div>
          <div className="mx-2.5 mt-2.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2.5 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-[color:var(--ds-text-subtle)]">
                Wissensbasis
              </span>
              <span className="flex items-center gap-1 text-[10px] font-medium text-[color:var(--ds-text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ds-success-solid)]" />
                Aktiv
              </span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[9.5px] whitespace-nowrap text-[color:var(--ds-text-subtle)] tabular-nums">
              {d.brainStats}
            </div>
          </div>
          <nav className="mt-2.5 grid gap-0.5 px-2.5" aria-hidden>
            {NAV.map((item) => {
              const active = item.scenes.includes(current);
              const Icon = item.icon;
              return (
                <span
                  key={item.key}
                  className={`flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[12px] font-semibold transition-[background-color,color] duration-[var(--ds-duration-fast)] ${
                    active
                      ? "brand-soft brand-text border-l-[3px] border-[color:var(--brand-primary)]"
                      : "text-[color:var(--ds-text)]"
                  }`}
                >
                  <Icon
                    size={14}
                    strokeWidth={1.75}
                    className={active ? "" : "text-[color:var(--ds-text-muted)]"}
                  />
                  {item.label}
                  {item.key === "intake" && (
                    <span className="ml-auto rounded-full bg-[color:var(--brand-solid)] px-1.5 text-[9px] font-semibold text-white">
                      1
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="mt-auto flex items-center gap-2 border-t border-[color:var(--ds-border)] px-3 py-2.5">
            <span className="brand-soft brand-text flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold">
              MH
            </span>
            <span className="truncate text-[11px] font-medium">{d.user}</span>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="flex min-w-0 flex-col">
          {/* Topbar */}
          <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
            <div className="relative min-w-0 flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-1.5 pr-10 pl-8 text-[12px] text-[color:var(--ds-text-subtle)]">
              <Search
                size={13}
                className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <span className="block truncate">KI fragen, Akten, Fristen…</span>
              <kbd className="absolute top-1/2 right-2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1 font-mono text-[9px] sm:flex">
                <Command size={8} />K
              </kbd>
            </div>
            <span className="hidden items-center gap-1 rounded-lg border border-[color:var(--ds-border)] px-2 py-1.5 text-[11px] font-medium md:flex">
              <Briefcase size={12} /> Akten <ChevronDown size={11} />
            </span>
            <Bell size={14} className="text-[color:var(--ds-text-muted)]" />
            <span className="hidden items-center gap-1 text-[11px] font-medium sm:flex">
              <Plus size={12} /> Neu
            </span>
          </div>

          {/* Scene */}
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[color:var(--ds-bg)]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current}
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="h-full p-3 sm:p-4"
              >
                {(current === "frage" || current === "fundstelle") && (
                  <AssistantScene full={current === "fundstelle"} animate={!reduce} />
                )}
                {current === "akte" && <MatterScene />}
                {current === "frist" && <DeadlineScene animate={!reduce} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Scene dots — also the manual control when autoplaying */}
      {!controlled && (
        <div className="flex items-center justify-center gap-1 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-1">
          {ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setAuto(s)}
              aria-label={d.sceneLabels[s]}
              aria-current={s === current ? "step" : undefined}
              /* 24px hit area (WCAG target size); the visible dot stays small. */
              className="group flex h-6 min-w-6 items-center justify-center px-1"
            >
              <span
                className={`h-1.5 rounded-full transition-[width,background-color] duration-[var(--ds-duration-normal)] ${
                  s === current
                    ? "w-5 bg-[color:var(--brand-solid)]"
                    : "w-1.5 bg-[color:var(--ds-text-subtle)] group-hover:bg-[color:var(--ds-text-muted)]"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Scenes ─────────────────────────────────────────────────────────────── */

function AssistantScene({ full, animate }: { full: boolean; animate: boolean }) {
  const d = PRODUCT_DEMO;
  const [shown, setShown] = useState(animate && full ? 0 : d.answer.length);
  useEffect(() => {
    if (!animate || !full) return;
    const timers = d.answer.map((_, i) => window.setTimeout(() => setShown(i + 1), 500 + i * 650));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [animate, full, d.answer]);
  const done = shown >= d.answer.length;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--ds-text-muted)]">
        <Sparkles size={12} className="brand-text" />
        Assistent · Akte {d.matterNumber} · {d.matter}
      </div>
      {/* user bubble — same classes as the product's chat message */}
      <div className="flex justify-end">
        <div className="brand-bg max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
          {d.question}
        </div>
      </div>
      {!full ? (
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--ds-text-muted)]">
          <span className="flex gap-0.5" aria-hidden>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-40 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-20 [animation-delay:300ms]" />
          </span>
          {d.thinking}
        </div>
      ) : (
        <>
          <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3.5 py-2.5 text-[13px] leading-relaxed">
            {d.answer.slice(0, shown).map((line, i) => (
              <p key={line} className={i > 0 ? "mt-1.5 mb-0" : "m-0"}>
                {i === d.answer.length - 1 ? (
                  <strong className="font-semibold">{line}</strong>
                ) : (
                  line
                )}
              </p>
            ))}
            {!done && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[color:var(--ds-text-muted)] align-middle"
              />
            )}
          </div>
          {done && (
            <motion.div
              initial={animate ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-[92%]"
            >
              <CitationPanel data={CITATIONS} compact />
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

function MatterScene() {
  const d = PRODUCT_DEMO;
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold tracking-[-0.01em]">{d.matter}</span>
          <span className="font-mono text-[10px] text-[color:var(--ds-text-subtle)]">
            {d.matterNumber}
          </span>
          <Badge variant="info" className="text-[10px]">
            Offen
          </Badge>
          <Badge variant="default" className="text-[10px]">
            Zivilrecht
          </Badge>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--ds-text-muted)] tabular-nums">
          <span>Fristen: 1/2</span>
          <span>Aufgaben: 0/3</span>
          <span>Doku: {d.documents.length}</span>
          <span className="rounded bg-[color:var(--ds-warning-bg)] px-1.5 text-[color:var(--ds-warning-text)]">
            Nächste: {d.deadline.date}
          </span>
        </div>
      </div>
      <div className="flex gap-1 text-[11px] font-medium text-[color:var(--ds-text-muted)]">
        {["Übersicht", "Dokumente", "E-Mails", "Fristen", "Strategie"].map((tab) => (
          <span
            key={tab}
            className={`rounded-md px-2 py-1 ${tab === "Dokumente" ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]" : ""}`}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="grid gap-1.5">
        {d.documents.map((f) => {
          const Icon = f.kind === "mail" ? Mail : FileText;
          return (
            <div
              key={f.name}
              className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-[12px] ${
                f.hit
                  ? "brand-soft border-[color:var(--brand-primary)]/35"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
              }`}
            >
              <Icon
                size={14}
                className={f.hit ? "brand-text" : "text-[color:var(--ds-text-subtle)]"}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}</div>
                <div className="text-[10px] text-[color:var(--ds-text-muted)]">{f.meta}</div>
              </div>
              {f.hit && (
                <Badge variant="info" className="text-[9px]">
                  wird gelesen
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeadlineScene({ animate }: { animate: boolean }) {
  const d = PRODUCT_DEMO;
  const [confirmed, setConfirmed] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const id = window.setTimeout(() => setConfirmed(true), 1800);
    return () => window.clearTimeout(id);
  }, [animate]);
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Fristen &amp; Termine</div>
          <div className="text-[11px] text-[color:var(--ds-text-muted)]">{d.deadlineSummary}</div>
        </div>
        <Button variant="primary" size="sm" className="h-7 gap-1 px-2.5 text-[11px]" tabIndex={-1}>
          <Plus size={12} /> Frist anlegen
        </Button>
      </div>
      {/* AI proposal — confirmed by the lawyer, never created silently */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2">
        <div className="flex items-center gap-2 text-[12px]">
          <Sparkles size={13} className="text-[color:var(--ds-warning-text)]" />
          <span>
            <strong className="font-semibold">KI-Vorschlag:</strong> {d.deadline.title} ·{" "}
            {d.deadline.date} · {d.deadline.basis}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-[background-color,color] duration-[var(--ds-duration-normal)] ${
            confirmed
              ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
              : "brand-bg text-white"
          }`}
        >
          <Check size={11} /> {confirmed ? "Bestätigt" : "Bestätigen"}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-[10px] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
          <span>Frist</span>
          <span>Status</span>
          <span>Datum</span>
        </div>
        {d.deadlines.map((r) => {
          const isNew = r.key === "new";
          if (isNew && !confirmed) return null;
          return (
            <motion.div
              key={r.title}
              initial={
                isNew && animate ? { opacity: 0, backgroundColor: "rgba(182,143,53,0.18)" } : false
              }
              animate={{ opacity: 1, backgroundColor: "rgba(182,143,53,0)" }}
              transition={{ duration: 1.2 }}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[color:var(--ds-border)] px-3 py-2 text-[12px] last:border-0"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.title}</div>
                <div className="truncate text-[10px] text-[color:var(--ds-text-muted)]">
                  {r.matter}
                </div>
              </div>
              <Badge variant={r.tone} className="text-[9px]">
                {r.status}
              </Badge>
              <span className="font-mono text-[11px] text-[color:var(--ds-text-muted)] tabular-nums">
                {r.date}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
