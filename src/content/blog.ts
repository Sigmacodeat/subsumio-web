import { PROOF } from "./proof-points";
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  authorRole: string;
  tags: string[];
  readMinutes: number;
  content: { heading?: string; paragraphs: string[] }[];
}

const posts: BlogPost[] = [
  {
    slug: "ki-kanzleisoftware-berufsgeheimnis-rao",
    title:
      "KI-Kanzleisoftware und § 9 Abs. 2 RAO: Wie Anwälte in Österreich mandantendaten-sicher bleiben",
    description:
      "Praktischer Leitfaden: Wie KI-Kanzleisoftware mit § 9 Abs. 2 RAO, DSGVO und Berufsgeheimnis-Pflichten vereinbar ist — Self-Hosting vs. EU-Cloud, AVV, Verschlüsselung.",
    date: "2026-06-20",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["§ 9 Abs. 2 RAO", "DSGVO", "Berufsgeheimnis", "Self-Hosting"],
    readMinutes: 7,
    content: [
      {
        paragraphs: [
          "Anwälte in Österreich stehen vor derselben Frage, wenn sie KI-Tools einführen: Ist das mit meiner Schweigepflicht vereinbar? Die kurze Antwort: Ja — wenn die Architektur für Berufsgeheimnisträger gebaut ist. Die lange Antwort steht in diesem Artikel.",
        ],
      },
      {
        heading: "§ 9 Abs. 2 RAO: Was erlaubt ist und was nicht",
        paragraphs: [
          "§ 9 Abs. 2 RAO verpflichtet Rechtsanwälte zur Verschwiegenheit über anvertraute Angelegenheiten und bekannt gewordene Tatsachen, deren Geheimhaltung im Interesse der Partei liegt. Bei KI-Software müssen Kanzleien daher insbesondere Datenflüsse, Zugriffe, Auftragsverarbeitung und technische Schutzmaßnahmen vor dem Einsatz prüfen.",
          "Die Lösung ist architektonisch: Entweder bleibt die Datenverarbeitung vollständig innerhalb der Kanzlei (Self-Hosting) oder sie erfolgt in einer EU-Cloud mit AVV, mandantenseparierter Verschlüsselung und ohne Zugriff Dritter auf unverschlüsselte Daten.",
        ],
      },
      {
        heading: "Self-Hosting vs. EU-Cloud: Welche Option für welche Kanzlei?",
        paragraphs: [
          "Self-Hosting bedeutet: Die KI-Engine läuft auf eigener Hardware, mit eigenen Schlüsseln. Mandantendaten verlassen niemals die Kanzlei. Das ist die sicherste Option — erfordert aber IT-Ressourcen oder einen verwalteten Server.",
          "Die EU-Cloud ist die einfachere Option: Keine IT-Ressourcen nötig, kein Server-Management. Der AVV regelt die Auftragsverarbeitung. Die Verschlüsselung erfolgt mandantensepariert — keine andere Kanzlei hat Zugriff auf deine Daten.",
          "Beide Betriebsmodelle können die Einhaltung der Verschwiegenheit unterstützen. Ob die konkrete Ausgestaltung den berufs- und datenschutzrechtlichen Anforderungen entspricht, muss die Kanzlei anhand ihrer Datenflüsse und Verträge prüfen.",
        ],
      },
      {
        heading: "DSGVO: AVV, Verschlüsselung, Mandantenseparation",
        paragraphs: [
          "Die DSGVO fordert technische und organisatorische Maßnahmen (TOMs). Für KI-Kanzleisoftware sind die kritischen TOMs: Verschlüsselung at-rest und in-transit, mandantenseparierte Verarbeitung, kein Training auf Mandantendaten, AVV mit dem Cloud-Anbieter, und Löschkonzept für Mandantendaten nach Beendigung.",
          "Subsumio erfüllt alle diese Anforderungen: AES-256-Verschlüsselung at-rest, TLS 1.3 in-transit, mandantenseparierte Verarbeitung, kein Training auf geteilten Modellen, und ein AVV liegt vor.",
        ],
      },
      {
        heading: "Praktische Checkliste für die Einführung",
        paragraphs: [
          "1. Entscheide: Self-Hosting oder EU-Cloud. 2. Prüf den AVV. 3. Stell sicher, dass kein Training mit deinen Daten erfolgt. 4. Dokumentiere die TOMs. 5. Informiere deine Mandanten über die KI-Nutzung in der Mandatsvereinbarung.",
          "Diese Checkliste unterstützt die berufs- und datenschutzrechtliche Prüfung der Einführung. Sie ersetzt weder die Prüfung des konkreten Betriebsmodells noch eine Datenschutz-Folgenabschätzung, sofern eine solche erforderlich ist.",
        ],
      },
    ],
  },
  {
    slug: "fristenmanagement-ki-automatisierung",
    title:
      "Fristenmanagement mit KI: Notfristen, Berufungsfristen und Monatsarithmetik automatisiert",
    description:
      "Wie KI-gestütztes Fristenmanagement Notfristen nach ZPO und ABGB automatisch berechnet — mit Wochenend- und Feiertagsverschiebung, E-Mail-Digest und Kalender-Integration.",
    date: "2026-06-15",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["Fristenmanagement", "ZPO", "ABGB", "Automatisierung"],
    readMinutes: 6,
    content: [
      {
        paragraphs: [
          "Fristen sind der häufigste Grund für Haftpflichtschäden in Anwaltskanzleien. Eine verpasste Notfrist kann einen Mandanten um sein Recht bringen — und den Anwält um seine Haftung. KI-gestütztes Fristenmanagement automatisiert die Berechnung und Überwachung, so dass nichts mehr durchs Raster fällt.",
        ],
      },
      {
        heading: "Notfristen und Berufungsfristen: Die kritischen Fristen",
        paragraphs: [
          "Notfristen (§ 5 ZPO) sind unabänderlich — etwa die vierwöchige Berufungsfrist nach § 510 ZPO. Wer sie versäumt, verliert das Rechtsmittel.",
          "Die Berechnung klingt einfach, wird aber komplex, wenn Feiertage, Wochenenden und Monatsenden zusammenspielen. Eine Monatsfrist, die am 31. Januar beginnt, endet am 28. Februar (oder 29. im Schaltjahr) — nicht am 31. März.",
        ],
      },
      {
        heading: "Monatsarithmetik: Wo manuelle Berechnung scheitert",
        paragraphs: [
          "Die ZPO-Rechtsprechung verlangt korrekte Monatsarithmetik: Eine Frist von einem Monat endet am selben Tag des Folgemonats. Fehlt dieser Tag (z.B. 31. Februar), endet die Frist am letzten Tag des Folgemonats. Feiertage verschieben die Frist auf den nächsten Werktag.",
          "Manuelle Berechnung ist fehleranfällig — besonders bei Fristen, die über Feiertage oder Monatswechsel fallen. KI-gestütztes Fristenmanagement berechnet diese automatisch, mit korrekter Berücksichtigung von Bundesland-spezifischen Feiertagen.",
        ],
      },
      {
        heading: "Automatisierter E-Mail-Digest: Was kritisch ist, bevor es zu spät ist",
        paragraphs: [
          "Subsumio sendet einen täglichen E-Mail-Digest mit allen Fristen, die in den nächsten 7 Tagen ablaufen. Kritische Fristen (Notfristen) werden 3 Tage vor Ablauf markiert. So hast du immer einen Vorlauf — und nichts überrascht dich.",
          "Der Digest ist kein Ersatz für die manuelle Prüfung, sondern ein Safety-Net. Die endgültige Fristkontrolle bleibt beim Anwalt — die KI sorgt nur dafür, dass du nichts übersiehst.",
        ],
      },
    ],
  },
  {
    slug: "ki-antworten-mit-fundstellen-vs-halluzination",
    title:
      "Belegte KI-Antworten vs. Halluzination: Warum Fundstellen der einzige Weg für Anwälte sind",
    description:
      "Warum KI-Antworten ohne Fundstellen für Anwälte wertlos sind — und wie belegte Antworten mit seitengenauen Zitaten das Vertrauen in KI-Ergebnisse herstellen.",
    date: "2026-06-10",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["KI-Antworten", "Fundstellen", "Halluzination", "Retrieval"],
    readMinutes: 5,
    content: [
      {
        paragraphs: [
          "ChatGPT und andere LLMs halluzinieren — das ist bekannt. Für Anwälte ist eine halluzinierte Antwort nicht nur wertlos, sondern gefährlich: Eine falsche Quellenangabe im Schriftsatz kann zum Haftpflichtfall werden. Die Lösung: belegte KI-Antworten mit seitengenauen Fundstellen.",
        ],
      },
      {
        heading: "Was ist eine belegte KI-Antwort?",
        paragraphs: [
          "Eine belegte KI-Antwort nennt für jede Aussage die exakte Fundstelle: Dokument, Seite, Absatz. Der Anwalt prüft in einem Klick, ob das Zitat stimmt. Stimmt es nicht — verwirft er die Antwort. Stimmt es — übernimmt er es in den Schriftsatz.",
          "Das ist der fundamentale Unterschied zu ChatGPT: Nicht die Antwort steht im Vordergrund, sondern die Fundstelle. Die Antwort ist nur so gut wie die Quelle — und die Quelle ist überprüfbar.",
        ],
      },
      {
        heading: "Gap-Analyse: Wenn die Akte keine Antwort enthält",
        paragraphs: [
          "Ebenso wichtig wie belegte Antworten ist die Gap-Analyse: Wenn die Akte keine Antwort auf die Frage enthält, sagt die KI das explizit. Statt zu halluzinieren, zeigt sie an: 'In den vorliegenden Dokumenten fehlt Information zu X.'",
          "Das ist für Anwälte wertvoll: Du weißt, dass du weitere Recherche benötigst oder den Mandanten nach Informationen fragen musst — anstatt auf eine halluzinierte Antwort zu vertrauen.",
        ],
      },
      {
        heading: `${PROOF.recall8.metric}: Warum ${PROOF.recall8.value} wichtig sind`,
        paragraphs: [
          `${PROOF.recall8.metric} ist die Metrik, die misst, ob das relevante Dokument unter den Top-8-Retrievergebnissen ist. ${PROOF.recall8.value} bedeutet: In ${PROOF.recall8.value} der Fälle findet die KI das richtige Dokument. Das ist keine Marketing-Zahl — es ist eine reproduzierbare Benchmark auf ${PROOF.recall8.sampleSize} ${PROOF.recall8.benchmark}-Fragen.`,
          "Für Anwälte bedeutet das: Wenn du eine Frage stellst, findet die KI mit sehr hoher Wahrscheinlichkeit das relevante Dokument in deinen Akten. Und wenn sie es nicht findet — sagt sie es dir.",
        ],
      },
    ],
  },
  {
    slug: "kollisionspruefung-ki-interessenskonflikte",
    title:
      "Kollisionsprüfung mit KI: Wie du Interessenskonflikte in Sekunden statt Stunden findest",
    description:
      "Warum die manuelle Kollisionsprüfung in Kanzleien systematisch unterläuft — und wie ein Kanzlei-Brain Interessenskonflikte über Jahre und Mandanten hinweg zuverlässig aufdeckt.",
    date: "2026-06-25",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["Kollisionsprüfung", "Interessenskonflikt", "Standesrecht", "Compliance"],
    readMinutes: 6,
    content: [
      {
        paragraphs: [
          "Die Kollisionsprüfung gehört zu den unterschätzten Pflichten der Kanzleiorganisation. Ein übersehener Interessenskonflikt kann den Verlust des Mandats bedeuten — im schlimmsten Fall Disziplinarverfahren und Haftung. Trotzdem läuft sie in vielen Kanzleien über Gedächtnis, Excel oder die Frage 'kennt den jemand von uns?'.",
        ],
      },
      {
        heading: "Warum die klassische Prüfung systematisch scheitert",
        paragraphs: [
          "Interessenskonflikte entstehen selten im Offensichtlichen. Das Problem sind die indirekten Verbindungen: Der Geschäftsführer der Gegenseite war vor fünf Jahren Mandant in einer anderen Sache. Die Tochtergesellschaft deines Neumandanten gehört zum Konzern, gegen den ein Kollege 2019 prozessiert hat.",
          "Diese Verbindungen liegen in den Akten — aber verteilt über Jahre, Akten und Kolleginnen. Keine Kartei und kein Gedächtnis hält das zuverlässig ab.",
        ],
      },
      {
        heading: "Wie ein Wissensgraph Konflikte findet",
        paragraphs: [
          "Subsumio baut aus deinen Akten einen Wissensgraph: Personen, Unternehmen, Rollen und Beziehungen werden bei jedem Speichervorgang automatisch erkannt und verknüpft. Eine Kollisionsprüfung ist dann keine Suche nach Namen — sie ist eine Frage an den Graphen: 'Gibt es eine Verbindung zwischen X und der Kanzlei?'",
          "Das Ergebnis kommt mit Fundstellen: Du siehst nicht nur DASS eine Verbindung besteht, sondern in welcher Akte und auf welcher Seite sie dokumentiert ist.",
        ],
      },
      {
        heading: "Praxis: Die Prüfung in drei Schritten",
        paragraphs: [
          "1. Neumandant anlegen — die KI prüft automatisch gegen alle bekannten Entitäten. 2. Treffer mit Fundstelle prüfen — direkt in die Quellakte springen. 3. Ergebnis dokumentieren — der Prüfschritt ist nachvollziehbar protokolliert.",
          "Wichtig: Die KI ersetzt nicht die standesrechtliche Bewertung. Sie sorgt dafür, dass dir die Informationen für diese Bewertung vollständig vorliegen — die Entscheidung bleibt beim Anwalt.",
        ],
      },
    ],
  },
  {
    slug: "avv-ki-software-checkliste-anwaelte",
    title: "AVV für KI-Software: Die Checkliste, die Anwälte vor der Unterschrift prüfen sollten",
    description:
      "Worauf es beim Auftragsverarbeitungsvertrag für KI-Kanzleisoftware wirklich ankommt — Verarbeitungsorte, Subprozessoren, Trainingsdaten-Klauseln und Löschkonzepte.",
    date: "2026-06-28",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["AVV", "DSGVO", "Auftragsverarbeitung", "Compliance"],
    readMinutes: 7,
    content: [
      {
        paragraphs: [
          "Der Auftragsverarbeitungsvertrag (AVV) ist bei KI-Software mehr als eine Formsache. Er entscheidet darüber, ob Mandantendaten faktisch geschützt sind — oder ob die vertragliche Absicherung an der technischen Realität vorbeigeht. Diese Checkliste hilft bei der Prüfung vor der Unterschrift.",
        ],
      },
      {
        heading: "1. Verarbeitungsort und Drittlandtransfer",
        paragraphs: [
          "Wo werden die Daten tatsächlich verarbeitet — nicht nur gespeichert? Bei KI-Software ist das kritisch: Wenn Dokumente zur Verarbeitung an ein LLM in den USA gehen, liegt ein Drittlandtransfer vor — mit allen Folgefragen nach Kapitel V DSGVO.",
          "Zu prüfen: explizite Liste der Verarbeitungsorte, ob Inferenz (nicht nur Speicherung) in der EU stattfindet, und welche Garantie für Drittlandtransfers herangezogen wird.",
        ],
      },
      {
        heading: "2. Trainingsdaten: Die wichtigste Klausel",
        paragraphs: [
          "Die entscheidende Frage bei jedem KI-Anbieter: Werden Mandantendaten zum Training verwendet — direkt, indirekt oder über Subprozessoren? Ein 'wir verbessern unsere Modelle' im Kleingedruckten kann bedeuten, dass Akteninhalte in Modellgewichte einfließen.",
          "Der AVV muss explizit ausschließen, dass Auftragsdaten für Modelltraining, Fine-Tuning oder Evaluierung verwendet werden — auch nicht in anonymisierter oder aggregierter Form, sofern die Anonymisierung nicht nachweisbar ist.",
        ],
      },
      {
        heading: "3. Subprozessoren und LLM-Provider",
        paragraphs: [
          "KI-Software hat typischerweise eine zweistufige Subprozessoren-Kette: Hosting-Anbieter UND Modellprovider. Beide gehören in den AVV — mit Verarbeitungsort, Zweck und Änderungsmechanismus.",
          "Bei Self-Hosting-Optionen ändert sich die Konstellation grundlegend: Dann ist kein AVV mit dem Softwareanbieter für die Datenverarbeitung nötig — die Daten verlassen die Kanzlei nicht.",
        ],
      },
      {
        heading: "4. Löschung und Datenexport bei Vertragsende",
        paragraphs: [
          "Was passiert nach Vertragsende? Ein belastbarer AVV regelt: Löschfristen für Primär- und Backup-Daten, Nachweis der Löschung, und ein vollständiger Export der Daten in einem offenen Format — damit kein Vendor-Lock-in entsteht.",
          "Subsumio adressiert diese Punkte architektonisch: mandantenseparierte Verarbeitung, kein Training auf Mandantendaten, EU-Verarbeitung oder komplettes Self-Hosting, und ein AVV, der genau das abbildet.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-copilot-kanzlei-alltag",
    title: "Die Kanzlei in der Hosentasche: Wie ein WhatsApp-Copilot den Kanzleialltag verändert",
    description:
      "Frist abfragen vor Gericht, Aktenstelle per Sprachnachricht finden, Mandantenfrage unterwegs beantworten — wie der WhatsApp-Copilot das Brain nutzbar macht, ohne App-Wechsel.",
    date: "2026-07-02",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["WhatsApp-Copilot", "Produktivität", "Mobilität", "Kanzleialltag"],
    readMinutes: 5,
    content: [
      {
        paragraphs: [
          "Der Wartebereich vor dem Verhandlungssaal ist kein guter Ort für Laptop und VPN. Trotzdem fallen genau dort die praktischen Fragen an: Wann läuft die Frist in der Sache Hofer ab? Was stand nochmal in Gutachten 3 auf Seite 12? Der WhatsApp-Copilot bringt das Kanzlei-Brain dorthin, wo Anwälte tatsächlich sind.",
        ],
      },
      {
        heading: "Drei Situationen aus dem Alltag",
        paragraphs: [
          "Vor Gericht: 'Frist Hofer?' — Antwort mit Datum, Fristart und Aktenfundstelle in Sekunden. Kein Login, keine App, kein Durchklicken.",
          "Unterwegs: Sprachnachricht — 'Was steht im Kaufvertrag zur Gewährleistung?' Die KI transkribiert, sucht in der Akte und antwortet mit der belegten Fundstelle.",
          "Beim Mandanten: Die Frage kommt per WhatsApp — die Antwort liegt in einer Akte im Büro. Der Copilot liefert den Sachstand, du antwortest dem Mandanten informiert.",
        ],
      },
      {
        heading: "Sicherheit bei einem Messenger-Kanal",
        paragraphs: [
          "Die berechtigte Frage: Sind Mandantendaten über WhatsApp sicher? Der Copilot ist auf Abruf-Antworten ausgelegt — er sendet Fundstellen und Fakten, keine vollständigen Akten. Die Verarbeitung läuft auf derselben EU- oder Self-Hosted-Infrastruktur wie das Hauptprodukt; die Nachrichtenübertragung ist Ende-zu-Ende-verschlüsselt.",
          "Für hochsensible Inhalte bleibt die Regel dieselbe wie bei jedem Kommunikationskanal: Das Brain liefert die Fundstelle — die sensible Vollakte öffnest du im Dashboard.",
        ],
      },
      {
        heading: "Warum das mehr ist als ein Gimmick",
        paragraphs: [
          "Der Copilot ändert nicht, WAS das Brain kann — er ändert, WANN du es nutzt. Der Unterschied zwischen 'nachschauen, wenn ich wieder im Büro bin' und 'sofort wissen' ist in der anwaltlichen Praxis oft der Unterschied zwischen vorbereitet und überrascht.",
          "Und er senkt die Einstiegshürde: Wer das Brain täglich in kleinen Fragen nutzt, vertraut ihm auch bei den großen — mit Fundstellen, die jede Antwort überprüfbar machen.",
        ],
      },
    ],
  },
];

export const BLOG_POSTS = posts;

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}
