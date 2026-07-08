"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { BookOpen, CheckCircle2, LifeBuoy, Mail, Route, X, Sparkles } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useTour } from "@/components/dashboard/guided-tour";
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

export function DashboardGuide({ open, onClose }: DashboardGuideProps) {
  const pathname = usePathname();
  const { t } = useLang();
  const { reduceMotion, panelTransition } = useDashboardMotion();
  const { restartTour } = useTour();

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
                  {t("guide.subtitle")}
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
                aria-label={t("topbar.close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
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

              <section className="space-y-2">
                <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                  {t("guide.setup_title")}
                </h2>
                {[
                  t("guide.setup_firm"),
                  t("guide.setup_case"),
                  t("guide.setup_deadline"),
                  t("guide.setup_team"),
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm text-[color:var(--ds-text-muted)]"
                  >
                    <CheckCircle2 size={14} className="text-[color:var(--accent-premium)]" />
                    <span>{item}</span>
                  </div>
                ))}
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
