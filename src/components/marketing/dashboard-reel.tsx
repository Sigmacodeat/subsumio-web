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
  LayoutDashboard,
  Briefcase,
  CalendarClock,
  MessageSquareText,
  Inbox,
  Send,
  FileText,
  MessageSquare,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Zap,
  CalendarDays,
  PenLine,
  FileCheck,
  ShieldCheck,
} from "lucide-react";
import type { Lang } from "@/content/site";
import { UI_STRINGS } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";
import { GuidedCursor } from "./motion-system";

interface ViewContent {
  matters: { id: string; title: string; client: string; status: string; statusColor: string }[];
  brain: { question: string; file: string; answer: string; sources: string[] };
  deadlines: { date: string; title: string; matter: string; urgent: boolean }[];
  calendar: {
    day: string;
    weekday: string;
    entries: { time: string; title: string; matter: string; tone: string }[];
  };
  review: {
    fileName: string;
    riskAreas: { line: string; text: string; severity: "high" | "medium" | "low" }[];
    summary: string;
    clauses: { name: string; status: "ok" | "flag" | "missing" }[];
  };
  approval: {
    items: {
      title: string;
      type: string;
      submittedBy: string;
      submittedAt: string;
      status: string;
      statusColor: string;
    }[];
    auditTrail: { action: string; user: string; time: string }[];
  };
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
  calendar: {
    day: "12",
    weekday: "Freitag",
    entries: [
      { time: "09:00", title: "Verhandlung Bauer", matter: "AZ-2026-041", tone: "amber" },
      { time: "11:30", title: "Mandantengespräch Schwarz", matter: "AZ-2026-038", tone: "blue" },
      { time: "14:00", title: "Frist Klageerwiderung", matter: "AZ-2026-041", tone: "rose" },
      { time: "16:00", title: "Aktennotiz Müller", matter: "AZ-2026-035", tone: "violet" },
    ],
  },
  review: {
    fileName: "Vertrag_Bauer-Hofer_v3.pdf",
    riskAreas: [
      {
        line: "§ 4 Abs. 2",
        text: "Haftungsbegrenzung fehlt — Vollhaftung ohne Deckel",
        severity: "high",
      },
      { line: "§ 7 Abs. 1", text: "Kündigungsfrist 6 Wochen — unüblich kurz", severity: "medium" },
      { line: "§ 12 Abs. 3", text: "Schriftformklausel ohne AGB-Verweis", severity: "low" },
    ],
    summary: "3 Risiken erkannt — 1 kritisch, 1 moderat, 1 niedrig. § 4 vor Signatur verhandeln.",
    clauses: [
      { name: "Gewährleistung", status: "ok" },
      { name: "Haftungsbegrenzung", status: "missing" },
      { name: "Kündigungsfrist", status: "flag" },
      { name: "Schriftform", status: "ok" },
      { name: "Geheimhaltung", status: "ok" },
    ],
  },
  approval: {
    items: [
      {
        title: "Schriftsatz Klageerwiderung Bauer",
        type: "document_finalize",
        submittedBy: "Dr. Weber",
        submittedAt: "vor 12 Min",
        status: "Wartet auf Freigabe",
        statusColor: "amber",
      },
      {
        title: "Rechnung AZ-2026-038 Schwarz",
        type: "invoice_create",
        submittedBy: "Fr. Klein",
        submittedAt: "vor 1 Std",
        status: "Zur Freigabe",
        statusColor: "blue",
      },
      {
        title: "Vertragsentwurf Müller",
        type: "document_finalize",
        submittedBy: "Hr. Schmidt",
        submittedAt: "vor 3 Std",
        status: "Überarbeitet",
        statusColor: "violet",
      },
    ],
    auditTrail: [
      { action: "Entwurf hochgeladen", user: "Dr. Weber", time: "09:14" },
      { action: "KI-Review durchgeführt", user: "Brain", time: "09:15" },
      { action: "Zur Freigabe gesendet", user: "Dr. Weber", time: "09:22" },
      { action: "Wartet auf Partner", user: "System", time: "09:22" },
    ],
  },
} as const;

