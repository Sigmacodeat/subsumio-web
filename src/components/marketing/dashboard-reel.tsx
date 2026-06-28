"use client";

// "Subsumio in action" — a scripted, looping mockup of the real dashboard.
// Cycles through three views: Matters list, Brain Q&A (with cited answer),
// and Deadlines calendar. The premium "product reel" technique (Linear/Arc
// style) done in pure React/framer-motion — no video, themeable via --brand-*.
// Reduced-motion shows the Brain view in its final answered state.

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Brain,
  FolderOpen,
  CalendarClock,
  Send,
  FileText,
  MessageSquare,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import type { Lang } from "@/content/site";
import { UI_STRINGS } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";
import { GuidedCursor } from "./motion-system";

interface ViewContent {
  matters: { id: string; title: string; client: string; status: string; statusColor: string }[];
  brain: { question: string; file: string; answer: string; sources: string[] };
  deadlines: { date: string; title: string; matter: string; urgent: boolean }[];
}

interface Branch {
  sidebar: { icon: typeof Brain; label: string }[];
  views: Partial<Record<Lang, ViewContent>>;
}

const _deBranches: ViewContent = {
  matters: [
    {
      id: "AZ-2026-041",
      title: "Bauer ./. Hofer GmbH",
      client: "Bauer M.",
      status: "Verhandlung",
      statusColor: "amber",
    },
    {
      id: "AZ-2026-038",
      title: "Schwarz Erbrecht",
      client: "Fam. Schwarz",
      status: "Aktiv",
      statusColor: "blue",
    },
    {
      id: "AZ-2026-035",
      title: "Müller Arbeitsrecht",
      client: "Müller K.",
      status: "Klage",
      statusColor: "rose",
    },
    {
      id: "AZ-2026-031",
      title: "Reichmann Mietrecht",
      client: "Reichmann W.",
      status: "Gutachten",
      statusColor: "violet",
    },
    {
      id: "AZ-2025-098",
      title: "Klein ./. Versicherung",
      client: "Klein S.",
      status: "Abgeschlossen",
      statusColor: "green",
    },
  ],
  brain: {
    question: "Was ist in der Akte Bauer noch offen — mit Fundstellen?",
    file: "Akte_Bauer-Hofer.pdf",
    answer:
      "3 offene Punkte: Frist Klageerwiderung (12.07.), fehlende Vollmacht, Zeugenliste unvollständig.",
    sources: ["akten/bauer-hofer", "fristen/2026-07", "schriftsatz/klageerwiderung"],
  },
  deadlines: [
    { date: "12.07.", title: "Klageerwiderung Bauer", matter: "AZ-2026-041", urgent: true },
    { date: "18.07.", title: "Berufungsfrist Müller", matter: "AZ-2026-035", urgent: true },
    { date: "25.07.", title: "Gutachten Klein", matter: "AZ-2026-031", urgent: false },
    { date: "01.08.", title: "Replik Schwarz", matter: "AZ-2026-038", urgent: false },
  ],
} as const;

