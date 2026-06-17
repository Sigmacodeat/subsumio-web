import Link from "next/link";

// Geteilte Rechtstext-Inhalte (DE) — von /privacy, /terms, /imprint UND den
// /de/*-Routen genutzt. `home` setzt den Zurück-Link je Sprachpfad.
// Entwürfe: fachlich vollständig, vor Launch anwaltlich final prüfen.

function Shell({ home, title, subtitle, children }: { home: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen [background:var(--mk-bg)] px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href={home} className="text-sm text-violet-400 hover:underline">← Sigmabrain</Link>
        <h1 className="text-3xl font-black [color:var(--mk-text)] mt-8 mb-2">{title}</h1>
        <p className="text-xs [color:var(--mk-text-subtle)] mb-6">{subtitle}</p>
        <div className="space-y-3 text-sm [color:var(--mk-text-muted)] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="[color:var(--mk-text)] font-semibold text-lg mb-2 mt-8">{children}</h2>;
}

function DraftBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-300 text-xs">{children}</div>
  );
}

function LegalLinks({ home, exclude }: { home: string; exclude: "privacy" | "terms" | "imprint" }) {
  const links = [
    { key: "privacy", href: `${home === "/" ? "" : home}/privacy`, label: "Datenschutz" },
    { key: "terms", href: `${home === "/" ? "" : home}/terms`, label: "AGB" },
    { key: "imprint", href: `${home === "/" ? "" : home}/imprint`, label: "Impressum" },
  ].filter((l) => l.key !== exclude);
  return (
    <p className="pt-6 text-xs [color:var(--mk-text-subtle)]">
      Siehe auch:{" "}
      {links.map((l, i) => (
        <span key={l.key}>
          {i > 0 && " · "}
          <Link href={l.href} className="text-violet-400 hover:underline">{l.label}</Link>
        </span>
      ))}
    </p>
  );
}

export function ImprintContent({ home }: { home: string }) {
  return (
    <Shell home={home} title="Impressum" subtitle="Angaben gemäß § 5 DDG">
      <DraftBanner>
        Vor Launch mit echten Betreiberdaten füllen und anwaltlich prüfen lassen — ein
        unvollständiges Impressum ist abmahnfähig. Felder in [eckigen Klammern] ausfüllen.
      </DraftBanner>
      <H2>Betreiber</H2>
      <p>[Firmenname]<br />[Straße, Hausnummer]<br />[PLZ, Ort, Land]</p>
      <H2>Kontakt</H2>
      <p>E-Mail: hello@sigmabrain.com<br />[Telefon]</p>
      <H2>Vertretungsberechtigt</H2>
      <p>[Name der vertretungsberechtigten Person]</p>
      <H2>Registereintrag</H2>
      <p>[Handelsregister, Registernummer, Registergericht — falls vorhanden]</p>
      <H2>Umsatzsteuer-ID</H2>
      <p>[USt-IdNr. gemäß § 27a UStG — falls vorhanden]</p>
      <H2>Verbraucherstreitbeilegung</H2>
      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen (Angebot richtet sich an Unternehmer).
      </p>
      <LegalLinks home={home} exclude="imprint" />
    </Shell>
  );
}