const BRANCHES: Record<string, Branch> = {
  legal: {
    sidebar: [
      { icon: LayoutDashboard, label: "Overview" },
      { icon: Briefcase, label: "Akten" },
      { icon: CalendarClock, label: "Fristen" },
      { icon: Inbox, label: "Intake" },
      { icon: MessageSquareText, label: "Chat" },
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
        calendar: {
          day: "12",
          weekday: "Friday",
          entries: [
            { time: "09:00", title: "Hearing — Bauer", matter: "AZ-2026-041", tone: "amber" },
            { time: "11:30", title: "Client call — Schwarz", matter: "AZ-2026-038", tone: "blue" },
            { time: "14:00", title: "Filing deadline", matter: "AZ-2026-041", tone: "rose" },
            { time: "16:00", title: "Case note — Müller", matter: "AZ-2026-035", tone: "violet" },
          ],
        },
        review: {
          fileName: "Contract_Bauer-Hofer_v3.pdf",
          riskAreas: [
            {
              line: "§ 4 para. 2",
              text: "Liability cap missing — full liability without ceiling",
              severity: "high",
            },
            {
              line: "§ 7 para. 1",
              text: "Notice period 6 weeks — unusually short",
              severity: "medium",
            },
            {
              line: "§ 12 para. 3",
              text: "Written-form clause without AGB reference",
              severity: "low",
            },
          ],
          summary:
            "3 risks detected — 1 critical, 1 moderate, 1 low. Negotiate § 4 before signing.",
          clauses: [
            { name: "Warranty", status: "ok" },
            { name: "Liability cap", status: "missing" },
            { name: "Notice period", status: "flag" },
            { name: "Written form", status: "ok" },
            { name: "NDA", status: "ok" },
          ],
        },
        approval: {
          items: [
            {
              title: "Defense brief — Bauer",
              type: "document_finalize",
              submittedBy: "Dr. Weber",
              submittedAt: "12 min ago",
              status: "Awaiting approval",
              statusColor: "amber",
            },
            {
              title: "Invoice AZ-2026-038 Schwarz",
              type: "invoice_create",
              submittedBy: "Fr. Klein",
              submittedAt: "1 hr ago",
              status: "For approval",
              statusColor: "blue",
            },
            {
              title: "Contract draft — Müller",
              type: "document_finalize",
              submittedBy: "Hr. Schmidt",
              submittedAt: "3 hrs ago",
              status: "Revised",
              statusColor: "violet",
            },
          ],
          auditTrail: [
            { action: "Draft uploaded", user: "Dr. Weber", time: "09:14" },
            { action: "AI review completed", user: "Brain", time: "09:15" },
            { action: "Sent for approval", user: "Dr. Weber", time: "09:22" },
            { action: "Awaiting partner", user: "System", time: "09:22" },
          ],
        },
      },
    },
  },
};

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  amber: {
    text: "var(--signal-amber)",
    bg: "color-mix(in srgb, var(--signal-amber) 12%, transparent)",
  },
  blue: { text: "var(--brand-text)", bg: "color-mix(in srgb, var(--brand-text) 12%, transparent)" },
  rose: {
    text: "var(--signal-rose)",
    bg: "color-mix(in srgb, var(--signal-rose) 12%, transparent)",
  },
  violet: {
    text: "var(--brand-tertiary)",
    bg: "color-mix(in srgb, var(--brand-tertiary) 12%, transparent)",
  },
  green: {
    text: "var(--signal-green)",
    bg: "color-mix(in srgb, var(--signal-green) 12%, transparent)",
  },
};

const VIEW_DURATION = 3200;
const TYPING_SPEED = 45;

