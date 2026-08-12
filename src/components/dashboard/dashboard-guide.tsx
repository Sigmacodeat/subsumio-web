"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  LifeBuoy,
  Mail,
  Pencil,
  Route,
  Sparkles,
  X,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useTour } from "@/components/dashboard/guided-tour";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboardingProgress, useUpdateOnboardingProgress } from "@/lib/queries/auth";
import { useToast } from "@/components/ui/toast";
import type { DashboardKey } from "@/content/dashboard";

interface DashboardGuideProps {
  open: boolean;
  onClose: () => void;
}

const ROUTE_HELP: Array<{
  match: string;
  title: DashboardKey;
  desc: DashboardKey;
  links: Array<{ href: string; label: DashboardKey }>;
}> = [
  {
    match: "/dashboard/deadlines",
    title: "guide.route.deadlines_title",
    desc: "guide.route.deadlines_desc",
    links: [
      { href: "/dashboard/case-scanner", label: "nav.case_scanner" },
      { href: "/dashboard/calendar-export", label: "nav.calendar_export" },
    ],
  },
  {
    match: "/dashboard/cases",
    title: "guide.route.cases_title",
    desc: "guide.route.cases_desc",
    links: [
      { href: "/dashboard/cases", label: "sidebar.create_case" },
      { href: "/dashboard/contacts", label: "nav.contacts" },
    ],
  },
  {
    match: "/dashboard/intake",
    title: "guide.route.intake_title",
    desc: "guide.route.intake_desc",
    links: [
      { href: "/dashboard/bea", label: "nav.bea" },
      { href: "/dashboard/email-import", label: "nav.email_import" },
    ],
  },
  {
    match: "/dashboard/invoicing",
    title: "guide.route.invoicing_title",
    desc: "guide.route.invoicing_desc",
    links: [
      { href: "/dashboard/settings/kanzlei", label: "nav.kanzlei" },
      { href: "/dashboard/controlling", label: "nav.controlling" },
    ],
  },
  ...[
    ["vault", "nav.vault"],
    ["drafting", "nav.drafting"],
    ["contracts", "nav.contracts"],
    ["research", "nav.legal_research"],
    ["litigation", "nav.litigation"],
    ["compliance", "nav.compliance"],
    ["workflows", "nav.workflows"],
    ["settings", "nav.settings"],
    ["team", "nav.team"],
    ["review-queue", "nav.review_queue"],
    ["signature", "nav.signature"],
    ["bea", "nav.bea"],
    ["whatsapp", "nav.whatsapp"],
    ["contacts", "nav.contacts"],
    ["opponents", "nav.opponents"],
  ].map(([route, label]) => ({
    match: `/dashboard/${route}`,
    title: `guide.route.${route.replace("-", "_")}_title` as DashboardKey,
    desc: `guide.route.${route.replace("-", "_")}_desc` as DashboardKey,
    links: [{ href: `/dashboard/${route}`, label: label as DashboardKey }],
  })),
];

