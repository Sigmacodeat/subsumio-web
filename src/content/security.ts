// /security — trust & data-protection page. EN + DE.
// HONESTY RULE: only claims the engine/tests actually back. No SOC 2 / ISO
// claims (we don't hold them — say so and show the roadmap instead).

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
  aiActTitle: string;
  aiActText: string;
  aiActItems: { title: string; desc: string }[];
  roadmapTitle: string;
  roadmapText: string;
  roadmapItems: string[];
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
  sub: "Subsumio ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist, nicht Präferenz: Kanzleien in der DACH-Region. Hier ist die Architektur — und eine ehrliche Liste dessen, was noch in Arbeit ist.",
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
  roadmapTitle: "Was wir noch nicht haben — ehrlich",
  roadmapText:
    "Wir sagen es lieber hier, als dass du es im Einkauf herausfindest. In Arbeit, in dieser Reihenfolge:",
  roadmapItems: [
    "SOC 2 / ISO 27001-Zertifizierung — noch nicht vorhanden; Audit-Roadmap parallel zum Enterprise-Rollout geplant. Self-Hosting macht die Frage für viele Käufer gegenstandslos.",
    "SSO/SAML für gehostete Team-Pläne (Self-Hosted-Deployments können die Engine heute hinter die eigene Auth legen).",
    "Berechtigungs-Vererbung aus Quellsystemen für Konnektor-Inhalte in geteilten Brains — bis dahin dokumentieren wir Konnektoren für Einzel-Nutzer-Brains.",
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
  ctaButton: "Demo anfragen",
};

