"use client";

import Link from "next/link";
import {
  FileText,
  CalendarClock,
  ShieldCheck,
  Brain,
  CheckCircle2,
  ArrowRight,
  Calculator,
  Landmark,
} from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    title: "Steuererklärungen",
    desc: "ESt, USt, GewSt, KSt, LSt — strukturiert erfasst mit Status-Tracking vom Entwurf bis zum Bescheid.",
  },
  {
    icon: CalendarClock,
    title: "AO-Fristen-Engine",
    desc: "Automatische Fristberechnung nach Abgabenordnung. Weekend/Holiday-Shifting, Einspruchsfristen, Festsetzungsverjährung.",
  },
  {
    icon: Calculator,
    title: "StBVV-Gebührenrechner",
    desc: "Gebührenberechnung nach Steuerberatervergütungsverordnung — analog zum bewährten RVG-Rechner für Anwälte.",
  },
  {
    icon: ShieldCheck,
    title: "GoBD & DSGVO",
    desc: "Verfahrensdokumentation, GoBD-konforme Archivierung, DSGVO-Compliance — bereits im Legal-Product erprobt.",
  },
  {
    icon: Brain,
    title: "GBrain Mandantengedächtnis",
    desc: "Steuererklärungen, Bescheide, Fristen und Dokumente bleiben als Finanz-Graph verbunden. Kompiliertes Wissen pro Mandant.",
  },
  {
    icon: Landmark,
    title: "Bescheide & Einsprüche",
    desc: "Bescheid-Management mit Einspruchsfrist-Tracking, Festsetzungsverjährung und Kontext-Verlinkung zur Erklärung.",
  },
];

const SIGNATURE_ITEMS = [
  "Widersprüche in Steuerfristen",
  "AO-bewusste Fristenantworten",
  "Zitierter Bescheidkontext",
];

export default function TaxMarketingPage() {
  return (
    <div className="min-h-screen bg-[color:var(--ds-background)]">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[color:var(--ds-border)]">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent" />
        <div className="relative mx-auto max-w-5xl px-6 py-20 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-600">
            <Calculator size={14} />
            Subsumio Tax
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-[color:var(--ds-text)] sm:text-5xl">
            Mandantengedächtnis mit
            <span className="text-emerald-500"> Steuerfristen-Disziplin</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[color:var(--ds-text-muted)]">
            Die KI-Wissensbasis für Steuerberatung und Buchhaltung. Steuererklärungen, Bescheide,
            Fristen und Dokumente bleiben als Finanz-Graph verbunden.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.98]"
            >
              Kostenlos starten <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-6 py-3 text-sm font-semibold text-[color:var(--ds-text)] transition-[background-color] hover:bg-[color:var(--ds-hover)]"
            >
              Preise ansehen
            </Link>
          </div>
        </div>
      </section>

      {/* Signature Items */}
      <section className="border-b border-[color:var(--ds-border)] py-12">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid gap-6 sm:grid-cols-3">
            {SIGNATURE_ITEMS.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
              >
                <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
                <span className="text-sm font-medium text-[color:var(--ds-text)]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold text-[color:var(--ds-text)]">
            Alles für den Steuerberater-Workflow
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 transition-[border-color,box-shadow] hover:border-emerald-500/30"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Icon size={24} className="text-emerald-500" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-[color:var(--ds-text)]">
                    {f.title}
                  </h3>
                  <p className="text-sm text-[color:var(--ds-text-muted)]">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[color:var(--ds-border)] py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-[color:var(--ds-text)]">
            Bereit für steuerliche Präzision?
          </h2>
          <p className="mt-4 text-lg text-[color:var(--ds-text-muted)]">
            Starte heute mit Subsumio Tax — kein Seat-Minimum, DSGVO-konform, EU-Cloud.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.98]"
          >
            Jetzt registrieren <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
