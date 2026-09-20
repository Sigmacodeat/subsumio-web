// Foundation band — what the product stands on, grouped the way a lawyer
// checks it: professional law, data protection, operation, connections.
// Static by design. The former auto-scrolling pill marquee repeated the hero's
// trust chips, labelled legal duties as "certifications", and moved text a
// reader was trying to read. A still, four-column register reads as evidence.

import { Scale, ShieldCheck, Server, Plug, type LucideIcon } from "lucide-react";
import { UI_STRINGS } from "@/content/site";
import { EYEBROW_CLASS } from "./typography";
import { Reveal, StaggerContainer, StaggerItem } from "./motion-system";

interface FoundationGroup {
  icon: LucideIcon;
  title: string;
  items: string[];
}

const GROUPS: FoundationGroup[] = [
  {
    icon: Scale,
    title: "Berufsrecht",
    items: [
      "Verschwiegenheit nach § 9 Abs. 2 RAO",
      "Kollisionsprüfung nach § 10 RAO",
      "Tarifleistungen nach RATG",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Datenschutz",
    items: [
      "DSGVO-konform",
      "Auftragsverarbeitung nach Art. 28 DSGVO",
      "Kein Training auf Ihren Daten",
    ],
  },
  {
    icon: Server,
    title: "Betrieb",
    items: ["EU-Cloud oder On-Premise", "Aufbewahrung nach BAO", "Nachvollziehbares Protokoll"],
  },
  {
    icon: Plug,
    title: "Anbindungen",
    items: [
      "Rechtsquellen aus dem RIS",
      "Word-Add-in und E-Mail-Postfach",
      "DocuSign und WhatsApp Business",
    ],
  },
];

export default function LogoMarquee() {
  const eyebrow = UI_STRINGS.certificationsEyebrow;
  const heading = UI_STRINGS.trustHeading;

  return (
    <section
      aria-label={eyebrow}
      data-tone="light"
      className="relative border-y [border-color:var(--mk-border)] px-4 py-16 [background:var(--mk-surface)] sm:px-6 md:py-20 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal variant="upScale" className="mb-12 max-w-2xl">
          <p className={`mb-4 ${EYEBROW_CLASS}`}>{eyebrow}</p>
          <h2 className="[font-family:var(--font-display)] text-2xl leading-snug font-medium tracking-[-0.012em] text-balance [color:var(--mk-text)] md:text-[1.75rem]">
            {heading}
          </h2>
        </Reveal>
        <StaggerContainer
          className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
          stagger={0.06}
          y={10}
        >
          {GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <StaggerItem key={group.title}>
                <div className="border-t [border-color:var(--mk-border-strong)] pt-5">
                  <p className="mb-4 flex items-center gap-2 text-sm font-semibold [color:var(--mk-text)]">
                    <Icon size={16} aria-hidden className="[color:var(--brand-text)]" />
                    {group.title}
                  </p>
                  <ul className="space-y-2.5">
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="text-[0.9375rem] leading-snug [color:var(--mk-text-muted)]"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