const SETUP_SECTIONS: Array<{
  key: "firm" | "firstCase" | "firstDeadline" | "teamInvited" | "firstQuery";
  title: string;
  description: string;
  subtasks: string[];
  href: string;
  cta: string;
}> = [
  {
    key: "firm",
    title: "Kanzlei einrichten",
    description: "Hinterlegen Sie Stammdaten, Bankverbindung und Stundensatz, damit Rechnungen und Korrespondenz korrekt ausgefüllt werden.",
    subtasks: ["Kanzleiname und Anwalt", "Land und Rechtsraum", "Bankdaten / IBAN"],
    href: "/dashboard/settings/kanzlei",
    cta: "Kanzlei bearbeiten",
  },
  {
    key: "firstCase",
    title: "Ersten Fall anlegen",
    description: "Legen Sie eine Akte an und verknüpfen Sie Kontakte, damit Subsumio Fristen, Schriftsätze und Abrechnungen daraus ableiten kann.",
    subtasks: ["Akte anlegen", "Mandant zuordnen", "Gegenpartei erfassen"],
    href: "/dashboard/cases",
    cta: "Neue Akte",
  },
  {
    key: "firstDeadline",
    title: "Fristen aktivieren",
    description: "Erstellen oder importieren Sie Ihre erste Frist, um Erinnerungen und Kalender-Exports zu testen.",
    subtasks: ["Erste Frist anlegen", "Kalender-Export aktivieren", "Fristen-Widget prüfen"],
    href: "/dashboard/deadlines",
    cta: "Frist anlegen",
  },
  {
    key: "teamInvited",
    title: "Team einladen",
    description: "Laden Sie Kollegen ein, damit Sie gemeinsam an Akten arbeiten und Berechtigungen steuern können.",
    subtasks: ["E-Mail-Adressen eingeben", "Rolle vergeben", "Einladungen versenden"],
    href: "/dashboard/team",
    cta: "Team einladen",
  },
  {
    key: "firstQuery",
    title: "Erste KI-Abfrage starten",
    description: "Stellen Sie eine Frage an Ihr Corpus, um Zitationen, Rechtsraum-Scoping und Antwortqualität zu erleben.",
    subtasks: ["Frage eingeben", "Antwort mit Quellen prüfen", "Sinnhaftigkeit bewerten"],
    href: "/dashboard/chat",
    cta: "KI-Chat öffnen",
  },
];

