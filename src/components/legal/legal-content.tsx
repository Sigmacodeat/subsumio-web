import Link from "next/link";
import type { Lang } from "@/content/site";
import { H1_CLASS, H3_CLASS, Section } from "@/components/marketing/chrome";

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
  dpa: "AVV",
  draftNotice: "Entwurf — fachlich vollständig, vor Launch anwaltlich final prüfen.",
  imprintTitle: "Impressum",
  imprintSubtitle: "Angaben gemäß § 5 DDG (DE) bzw. § 5 ECG (AT), Art. 3 UWG (CH)",
  privacyTitle: "Datenschutzerklärung",
  privacySubtitle: "Stand: Juni 2026",
  termsTitle: "Allgemeine Geschäftsbedingungen",
  termsSubtitle: "Stand: Juni 2026 · gilt für den gehosteten Subsumio-Dienst",
  dpaTitle: "Auftragsverarbeitungsvertrag (AVV)",
  dpaSubtitle:
    "Stand: Juni 2026 · Art. 28 DSGVO — Vorlage für Kunden der gehosteten Subsumio-Cloud",
} as const;

const T = {
  en: {
    backLink: "← Subsumio",
    seeAlso: "See also:",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    imprint: "Imprint",
    dpa: "DPA",
    draftNotice: "Draft — professionally complete, but have a lawyer review before launch.",
    imprintTitle: "Imprint",
    imprintSubtitle: "Provider information per § 5 DDG (DE), § 5 ECG (AT), Art. 3 UWG (CH)",
    privacyTitle: "Privacy Policy",
    privacySubtitle: "As of June 2026",
    termsTitle: "Terms of Service",
    termsSubtitle: "As of June 2026 · applies to the hosted Subsumio service",
    dpaTitle: "Data Processing Agreement (DPA)",
    dpaSubtitle:
      "As of June 2026 · Art. 28 GDPR — template for customers of the hosted Subsumio cloud",
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
  lang,
}: {
  home: string;
  exclude: "privacy" | "terms" | "imprint" | "dpa";
  lang: Lang;
}) {
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
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
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
  if (lang === "en") {
    return (
      <Shell home={home} lang={lang} title={t.imprintTitle} subtitle={t.imprintSubtitle}>
        <H2>Operator</H2>
        <p>
          RCIID — Rocket Chain Investigation &amp; Intelligence Division
          <br />
          Hauslabgasse 42/3/21
          <br />
          1050 Vienna, Austria
        </p>
        <H2>Contact</H2>
        <p>
          Email: help@rciid.at
          <br />
          Website: www.rciid.at
        </p>
        <H2>Authorized representatives</H2>
        <p>Ismet Mesic — Founder &amp; President</p>
        <H2>Commercial register</H2>
        <p>
          Registered association (Verein) — Zentralvereinsregister-Nummer: ZVR 1266935562.
          Registergericht: Bezirkshauptmannschaft für den 1. und 5. Bezirk in Wien.
        </p>
        <H2>VAT identification number</H2>
        <p>
          ATU-Nummer gemäß § 48 UStG: wird bei Aufnahme umsatzsteuerpflichtiger Tätigkeit
          zugewiesen.
        </p>
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
        Eingetragener Verein (Verein) — Zentralvereinsregister-Nummer: ZVR 1266935562.
        Registerbehörde: Bezirkshauptmannschaft für den 1. und 5. Bezirk in Wien.
      </p>
      <H2>Umsatzsteuer-ID</H2>
      <p>
        ATU-Nummer gemäß § 48 UStG: wird bei Aufnahme umsatzsteuerpflichtiger Tätigkeit zugewiesen.
      </p>
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
        <H2>1. Controller</H2>
        <p>
          Responsible for data processing on this website and the hosted Subsumio service
          (hereinafter &ldquo;Service&rdquo;) is:
        </p>
        <p className="mt-2">
          RCIID — Rocket Chain Investigation &amp; Intelligence Division
          <br />
          Hauslabgasse 42/3/2
          <br />
          1050 Vienna, Austria
          <br />
          Email: help@rciid.at
        </p>
        <p className="mt-2">
          No Data Protection Officer has been appointed at this time. Appointment is required e.g.
          when processing special categories of personal data on a large scale (Art. 37 GDPR; DE: §
          38 BDSG; AT: § 9 DSG; CH: n/a — DSG does not require a DPO). Privacy inquiries can be
          directed to help@rciid.at.
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
          Current providers: Hosting via EU data centres (Hetzner, DE); LLM via OpenRouter (US, EU
          Standard Contractual Clauses); Embeddings via OpenRouter (US, SCCs); Payment via Stripe
          (US, SCCs); Email via Resend (US, SCCs). All processors are bound by DPAs.
        </p>

        <H2>8. Retention period</H2>
        <p>
          Account data for the duration of the contract; deletion after termination, subject to
          retention obligations (DE: § 147 AO, § 257 HGB; AT: § 132 BAO; CH: OR 962). Content is
          deleted on your instruction or at contract end. Server logs are retained for 14 days.
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
        i. V. m. § 38 BDSG (DE) / § 9 DSG (AT); CH: keine DPO-Pflicht nach DSG).
        Datenschutz-Anfragen richten Sie bitte an help@rciid.at.
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
        Soweit du personenbezogene Daten deiner Mandanten/Kunden einstellst, bist{" "}
        <strong className="[color:var(--mk-text)]">du der Verantwortliche</strong> und wir handeln
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
        verwenden (Art. 6 Abs. 1 lit. b DSGVO bzw. AVV). Beim Self-Hosting wählst du Anbieter und
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
        Aktuelle Anbieter: Hosting über EU-Rechenzentren (Hetzner, DE); LLM über OpenRouter (US,
        EU-Standardvertragsklauseln); Embeddings über OpenRouter (US, SCCs); Zahlung über Stripe
        (US, SCCs); E-Mail über Resend (US, SCCs). Alle Auftragsverarbeiter sind durch AVV gebunden.
      </p>

      <H2>8. Speicherdauer</H2>
      <p>
        Kontodaten für die Vertragsdauer; Löschung nach Kündigung, soweit keine
        Aufbewahrungspflichten (DE: § 147 AO, § 257 HGB; AT: § 132 BAO; CH: OR 962) entgegenstehen.
        Inhalte werden auf deine Weisung bzw. mit Vertragsende gelöscht. Server-Logs werden 14 Tage
        aufbewahrt.
      </p>

      <H2>9. Deine Rechte</H2>
      <p>
        Du hast Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO).
        Einen vollständigen Export deiner Konto- und Brain-Daten als JSON kannst du selbst über{" "}
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
        <H2>§ 1 Scope, contracting parties</H2>
        <p>
          (1) These Terms apply to the use of the hosted Subsumio service (&ldquo;Service&rdquo;)
          between RCIID — Rocket Chain Investigation &amp; Intelligence Division
          (&ldquo;Provider&rdquo;) and the Customer. (2) The offering is directed exclusively at
          businesses within the meaning of § 14 BGB (DE) / § 1 UGB (AT) / OR 944 (CH), legal
          entities under public law and public-law special funds (B2B). (3) Deviating terms of the
          Customer apply only with express written consent.
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
          excluded. (4) The Product Liability Act remains unaffected.
        </p>

        <H2>§ 9 Partner programme</H2>
        <p>The separate partner terms apply additionally to the referral/partner programme.</p>

        <H2>§ 10 Final provisions</H2>
        <p>
          (1) German law applies, excluding the UN Convention on Contracts for the International
          Sale of Goods (CISG). (2) Exclusive venue for merchants is Vienna, Austria. (3)
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
      <H2>§ 1 Geltungsbereich, Vertragspartner</H2>
      <p>
        (1) Diese AGB gelten für die Nutzung des gehosteten Subsumio-Dienstes (&bdquo;Dienst&ldquo;)
        zwischen RCIID — Rocket Chain Investigation &amp; Intelligence Division
        (&bdquo;Anbieter&ldquo;) und dem Kunden. (2) Das Angebot richtet sich ausschließlich an
        Unternehmer i. S. d. § 14 BGB (DE) / § 1 UGB (AT) / OR 944 (CH), juristische Personen des
        öffentlichen Rechts und öffentlich-rechtliche Sondervermögen (B2B). (3) Abweichende
        Bedingungen des Kunden gelten nur bei ausdrücklicher schriftlicher Zustimmung.
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
        unberührt.
      </p>

      <H2>§ 9 Partnerprogramm</H2>
      <p>
        Für das Empfehlungs-/Partnerprogramm gelten ergänzend die gesonderten Partnerbedingungen.
      </p>

      <H2>§ 10 Schlussbestimmungen</H2>
      <p>
        (1) Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. (2) Ausschließlicher
        Gerichtsstand für Kaufleute ist Wien, Österreich. (3) Salvatorische Klausel. (4) Änderungen
        werden mit angemessener Frist mitgeteilt und gelten als angenommen, wenn der Kunde nicht
        widerspricht; auf die Bedeutung des Schweigens wird gesondert hingewiesen.
      </p>

      <LegalLinks home={home} exclude="terms" lang={lang} />
    </Shell>
  );
}