const BRANCHES: Record<string, Branch> = {
  legal: {
    sidebar: [
      { icon: Brain, label: "Brain" },
      { icon: FolderOpen, label: "Akten" },
      { icon: CalendarClock, label: "Fristen" },
      { icon: FileText, label: "Schriftsätze" },
    ],
    views: {
      de: _deBranches,
      at: _deBranches,
      ch: _deBranches,
      en: {
        matters: [
          {
            id: "AZ-2026-041",
            title: "Bauer ./. Hofer GmbH",
            client: "Bauer M.",
            status: "Hearing",
            statusColor: "amber",
          },
          {
            id: "AZ-2026-038",
            title: "Schwarz Estate",
            client: "Schwarz Fam.",
            status: "Active",
            statusColor: "blue",
          },
          {
            id: "AZ-2026-035",
            title: "Müller Employment",
            client: "Müller K.",
            status: "Filing",
            statusColor: "rose",
          },
          {
            id: "AZ-2026-031",
            title: "Reichmann Tenancy",
            client: "Reichmann W.",
            status: "Expert",
            statusColor: "violet",
          },
          {
            id: "AZ-2025-098",
            title: "Klein ./. Insurance",
            client: "Klein S.",
            status: "Closed",
            statusColor: "green",
          },
        ],
        brain: {
          question: "What's still open in the Bauer matter — with sources?",
          file: "Matter_Bauer-Hofer.pdf",
          answer:
            "3 open items: defense-filing deadline (Jul 12), missing power of attorney, witness list incomplete.",
          sources: ["matters/bauer-hofer", "deadlines/2026-07", "filing/defense"],
        },
        deadlines: [
          { date: "Jul 12", title: "Defense filing — Bauer", matter: "AZ-2026-041", urgent: true },
          {
            date: "Jul 18",
            title: "Appeal deadline — Müller",
            matter: "AZ-2026-035",
            urgent: true,
          },
          { date: "Jul 25", title: "Expert report — Klein", matter: "AZ-2026-031", urgent: false },
          { date: "Aug 01", title: "Reply brief — Schwarz", matter: "AZ-2026-038", urgent: false },
        ],
      },
    },
  },
};

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  amber: { text: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  blue: { text: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  rose: { text: "#fb7185", bg: "rgba(251,113,133,0.12)" },
  violet: { text: "#c084fc", bg: "rgba(192,132,252,0.12)" },
  green: { text: "#34d399", bg: "rgba(52,211,153,0.12)" },
};

const VIEW_DURATION = 3200;
const TYPING_SPEED = 45;

export default function DashboardReel({
  lang,
  industry = "legal",
  className = "",
}: {
  lang: Lang;
  industry?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const branch = BRANCHES[industry] ?? BRANCHES.legal;
  const v = branch.views[lang] ?? branch.views.de!;
  const sidebar = branch.sidebar;
  const brand = (profileForIndustry(industry)?.brand ?? "Subsumio").toLowerCase();
  const [view, setView] = useState(reduce ? 1 : 0);
  const [typed, setTyped] = useState("");
  const [brainPhase, setBrainPhase] = useState(reduce ? 2 : 0);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setView((prev) => (prev + 1) % 3), VIEW_DURATION);
    return () => clearTimeout(t);
  }, [view, reduce]);

  useEffect(() => {
    if (reduce) return;
    if (view !== 1) {
      setBrainPhase(0);
      setTyped("");
      return;
    }
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(v.brain.question.slice(0, i));
      if (i >= v.brain.question.length) {
        clearInterval(iv);
        setBrainPhase(1);
        setTimeout(() => setBrainPhase(2), 800);
      }
    }, TYPING_SPEED);
    return () => clearInterval(iv);
  }, [view, reduce, v.brain.question]);

  const sidebarLabels =
    lang !== "en"
      ? ["Brain", "Akten", "Fristen", "Schriftsätze"]
      : ["Brain", "Matters", "Deadlines", "Filings"];
  const cursorTarget =
    view === 0
      ? {
          x: "72%",
          y: "42%",
          label: UI_STRINGS[lang].openMatter,
        }
      : view === 1
        ? {
            x: "74%",
            y: "87%",
            label: UI_STRINGS[lang].sendQuestion,
          }
        : {
            x: "70%",
            y: "52%",
            label: UI_STRINGS[lang].checkDeadline,
          };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/20 [background:var(--mk-bg)] ${className}`}
    >
      <GuidedCursor {...cursorTarget} className="hidden sm:flex" />
      {/* window bar */}
      <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]">
        <div className="terminal-dots flex items-center gap-2">
          <span className="terminal-dot-red" />
          <span className="terminal-dot-amber" />
          <span className="terminal-dot-green" />
        </div>
        <div className="ml-3 flex-1 font-mono text-xs [color:var(--mk-text-subtle)]">
          {brand} — dashboard
        </div>
        <span className="brand-text text-xs font-medium">live</span>
      </div>

      <div className="grid h-[480px] grid-cols-[160px_1fr]">
        {/* sidebar */}
        <div className="hidden flex-col gap-1 border-r [border-color:var(--mk-border)] p-3 [background:var(--mk-surface-2)] sm:flex">
          {/* firm header */}
          <div className="brand-soft brand-border mb-3 rounded-lg border px-2 py-2">
            <div className="flex items-center gap-2">
              <div className="brand-bg flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                <Brain size={13} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold [color:var(--mk-text)]">
                  Rechtsanwälte
                </p>
                <p className="text-xs [color:var(--mk-text-subtle)]">Kanzlei Müller</p>
              </div>
            </div>
          </div>
          {sidebar.map((item, i) => {
            const Icon = item.icon;
            const isActive =
              (view === 0 && i === 1) || (view === 1 && i === 0) || (view === 2 && i === 2);
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors ${
                  isActive ? "brand-soft brand-text font-medium" : "[color:var(--mk-text-muted)]"
                }`}
              >
                <Icon
                  size={14}
                  className={isActive ? "brand-text" : "[color:var(--mk-text-subtle)]"}
                />
                {sidebarLabels[i]}
              </div>
            );
          })}
          {/* usage at bottom */}
          <div className="mt-auto border-t [border-color:var(--mk-border)] pt-3">
            <div className="mb-1 text-xs [color:var(--mk-text-subtle)]">Assistenten-Anfragen</div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full [background:var(--mk-surface)]">
                <div className="brand-bg h-full rounded-full" style={{ width: "42%" }} />
              </div>
              <span className="font-mono text-xs [color:var(--mk-text-muted)]">42%</span>
            </div>
          </div>
        </div>

        {/* main content area */}
        <div className="relative flex flex-col overflow-hidden">
          {/* top bar */}
          <div className="flex items-center gap-3 border-b [border-color:var(--mk-border)] px-4 py-2.5 [background:var(--mk-surface)]">
            <div className="flex flex-1 items-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-2.5 py-1.5 [background:var(--mk-bg)]">
              <Search size={13} className="[color:var(--mk-text-subtle)]" />
              <span className="text-xs [color:var(--mk-text-subtle)]">
                {UI_STRINGS[lang].searchPlaceholder}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs [color:var(--mk-text-subtle)]">
              <Clock size={11} />
              {UI_STRINGS[lang].timeLabel}
            </div>
          </div>

          {/* view content */}
          <div className="flex-1 overflow-hidden p-4">
            <AnimatePresence mode="wait">
              {/* View 0: Matters list */}
              {view === 0 && (
                <motion.div
                  key="matters"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold [color:var(--mk-text)]">
                      {UI_STRINGS[lang].mattersLabel}
                    </h3>
                    <span className="text-xs [color:var(--mk-text-subtle)]">
                      {v.matters.length} {UI_STRINGS[lang].mattersCount}
                    </span>
                  </div>
                  {v.matters.map((m, i) => {
                    const sc = STATUS_COLORS[m.statusColor];
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="flex items-center gap-3 rounded-lg border [border-color:var(--mk-border)] px-3 py-2.5 transition-colors [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: sc.bg }}
                        >
                          <FileText size={14} style={{ color: sc.text }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium [color:var(--mk-text)]">
                            {m.title}
                          </p>
                          <p className="font-mono text-xs [color:var(--mk-text-subtle)]">
                            {m.id} · {m.client}
                          </p>
                        </div>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ color: sc.text, background: sc.bg }}
                        >
                          {m.status}
                        </span>
                        <ChevronRight size={14} className="[color:var(--mk-text-subtle)]" />
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              {/* View 1: Brain Q&A */}
              {view === 1 && (
                <motion.div
                  key="brain"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-full flex-col"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Brain size={15} className="brand-text" />
                    <h3 className="text-sm font-bold [color:var(--mk-text)]">Brain</h3>
                  </div>
                  <div className="flex-1 space-y-3 overflow-hidden">
                    {brainPhase > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end"
                      >
                        <div className="max-w-[85%] rounded-xl rounded-tr-sm border [border-color:var(--mk-border)] px-3 py-2 [background:var(--mk-surface)]">
                          <p className="text-xs [color:var(--mk-text)]">{v.brain.question}</p>
                          <span className="brand-text mt-1 inline-flex items-center gap-1 text-xs">
                            <FileText size={10} /> {v.brain.file}
                          </span>
                        </div>
                      </motion.div>
                    )}
                    {brainPhase === 1 && (
                      <div className="flex items-center gap-1.5 text-xs [color:var(--mk-text-muted)]">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--brand-secondary)]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--brand-secondary)] [animation-delay:0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--brand-secondary)] [animation-delay:0.3s]" />
                      </div>
                    )}
                    {brainPhase === 2 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-2"
                      >
                        <div className="brand-soft brand-border flex h-6 w-6 shrink-0 items-center justify-center rounded-md border">
                          <MessageSquare size={12} className="brand-text" />
                        </div>
                        <div className="max-w-[85%]">
                          <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
                            {v.brain.answer}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {v.brain.sources.map((s) => (
                              <span
                                key={s}
                                className="brand-text brand-soft rounded px-1.5 py-0.5 font-mono text-xs"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border [border-color:var(--mk-border)] px-2.5 py-2 [background:var(--mk-surface-2)]">
                    <div className="min-h-[16px] flex-1 text-xs [color:var(--mk-text)]">
                      <span>{brainPhase === 0 ? typed : ""}</span>
                      {brainPhase === 0 && (
                        <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-[var(--brand-secondary)] align-middle" />
                      )}
                    </div>
                    <div className="brand-bg rounded-lg p-1.5">
                      <Send size={13} className="text-white" />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* View 2: Deadlines */}
              {view === 2 && (
                <motion.div
                  key="deadlines"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold [color:var(--mk-text)]">
                      {UI_STRINGS[lang].deadlinesLabel}
                    </h3>
                    <span className="text-xs font-medium text-rose-400">
                      {v.deadlines.filter((d) => d.urgent).length} {UI_STRINGS[lang].urgentLabel}
                    </span>
                  </div>
                  {v.deadlines.map((d, i) => (
                    <motion.div
                      key={d.title}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                        d.urgent
                          ? "border-rose-500/20 [background:rgba(251,113,133,0.06)]"
                          : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          d.urgent ? "bg-rose-500/10" : "[background:var(--mk-surface-2)]"
                        }`}
                      >
                        {d.urgent ? (
                          <AlertTriangle size={14} className="text-rose-400" />
                        ) : (
                          <CheckCircle2 size={14} className="[color:var(--mk-text-subtle)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium [color:var(--mk-text)]">
                          {d.title}
                        </p>
                        <p className="font-mono text-xs [color:var(--mk-text-subtle)]">
                          {d.matter}
                        </p>
                      </div>
                      <span
                        className={`font-mono text-xs font-medium ${d.urgent ? "text-rose-400" : "[color:var(--mk-text-muted)]"}`}
                      >
                        {d.date}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