const _enSecurity: SecurityContent = {
  metaTitle: "Subsumio Security — GDPR-compliant AI for law firms",
  metaDesc:
    "Self-host the engine on your hardware, or use EU cloud with DPA. No training on client data, per-user access fuzz-tested for zero leaks.",
  badge: "Security & data protection",
  h1a: "Your data is the product's value.",
  h1b: "So it stays under your control.",
  sub: "Subsumio is built for professions where confidentiality is law, not preference: law firms in the DACH region. Here is the architecture — and an honest list of what's still in progress.",
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
  roadmapTitle: "What we don't have yet — honestly",
  roadmapText:
    "We'd rather tell you here than have you find out in procurement. In progress, in order:",
  roadmapItems: [
    "SOC 2 / ISO 27001 certification — not yet held; audit roadmap planned alongside enterprise rollout. Self-hosting sidesteps the question for many buyers.",
    "SSO/SAML for hosted team plans (self-hosted deployments can front the engine with their own auth today).",
    "Source-system permission inheritance for connector-synced content in shared brains — until it lands, we document connectors for single-user brains.",
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
  ctaButton: "Request a demo",
};

export const SECURITY: Record<Lang, SecurityContent> = {
  en: _enSecurity,
  de: _securityDe,
  at: deepMerge(_securityDe, {
    metaDesc:
      "Engine self-hosted auf deiner Hardware oder EU-Cloud mit AVV. Kein Training mit Mandantendaten, Zugriff pro Nutzer fuzz-getestet auf null Leaks.",
    h1a: "Deine Daten sind der Wert des Produkts.",
    h1b: "Deshalb bleiben sie unter deiner Kontrolle.",
    sub: "Subsumio ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist, nicht Präferenz: Kanzleien in der DACH-Region. Hier ist die Architektur — und eine ehrliche Liste dessen, was noch in Arbeit ist.",
    ctaTitle: "Bring deinen Datenschutzbeauftragten mit.",
    ctaSub:
      "Wir sprechen seine Sprache. Gehostet mit AVV — oder self-hosted, sodass sich die Frage gar nicht stellt.",
  }),
  ch: deepMerge(_securityDe, {
    metaDesc:
      "Engine self-hosted auf deiner Hardware oder EU-Cloud mit AVV. Kein Training mit Mandantendaten, Zugriff pro Nutzer fuzz-getestet auf null Leaks.",
    h1a: "Deine Daten sind der Wert des Produkts.",
    h1b: "Deshalb bleiben sie unter deiner Kontrolle.",
    sub: "Subsumio ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist, nicht Präferenz: Kanzleien in der DACH-Region. Hier ist die Architektur — und eine ehrliche Liste dessen, was noch in Arbeit ist.",
    ctaTitle: "Bring deinen Datenschutzbeauftragten mit.",
    ctaSub:
      "Wir sprechen seine Sprache. Gehostet mit AVV — oder self-hosted, sodass sich die Frage gar nicht stellt.",
  }),
  it: applyReplacements(JSON.parse(JSON.stringify(_enSecurity)), {
    "Subsumio Security — GDPR-compliant AI for law firms":
      "Sicurezza Subsumio — AI conforme GDPR per studi legali",
    "Self-host the engine on your hardware, or use EU cloud with DPA. No training on client data, per-user access fuzz-tested for zero leaks.":
      "Self-host del motore sul tuo hardware, o cloud UE con DPA. Nessun training sui dati dei clienti, accesso per-utente fuzz-testato per zero leak.",
    "Security & data protection": "Sicurezza & protezione dati",
    "Your data is the product's value.": "I tuoi dati sono il valore del prodotto.",
    "So it stays under your control.": "Per questo restano sotto il tuo controllo.",
    "Subsumio is built for professions where confidentiality is law, not preference: law firms in the DACH region. Here is the architecture — and an honest list of what's still in progress.":
      "Subsumio è costruito per professioni in cui la riservatezza è legge, non preferenza: studi legali nella regione DACH. Ecco l'architettura — e una lista onesta di cosa è ancora in corso.",
    "Two ways to run it": "Due modi per usarlo",
    "Both keep you in control. Pick by your compliance posture.":
      "Entrambi ti mantengono al controllo. Scegli in base al tuo profilo di compliance.",
    "What we have today": "Cosa abbiamo oggi",
    "EU AI Act — where we stand": "EU AI Act — dove siamo",
    "What we don't have yet — honestly": "Cosa non abbiamo ancora — onestamente",
    "Responsible disclosure": "Divulgazione responsabile",
    "Security questions, answered plainly": "Domande di sicurezza, risposte chiaramente",
    "Bring your data protection officer.": "Porta il tuo responsabile della protezione dei dati.",
    "We speak their language. Hosted with a DPA, or self-hosted so the question never arises.":
      "Parliamo la loro lingua. Hosted con DPA, o self-hosted così la domanda non si pone.",
    "Request a demo": "Richiedi una demo",
    // Pillars
    "Self-hosting, fully": "Self-hosting, completo",
    "The complete engine runs on your hardware — the full product, nothing held back. Client data never reaches a third party at all, and your IT controls every system that touches your files.":
      "Il motore completo gira sul tuo hardware — il prodotto intero, nulla trattenuto. I dati dei clienti non raggiungono mai terzi, e la tua IT controlla ogni sistema che tocca i tuoi file.",
    "Isolation, fuzz-tested": "Isolazione, fuzz-testata",
    "Per-user and per-source scoped access is enforced on every read path and fuzz-tested for zero cross-tenant leaks. A user sees their scope — never another's.":
      "L'accesso scoped per-utente e per-fonte è applicato su ogni read path e fuzz-testato per zero leak cross-tenant. Un utente vede il suo scope — mai quello di un altro.",
    "No training on your data": "Nessun training sui tuoi dati",
    "Your content never trains our or anyone else's models. Synthesis calls go to the LLM provider you configure; self-hosted setups choose their own endpoints or gateways.":
      "I tuoi contenuti non trainano mai i nostri o altrui modelli. Le chiamate di sintesi vanno al provider LLM che configuri; i setup self-hosted scelgono i propri endpoint o gateway.",
    "Auditable by design": "Auditabile per design",
    "Deterministic citations on every answer, request logging, and a trust boundary that treats every remote caller as untrusted by default — verify exactly where each claim comes from.":
      "Citazioni deterministiche su ogni risposta, request logging, e un trust boundary che tratta ogni remote caller come untrusted di default — verifica esattamente da dove proviene ogni affermazione.",
    // Hosting
    "Self-hosted / on-premise (Enterprise)": "Self-hosted / on-premise (Enterprise)",
    "Your hardware, your jurisdiction, your keys":
      "Il tuo hardware, la tua giurisdizione, le tue chiavi",
    "No third party processes client data — relevant for statutory professional secrecy":
      "Nessun terzo processa dati dei clienti — rilevante per il segreto professionale legale",
    "The complete engine, auditable, on your infrastructure":
      "Il motore completo, auditabile, sulla tua infrastruttura",
    "You manage updates and backups": "Gestisci tu aggiornamenti e backup",
    "Managed EU cloud (Pro/Team/Enterprise)": "Cloud UE gestito (Pro/Team/Enterprise)",
    "EU hosting with a data processing agreement (DPA, Art. 28 GDPR)":
      "Hosting UE con accordo di trattamento dati (DPA, Art. 28 GDPR)",
    "Contractual confidentiality commitment available for professional-secrecy holders":
      "Impegno di riservatezza contrattuale disponibile per titolari di segreto professionale",
    "Encryption in transit and at rest": "Cifratura in transito e at rest",
    "Deletion requests handled in one place":
      "Richieste di cancellazione gestite in un unico luogo",
    // Compliance
    "GDPR-aligned processing": "Elaborazione allineata GDPR",
    "DPA for hosted plans, EU data location, documented subprocessors, deletion on request. Self-hosted deployments process nothing on our side at all.":
      "DPA per piani hosted, posizione dati UE, subprocessori documentati, cancellazione su richiesta. I deployment self-hosted non processano nulla da noi.",
    "Professional secrecy (§ 203 StGB / § 9 RAO / Art. 321 StGB)":
      "Segreto professionale (§ 203 StGB / § 9 RAO / Art. 321 StGB)",
    "Self-hosting means no third party is involved — the cleanest answer to professional-secrecy rules for lawyers in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) and CH (Art. 321 StGB). Hosted plans add a contractual confidentiality commitment on top of the DPA, covering involved parties under § 43e BRAO / § 203 (4) StGB (DE) and equivalent provisions in AT/CH.":
      "Il self-hosting significa nessun terzo coinvolto — la risposta più pulita alle regole di segreto professionale per avvocati in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) e CH (Art. 321 StGB). I piani hosted aggiungono un impegno contrattuale di riservatezza oltre al DPA, coprendo le parti coinvolte sotto § 43e BRAO / § 203 (4) StGB (DE) e disposizioni equivalenti in AT/CH.",
    "Built-in anonymization before the cloud": "Anonimizzazione integrata prima del cloud",
    "A one-click tool redacts client names, IBANs, case numbers and contact data from any text before it is shared or sent to a cloud LLM — with a re-identification map only the authorized holder keeps. Pattern-based offline; name detection adds an optional LLM layer.":
      "Uno strumento one-click redige nomi clienti, IBAN, numeri di pratica e dati di contatto da qualsiasi testo prima che sia condiviso o inviato a un LLM cloud — con una mappa di re-identificazione che solo il titolare autorizzato conserva. Pattern-based offline; il rilevamento nomi aggiunge un layer LLM opzionale.",
    "Tested isolation": "Isolazione testata",
    "Multi-tenant scoping is enforced in the engine and pinned by fuzz tests across every read path — not a dashboard checkbox.":
      "Lo scoping multi-tenant è applicato nel motore e fissato da fuzz test su ogni read path — non una checkbox del dashboard.",
    // AI Act
    "The AI Act's transparency duties (Art. 50) and most high-risk obligations apply from 2 August 2026. Our honest position before that date:":
      "I doveri di trasparenza dell'AI Act (Art. 50) e la maggior parte degli obblighi high-risk si applicano dal 2 agosto 2026. La nostra posizione onesta prima di quella data:",
    "AI output is labelled (Art. 50)": "L'output AI è etichettato (Art. 50)",
    "Every AI-generated draft and answer is marked as AI-generated — visibly in the app and as a machine-readable marker on the API response and on saved documents. A human signs off; the machine never poses as the author.":
      "Ogni bozza e risposta AI-generata è marcata come AI-generated — visibilmente nell'app e come marker machine-readable sulla risposta API e sui documenti salvati. Un umano approva; la macchina non si spaccia mai per l'autore.",
    "Human oversight, always": "Supervisione umana, sempre",
    "Subsumio drafts and suggests; it never files, books, or sends on its own. A qualified professional reviews and approves every output — the human-in-the-loop the Act requires for high-risk use.":
      "Subsumio redige e suggerisce; non deposita, non contabilizza, non invia da solo. Un professionista qualificato rivede e approva ogni output — l'human-in-the-loop che l'Act richiede per uso high-risk.",
    "Risk classification, documented": "Classificazione del rischio, documentata",
    "We assess each feature against Annex III instead of assuming. Lawyer-facing assistance is generally not high-risk on its own; where a feature touches deadlines or legal consequences, we document the classification and keep the audit log.":
      "Valutiamo ogni feature contro l'Annex III invece di presumere. L'assistenza lawyer-facing non è generalmente high-risk da sola; dove una feature tocca scadenze o conseguenze legali, documentiamo la classificazione e manteniamo l'audit log.",
    // Roadmap
    "We'd rather tell you here than have you find out in procurement. In progress, in order:":
      "Preferiamo dirtelo qui piuttosto che tu lo scopra in procurement. In corso, in ordine:",
    "SOC 2 / ISO 27001 certification — not yet held; audit roadmap planned alongside enterprise rollout. Self-hosting sidesteps the question for many buyers.":
      "Certificazione SOC 2 / ISO 27001 — non ancora detenuta; roadmap di audit pianificata alongside il rollout enterprise. Il self-hosting aggira la domanda per molti acquirenti.",
    "SSO/SAML for hosted team plans (self-hosted deployments can front the engine with their own auth today).":
      "SSO/SAML per piani team hosted (i deployment self-hosted possono fronteggiare il motore con la propria auth oggi).",
    "Source-system permission inheritance for connector-synced content in shared brains — until it lands, we document connectors for single-user brains.":
      "Ereditarietà dei permessi del source-system per contenuti connector-synced in brain condivisi — finché non arriva, documentiamo i connector per brain single-user.",
    // Disclosure
    "Found a vulnerability? Email security@subsum.eu. We confirm receipt within 48 hours, keep you updated, and credit researchers who wish to be named. Please don't test against systems holding real customer data — self-host a copy on your own hardware instead.":
      "Trovata una vulnerabilità? Email a security@subsum.eu. Confermiamo ricezione entro 48 ore, ti aggiorniamo, e accreditiamo i researcher che desiderano essere nominati. Non testare su sistemi con dati reali di clienti — self-hosta una copia sul tuo hardware.",
    // FAQ
    "Where exactly does my data live?": "Dove esattamente vivono i miei dati?",
    "Self-hosted: on your machines, full stop. Hosted: in EU data centers, with the location named in your DPA. Synthesis requests go to the LLM provider configured for your plan — enterprise setups can route through EU endpoints or their own gateway.":
      "Self-hosted: sulle tue macchine, punto. Hosted: in data center UE, con la posizione indicata nel tuo DPA. Le richieste di sintesi vanno al provider LLM configurato per il tuo piano — i setup enterprise possono instradare tramite endpoint UE o il proprio gateway.",
    "Can Subsumio employees read my brain?": "I dipendenti Subsumio possono leggere il mio brain?",
    "Self-hosted: no, structurally — we have no access path. Hosted: access is restricted to break-glass operational procedures, logged, and covered by the DPA and confidentiality commitment. We don't browse customer content, and your content never trains models.":
      "Self-hosted: no, strutturalmente — non abbiamo path di accesso. Hosted: l'accesso è limitato a procedure operative break-glass, loggato, e coperto dal DPA e dall'impegno di riservatezza. Non navighiamo i contenuti dei clienti, e i tuoi contenuti non trainano mai modelli.",
    "What happens to my data if I leave?": "Cosa succede ai miei dati se lascio?",
    "Export everything at any time (the engine's export is a first-class command, not a support ticket). Hosted data is deleted on contract end per the DPA. Self-hosted: it was never with us.":
      "Esporta tutto in qualsiasi momento (l'export del motore è un comando first-class, non un ticket di supporto). I dati hosted sono cancellati alla fine del contratto per il DPA. Self-hosted: non sono mai stati da noi.",
    "Is self-hosting less secure than your cloud?":
      "Il self-hosting è meno sicuro della vostra cloud?",
    "It's the same engine. Security-relevant behavior — scoping, trust boundaries, isolation — is identical and test-pinned. The difference is who operates it: you, instead of us.":
      "È lo stesso motore. Il comportamento security-relevant — scoping, trust boundaries, isolamento — è identico e test-pinnato. La differenza è chi lo opera: tu, invece di noi.",
    "How does the WhatsApp Copilot align with § 203 StGB?":
      "Come si allinea il WhatsApp Copilot con § 203 StGB?",
    "WhatsApp is an optional convenience channel, not a core component. The Copilot uses the Meta Business API with a Data Processing Agreement (DPA). For the most sensitive matter content, we recommend the native mobile app or self-hosting. The Copilot is built so every action requires confirmation — nothing reaches the matter unseen. Firms that choose not to use WhatsApp lose no core functionality.":
      "WhatsApp è un canale di convenienza opzionale, non un componente core. Il Copilot usa la Meta Business API con un Data Processing Agreement (DPA). Per i contenuti più sensibili, raccomandiamo l'app mobile nativa o il self-hosting. Il Copilot è costruito così che ogni azione richiede conferma — nulla raggiunge la pratica non visto. Gli studi che scelgono di non usare WhatsApp non perdono funzionalità core.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enSecurity)), {
    "Subsumio Security — GDPR-compliant AI for law firms":
      "Seguridad Subsumio — IA conforme GDPR para bufetes",
    "Self-host the engine on your hardware, or use EU cloud with DPA. No training on client data, per-user access fuzz-tested for zero leaks.":
      "Self-host del motor en tu hardware, o cloud UE con DPA. Sin training en datos de clientes, acceso por-usuario fuzz-testeado para cero fugas.",
    "Security & data protection": "Seguridad & protección de datos",
    "Your data is the product's value.": "Tus datos son el valor del producto.",
    "So it stays under your control.": "Por eso quedan bajo tu control.",
    "Subsumio is built for professions where confidentiality is law, not preference: law firms in the DACH region. Here is the architecture — and an honest list of what's still in progress.":
      "Subsumio está construido para profesiones donde la confidencialidad es ley, no preferencia: bufetes en la región DACH. Aquí está la arquitectura — y una lista honesta de lo que aún está en progreso.",
    "Two ways to run it": "Dos formas de usarlo",
    "Both keep you in control. Pick by your compliance posture.":
      "Ambas te mantienen en control. Elige según tu postura de compliance.",
    "What we have today": "Lo que tenemos hoy",
    "EU AI Act — where we stand": "EU AI Act — dónde estamos",
    "What we don't have yet — honestly": "Lo que no tenemos aún — honestamente",
    "Responsible disclosure": "Divulgación responsable",
    "Security questions, answered plainly": "Preguntas de seguridad, respondidas claramente",
    "Bring your data protection officer.": "Trae a tu delegado de protección de datos.",
    "We speak their language. Hosted with a DPA, or self-hosted so the question never arises.":
      "Hablamos su idioma. Hosted con DPA, o self-hosted para que la pregunta nunca surja.",
    "Request a demo": "Solicitar una demo",
    // Pillars
    "Self-hosting, fully": "Self-hosting, completo",
    "The complete engine runs on your hardware — the full product, nothing held back. Client data never reaches a third party at all, and your IT controls every system that touches your files.":
      "El motor completo corre en tu hardware — el producto entero, nada retenido. Los datos de clientes nunca llegan a terceros, y tu IT controla cada sistema que toca tus archivos.",
    "Isolation, fuzz-tested": "Aislamiento, fuzz-testeado",
    "Per-user and per-source scoped access is enforced on every read path and fuzz-tested for zero cross-tenant leaks. A user sees their scope — never another's.":
      "El acceso scoped por-usuario y por-fuente se aplica en cada read path y se fuzz-testea para cero leaks cross-tenant. Un usuario ve su scope — nunca el de otro.",
    "No training on your data": "Sin training con tus datos",
    "Your content never trains our or anyone else's models. Synthesis calls go to the LLM provider you configure; self-hosted setups choose their own endpoints or gateways.":
      "Tu contenido nunca entrena nuestros ni otros modelos. Las llamadas de síntesis van al provider LLM que configures; los setups self-hosted eligen sus propios endpoints o gateways.",
    "Auditable by design": "Auditable por design",
    "Deterministic citations on every answer, request logging, and a trust boundary that treats every remote caller as untrusted by default — verify exactly where each claim comes from.":
      "Citaciones deterministas en cada respuesta, request logging, y un trust boundary que trata cada remote caller como untrusted por defecto — verifica exactamente de dónde viene cada afirmación.",
    // Hosting
    "Self-hosted / on-premise (Enterprise)": "Self-hosted / on-premise (Enterprise)",
    "Your hardware, your jurisdiction, your keys": "Tu hardware, tu jurisdicción, tus keys",
    "No third party processes client data — relevant for statutory professional secrecy":
      "Ningún tercero procesa datos de clientes — relevante para el secreto profesional legal",
    "The complete engine, auditable, on your infrastructure":
      "El motor completo, auditable, en tu infraestructura",
    "You manage updates and backups": "Gestionas tú actualizaciones y backups",
    "Managed EU cloud (Pro/Team/Enterprise)": "Cloud UE gestionada (Pro/Team/Enterprise)",
    "EU hosting with a data processing agreement (DPA, Art. 28 GDPR)":
      "Hosting UE con acuerdo de tratamiento de datos (DPA, Art. 28 GDPR)",
    "Contractual confidentiality commitment available for professional-secrecy holders":
      "Compromiso contractual de confidencialidad disponible para titulares de secreto profesional",
    "Encryption in transit and at rest": "Cifrado en tránsito y at rest",
    "Deletion requests handled in one place": "Solicitudes de borrado gestionadas en un solo lugar",
    // Compliance
    "GDPR-aligned processing": "Procesamiento alineado con GDPR",
    "DPA for hosted plans, EU data location, documented subprocessors, deletion on request. Self-hosted deployments process nothing on our side at all.":
      "DPA para planes hosted, ubicación de datos UE, subprocesadores documentados, borrado bajo petición. Los deployments self-hosted no procesan nada de nuestro lado.",
    "Professional secrecy (§ 203 StGB / § 9 RAO / Art. 321 StGB)":
      "Secreto profesional (§ 203 StGB / § 9 RAO / Art. 321 StGB)",
    "Self-hosting means no third party is involved — the cleanest answer to professional-secrecy rules for lawyers in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) and CH (Art. 321 StGB). Hosted plans add a contractual confidentiality commitment on top of the DPA, covering involved parties under § 43e BRAO / § 203 (4) StGB (DE) and equivalent provisions in AT/CH.":
      "El self-hosting significa que ningún tercero está involucrado — la respuesta más limpia a las reglas de secreto profesional para abogados en DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) y CH (Art. 321 StGB). Los planes hosted añaden un compromiso contractual de confidencialidad encima del DPA, cubriendo a las partes involucradas bajo § 43e BRAO / § 203 (4) StGB (DE) y disposiciones equivalentes en AT/CH.",
    "Built-in anonymization before the cloud": "Anonimización integrada antes de la nube",
    "A one-click tool redacts client names, IBANs, case numbers and contact data from any text before it is shared or sent to a cloud LLM — with a re-identification map only the authorized holder keeps. Pattern-based offline; name detection adds an optional LLM layer.":
      "Una herramienta one-click redacta nombres de clientes, IBANs, números de caso y datos de contacto de cualquier texto antes de que se comparta o se envíe a un LLM cloud — con un mapa de re-identificación que solo el titular autorizado conserva. Pattern-based offline; la detección de nombres añade una capa LLM opcional.",
    "Tested isolation": "Aislamiento testeado",
    "Multi-tenant scoping is enforced in the engine and pinned by fuzz tests across every read path — not a dashboard checkbox.":
      "El scoping multi-tenant se aplica en el motor y se fija con fuzz tests en cada read path — no es un checkbox del dashboard.",
    // AI Act
    "The AI Act's transparency duties (Art. 50) and most high-risk obligations apply from 2 August 2026. Our honest position before that date:":
      "Los deberes de transparencia del AI Act (Art. 50) y la mayoría de obligaciones high-risk aplican desde el 2 de agosto de 2026. Nuestra posición honesta antes de esa fecha:",
    "AI output is labelled (Art. 50)": "La salida AI está etiquetada (Art. 50)",
    "Every AI-generated draft and answer is marked as AI-generated — visibly in the app and as a machine-readable marker on the API response and on saved documents. A human signs off; the machine never poses as the author.":
      "Cada borrador y respuesta AI-generada está marcada como AI-generated — visiblemente en la app y como marker machine-readable en la respuesta API y en documentos guardados. Un humano aprueba; la máquina nunca se hace pasar por el autor.",
    "Human oversight, always": "Supervisión humana, siempre",
    "Subsumio drafts and suggests; it never files, books, or sends on its own. A qualified professional reviews and approves every output — the human-in-the-loop the Act requires for high-risk use.":
      "Subsumio redacta y sugiere; nunca presenta, contabiliza, ni envía por sí solo. Un profesional cualificado revisa y aprueba cada output — el human-in-the-loop que el Act requiere para uso high-risk.",
    "Risk classification, documented": "Clasificación de riesgo, documentada",
    "We assess each feature against Annex III instead of assuming. Lawyer-facing assistance is generally not high-risk on its own; where a feature touches deadlines or legal consequences, we document the classification and keep the audit log.":
      "Evaluamos cada feature contra el Annex III en vez de asumir. La asistencia lawyer-facing generalmente no es high-risk por sí sola; donde una feature toca plazos o consecuencias legales, documentamos la clasificación y mantenemos el audit log.",
    // Roadmap
    "We'd rather tell you here than have you find out in procurement. In progress, in order:":
      "Preferimos decírtelo aquí a que lo descubras en procurement. En progreso, en orden:",
    "SOC 2 / ISO 27001 certification — not yet held; audit roadmap planned alongside enterprise rollout. Self-hosting sidesteps the question for many buyers.":
      "Certificación SOC 2 / ISO 27001 — aún no obtenida; roadmap de audit planificada junto al rollout enterprise. El self-hosting esquiva la pregunta para muchos compradores.",
    "SSO/SAML for hosted team plans (self-hosted deployments can front the engine with their own auth today).":
      "SSO/SAML para planes team hosted (los deployments self-hosted pueden poner su propia auth frente al motor hoy).",
    "Source-system permission inheritance for connector-synced content in shared brains — until it lands, we document connectors for single-user brains.":
      "Herencia de permisos del source-system para contenido connector-synced en brains compartidos — hasta que llegue, documentamos connectors para brains single-user.",
    // Disclosure
    "Found a vulnerability? Email security@subsum.eu. We confirm receipt within 48 hours, keep you updated, and credit researchers who wish to be named. Please don't test against systems holding real customer data — self-host a copy on your own hardware instead.":
      "¿Encontraste una vulnerabilidad? Email a security@subsum.eu. Confirmamos recepción en 48 horas, te mantenemos al día, y acreditamos a los researchers que deseen ser nombrados. Por favor no testes contra sistemas con datos reales de clientes — self-hostea una copia en tu propio hardware.",
    // FAQ
    "Where exactly does my data live?": "¿Dónde exactamente viven mis datos?",
    "Self-hosted: on your machines, full stop. Hosted: in EU data centers, with the location named in your DPA. Synthesis requests go to the LLM provider configured for your plan — enterprise setups can route through EU endpoints or their own gateway.":
      "Self-hosted: en tus máquinas, punto. Hosted: en data centers UE, con la ubicación indicada en tu DPA. Las peticiones de síntesis van al provider LLM configurado para tu plan — los setups enterprise pueden rutear a través de endpoints UE o su propio gateway.",
    "Can Subsumio employees read my brain?": "¿Pueden los empleados de Subsumio leer mi brain?",
    "Self-hosted: no, structurally — we have no access path. Hosted: access is restricted to break-glass operational procedures, logged, and covered by the DPA and confidentiality commitment. We don't browse customer content, and your content never trains models.":
      "Self-hosted: no, estructuralmente — no tenemos path de acceso. Hosted: el acceso está restringido a procedimientos operativos break-glass, logueado, y cubierto por el DPA y el compromiso de confidencialidad. No navegan contenido de clientes, y tu contenido nunca entrena modelos.",
    "What happens to my data if I leave?": "¿Qué pasa con mis datos si me voy?",
    "Export everything at any time (the engine's export is a first-class command, not a support ticket). Hosted data is deleted on contract end per the DPA. Self-hosted: it was never with us.":
      "Exporta todo en cualquier momento (el export del motor es un comando first-class, no un ticket de soporte). Los datos hosted se borran al final del contrato según el DPA. Self-hosted: nunca estuvieron con nosotros.",
    "Is self-hosting less secure than your cloud?":
      "¿Es el self-hosting menos seguro que vuestra cloud?",
    "It's the same engine. Security-relevant behavior — scoping, trust boundaries, isolation — is identical and test-pinned. The difference is who operates it: you, instead of us.":
      "Es el mismo motor. El comportamiento security-relevant — scoping, trust boundaries, aislamiento — es idéntico y test-pinnado. La diferencia es quién lo opera: tú, en vez de nosotros.",
    "How does the WhatsApp Copilot align with § 203 StGB?":
      "¿Cómo se alinea el WhatsApp Copilot con § 203 StGB?",
    "WhatsApp is an optional convenience channel, not a core component. The Copilot uses the Meta Business API with a Data Processing Agreement (DPA). For the most sensitive matter content, we recommend the native mobile app or self-hosting. The Copilot is built so every action requires confirmation — nothing reaches the matter unseen. Firms that choose not to use WhatsApp lose no core functionality.":
      "WhatsApp es un canal de conveniencia opcional, no un componente core. El Copilot usa la Meta Business API con un Data Processing Agreement (DPA). Para el contenido más sensible, recomendamos la app móvil nativa o el self-hosting. El Copilot está construido para que cada acción requiera confirmación — nada llega al asunto sin ser visto. Los bufetes que eligen no usar WhatsApp no pierden funcionalidad core.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enSecurity)), {
    "Subsumio Security — GDPR-compliant AI for law firms":
      "Bezpieczeństwo Subsumio — AI zgodne z GDPR dla kancelarii",
    "Self-host the engine on your hardware, or use EU cloud with DPA. No training on client data, per-user access fuzz-tested for zero leaks.":
      "Self-host silnika na twoim sprzęcie, lub chmura UE z DPA. Bez treningu na danych klientów, dostęp per-użytkownik fuzz-testowany na zero wycieków.",
    "Security & data protection": "Bezpieczeństwo & ochrona danych",
    "Your data is the product's value.": "Twoje dane to wartość produktu.",
    "So it stays under your control.": "Dlatego pozostają pod twoją kontrolą.",
    "Subsumio is built for professions where confidentiality is law, not preference: law firms in the DACH region. Here is the architecture — and an honest list of what's still in progress.":
      "Subsumio jest zbudowany dla zawodów, w których poufność to prawo, nie preferencja: kancelarie w regionie DACH. Oto architektura — i szczera lista tego, co jest jeszcze w toku.",
    "Two ways to run it": "Dwa sposoby uruchomienia",
    "Both keep you in control. Pick by your compliance posture.":
      "Oba dają ci kontrolę. Wybierz według swojego profilu compliance.",
    "What we have today": "Co mamy dziś",
    "EU AI Act — where we stand": "EU AI Act — gdzie jesteśmy",
    "What we don't have yet — honestly": "Czego jeszcze nie mamy — szczerze",
    "Responsible disclosure": "Odpowiedzialne ujawnienie",
    "Security questions, answered plainly": "Pytania o bezpieczeństwo, odpowiedziane wprost",
    "Bring your data protection officer.": "Przyprowadź swojego inspektora ochrony danych.",
    "We speak their language. Hosted with a DPA, or self-hosted so the question never arises.":
      "Mówimy ich językiem. Hosted z DPA, lub self-hosted, by pytanie nigdy nie powstało.",
    "Request a demo": "Zamów demo",
    // Pillars
    "Self-hosting, fully": "Self-hosting, w pełni",
    "The complete engine runs on your hardware — the full product, nothing held back. Client data never reaches a third party at all, and your IT controls every system that touches your files.":
      "Kompletny silnik działa na twoim sprzęcie — pełny produkt, niczego nie zatrzymujemy. Dane klientów nigdy nie trafiają do stron trzecich, a twoja IT kontroluje każdy system, który dotyka twoich plików.",
    "Isolation, fuzz-tested": "Izolacja, fuzz-testowana",
    "Per-user and per-source scoped access is enforced on every read path and fuzz-tested for zero cross-tenant leaks. A user sees their scope — never another's.":
      "Dostęp scoped per-użytkownik i per-źródło jest egzekwowany na każdej ścieżce odczytu i fuzz-testowany na zero wycieków cross-tenant. Użytkownik widzi swój scope — nigdy cudzy.",
    "No training on your data": "Brak treningu na twoich danych",
    "Your content never trains our or anyone else's models. Synthesis calls go to the LLM provider you configure; self-hosted setups choose their own endpoints or gateways.":
      "Twoje treści nigdy nie trenują naszych ani niczyich modeli. Wywołania syntezy idą do provider LLM, którego konfigurujesz; setupy self-hosted wybierają własne endpointy lub gatewaye.",
    "Auditable by design": "Auditowalny z założenia",
    "Deterministic citations on every answer, request logging, and a trust boundary that treats every remote caller as untrusted by default — verify exactly where each claim comes from.":
      "Deterministyczne cytaty na każdej odpowiedzi, logowanie żądań, i trust boundary, które traktuje każdego remote caller jako untrusted domyślnie — zweryfikuj dokładnie, skąd pochodzi każda teza.",
    // Hosting
    "Self-hosted / on-premise (Enterprise)": "Self-hosted / on-premise (Enterprise)",
    "Your hardware, your jurisdiction, your keys": "Twój sprzęt, twoja jurysdykcja, twoje klucze",
    "No third party processes client data — relevant for statutory professional secrecy":
      "Żadna strona trzecia nie przetwarza danych klientów — istotne dla ustawowego tajemnicy zawodowej",
    "The complete engine, auditable, on your infrastructure":
      "Kompletny silnik, auditowalny, na twojej infrastrukturze",
    "You manage updates and backups": "Zarządzasz aktualizacje i backupy",
    "Managed EU cloud (Pro/Team/Enterprise)": "Zarządzana chmura UE (Pro/Team/Enterprise)",
    "EU hosting with a data processing agreement (DPA, Art. 28 GDPR)":
      "Hosting UE z umową powierzenia przetwarzania (DPA, Art. 28 GDPR)",
    "Contractual confidentiality commitment available for professional-secrecy holders":
      "Kontraktowe zobowiązanie do poufności dostępne dla osób podlegających tajemnicy zawodowej",
    "Encryption in transit and at rest": "Szyfrowanie w tranzycie i at rest",
    "Deletion requests handled in one place": "Wnioski o usunięcie obsługiwane w jednym miejscu",
    // Compliance
    "GDPR-aligned processing": "Przetwarzanie zgodne z GDPR",
    "DPA for hosted plans, EU data location, documented subprocessors, deletion on request. Self-hosted deployments process nothing on our side at all.":
      "DPA dla planów hosted, lokalizacja danych UE, udokumentowani subprocesory, usunięcie na żądanie. Deployment self-hosted nie przetwarzają nic po naszej stronie.",
    "Professional secrecy (§ 203 StGB / § 9 RAO / Art. 321 StGB)":
      "Tajemnica zawodowa (§ 203 StGB / § 9 RAO / Art. 321 StGB)",
    "Self-hosting means no third party is involved — the cleanest answer to professional-secrecy rules for lawyers in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) and CH (Art. 321 StGB). Hosted plans add a contractual confidentiality commitment on top of the DPA, covering involved parties under § 43e BRAO / § 203 (4) StGB (DE) and equivalent provisions in AT/CH.":
      "Self-hosting oznacza brak zaangażowania stron trzecich — najczystsza odpowiedź na zasady tajemnicy zawodowej dla prawników w DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) i CH (Art. 321 StGB). Plany hosted dodają kontraktowe zobowiązanie do poufności na topie DPA, pokrywając zaangażowane strony pod § 43e BRAO / § 203 (4) StGB (DE) i odpowiednie przepisy w AT/CH.",
    "Built-in anonymization before the cloud": "Wbudowana anonimizacja przed chmurą",
    "A one-click tool redacts client names, IBANs, case numbers and contact data from any text before it is shared or sent to a cloud LLM — with a re-identification map only the authorized holder keeps. Pattern-based offline; name detection adds an optional LLM layer.":
      "Narzędzie one-click redaguje nazwiska klientów, IBANy, numery spraw i dane kontaktowe z dowolnego tekstu, zanim zostanie udostępniony lub wysłany do LLM cloud — z mapą re-identyfikacji, którą zachowuje tylko uprawniony posiadacz. Pattern-based offline; detekcja nazwisk dodaje opcjonalną warstwę LLM.",
    "Tested isolation": "Testowana izolacja",
    "Multi-tenant scoping is enforced in the engine and pinned by fuzz tests across every read path — not a dashboard checkbox.":
      "Scoping multi-tenant jest egzekwowany w silniku i przypięty przez fuzz testy na każdej ścieżce odczytu — nie checkbox w dashboardzie.",
    // AI Act
    "The AI Act's transparency duties (Art. 50) and most high-risk obligations apply from 2 August 2026. Our honest position before that date:":
      "Obowiązki transparentności AI Act (Art. 50) i większość obowiązków high-risk obowiązują od 2 sierpnia 2026. Nasza uczciwa pozycja przed tą datą:",
    "AI output is labelled (Art. 50)": "Wyjście AI jest oznaczone (Art. 50)",
    "Every AI-generated draft and answer is marked as AI-generated — visibly in the app and as a machine-readable marker on the API response and on saved documents. A human signs off; the machine never poses as the author.":
      "Każdy szkic i odpowiedź AI-generowana jest oznaczona jako AI-generated — widocznie w aplikacji i jako marker machine-readable na odpowiedzi API i na zapisanych dokumentach. Człowiek zatwierdza; maszyna nigdy nie podaje się za autora.",
    "Human oversight, always": "Nadzór ludzki, zawsze",
    "Subsumio drafts and suggests; it never files, books, or sends on its own. A qualified professional reviews and approves every output — the human-in-the-loop the Act requires for high-risk use.":
      "Subsumio redaguje i sugeruje; nigdy nie składa, nie księguje, nie wysyła sam. Wykwalifikowany profesjonalista recenzuje i zatwierdza każde wyjście — human-in-the-loop, którego Act wymaga dla użycia high-risk.",
    "Risk classification, documented": "Klasyfikacja ryzyka, udokumentowana",
    "We assess each feature against Annex III instead of assuming. Lawyer-facing assistance is generally not high-risk on its own; where a feature touches deadlines or legal consequences, we document the classification and keep the audit log.":
      "Oceniamy każdą feature względem Annex III zamiast zakładać. Asystencja lawyer-facing generalnie nie jest high-risk sama w sobie; gdzie feature dotyka terminów lub konsekwencji prawnych, dokumentujemy klasyfikację i prowadzimy audit log.",
    // Roadmap
    "We'd rather tell you here than have you find out in procurement. In progress, in order:":
      "Wolimy powiedzieć ci to tutaj niż żebyś odkrył to w procurement. W toku, w kolejności:",
    "SOC 2 / ISO 27001 certification — not yet held; audit roadmap planned alongside enterprise rollout. Self-hosting sidesteps the question for many buyers.":
      "Certyfikacja SOC 2 / ISO 27001 — jeszcze nie posiadana; roadmap audit planowana alongside rollout enterprise. Self-hosting omija pytanie dla wielu kupujących.",
    "SSO/SAML for hosted team plans (self-hosted deployments can front the engine with their own auth today).":
      "SSO/SAML dla planów team hosted (deployment self-hosted mogą postawić własną auth przed silnikiem już dziś).",
    "Source-system permission inheritance for connector-synced content in shared brains — until it lands, we document connectors for single-user brains.":
      "Dziedziczenie uprawnień source-system dla treści connector-synced w współdzielonych brain — dopóki nie wyląduje, dokumentujemy connectory dla brain single-user.",
    // Disclosure
    "Found a vulnerability? Email security@subsum.eu. We confirm receipt within 48 hours, keep you updated, and credit researchers who wish to be named. Please don't test against systems holding real customer data — self-host a copy on your own hardware instead.":
      "Znalazłeś podatność? Email na security@subsum.eu. Potwierdzamy odbiór w 48 godzin, informujemy cię, i uznajemy researcherów, którzy chcą być wymienieni. Proszę nie testować na systemach z prawdziwymi danymi klientów — zamiast tego self-hostuj kopię na własnym sprzęcie.",
    // FAQ
    "Where exactly does my data live?": "Gdzie dokładnie żyją moje dane?",
    "Self-hosted: on your machines, full stop. Hosted: in EU data centers, with the location named in your DPA. Synthesis requests go to the LLM provider configured for your plan — enterprise setups can route through EU endpoints or their own gateway.":
      "Self-hosted: na twoich maszynach, kropka. Hosted: w data center UE, z lokalizacją wskazaną w twoim DPA. Żądania syntezy idą do provider LLM skonfigurowanego dla twojego planu — setupy enterprise mogą rutować przez endpointy UE lub własny gateway.",
    "Can Subsumio employees read my brain?": "Czy pracownicy Subsumio mogą czytać mój brain?",
    "Self-hosted: no, structurally — we have no access path. Hosted: access is restricted to break-glass operational procedures, logged, and covered by the DPA and confidentiality commitment. We don't browse customer content, and your content never trains models.":
      "Self-hosted: nie, strukturalnie — nie mamy ścieżki dostępu. Hosted: dostęp jest ograniczony do procedur operacyjnych break-glass, logowany, i pokryty przez DPA i zobowiązanie do poufności. Nie przeglądamy treści klientów, a twoje treści nigdy nie trenują modeli.",
    "What happens to my data if I leave?": "Co się dzieje z moimi danymi, jeśli odejdę?",
    "Export everything at any time (the engine's export is a first-class command, not a support ticket). Hosted data is deleted on contract end per the DPA. Self-hosted: it was never with us.":
      "Eksportuj wszystko w dowolnym momencie (eksport silnika to komenda first-class, nie ticket support). Dane hosted są usuwane na koniec kontraktu zgodnie z DPA. Self-hosted: nigdy nie były u nas.",
    "Is self-hosting less secure than your cloud?":
      "Czy self-hosting jest mniej bezpieczny niż wasza chmura?",
    "It's the same engine. Security-relevant behavior — scoping, trust boundaries, isolation — is identical and test-pinned. The difference is who operates it: you, instead of us.":
      "To ten sam silnik. Zachowanie security-relevant — scoping, trust boundaries, izolacja — jest identyczne i test-pinnowane. Różnica polega na tym, kto go obsługuje: ty, zamiast nas.",
    "How does the WhatsApp Copilot align with § 203 StGB?":
      "Jak WhatsApp Copilot alignuje się z § 203 StGB?",
    "WhatsApp is an optional convenience channel, not a core component. The Copilot uses the Meta Business API with a Data Processing Agreement (DPA). For the most sensitive matter content, we recommend the native mobile app or self-hosting. The Copilot is built so every action requires confirmation — nothing reaches the matter unseen. Firms that choose not to use WhatsApp lose no core functionality.":
      "WhatsApp to opcjonalny kanał dla wygody, nie komponent core. Copilot używa Meta Business API z Data Processing Agreement (DPA). Dla najbardziej wrażliwych treści, rekomendujemy natywną app mobilną lub self-hosting. Copilot jest zbudowany tak, że każda akcja wymaga potwierdzenia — nic nie trafia do sprawy niezauważone. Kancelarie, które wybierają nie używać WhatsApp, nie tracą funkcjonalności core.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enSecurity)), {
    "Subsumio Security — GDPR-compliant AI for law firms":
      "Sécurité Subsumio — IA conforme RGPD pour cabinets",
    "Self-host the engine on your hardware, or use EU cloud with DPA. No training on client data, per-user access fuzz-tested for zero leaks.":
      "Self-host du moteur sur votre matériel, ou cloud UE avec DPA. Aucun entraînement sur les données clients, accès par-utilisateur fuzz-testé pour zéro fuite.",
    "Security & data protection": "Sécurité & protection des données",
    "Your data is the product's value.": "Vos données sont la valeur du produit.",
    "So it stays under your control.": "Elles restent donc sous votre contrôle.",
    "Subsumio is built for professions where confidentiality is law, not preference: law firms in the DACH region. Here is the architecture — and an honest list of what's still in progress.":
      "Subsumio est conçu pour les professions où la confidentialité est la loi, pas une préférence: cabinets dans la région DACH. Voici l'architecture — et une liste honnête de ce qui est encore en cours.",
    "Two ways to run it": "Deux façons de l'utiliser",
    "Both keep you in control. Pick by your compliance posture.":
      "Les deux vous gardent aux commandes. Choisissez selon votre posture de conformité.",
    "What we have today": "Ce que nous avons aujourd'hui",
    "EU AI Act — where we stand": "EU AI Act — où nous en sommes",
    "What we don't have yet — honestly": "Ce que nous n'avons pas encore — honnêtement",
    "Responsible disclosure": "Divulgation responsable",
    "Security questions, answered plainly": "Questions de sécurité, réponses claires",
    "Bring your data protection officer.": "Amenez votre délégué à la protection des données.",
    "We speak their language. Hosted with a DPA, or self-hosted so the question never arises.":
      "Nous parlons leur langue. Hébergé avec DPA, ou self-hosted pour que la question ne se pose jamais.",
    "Request a demo": "Demander une démo",
    // Pillars
    "Self-hosting, fully": "Self-hosting, complet",
    "The complete engine runs on your hardware — the full product, nothing held back. Client data never reaches a third party at all, and your IT controls every system that touches your files.":
      "Le moteur complet tourne sur votre matériel — le produit entier, rien de retenu. Les données clients n'atteignent jamais un tiers, et votre IT contrôle chaque système qui touche vos fichiers.",
    "Isolation, fuzz-tested": "Isolation, fuzz-testée",
    "Per-user and per-source scoped access is enforced on every read path and fuzz-tested for zero cross-tenant leaks. A user sees their scope — never another's.":
      "L'accès scoped par-utilisateur et par-source est appliqué sur chaque read path et fuzz-testé pour zéro fuite cross-tenant. Un utilisateur voit son scope — jamais celui d'un autre.",
    "No training on your data": "Pas d'entraînement sur vos données",
    "Your content never trains our or anyone else's models. Synthesis calls go to the LLM provider you configure; self-hosted setups choose their own endpoints or gateways.":
      "Votre contenu n'entraîne jamais nos modèles ni ceux d'autrui. Les appels de synthèse vont au provider LLM que vous configurez; les setups self-hosted choisissent leurs propres endpoints ou gateways.",
    "Auditable by design": "Auditable par design",
    "Deterministic citations on every answer, request logging, and a trust boundary that treats every remote caller as untrusted by default — verify exactly where each claim comes from.":
      "Citations déterministes sur chaque réponse, request logging, et un trust boundary qui traite chaque remote caller comme untrusted par défaut — vérifiez exactement d'où provient chaque affirmation.",
    // Hosting
    "Self-hosted / on-premise (Enterprise)": "Self-hosted / on-premise (Enterprise)",
    "Your hardware, your jurisdiction, your keys": "Votre matériel, votre juridiction, vos clés",
    "No third party processes client data — relevant for statutory professional secrecy":
      "Aucun tiers ne traite les données clients — pertinent pour le secret professionnel légal",
    "The complete engine, auditable, on your infrastructure":
      "Le moteur complet, auditable, sur votre infrastructure",
    "You manage updates and backups": "Vous gérez les mises à jour et les backups",
    "Managed EU cloud (Pro/Team/Enterprise)": "Cloud UE géré (Pro/Team/Enterprise)",
    "EU hosting with a data processing agreement (DPA, Art. 28 GDPR)":
      "Hosting UE avec accordé de traitement de données (DPA, Art. 28 GDPR)",
    "Contractual confidentiality commitment available for professional-secrecy holders":
      "Engagement contractuel de confidentialité disponible pour les titulaires de secret professionnel",
    "Encryption in transit and at rest": "Chiffrement en transit et at rest",
    "Deletion requests handled in one place": "Demandes de suppression traitées en un seul endroit",
    // Compliance
    "GDPR-aligned processing": "Traitement aligné RGPD",
    "DPA for hosted plans, EU data location, documented subprocessors, deletion on request. Self-hosted deployments process nothing on our side at all.":
      "DPA pour les plans hosted, localisation des données UE, sous-processors documentés, suppression sur demande. Les déploiements self-hosted ne traitent rien de notre côté.",
    "Professional secrecy (§ 203 StGB / § 9 RAO / Art. 321 StGB)":
      "Secret professionnel (§ 203 StGB / § 9 RAO / Art. 321 StGB)",
    "Self-hosting means no third party is involved — the cleanest answer to professional-secrecy rules for lawyers in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) and CH (Art. 321 StGB). Hosted plans add a contractual confidentiality commitment on top of the DPA, covering involved parties under § 43e BRAO / § 203 (4) StGB (DE) and equivalent provisions in AT/CH.":
      "Le self-hosting signifie aucun tiers impliqué — la réponse la plus propre aux règles de secret professionnel pour les avocats en DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) et CH (Art. 321 StGB). Les plans hosted ajoutent un engagement contractuel de confidentialité au-dessus du DPA, couvrant les parties impliquées sous § 43e BRAO / § 203 (4) StGB (DE) et dispositions équivalentes en AT/CH.",
    "Built-in anonymization before the cloud": "Anonymisation intégrée avant le cloud",
    "A one-click tool redacts client names, IBANs, case numbers and contact data from any text before it is shared or sent to a cloud LLM — with a re-identification map only the authorized holder keeps. Pattern-based offline; name detection adds an optional LLM layer.":
      "Un outil one-click rédacte les noms de clients, IBANs, numéros de dossier et données de contact de tout texte avant qu'il soit partagé ou envoyé à un LLM cloud — avec une carte de ré-identification que seul le titulaire autorisé conserve. Pattern-based offline; la détection de noms ajoute une couche LLM optionnelle.",
    "Tested isolation": "Isolation testée",
    "Multi-tenant scoping is enforced in the engine and pinned by fuzz tests across every read path — not a dashboard checkbox.":
      "Le scoping multi-tenant est appliqué dans le moteur et épinglé par des fuzz tests sur chaque read path — pas une checkbox de dashboard.",
    // AI Act
    "The AI Act's transparency duties (Art. 50) and most high-risk obligations apply from 2 August 2026. Our honest position before that date:":
      "Les devoirs de transparence de l'AI Act (Art. 50) et la plupart des obligations high-risk s'appliquent à partir du 2 août 2026. Notre position honnête avant cette date:",
    "AI output is labelled (Art. 50)": "La sortie AI est étiquetée (Art. 50)",
    "Every AI-generated draft and answer is marked as AI-generated — visibly in the app and as a machine-readable marker on the API response and on saved documents. A human signs off; the machine never poses as the author.":
      "Chaque brouillon et réponse AI-générée est marqué comme AI-generated — visiblement dans l'app et comme marker machine-readable sur la réponse API et sur les documents sauvegardés. Un humain valide; la machine ne se pose jamais en auteur.",
    "Human oversight, always": "Supervision humaine, toujours",
    "Subsumio drafts and suggests; it never files, books, or sends on its own. A qualified professional reviews and approves every output — the human-in-the-loop the Act requires for high-risk use.":
      "Subsumio rédige et suggère; il ne dépose, ne comptabilise, n'envoie jamais seul. Un professionnel qualifié révise et approuve chaque output — l'human-in-the-loop que l'Act exige pour usage high-risk.",
    "Risk classification, documented": "Classification des risques, documentée",
    "We assess each feature against Annex III instead of assuming. Lawyer-facing assistance is generally not high-risk on its own; where a feature touches deadlines or legal consequences, we document the classification and keep the audit log.":
      "Nous évaluons chaque feature contre l'Annex III au lieu de supposer. L'assistance lawyer-facing n'est généralement pas high-risk seule; quand une feature touche aux délais ou conséquences juridiques, nous documentons la classification et conservons l'audit log.",
    // Roadmap
    "We'd rather tell you here than have you find out in procurement. In progress, in order:":
      "Nous préférons vous le dire ici plutôt que vous le découvriez en procurement. En cours, dans l'ordre:",
    "SOC 2 / ISO 27001 certification — not yet held; audit roadmap planned alongside enterprise rollout. Self-hosting sidesteps the question for many buyers.":
      "Certification SOC 2 / ISO 27001 — pas encore obtenue; roadmap d'audit planifiée alongside le rollout enterprise. Le self-hosting esquive la question pour de nombreux acheteurs.",
    "SSO/SAML for hosted team plans (self-hosted deployments can front the engine with their own auth today).":
      "SSO/SAML pour les plans team hosted (les déploiements self-hosted peuvent placer leur propre auth devant le moteur dès aujourd'hui).",
    "Source-system permission inheritance for connector-synced content in shared brains — until it lands, we document connectors for single-user brains.":
      "Héritage des permissions source-system pour le contenu connector-synced dans les brains partagés — en attendant, nous documentons les connectors pour les brains single-user.",
    // Disclosure
    "Found a vulnerability? Email security@subsum.eu. We confirm receipt within 48 hours, keep you updated, and credit researchers who wish to be named. Please don't test against systems holding real customer data — self-host a copy on your own hardware instead.":
      "Trouvé une vulnérabilité? Email à security@subsum.eu. Nous confirmons la réception sous 48 heures, vous tenons informé, et créditons les researchers qui souhaitent être nommés. Ne testez pas sur des systèmes contenant des données clients réelles — self-hostez une copie sur votre propre matériel.",
    // FAQ
    "Where exactly does my data live?": "Où exactement vivent mes données?",
    "Self-hosted: on your machines, full stop. Hosted: in EU data centers, with the location named in your DPA. Synthesis requests go to the LLM provider configured for your plan — enterprise setups can route through EU endpoints or their own gateway.":
      "Self-hosted: sur vos machines, point final. Hosted: dans des data centers UE, avec la localisation indiquée dans votre DPA. Les requêtes de synthèse vont au provider LLM configuré pour votre plan — les setups enterprise peuvent router via des endpoints UE ou leur propre gateway.",
    "Can Subsumio employees read my brain?": "Les employés de Subsumio peuvent-ils lire mon brain?",
    "Self-hosted: no, structurally — we have no access path. Hosted: access is restricted to break-glass operational procedures, logged, and covered by the DPA and confidentiality commitment. We don't browse customer content, and your content never trains models.":
      "Self-hosted: non, structurellement — nous n'avons pas de path d'accès. Hosted: l'accès est restreint aux procédures opérationnelles break-glass, logué, et couvert par le DPA et l'engagement de confidentialité. Nous ne naviguons pas le contenu des clients, et votre contenu n'entraîne jamais de modèles.",
    "What happens to my data if I leave?": "Qu'arrive-t-il à mes données si je pars?",
    "Export everything at any time (the engine's export is a first-class command, not a support ticket). Hosted data is deleted on contract end per the DPA. Self-hosted: it was never with us.":
      "Exportez tout à tout moment (l'export du moteur est une commande first-class, pas un ticket de support). Les données hosted sont supprimées en fin de contrat selon le DPA. Self-hosted: elles n'ont jamais été chez nous.",
    "Is self-hosting less secure than your cloud?":
      "Le self-hosting est-il moins sécurisé que votre cloud?",
    "It's the same engine. Security-relevant behavior — scoping, trust boundaries, isolation — is identical and test-pinned. The difference is who operates it: you, instead of us.":
      "C'est le même moteur. Le comportement security-relevant — scoping, trust boundaries, isolation — est identique et test-pinné. La différence est qui l'opère: vous, au lieu de nous.",
    "How does the WhatsApp Copilot align with § 203 StGB?":
      "Comment le WhatsApp Copilot s'aligne-t-il avec § 203 StGB?",
    "WhatsApp is an optional convenience channel, not a core component. The Copilot uses the Meta Business API with a Data Processing Agreement (DPA). For the most sensitive matter content, we recommend the native mobile app or self-hosting. The Copilot is built so every action requires confirmation — nothing reaches the matter unseen. Firms that choose not to use WhatsApp lose no core functionality.":
      "WhatsApp est un canal de convenance optionnel, pas un composant core. Le Copilot utilise la Meta Business API avec un Data Processing Agreement (DPA). Pour le contenu le plus sensible, nous recommandons l'app mobile native ou le self-hosting. Le Copilot est construit pour que chaque action requière confirmation — rien n'atteint le dossier sans être vu. Les cabinets qui choisissent de ne pas utiliser WhatsApp ne perdent aucune fonctionnalité core.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enSecurity)), {
    "Subsumio Security — GDPR-compliant AI for law firms":
      "Subsumio Beveiliging — GDPR-conforme AI voor advocatenkantoren",
    "Self-host the engine on your hardware, or use EU cloud with DPA. No training on client data, per-user access fuzz-tested for zero leaks.":
      "Self-host de engine op je hardware, of EU-cloud met DPA. Geen training op klantdata, per-gebruiker toegang fuzz-getest op zero leaks.",
    "Security & data protection": "Beveiliging & gegevensbescherming",
    "Your data is the product's value.": "Jouw data is de waarde van het product.",
    "So it stays under your control.": "Daarom blijft het onder jouw controle.",
    "Subsumio is built for professions where confidentiality is law, not preference: law firms in the DACH region. Here is the architecture — and an honest list of what's still in progress.":
      "Subsumio is gebouwd voor beroepen waar vertrouwelijkheid wet is, geen voorkeur: advocatenkantoren in de DACH-regio. Hier is de architectuur — en een eerlijke lijst van wat nog in ontwikkeling is.",
    "Two ways to run it": "Twee manieren om het te draaien",
    "Both keep you in control. Pick by your compliance posture.":
      "Beide houden je in controle. Kies op basis van je compliance-houding.",
    "What we have today": "Wat we vandaag hebben",
    "EU AI Act — where we stand": "EU AI Act — waar we staan",
    "What we don't have yet — honestly": "Wat we nog niet hebben — eerlijk",
    "Responsible disclosure": "Verantwoorde openbaarmaking",
    "Security questions, answered plainly": "Beveiligingsvragen, helder beantwoord",
    "Bring your data protection officer.": "Breng je functionaris voor gegevensbescherming mee.",
    "We speak their language. Hosted with a DPA, or self-hosted so the question never arises.":
      "We spreken hun taal. Hosted met DPA, of self-hosted zodat de vraag nooit opkomt.",
    "Request a demo": "Vraag een demo aan",
    // Pillars
    "Self-hosting, fully": "Self-hosting, volledig",
    "The complete engine runs on your hardware — the full product, nothing held back. Client data never reaches a third party at all, and your IT controls every system that touches your files.":
      "De complete engine draait op je hardware — het volledige product, niets achtergehouden. Klantdata bereikt nooit een derde partij, en jouw IT controleert elk systeem dat jouw bestanden raakt.",
    "Isolation, fuzz-tested": "Isolatie, fuzz-getest",
    "Per-user and per-source scoped access is enforced on every read path and fuzz-tested for zero cross-tenant leaks. A user sees their scope — never another's.":
      "Per-gebruiker en per-bron scoped toegang wordt afgedwongen op elk read path en fuzz-getest op zero cross-tenant leaks. Een gebruiker ziet zijn scope — nooit die van een ander.",
    "No training on your data": "Geen training op jouw data",
    "Your content never trains our or anyone else's models. Synthesis calls go to the LLM provider you configure; self-hosted setups choose their own endpoints or gateways.":
      "Jouw content traint nooit onze of andermans modellen. Synthesis-calls gaan naar de LLM-provider die je configureert; self-hosted setups kiezen hun eigen endpoints of gateways.",
    "Auditable by design": "Auditabel by design",
    "Deterministic citations on every answer, request logging, and a trust boundary that treats every remote caller as untrusted by default — verify exactly where each claim comes from.":
      "Deterministische citaties op elk antwoord, request logging, en een trust boundary die elke remote caller als untrusted by default behandelt — verifieer exact waar elke claim vandaan komt.",
    // Hosting
    "Self-hosted / on-premise (Enterprise)": "Self-hosted / on-premise (Enterprise)",
    "Your hardware, your jurisdiction, your keys": "Jouw hardware, jouw jurisdictie, jouw keys",
    "No third party processes client data — relevant for statutory professional secrecy":
      "Geen derde partij verwerkt klantdata — relevant voor wettelijke beroepsgeheim",
    "The complete engine, auditable, on your infrastructure":
      "De complete engine, auditabel, op jouw infrastructuur",
    "You manage updates and backups": "Jij beheert updates en backups",
    "Managed EU cloud (Pro/Team/Enterprise)": "Beheerde EU-cloud (Pro/Team/Enterprise)",
    "EU hosting with a data processing agreement (DPA, Art. 28 GDPR)":
      "EU-hosting met een verwerkersovereenkomst (DPA, Art. 28 GDPR)",
    "Contractual confidentiality commitment available for professional-secrecy holders":
      "Contractuele vertrouwelijkheidsverklaring beschikbaar voor beroepsgeheimdragers",
    "Encryption in transit and at rest": "Versleuteling in transit en at rest",
    "Deletion requests handled in one place": "Verwijderingsverzoeken op één plek afgehandeld",
    // Compliance
    "GDPR-aligned processing": "GDPR-aligned verwerking",
    "DPA for hosted plans, EU data location, documented subprocessors, deletion on request. Self-hosted deployments process nothing on our side at all.":
      "DPA voor hosted plannen, EU-datalocatie, gedocumenteerde subprocessors, verwijdering op verzoek. Self-hosted deployments verwerken niets aan onze kant.",
    "Professional secrecy (§ 203 StGB / § 9 RAO / Art. 321 StGB)":
      "Beroepsgeheim (§ 203 StGB / § 9 RAO / Art. 321 StGB)",
    "Self-hosting means no third party is involved — the cleanest answer to professional-secrecy rules for lawyers in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) and CH (Art. 321 StGB). Hosted plans add a contractual confidentiality commitment on top of the DPA, covering involved parties under § 43e BRAO / § 203 (4) StGB (DE) and equivalent provisions in AT/CH.":
      "Self-hosting betekent geen derde partij betrokken — het zuiverste antwoord op beroepsgeheimregels voor advocaten in DE (§ 203 StGB, § 43e BRAO), AT (§ 9 RAO) en CH (Art. 321 StGB). Hosted plannen voegen een contractuele vertrouwelijkheidsverklaring toe bovenop de DPA, betreffende betrokken partijen onder § 43e BRAO / § 203 (4) StGB (DE) en equivalente bepalingen in AT/CH.",
    "Built-in anonymization before the cloud": "Ingebouwde anonimisering vóór de cloud",
    "A one-click tool redacts client names, IBANs, case numbers and contact data from any text before it is shared or sent to a cloud LLM — with a re-identification map only the authorized holder keeps. Pattern-based offline; name detection adds an optional LLM layer.":
      "Een one-click tool redigeert klantnamen, IBANs, zaaknummers en contactdata uit elke tekst voordat deze wordt gedeeld of naar een cloud-LLM wordt gestuurd — met een re-identificatie-map die alleen de bevoegde houder bewaart. Pattern-based offline; naamdetectie voegt een optionele LLM-laag toe.",
    "Tested isolation": "Geteste isolatie",
    "Multi-tenant scoping is enforced in the engine and pinned by fuzz tests across every read path — not a dashboard checkbox.":
      "Multi-tenant scoping wordt afgedwongen in de engine en vastgepind door fuzz tests op elk read path — geen dashboard-checkbox.",
    // AI Act
    "The AI Act's transparency duties (Art. 50) and most high-risk obligations apply from 2 August 2026. Our honest position before that date:":
      "De transparantieverplichtingen van de AI Act (Art. 50) en de meeste high-risk verplichtingen gelden vanaf 2 augustus 2026. Onze eerlijke positie vóór die datum:",
    "AI output is labelled (Art. 50)": "AI-output is gelabeld (Art. 50)",
    "Every AI-generated draft and answer is marked as AI-generated — visibly in the app and as a machine-readable marker on the API response and on saved documents. A human signs off; the machine never poses as the author.":
      "Elke AI-gegenereerde draft en antwoord is gemarkeerd als AI-generated — zichtbaar in de app en als machine-readable marker op de API-response en op opgeslagen documenten. Een mens keurt goed; de machine doet zich nooit voor als auteur.",
    "Human oversight, always": "Menselijke supervisie, altijd",
    "Subsumio drafts and suggests; it never files, books, or sends on its own. A qualified professional reviews and approves every output — the human-in-the-loop the Act requires for high-risk use.":
      "Subsumio draft en stelt voor; het dient nooit in, boekt nooit, verzendt nooit zelf. Een gekwalificeerde professional reviewt en keurt elke output goed — de human-in-the-loop die de Act vereist voor high-risk gebruik.",
    "Risk classification, documented": "Risicoclassificatie, gedocumenteerd",
    "We assess each feature against Annex III instead of assuming. Lawyer-facing assistance is generally not high-risk on its own; where a feature touches deadlines or legal consequences, we document the classification and keep the audit log.":
      "We beoordelen elke feature tegen Annex III in plaats van aan te nemen. Lawyer-facing assistentie is over het algemeen niet high-risk op zichzelf; waar een feature termijnen of juridische consequenties raakt, documenteren we de classificatie en houden we de audit log bij.",
    // Roadmap
    "We'd rather tell you here than have you find out in procurement. In progress, in order:":
      "We vertellen het liever hier dan dat je het ontdekt in procurement. In ontwikkeling, in volgorde:",
    "SOC 2 / ISO 27001 certification — not yet held; audit roadmap planned alongside enterprise rollout. Self-hosting sidesteps the question for many buyers.":
      "SOC 2 / ISO 27001 certificering — nog niet behaald; audit-roadmap gepland alongside enterprise rollout. Self-hosting omzeilt de vraag voor veel kopers.",
    "SSO/SAML for hosted team plans (self-hosted deployments can front the engine with their own auth today).":
      "SSO/SAML voor hosted team plannen (self-hosted deployments kunnen de engine vandaag achter hun eigen auth plaatsen).",
    "Source-system permission inheritance for connector-synced content in shared brains — until it lands, we document connectors for single-user brains.":
      "Source-system permissie-overerving voor connector-gesyncte content in gedeelde brains — tot het er is, documenteren we connectors voor single-user brains.",
    // Disclosure
    "Found a vulnerability? Email security@subsum.eu. We confirm receipt within 48 hours, keep you updated, and credit researchers who wish to be named. Please don't test against systems holding real customer data — self-host a copy on your own hardware instead.":
      "Kwetsbaarheid gevonden? Email naar security@subsum.eu. We bevestigen ontvangst binnen 48 uur, houden je op de hoogte, en crediteren researchers die genoemd willen worden. Test alsjeblieft niet tegen systemen met echte klantdata — self-host in plaats daarvan een kopie op je eigen hardware.",
    // FAQ
    "Where exactly does my data live?": "Waar precies leeft mijn data?",
    "Self-hosted: on your machines, full stop. Hosted: in EU data centers, with the location named in your DPA. Synthesis requests go to the LLM provider configured for your plan — enterprise setups can route through EU endpoints or their own gateway.":
      "Self-hosted: op jouw machines, punt. Hosted: in EU data centers, met de locatie genoemd in jouw DPA. Synthesis-verzoeken gaan naar de LLM-provider die voor jouw plan is geconfigureerd — enterprise setups kunnen via EU-endpoints of hun eigen gateway routen.",
    "Can Subsumio employees read my brain?": "Kunnen Subsumio-medewerkers mijn brain lezen?",
    "Self-hosted: no, structurally — we have no access path. Hosted: access is restricted to break-glass operational procedures, logged, and covered by the DPA and confidentiality commitment. We don't browse customer content, and your content never trains models.":
      "Self-hosted: nee, structureel — we hebben geen access path. Hosted: toegang is beperkt tot break-glass operationele procedures, gelogd, en gedekt door de DPA en vertrouwelijkheidsverklaring. We browsen geen klantcontent, en jouw content traint nooit modellen.",
    "What happens to my data if I leave?": "Wat gebeurt er met mijn data als ik vertrek?",
    "Export everything at any time (the engine's export is a first-class command, not a support ticket). Hosted data is deleted on contract end per the DPA. Self-hosted: it was never with us.":
      "Exporteer alles op elk moment (de export van de engine is een first-class command, geen support-ticket). Hosted data wordt verwijderd op contracteinde volgens de DPA. Self-hosted: het was nooit bij ons.",
    "Is self-hosting less secure than your cloud?":
      "Is self-hosting minder veilig dan jullie cloud?",
    "It's the same engine. Security-relevant behavior — scoping, trust boundaries, isolation — is identical and test-pinned. The difference is who operates it: you, instead of us.":
      "Het is dezelfde engine. Security-relevant gedrag — scoping, trust boundaries, isolatie — is identiek en test-pinned. Het verschil is wie het beheert: jij, in plaats van wij.",
    "How does the WhatsApp Copilot align with § 203 StGB?":
      "Hoe aligneert de WhatsApp Copilot met § 203 StGB?",
    "WhatsApp is an optional convenience channel, not a core component. The Copilot uses the Meta Business API with a Data Processing Agreement (DPA). For the most sensitive matter content, we recommend the native mobile app or self-hosting. The Copilot is built so every action requires confirmation — nothing reaches the matter unseen. Firms that choose not to use WhatsApp lose no core functionality.":
      "WhatsApp is een optioneel convenience-kanaal, geen kerncomponent. De Copilot gebruikt de Meta Business API met een Data Processing Agreement (DPA). Voor de meest gevoelige dossiercontent raden we de native mobiele app of self-hosting aan. De Copilot is zo gebouwd dat elke actie bevestiging vereist — niets bereikt het dossier ongezien. Kantoren die ervoor kiezen WhatsApp niet te gebruiken, verliezen geen kernfunctionaliteit.",
  }),
};
