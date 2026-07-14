import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";
import { NICHE_PAGES } from "@/content/niche-pages";
import { PageHero, Section, SectionHeading, CTASection } from "@/components/marketing/chrome";
import { Reveal } from "@/components/marketing/motion-system";

export const metadata: Metadata = {
  title: "Rechtsbereiche — AI-gestützte Fallanalyse für DACH | Subsumio",
  description:
    "Casino-Verluste, Krypto-Betrug, Asylrecht, Amtshaftung, Strafverteidigung, Kreditwiderruf und mehr. AI-gestützte Fallanalyse für 23 Rechtsbereiche in DE und AT.",
  alternates: { canonical: "/nischen" },
  openGraph: {
    title: "Rechtsbereiche — AI-gestützte Fallanalyse für DACH",
    description:
      "AI-gestützte Fallanalyse für 23 Rechtsbereiche in DE und AT. Kostenloser Check in 5 Minuten.",
    url: "/nischen",
    type: "website",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  "casino-verluste": "Casino & Sportwetten",
  "sportwetten-verluste": "Casino & Sportwetten",
  "casino-oesterreich": "Casino & Sportwetten",
  "krypto-betrug": "Krypto & Forensik",
  "krypto-forensik": "Krypto & Forensik",
  "krypto-casino": "Krypto & Forensik",
  "asylrecht": "Asyl & Migration",
  "dublin-verfahren": "Asyl & Migration",
  "abschiebung-verhindern": "Asyl & Migration",
  "amtshaftung": "Amtshaftung & Behörden",
  "amtshaftung-krypto": "Amtshaftung & Behörden",
  "rwr-karte": "Einwanderung",
  "strafverteidigung": "Strafrecht",
  "kreditwiderruf": "Bankrecht",
  "datenschutzverletzung": "Datenschutz & DSGVO",
  "lootboxen": "Gaming & Lootboxen",
  "investmentbetrug": "Investmentbetrug",
  "pig-butchering": "Krypto & Forensik",
  "corona-impfschaden": "Impfschaden",
  "impfschaden-entschaedigung": "Impfschaden",
  "impfschaden-klage-pharma": "Impfschaden",
  "impfschaden-amtshaftung": "Impfschaden",
  "post-vac-syndrom": "Impfschaden",
};

export default function NischenIndexPage() {
  const pages = Object.values(NICHE_PAGES);
  const categories = [...new Set(pages.map((p) => CATEGORY_LABELS[p.slug] || "Weitere"))];

  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Rechtsbereiche", url: "/nischen" },
        ])}
      />
      <div data-tone="light" className="min-h-screen overflow-x-clip" lang="de">
        <PageHero
          badge="23 Rechtsbereiche"
          h1a="AI-gestützte Fallanalyse"
          h1b="für jeden Rechtsbereich"
          sub="Casino-Verluste, Krypto-Betrug, Asylrecht, Amtshaftung, Strafverteidigung und mehr. Kostenloser AI-Fallcheck in 5 Minuten — mit anwalt fertigem Dossier."
        />

        <Section tone="light" className="py-20 md:py-28" aria-label="Alle Rechtsbereiche">
          <div className="mx-auto max-w-7xl px-6">
            <SectionHeading
              badge="Übersicht"
              title="Wählen Sie Ihren Rechtsbereich"
              sub="Jede Seite bietet eine detaillierte Fallanalyse mit aktueller Rechtsprechung, Fallbeispielen und FAQ."
            />
            <div className="space-y-12">
              {categories.map((category, ci) => (
                <Reveal key={category} delay={ci * 0.05}>
                  <div>
                    <h3 className="mb-6 text-lg font-bold uppercase tracking-wider [color:var(--mk-text-subtle)]">
                      {category}
                    </h3>
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {pages
                        .filter((p) => (CATEGORY_LABELS[p.slug] || "Weitere") === category)
                        .map((page) => (
                          <Link
                            key={page.slug}
                            href={`/nischen/${page.slug}`}
                            className="group rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl"
                          >
                            <div className="mb-3 flex items-center justify-between">
                              <span className="brand-soft brand-text brand-border inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold">
                                {page.jurisdiction}
                              </span>
                              <ArrowRight
                                size={16}
                                className="text-[color:var(--mk-text-subtle)] transition-transform group-hover:translate-x-1 group-hover:brand-text"
                              />
                            </div>
                            <h4 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                              {page.h1a} {page.h1b}
                            </h4>
                            <p className="text-sm leading-relaxed [color:var(--mk-text-muted)] line-clamp-3">
                              {page.heroSub}
                            </p>
                          </Link>
                        ))}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Section>

        <CTASection
          title="Nicht sicher, welcher Bereich zu Ihnen passt?"
          sub="Beschreiben Sie Ihren Fall — die AI findet den passenden Rechtsbereich und erstellt das Dossier."
          href="/contact"
          label="Fallbeschreibung eingeben"
          secondaryHref="/solutions/law-firms"
          secondaryLabel="Für Anwälte"
          tone="dark"
        />
      </div>
    </>
  );
}
