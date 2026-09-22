import Link from "next/link";
import type { Lang } from "@/content/site";
import { Section } from "@/components/marketing/primitives";
import { H1_CLASS, H3_CLASS } from "@/components/marketing/typography";

// Legal content (de-AT) — used by /privacy, /terms, /imprint and /dpa.
// `home` sets the back-link. Drafts: professionally complete, but have a
// lawyer review before launch.

const T = {
  backLink: "← Subsumio",
  seeAlso: "Siehe auch:",
  privacy: "Datenschutz",
  terms: "AGB",
  imprint: "Impressum",
  dpa: "AVV",
  draftNotice: "Entwurf — fachlich vollständig, vor Launch anwaltlich final prüfen.",
  imprintTitle: "Impressum",
  imprintSubtitle: "Angaben gemäß § 5 ECG und Offenlegung gemäß § 25 MedienG",
  privacyTitle: "Datenschutzerklärung",
  privacySubtitle: "Stand: Juni 2026",
  termsTitle: "Allgemeine Geschäftsbedingungen",
  termsSubtitle: "Stand: Juni 2026 · gilt für den gehosteten Subsumio-Dienst",
  dpaTitle: "Auftragsverarbeitungsvertrag (AVV)",
  dpaSubtitle:
    "Stand: Juni 2026 · Art. 28 DSGVO — Vorlage für Kunden der gehosteten Subsumio-Cloud",
} as const;

