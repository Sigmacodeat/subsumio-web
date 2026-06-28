import Link from "next/link";
import type { Lang } from "@/content/site";

// Bilingual legal content (EN + DE) — used by /privacy, /terms, /imprint
// AND the /en/* routes. `home` sets the back-link per language path.
// `lang` selects the language version. Drafts: professionally complete,
// but have a lawyer review before launch.

const _deLegal = {
  backLink: "← Subsumio",
  seeAlso: "Siehe auch:",
  privacy: "Datenschutz",
  terms: "AGB",
  imprint: "Impressum",
  draftNotice:
    "Entwurf — fachlich vollständig, vor Launch anwaltlich final prüfen. Felder in [eckigen Klammern] ausfüllen.",
  imprintTitle: "Impressum",
  imprintSubtitle: "Angaben gemäß § 5 DDG (DE) bzw. § 5 ECG (AT), Art. 3 UWG (CH)",
  privacyTitle: "Datenschutzerklärung",
  privacySubtitle: "Stand: Juni 2026",
  termsTitle: "Allgemeine Geschäftsbedingungen",
  termsSubtitle: "Stand: Juni 2026 · gilt für den gehosteten Subsumio-Dienst",
} as const;

const T = {
  en: {
    backLink: "← Subsumio",
    seeAlso: "See also:",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    imprint: "Imprint",
    draftNotice:
      "Draft — professionally complete, but have a lawyer review before launch. Fill in fields marked [brackets].",
    imprintTitle: "Imprint",
    imprintSubtitle: "Provider information per § 5 DDG (DE), § 5 ECG (AT), Art. 3 UWG (CH)",
    privacyTitle: "Privacy Policy",
    privacySubtitle: "As of June 2026",
    termsTitle: "Terms of Service",
    termsSubtitle: "As of June 2026 · applies to the hosted Subsumio service",
  },
  de: _deLegal,
  at: _deLegal,
  ch: _deLegal,
} as const;

