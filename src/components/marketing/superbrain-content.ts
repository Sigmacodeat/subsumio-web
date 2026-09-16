import { PROOF } from "@/content/proof-points";

export const copy = {
  de: {
    hero: {
      eyebrow: "Das Subsumio SuperBrain",
      title:
        "Nicht nur KI.\nEin künstliches Gehirn für deine Kanzlei — das jede Nacht regeneriert.",
      sub: "Andere KI-Tools erinnern sich an Chat-Verläufe. Subsumio versteht deine Akten: Jede Nacht konsolidiert das SuperBrain sie zu einem lebendigen juristischen Gedächtnis — wie der menschliche Hippocampus im Schlaf. Fünf Qualitäts-Ebenen, Widerspruchsprüfung, Fundstellen. Ohne Halluzinationen.",
      cta: "14 Tage kostenlos testen",
      ctaSecondary: "Features ansehen",
    },
    stats: [
      {
        value: 29,
        suffix: "",
        label: "Nächtliche Gehirn-Phasen",
        sub: "Konsolidierung, Engram-Reifung, Reconsolidation, Widerspruchsprüfung",
      },
      {
        value: 5,
        suffix: "",
        label: "Korrektur-Ebenen",
        sub: "Extraktion → Synthese → Verdict → Probe → Ensemble",
      },
      { value: 57.42, suffix: "", label: "LEXam-Score", sub: "DeepSeek V3.2 — besser als GPT-4o" },
      {
        value: PROOF.recall8.numeric,
        suffix: "%",
        label: PROOF.recall8.metric,
        sub: `${PROOF.recall8.benchmark}, ${PROOF.recall8.sampleSize} Fragen`,
      },
    ],
    // ── NARRATIVE SECTION 1: "Wie andere arbeiten" ──
    othersTitle: "Prompt-KI: fragt, antwortet, vergisst",
    othersSub:
      "Du stellst eine Frage. Das Modell antwortet. Dann vergisst es alles. Andere Tools speichern Chat-Verläufe und nennen es 'Memory'. Subsumio baut einen Wissensgraphen — nicht Chat-Speicherung, sondern Verständnis. Jeder Prompt bei anderen ist isoliert — kein Gedächtnis, kein Lernen, kein Verstehen. Halluzinationen werden auf Prompt-Ebene bekämpft: mit Hoffnung. Das Modell ist Richter und Angeklagter zugleich.",
    othersSteps: [
      { label: "Prompt", desc: "Du fragst GPT-5 oder Claude", icon: "FileSearch" },
      { label: "Antwort", desc: "Modell generiert — ohne Gedächtnis", icon: "Sparkles" },
      {
        label: "Vergessen",
        desc: "Alles wird verworfen. Nächster Prompt = null Kontext.",
        icon: "AlertTriangle",
      },
    ],
    othersPain: [
      "Chat-Verlauf-Speicherung statt Wissensgraph — Chats werden gespeichert, nicht verstanden",
      "Keine nächtliche Konsolidierung — Wissen baut sich nicht auf",
      "Halluzinationen werden im Prompt-Level bekämpft (hoffnungsbasiert)",
      "Keine Widerspruchserkennung zwischen Antworten",
      "Premium-Preise für ein einzelnes Front-End-Modell ohne Gedächtnis",
      "Keine juristische Qualitätskontrolle — das Modell ist Richter und Angeklagter",
    ],
    // ── NARRATIVE SECTION 2: "Wie unser Gehirn arbeitet" ──
    oursTitle: "SuperBrain: lernt, konsolidiert, versteht",
    oursSub:
      "Subsumio baut jede Nacht einen Wissensgraphen aus deinen Dokumenten. Fakten werden extrahiert, synthetisiert, auf Widersprüche geprüft und mit einem Ensemble-Judge abgesichert — der menschliche Juristen übertrifft. Was herauskommt, ist kein Chat-Verlauf. Es ist ein juristisches Langzeitgedächtnis, das jede Nacht schärfer wird — nicht nur größer, sondern verständiger. Je länger du es nutzt, desto besser versteht das SuperBrain deine Kanzlei.",
    oursSteps: [
      { label: "Sammeln", desc: "Dokumente, E-Mails, Akten, Konversationen", icon: "FileSearch" },
      {
        label: "Verarbeiten",
        desc: "5 Ebenen: Extraktion → Synthese → Verdict → Probe → Ensemble",
        icon: "Layers",
      },
      {
        label: "Speichern",
        desc: "Dauerhafter Wissensgraph mit Fakten, Takes & Beziehungen",
        icon: "Database",
      },
      {
        label: "Antworten",
        desc: "Jede Antwort aus dem Graph — mit Fundstellen",
        icon: "CheckCircle2",
      },
    ],
    // ── 5-LAYER ARCHITECTURE ──
    architectureTitle: "Die 5-Ebenen-Architektur",
    architectureSub:
      "Jede Take durchläuft fünf Qualitäts-Ebenen, bevor sie in deinen Wissensgraph aufgenommen wird. Verifizierte LEXam-Scores pro Modell. Das ist der architektonische Graben, den kein Wettbewerber überwinden kann.",
    layers: [
      {
        icon: "FileSearch",
        title: "Ebene 0 — Fakten-Extraktion",
        desc: "Spezialisierte Extraktions-Modelle strukturieren Fakten aus Konversationen, Dokumenten und E-Mails. Kein juristisches Denken — nur Strukturierung. Jede Nacht werden neue Fakten in den Brain geschrieben.",
        detail: "119 Sprachen · Vollautomatisch · Quellverweise auf Dokument-Ebene",
        color: "violet",
      },
      {
        icon: "Sparkles",
        title: "Ebene 1 — Juristische Synthese",
        desc: "DeepSeek V3.2 synthetisiert Fakten zu Takes mit juristischem Reasoning. LEXam-Score 57.42 — besser als GPT-4o (56.93), auf Augenhöhe mit GPT-4.1 (57.50). Open-Weight, vollständig transparent.",
        detail: "DeepSeek V3.2 · LEXam 57.42 · Open-Weight · Vollständig nachvollziehbar",
        color: "blue",
      },
      {
        icon: "CheckCircle2",
        title: "Ebene 2 — Verdict",
        desc: "Ein Reasoning-Modell bewertet jede einzelne Take: akzeptiert, verworfen oder zur Überarbeitung. Schlechte Takes sterben, bevor sie den Graph erreichen. LEXam-Score 56.53 — nahezu gleich mit GPT-4.1.",
        detail: "Modell: DeepSeek V3.2-Reasoner · LEXam 56.53 · Beweisbewertung mit Konfidenz",
        color: "emerald",
      },
      {
        icon: "AlertTriangle",
        title: "Ebene 3 — Contradiction Probe (tiered)",
        desc: "Chunk-Paare werden nächtlich auf logische Widersprüche geprüft. 90% werden vom Erstmodell gelöst, 10% eskalieren zu einem zweiten Modell für maximale Genauigkeit. Widersprüche werden markiert — nicht versteckt.",
        detail: "DeepSeek V3.2 (initial) → Claude Haiku (10% Eskalation) · Cross-Reference-Audit",
        color: "amber",
      },
      {
        icon: "ShieldCheck",
        title: "Ebene 4 — Ensemble Legal Gate",
        desc: "Ein Ensemble aus zwei Open-Weight-Modellen bewertet die finale juristische Qualität. Das LEXam-Paper (ICLR 2026) beweist: min(DeepSeek-V3, Qwen3-32B) übertrifft menschliche Juristen bei der Bewertung juristischer Antworten.",
        detail:
          "Ensemble: min(DeepSeek V3, Qwen3-32B) · Übertrifft menschliche Juristen · LEXam-validiert (ICLR 2026)",
        color: "rose",
      },
    ],
    costNote:
      "5 Ebenen. 29 Phasen. Ein Wissensgraph, der jede Nacht wächst — und durch Reconsolidation reicher wird.",
    // ── DREAM CYCLE ──
    cycleTitle: "Nächtliche Gehirnregeneration",
    cycleSub:
      "Während du schläfst, durchläuft das SuperBrain 29 Phasen — wie das menschliche Gehirn im Schlaf Erinnerungen wiederholt, verstärkt und neu verknüpft. Fakten werden zu Wissen, Takes zu Verständnis, Widersprüche zu klaren Signalen. Neu: Engram-Reifung und Reconsolidation — inspiriert von der Neurowissenschaft. Alles automatisch, alles überwacht, alles protokolliert.",
    cycleSteps: [
      {
        phase: "extract_facts",
        label: "Fakten extrahieren",
        icon: "FileSearch",
        desc: "Konversationen, E-Mails, Dokumente → strukturierte Fakten mit Quellverweisen",
      },
      {
        phase: "synthesize",
        label: "Synthetisieren",
        icon: "Sparkles",
        desc: "Fakten → Brain Pages mit juristischem Reasoning und Fundstellen",
      },
      {
        phase: "consolidate",
        label: "Konsolidieren",
        icon: "Layers",
        desc: "Fakten clustern → Takes promovieren → Duplikate entfernen",
      },
      {
        phase: "engram_maturation",
        label: "Engram-Reifung",
        icon: "Brain",
        desc: "Neue Erinnerungen starten 'still' und reifen über 7 Tage via Sigmoid-Kurve — wie der menschliche Hippocampus. Implizites Wissen wird zu explizitem Verständnis.",
      },
      {
        phase: "reconsolidation",
        label: "Reconsolidation",
        icon: "RefreshCw",
        desc: "Beim Abruf wird eine Erinnerung 'labil' für 60 Minuten — neue Nuancen können einfließen, wie im menschlichen Gehirn. Wissen wird reicher, nicht nur größer.",
      },
      {
        phase: "embed",
        label: "Embeddings",
        icon: "Database",
        desc: "Chunks → Vektorraum für semantische Suche über alle Akten",
      },
      {
        phase: "patterns",
        label: "Muster erkennen",
        icon: "Network",
        desc: "Cross-Take-Themen, Verbindungen und wiederkehrende Risiken",
      },
      {
        phase: "contradiction_probe",
        label: "Widerspruchsprüfung",
        icon: "AlertTriangle",
        desc: "Logische Konflikte zwischen Takes werden markiert — nicht versteckt",
      },
      {
        phase: "grade_takes",
        label: "Takes bewerten",
        icon: "Target",
        desc: "Juristische Qualitätsbewertung mit LEXam-validierten Modellen",
      },
      {
        phase: "calibration",
        label: "Kalibrierung",
        icon: "TrendingUp",
        desc: "Modellqualität über Zeit tracken · Drift erkennen · Anpassen",
      },
    ],
    // ── COMPARISON ──
    compareTitle: "Andere Kanzlei-KI vs. SuperBrain",
    compareSub:
      "Andere Kanzlei-KI nutzt Multi-Model-Routing pro Task. Wir nutzen Multi-Model-Quality-Layer pro Take — mit einem Wissensgraphen, der jede Nacht konsolidiert. Das ist kein Feature-Unterschied. Das ist ein architektonischer Paradigmenwechsel.",
    compareRows: [
      {
        feature: "Architektur",
        others: "Multi-Model per Task (Harvey) oder Single-Model",
        subsumio: "5-Ebenen-Quality-Layer pro Take",
      },
      {
        feature: "Halluzinations-Kontrolle",
        others: "Prompt-Level (hoffnungsbasiert)",
        subsumio: "Architektonisch (5 Korrektur-Ebenen + Ensemble-Judge)",
      },
      {
        feature: "Gedächtnis / Memory",
        others: "Chat-Verlauf-Speicherung oder angekündigt",
        subsumio: "Wissensgraph mit nächtlicher Konsolidierung — seit Tag 1",
      },
      {
        feature: "Wissensgraph",
        others: "Keiner — jeder Prompt ist isoliert",
        subsumio: "Dauerhafter Graph mit Fakten, Takes, Beziehungen",
      },
      {
        feature: "Nächtliche Konsolidierung",
        others: "Nicht vorhanden",
        subsumio: "29 Phasen: Konsolidierung, Engram-Reifung, Reconsolidation, Widerspruchsprüfung",
      },
      {
        feature: "Engram-Reifung",
        others: "Nicht vorhanden — kein Konzept von Gedächtnis-Reifung",
        subsumio: "Sigmoid-Maturationskurve über 7 Tage — still → implizit → explizit",
      },
      {
        feature: "Reconsolidation",
        others: "Nicht vorhanden — Erinnerungen sind statisch",
        subsumio: "Labiles Fenster bei Abruf — Wissen wird reicher durch Nuancen",
      },
      {
        feature: "Legal Benchmark",
        others: "LAB (Harvey) oder keiner",
        subsumio: "LEXam (ICLR 2026) — 340 Exams, 7.537 Fragen",
      },
      {
        feature: "Mehrsprachigkeit",
        others: "50-95 Sprachen",
        subsumio: "119 Sprachen (Qwen3.5 Engine)",
      },
      {
        feature: "Preis-Modell",
        others: "Premium-Preise pro Seat — zahlen für API-Kosten",
        subsumio: "Fair gepreist — keine versteckten API-Kosten",
      },
      {
        feature: "Fine-Tuning auf österreichisches Recht",
        others: "Keines (allgemeine Modelle)",
        subsumio: "Subsumio Legal-32B (proprietär, law-corpus)",
      },
      {
        feature: "DSGVO",
        others: "USA-Cloud (Anthropic/OpenAI)",
        subsumio: "EU-Cloud oder Self-Hosted",
      },
    ],
    // ── FINE-TUNING / LEGAL ENGINE ──
    finetuneTitle: "Subsumio Legal Engine",
    finetuneSub:
      "Wir fine-tunen Open-Weight-Modelle auf unseren eigenen law-corpus: ABGB, ZPO, EO, UGB, StGB, StPO — das gesamte österreichische Bundesrecht. Das Resultat ist ein proprietäres Modell, das kein Wettbewerber hat.",
    finetunePoints: [
      {
        label: "law-corpus",
        value: "40+ Gesetze",
        desc: "ABGB, ZPO, EO, UGB, StGB, StPO, UStG, BAO, DSGVO — AT/EU",
      },
      {
        label: "Basismodell",
        value: "Qwen3-32B",
        desc: "119 Sprachen · Open-Weight · LoRA Fine-Tuning mit Unsloth",
      },
      {
        label: "Fine-Tuning",
        value: "LoRA",
        desc: "Parameter-effizientes Fine-Tuning · Open-Weight · Kein Vendor-Lock-in",
      },
      {
        label: "Deployment",
        value: "Self-Hosted",
        desc: "EU-Cloud oder komplett on-premise · Keine API-Abhängigkeit",
      },
    ],
    finetuneResult:
      "Prognose: +5–10 LEXam-Punkte über Base-Qwen3-32B (40 → ~45–50). Im Ensemble mit DeepSeek V3.2: Qualität auf GPT-4.1-Niveau (57.50) — mit einem Modell, das österreichisches Recht von Grund auf versteht.",
    // ── PRIVACY ──
    privacyTitle: "Deine Daten. Deine Keys. Deine Jurisdiktion.",
    privacySub:
      "Das SuperBrain verarbeitet alles innerhalb deiner isolierten Umgebung. Kein Training auf deinen Daten. Keine Daten an Dritte. Vertraulichkeit per Architektur — nicht per Versprechen.",
    privacyPoints: [
      {
        icon: "Lock",
        title: "Per-Matter-Isolation",
        desc: "Jede Akte ist logisch getrennt. Mandantengeheimnis bleibt Mandantengeheimnis.",
      },
      {
        icon: "ShieldCheck",
        title: "Kein Training auf deinen Daten",
        desc: "Modelle lernen nie aus deinen Dokumenten. Architektonisch garantiert.",
      },
      {
        icon: "Globe",
        title: "EU-Cloud oder Self-Hosted",
        desc: "Hetzner Falkenstein (DE) oder komplett on-premise bei dir.",
      },
      {
        icon: "Eye",
        title: "Auditierbar",
        desc: "Jede Take, jedes Verdict, jede Calibration ist nachvollziehbar protokolliert.",
      },
    ],
    // ── USE CASES ──
    useCasesTitle: "Was du mit dem SuperBrain machen kannst",
    useCasesSub:
      "Vom ersten Mandat bis zur komplexen Großakte — das SuperBrain arbeitet in jedem Fall. Hier sind die konkreten Anwendungsfälle, die Kanzleien täglich nutzen.",
    useCases: [
      {
        icon: "FileSearch",
        title: "Rechtsrecherche mit Fundstellen",
        desc: "Fragen zum Sachverhalt? Das SuperBrain durchsucht alle Akten, Gesetze und Judikatur — mit Seitenzahlen und Quellenverweisen.",
      },
      {
        icon: "FileSearch",
        title: "Vertragsanalyse & Red-Lining",
        desc: "Verträge werden automatisch analysiert, Risiken markiert und Änderungsvorschläge generiert — mit ABGB/UGB-Referenzen.",
      },
      {
        icon: "Target",
        title: "Fristenkontrolle & Deadlines",
        desc: "Automatische Fristberechnung nach ZPO, EO und ABGB. Das SuperBrain überwacht und warnt — bevor Fristen laufen.",
      },
      {
        icon: "Database",
        title: "Wissensmanagement",
        desc: "Jedes Mandat, jede Korrespondenz wird zum Wissensgraph. Nie wieder dasselbe Problem zweimal lösen.",
      },
      {
        icon: "Network",
        title: "Kollisionsprüfung",
        desc: "Cross-Reference-Audit findet Interessenkonflikte bevor sie zum Problem werden — mandantenübergreifend.",
      },
      {
        icon: "TrendingUp",
        title: "Mandanten-Reporting",
        desc: "Automatische Zusammenfassungen, Status-Reports und Kostenschätzungen — direkt aus dem Wissensgraph.",
      },
    ],
    // ── TRUST & COMPLIANCE ──
    trustTitle: "Compliance per Architektur",
    trustSub:
      "Das SuperBrain ist nicht nachträglich DSGVO-konform gemacht. Die Datenschutz- und Berufsgeheimnis-Anforderungen sind in der Architektur verankert.",
    trustBadges: [
      { label: "DSGVO", desc: "EU-Cloud, keine Daten an Dritte" },
      { label: "§ 9 Abs. 2 RAO", desc: "Berufsgeheimnisschutz per Design" },
      { label: "BAO", desc: "Aufbewahrungs- und Dokumentationspflichten" },
      { label: "RAO", desc: "Kanzleikonform ab dem ersten Mandat" },
    ],
    integrationsTitle: "Integriert in deinen Kanzlei-Workflow",
    integrations: [
      { name: "ERV-Workflow", desc: "Strukturierte Übergabe vorbereitet" },
      { name: "FiBu", desc: "Honorar und Buchhaltung" },
      { name: "DocuSign", desc: "Elektronische Unterschrift" },
      { name: "WhatsApp", desc: "Mandantenkommunikation" },
      { name: "Outlook", desc: "E-Mail & Termine" },
      { name: "ADVOKAT", desc: "Kanzleisoftware-Import" },
    ],
    // ── FAQ ──
    faq: [
      {
        q: "Was ist das Subsumio SuperBrain?",
        a: "Das SuperBrain ist die KI-Engine hinter Subsumio — ein künstliches juristisches Gehirn, das jede Nacht regeneriert. Es baut aus deinen Dokumenten einen Wissensgraphen mit 29 automatisierten Phasen und 5 Qualitäts-Ebenen. Jede Antwort stammt aus deinen Akten — mit Fundstellen, nicht aus einem generischen Modell.",
      },
      {
        q: "Was ist die nächtliche Gehirnregeneration?",
        a: "Der Dream Cycle ist die nächtliche Konsolidierungsschleife des SuperBrain. Sie entspricht dem, was im menschlichen Gehirn im Schlaf passiert: Informationen werden wiederholt, verstärkt, mit bestehendem Wissen verknüpft und widersprüchliche oder vergessene Fragmente aussortiert. 29 Phasen, vollautomatisch, alles protokolliert. Neu: Engram-Reifung (Gedächtnis reift über 7 Tage) und Reconsolidation (Wissen wird bei Abruf reicher).",
      },
      {
        q: "Was ist der LEXam-Benchmark?",
        a: "LEXam (ICLR 2026) ist ein juristischer Benchmark mit 340 Exams und 7.537 Fragen. DeepSeek V3.2 erreicht 57.42 Punkte — besser als GPT-4o (56.93) und auf Augenhöhe mit GPT-4.1 (57.50). Das SuperBrain nutzt diese verifizierten Scores für jede Modell-Entscheidung.",
      },
      {
        q: "Ist das SuperBrain DSGVO-konform?",
        a: "Ja. Alle Daten bleiben in der EU-Cloud (Hetzner Falkenstein) oder werden komplett on-premise bei dir gehostet. Es gibt kein Training auf deinen Daten, keine Daten an Dritte. Per-Matter-Isolation gewährleistet Berufsgeheimnisschutz nach § 9 Abs. 2 RAO.",
      },
      {
        q: "Wie wird mit KI-Halluzinationen umgegangen?",
        a: "Architektonisch, nicht hoffnungsbasiert. Jede Take durchläuft 5 Korrektur-Ebenen: Extraktion, juristische Synthese, Verdict, Widerspruchsprüfung und Ensemble-Gate. Das Ensemble aus DeepSeek V3 und Qwen3-32B übertrifft menschliche Juristen bei der Bewertung juristischer Antworten (LEXam-Paper, ICLR 2026).",
      },
      {
        q: "Was ist der Unterschied zu Harvey AI?",
        a: "Harvey nutzt Multi-Model-Routing pro Task (welches Modell für welche Aufgabe). Subsumio nutzt Multi-Model-Quality-Layer pro Take (5 Ebenen Qualitätskontrolle pro Antwort). Subsumio hat einen persistenten Wissensgraphen mit nächtlicher Konsolidierung, Widerspruchserkennung und Fine-Tuning auf österreichisches Recht. Subsumio ist EU-Cloud oder Self-Hosted — Harvey läuft in der US-Cloud.",
      },
      {
        q: "Wie unterscheidet sich das SuperBrain von ChatGPT Memory oder Claude Memory?",
        a: "ChatGPT und Claude speichern Chat-Verläufe und Präferenzen — sie 'erinnern' sich. Das SuperBrain 'versteht': Es baut jede Nacht einen strukturierten Wissensgraphen aus deinen Dokumenten, prüft Widersprüche, bewertet juristische Qualität mit LEXam-validierten Modellen und wird mit jeder Nacht schärfer. ChatGPT Memory ist wie ein Notizzettel. Das SuperBrain ist wie ein Associate, der jede Nacht durch deine Akten geht und am Morgen mehr versteht als am Abend davor.",
      },
      {
        q: "Kann ich das SuperBrain selbst hosten?",
        a: "Ja. Subsumio kann komplett on-premise in deiner eigenen Infrastruktur betrieben werden. Keine API-Abhängigkeit, keine Daten verlassen dein Netzwerk. Ideal für Kanzleien mit strikten Compliance-Anforderungen.",
      },
      {
        q: "Welche Sprachen unterstützt das SuperBrain?",
        a: "119 Sprachen über die Qwen3.5-Engine — inklusive Deutsch, Englisch, Französisch, Italienisch, Polnisch, Türkisch und Arabisch. Perfekt für internationale Mandate.",
      },
      {
        q: "Was ist die Subsumio Legal Engine?",
        a: "Wir fine-tunen Open-Weight-Modelle (Qwen3-32B) auf unseren law-corpus: ABGB, ZPO, EO, UGB, StGB, StPO — das gesamte österreichische Bundesrecht. Das Resultat ist 'Subsumio Legal-32B', ein proprietäres Modell, das österreichisches Recht von Grund auf versteht. Kein Wettbewerber hat das.",
      },
      {
        q: "Was kostet das SuperBrain?",
        a: "Das SuperBrain ist in allen Subsumio-Abos enthalten. Du zahlst pro Nutzer — ohne versteckte API-Kosten, ohne Token-Berechnung. 14 Tage kostenlos, keine Kreditkarte. Alle Preise findest du auf unserer Preisseite.",
      },
    ],
    // ── STICKY CTA ──
    stickyCtaText: "14 Tage kostenlos testen",
    stickyCtaHint: "Keine Kreditkarte · Lernt jede Nacht dazu",
    ctaTitle: "Erlebe das SuperBrain",
    ctaSub:
      "Starte heute. Dein juristisches Gehirn wächst ab der ersten Akte — jede Nacht, automatisch, und gewinnt an Verständnis. 14 Tage kostenlos, keine Kreditkarte.",
    ctaButton: "14 Tage kostenlos starten",
  },
};

export type SuperbrainCopy = typeof copy;
export type SuperbrainCopyDe = SuperbrainCopy["de"];

export function getCopy() {
  return copy.de;
}

export function superbrainFaq(): readonly { q: string; a: string }[] {
  return getCopy().faq;
}
