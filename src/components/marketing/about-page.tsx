import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { contentFor, pBind, type Market } from "@/lib/market";
import { TRIAL_DAYS } from "@/lib/billing/credit-constants";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading, PageHero, CTASection, ContentCard, StatCard } from "./primitives";
import { H2_CTA_CLASS } from "./typography";
import { Reveal, StaggerContainer, StaggerItem } from "./motion-system";
import { IllusOrigin } from "./brand-illustrations";

const CONTENT = {
  badge: "Über Subsumio",
  h1a: "Aus Österreich",
  h1b: "für österreichische Kanzleien.",
  sub: "Subsumio ist die Kanzleisoftware mit Assistent, gebaut für die Verschwiegenheitspflicht, die Präzision und die berufsrechtlichen Anforderungen österreichischer Kanzleien.",
  missionTitle: "Unsere Mission",
  missionText:
    "Jeder Kanzlei eine Wissensbasis geben, in der jede Akte, jede Frist und jeder Schriftsatz durchsuchbar ist — mit Fundstellen, die Sie überprüfen können, bevor Sie sich darauf verlassen.",
  valuesTitle: "Woran wir glauben",
  values: [
    {
      icon: "Shield",
      title: "Vertraulichkeit zuerst",
      desc: "Gehostet in Wien oder On-Premise (Enterprise), verschlüsselt übertragen und je Kanzlei getrennt verarbeitet. Kein Training von KI-Modellen mit Mandantendaten; alle Auftragsverarbeiter sind im AVV benannt.",
    },
    {
      icon: "Brain",
      title: "Fundstellen statt Behauptungen",
      desc: "Jede Antwort des Assistenten nennt ihre Quelle; Sie prüfen sie mit einem Klick. Was sich nicht belegen lässt, wird gekennzeichnet — die anwaltliche Prüfung bleibt bei Ihnen.",
    },
    {
      icon: "Globe",
      title: "Österreich zuerst",
      desc: "Gebaut für ZPO, ABGB, EO, RAO und RATG — mit dem RIS als Rechtsquelle. Der Startfokus ist bewusst Österreich: lieber ein Rechtsraum richtig als drei halb.",
    },
    {
      icon: "Heart",
      title: "Für Anwälte gemacht",
      desc: "Werkzeuge, die Ihre Anwältinnen und Anwälte täglich nutzen — WhatsApp-Assistent, Sprachnotizen, mobil. Kein weiteres System, das im Alltag gemieden wird.",
    },
  ],
  statsTitle: "In Zahlen",
  stats: [{ value: String(TRIAL_DAYS), label: "Tage kostenlos testen — ohne Kreditkarte" }],
  ctaTitle: "Sprechen Sie mit uns",
  ctaSub: "Ob Einzelanwältin oder Kanzleipartner — wir freuen uns, von Ihnen zu hören.",
  ctaButton: "Kontakt aufnehmen",
} as const;

// DE-Markt-Variante: gleiche Story, deutsche Rechtsreferenzen. Der Anbieter
// bleibt ehrlich österreichisch — nur der Kundenfokus wechselt.
const CONTENT_DE = {
  ...CONTENT,
  h1a: "Aus Österreich",
  h1b: "für deutsche Kanzleien.",
  sub: "Subsumio ist die Kanzleisoftware mit Assistent, gebaut für die Verschwiegenheitspflicht, die Präzision und die berufsrechtlichen Anforderungen deutscher Kanzleien.",
  values: CONTENT.values.map((v) =>
    v.title === "Österreich zuerst"
      ? {
          ...v,
          title: "Österreich und Deutschland",
          desc: "Gebaut für BGB, ZPO, StGB, BRAO und RVG — mit gesetze-im-internet.de als Rechtsquelle. Lieber zwei Rechtsräume richtig als drei halb.",
        }
      : v
  ),
} as const;

export default function AboutPage({ market = "at" }: { market?: Market }) {
  const { ui: UI_STRINGS } = contentFor(market);
  const p = pBind(market);

  const c = market === "de" ? CONTENT_DE : CONTENT;
  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      <PageHero
        badge={c.badge}
        h1a={c.h1a}
        h1b={c.h1b}
        sub={c.sub}
        actions={
          <>
            <Button size="lg" variant="primary" asChild>
              <Link href={p("/signup")}>
                {UI_STRINGS.startFree} <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={p("/superbrain")}>{UI_STRINGS.watchDemo}</Link>
            </Button>
          </>
        }
        visual={<IllusOrigin />}
      />

      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Heading and statement belong together — SectionHeading's 56 px
              bottom margin tore them apart. */}
          <Reveal variant="up" className="text-center">
            <h2 className={`mb-6 ${H2_CTA_CLASS}`}>{c.missionTitle}</h2>
            <p className="mx-auto max-w-3xl [font-family:var(--font-display)] text-xl leading-relaxed text-pretty [color:var(--mk-text)] md:text-2xl">
              {c.missionText}
            </p>
          </Reveal>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={c.valuesTitle} tone="light" />
          <StaggerContainer className="grid gap-6 sm:grid-cols-2" stagger={0.08}>
            {c.values.map((v) => (
              <StaggerItem key={v.title}>
                <ContentCard icon={v.icon} title={v.title} desc={v.desc} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      <Section tone="dark" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.statsTitle} tone="dark" />
          <StaggerContainer className="grid grid-cols-1 gap-6 sm:grid-cols-2" stagger={0.06}>
            {c.stats.map((s) => (
              <StaggerItem key={s.label} className="text-center">
                <StatCard value={s.value} label={s.label} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      <CTASection
        title={c.ctaTitle}
        sub={c.ctaSub}
        href={p("/contact")}
        label={c.ctaButton}
        secondaryHref={p("/signup")}
        secondaryLabel={UI_STRINGS.startFree}
      />
    </div>
  );
}