function Shell({
  home,
  title,
  subtitle,
  lang,
  children,
}: {
  home: string;
  title: string;
  subtitle: string;
  lang: Lang;
  children: React.ReactNode;
}) {
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
  return (
    <div data-tone="light" className="min-h-screen px-6 py-16 [background:var(--mk-bg)]">
      <div className="mx-auto max-w-2xl">
        <Link href={home} className="brand-text text-sm hover:underline">
          {t.backLink}
        </Link>
        <h1 className="mt-8 mb-2 text-3xl font-black [color:var(--mk-text)]">{title}</h1>
        <p className="mb-6 text-xs [color:var(--mk-text-subtle)]">{subtitle}</p>
        <div className="space-y-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
          {children}
        </div>
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-lg font-semibold [color:var(--mk-text)]">{children}</h2>;
}

function DraftBanner({ lang: _lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-300">
      {children}
    </div>
  );
}

function LegalLinks({
  home,
  exclude,
  lang,
}: {
  home: string;
  exclude: "privacy" | "terms" | "imprint";
  lang: Lang;
}) {
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
  const links = [
    { key: "privacy" as const, href: `${home === "/" ? "" : home}/privacy`, label: t.privacy },
    { key: "terms" as const, href: `${home === "/" ? "" : home}/terms`, label: t.terms },
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
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
  if (lang === "en") {
    return (
      <Shell home={home} lang={lang} title={t.imprintTitle} subtitle={t.imprintSubtitle}>
        <DraftBanner lang={lang}>{t.draftNotice}</DraftBanner>
        <H2>Operator</H2>
        <p>
          [Company name]
          <br />
          [Street, number]
          <br />
          [ZIP, city, country]
        </p>
        <H2>Contact</H2>
        <p>
          Email: hello@subsum.eu
          <br />
          [Phone]
        </p>
        <H2>Authorized representatives</H2>
        <p>[Name of authorized representative]</p>
        <H2>Commercial register</H2>
        <p>[Commercial register, registration number, registry court — if applicable]</p>
        <H2>VAT identification number</H2>
        <p>[VAT ID per § 27a UStG (DE) / § 48 UStG (AT) / MWSTG (CH) — if applicable]</p>
        <H2>Consumer dispute resolution</H2>
        <p>
          We are not willing or obliged to participate in dispute resolution proceedings before a
          consumer arbitration board (this offering is directed at businesses / B2B).
        </p>
        <H2>Note on DACH jurisdictions</H2>
        <p>
          This imprint is provided per § 5 DDG (Germany). For Austria, provider information per § 5
          ECG applies; for Switzerland, no statutory imprint obligation exists, but provider
          identification per Art. 3 UWG is provided voluntarily.
        </p>
        <LegalLinks home={home} exclude="imprint" lang={lang} />
      </Shell>
    );
  }
  return (
    <Shell home={home} lang={lang} title={t.imprintTitle} subtitle={t.imprintSubtitle}>
      <DraftBanner lang={lang}>{t.draftNotice}</DraftBanner>
      <H2>Betreiber</H2>
      <p>
        [Firmenname]
        <br />
        [Straße, Hausnummer]
        <br />
        [PLZ, Ort, Land]
      </p>
      <H2>Kontakt</H2>
      <p>
        E-Mail: hello@subsum.eu
        <br />
        [Telefon]
      </p>
      <H2>Vertretungsberechtigt</H2>
      <p>[Name der vertretungsberechtigten Person]</p>
      <H2>Registereintrag</H2>
      <p>[Handelsregister, Registernummer, Registergericht — falls vorhanden]</p>
      <H2>Umsatzsteuer-ID</H2>
      <p>[USt-IdNr. gemäß § 27a UStG (DE) / § 48 UStG (AT) / MWSTG (CH) — falls vorhanden]</p>
      <H2>Verbraucherstreitbeilegung</H2>
      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen (Angebot richtet sich an Unternehmer).
      </p>
      <H2>Hinweis zu DACH-Jurisdiktionen</H2>
      <p>
        Dieses Impressum wird gemäß § 5 DDG (Deutschland) bereitgestellt. Für Österreich gilt die
        Anbieterkennzeichnung nach § 5 ECG; für die Schweiz besteht keine gesetzliche
        Impressumspflicht, jedoch wird die Anbieterkennzeichnung nach Art. 3 UWG freiwillig
        bereitgestellt.
      </p>
      <LegalLinks home={home} exclude="imprint" lang={lang} />
    </Shell>
  );
}

export function PrivacyContent({ home, lang = "de" }: { home: string; lang?: Lang }) {
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
  if (lang === "en") {
    return (
      <Shell home={home} lang={lang} title={t.privacyTitle} subtitle={t.privacySubtitle}>
        <DraftBanner lang={lang}>{t.draftNotice}</DraftBanner>

        <H2>1. Controller</H2>
        <p>
          Responsible for data processing on this website and the hosted Subsumio service
          (hereinafter &ldquo;Service&rdquo;) is:
        </p>
        <p className="mt-2">
          [Company name]
          <br />
          [Street, number]
          <br />
          [ZIP, city, country]
          <br />
          Email: hello@subsum.eu
        </p>
        <p className="mt-2">
          Data Protection Officer (if appointed): [Name, contact]. Appointment is required e.g. when
          processing special categories of personal data on a large scale (Art. 37 GDPR; DE: § 38
          BDSG; AT: § 9 DSG; CH: n/a — DSG does not require a DPO).
        </p>

        <H2>2. Principle: data minimisation and operating models</H2>
        <p>
          Subsumio is designed as a data-minimising product. There are two operating models with
          different data-protection roles:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong className="[color:var(--mk-text)]">Self-hosting:</strong> The engine runs on
            your own infrastructure. Content is never transmitted to us; we have no access.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Hosted EU cloud:</strong> We process content
            exclusively to provide the Service — never to train AI models.
          </li>
        </ul>

        <H2>3. Website operation</H2>
        <p>
          When you visit the site, the hosting provider processes technically necessary server log
          data (IP address, timestamp, requested resource, user agent) for delivery and security —
          legitimate interest (Art. 6(1)(f) GDPR). No marketing/tracking cookies are set without
          consent.
        </p>

        <H2>4. Account, authentication, billing</H2>
        <p>
          To use the Service, we process account data: email, name, an irreversibly hashed password
          (scrypt), referral code — for contract performance (Art. 6(1)(b) GDPR). Login/registration
          attempts are rate-limited for abuse prevention (Art. 6(1)(f) GDPR). Paid plans are billed
          via a payment provider.
        </p>

        <H2>5. Content and client data — processing agreement</H2>
        <p>
          Where you upload personal data of your clients/customers,{" "}
          <strong className="[color:var(--mk-text)]">you are the Controller</strong> and we act as{" "}
          <strong className="[color:var(--mk-text)]">Processor</strong> (Art. 28 GDPR). A DPA must
          be concluded before such use (template provided). Professionals bound by secrecy (DE: §
          203 StGB; AT: § 9 RAO; CH: Art. 321 StGB) must additionally ensure compliant involvement
          of supporting persons — we recommend self-hosting or the EU cloud with a separate
          confidentiality agreement.
        </p>

        <H2>6. AI functions</H2>
        <p>
          For synthesis and agent functions, relevant content excerpts are transmitted to
          LLM/embedding providers who process under instruction and do not use the data for training
          (Art. 6(1)(b) GDPR or DPA). With self-hosting, you choose providers and models freely or
          run a local model.
        </p>

        <H2>7. Processors and recipients</H2>
        <p>
          Depending on configuration, the following categories may be involved (all with DPAs;
          third-country transfers only on the basis of EU Standard Contractual Clauses, Art. 46
          GDPR):
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Hosting/infrastructure (web app and/or engine), primarily EU data centres</li>
          <li>LLM providers (answers/agents) and embedding providers (search)</li>
          <li>Payment provider for paid plans</li>
          <li>
            Email delivery service for transactional messages (deadline digest, password reset)
          </li>
          <li>Optional: distributed rate-limiting service</li>
        </ul>
        <p className="mt-2">
          Before launch, specify: [providers with seat country and transfer basis].
        </p>

        <H2>8. Retention period</H2>
        <p>
          Account data for the duration of the contract; deletion after termination, subject to
          retention obligations (DE: § 147 AO, § 257 HGB; AT: § 132 BAO; CH: OR 962). Content is
          deleted on your instruction or at contract end. Server logs after [e.g. 14 days].
        </p>

        <H2>9. Your rights</H2>
        <p>
          You have rights to access (Art. 15), rectification (Art. 16), erasure (Art. 17),
          restriction (Art. 18), data portability (Art. 20) and objection (Art. 21 GDPR). You can
          trigger a full export of your account and brain data as JSON via{" "}
          <span className="[color:var(--mk-text)]">Settings → Account → Export data</span>. You have
          the right to lodge a complaint with a supervisory authority.
        </p>

        <H2>10. Changes</H2>
        <p>The version published on this page at any given time is authoritative.</p>

        <LegalLinks home={home} exclude="privacy" lang={lang} />
      </Shell>
    );
  }
  return (
    <Shell home={home} lang={lang} title={t.privacyTitle} subtitle={t.privacySubtitle}>
      <DraftBanner lang={lang}>{t.draftNotice}</DraftBanner>

      <H2>1. Verantwortlicher</H2>
      <p>
        Verantwortlich für die Datenverarbeitung auf dieser Website und im gehosteten
        Subsumio-Dienst (im Folgenden &bdquo;Dienst&ldquo;) ist:
      </p>
      <p className="mt-2">
        [Firmenname]
        <br />
        [Straße, Hausnummer]
        <br />
        [PLZ, Ort, Land]
        <br />
        E-Mail: hello@subsum.eu
      </p>
      <p className="mt-2">
        Datenschutzbeauftragte/r (sofern bestellt): [Name, Kontakt]. Eine Bestellpflicht besteht u.
        a. bei umfangreicher Verarbeitung besonderer Kategorien personenbezogener Daten (Art. 37
        DSGVO i. V. m. § 38 BDSG (DE) / § 9 DSG (AT); CH: keine DPO-Pflicht nach DSG).
      </p>

      <H2>2. Grundsatz: Datensparsamkeit und Betriebsmodelle</H2>
      <p>
        Subsumio ist als datensparsames Produkt konzipiert. Es gibt zwei Betriebsmodelle mit
        unterschiedlichen datenschutzrechtlichen Rollen:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong className="[color:var(--mk-text)]">Self-Hosting:</strong> Die Engine läuft auf
          Ihrer eigenen Infrastruktur. Inhalte werden nicht an uns übermittelt; wir haben keinen
          Zugriff.
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
        Zur Nutzung verarbeiten wir Bestandsdaten: E-Mail, Name, ein nicht umkehrbar gehashtes
        Passwort (scrypt), Empfehlungscode — zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
        Login-/Registrierungsversuche werden zur Missbrauchsabwehr ratenbegrenzt (Art. 6 Abs. 1 lit.
        f DSGVO). Kostenpflichtige Pläne werden über einen Zahlungsdienstleister abgerechnet.
      </p>

      <H2>5. Inhalte und Mandantendaten — Auftragsverarbeitung</H2>
      <p>
        Soweit Sie personenbezogene Daten Ihrer Mandanten/Kunden einstellen, sind{" "}
        <strong className="[color:var(--mk-text)]">Sie der Verantwortliche</strong> und wir handeln
        als <strong className="[color:var(--mk-text)]">Auftragsverarbeiter</strong> (Art. 28 DSGVO).
        Vor einer solchen Nutzung ist ein AVV abzuschließen (Vorlage wird bereitgestellt).
        Berufsgeheimnisträger (DE: § 203 StGB; AT: § 9 RAO; CH: Art. 321 StGB) beachten zusätzlich
        die Anforderungen an mitwirkende Personen — hierfür empfehlen wir Self-Hosting oder die
        EU-Cloud mit gesonderter Verschwiegenheitsverpflichtung.
      </p>

      <H2>6. KI-Funktionen</H2>
      <p>
        Für Synthese- und Agentenfunktionen werden relevante Inhaltsausschnitte an LLM-/Embedding-
        Anbieter übermittelt, die weisungsgebunden verarbeiten und die Daten nicht zum Training
        verwenden (Art. 6 Abs. 1 lit. b DSGVO bzw. AVV). Beim Self-Hosting wählen Sie Anbieter und
        Modelle frei oder betreiben ein lokales Modell.
      </p>

      <H2>7. Auftragsverarbeiter und Empfänger</H2>
      <p>
        Je nach Konfiguration können folgende Kategorien eingebunden sein (alle mit AVV;
        Drittland-Transfers nur auf Basis von EU-Standardvertragsklauseln, Art. 46 DSGVO):
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Hosting/Infrastruktur (Web-App und/oder Engine), vorrangig EU-Rechenzentren</li>
        <li>LLM-Anbieter (Antworten/Agenten) und Embedding-Anbieter (Suche)</li>
        <li>Zahlungsdienstleister für kostenpflichtige Pläne</li>
        <li>
          E-Mail-Versanddienst für transaktionale Nachrichten (Fristen-Digest, Passwort-Reset)
        </li>
        <li>Optional: Dienst zur verteilten Ratenbegrenzung</li>
      </ul>
      <p className="mt-2">
        Vor Launch konkret benennen: [Anbieter mit Sitzland und Transfergrundlage].
      </p>

      <H2>8. Speicherdauer</H2>
      <p>
        Kontodaten für die Vertragsdauer; Löschung nach Kündigung, soweit keine
        Aufbewahrungspflichten (DE: § 147 AO, § 257 HGB; AT: § 132 BAO; CH: OR 962) entgegenstehen.
        Inhalte werden auf Ihre Weisung bzw. mit Vertragsende gelöscht. Server-Logs nach [z. B. 14
        Tagen].
      </p>

      <H2>9. Ihre Rechte</H2>
      <p>
        Sie haben Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO).
        Einen vollständigen Export Ihrer Konto- und Brain-Daten als JSON können Sie selbst über{" "}
        <span className="[color:var(--mk-text)]">Einstellungen → Account → Daten exportieren</span>{" "}
        auslösen. Es besteht ein Beschwerderecht bei einer Aufsichtsbehörde.
      </p>

      <H2>10. Änderungen</H2>
      <p>Maßgeblich ist die jeweils auf dieser Seite veröffentlichte Fassung.</p>

      <LegalLinks home={home} exclude="privacy" lang={lang} />
    </Shell>
  );
}

export function TermsContent({ home, lang = "de" }: { home: string; lang?: Lang }) {
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
  if (lang === "en") {
    return (
      <Shell home={home} lang={lang} title={t.termsTitle} subtitle={t.termsSubtitle}>
        <DraftBanner lang={lang}>{t.draftNotice}</DraftBanner>

        <H2>§ 1 Scope, contracting parties</H2>
        <p>
          (1) These Terms apply to the use of the hosted Subsumio service (&ldquo;Service&rdquo;)
          between [Company name] (&ldquo;Provider&rdquo;) and the Customer. (2) The offering is
          directed exclusively at businesses within the meaning of § 14 BGB (DE) / § 1 UGB (AT) / OR
          944 (CH), legal entities under public law and public-law special funds (B2B). (3)
          Deviating terms of the Customer apply only with express written consent.
        </p>

        <H2>§ 2 Contract formation</H2>
        <p>
          The contract is formed upon registration and plan selection, for paid plans upon
          completion of the ordering process. The open-source engine is subject to its separate
          open-source licence; these Terms govern exclusively the hosted service.
        </p>

        <H2>§ 3 Service description</H2>
        <p>
          (1) The Provider offers the Service according to the service description valid at contract
          formation (plan features, fair-use limits). (2) The Service is provided with standard
          industry availability, not uninterrupted access; maintenance and force majeure are
          reserved. (3) Features may evolve as long as the core contractual utility is preserved.
        </p>

        <H2>§ 4 Prices, payment, term</H2>
        <p>
          (1) The prices shown on the{" "}
          <Link href={`${home === "/" ? "" : home}/pricing`} className="brand-text hover:underline">
            pricing page
          </Link>{" "}
          apply, plus VAT. (2) Billing via the payment provider in advance. (3) The contract renews
          for the billing period unless terminated at its end. (4) Up/downgrades take effect at the
          next billing period.
        </p>

        <H2>§ 5 Customer obligations</H2>
        <p>
          (1) Keep access credentials secret, secure accounts appropriately. (2) Upload only content
          you are authorised to process. (3) The Service does{" "}
          <strong className="[color:var(--mk-text)]">not provide legal, tax or other advice</strong>
          ; it is a tool for organising and synthesising your own documents. Professional and
          regulatory responsibility (including deadline and conflict checks) remains with the
          Customer.
        </p>

        <H2>§ 6 Data protection and confidentiality</H2>
        <p>
          (1) When processing personal data of third parties, the parties conclude a DPA (Art. 28
          GDPR), which takes precedence over these Terms in case of conflict. (2) For professionals
          bound by secrecy (DE: § 203(4) StGB; AT: § 9 RAO; CH: Art. 321 StGB), a separate
          confidentiality agreement applies. (3) No use of customer content for AI training. (4) At
          contract end, the Customer can export their data; thereafter deletion per the Privacy
          Policy.
        </p>

        <H2>§ 7 AI-specific notices</H2>
        <p>
          Answers, citations and agent results are machine-generated aids and may be incorrect.
          Source references serve verification; substantive review by the Customer before use (e.g.
          in briefs) is required.
        </p>

        <H2>§ 8 Liability</H2>
        <p>
          (1) Unlimited liability for intent and gross negligence and for damages from injury to
          life, body or health. (2) For simple negligence only in case of breach of a cardinal
          obligation, limited to the typically foreseeable damage. (3) Otherwise liability is
          excluded. (4) The Product Liability Act remains unaffected. [Optional monetary limit to be
          reviewed by a lawyer.]
        </p>

        <H2>§ 9 Partner programme</H2>
        <p>The separate partner terms apply additionally to the referral/partner programme.</p>

        <H2>§ 10 Final provisions</H2>
        <p>
          (1) German law applies, excluding the UN Convention on Contracts for the International
          Sale of Goods (CISG). (2) Exclusive venue for merchants is [Provider&apos;s seat]. (3)
          Severability clause. (4) Changes are communicated with reasonable notice and deemed
          accepted if the Customer does not object; the significance of silence is separately
          pointed out.
        </p>

        <LegalLinks home={home} exclude="terms" lang={lang} />
      </Shell>
    );
  }
  return (
    <Shell home={home} lang={lang} title={t.termsTitle} subtitle={t.termsSubtitle}>
      <DraftBanner lang={lang}>{t.draftNotice}</DraftBanner>

      <H2>§ 1 Geltungsbereich, Vertragspartner</H2>
      <p>
        (1) Diese AGB gelten für die Nutzung des gehosteten Subsumio-Dienstes (&bdquo;Dienst&ldquo;)
        zwischen [Firmenname] (&bdquo;Anbieter&ldquo;) und dem Kunden. (2) Das Angebot richtet sich
        ausschließlich an Unternehmer i. S. d. § 14 BGB (DE) / § 1 UGB (AT) / OR 944 (CH),
        juristische Personen des öffentlichen Rechts und öffentlich-rechtliche Sondervermögen (B2B).
        (3) Abweichende Bedingungen des Kunden gelten nur bei ausdrücklicher schriftlicher
        Zustimmung.
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
        28 DSGVO), der diesen AGB im Konfliktfall vorgeht. (2) Für Berufsgeheimnisträger gilt eine
        gesonderte Verschwiegenheitsverpflichtung (DE: § 203 Abs. 4 StGB; AT: § 9 RAO; CH: Art. 321
        StGB). (3) Keine Nutzung von Kundeninhalten zum KI-Training. (4) Bei Vertragsende kann der
        Kunde seine Daten selbst exportieren; danach Löschung nach Maßgabe der Datenschutzerklärung.
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
      <p>
        Für das Empfehlungs-/Partnerprogramm gelten ergänzend die gesonderten Partnerbedingungen.
      </p>

      <H2>§ 10 Schlussbestimmungen</H2>
      <p>
        (1) Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. (2) Ausschließlicher
        Gerichtsstand für Kaufleute ist [Sitz des Anbieters]. (3) Salvatorische Klausel. (4)
        Änderungen werden mit angemessener Frist mitgeteilt und gelten als angenommen, wenn der
        Kunde nicht widerspricht; auf die Bedeutung des Schweigens wird gesondert hingewiesen.
      </p>

      <LegalLinks home={home} exclude="terms" lang={lang} />
    </Shell>
  );
}
