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
    slug: "ki-kanzleisoftware-dsgvo-203-stgb",
    title: "KI-Kanzleisoftware und § 203 StGB: Wie Anwälte in DACH mandantendaten-sicher bleiben",
    description:
      "Praktischer Leitfaden: Wie KI-Kanzleisoftware mit § 203 StGB, DSGVO und Berufsgeheimnis-Pflichten vereinbar ist — Self-Hosting vs. EU-Cloud, AVV, Verschlüsselung.",
    date: "2026-06-20",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["§ 203 StGB", "DSGVO", "Berufsgeheimnis", "Self-Hosting"],
    readMinutes: 7,
    content: [
      {
        paragraphs: [
          "Anwälte in Deutschland, Österreich und der Schweiz stehen vor derselben Frage, wenn sie KI-Tools einführen: Ist das mit meiner Schweigepflicht vereinbar? Die kurze Antwort: Ja — wenn die Architektur für Berufsgeheimnisträger gebaut ist. Die lange Antwort steht in diesem Artikel.",
        ],
      },
      {
        heading: "§ 203 StGB: Was erlaubt ist und was nicht",
        paragraphs: [
          "§ 203 StGB verbietet die unbefugte Offenbarung von Fremdgeheimnissen. Für Anwälte bedeutet das: Mandantendaten dürfen nicht an Dritte gelangen, die nicht unter der Schweigepflicht stehen. Eine KI-Software, die Mandantendaten an einen US-Cloud-Anbieter sendet, ohne dass ein AVV (Auftragsverarbeitungsvertrag) besteht und die Verschlüsselung mandantensepariert erfolgt, verletzt diese Pflicht.",
          "Die Lösung ist architektonisch: Entweder bleibt die Datenverarbeitung vollständig innerhalb der Kanzlei (Self-Hosting) oder sie erfolgt in einer EU-Cloud mit AVV, mandantenseparierter Verschlüsselung und ohne Zugriff Dritter auf unverschlüsselte Daten.",
        ],
      },
      {
        heading: "Self-Hosting vs. EU-Cloud: Welche Option für welche Kanzlei?",
        paragraphs: [
          "Self-Hosting bedeutet: Die KI-Engine läuft auf eigener Hardware, mit eigenen Schlüsseln. Mandantendaten verlassen niemals die Kanzlei. Das ist die sicherste Option — erfordert aber IT-Ressourcen oder einen verwalteten Server.",
          "Die EU-Cloud ist die einfachere Option: Keine IT-Ressourcen nötig, kein Server-Management. Der AVV regelt die Auftragsverarbeitung. Die Verschlüsselung erfolgt mandantensepariert — keine andere Kanzlei hat Zugriff auf deine Daten.",
          "Beide Optionen sind mit § 203 StGB vereinbar. Die Wahl hängt von Kanzleigröße, IT-Kapazität und Risikopräferenz ab.",
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
          "Mit dieser Checkliste ist die Einführung von KI-Kanzleisoftware mit § 203 StGB und DSGVO vereinbar — und du kannst die Effizienzgewinne nutzen, ohne Haftungsrisiken einzugehen.",
        ],
      },
    ],
  },
  {
    slug: "fristenmanagement-ki-automatisierung",
    title:
      "Fristenmanagement mit KI: Notfristen, Berufungsfristen und Monatsarithmetik automatisiert",
    description:
      "Wie KI-gestütztes Fristenmanagement Notfristen nach ZPO, BGB und ABGB automatisch berechnet — mit Wochenend- und Feiertagsverschiebung, E-Mail-Digest und Kalender-Integration.",
    date: "2026-06-15",
    author: "Subsumio Team",
    authorRole: "Legal AI Engineering",
    tags: ["Fristenmanagement", "ZPO", "BGB", "ABGB", "Automatisierung"],
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
          "Notfristen (§ 224 ZPO) sind unveränderlich — zwei Wochen ab Zustellung. Berufungsfristen (§ 519 ZPO) betragen einen Monat. Im österreichischen Recht gelten ähnliche Fristen nach § 5 ZPO (Notfrist 14 Tage) und § 510 ZPO (Berufungsfrist 4 Wochen).",
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
        heading: "Recall@5: Warum 97,9 % wichtig sind",
        paragraphs: [
          "Recall@5 ist die Metrik, die misst, ob das relevante Dokument unter den Top-5-Retrievergebnissen ist. 97,9 % bedeutet: In 97,9 % der Fälle findet die KI das richtige Dokument. Das ist keine Marketing-Zahl — es ist eine reproduzierbare Benchmark.",
          "Für Anwälte bedeutet das: Wenn du eine Frage stellst, findet die KI mit sehr hoher Wahrscheinlichkeit das relevante Dokument in deinen Akten. Und wenn sie es nicht findet — sagt sie es dir.",
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
