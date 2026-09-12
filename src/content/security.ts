// /security — trust & data-protection page. EN + DE.
// Only claims the engine/tests actually back.

import { type Lang, deepMerge, applyReplacements } from "./site";

export interface SecurityContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  pillars: { icon: string; title: string; desc: string }[];
  hostingTitle: string;
  hostingSub: string;
  hostingOptions: { title: string; points: string[] }[];
  complianceTitle: string;
  complianceItems: { title: string; desc: string }[];
  complianceBadges: { icon: string; label: string; sub: string }[];
  aiActTitle: string;
  aiActText: string;
  aiActItems: { title: string; desc: string }[];
  enterpriseTitle: string;
  enterpriseText: string;
  enterpriseItems: { title: string; desc: string }[];
  disclosureTitle: string;
  disclosureText: string;
  faq: { q: string; a: string }[];
  faqTitle: string;
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

const _securityDe = {
  metaTitle: "Subsumio Sicherheit — DSGVO-KI für Kanzleien",
  metaDesc:
    "Engine self-hosted auf deiner Hardware oder EU-Cloud mit AVV. Kein Training mit Mandantendaten, Zugriff pro Nutzer fuzz-getestet auf null Leaks.",
  badge: "Sicherheit & Datenschutz",
  h1a: "Deine Daten sind der Wert des Produkts.",
  h1b: "Deshalb bleiben sie unter deiner Kontrolle.",
  sub: "Subsumio ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist, nicht Präferenz: Kanzleien in der DACH-Region. Hier ist die Architektur — und was Enterprise-Kunden heute schon nutzen.",
  pillars: [
    {
      icon: "Shield",
      title: "Self-Hosting, vollständig",
      desc: "Die komplette Engine läuft auf deiner Hardware — das volle Produkt, nichts zurückgehalten. Mandantendaten erreichen überhaupt keinen Dritten, und deine IT kontrolliert jedes System, das deine Akten berührt.",
    },
    {
      icon: "Layers",
      title: "Isolation, fuzz-getestet",
      desc: "Zugriff pro Nutzer und pro Quelle wird auf jedem Lesepfad erzwungen und auf null Cross-Tenant-Leaks fuzz-getestet. Ein Nutzer sieht seinen Scope — nie den eines anderen.",
    },
    {
      icon: "Lock",
      title: "Kein Training mit deinen Daten",
      desc: "Deine Inhalte trainieren weder unsere noch fremde Modelle. Synthese-Calls gehen an den LLM-Provider, den du konfigurierst; Self-Hosted-Setups wählen eigene Endpunkte oder Gateways.",
    },
    {
      icon: "Eye",
      title: "Auditierbar per Architektur",
      desc: "Deterministische Zitate in jeder Antwort, Request-Logging, und eine Trust-Boundary, die jeden Remote-Aufrufer standardmäßig als nicht vertrauenswürdig behandelt — prüft exakt, woher jede Aussage stammt.",
    },
  ],
  hostingTitle: "Zwei Betriebsarten",
  hostingSub: "Beide lassen dir die Kontrolle. Wähle nach deiner Compliance-Lage.",
  hostingOptions: [
    {
      title: "Self-hosted / On-Premise (Enterprise)",
      points: [
        "Deine Hardware, deine Jurisdiktion, deine Keys",
        "Kein Dritter verarbeitet Mandantendaten — relevant für § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH): keine mitwirkende Person",
        "Die komplette Engine, auditierbar, auf deiner Infrastruktur",
        "Updates und Backups verwaltest du selbst",
      ],
    },
    {
      title: "Verwaltete EU-Cloud (Pro/Team/Enterprise)",
      points: [
        "EU-Hosting mit Auftragsverarbeitungsvertrag (AVV, Art. 28 DSGVO)",
        "Verschwiegenheitsverpflichtung nach § 203 Abs. 4 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH) für Berufsgeheimnisträger verfügbar",
        "Verschlüsselung bei Übertragung und Speicherung",
        "Löschanfragen an einer Stelle erledigt",
      ],
    },
  ],
  complianceTitle: "Was wir heute haben",
  complianceItems: [
    {
      title: "DSGVO-konforme Verarbeitung",
      desc: "AVV für gehostete Pläne, EU-Datenstandort, dokumentierte Subprozessoren, Löschung auf Anfrage. Self-Hosted-Deployments verarbeiten auf unserer Seite gar nichts.",
    },
    {
      title: "Berufsgeheimnisschutz (§ 203 StGB / § 9 RAO / Art. 321 StGB)",
      desc: "Self-Hosting heißt: kein Dritter ist beteiligt — die sauberste Antwort auf die Verschwiegenheitspflicht in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) und CH (Art. 321 StGB), ganz ohne mitwirkende Person. Gehostete Pläne ergänzen die AVV um eine vertragliche Verschwiegenheitsverpflichtung nach § 43e BRAO / § 203 Abs. 4 StGB (DE) und entsprechenden Regelungen in AT/CH.",
    },
    {
      title: "Eingebaute Anonymisierung vor der Cloud",
      desc: "Ein Klick schwärzt Mandantennamen, IBANs, Aktenzeichen und Kontaktdaten aus jedem Text, bevor er geteilt oder an ein Cloud-LLM gegeben wird — mit Re-Identifikations-Mapping, das nur der Berechtigte behält. Muster-basiert offline; Namens-Erkennung optional per LLM.",
    },
    {
      title: "Getestete Isolation",
      desc: "Multi-Tenant-Scoping wird in der Engine erzwungen und über jeden Lesepfad mit Fuzz-Tests gepinnt — keine Dashboard-Checkbox.",
    },
  ],
  complianceBadges: [
    { icon: "ShieldCheck", label: "DSGVO / GDPR", sub: "EU-Datenstandort & AVV" },
    { icon: "Lock", label: "§ 203 StGB", sub: "Berufsgeheimnisschutz" },
    { icon: "FileCheck", label: "EU AI Act", sub: "Art. 50 Compliance" },
    { icon: "Server", label: "ISO 27001", sub: "Audit-Roadmap" },
  ],
  aiActTitle: "EU AI Act — wo wir stehen",
  aiActText:
    "Die Transparenzpflichten des AI Act (Art. 50) und die meisten Hochrisiko-Pflichten gelten ab dem 2. August 2026. Unsere ehrliche Position vor diesem Stichtag:",
  aiActItems: [
    {
      title: "KI-Output ist gekennzeichnet (Art. 50)",
      desc: "Jeder KI-generierte Entwurf und jede KI-Antwort ist als KI-generiert markiert — sichtbar in der App und als maschinenlesbares Kennzeichen auf der API-Antwort und in gespeicherten Dokumenten. Ein Mensch zeichnet ab; die Maschine gibt sich nie als Urheber aus.",
    },
    {
      title: "Menschliche Aufsicht, immer",
      desc: "Subsumio entwirft und schlägt vor — es reicht nichts ein, bucht nichts und versendet nichts von selbst. Eine qualifizierte Fachkraft prüft und gibt jeden Output frei: der vom Act geforderte Human-in-the-Loop für Hochrisiko-Nutzung.",
    },
    {
      title: "Risiko-Einstufung, dokumentiert",
      desc: "Wir prüfen jedes Feature gegen Annex III, statt zu vermuten. Anwaltsunterstützung allein ist i. d. R. nicht hochrisiko; wo ein Feature Fristen oder Rechtsfolgen berührt, dokumentieren wir die Einstufung und führen das Audit-Log.",
    },
  ],
  enterpriseTitle: "Enterprise-ready — heute und morgen",
  enterpriseText:
    "Subsumio ist von Grund auf für Kanzleien gebaut, die höchste Sicherheitsanforderungen stellen. Was heute schon live ist und was als Nächstes kommt:",
  enterpriseItems: [
    {
      title: "Self-Hosting als direkter Compliance-Weg",
      desc: "Die komplette Engine läuft auf deiner Hardware — kein Drittanbieter, keine Zertifizierung nötig. Für viele Beschaffungsprozesse ist das der schnellste Weg zur Freigabe.",
    },
    {
      title: "SSO/SAML über WorkOS",
      desc: "Single Sign-On via SAML 2.0 ist für gehostete Team-Pläne integriert — Enterprise-Kunden authentifizieren über ihren eigenen Identity Provider. Self-Hosted-Setups legen die Engine hinter die eigene Auth.",
    },
    {
      title: "SCIM 2.0 + Ethics Walls",
      desc: "Automatisiertes User-Provisioning via SCIM 2.0 und Ethical Walls für Mandanten-Isolation sind implementiert — nicht Roadmap, sondern live.",
    },
    {
      title: "Audit-Roadmap für SOC 2 / ISO 27001",
      desc: "Die Engine-Architektur erfüllt die technischen Controls (Access Control, Audit Logging, Encryption at Rest, Isolation). Die formelle Zertifizierung läuft parallel zum Enterprise-Rollout — Self-Hosting macht sie für viele Käufer gegenstandslos.",
    },
  ],
  disclosureTitle: "Responsible Disclosure",
  disclosureText:
    "Schwachstelle gefunden? E-Mail an security@subsum.eu. Wir bestätigen den Eingang innerhalb von 48 Stunden, halten dich auf dem Laufenden und nennen Researcher auf Wunsch namentlich. Bitte nicht gegen Systeme mit echten Kundendaten testen — hoste stattdessen eine Kopie selbst auf eigener Hardware.",
  faqTitle: "Sicherheitsfragen, klar beantwortet",
  faq: [
    {
      q: "Wo genau liegen meine Daten?",
      a: "Self-hosted: auf deinen Maschinen, Punkt. Gehostet: in EU-Rechenzentren, Standort im AVV benannt. Synthese-Anfragen gehen an den für deinen Plan konfigurierten LLM-Provider — Enterprise-Setups können über EU-Endpunkte oder ein eigenes Gateway routen.",
    },
    {
      q: "Können Subsumio-Mitarbeiter mein Brain lesen?",
      a: "Self-hosted: nein, strukturell — es gibt keinen Zugriffspfad. Gehostet: Zugriff ist auf protokollierte Break-Glass-Betriebsprozeduren beschränkt und durch AVV plus Verschwiegenheitsverpflichtung gedeckt. Wir durchstöbern keine Kundeninhalte, und deine Inhalte trainieren keine Modelle.",
    },
    {
      q: "Was passiert mit meinen Daten, wenn ich kündige?",
      a: "Export jederzeit (der Export der Engine ist ein vollwertiger Befehl, kein Support-Ticket). Gehostete Daten werden zum Vertragsende gemäß AVV gelöscht. Self-hosted: sie waren nie bei uns.",
    },
    {
      q: "Ist Self-Hosting unsicherer als eure Cloud?",
      a: "Es ist dieselbe Engine. Sicherheitsrelevantes Verhalten — Scoping, Trust-Boundaries, Isolation — ist identisch und test-gepinnt. Der Unterschied ist, wer sie betreibt: du statt wir.",
    },
    {
      q: "Wie verträgt sich der WhatsApp-Copilot mit § 203 StGB?",
      a: "WhatsApp ist ein optionaler Komfort-Kanal, kein Kernbestandteil. Der Copilot nutzt die Meta Business API mit Auftragsverarbeitungsvertrag (AVV). Für sensibelste Akteninhalte empfehlen wir die native Mobile-App oder Self-Hosting. Der Copilot ist so gebaut, dass jede Aktion bestätigungspflichtig ist — nichts landet ungesehen in der Akte. Kanzleien, die WhatsApp nicht nutzen möchten, verlieren keine Kernfunktionalität.",
    },
  ],
  ctaTitle: "Bring deinen Datenschutzbeauftragten mit.",
  ctaSub:
    "Wir sprechen seine Sprache. Gehostet mit AVV — oder self-hosted, sodass sich die Frage gar nicht stellt.",
  ctaButton: "Demo vereinbaren",
};

