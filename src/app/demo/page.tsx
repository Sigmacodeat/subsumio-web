import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero, Section, SectionHeading, TrustStrip } from "@/components/marketing/primitives";
import { DemoEntry } from "@/components/marketing/demo-entry";

export const metadata: Metadata = {
  title: "Live-Demo — Subsumio ohne Anmeldung testen",
  description:
    "Öffnen Sie die Demo-Kanzlei: eine vollständig befüllte fiktive Akte mit Dokumenten, Fristen und KI-Assistent — ohne Anmeldung, ohne Kosten, 60 Minuten frei erkundbar.",
  alternates: { canonical: "/demo" },
  robots: { index: true, follow: true },
};

export default function DemoPage() {
  return (
    <>
      <PageHero
        badge="Live-Demo · keine Anmeldung"
        h1a="Die Kanzlei Berger ist eröffnet."
        h1b="Sehen Sie selbst."
        sub="Eine vollständige fiktive Akte wartet auf Sie: Dokumente, Beteiligte, eine laufende Frist und ein neuer Schriftsatz im Posteingang. Stellen Sie Fragen, sehen Sie Fundstellen, erleben Sie die Aufnahme — kostenlos und ohne Registrierung."
        tone="light"
      />

      <Section tone="light" className="px-4 pb-16 sm:px-6 lg:px-8">
        <Suspense>
          <DemoEntry />
        </Suspense>
      </Section>

      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <SectionHeading
          badge="So läuft die Demo"
          title="Drei Schritte — dann erkunden Sie frei"
          sub="Keine Folien, keine Video-Tour: Sie arbeiten im echten Produkt mit fiktiven Daten."
        />
        <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-3">
          {[
            {
              n: "1",
              title: "Frage stellen",
              body: "Die Akte „Berger ./. Muster Werk GmbH“ ist befüllt. Stellen Sie eine Frage — die Antwort kommt mit Fundstellen aus den Dokumenten.",
            },
            {
              n: "2",
              title: "Dokument aufnehmen",
              body: "Ein Schriftsatz der Gegenseite ist eingegangen. Sehen Sie, wie Subsumio Beteiligte und Fristen erkennt und alles mit der Akte verknüpft.",
            },
            {
              n: "3",
              title: "Frist bestätigen",
              body: "Die erkannte Replikfrist erscheint als KI-Vorschlag — Sie bestätigen, nichts geht ohne Ihre Prüfung. Danach: freie Erkundung.",
            },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-[color:var(--mk-border,var(--ds-border))] p-6"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/10 text-sm font-bold text-[color:var(--brand-primary)]">
                {s.n}
              </span>
              <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--mk-text-subtle,var(--ds-text-subtle))]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <TrustStrip
            items={[
              { label: "Fiktive Daten — kein Mandatsgeheimnis nötig", icon: "Shield" },
              { label: "Keine Registrierung, keine Kosten", icon: "Check" },
              { label: "Serverstandort EU", icon: "Lock" },
              { label: "Session läuft 60 Minuten", icon: "Clock" },
            ]}
          />
        </div>
      </Section>
    </>
  );
}
