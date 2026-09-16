// /security — trust & data-protection page.
// Only claims the engine/tests actually back.

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

export const SECURITY: SecurityContent = {
  metaTitle: "Subsumio Sicherheit — DSGVO-KI für Kanzleien",
  metaDesc:
    "Engine self-hosted auf deiner Hardware oder EU-Cloud mit AVV. Kein Training mit Mandantendaten, Zugriff pro Nutzer fuzz-getestet auf null Leaks.",
  badge: "Sicherheit & Datenschutz",
  h1a: "Deine Daten sind der Wert des Produkts.",
  h1b: "Deshalb bleiben sie unter deiner Kontrolle.",
  sub: "Subsumio ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist, nicht Präferenz: Kanzleien in Österreich. Hier ist die Architektur — und was Enterprise-Kunden heute schon nutzen.",
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
        "Kein Dritter verarbeitet Mandantendaten — relevant für § 9 Abs. 2 RAO: keine mitwirkende Person",
        "Die komplette Engine, auditierbar, auf deiner Infrastruktur",
        "Updates und Backups verwaltest du selbst",
      ],
    },
    {
      title: "Verwaltete EU-Cloud (Pro/Team/Enterprise)",
      points: [
        "EU-Hosting mit Auftragsverarbeitungsvertrag (AVV, Art. 28 DSGVO)",
        "Verschwiegenheitsverpflichtung nach § 9 Abs. 2 RAO für Berufsgeheimnisträger verfügbar",
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
      title: "Berufsgeheimnisschutz (§ 9 Abs. 2 RAO)",
      desc: "Self-Hosting heißt: kein Dritter ist beteiligt — die sauberste Antwort auf die Verschwiegenheitspflicht nach § 9 Abs. 2 RAO, ganz ohne mitwirkende Person. Gehostete Pläne ergänzen die AVV um eine vertragliche Verschwiegenheitsverpflichtung.",
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
    {
      icon: "ShieldCheck",
      label: "DSGVO / GDPR",
      sub: "EU-Datenstandort & AVV",
    },
    {
      icon: "Lock",
      label: "§ 9 Abs. 2 RAO",
      sub: "Berufsgeheimnisschutz",
    },
    {
      icon: "FileCheck",
      label: "EU AI Act",
      sub: "Art. 50 Compliance",
    },
    {
      icon: "Server",
      label: "ISO 27001",
      sub: "Audit-Roadmap",
    },
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
      q: "Wie verträgt sich der WhatsApp-Copilot mit § 9 Abs. 2 RAO?",
      a: "WhatsApp ist ein optionaler Komfort-Kanal, kein Kernbestandteil. Der Copilot nutzt die Meta Business API mit Auftragsverarbeitungsvertrag (AVV). Für sensibelste Akteninhalte empfehlen wir die native Mobile-App oder Self-Hosting. Der Copilot ist so gebaut, dass jede Aktion bestätigungspflichtig ist — nichts landet ungesehen in der Akte. Kanzleien, die WhatsApp nicht nutzen möchten, verlieren keine Kernfunktionalität.",
    },
  ],
  ctaTitle: "Bring deinen Datenschutzbeauftragten mit.",
  ctaSub:
    "Wir sprechen seine Sprache. Gehostet mit AVV — oder self-hosted, sodass sich die Frage gar nicht stellt.",
  ctaButton: "Demo vereinbaren",
};