const _enSecurity: SecurityContent = {
  metaTitle: "Subsumio Security — GDPR-compliant AI for law firms",
  metaDesc:
    "Self-host the engine on your hardware, or use EU cloud with DPA. No training on client data, per-user access fuzz-tested for zero leaks.",
  badge: "Security & data protection",
  h1a: "Your data is the product's value.",
  h1b: "So it stays under your control.",
  sub: "Subsumio is built for professions where confidentiality is law, not preference: law firms in the DACH region. Here is the architecture — and what enterprise customers use today.",
  pillars: [
    {
      icon: "Shield",
      title: "Self-hosting, fully",
      desc: "The complete engine runs on your hardware — the full product, nothing held back. Client data never reaches a third party at all, and your IT controls every system that touches your files.",
    },
    {
      icon: "Layers",
      title: "Isolation, fuzz-tested",
      desc: "Per-user and per-source scoped access is enforced on every read path and fuzz-tested for zero cross-tenant leaks. A user sees their scope — never another's.",
    },
    {
      icon: "Lock",
      title: "No training on your data",
      desc: "Your content never trains our or anyone else's models. Synthesis calls go to the LLM provider you configure; self-hosted setups choose their own endpoints or gateways.",
    },
    {
      icon: "Eye",
      title: "Auditable by design",
      desc: "Deterministic citations on every answer, request logging, and a trust boundary that treats every remote caller as untrusted by default — verify exactly where each claim comes from.",
    },
  ],
  hostingTitle: "Two ways to run it",
  hostingSub: "Both keep you in control. Pick by your compliance posture.",
  hostingOptions: [
    {
      title: "Self-hosted / on-premise (Enterprise)",
      points: [
        "Your hardware, your jurisdiction, your keys",
        "No third party processes client data — relevant for statutory professional secrecy",
        "The complete engine, auditable, on your infrastructure",
        "You manage updates and backups",
      ],
    },
    {
      title: "Managed EU cloud (Pro/Team/Enterprise)",
      points: [
        "EU hosting with a data processing agreement (DPA, Art. 28 GDPR)",
        "Contractual confidentiality commitment available for professional-secrecy holders",
        "Encryption in transit and at rest",
        "Deletion requests handled in one place",
      ],
    },
  ],
  complianceTitle: "What we have today",
  complianceItems: [
    {
      title: "GDPR-aligned processing",
      desc: "DPA for hosted plans, EU data location, documented subprocessors, deletion on request. Self-hosted deployments process nothing on our side at all.",
    },
    {
      title: "Professional secrecy (§ 203 StGB / § 9 RAO / Art. 321 StGB)",
      desc: "Self-hosting means no third party is involved — the cleanest answer to professional-secrecy rules for lawyers in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) and CH (Art. 321 StGB). Hosted plans add a contractual confidentiality commitment on top of the DPA, covering involved parties under § 43e BRAO / § 203 (4) StGB (DE) and equivalent provisions in AT/CH.",
    },
    {
      title: "Built-in anonymization before the cloud",
      desc: "A one-click tool redacts client names, IBANs, case numbers and contact data from any text before it is shared or sent to a cloud LLM — with a re-identification map only the authorized holder keeps. Pattern-based offline; name detection adds an optional LLM layer.",
    },
    {
      title: "Tested isolation",
      desc: "Multi-tenant scoping is enforced in the engine and pinned by fuzz tests across every read path — not a dashboard checkbox.",
    },
  ],
  complianceBadges: [
    { icon: "ShieldCheck", label: "GDPR / DPA", sub: "EU data location & DPA" },
    { icon: "Lock", label: "Professional secrecy", sub: "§ 203 StGB / § 9 RAO / Art. 321 StGB" },
    { icon: "FileCheck", label: "EU AI Act", sub: "Art. 50 compliance" },
    { icon: "Server", label: "ISO 27001", sub: "Audit roadmap" },
  ],
  aiActTitle: "EU AI Act — where we stand",
  aiActText:
    "The AI Act's transparency duties (Art. 50) and most high-risk obligations apply from 2 August 2026. Our honest position before that date:",
  aiActItems: [
    {
      title: "AI output is labelled (Art. 50)",
      desc: "Every AI-generated draft and answer is marked as AI-generated — visibly in the app and as a machine-readable marker on the API response and on saved documents. A human signs off; the machine never poses as the author.",
    },
    {
      title: "Human oversight, always",
      desc: "Subsumio drafts and suggests; it never files, books, or sends on its own. A qualified professional reviews and approves every output — the human-in-the-loop the Act requires for high-risk use.",
    },
    {
      title: "Risk classification, documented",
      desc: "We assess each feature against Annex III instead of assuming. Lawyer-facing assistance is generally not high-risk on its own; where a feature touches deadlines or legal consequences, we document the classification and keep the audit log.",
    },
  ],
  enterpriseTitle: "Enterprise-ready — today and tomorrow",
  enterpriseText:
    "Subsumio is built from the ground up for firms with the highest security demands. What's live today and what's coming next:",
  enterpriseItems: [
    {
      title: "Self-hosting as a direct compliance path",
      desc: "The complete engine runs on your hardware — no third party, no certification required. For many procurement processes, this is the fastest route to approval.",
    },
    {
      title: "SSO/SAML via WorkOS",
      desc: "Single Sign-On via SAML 2.0 is integrated for hosted team plans — enterprise customers authenticate through their own identity provider. Self-hosted deployments front the engine with their own auth.",
    },
    {
      title: "SCIM 2.0 + Ethics Walls",
      desc: "Automated user provisioning via SCIM 2.0 and ethical walls for matter isolation are implemented — not roadmap, but live today.",
    },
    {
      title: "Audit roadmap for SOC 2 / ISO 27001",
      desc: "The engine architecture meets the technical controls (access control, audit logging, encryption at rest, isolation). Formal certification is running alongside the enterprise rollout — self-hosting makes it moot for many buyers.",
    },
  ],
  disclosureTitle: "Responsible disclosure",
  disclosureText:
    "Found a vulnerability? Email security@subsum.eu. We confirm receipt within 48 hours, keep you updated, and credit researchers who wish to be named. Please don't test against systems holding real customer data — self-host a copy on your own hardware instead.",
  faqTitle: "Security questions, answered plainly",
  faq: [
    {
      q: "Where exactly does my data live?",
      a: "Self-hosted: on your machines, full stop. Hosted: in EU data centers, with the location named in your DPA. Synthesis requests go to the LLM provider configured for your plan — enterprise setups can route through EU endpoints or their own gateway.",
    },
    {
      q: "Can Subsumio employees read my brain?",
      a: "Self-hosted: no, structurally — we have no access path. Hosted: access is restricted to break-glass operational procedures, logged, and covered by the DPA and confidentiality commitment. We don't browse customer content, and your content never trains models.",
    },
    {
      q: "What happens to my data if I leave?",
      a: "Export everything at any time (the engine's export is a first-class command, not a support ticket). Hosted data is deleted on contract end per the DPA. Self-hosted: it was never with us.",
    },
    {
      q: "Is self-hosting less secure than your cloud?",
      a: "It's the same engine. Security-relevant behavior — scoping, trust boundaries, isolation — is identical and test-pinned. The difference is who operates it: you, instead of us.",
    },
    {
      q: "How does the WhatsApp Copilot align with § 203 StGB?",
      a: "WhatsApp is an optional convenience channel, not a core component. The Copilot uses the Meta Business API with a Data Processing Agreement (DPA). For the most sensitive matter content, we recommend the native mobile app or self-hosting. The Copilot is built so every action requires confirmation — nothing reaches the matter unseen. Firms that choose not to use WhatsApp lose no core functionality.",
    },
  ],
  ctaTitle: "Bring your data protection officer.",
  ctaSub:
    "We speak their language. Hosted with a DPA, or self-hosted so the question never arises.",
  ctaButton: "Book a demo",
};