export function PrivacyContent({ home }: { home: string }) {
  return (
    <Shell home={home} title="Datenschutzerklärung" subtitle="Stand: Juni 2026">
      <DraftBanner>
        Entwurf — fachlich vollständig, aber vor dem Launch anwaltlich bzw. durch eine/n
        Datenschutzbeauftragte/n final zu prüfen. Felder in [eckigen Klammern] sind vom
        Betreiber mit den realen Unternehmensdaten zu füllen.
      </DraftBanner>

      <H2>1. Verantwortlicher</H2>
      <p>
        Verantwortlich für die Datenverarbeitung auf dieser Website und im gehosteten
        Sigmabrain-Dienst (im Folgenden &bdquo;Dienst&ldquo;) ist:
      </p>
      <p className="mt-2">[Firmenname]<br />[Straße, Hausnummer]<br />[PLZ, Ort, Land]<br />E-Mail: hello@sigmabrain.com</p>
      <p className="mt-2">
        Datenschutzbeauftragte/r (sofern bestellt): [Name, Kontakt]. Eine Bestellpflicht besteht
        u. a. bei umfangreicher Verarbeitung besonderer Kategorien personenbezogener Daten
        (Art. 37 DSGVO i. V. m. § 38 BDSG).
      </p>

      <H2>2. Grundsatz: Datensparsamkeit und Betriebsmodelle</H2>
      <p>
        Sigmabrain ist als datensparsames Produkt konzipiert. Es gibt zwei Betriebsmodelle mit
        unterschiedlichen datenschutzrechtlichen Rollen:
      </p>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        <li><strong className="[color:var(--mk-text)]">Self-Hosting:</strong> Die Engine läuft auf Ihrer eigenen
          Infrastruktur. Inhalte werden nicht an uns übermittelt; wir haben keinen Zugriff.</li>
        <li><strong className="[color:var(--mk-text)]">Gehostete EU-Cloud:</strong> Wir verarbeiten Inhalte
          ausschließlich zur Erbringung des Dienstes — niemals zum Training von KI-Modellen.</li>
      </ul>

      <H2>3. Betrieb der Website</H2>
      <p>
        Beim Aufruf verarbeitet der Hosting-Dienstleister technisch notwendige Server-Logdaten
        (IP-Adresse, Zeitpunkt, abgerufene Ressource, User-Agent) zur Auslieferung und
        Absicherung — berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO). Es werden keine
        Marketing-/Tracking-Cookies ohne Einwilligung gesetzt.
      </p>

      <H2>4. Konto, Authentifizierung, Abrechnung</H2>
      <p>
        Zur Nutzung verarbeiten wir Bestandsdaten: E-Mail, Name, ein nicht umkehrbar gehashtes
        Passwort (scrypt), Empfehlungscode — zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
        Login-/Registrierungsversuche werden zur Missbrauchsabwehr ratenbegrenzt (Art. 6 Abs. 1
        lit. f DSGVO). Kostenpflichtige Pläne werden über einen Zahlungsdienstleister abgerechnet.
      </p>

      <H2>5. Inhalte und Mandantendaten — Auftragsverarbeitung</H2>
      <p>
        Soweit Sie personenbezogene Daten Ihrer Mandanten/Kunden einstellen, sind{" "}
        <strong className="[color:var(--mk-text)]">Sie der Verantwortliche</strong> und wir handeln als{" "}
        <strong className="[color:var(--mk-text)]">Auftragsverarbeiter</strong> (Art. 28 DSGVO). Vor einer
        solchen Nutzung ist ein AVV abzuschließen (Vorlage wird bereitgestellt).
        Berufsgeheimnisträger (§ 203 StGB) beachten zusätzlich die Anforderungen an mitwirkende
        Personen — hierfür empfehlen wir Self-Hosting oder die EU-Cloud mit gesonderter
        Verschwiegenheitsverpflichtung.
      </p>

      <H2>6. KI-Funktionen</H2>
      <p>
        Für Synthese- und Agentenfunktionen werden relevante Inhaltsausschnitte an LLM-/Embedding-
        Anbieter übermittelt, die weisungsgebunden verarbeiten und die Daten nicht zum Training
        verwenden (Art. 6 Abs. 1 lit. b DSGVO bzw. AVV). Beim Self-Hosting wählen Sie Anbieter
        und Modelle frei oder betreiben ein lokales Modell.
      </p>

      <H2>7. Auftragsverarbeiter und Empfänger</H2>
      <p>
        Je nach Konfiguration können folgende Kategorien eingebunden sein (alle mit AVV;
        Drittland-Transfers nur auf Basis von EU-Standardvertragsklauseln, Art. 46 DSGVO):
      </p>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        <li>Hosting/Infrastruktur (Web-App und/oder Engine), vorrangig EU-Rechenzentren</li>
        <li>LLM-Anbieter (Antworten/Agenten) und Embedding-Anbieter (Suche)</li>
        <li>Zahlungsdienstleister für kostenpflichtige Pläne</li>
        <li>E-Mail-Versanddienst für transaktionale Nachrichten (Fristen-Digest, Passwort-Reset)</li>
        <li>Optional: Dienst zur verteilten Ratenbegrenzung</li>
      </ul>
      <p className="mt-2">Vor Launch konkret benennen: [Anbieter mit Sitzland und Transfergrundlage].</p>

      <H2>8. Speicherdauer</H2>
      <p>
        Kontodaten für die Vertragsdauer; Löschung nach Kündigung, soweit keine
        Aufbewahrungspflichten (§ 147 AO, § 257 HGB) entgegenstehen. Inhalte werden auf Ihre
        Weisung bzw. mit Vertragsende gelöscht. Server-Logs nach [z. B. 14 Tagen].
      </p>

      <H2>9. Ihre Rechte</H2>
      <p>
        Sie haben Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO).
        Einen vollständigen Export Ihrer Konto- und Brain-Daten als JSON können Sie selbst über{" "}
        <span className="[color:var(--mk-text)]">Einstellungen → Account → Daten exportieren</span> auslösen.
        Es besteht ein Beschwerderecht bei einer Aufsichtsbehörde.
      </p>

      <H2>10. Änderungen</H2>
      <p>Maßgeblich ist die jeweils auf dieser Seite veröffentlichte Fassung.</p>

      <LegalLinks home={home} exclude="privacy" />
    </Shell>
  );
}