function Shell({
  home,
  title,
  subtitle,
  lang: _lang,
  children,
}: {
  home: string;
  title: string;
  subtitle: string;
  lang: Lang;
  children: React.ReactNode;
}) {
  const t = T;
  return (
    <div data-tone="light" className="min-h-screen [background:var(--mk-bg)]">
      <Section tone="light" className="px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Link href={home} className="brand-text text-sm hover:underline">
            {t.backLink}
          </Link>
          <h1 className={`mt-8 mb-2 ${H1_CLASS}`}>{title}</h1>
          <p className="mb-6 text-xs text-pretty [color:var(--mk-text-subtle)]">{subtitle}</p>
          <div className="space-y-3 text-sm leading-relaxed text-pretty [color:var(--mk-text-muted)]">
            {children}
          </div>
        </div>
      </Section>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className={`mt-8 mb-2 ${H3_CLASS}`}>{children}</h2>;
}

function LegalLinks({
  home,
  exclude,
  lang: _lang,
}: {
  home: string;
  exclude: "privacy" | "terms" | "imprint" | "dpa";
  lang: Lang;
}) {
  const t = T;
  const links = [
    { key: "privacy" as const, href: `${home === "/" ? "" : home}/privacy`, label: t.privacy },
    { key: "terms" as const, href: `${home === "/" ? "" : home}/terms`, label: t.terms },
    { key: "dpa" as const, href: `${home === "/" ? "" : home}/dpa`, label: t.dpa },
    { key: "imprint" as const, href: `${home === "/" ? "" : home}/imprint`, label: t.imprint },
  ].filter((l) => l.key !== exclude);
  return (
    <p className="pt-6 text-xs [color:var(--mk-text-subtle)]">
      {t.seeAlso}{" "}
      {links.map((l, i) => (
        <span key={l.key}>
          {i > 0 && " · "}
          <Link href={l.href} className="brand-text hover:underline">
            {l.label}
          </Link>
        </span>
      ))}
    </p>
  );
}

export function ImprintContent({ home, lang = "de" }: { home: string; lang?: Lang }) {
  const t = T;
  return (
    <Shell home={home} lang={lang} title={t.imprintTitle} subtitle={t.imprintSubtitle}>
      <H2>Betreiber</H2>
      <p>
        RCIID — Rocket Chain Investigation &amp; Intelligence Division
        <br />
        Hauslabgasse 42/3/2
        <br />
        1050 Wien, Österreich
      </p>
      <H2>Kontakt</H2>
      <p>
        E-Mail: help@rciid.at
        <br />
        Website: www.rciid.at
      </p>
      <H2>Vertretungsberechtigt</H2>
      <p>Ismet Mesic — Gründer &amp; Präsident</p>
      <H2>Registereintrag</H2>
      <p>
        Verein nach dem Vereinsgesetz 2002 — Zentralvereinsregister-Nummer: ZVR 1266935562.
        Vereinsbehörde: Landespolizeidirektion Wien.
      </p>
      <H2>Umsatzsteuer-Identifikationsnummer</H2>
      <p>UID-Nummer: wird nach Zuteilung ergänzt.</p>
      <H2>Zielgruppe</H2>
      <p>Unser Angebot richtet sich ausschließlich an Unternehmer im Sinne des § 1 KSchG.</p>
      <LegalLinks home={home} exclude="imprint" lang={lang} />
    </Shell>
  );
}

export function PrivacyContent({
  home,
  lang = "de",
  market = "at",
}: {
  home: string;
  lang?: Lang;
  market?: "at" | "de";
}) {
  const t = T;
  return (
    <Shell home={home} lang={lang} title={t.privacyTitle} subtitle={t.privacySubtitle}>
      <H2>1. Verantwortlicher</H2>
      <p>
        Verantwortlich für die Datenverarbeitung auf dieser Website und im gehosteten
        Subsumio-Dienst (im Folgenden &bdquo;Dienst&ldquo;) ist:
      </p>
      <p className="mt-2">
        RCIID — Rocket Chain Investigation &amp; Intelligence Division
        <br />
        Hauslabgasse 42/3/2
        <br />
        1050 Wien, Österreich
        <br />
        E-Mail: help@rciid.at
      </p>
      <p className="mt-2">
        Es wurde aktuell kein Datenschutzbeauftragter bestellt. Eine Bestellpflicht besteht u. a.
        bei umfangreicher Verarbeitung besonderer Kategorien personenbezogener Daten (Art. 37 DSGVO
        iVm § 5 DSG). Datenschutz-Anfragen richten Sie bitte an help@rciid.at.
      </p>

      <H2>2. Grundsatz: Datensparsamkeit und Betriebsmodelle</H2>
      <p>
        Subsumio ist als datensparsames Produkt konzipiert. Es gibt zwei Betriebsmodelle mit
        unterschiedlichen datenschutzrechtlichen Rollen:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong className="[color:var(--mk-text)]">On-Premise (Enterprise):</strong> Subsumio
          läuft auf Ihrer eigenen Infrastruktur. Inhalte werden nicht an uns übermittelt; wir haben
          keinen Zugriff.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Gehostete EU-Cloud:</strong> Wir verarbeiten
          Inhalte ausschließlich zur Erbringung des Dienstes — niemals zum Training von KI-Modellen.
        </li>
      </ul>

      <H2>3. Betrieb der Website</H2>
      <p>
        Beim Aufruf verarbeitet der Hosting-Dienstleister technisch notwendige Server-Logdaten
        (IP-Adresse, Zeitpunkt, abgerufene Ressource, User-Agent) zur Auslieferung und Absicherung —
        berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO). Es werden keine
        Marketing-/Tracking-Cookies ohne Einwilligung gesetzt.
      </p>

      <H2>4. Konto, Authentifizierung, Abrechnung</H2>
      <p>
        Zur Nutzung verarbeiten wir Bestandsdaten: E-Mail, Name, ein nicht rückrechenbar
        gespeichertes Passwort, Empfehlungscode — zur Vertragserfüllung (Art. 6 Abs. 1 lit. b
        DSGVO). Login-/Registrierungsversuche werden zur Missbrauchsabwehr ratenbegrenzt (Art. 6
        Abs. 1 lit. f DSGVO). Kostenpflichtige Pläne werden über einen Zahlungsdienstleister
        abgerechnet.
      </p>

      <H2>5. Inhalte und Mandantendaten — Auftragsverarbeitung</H2>
      <p>
        Soweit Sie personenbezogene Daten Ihrer Mandanten/Kunden einstellen, sind{" "}
        <strong className="[color:var(--mk-text)]">Sie der Verantwortliche</strong> und wir handeln
        als <strong className="[color:var(--mk-text)]">Auftragsverarbeiter</strong> (Art. 28 DSGVO).
        Vor einer solchen Nutzung ist ein AVV abzuschließen (Vorlage wird bereitgestellt).
        Rechtsanwältinnen und Rechtsanwälte beachten zusätzlich{" "}
        {market === "de" ? "§ 43a Abs. 2 BRAO" : "§ 9 Abs. 2 RAO"}; wir unterzeichnen dazu auf
        Wunsch eine gesonderte Verschwiegenheitsverpflichtung.
      </p>

      <H2>6. KI-Funktionen</H2>
      <p>
        Für Synthese- und Agentenfunktionen werden relevante Inhaltsausschnitte an Anbieter von
        KI-Sprachmodellen und Suchfunktionen übermittelt, die weisungsgebunden verarbeiten und die
        Daten nicht zum Training verwenden (für Kontodaten Art. 6 Abs. 1 lit. b DSGVO; für
        Mandantendaten im Auftrag nach Art. 28 DSGVO). Bei On-Premise wählen Sie Anbieter und
        Modelle frei oder betreiben ein lokales Modell.
      </p>

      <H2>7. Chat auf dieser Website</H2>
      <p>
        Der Assistent auf dieser Website beantwortet Fragen zum Produkt anhand der Inhalte dieser
        Website. Ihre Nachricht wird dafür an den Anbieter des KI-Sprachmodells übermittelt
        (Abschnitt 8). Wir speichern den Gesprächsverlauf ohne IP-Adresse unter einer zufälligen
        Sitzungskennung, um die Antwortqualität zu prüfen und fehlende Inhalte zu erkennen;
        erkennbare personenbezogene Daten (E-Mail-Adressen, Telefonnummern, Aktenzeichen, IBAN,
        Sozialversicherungs- und Geburtsdaten) werden vor Speicherung und vor der Übermittlung an
        das Modell automatisch entfernt. Bitte geben Sie im Chat keine Mandantendaten ein. Die
        Verläufe werden nach 90 Tagen gelöscht. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse an Beantwortung von Anfragen und Verbesserung des Angebots).
      </p>
      <p className="mt-2">
        Fragen Sie im Chat einen Rückruf oder einen Termin an, verarbeiten wir die von Ihnen
        angegebenen Kontaktdaten samt Ihrer Anfrage und dem bisherigen, bereinigten Gesprächsverlauf
        zur Bearbeitung Ihrer Anfrage (Art. 6 Abs. 1 lit. b DSGVO, vorvertragliche Maßnahmen). Eine
        Nutzung für Werbung ohne Ihre gesonderte Einwilligung erfolgt nicht.
      </p>

      <H2>8. Auftragsverarbeiter und Empfänger</H2>
      <p>
        Je nach Konfiguration können folgende Kategorien eingebunden sein (alle mit AVV;
        Drittland-Transfers nur auf Basis von EU-Standardvertragsklauseln, Art. 46 DSGVO):
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Hosting/Infrastruktur, vorrangig EU-Rechenzentren</li>
        <li>Anbieter von KI-Sprachmodellen (Antworten) und Suchfunktionen</li>
        <li>Zahlungsdienstleister für kostenpflichtige Pläne</li>
        <li>
          E-Mail-Versanddienst für transaktionale Nachrichten (Fristenübersicht, Passwort
          zurücksetzen)
        </li>
        <li>Optional: Dienst zur verteilten Ratenbegrenzung</li>
      </ul>
      <p className="mt-2">
        Aktuelle Anbieter: Hosting über ein EU-Rechenzentrum (netcup GmbH, Rechenzentrum Wien, AT);
        KI-Sprachmodelle über Anthropic (Anthropic PBC, US, EU-Standardvertragsklauseln) und, als
        Ausweichweg sowie für Suchfunktionen, über OpenRouter (US, EU-Standardvertragsklauseln);
        Zahlung über Stripe (US, EU-Standardvertragsklauseln); E-Mail über Resend (US,
        EU-Standardvertragsklauseln). Alle Auftragsverarbeiter sind durch AVV gebunden.
      </p>

      <H2>9. Speicherdauer</H2>
      <p>
        Kontodaten für die Vertragsdauer; Löschung nach Kündigung, soweit keine
        Aufbewahrungspflichten (§ 132 BAO) entgegenstehen. Inhalte werden auf Ihre Weisung bzw. mit
        Vertragsende gelöscht. Server-Logs werden 14 Tage aufbewahrt.
      </p>

      <H2>10. Ihre Rechte</H2>
      <p>
        Sie haben Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO).
        Einen vollständigen Export Ihrer Konto- und Kanzleiwissen-Daten als JSON können Sie selbst
        über{" "}
        <span className="[color:var(--mk-text)]">Einstellungen → Account → Daten exportieren</span>{" "}
        auslösen. Sie haben das Recht auf Beschwerde bei der Österreichischen Datenschutzbehörde,
        Barichgasse 40–42, 1030 Wien, dsb.gv.at
        {market === "de" &&
          ", sowie bei der für Sie zuständigen deutschen Aufsichtsbehörde (Art. 77 DSGVO)"}
        .
      </p>

      <H2>11. Änderungen</H2>
      <p>Maßgeblich ist die jeweils auf dieser Seite veröffentlichte Fassung.</p>

      <LegalLinks home={home} exclude="privacy" lang={lang} />
    </Shell>
  );
}