export function DpaContent({ home, lang = "de" }: { home: string; lang?: Lang }) {
  const t = (T as unknown as Record<string, typeof T.de>)[lang] ?? T.de;
  if (lang === "en") {
    return (
      <Shell home={home} lang={lang} title={t.dpaTitle} subtitle={t.dpaSubtitle}>
        <p className="text-xs [color:var(--mk-text-subtle)]">
          {t.draftNotice} This template implements Art. 28 GDPR. Complete the placeholders, sign
          with the Controller, and return to help@rciid.at before uploading personal data.
        </p>

        <H2>§ 1 Parties</H2>
        <p>
          <strong className="[color:var(--mk-text)]">Controller</strong> (the customer using
          Subsumio to process personal data):
        </p>
        <p className="mt-1">
          [Controller name]
          <br />
          [Address]
          <br />
          [Representative]
          <br />
          [Email]
        </p>
        <p className="mt-2">
          <strong className="[color:var(--mk-text)]">Processor</strong> (the provider of the hosted
          Subsumio service):
        </p>
        <p className="mt-1">
          RCIID — Rocket Chain Investigation &amp; Intelligence Division
          <br />
          Hauslabgasse 42/3/2
          <br />
          1050 Vienna, Austria
          <br />
          Email: help@rciid.at
        </p>

        <H2>§ 2 Subject matter, duration, nature and purpose</H2>
        <p>
          (1) <strong className="[color:var(--mk-text)]">Subject matter:</strong> Provision of the
          hosted Subsumio cloud service for organising, searching and synthesising documents and
          case data.
        </p>
        <p>
          (2) <strong className="[color:var(--mk-text)]">Duration:</strong> For the duration of the
          main service contract (per the Terms of Service), unless terminated earlier.
        </p>
        <p>
          (3) <strong className="[color:var(--mk-text)]">Nature and purpose:</strong> Storage,
          full-text and semantic search, AI-assisted synthesis and agent workflows on documents
          uploaded by the Controller. No use of content for AI model training.
        </p>
        <p>
          (4) <strong className="[color:var(--mk-text)]">Type of personal data:</strong> Account
          data (email, name), and any personal data the Controller uploads within content (e. g.
          case files, client correspondence, invoices).
        </p>
        <p>
          (5) <strong className="[color:var(--mk-text)]">Categories of data subjects:</strong>{" "}
          Clients, opposing parties, witnesses, employees and other persons whose data appears in
          the Controller&rsquo;s documents.
        </p>

        <H2>§ 3 Processor obligations (Art. 28(3) GDPR)</H2>
        <p>The Processor shall:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Process personal data only on documented instructions from the Controller, including
            with regard to transfers to third countries, unless required by EU or member state law.
          </li>
          <li>Ensure that persons authorised to process are bound by confidentiality.</li>
          <li>Maintain appropriate technical and organisational measures (TOMs, § 5).</li>
          <li>Respect the conditions for engaging sub-processors (§ 4).</li>
          <li>Assist the Controller in responding to data subject rights requests.</li>
          <li>
            Assist the Controller in fulfilling its obligations under Arts. 32–36 GDPR (security,
            breach notification, DPIA, prior consultation).
          </li>
          <li>
            Delete or return all personal data after the end of the service, unless retention is
            required by EU or member state law.
          </li>
          <li>
            Make available all information necessary to demonstrate compliance and allow for and
            contribute to audits.
          </li>
        </ul>

        <H2>§ 4 Sub-processors</H2>
        <p>
          (1) The Controller grants general authorisation for the sub-processors listed in the
          Privacy Policy (§ 7). The Processor shall inform the Controller of any intended changes
          concerning the addition or replacement of sub-processors, giving the Controller the
          opportunity to object.
        </p>
        <p>
          (2) Current sub-processors: Hosting (Hetzner, DE/EU); LLM and embedding providers
          (OpenRouter, US — EU Standard Contractual Clauses); Payment (Stripe, US — SCCs); Email
          (Resend, US — SCCs); optional rate-limiting service (Upstash, US — SCCs).
        </p>
        <p>
          (3) Where a sub-processor is outside the EEA, transfers are based on EU Standard
          Contractual Clauses (Art. 46 GDPR) and supplementary measures where required.
        </p>
        <p>(4) The Processor remains fully liable for sub-processors as for its own processing.</p>

        <H2>§ 5 Technical and organisational measures (Art. 32 GDPR)</H2>
        <p>The Processor maintains the following TOMs:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong className="[color:var(--mk-text)]">Encryption:</strong> TLS 1.2+ in transit,
            AES-256 at rest for database and backups.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Access control:</strong> Role-based access
            (RBAC), least-privilege, unique user accounts, MFA available.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Authentication:</strong> Scrypt-hashed
            passwords, session tokens signed with HMAC-SHA-256.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Network security:</strong> Firewall, isolated
            database network, no public DB access.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Logging and monitoring:</strong> Immutable
            audit log with hash chain (tamper-evident), Sentry error monitoring.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Backup:</strong> Daily encrypted backups with
            verify and restore procedures; retention per legal requirements.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Data isolation:</strong> Multi-tenant
            isolation via brain_id; source-level access control prevents cross-tenant data leaks.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Availability:</strong> Health checks,
            auto-restart, Hetzner EU data centres.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Pseudonymisation:</strong> Internal IDs where
            feasible; no use of content for AI training.
          </li>
          <li>
            <strong className="[color:var(--mk-text)]">Incident response:</strong> Documented breach
            notification process within 72 hours to the Controller.
          </li>
        </ul>

        <H2>§ 6 Data subject rights assistance</H2>
        <p>
          The Processor shall assist the Controller in fulfilling its obligation to respond to data
          subject rights requests (access, rectification, erasure, restriction, portability,
          objection). The Controller can export all data via Settings → Account → Export data.
          Deletion requests can be triggered via the GDPR data-deletion endpoint.
        </p>

        <H2>§ 7 Personal data breach</H2>
        <p>
          (1) The Processor shall notify the Controller without undue delay, and in any case within
          48 hours, after becoming aware of a personal data breach.
        </p>
        <p>
          (2) The notification shall describe the nature of the breach, the likely consequences, and
          the measures taken or proposed. The Processor shall assist the Controller in notifying the
          supervisory authority (Art. 33 GDPR) and data subjects (Art. 34 GDPR) where required.
        </p>

        <H2>§ 8 Audit rights</H2>
        <p>
          (1) The Controller has the right to audit the Processor&rsquo;s compliance with this DPA
          and Art. 28 GDPR, upon reasonable notice and during business hours.
        </p>
        <p>
          (2) Audits shall be conducted by the Controller&rsquo;s own staff or by a third party
          bound by confidentiality. The Processor shall provide the necessary information and
          access.
        </p>
        <p>
          (3) The Processor&rsquo;s audit reports, certifications (e. g. ISO 27001 where available),
          and the immutable audit log are available to the Controller on request.
        </p>

        <H2>§ 9 Deletion at end of service</H2>
        <p>
          At the Controller&rsquo;s request, the Processor shall delete all personal data after the
          end of the service contract, unless retention is required by EU or member state law (DE: §
          147 AO, § 257 HGB; AT: § 132 BAO; CH: OR 962). The Controller can trigger a full export
          before deletion. Deletion is logged in the immutable audit trail.
        </p>

        <H2>§ 10 Liability</H2>
        <p>
          Liability under this DPA is governed by the Terms of Service (§ 8), supplemented by Art.
          82 GDPR. The Processor is liable for damages caused by processing in violation of the GDPR
          only where the Processor did not comply with its specific obligations.
        </p>

        <H2>§ 11 Final provisions</H2>
        <p>
          (1) This DPA is part of the main service contract and takes precedence in case of conflict
          regarding data protection. (2) German law applies, excluding the CISG. (3) Exclusive venue
          for merchants is Vienna, Austria. (4) Changes are communicated with reasonable notice.
        </p>

        <LegalLinks home={home} exclude="dpa" lang={lang} />
      </Shell>
    );
  }
  return (
    <Shell home={home} lang={lang} title={t.dpaTitle} subtitle={t.dpaSubtitle}>
      <p className="text-xs [color:var(--mk-text-subtle)]">
        {t.draftNotice} Diese Vorlage implementiert Art. 28 DSGVO. Bitte fülle die Platzhalter aus,
        unterzeichne mit dem Verantwortlichen und sende sie an help@rciid.at, bevor du
        personenbezogene Daten hochlädst.
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
        (2) Aktuelle Unterauftragsverarbeiter: Hosting (Hetzner, DE/EU); LLM- und Embedding-Anbieter
        (OpenRouter, US — EU-Standardvertragsklauseln); Zahlung (Stripe, US — SCCs); E-Mail (Resend,
        US — SCCs); optionaler Dienst zur Ratenbegrenzung (Upstash, US — SCCs).
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
          Auto-Restart, Hetzner EU-Rechenzentren.
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
        (3) Audit-Berichte, Zertifizierungen (z. B. ISO 27001 soweit verfügbar) und das
        unveränderliche Audit-Log können beim Auftragsverarbeiter angefordert werden.
      </p>

      <H2>§ 9 Löschung bei Vertragsende</H2>
      <p>
        Auf Wunsch des Verantwortlichen löscht der Auftragsverarbeiter alle personenbezogenen Daten
        nach Ende des Dienstvertrages, sofern keine gesetzliche Aufbewahrungspflicht (DE: § 147 AO,
        § 257 HGB; AT: § 132 BAO; CH: OR 962) besteht. Ein vollständiger Export kann vor der
        Löschung ausgelöst werden. Die Löschung wird im unveränderlichen Audit-Trail protokolliert.
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
        vor. (2) Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. (3) Ausschließlicher
        Gerichtsstand für Kaufleute ist Wien, Österreich. (4) Änderungen werden mit angemessener
        Frist mitgeteilt.
      </p>

      <LegalLinks home={home} exclude="dpa" lang={lang} />
    </Shell>
  );
}
