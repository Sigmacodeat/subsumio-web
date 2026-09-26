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
      "KI-Kanzleisoftware und § 9 Abs. 2 RAO: Wie Anwältinnen und Anwälte in Österreich die Verschwiegenheit wahren",
    description:
      "Praktischer Leitfaden: Wie KI-Kanzleisoftware mit der Verschwiegenheitspflicht (§ 9 Abs. 2 RAO) und der DSGVO vereinbar ist — On-Premise oder EU-Cloud, AVV, Verschlüsselung.",
    date: "2026-06-20",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["§ 9 Abs. 2 RAO", "DSGVO", "Verschwiegenheit", "On-Premise"],
    readMinutes: 7,
    content: [
      {
        paragraphs: [
          "Anwältinnen und Anwälte in Österreich stehen vor derselben Frage, wenn sie KI-Werkzeuge einführen: Ist das mit meiner Verschwiegenheitspflicht vereinbar? Die kurze Antwort: Ja — wenn Datenflüsse, Verträge und Technik dazu passen. Die lange Antwort steht in diesem Artikel.",
        ],
      },
      {
        heading: "§ 9 Abs. 2 RAO: Was erlaubt ist und was nicht",
        paragraphs: [
          "§ 9 Abs. 2 RAO verpflichtet Rechtsanwälte zur Verschwiegenheit über anvertraute Angelegenheiten und bekannt gewordene Tatsachen, deren Geheimhaltung im Interesse der Partei liegt. Bei KI-Software müssen Kanzleien daher insbesondere Datenflüsse, Zugriffe, Auftragsverarbeitung und technische Schutzmaßnahmen vor dem Einsatz prüfen.",
          "Zwei Betriebsmodelle kommen in Frage: Die Verarbeitung bleibt auf der Infrastruktur der Kanzlei (On-Premise), oder sie erfolgt in einer EU-Cloud — mit einem AVV, in dem alle Auftragsverarbeiter benannt sind, und getrennter Verarbeitung je Kanzlei.",
        ],
      },
      {
        heading: "On-Premise oder EU-Cloud: Welche Option für welche Kanzlei?",
        paragraphs: [
          "On-Premise bedeutet: Die Software läuft auf eigener Hardware, mit eigenen Schlüsseln. Das gibt die größte Kontrolle über die Daten — erfordert aber IT-Ressourcen oder einen betreuten Server. Subsumio bietet On-Premise im Enterprise-Tarif an.",
          "Die EU-Cloud ist die einfachere Option: keine eigenen IT-Ressourcen, kein eigener Server. Der AVV regelt die Auftragsverarbeitung; die Daten jeder Kanzlei werden getrennt verarbeitet.",
          "Beide Betriebsmodelle können die Einhaltung der Verschwiegenheit unterstützen. Ob die konkrete Ausgestaltung den berufs- und datenschutzrechtlichen Anforderungen entspricht, muss die Kanzlei anhand ihrer Datenflüsse und Verträge prüfen.",
        ],
      },
      {
        heading: "DSGVO: AVV, Verschlüsselung, getrennte Verarbeitung",
        paragraphs: [
          "Die DSGVO fordert technische und organisatorische Maßnahmen (TOMs). Für KI-Kanzleisoftware sind die kritischen Punkte: Verschlüsselung der gespeicherten Daten und der Übertragung, getrennte Verarbeitung je Kanzlei, kein Training von KI-Modellen mit Mandantendaten, ein AVV mit dem Anbieter und ein Löschkonzept für die Zeit nach Vertragsende.",
          "Subsumio setzt dafür an: TLS bei der Übertragung, verschlüsselte Ablage der hochgeladenen Originaldateien, getrennte Verarbeitung je Kanzlei, kein Training von KI-Modellen mit Mandantendaten — und ein AVV, in dem alle Auftragsverarbeiter benannt sind.",
        ],
      },
      {
        heading: "Praktische Checkliste für die Einführung",
        paragraphs: [
          "1. Entscheiden Sie: On-Premise oder EU-Cloud. 2. Prüfen Sie den AVV. 3. Stellen Sie sicher, dass kein Training mit Ihren Daten erfolgt. 4. Dokumentieren Sie die TOMs. 5. Informieren Sie Ihre Mandanten über die KI-Nutzung in der Mandatsvereinbarung.",
          "Diese Checkliste unterstützt die berufs- und datenschutzrechtliche Prüfung der Einführung. Sie ersetzt weder die Prüfung des konkreten Betriebsmodells noch eine Datenschutz-Folgenabschätzung, sofern eine solche erforderlich ist.",
        ],
      },
    ],
  },
  {
    slug: "fristenmanagement-ki-automatisierung",
    title: "Fristenmanagement mit KI: Rechtsmittelfristen nach §§ 125, 126 ZPO richtig berechnen",
    description:
      "Wie Subsumio Fristen nach §§ 125, 126 ZPO berechnet — mit Samstagen, Sonntagen, gesetzlichen Feiertagen, der Fristenhemmung nach § 222 ZPO und einer täglichen E-Mail-Übersicht.",
    date: "2026-06-15",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["Fristenmanagement", "ZPO", "ABGB", "Automatisierung"],
    readMinutes: 6,
    content: [
      {
        paragraphs: [
          "Versäumte Fristen gehören zu den klassischen Haftungsfällen in Anwaltskanzleien. Eine versäumte Rechtsmittelfrist kann die Partei um ihr Recht bringen — und die Kanzlei in die Haftung. KI-gestütztes Fristenmanagement berechnet und überwacht Fristen und erinnert rechtzeitig; die Fristenkontrolle bleibt bei Ihnen.",
        ],
      },
      {
        heading: "Rechtsmittelfristen: Die kritischen Fristen",
        paragraphs: [
          "Die Berufungsfrist beträgt vier Wochen (§ 464 ZPO), die Rekursfrist in der Regel 14 Tage (§ 521 ZPO). Beide sind nicht verlängerbar — wer sie versäumt, verliert das Rechtsmittel. Für die Klagebeantwortung gelten ebenfalls vier Wochen (§ 230 ZPO).",
          "Die Berechnung klingt einfach, wird aber fehleranfällig, wenn Feiertage, Wochenenden, Monatsenden und die Fristenhemmung zusammenspielen. Eine Monatsfrist, die am 31. Jänner beginnt, endet am 28. Februar (im Schaltjahr am 29.).",
        ],
      },
      {
        heading: "§§ 125, 126 ZPO: Wo die händische Berechnung scheitert",
        paragraphs: [
          "Nach §§ 125, 126 ZPO endet eine nach Wochen oder Monaten bestimmte Frist an dem Tag, der durch Benennung oder Zahl dem Tag des Fristbeginns entspricht. Fehlt dieser Tag im letzten Monat, endet die Frist mit dem letzten Tag dieses Monats. Fällt das Fristende auf einen Samstag, Sonntag, gesetzlichen Feiertag oder den Karfreitag, endet die Frist am nächsten Werktag. Landesfeiertage verschieben keine Fristen.",
          "Händische Berechnung ist fehleranfällig — besonders bei Fristen, die über Feiertage, Monatswechsel oder die Fristenhemmung nach § 222 ZPO laufen. Subsumio berechnet diese Fälle automatisch. Materiellrechtliche Fristen richten sich nach § 902 ABGB.",
        ],
      },
      {
        heading: "Tägliche E-Mail-Übersicht: Was ansteht, bevor es eng wird",
        paragraphs: [
          "Subsumio sendet eine tägliche E-Mail-Übersicht mit allen Fristen, die in den nächsten 7 Tagen ablaufen. Fristen, die in 3 Tagen oder weniger ablaufen, sind als kritisch markiert. So haben Sie Vorlauf.",
          "Die Übersicht ersetzt nicht Ihre eigene Fristenkontrolle, sie ist ein zusätzliches Sicherheitsnetz. Die endgültige Kontrolle bleibt bei der Anwältin oder dem Anwalt.",
        ],
      },
    ],
  },
  {
    slug: "ki-antworten-mit-fundstellen-vs-halluzination",
    title:
      "Belegte KI-Antworten vs. Halluzination: Warum Anwältinnen und Anwälte Fundstellen brauchen",
    description:
      "Warum KI-Antworten ohne Fundstellen für die anwaltliche Arbeit wertlos sind — und wie belegte Antworten mit überprüfbaren Fundstellen Vertrauen in KI-Ergebnisse schaffen.",
    date: "2026-06-10",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["KI-Antworten", "Fundstellen", "Halluzination", "Quellensuche"],
    readMinutes: 5,
    content: [
      {
        paragraphs: [
          "Allgemeine KI-Chatbots erfinden mitunter Quellen — das ist bekannt. Für die anwaltliche Arbeit ist eine erfundene Antwort nicht nur wertlos, sondern gefährlich: Eine falsche Quellenangabe im Schriftsatz kann zum Haftungsfall werden. Die Antwort darauf: belegte KI-Antworten mit überprüfbaren Fundstellen.",
        ],
      },
      {
        heading: "Was ist eine belegte KI-Antwort?",
        paragraphs: [
          "Eine belegte KI-Antwort nennt zu ihren Aussagen die Fundstelle im Dokument. Sie prüfen mit einem Klick, ob das Zitat stimmt. Stimmt es nicht, verwerfen Sie die Antwort. Stimmt es, übernehmen Sie es in den Schriftsatz.",
          "Das ist der grundlegende Unterschied zu einem allgemeinen Chatbot: Nicht die Antwort steht im Vordergrund, sondern die Fundstelle. Die Antwort ist nur so gut wie die Quelle — und die Quelle ist überprüfbar.",
        ],
      },
      {
        heading: "Lückenhinweis: Wenn die Akte keine Antwort enthält",
        paragraphs: [
          "Ebenso wichtig wie belegte Antworten ist der Hinweis auf Lücken: Enthält die Akte keine Antwort auf die Frage, sagt die KI das ausdrücklich — etwa: „In den vorliegenden Dokumenten fehlt Information zu X.“",
          "Das ist für die Praxis wertvoll: Sie wissen, dass Sie weiter recherchieren oder beim Mandanten nachfragen müssen — statt einer unbelegten Antwort zu vertrauen.",
        ],
      },
      {
        heading: "Wie gut findet die Suche die richtige Stelle?",
        paragraphs: [PROOF.search.plain, "Findet das System nichts, sagt es das."],
      },
    ],
  },
  {
    slug: "kollisionspruefung-ki-interessenskonflikte",
    title: "Kollisionsprüfung mit KI: Wie Sie Interessenkollisionen nach § 10 RAO finden",
    description:
      "Warum die händische Kollisionsprüfung in Kanzleien systematisch Lücken hat — und wie Ihr Kanzleiwissen Interessenkollisionen über Jahre und Mandate hinweg sichtbar macht.",
    date: "2026-06-25",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["Kollisionsprüfung", "Interessenkollision", "Standesrecht", "§ 10 RAO"],
    readMinutes: 6,
    content: [
      {
        paragraphs: [
          "Die Kollisionsprüfung gehört zu den unterschätzten Pflichten der Kanzleiorganisation. Eine übersehene Interessenkollision (§ 10 RAO) kann den Verlust des Mandats bedeuten — im schlimmsten Fall ein Disziplinarverfahren und Haftung. Trotzdem läuft sie in vielen Kanzleien über Gedächtnis, Excel oder die Frage „Kennt den jemand von uns?“.",
        ],
      },
      {
        heading: "Warum die klassische Prüfung systematisch Lücken hat",
        paragraphs: [
          "Interessenkollisionen entstehen selten im Offensichtlichen. Das Problem sind die indirekten Verbindungen: Der Geschäftsführer der Gegenseite war vor fünf Jahren Mandant in einer anderen Sache. Die Tochtergesellschaft Ihres neuen Mandanten gehört zum Konzern, gegen den ein Kollege 2019 prozessiert hat.",
          "Diese Verbindungen liegen in den Akten — aber verteilt über Jahre, Akten und Kolleginnen. Keine Kartei und kein Gedächtnis bildet das zuverlässig ab.",
        ],
      },
      {
        heading: "Wie verknüpftes Kanzleiwissen Kollisionen findet",
        paragraphs: [
          "Subsumio erkennt in Ihren Akten Personen, Unternehmen, Rollen und Beziehungen und verknüpft sie. Eine Kollisionsprüfung ist dann keine bloße Namenssuche, sondern die Frage: „Gibt es eine Verbindung zwischen X und der Kanzlei?“",
          "Das Ergebnis kommt mit Fundstellen: Sie sehen nicht nur, dass eine Verbindung besteht, sondern auch, in welcher Akte sie dokumentiert ist.",
        ],
      },
      {
        heading: "Praxis: Die Prüfung in drei Schritten",
        paragraphs: [
          "1. Neuen Mandanten anlegen — Subsumio prüft gegen alle bekannten Personen und Unternehmen. 2. Treffer mit Fundstelle prüfen — direkt in die Quellakte springen. 3. Ergebnis dokumentieren — der Prüfschritt ist nachvollziehbar protokolliert.",
          "Wichtig: Die KI ersetzt nicht die standesrechtliche Bewertung. Sie stellt Ihnen die Informationen für diese Bewertung zusammen — die Entscheidung bleibt bei der Anwältin oder dem Anwalt.",
        ],
      },
    ],
  },
  {
    slug: "avv-ki-software-checkliste-anwaelte",
    title: "AVV für KI-Software: Die Checkliste, die Anwälte vor der Unterschrift prüfen sollten",
    description:
      "Worauf es beim Auftragsverarbeitungsvertrag für KI-Kanzleisoftware ankommt — Verarbeitungsorte, Sub-Auftragsverarbeiter, Trainingsdaten-Klauseln und Löschkonzepte.",
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
          "Wo werden die Daten tatsächlich verarbeitet — nicht nur gespeichert? Bei KI-Software ist das kritisch: Gehen Dokumente zur Verarbeitung an ein Sprachmodell in den USA, liegt ein Drittlandtransfer vor — mit allen Folgefragen nach Kapitel V DSGVO.",
          "Zu prüfen: eine ausdrückliche Liste der Verarbeitungsorte, ob auch die KI-Verarbeitung selbst (nicht nur die Speicherung) in der EU stattfindet, und welche Garantie für Drittlandtransfers herangezogen wird.",
        ],
      },
      {
        heading: "2. Trainingsdaten: Die wichtigste Klausel",
        paragraphs: [
          "Die entscheidende Frage bei jedem KI-Anbieter: Werden Mandantendaten zum Training verwendet — direkt, indirekt oder über Sub-Auftragsverarbeiter? Ein „Wir verbessern unsere Modelle“ im Kleingedruckten kann bedeuten, dass Akteninhalte in ein Modell einfließen.",
          "Der AVV muss ausdrücklich ausschließen, dass Auftragsdaten für Training, Nachtraining oder Auswertung von Modellen verwendet werden — auch nicht in anonymisierter oder aggregierter Form, sofern die Anonymisierung nicht nachweisbar ist.",
        ],
      },
      {
        heading: "3. Sub-Auftragsverarbeiter und Anbieter der Sprachmodelle",
        paragraphs: [
          "KI-Software hat typischerweise eine zweistufige Kette von Sub-Auftragsverarbeitern: den Hosting-Anbieter und den Anbieter der Sprachmodelle. Beide gehören in den AVV — mit Verarbeitungsort, Zweck und Änderungsmechanismus.",
          "Bei On-Premise-Betrieb ändert sich die Konstellation: Soweit der Softwareanbieter selbst keine Daten verarbeitet, braucht es insoweit keinen AVV mit ihm. Zu prüfen bleiben Fernwartung und die angebundenen Sprachmodelle.",
        ],
      },
      {
        heading: "4. Löschung und Datenexport bei Vertragsende",
        paragraphs: [
          "Was passiert nach Vertragsende? Ein belastbarer AVV regelt: Löschfristen für Primär- und Backup-Daten, den Nachweis der Löschung und einen vollständigen Export der Daten in einem offenen Format — damit keine Abhängigkeit vom Anbieter entsteht.",
          "Subsumio geht diese Punkte so an: getrennte Verarbeitung je Kanzlei, kein Training von KI-Modellen mit Mandantendaten, Hosting in der EU oder On-Premise (Enterprise) und ein AVV, in dem alle Sub-Auftragsverarbeiter benannt sind.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-copilot-kanzlei-alltag",
    title: "Die Kanzlei in der Hosentasche: Wie der WhatsApp-Assistent den Kanzleialltag verändert",
    description:
      "Frist abfragen vor der Verhandlung, Aktenstelle per Sprachnachricht finden, Mandantenfrage unterwegs beantworten — wie der WhatsApp-Assistent Ihr Kanzleiwissen nutzbar macht, ohne App-Wechsel.",
    date: "2026-07-02",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["WhatsApp-Assistent", "Produktivität", "Mobilität", "Kanzleialltag"],
    readMinutes: 5,
    content: [
      {
        paragraphs: [
          "Der Wartebereich vor dem Verhandlungssaal ist kein guter Ort für Laptop und VPN. Trotzdem fallen genau dort die praktischen Fragen an: Wann läuft die Frist in der Sache Hofer ab? Was stand nochmals in Gutachten 3 auf Seite 12? Der WhatsApp-Assistent bringt Ihr Kanzleiwissen dorthin, wo Sie tatsächlich sind.",
        ],
      },
      {
        heading: "Drei Situationen aus dem Alltag",
        paragraphs: [
          "Vor Gericht: „Frist Hofer?“ — Antwort mit Datum, Fristart und Fundstelle in der Akte. Keine zusätzliche App, kein Durchklicken.",
          "Unterwegs: Sprachnachricht — „Was steht im Kaufvertrag zur Gewährleistung?“ Der Assistent transkribiert, sucht in der Akte und antwortet mit der belegten Fundstelle.",
          "Beim Mandanten: Die Frage kommt per WhatsApp — die Antwort liegt in einer Akte im Büro. Der Assistent liefert den Sachstand, Sie antworten dem Mandanten informiert.",
        ],
      },
      {
        heading: "Sicherheit bei einem Messenger-Kanal",
        paragraphs: [
          "Die berechtigte Frage: Sind Mandantendaten über WhatsApp sicher? Der Assistent ist auf Abruf-Antworten ausgelegt — er sendet Fundstellen und Fakten, keine vollständigen Akten. Die Verarbeitung läuft auf derselben Infrastruktur wie das Hauptprodukt; die Nachrichten selbst laufen über WhatsApp Business und damit über Meta. Das gehört in Ihre Risikoabwägung.",
          "Für hochsensible Inhalte bleibt die Regel dieselbe wie bei jedem Kommunikationskanal: Der Assistent liefert die Fundstelle — die vollständige Akte öffnen Sie in Subsumio.",
        ],
      },
      {
        heading: "Warum das mehr ist als eine Spielerei",
        paragraphs: [
          "Der Assistent ändert nicht, was Ihr Kanzleiwissen kann — er ändert, wann Sie es nutzen. Der Unterschied zwischen „nachschauen, wenn ich wieder im Büro bin“ und „gleich wissen“ ist in der anwaltlichen Praxis oft der Unterschied zwischen vorbereitet und überrascht.",
          "Und er senkt die Einstiegshürde: Wer sein Kanzleiwissen täglich für kleine Fragen nutzt, gewinnt Routine für die großen — mit Fundstellen, die jede Antwort überprüfbar machen.",
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