export function TermsContent({
  home,
  lang = "de",
  market = "at",
}: {
  home: string;
  lang?: Lang;
  market?: "at" | "de";
}) {
  const t = T;
  return (
    <Shell home={home} lang={lang} title={t.termsTitle} subtitle={t.termsSubtitle}>
      <H2>§ 1 Geltungsbereich, Vertragspartner</H2>
      <p>
        (1) Diese AGB gelten für die Nutzung des gehosteten Subsumio-Dienstes (&bdquo;Dienst&ldquo;)
        zwischen RCIID — Rocket Chain Investigation &amp; Intelligence Division
        (&bdquo;Anbieter&ldquo;) und dem Kunden. (2) Das Angebot richtet sich ausschließlich an
        Unternehmer i. S. d. {market === "de" ? "§ 14 BGB" : "UGB"} und juristische Personen des
        öffentlichen Rechts (B2B). (3) Abweichende Bedingungen des Kunden gelten nur bei
        ausdrücklicher schriftlicher Zustimmung.
      </p>

      <H2>§ 2 Vertragsschluss</H2>
      <p>
        Der Vertrag kommt mit Registrierung und Planauswahl zustande, bei kostenpflichtigen Plänen
        mit Abschluss des Bestellvorgangs. Die Open-Source-Engine unterliegt separat ihrer
        Open-Source-Lizenz; diese AGB regeln ausschließlich die gehostete Leistung.
      </p>

      <H2>§ 3 Leistungsbeschreibung</H2>
      <p>
        (1) Der Anbieter stellt den Dienst gemäß der zum Vertragsschluss geltenden
        Leistungsbeschreibung (Plan-Features, Fair-Use-Grenzen) bereit. (2) Geschuldet ist eine nach
        dem Stand der Technik übliche Verfügbarkeit, keine ununterbrochene Erreichbarkeit; Wartung
        und höhere Gewalt bleiben vorbehalten. (3) Funktionen können fortentwickelt werden, solange
        der vertragliche Kernnutzen erhalten bleibt.
      </p>

      <H2>§ 4 Preise, Zahlung, Laufzeit</H2>
      <p>
        (1) Es gelten die auf der{" "}
        <Link href={`${home === "/" ? "" : home}/pricing`} className="brand-text hover:underline">
          Preisseite
        </Link>{" "}
        ausgewiesenen Preise zzgl. USt. (2) Abrechnung über den Zahlungsdienstleister im Voraus. (3)
        Der Vertrag verlängert sich um den Abrechnungszeitraum, sofern nicht zu dessen Ende
        gekündigt. (4) Up-/Downgrades werden zum nächsten Abrechnungszeitraum wirksam.
      </p>

      <H2>§ 5 Pflichten des Kunden</H2>
      <p>
        (1) Zugangsdaten geheim halten, Konten angemessen absichern. (2) Nur Inhalte einstellen, zu
        deren Verarbeitung der Kunde berechtigt ist. (3) Der Dienst erbringt{" "}
        <strong className="[color:var(--mk-text)]">
          keine Rechts-, Steuer- oder sonstige Beratung
        </strong>
        ; er ist ein Hilfsmittel zur Organisation und Synthese eigener Unterlagen. Die fachliche und
        berufsrechtliche Verantwortung (inkl. Fristen- und Kollisionskontrolle) verbleibt beim
        Kunden.
      </p>

      <H2>§ 6 Datenschutz und Verschwiegenheit</H2>
      <p>
        (1) Bei Verarbeitung personenbezogener Daten Dritter schließen die Parteien einen AVV (Art.
        28 DSGVO), der diesen AGB im Konfliktfall vorgeht. (2) Mit Rechtsanwältinnen und
        Rechtsanwälten schließt der Anbieter auf Wunsch eine gesonderte
        Verschwiegenheitsverpflichtung ({market === "de" ? "§ 43a Abs. 2 BRAO" : "§ 9 Abs. 2 RAO"}
        ). (3) Keine Nutzung von Kundeninhalten zum KI-Training. (4) Bei Vertragsende kann der Kunde
        seine Daten selbst exportieren; danach Löschung nach Maßgabe der Datenschutzerklärung.
      </p>

      <H2>§ 7 KI-spezifische Hinweise</H2>
      <p>
        Antworten, Zitate und Agenten-Ergebnisse sind maschinell erzeugte Hilfsmittel und können
        fehlerhaft sein. Quellenangaben dienen der Überprüfung; eine inhaltliche Prüfung durch den
        Kunden vor Verwendung (z. B. in Schriftsätzen) ist erforderlich.
      </p>

      <H2>§ 8 Haftung</H2>
      <p>
        (1) Unbeschränkte Haftung für Vorsatz und grobe Fahrlässigkeit sowie für Schäden aus der
        Verletzung von Leben, Körper oder Gesundheit. (2) Bei einfacher Fahrlässigkeit nur bei
        Verletzung einer Kardinalpflicht, begrenzt auf den vertragstypisch vorhersehbaren Schaden.
        (3) Im Übrigen ist die Haftung ausgeschlossen. (4) Das Produkthaftungsgesetz bleibt
        unberührt.
      </p>

      <H2>§ 9 Partnerprogramm</H2>
      <p>
        Für das Empfehlungs-/Partnerprogramm gelten ergänzend die gesonderten Partnerbedingungen.
      </p>

      <H2>§ 10 Schlussbestimmungen</H2>
      <p>
        (1) Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts. (2) Ausschließlicher
        Gerichtsstand für Unternehmer ist Wien, Österreich. (3) Salvatorische Klausel. (4)
        Änderungen werden mit angemessener Frist mitgeteilt und gelten als angenommen, wenn der
        Kunde nicht widerspricht; auf die Bedeutung des Schweigens wird gesondert hingewiesen.
      </p>

      <LegalLinks home={home} exclude="terms" lang={lang} />
    </Shell>
  );
}