export const SECURITY: Record<Lang, SecurityContent> = {
  en: _enSecurity,
  de: _securityDe,
  at: deepMerge(_securityDe, {
    metaDesc:
      "Engine self-hosted auf deiner Hardware oder EU-Cloud mit AVV. Kein Training mit Mandantendaten, Zugriff pro Nutzer fuzz-getestet auf null Leaks.",
    h1a: "Deine Daten sind der Wert des Produkts.",
    h1b: "Deshalb bleiben sie unter deiner Kontrolle.",
    ctaTitle: "Bring deinen Datenschutzbeauftragten mit.",
    ctaSub:
      "Wir sprechen seine Sprache. Gehostet mit AVV — oder self-hosted, sodass sich die Frage gar nicht stellt.",
  }),
  ch: deepMerge(_securityDe, {
    metaDesc:
      "Engine self-hosted auf deiner Hardware oder EU-Cloud mit AVV. Kein Training mit Mandantendaten, Zugriff pro Nutzer fuzz-getestet auf null Leaks.",
    h1a: "Deine Daten sind der Wert des Produkts.",
    h1b: "Deshalb bleiben sie unter deiner Kontrolle.",
    sub: "Subsumio ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist, nicht Präferenz: Kanzleien in der DACH-Region. Hier ist die Architektur — und was Enterprise-Kunden heute schon nutzen.",
    ctaTitle: "Bring deinen Datenschutzbeauftragten mit.",
    ctaSub:
      "Wir sprechen seine Sprache. Gehostet mit AVV — oder self-hosted, sodass sich die Frage gar nicht stellt.",
  }),
};
