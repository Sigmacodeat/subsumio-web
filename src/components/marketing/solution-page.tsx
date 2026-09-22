import Link from "next/link";
import { ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentFor, pBind, type Market } from "@/lib/market";
import type { SolutionContent, SolutionSlug } from "@/content/solutions";
import { SOLUTION_SLUGS, SOLUTION_CROSS_LINKS } from "@/content/solutions";
import { Section, SectionHeading, CTASection, PageHero } from "./primitives";
import { H2_CTA_CLASS, H3_CLASS } from "./typography";
import { ICONS, accentTile } from "./icons";
import { AnimatedFaqList } from "./animated-faq";
import { GlowCard, Reveal, StaggerContainer, StaggerItem } from "./motion-system";

export function SolutionPage({
  content,
  market = "at",
}: {
  content: SolutionContent;
  market?: Market;
}) {
  const { ui: UI_STRINGS } = contentFor(market);
  const p = pBind(market);
  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      {/* Hero */}
      <PageHero
        badge={content.badge}
        h1a={content.h1a}
        h1b={content.h1b}
        sub={content.sub}
        actions={
          <>
            <Button size="lg" variant="primary" className="group min-h-[48px]" asChild>
              <Link href={p(content.ctaHref ?? "/signup")}>
                {content.ctaButton}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
                />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-h-[48px] [color:var(--mk-text)]"
              asChild
            >
              <Link href={p("/superbrain")}>
                {UI_STRINGS.watchDemo} <ArrowRight size={16} />
              </Link>
            </Button>
          </>
        }
      />

      {/* Pains */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={content.painsTitle} tone="light" />
          <StaggerContainer className="grid gap-6 md:grid-cols-3" stagger={0.08}>
            {content.pains.map((pain) => (
              <StaggerItem key={pain.title}>
                {/* Same card as everywhere else; only the icon carries the warning
                    tone. The rose category tokens do not resolve on the marketing
                    surface — the border fell back to near-black. */}
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] [background:var(--mk-surface)]">
                  <AlertCircle
                    size={20}
                    strokeWidth={1.75}
                    className="mb-3 [color:var(--ds-danger-text)]"
                  />
                  <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                    {pain.title}
                  </h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {pain.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      {/* Features */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={content.featuresTitle} tone="light" />
          {/* Four columns only when the cards fill them; six cards in four
              columns left two holes in the second row. */}
          <StaggerContainer
            className={`grid gap-6 sm:grid-cols-2 ${content.features.length % 4 === 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
            stagger={0.06}
          >
            {content.features.map((feat) => {
              const Icon = ICONS[feat.icon] ?? ICONS.Layers;
              return (
                <StaggerItem key={feat.title}>
                  <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] [background:var(--mk-surface)] hover:-translate-y-0.5 hover:[border-color:var(--mk-border-strong)] hover:shadow-lg motion-reduce:transition-none">
                    <div
                      className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border transition-transform duration-[var(--ds-duration-normal)] hover:scale-105 ${accentTile("violet", "light")}`}
                    >
                      <Icon size={18} />
                    </div>
                    <h3 className="mb-1.5 text-lg font-semibold [color:var(--mk-text)]">
                      {feat.title}
                    </h3>
                    <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {feat.desc}
                    </p>
                  </GlowCard>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </Section>

      {/* Proof band */}
      <Section tone="dark" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal variant="scale" delay={0.1}>
            <div className="rounded-3xl border [border-color:var(--mk-border)] p-8 [background:var(--mk-surface)] md:p-12">
              <div className="brand-soft brand-border mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border">
                <CheckCircle size={24} className="brand-text" />
              </div>
              <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{content.proofTitle}</h2>
              <p className="mx-auto max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                {content.proof}
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* FAQ */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionHeading title={UI_STRINGS.questionsAnswered} tone="light" />
          <AnimatedFaqList items={content.faq} tone="light" />
        </div>
      </Section>

      {/* Cross-link: not quite the right fit? */}
      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* A quiet cross-link, not a chapter: the question is the heading. */}
          <h2 className={`mb-6 text-center ${H3_CLASS}`}>{UI_STRINGS.notQuiteRight}</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {SOLUTION_SLUGS.filter((slug) => slug !== content.slug).map((slug: SolutionSlug) => {
              const link = SOLUTION_CROSS_LINKS[slug];
              const Icon = ICONS[link.icon] ?? ICONS.Layers;
              return (
                <Link
                  key={slug}
                  href={p(`/solutions/${slug}`)}
                  className="inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 text-sm font-medium [color:var(--mk-text-muted)] transition-[background-color,border-color,color,box-shadow,transform,opacity] hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                >
                  <Icon size={14} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title={content.ctaTitle}
        sub={content.ctaSub}
        href={p(content.ctaHref ?? "/signup")}
        label={content.ctaButton}
        secondaryHref={p("/superbrain")}
        secondaryLabel={UI_STRINGS.watchDemo}
        showLogo={false}
      />
    </div>
  );
}
