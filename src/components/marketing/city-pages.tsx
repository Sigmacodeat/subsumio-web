// City landing pages (/at/cities and /at/cities/[slug]) — composed from the
// same primitives as every other marketing page, so headings, rhythm, cards,
// FAQ and the closing CTA cannot drift from the rest of the site. Copy comes
// from src/content/city-pages.ts.

import Link from "next/link";
import { ArrowRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentFor, pBind, type Market } from "@/lib/market";
import { CITIES, type CityPageContent } from "@/content/city-pages";
import {
  BreadcrumbNav,
  ContentCard,
  CTASection,
  PageHero,
  Section,
  SectionHeading,
} from "./primitives";
import { H3_CLASS, SECTION_PAD, SECTION_PAD_FLUSH } from "./typography";
import { AnimatedFaqList } from "./animated-faq";
import { StaggerContainer, StaggerItem } from "./motion-system";

/** Icons by position — every city lists the same three capabilities
 *  (case management, deadlines, confidentiality) in the same order. */
const FEATURE_ICONS = ["FolderOpen", "CalendarClock", "ShieldCheck"] as const;

const CLOSING = {
  title: "Testen Sie Subsumio mit einer eigenen Akte.",
  sub: "Volle Testversion ohne IT-Aufwand, keine Kreditkarte.",
} as const;

function TrialActions({ market }: { market: Market }) {
  const { ui: UI_STRINGS } = contentFor(market);
  const p = pBind(market);
  return (
    <>
      <Button size="lg" variant="primary" className="group min-h-[48px]" asChild>
        <Link href={p("/signup")}>
          {UI_STRINGS.startFree}
          <ArrowRight
            size={16}
            className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
          />
        </Link>
      </Button>
      <Button size="lg" variant="outline" className="min-h-[48px] [color:var(--mk-text)]" asChild>
        <Link href={p("/features")}>Funktionen ansehen</Link>
      </Button>
    </>
  );
}

export function CityPage({ city, market = "at" }: { city: CityPageContent; market?: Market }) {
  const { ui: UI_STRINGS, cities: CITIES } = contentFor(market);
  const p = pBind(market);
  const others = Object.values(CITIES).filter((c) => c.slug !== city.slug);
  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <BreadcrumbNav
          items={[
            { label: "Subsumio", href: p("/") },
            { label: "Standorte", href: p("/cities") },
            { label: city.city },
          ]}
        />
      </div>
      <PageHero
        badge={`${city.city} · ${city.country}`}
        h1a={city.h1}
        sub={city.intro}
        actions={<TrialActions market={market} />}
      />

      {/* Jurisdiction — note left, the local courts right */}
      <Section tone="light" className={SECTION_PAD_FLUSH}>
        <div className="mx-auto grid max-w-5xl gap-10 rounded-3xl border [border-color:var(--mk-border)] p-8 [box-shadow:var(--mk-card-shadow)] [background:var(--mk-surface)] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-14 md:p-12">
          <div>
            <h2 className={`mb-4 ${H3_CLASS}`}>Rechtsordnung: {city.country}</h2>
            <p className="text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
              {city.jurisdictionNote}
            </p>
          </div>
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wider [color:var(--mk-text-muted)] uppercase">
              <Landmark size={15} className="brand-text" /> Gerichte
            </h3>
            <ul className="border-t [border-color:var(--mk-border)]">
              {city.courts.map((court) => (
                <li
                  key={court}
                  className="border-b [border-color:var(--mk-border)] py-3 text-sm [color:var(--mk-text)]"
                >
                  {court}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section tone="light" className={SECTION_PAD}>
        <div className="mx-auto max-w-6xl">
          <SectionHeading badge="Funktionen" title={`Was Subsumio in ${city.city} leistet`} />
          <StaggerContainer className="grid gap-6 md:grid-cols-3" stagger={0.08}>
            {city.features.map((f, i) => (
              <StaggerItem key={f.title} className="h-full">
                <ContentCard icon={FEATURE_ICONS[i] ?? "Layers"} title={f.title} desc={f.desc} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      <Section tone="light" className={SECTION_PAD}>
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={UI_STRINGS.questionsAnswered} />
          <AnimatedFaqList items={city.faq} tone="light" />
        </div>
      </Section>

      {/* Sibling cities — keeps the city pages linked among themselves */}
      <Section tone="light" className={SECTION_PAD_FLUSH}>
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-4 text-sm font-semibold tracking-wider [color:var(--mk-text-muted)] uppercase">
            Weitere Standorte
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {others.map((c) => (
              <Link
                key={c.slug}
                href={p(`/cities/${c.slug}`)}
                className="rounded-full border [border-color:var(--mk-border)] px-4 py-2 text-sm font-medium [color:var(--mk-text-muted)] transition-[background-color,border-color,color] hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                {c.city}
              </Link>
            ))}
          </div>
        </div>
      </Section>

      <CTASection
        title={CLOSING.title}
        sub={CLOSING.sub}
        href={p("/signup")}
        label={UI_STRINGS.startFree}
        secondaryHref={p("/pricing")}
        secondaryLabel="Preise ansehen"
        showLogo={false}
      />
    </div>
  );
}

export function CitiesIndexPage({ market = "at" }: { market?: Market } = {}) {
  const { ui: UI_STRINGS } = contentFor(market);
  const p = pBind(market);
  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      <PageHero
        badge="Standorte"
        h1a="KI-Kanzleisoftware"
        h1b="für Österreich."
        sub="Subsumio arbeitet mit österreichischem Recht — von ABGB und ZPO bis EO — und berücksichtigt gesetzliche Feiertage, die Fristenhemmung nach § 222 ZPO und den zuständigen OLG-Sprengel."
        actions={<TrialActions market={market} />}
      />
      <Section tone="light" className={SECTION_PAD_FLUSH}>
        <StaggerContainer
          // Six tracks, two per card: the second row (two of five cities) sits
          // centred under the first instead of leaving a hole on the right.
          className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-6"
          stagger={0.06}
        >
          {Object.values(CITIES).map((city, i, all) => (
            <StaggerItem
              key={city.slug}
              className={`h-full lg:col-span-2 ${
                all.length % 3 === 2 && i === all.length - 2 ? "lg:col-start-2" : ""
              }`}
            >
              <Link
                href={p(`/cities/${city.slug}`)}
                className="group flex h-full flex-col rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] transition-[border-color,box-shadow] duration-[var(--ds-duration-normal)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                <h2 className={`mb-1 ${H3_CLASS}`}>{city.city}</h2>
                <p className="text-sm [color:var(--mk-text-muted)]">{city.state}</p>
                <p className="mt-4 flex-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {city.courts[0]}
                </p>
                <span className="brand-text mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">
                  {UI_STRINGS.exploreLabel}
                  <ArrowRight
                    size={14}
                    className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </Section>
      <CTASection
        title={CLOSING.title}
        sub={CLOSING.sub}
        href={p("/signup")}
        label={UI_STRINGS.startFree}
        secondaryHref={p("/pricing")}
        secondaryLabel="Preise ansehen"
        showLogo={false}
      />
    </div>
  );
}