export function DashboardGuide({ open, onClose }: DashboardGuideProps) {
  const pathname = usePathname();
  const { t } = useLang();
  const { addToast } = useToast();
  const { reduceMotion, panelTransition } = useDashboardMotion();
  const { restartTour } = useTour();
  const progressQuery = useOnboardingProgress();
  const updateProgress = useUpdateOnboardingProgress();
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const isLoading = progressQuery.isLoading;

  const progress = useMemo(
    () =>
      progressQuery.data?.progress ?? {
        firm: false,
        firstCase: false,
        firstDeadline: false,
        teamInvited: false,
        firstQuery: false,
      },
    [progressQuery.data]
  );

  const completedCount = useMemo(
    () => Object.values(progress).filter(Boolean).length,
    [progress]
  );
  const progressValue = Math.round((completedCount / SETUP_SECTIONS.length) * 100);

  const routeHelp = ROUTE_HELP.find((item) => pathname.startsWith(item.match));
  const resolvedHelp = routeHelp
    ? {
        title: t(routeHelp.title),
        desc: t(routeHelp.desc),
        links: routeHelp.links.map((link) => ({ ...link, label: t(link.label) })),
      }
    : {
        title: t("guide.default_title"),
        desc: t("guide.default_desc"),
        links: [
          { href: "/dashboard/cases", label: t("cockpit.action_case") },
          { href: "/dashboard/deadlines", label: t("nav.deadlines") },
          { href: "/dashboard/settings/kanzlei", label: t("nav.kanzlei") },
        ],
      };

  const handleMark = async (key: keyof typeof progress, value: boolean) => {
    try {
      await updateProgress.mutateAsync({ [key]: value });
    } catch {
      addToast({
        title: "Fehler",
        description: "Der Fortschritt konnte nicht gespeichert werden.",
        type: "error",
      });
    }
  };

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex justify-end bg-black/30"
          role="presentation"
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{
            opacity: 1,
            backdropFilter: reduceMotion ? "blur(0px)" : "blur(8px)",
          }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={panelTransition}
        >
          <button
            className="absolute inset-0 cursor-default"
            onClick={onClose}
            aria-label={t("topbar.close")}
          />
          <motion.aside
            className="card-shadow-elevated relative z-[91] flex h-full w-full max-w-sm flex-col border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
            aria-label={t("guide.title")}
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={panelTransition}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("guide.title")}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {completedCount} von {SETUP_SECTIONS.length} erledigt
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditMode((prev) => !prev)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
                  aria-label={editMode ? "Bearbeiten beenden" : "Bearbeiten"}
                  aria-pressed={editMode}
                >
                  <Pencil size={16} className={editMode ? "brand-text" : ""} />
                </button>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
                  aria-label={t("topbar.close")}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="border-b border-[color:var(--ds-border)] px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                <span>Setup-Fortschritt</span>
                <span className="font-medium text-[color:var(--ds-text)]">{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-1.5" />
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {isLoading && (
                <section className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </section>
              )}

              {!isLoading && progressValue < 100 && (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                    Leitfaden
                  </h2>
                  <Accordion defaultValue="firm">
                    {SETUP_SECTIONS.map((section) => {
                      const done = progress[section.key];
                      return (
                        <AccordionItem key={section.key} value={section.key}>
                          <AccordionTrigger className="gap-3 px-3 py-3 text-[color:var(--ds-text)]">
                            <span className="flex flex-1 items-center gap-2 text-left">
                              {done ? (
                                <CheckCircle2 size={16} className="shrink-0 text-[color:var(--signal-success-500)]" />
                              ) : (
                                <Circle size={16} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
                              )}
                              <span className={done ? "text-[color:var(--ds-text-muted)] line-through" : ""}>
                                {section.title}
                              </span>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="bg-[color:var(--ds-surface-2)] px-3 pb-3">
                            <p className="mb-2 text-sm text-[color:var(--ds-text-muted)]">
                              {section.description}
                            </p>
                            <ul className="mb-3 space-y-1.5">
                              {section.subtasks.map((task) => (
                                <li
                                  key={task}
                                  className="flex items-center gap-2 text-sm text-[color:var(--ds-text-subtle)]"
                                >
                                  <div className="h-1.5 w-1.5 rounded-full bg-[color:var(--ds-text-subtle)]" />
                                  {task}
                                </li>
                              ))}
                            </ul>
                            <div className="flex items-center gap-2">
                              <Link href={section.href} onClick={onClose}>
                                <Button variant="glow" size="sm" disabled={updateProgress.isPending}>
                                  {section.cta}
                                </Button>
                              </Link>
                              {editMode && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMark(section.key, !done)}
                                  disabled={updateProgress.isPending}
                                >
                                  {done ? "Als offen markieren" : "Als erledigt markieren"}
                                </Button>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </section>
              )}

              {progressValue === 100 && (
                <section className="rounded-lg border border-[color:var(--signal-success-500)]/30 bg-[color:var(--ds-success-bg)] p-4 text-center">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-[color:var(--signal-success-500)]" />
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Setup abgeschlossen</h2>
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    Alle Schritte sind erledigt. Sie können den Leitfaden über das Hilfe-Symbol erneut öffnen.
                  </p>
                </section>
              )}

              <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Route size={15} className="brand-text" />
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {resolvedHelp.title}
                  </h2>
                </div>
                <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                  {resolvedHelp.desc}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {resolvedHelp.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={onClose}
                      className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-[color:var(--ds-border)] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <BookOpen size={15} className="text-[color:var(--ds-text-muted)]" />
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("guide.learn_title")}
                  </h2>
                </div>
                <div className="grid gap-2">
                  <Link
                    href="/docs"
                    className="brand-text text-sm font-medium transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:underline active:scale-95"
                    onClick={onClose}
                  >
                    {t("cmd.action.help.docs")}
                  </Link>
                  <Link
                    href="/dashboard/chat"
                    className="brand-text text-sm font-medium transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:underline active:scale-95"
                    onClick={onClose}
                  >
                    {t("nav.assistant")}
                  </Link>
                </div>
              </section>
            </div>

            <div className="border-t border-[color:var(--ds-border)] p-4">
              <button
                onClick={() => {
                  restartTour();
                  onClose();
                }}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-3 py-2.5 text-sm font-medium text-[color:var(--ds-text)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--brand-primary)]/10 active:scale-95"
              >
                <Sparkles size={15} className="brand-text" />
                {t("guide.restart_tour")}
              </button>
              <a
                href="mailto:support@subsumio.com"
                className="flex items-center justify-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2.5 text-sm font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
              >
                <LifeBuoy size={15} />
                {t("guide.contact_support")}
                <Mail size={14} />
              </a>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