export function TermsContent({ home }: { home: string }) {
  return (
    <Shell home={home} title="Allgemeine Geschäftsbedingungen" subtitle="Stand: Juni 2026 · gilt für den gehosteten Sigmabrain-Dienst">
      <DraftBanner>
        Entwurf — vor Launch anwaltlich zu prüfen, insbesondere Haftungsbegrenzung, Gerichtsstand
        und das Zusammenspiel mit AVV und Berufsgeheimnis. Felder in [eckigen Klammern] füllen.
      </DraftBanner>

      <H2>§ 1 Geltungsbereich, Vertragspartner</H2>
      <p>
        (1) Diese AGB gelten für die Nutzung des gehosteten Sigmabrain-Dienstes (&bdquo;Dienst&ldquo;)
        zwischen [Firmenname] (&bdquo;Anbieter&ldquo;) und dem Kunden. (2) Das Angebot richtet sich
        ausschließlich an Unternehmer i. S. d. § 14 BGB, juristische Personen des öffentlichen
        Rechts und öffentlich-rechtliche Sondervermögen (B2B). (3) Abweichende Bedingungen des
        Kunden gelten nur bei ausdrücklicher schriftlicher Zustimmung.
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
        Leistungsbeschreibung (Plan-Features, Fair-Use-Grenzen) bereit. (2) Geschuldet ist eine
        nach dem Stand der Technik übliche Verfügbarkeit, keine ununterbrochene Erreichbarkeit;
        Wartung und höhere Gewalt bleiben vorbehalten. (3) Funktionen können fortentwickelt werden,
        solange der vertragliche Kernnutzen erhalten bleibt.
      </p>

      <H2>§ 4 Preise, Zahlung, Laufzeit</H2>
      <p>
        (1) Es gelten die auf der <Link href={`${home === "/" ? "" : home}/pricing`} className="text-violet-400 hover:underline">Preisseite</Link>{" "}
        ausgewiesenen Preise zzgl. USt. (2) Abrechnung über den Zahlungsdienstleister im Voraus.
        (3) Der Vertrag verlängert sich um den Abrechnungszeitraum, sofern nicht zu dessen Ende
        gekündigt. (4) Up-/Downgrades werden zum nächsten Abrechnungszeitraum wirksam.
      </p>

      <H2>§ 5 Pflichten des Kunden</H2>
      <p>
        (1) Zugangsdaten geheim halten, Konten angemessen absichern. (2) Nur Inhalte einstellen,
        zu deren Verarbeitung der Kunde berechtigt ist. (3) Der Dienst erbringt{" "}
        <strong className="[color:var(--mk-text)]">keine Rechts-, Steuer- oder sonstige Beratung</strong>; er
        ist ein Hilfsmittel zur Organisation und Synthese eigener Unterlagen. Die fachliche und
        berufsrechtliche Verantwortung (inkl. Fristen- und Kollisionskontrolle) verbleibt beim Kunden.
      </p>

      <H2>§ 6 Datenschutz und Verschwiegenheit</H2>
      <p>
        (1) Bei Verarbeitung personenbezogener Daten Dritter schließen die Parteien einen AVV
        (Art. 28 DSGVO), der diesen AGB im Konfliktfall vorgeht. (2) Für Berufsgeheimnisträger gilt
        eine gesonderte Verschwiegenheitsverpflichtung (§ 203 Abs. 4 StGB). (3) Keine Nutzung von
        Kundeninhalten zum KI-Training. (4) Bei Vertragsende kann der Kunde seine Daten selbst
        exportieren; danach Löschung nach Maßgabe der Datenschutzerklärung.
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
        unberührt. [Optionale betragsmäßige Begrenzung anwaltlich prüfen.]
      </p>

      <H2>§ 9 Partnerprogramm</H2>
      <p>Für das Empfehlungs-/Partnerprogramm gelten ergänzend die gesonderten Partnerbedingungen.</p>

      <H2>§ 10 Schlussbestimmungen</H2>
      <p>
        (1) Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. (2) Ausschließlicher
        Gerichtsstand für Kaufleute ist [Sitz des Anbieters]. (3) Salvatorische Klausel. (4)
        Änderungen werden mit angemessener Frist mitgeteilt und gelten als angenommen, wenn der
        Kunde nicht widerspricht; auf die Bedeutung des Schweigens wird gesondert hingewiesen.
      </p>

      <LegalLinks home={home} exclude="terms" />
    </Shell>
  );
}
