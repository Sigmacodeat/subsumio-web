// /security — trust & data-protection page.
// Only claims the product and its tests actually back. No certificates, no
// roadmap promises (SOC 2 / ISO 27001 do not exist).

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
  metaTitle: "Subsumio Sicherheit — Datenschutz für Kanzleien in Österreich",
  metaDesc:
    "EU-Cloud (Hetzner) mit AVV oder On-Premise im Enterprise-Tarif. Kein Training mit Mandantendaten, Zugriffsrechte pro Nutzer und Akte, automatisiert getestet.",
  badge: "Sicherheit & Datenschutz",
  h1a: "Mandantendaten gehören der Kanzlei.",
  h1b: "Deshalb bleiben sie unter Ihrer Kontrolle.",
  sub: "Subsumio ist für einen Beruf gebaut, in dem Verschwiegenheit Gesetz ist: Rechtsanwältinnen und Rechtsanwälte in Österreich. Hier steht, wie das System aufgebaut ist — das ist heute verfügbar.",
  pillars: [
    {
      icon: "Shield",
      title: "On-Premise (Enterprise)",
      desc: "Im Enterprise-Tarif läuft Subsumio vollständig auf Ihrer Hardware. Mit eigenem Sprachmodell verlässt nichts Ihr Netzwerk, und Ihre IT kontrolliert jedes System, das Ihre Akten berührt.",
    },
    {
      icon: "Layers",
      title: "Getrennte Zugriffe",
      desc: "Zugriffsrechte gelten pro Nutzer und pro Akte und werden bei jedem Lesezugriff geprüft. Die Trennung zwischen Kanzleien und Teams testen wir automatisiert mit zufällig erzeugten Abfragen.",
    },
    {
      icon: "Lock",
      title: "Kein Training mit Ihren Daten",
      desc: "Ihre Inhalte trainieren weder unsere noch fremde Modelle. Für KI-Antworten gehen Anfragen an ein Sprachmodell; dessen Anbieter ist im AVV als Auftragsverarbeiter benannt. On-Premise können Sie ein eigenes Modell betreiben.",
    },
    {
      icon: "Eye",
      title: "Nachvollziehbar",
      desc: "Antworten nennen ihre Fundstellen, Zugriffe werden protokolliert, und jede Anfrage von außen gilt zunächst als nicht vertrauenswürdig. So prüfen Sie, woher eine Aussage stammt.",
    },
  ],
  hostingTitle: "Zwei Betriebsarten",
  hostingSub: "Wählen Sie nach den Anforderungen Ihrer Kanzlei.",
  hostingOptions: [
    {
      title: "On-Premise (Enterprise)",
      points: [
        "Ihre Hardware, Ihr Netzwerk, Ihre Schlüssel",
        "Derselbe Funktionsumfang wie in der EU-Cloud",
        "Kein Auftragsverarbeiter, wenn Sie ein eigenes Sprachmodell betreiben",
        "Updates und Backups verwalten Sie selbst",
      ],
    },
    {
      title: "Verwaltete EU-Cloud (Solo, Kanzlei, Enterprise)",
      points: [
        "EU-Hosting (Hetzner) mit Auftragsverarbeitungsvertrag (AVV, Art. 28 DSGVO)",
        "Auftragsverarbeiter sind im AVV benannt",
        "Verschlüsselung bei Übertragung und Speicherung",
        "Löschanfragen an einer Stelle erledigt",
      ],
    },
  ],
  complianceTitle: "Was heute verfügbar ist",
  complianceItems: [
    {
      title: "Verarbeitung nach DSGVO",
      desc: "AVV für die gehosteten Tarife, Datenstandort EU, benannte Auftragsverarbeiter, Löschung auf Anfrage. On-Premise verarbeiten wir auf unserer Seite keine Mandantendaten.",
    },
    {
      title: "Verschwiegenheit (§ 9 Abs. 2 RAO)",
      desc: "Die Verschwiegenheitspflicht nach § 9 Abs. 2 RAO trifft Sie — auch dann, wenn Sie Dienstleister einsetzen. In den gehosteten Tarifen ergänzen wir den AVV deshalb um eine vertragliche Verschwiegenheitsverpflichtung. On-Premise mit eigenem Sprachmodell ist kein Dienstleister beteiligt.",
    },
    {
      title: "Anonymisierung vor der Weitergabe",
      desc: "Ein Klick schwärzt Mandantennamen, IBANs, Geschäftszahlen und Kontaktdaten in einem Text, bevor er geteilt oder an ein Sprachmodell in der Cloud geschickt wird. Die Zuordnung zur Rückführung bleibt beim Berechtigten. Die Mustererkennung läuft ohne Internetverbindung; die Namenserkennung per Sprachmodell ist optional.",
    },
  ],
  complianceBadges: [
    {
      icon: "ShieldCheck",
      label: "DSGVO",
      sub: "AVV nach Art. 28",
    },
    {
      icon: "Server",
      label: "EU-Hosting",
      sub: "Rechenzentren in der EU (Hetzner)",
    },
    {
      icon: "FileCheck",
      label: "KI-Verordnung",
      sub: "Kennzeichnung nach Art. 50",
    },
  ],
  aiActTitle: "KI-Verordnung der EU — wo wir stehen",
  aiActText: "Die Transparenzpflichten nach Art. 50 KI-VO setzen wir so um:",
  aiActItems: [
    {
      title: "KI-Ergebnisse sind gekennzeichnet (Art. 50)",
      desc: "Jeder KI-erzeugte Entwurf und jede KI-Antwort ist als solche markiert — sichtbar in der Anwendung und als maschinenlesbares Kennzeichen in gespeicherten Dokumenten. Ein Mensch zeichnet ab; die Maschine gibt sich nicht als Urheber aus.",
    },
    {
      title: "Menschliche Aufsicht",
      desc: "Subsumio entwirft und schlägt vor — es bringt nichts ein, bucht nichts und versendet nichts von selbst. Eine Anwältin oder ein Anwalt prüft jedes Ergebnis und gibt es frei.",
    },
    {
      title: "Risiko-Einstufung, dokumentiert",
      desc: "Wir prüfen jede Funktion gegen Anhang III der KI-Verordnung, statt zu vermuten. Wo eine Funktion Fristen oder Rechtsfolgen berührt, dokumentieren wir die Einstufung und führen ein Protokoll.",
    },
  ],
  enterpriseTitle: "Für Enterprise-Kunden",
  enterpriseText: "Das ist im Enterprise-Tarif heute verfügbar:",
  enterpriseItems: [
    {
      title: "Single Sign-On (SAML 2.0)",
      desc: "Ihre Mitarbeiterinnen und Mitarbeiter melden sich über den Identitätsanbieter Ihrer Organisation an (Enterprise).",
    },
    {
      title: "Automatische Benutzerverwaltung (SCIM 2.0) und Informationsbarrieren",
      desc: "Benutzer werden aus Ihrem Verzeichnisdienst angelegt und entfernt; Informationsbarrieren trennen Mandate innerhalb der Kanzlei (Enterprise).",
    },
    {
      title: "Zertifizierungen",
      desc: "Derzeit keine. Unsere technischen Maßnahmen legen wir im Security Review offen.",
    },
  ],
  disclosureTitle: "Sicherheitslücke melden",
  disclosureText:
    "Schwachstelle gefunden? E-Mail an security@subsum.io. Wir bestätigen den Eingang innerhalb von 48 Stunden, halten Sie auf dem Laufenden und nennen Sie auf Wunsch namentlich. Bitte testen Sie nicht gegen Systeme mit echten Kundendaten — schreiben Sie uns vorab, dann stimmen wir den Rahmen ab.",
  faqTitle: "Sicherheitsfragen, klar beantwortet",
  faq: [
    {
      q: "Wo genau liegen meine Daten?",
      a: "In der EU-Cloud: in Rechenzentren in der EU (Hetzner); der Standort ist im AVV benannt, ebenso der Anbieter des Sprachmodells, an den Anfragen für KI-Antworten gehen. On-Premise (Enterprise): auf Ihren eigenen Servern.",
    },
    {
      q: "Können Subsumio-Mitarbeiter meine Akten lesen?",
      a: "On-Premise: nein, wir haben keinen Zugang zu Ihrem System. In der EU-Cloud ist der Zugriff auf protokollierte Notfallzugriffe im Betrieb beschränkt und durch AVV und Verschwiegenheitsverpflichtung gedeckt. Kundeninhalte sehen wir nicht ein.",
    },
    {
      q: "Was passiert mit meinen Daten, wenn ich kündige?",
      a: "Sie können jederzeit alles exportieren. Nach Vertragsende 30 Tage Exportfrist, danach Löschung. On-Premise liegen die Daten ohnehin bei Ihnen.",
    },
    {
      q: "Ist On-Premise unsicherer als Ihre Cloud?",
      a: "Es ist dieselbe Software. Zugriffsrechte, Trennung und Protokollierung verhalten sich gleich und sind durch dieselben Tests abgesichert. Der Unterschied ist, wer sie betreibt: Sie statt wir.",
    },
    {
      q: "Wie verträgt sich der Assistent auf WhatsApp mit der Verschwiegenheitspflicht?",
      a: "WhatsApp ist ein optionaler Zusatzkanal und lässt sich abschalten. Der Assistent läuft über WhatsApp Business von Meta — Nachrichten gehen also über Meta. Für sensible Inhalte empfehlen wir die Weboberfläche. Jede Aktion des Assistenten bestätigen Sie, bevor etwas in der Akte landet. Wer WhatsApp nicht nutzt, verliert keine Kernfunktion.",
    },
  ],
  ctaTitle: "Bringen Sie Ihren Datenschutzbeauftragten mit.",
  ctaSub: "Gehostet mit AVV – oder On-Premise ohne Auftragsverarbeiter.",
  ctaButton: "Demo vereinbaren",
};