export function DpaContent({ home, lang = "de" }: { home: string; lang?: Lang }) {
  const t = T;
  return (
    <Shell home={home} lang={lang} title={t.dpaTitle} subtitle={t.dpaSubtitle}>
      <p className="text-xs [color:var(--mk-text-subtle)]">
        {t.draftNotice} Diese Vorlage implementiert Art. 28 DSGVO. Bitte füllen Sie die Platzhalter
        aus, unterzeichnen Sie die Vorlage und senden Sie sie an help@rciid.at, bevor Sie
        personenbezogene Daten hochladen.
      </p>

      <H2>§ 1 Vertragsparteien</H2>
      <p>
        <strong className="[color:var(--mk-text)]">Verantwortlicher</strong> (der Kunde, der
        Subsumio zur Verarbeitung personenbezogener Daten nutzt):
      </p>
      <p className="mt-1">
        [Name des Verantwortlichen]
        <br />
        [Anschrift]
        <br />
        [Vertretungsberechtigter]
        <br />
        [E-Mail]
      </p>
      <p className="mt-2">
        <strong className="[color:var(--mk-text)]">Auftragsverarbeiter</strong> (Anbieter des
        gehosteten Subsumio-Dienstes):
      </p>
      <p className="mt-1">
        RCIID — Rocket Chain Investigation &amp; Intelligence Division
        <br />
        Hauslabgasse 42/3/2
        <br />
        1050 Wien, Österreich
        <br />
        E-Mail: help@rciid.at
      </p>

      <H2>§ 2 Gegenstand, Dauer, Art und Zweck</H2>
      <p>
        (1) <strong className="[color:var(--mk-text)]">Gegenstand:</strong> Bereitstellung des
        gehosteten Subsumio-Cloud-Dienstes zur Organisation, Suche und Synthese von Dokumenten und
        Aktendaten.
      </p>
      <p>
        (2) <strong className="[color:var(--mk-text)]">Dauer:</strong> Für die Laufzeit des
        Hauptvertrags (gemäß AGB), sofern nicht früher beendet.
      </p>
      <p>
        (3) <strong className="[color:var(--mk-text)]">Art und Zweck:</strong> Speicherung,
        Volltext- und semantische Suche, KI-gestützte Synthese und Agenten-Workflows auf vom
        Verantwortlichen hochgeladenen Dokumenten. Keine Nutzung von Inhalten zum KI-Training.
      </p>
      <p>
        (4) <strong className="[color:var(--mk-text)]">Art personenbezogener Daten:</strong>{" "}
        Bestandsdaten (E-Mail, Name) sowie alle personenbezogenen Daten, die der Verantwortliche
        innerhalb von Inhalten hochlädt (z. B. Akten, Mandantenkorrespondenz, Rechnungen).
      </p>
      <p>
        (5) <strong className="[color:var(--mk-text)]">Kategorien betroffener Personen:</strong>{" "}
        Mandanten, Gegenseite, Zeugen, Mitarbeiter und weitere Personen, deren Daten in den
        Dokumenten des Verantwortlichen enthalten sind.
      </p>

      <H2>§ 3 Pflichten des Auftragsverarbeiters (Art. 28 Abs. 3 DSGVO)</H2>
      <p>Der Auftragsverarbeiter:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          verarbeitet personenbezogene Daten ausschließlich auf dokumentierte Weisung des
          Verantwortlichen, einschließlich der Übermittlung an Drittländer, sofern nicht EU- oder
          mitgliedstaatliches Recht dies erfordert;
        </li>
        <li>
          stellt sicher, dass zur Verarbeitung befugte Personen einer Verschwiegenheitspflicht
          unterliegen;
        </li>
        <li>trifft geeignete technische und organisatorische Maßnahmen (TOM, § 5);</li>
        <li>beachtet die Bedingungen für die Heranziehung von Unterauftragsverarbeitern (§ 4);</li>
        <li>
          unterstützt den Verantwortlichen bei der Beantwortung von Auskunftsersuchen betroffener
          Personen;
        </li>
        <li>
          unterstützt den Verantwortlichen bei der Erfüllung seiner Pflichten nach den Art. 32–36
          DSGVO (Sicherheit, Verletzungsmitteilung, DSFA, Vorabkonsultation);
        </li>
        <li>
          löscht oder gibt alle personenbezogenen Daten nach Ende der Leistung zurück, sofern keine
          gesetzliche Aufbewahrungspflicht besteht;
        </li>
        <li>
          macht alle Informationen verfügbar, die zur Demonstration der Compliance erforderlich
          sind, und ermöglicht und trägt zu Audits bei.
        </li>
      </ul>

      <H2>§ 4 Unterauftragsverarbeiter</H2>
      <p>
        (1) Der Verantwortliche erteilt die allgemeine Genehmigung für die in der
        Datenschutzerklärung (§ 7) aufgeführten Unterauftragsverarbeiter. Der Auftragsverarbeiter
        informiert den Verantwortlichen über beabsichtigte Änderungen hinzuzufügender oder
        ersetzender Unterauftragsverarbeiter und gibt ihm die Möglichkeit zum Widerspruch.
      </p>
      <p>
        (2) Aktuelle Unterauftragsverarbeiter: Hosting (netcup GmbH, Rechenzentrum Wien, AT/EU);
        Anbieter von KI-Sprachmodellen (Anthropic PBC, US — EU-Standardvertragsklauseln); Anbieter
        von KI-Sprachmodellen als Ausweichweg und von Suchfunktionen (OpenRouter, US —
        EU-Standardvertragsklauseln); Zahlung (Stripe, US — EU-Standardvertragsklauseln); E-Mail
        (Resend, US — EU-Standardvertragsklauseln); optionaler Dienst zur Ratenbegrenzung (Upstash,
        US — EU-Standardvertragsklauseln).
      </p>
      <p>
        (3) Bei Unterauftragsverarbeitern außerhalb des EWR erfolgen Übermittlungen auf Basis von
        EU-Standardvertragsklauseln (Art. 46 DSGVO) und ergänzenden Maßnahmen, soweit erforderlich.
      </p>
      <p>
        (4) Der Auftragsverarbeiter haftet voll für Unterauftragsverarbeiter wie für eigene
        Verarbeitung.
      </p>

      <H2>§ 5 Technische und organisatorische Maßnahmen (Art. 32 DSGVO)</H2>
      <p>Der Auftragsverarbeiter trifft folgende TOM:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong className="[color:var(--mk-text)]">Verschlüsselung:</strong> TLS 1.2+ in Transit,
          AES-256 at-rest für Datenbank und Backups.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Zugriffskontrolle:</strong> Rollenbasierte
          Zugriffskontrolle (RBAC), Least-Privilege, eindeutige Benutzerkonten, MFA verfügbar.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Authentifizierung:</strong> Scrypt-gehashte
          Passwörter, Session-Tokens signiert mit HMAC-SHA-256.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Netzwerksicherheit:</strong> Firewall,
          isoliertes Datenbanknetzwerk, kein öffentlicher DB-Zugriff.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Protokollierung &amp; Monitoring:</strong>{" "}
          Unveränderliches Audit-Log mit Hash-Chain (manipulationssicher), Sentry Fehler-Monitoring.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Backup:</strong> Tägliche verschlüsselte
          Backups mit Verify- und Restore-Verfahren; Aufbewahrung nach gesetzlichen Vorgaben.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Datenisolation:</strong> Multi-Tenant-Isolation
          via brain_id; Source-Level-Zugriffskontrolle verhindert Cross-Tenant-Datenlecks.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Verfügbarkeit:</strong> Health-Checks,
          Auto-Restart, EU-Rechenzentrum in Wien.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Pseudonymisierung:</strong> Interne IDs wo
          möglich; keine Nutzung von Inhalten zum KI-Training.
        </li>
        <li>
          <strong className="[color:var(--mk-text)]">Incident Response:</strong> Dokumentiertes
          Verletzungsmitteilungsverfahren innerhalb von 72 Stunden an den Verantwortlichen.
        </li>
      </ul>

      <H2>§ 6 Unterstützung bei Betroffenenrechten</H2>
      <p>
        Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der Erfüllung seiner Pflicht,
        auf Auskunftsersuchen betroffener Personen zu antworten (Auskunft, Berichtigung, Löschung,
        Einschränkung, Übertragbarkeit, Widerspruch). Der Verantwortliche kann alle Daten über{" "}
        <span className="[color:var(--mk-text)]">Einstellungen → Account → Daten exportieren</span>{" "}
        exportieren. Löschungsanfragen können über den GDPR-Data-Deletion-Endpunkt ausgelöst werden.
      </p>

      <H2>§ 7 Verletzung des Schutzes personenbezogener Daten</H2>
      <p>
        (1) Der Auftragsverarbeiter meldet dem Verantwortlichen eine Verletzung des Schutzes
        personenbezogener Daten unverzüglich, spätestens jedoch innerhalb von 48 Stunden nach
        Kenntniserlangung.
      </p>
      <p>
        (2) Die Meldung beschreibt Art der Verletzung, voraussichtliche Folgen und ergriffene oder
        vorgeschlagene Maßnahmen. Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der
        Meldung an die Aufsichtsbehörde (Art. 33 DSGVO) und betroffene Personen (Art. 34 DSGVO),
        soweit erforderlich.
      </p>

      <H2>§ 8 Audit-Rechte</H2>
      <p>
        (1) Der Verantwortliche ist berechtigt, die Einhaltung dieses AVV und des Art. 28 DSGVO
        durch den Auftragsverarbeiter zu prüfen, nach angemessener Ankündigung und während der
        Geschäftszeiten.
      </p>
      <p>
        (2) Prüfungen werden durch eigenes Personal des Verantwortlichen oder durch eine
        verschwiegenheitsgebundene dritte Partei durchgeführt. Der Auftragsverarbeiter stellt die
        erforderlichen Informationen und Zugänge bereit.
      </p>
      <p>
        (3) Audit-Berichte, etwaige Zertifizierungen und das unveränderliche Audit-Log können beim
        Auftragsverarbeiter angefordert werden.
      </p>

      <H2>§ 9 Löschung bei Vertragsende</H2>
      <p>
        Auf Wunsch des Verantwortlichen löscht der Auftragsverarbeiter alle personenbezogenen Daten
        nach Ende des Dienstvertrages, sofern keine gesetzliche Aufbewahrungspflicht (§ 132 BAO)
        besteht. Ein vollständiger Export kann vor der Löschung ausgelöst werden. Die Löschung wird
        im unveränderlichen Audit-Trail protokolliert.
      </p>

      <H2>§ 10 Haftung</H2>
      <p>
        Die Haftung unter diesem AVV richtet sich nach den AGB (§ 8), ergänzt durch Art. 82 DSGVO.
        Der Auftragsverarbeiter haftet für Schäden, die durch eine Verarbeitung in Verletzung der
        DSGVO entstanden sind, nur soweit er seinen spezifischen Pflichten nicht nachgekommen ist.
      </p>

      <H2>§ 11 Schlussbestimmungen</H2>
      <p>
        (1) Dieser AVV ist Teil des Hauptvertrags und geht im Konfliktfall bezüglich Datenschutz
        vor. (2) Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts. (3)
        Ausschließlicher Gerichtsstand für Unternehmer ist Wien, Österreich. (4) Änderungen werden
        mit angemessener Frist mitgeteilt.
      </p>

      <LegalLinks home={home} exclude="dpa" lang={lang} />
    </Shell>
  );
}