export default function DashboardReel({
  lang,
  industry = "legal",
  className = "",
  controlledView,
  showCursor = true,
}: {
  lang: Lang;
  industry?: string;
  className?: string;
  controlledView?: number;
  showCursor?: boolean;
}) {
  const reduce = useReducedMotion();
  const branch = BRANCHES[industry] ?? BRANCHES.legal;
  const v = branch.views[lang] ?? branch.views.de!;
  const sidebar = branch.sidebar;
  const brand = (profileForIndustry(industry)?.brand ?? "Subsumio").toLowerCase();
  const [autoView, setAutoView] = useState(reduce ? 1 : 0);
  const view = controlledView ?? autoView;
  const [typed, setTyped] = useState("");
  const [brainPhase, setBrainPhase] = useState(reduce ? 2 : 0);

  useEffect(() => {
    if (reduce || controlledView !== undefined) return;
    const t = setTimeout(() => setAutoView((prev) => (prev + 1) % 3), VIEW_DURATION);
    return () => clearTimeout(t);
  }, [autoView, reduce, controlledView]);

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

  const sidebarLabels = [
    UI_STRINGS[lang].navOverview,
    UI_STRINGS[lang].navMatters,
    UI_STRINGS[lang].navDeadlines,
    UI_STRINGS[lang].navIntake,
    UI_STRINGS[lang].navChat,
  ];
  const cursorTargets: Record<number, { x: string; y: string; label: string }> = {
    0: { x: "72%", y: "42%", label: UI_STRINGS[lang].openMatter },
    1: { x: "74%", y: "87%", label: UI_STRINGS[lang].sendQuestion },
    2: { x: "70%", y: "52%", label: UI_STRINGS[lang].checkDeadline },
    3: { x: "68%", y: "38%", label: lang === "en" ? "Open calendar" : "Kalender öffnen" },
    4: { x: "72%", y: "45%", label: lang === "en" ? "Review risk" : "Risiko prüfen" },
    5: { x: "66%", y: "58%", label: lang === "en" ? "Approve" : "Freigeben" },
  };
  const cursorTarget = cursorTargets[view] ?? cursorTargets[0];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/20 [background:var(--mk-bg)] ${className}`}
    >
      {showCursor && <GuidedCursor {...cursorTarget} className="hidden sm:flex" />}
      {/* top bar — matches real dashboard topbar structure */}
      <div className="flex items-center gap-3 border-b [border-color:var(--mk-border)] px-4 py-2.5 [background:var(--mk-surface)]">
        <div className="flex items-center gap-2">
          <div className="brand-bg flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
            <Brain size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold [color:var(--mk-text)]">{brand}</span>
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-2.5 py-1.5 [background:var(--mk-bg)]">
          <Search size={13} className="[color:var(--mk-text-subtle)]" />
          <span className="text-sm [color:var(--mk-text-subtle)]">
            {UI_STRINGS[lang].searchPlaceholder}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm [color:var(--mk-text-subtle)]">
          <Clock size={11} />
          {UI_STRINGS[lang].timeLabel}
        </div>
      </div>

      <div className="grid h-[480px] grid-cols-1 sm:grid-cols-[180px_1fr]">
        {/* sidebar */}
        <div className="hidden flex-col gap-1 border-r [border-color:var(--mk-border)] p-3 [background:var(--mk-surface-2)] sm:flex">
          {/* firm header */}
          <div className="brand-soft brand-border mb-3 rounded-lg border px-2 py-2">
            <div className="flex items-center gap-2">
              <div className="brand-bg flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                <Brain size={13} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold [color:var(--mk-text)]">
                  {UI_STRINGS[lang].lawFirmLabel}
                </p>
                <p className="text-sm [color:var(--mk-text-subtle)]">
                  {UI_STRINGS[lang].lawFirmName}
                </p>
              </div>
            </div>
          </div>
          {sidebar.map((item, i) => {
            const Icon = item.icon;
            const isActive =
              (view === 0 && i === 1) ||
              (view === 1 && i === 4) ||
              (view === 2 && i === 2) ||
              (view === 3 && i === 2) ||
              (view === 4 && i === 1) ||
              (view === 5 && i === 3);
            // view 0: Akten (i=1), view 1: Chat/Brain (i=4), view 2: Fristen (i=2)
            // view 3: Calendar→Fristen (i=2), view 4: Review→Akten (i=1), view 5: Approval→Intake (i=3)
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
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
          {/* brain status — matches real dashboard sidebar brain card */}
          <div className="mt-auto rounded-lg border [border-color:var(--mk-border)] bg-[var(--mk-surface)] px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium [color:var(--mk-text-subtle)]">Brain</span>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full [background:var(--signal-green)]" />
                <span className="text-sm font-medium [color:var(--mk-text-muted)]">
                  {UI_STRINGS[lang].activeLabel}
                </span>
              </div>
            </div>
            <div className="mt-1 flex items-center gap-1 font-mono text-sm [color:var(--mk-text-subtle)] tabular-nums">
              <Zap size={10} className="shrink-0" />
              <span>1,247 pages · 89 entities</span>
            </div>
          </div>
        </div>

        {/* main content area */}
        <div className="relative flex flex-col overflow-hidden">
          {/* view content */}
          <div className="flex-1 overflow-hidden p-4">
            <AnimatePresence mode="wait">
              {/* View 0: Matters list */}
              {view === 0 && (
                <motion.div
                  key="matters"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.45, 0, 0.55, 1] }}
                  className="space-y-2"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                      {UI_STRINGS[lang].mattersLabel}
                    </h3>
                    <span className="text-sm [color:var(--mk-text-subtle)]">
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
                          <p className="truncate text-sm font-medium [color:var(--mk-text)]">
                            {m.title}
                          </p>
                          <p className="font-mono text-sm [color:var(--mk-text-subtle)]">
                            {m.id} · {m.client}
                          </p>
                        </div>
                        <span
                          className="rounded-full px-2 py-0.5 text-sm font-medium"
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.45, 0, 0.55, 1] }}
                  className="flex h-full flex-col"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Brain size={15} className="brand-text" />
                    <h3 className="text-sm font-semibold [color:var(--mk-text)]">Brain</h3>
                  </div>
                  <div className="flex-1 space-y-3 overflow-hidden">
                    {brainPhase > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end"
                      >
                        <div className="max-w-[85%] rounded-xl rounded-tr-sm border [border-color:var(--mk-border)] px-3 py-2 [background:var(--mk-surface)]">
                          <p className="text-sm [color:var(--mk-text)]">{v.brain.question}</p>
                          <span className="brand-text mt-1 inline-flex items-center gap-1 text-sm">
                            <FileText size={10} /> {v.brain.file}
                          </span>
                        </div>
                      </motion.div>
                    )}
                    {brainPhase === 1 && (
                      <div className="flex items-center gap-1.5 text-sm [color:var(--mk-text-muted)]">
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
                          <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                            {v.brain.answer}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {v.brain.sources.map((s) => (
                              <span
                                key={s}
                                className="brand-text brand-soft rounded px-1.5 py-0.5 font-mono text-sm"
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
                    <div className="min-h-[16px] flex-1 text-sm [color:var(--mk-text)]">
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.45, 0, 0.55, 1] }}
                  className="space-y-2"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                      {UI_STRINGS[lang].deadlinesLabel}
                    </h3>
                    <span className="text-sm font-medium [color:var(--signal-rose)]">
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
                          ? "[border-color:color-mix(in_srgb,var(--signal-rose)_22%,transparent)] [background:color-mix(in_srgb,var(--signal-rose)_6%,transparent)]"
                          : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          d.urgent
                            ? "[background:color-mix(in_srgb,var(--signal-rose)_10%,transparent)]"
                            : "[background:var(--mk-surface-2)]"
                        }`}
                      >
                        {d.urgent ? (
                          <AlertTriangle size={14} style={{ color: "var(--signal-rose)" }} />
                        ) : (
                          <CheckCircle2 size={14} className="[color:var(--mk-text-subtle)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium [color:var(--mk-text)]">
                          {d.title}
                        </p>
                        <p className="font-mono text-sm [color:var(--mk-text-subtle)]">
                          {d.matter}
                        </p>
                      </div>
                      <span
                        className={`font-mono text-sm font-medium ${d.urgent ? "[color:var(--signal-rose)]" : "[color:var(--mk-text-muted)]"}`}
                      >
                        {d.date}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* View 3: Calendar */}
              {view === 3 && (
                <motion.div
                  key="calendar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.45, 0, 0.55, 1] }}
                  className="space-y-3"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={15} className="brand-text" />
                      <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                        {lang === "en" ? "Calendar" : "Kalender"}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold [color:var(--mk-text)]">{v.calendar.day}</p>
                      <p className="text-sm [color:var(--mk-text-subtle)]">{v.calendar.weekday}</p>
                    </div>
                  </div>
                  {/* Mini calendar grid */}
                  <div className="mb-3 grid grid-cols-7 gap-1">
                    {Array.from({ length: 31 }, (_, i) => {
                      const day = i + 1;
                      const isToday = day === Number(v.calendar.day);
                      const hasEntry = [5, 12, 18, 25].includes(day);
                      return (
                        <div
                          key={day}
                          className={`flex h-7 items-center justify-center rounded text-sm transition-colors ${
                            isToday
                              ? "brand-bg font-bold text-white"
                              : hasEntry
                                ? "brand-soft brand-text font-medium"
                                : "[color:var(--mk-text-subtle)] hover:bg-[var(--mk-surface-2)]"
                          }`}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                  {/* Day entries */}
                  <div className="space-y-2">
                    {v.calendar.entries.map((e, i) => {
                      const sc = STATUS_COLORS[e.tone] ?? STATUS_COLORS.blue;
                      return (
                        <motion.div
                          key={e.title}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="flex items-center gap-3 rounded-lg border [border-color:var(--mk-border)] px-3 py-2.5 [background:var(--mk-surface)]"
                        >
                          <div
                            className="flex h-8 w-12 shrink-0 flex-col items-center justify-center rounded-lg"
                            style={{ background: sc.bg }}
                          >
                            <span className="text-sm font-bold" style={{ color: sc.text }}>
                              {e.time}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium [color:var(--mk-text)]">
                              {e.title}
                            </p>
                            <p className="font-mono text-sm [color:var(--mk-text-subtle)]">
                              {e.matter}
                            </p>
                          </div>
                          <ChevronRight size={14} className="[color:var(--mk-text-subtle)]" />
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* View 4: Document Review */}
              {view === 4 && (
                <motion.div
                  key="review"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.45, 0, 0.55, 1] }}
                  className="flex h-full flex-col"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PenLine size={15} className="brand-text" />
                      <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                        {lang === "en" ? "Document Review" : "Dokumenten-Analyse"}
                      </h3>
                    </div>
                    <span className="brand-text brand-soft rounded-full px-2 py-0.5 text-sm font-medium">
                      {v.review.fileName}
                    </span>
                  </div>

                  {/* AI Summary */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 rounded-xl border [border-color:var(--mk-border)] p-3 [background:var(--mk-surface)]"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Brain size={13} className="brand-text" />
                      <span className="text-sm font-semibold [color:var(--mk-text)]">
                        {lang === "en" ? "AI Summary" : "KI-Zusammenfassung"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {v.review.summary}
                    </p>
                  </motion.div>

                  {/* Risk areas */}
                  <div className="mb-3 space-y-2">
                    {v.review.riskAreas.map((r, i) => {
                      const colors = {
                        high: {
                          text: "var(--signal-rose)",
                          bg: "color-mix(in srgb, var(--signal-rose) 10%, transparent)",
                          border: "color-mix(in srgb, var(--signal-rose) 22%, transparent)",
                        },
                        medium: {
                          text: "var(--signal-amber)",
                          bg: "color-mix(in srgb, var(--signal-amber) 10%, transparent)",
                          border: "color-mix(in srgb, var(--signal-amber) 22%, transparent)",
                        },
                        low: {
                          text: "var(--signal-green)",
                          bg: "color-mix(in srgb, var(--signal-green) 10%, transparent)",
                          border: "color-mix(in srgb, var(--signal-green) 22%, transparent)",
                        },
                      };
                      const c = colors[r.severity];
                      return (
                        <motion.div
                          key={r.line}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="rounded-lg border p-3"
                          style={{ borderColor: c.border, background: c.bg }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-bold" style={{ color: c.text }}>
                              {r.line}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-sm font-medium uppercase"
                              style={{ color: c.text, background: c.bg }}
                            >
                              {r.severity}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                            {r.text}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Clause checklist */}
                  <div className="mt-auto">
                    <p className="mb-2 text-sm font-semibold [color:var(--mk-text)]">
                      {lang === "en" ? "Clauses" : "Klauseln"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {v.review.clauses.map((c) => {
                        const icon =
                          c.status === "ok"
                            ? CheckCircle2
                            : c.status === "flag"
                              ? AlertTriangle
                              : FileCheck;
                        const color =
                          c.status === "ok"
                            ? "var(--signal-green)"
                            : c.status === "flag"
                              ? "var(--signal-amber)"
                              : "var(--signal-rose)";
                        const Icon = icon;
                        return (
                          <span
                            key={c.name}
                            className="inline-flex items-center gap-1.5 rounded-full border [border-color:var(--mk-border)] px-2.5 py-1 text-sm [background:var(--mk-surface)]"
                          >
                            <Icon size={11} style={{ color }} />
                            <span className="[color:var(--mk-text-muted)]">{c.name}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* View 5: Approval Queue */}
              {view === 5 && (
                <motion.div
                  key="approval"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.45, 0, 0.55, 1] }}
                  className="flex h-full flex-col"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={15} className="brand-text" />
                      <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                        {lang === "en" ? "Approvals" : "Freigaben"}
                      </h3>
                    </div>
                    <span className="text-sm font-medium [color:var(--signal-amber)]">
                      {v.approval.items.length} {lang === "en" ? "pending" : "offen"}
                    </span>
                  </div>

                  {/* Approval items */}
                  <div className="mb-3 space-y-2">
                    {v.approval.items.map((item, i) => {
                      const sc = STATUS_COLORS[item.statusColor] ?? STATUS_COLORS.amber;
                      return (
                        <motion.div
                          key={item.title}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="rounded-lg border [border-color:var(--mk-border)] p-3 [background:var(--mk-surface)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium [color:var(--mk-text)]">
                                {item.title}
                              </p>
                              <p className="mt-0.5 text-sm [color:var(--mk-text-subtle)]">
                                {item.submittedBy} · {item.submittedAt}
                              </p>
                            </div>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-sm font-medium"
                              style={{ color: sc.text, background: sc.bg }}
                            >
                              {item.status}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button className="brand-bg flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium text-white">
                              <CheckCircle2 size={11} />
                              {lang === "en" ? "Approve" : "Freigeben"}
                            </button>
                            <button className="rounded-md border [border-color:var(--mk-border)] px-2.5 py-1 text-sm font-medium [color:var(--mk-text-muted)]">
                              {lang === "en" ? "Review" : "Prüfen"}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Audit trail */}
                  <div className="mt-auto rounded-xl border [border-color:var(--mk-border)] p-3 [background:var(--mk-surface-2)]">
                    <p className="mb-2 text-sm font-semibold [color:var(--mk-text)]">
                      {lang === "en" ? "Audit Trail" : "Audit-Trail"}
                    </p>
                    <div className="space-y-1.5">
                      {v.approval.auditTrail.map((a, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.08 }}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="font-mono [color:var(--mk-text-subtle)]">{a.time}</span>
                          <span className="[color:var(--mk-text-muted)]">{a.action}</span>
                          <span className="brand-text font-medium">· {a.user}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
