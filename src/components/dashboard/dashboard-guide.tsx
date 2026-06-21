"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CheckCircle2, LifeBuoy, Mail, Route, X } from "lucide-react";
import { useLang } from "@/lib/use-lang";

interface DashboardGuideProps {
  open: boolean;
  onClose: () => void;
}

const ROUTE_HELP: Array<{
  match: string;
  title: string;
  desc: string;
  links: Array<{ href: string; label: string }>;
}> = [
  {
    match: "/dashboard/deadlines",
    title: "Fristen sicher steuern",
    desc: "Pruefe kritische Fristen zuerst, bestaetige erkannte Termine und exportiere nur gepruefte Kalenderdaten.",
    links: [
      { href: "/dashboard/case-scanner", label: "Akten-Scanner" },
      { href: "/dashboard/calendar-export", label: "Kalender" },
    ],
  },
  {
    match: "/dashboard/cases",
    title: "Akten sauber fuehren",
    desc: "Jede Akte sollte Mandant, Gegner, Fristen, Dokumente und naechste Aufgabe enthalten.",
    links: [
      { href: "/dashboard/cases/new", label: "Neue Akte" },
      { href: "/dashboard/contacts", label: "Kontakte" },
    ],
  },
  {
    match: "/dashboard/intake",
    title: "Eingang triagieren",
    desc: "Ordne neue Eingänge einer Akte zu, erkenne Fristen und markiere Unklares fuer Review.",
    links: [
      { href: "/dashboard/bea", label: "beA" },
      { href: "/dashboard/email-import", label: "E-Mail-Import" },
    ],
  },
  {
    match: "/dashboard/invoicing",
    title: "Abrechnung vorbereiten",
    desc: "Pflege Kanzlei- und Bankdaten, pruefe offene Leistungen und erstelle Rechnungen aus Akten.",
    links: [
      { href: "/dashboard/settings/kanzlei", label: "Kanzlei-Daten" },
      { href: "/dashboard/controlling", label: "Controlling" },
    ],
  },
];

export function DashboardGuide({ open, onClose }: DashboardGuideProps) {
  const pathname = usePathname();
  const { t } = useLang();

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

  if (!open) return null;

  const routeHelp = ROUTE_HELP.find((item) => pathname.startsWith(item.match)) ?? {
    title: t("guide.default_title"),
    desc: t("guide.default_desc"),
    links: [
      { href: "/dashboard/cases/new", label: t("cockpit.action_case") },
      { href: "/dashboard/deadlines", label: t("nav.deadlines") },
      { href: "/dashboard/settings/kanzlei", label: t("nav.kanzlei") },
    ],
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-black/30 backdrop-blur-sm"
      role="presentation"
    >
      <button
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label={t("topbar.close")}
      />
      <aside
        className="card-shadow-elevated relative z-[91] flex h-full w-full max-w-sm flex-col border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        role="dialog"
        aria-modal="true"
        aria-label={t("guide.title")}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--ds-text)]">{t("guide.title")}</p>
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
                {routeHelp.title}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              {routeHelp.desc}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {routeHelp.links.map((link) => (
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
                <CheckCircle2 size={14} className="text-[color:var(--accent-gold)]" />
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
                href="/dashboard/assistant"
                className="brand-text text-sm font-medium transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:underline active:scale-95"
                onClick={onClose}
              >
                {t("nav.assistant")}
              </Link>
            </div>
          </section>
        </div>

        <div className="border-t border-[color:var(--ds-border)] p-4">
          <a
            href="mailto:support@subsumio.com"
            className="flex items-center justify-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2.5 text-sm font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
          >
            <LifeBuoy size={15} />
            {t("guide.contact_support")}
            <Mail size={14} />
          </a>
        </div>
      </aside>
    </div>
  );
}
