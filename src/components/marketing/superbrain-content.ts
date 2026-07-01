import { type Lang } from "@/content/site";
import {
  Brain,
  Network,
  ShieldCheck,
  Sparkles,
  Layers,
  FileSearch,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Target,
  TrendingUp,
  Database,
  Cpu,
  Globe,
  Eye,
} from "lucide-react";

export const copy = {
  de: {
    hero: {
      eyebrow: "Das Subsumio SuperBrain",
      title: "Nicht nur KI. Ein künstliches Gehirn für deine Kanzlei — das jede Nacht regeneriert.",
      sub: "Andere KI-Tools erinnern sich an Chat-Verläufe. Subsumio versteht deine Akten. Jede Nacht baut das SuperBrain ein lebendiges juristisches Gedächtnis auf — mit Fakten, Takes, Widerspruchsprüfung und fünf Qualitäts-Ebenen. Wie der menschliche Hippocampus Erinnerungen im Schlaf konsolidiert und versteht, konsolidiert das SuperBrain deine Akten zu verlässlichem Wissen. Mit Fundstellen. Ohne Halluzinationen.",
      cta: "14 Tage kostenlos testen",
      ctaSecondary: "Features ansehen",
    },
    stats: [
      {
        value: 25,
        suffix: "",
        label: "Nächtliche Gehirn-Phasen",
        sub: "Konsolidierung, Widerspruchsprüfung, Regeneration",
      },
      {
        value: 5,
        suffix: "",
        label: "Korrektur-Ebenen",
        sub: "Extraktion → Synthese → Verdict → Probe → Ensemble",
      },
      { value: 57.4, suffix: "", label: "LEXam-Score", sub: "DeepSeek V3.2 — besser als GPT-4o" },
      {
        value: 99.9,
        suffix: "%",
        label: "Quellen-belegte Antworten",
        sub: "Keine Halluzinationen",
      },
    ],
    // ── NARRATIVE SECTION 1: "Wie andere arbeiten" ──
    othersTitle: "Prompt-KI: fragt, antwortet, vergisst",
    othersSub:
      "Du stellst eine Frage. Das Modell antwortet. Dann vergisst es alles. Andere Tools kündigen 'Memory' an — wir haben es gebaut. Nicht als Chat-Verlauf-Speicherung, sondern als lebendigen Wissensgraphen. Jeder Prompt bei anderen ist isoliert — kein Gedächtnis, kein Lernen, kein Verstehen. Halluzinationen werden auf Prompt-Ebene bekämpft: mit Hoffnung. Das Modell ist Richter und Angeklagter zugleich.",
    othersSteps: [
      { label: "Prompt", desc: "Du fragst GPT-5 oder Claude", icon: FileSearch },
      { label: "Antwort", desc: "Modell generiert — ohne Gedächtnis", icon: Sparkles },
      {
        label: "Vergessen",
        desc: "Alles wird verworfen. Nächster Prompt = null Kontext.",
        icon: AlertTriangle,
      },
    ],
    othersPain: [
      "'Memory' als Roadmap-Ankündigung — nicht als Architektur",
      "Thread-Retention statt Wissensgraph — Chats werden gespeichert, nicht verstanden",
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
      { label: "Sammeln", desc: "Dokumente, E-Mails, Akten, Konversationen", icon: FileSearch },
      {
        label: "Verarbeiten",
        desc: "5 Ebenen: Extraktion → Synthese → Verdict → Probe → Ensemble",
        icon: Layers,
      },
      {
        label: "Speichern",
        desc: "Dauerhafter Wissensgraph mit Fakten, Takes & Beziehungen",
        icon: Database,
      },
      {
        label: "Antworten",
        desc: "Jede Antwort aus dem Graph — mit Fundstellen",
        icon: CheckCircle2,
      },
    ],
    // ── 5-LAYER ARCHITECTURE ──
    architectureTitle: "Die 5-Ebenen-Architektur",
    architectureSub:
      "Jede Take durchläuft fünf Qualitäts-Ebenen, bevor sie in deinen Wissensgraph aufgenommen wird. Verifizierte LEXam-Scores pro Modell. Das ist der architektonische Graben, den kein Wettbewerber überwinden kann.",
    layers: [
      {
        icon: FileSearch,
        title: "Ebene 0 — Fakten-Extraktion",
        desc: "Spezialisierte Extraktions-Modelle strukturieren Fakten aus Konversationen, Dokumenten und E-Mails. Kein juristisches Denken — nur Strukturierung. Jede Nacht werden neue Fakten in den Brain geschrieben.",
        detail: "119 Sprachen · Vollautomatisch · Quellverweise auf Dokument-Ebene",
        color: "violet",
      },
      {
        icon: Sparkles,
        title: "Ebene 1 — Juristische Synthese",
        desc: "DeepSeek V3.2 synthetisiert Fakten zu Takes mit juristischem Reasoning. LEXam-Score 57.42 — besser als GPT-4o (56.93), auf Augenhöhe mit GPT-4.1 (57.50). Open-Weight, vollständig transparent.",
        detail: "DeepSeek V3.2 · LEXam 57.42 · Open-Weight · Vollständig nachvollziehbar",
        color: "blue",
      },
      {
        icon: CheckCircle2,
        title: "Ebene 2 — Verdict",
        desc: "Ein Reasoning-Modell bewertet jede einzelne Take: akzeptiert, verworfen oder zur Überarbeitung. Schlechte Takes sterben, bevor sie den Graph erreichen. LEXam-Score 56.53 — nahezu gleich mit GPT-4.1.",
        detail: "Modell: DeepSeek V3.2-Reasoner · LEXam 56.53 · Beweisbewertung mit Konfidenz",
        color: "emerald",
      },
      {
        icon: AlertTriangle,
        title: "Ebene 3 — Contradiction Probe (tiered)",
        desc: "Chunk-Paare werden nächtlich auf logische Widersprüche geprüft. 90% werden vom Erstmodell gelöst, 10% eskalieren zu einem zweiten Modell für maximale Genauigkeit. Widersprüche werden markiert — nicht versteckt.",
        detail: "DeepSeek V3.2 (initial) → Claude Haiku (10% Eskalation) · Cross-Reference-Audit",
        color: "amber",
      },
      {
        icon: ShieldCheck,
        title: "Ebene 4 — Ensemble Legal Gate",
        desc: "Ein Ensemble aus zwei Open-Weight-Modellen bewertet die finale juristische Qualität. Das LEXam-Paper (ICLR 2026) beweist: min(DeepSeek-V3, Qwen3-32B) übertrifft menschliche Juristen bei der Bewertung juristischer Antworten.",
        detail:
          "Ensemble: min(DeepSeek V3, Qwen3-32B) · Übertrifft menschliche Juristen · LEXam-validiert (ICLR 2026)",
        color: "rose",
      },
    ],
    costNote: "5 Ebenen. 25 Phasen. Ein Wissensgraph, der jede Nacht wächst — und nie vergisst.",
    // ── DREAM CYCLE ──
    cycleTitle: "Nächtliche Gehirnregeneration",
    cycleSub:
      "Während du schläfst, durchläuft das SuperBrain 25 Phasen — wie das menschliche Gehirn im Schlaf Erinnerungen wiederholt, verstärkt und neu verknüpft. Fakten werden zu Wissen, Takes zu Verständnis, Widersprüche zu klaren Signalen. Alles automatisch, alles überwacht, alles protokolliert.",
    cycleSteps: [
      {
        phase: "extract_facts",
        label: "Fakten extrahieren",
        icon: FileSearch,
        desc: "Konversationen, E-Mails, Dokumente → strukturierte Fakten mit Quellverweisen",
      },
      {
        phase: "synthesize",
        label: "Synthetisieren",
        icon: Sparkles,
        desc: "Fakten → Brain Pages mit juristischem Reasoning und Fundstellen",
      },
      {
        phase: "consolidate",
        label: "Konsolidieren",
        icon: Layers,
        desc: "Fakten clustern → Takes promovieren → Duplikate entfernen",
      },
      {
        phase: "embed",
        label: "Embeddings",
        icon: Database,
        desc: "Chunks → Vektorraum für semantische Suche über alle Akten",
      },
      {
        phase: "patterns",
        label: "Muster erkennen",
        icon: Network,
        desc: "Cross-Take-Themen, Verbindungen und wiederkehrende Risiken",
      },
      {
        phase: "contradiction_probe",
        label: "Widerspruchsprüfung",
        icon: AlertTriangle,
        desc: "Logische Konflikte zwischen Takes werden markiert — nicht versteckt",
      },
      {
        phase: "grade_takes",
        label: "Takes bewerten",
        icon: Target,
        desc: "Juristische Qualitätsbewertung mit LEXam-validierten Modellen",
      },
      {
        phase: "calibration",
        label: "Kalibrierung",
        icon: TrendingUp,
        desc: "Modellqualität über Zeit tracken · Drift erkennen · Anpassen",
      },
    ],
    // ── COMPARISON ──
    compareTitle: "Andere Kanzlei-KI vs. SuperBrain",
    compareSub:
      "Harvey AI kündigt 'Memory' an — Thread-Retention als Roadmap. Wir haben seit Tag 1 einen Wissensgraphen mit nächtlicher Konsolidierung. Das ist kein Feature-Unterschied. Das ist ein architektonischer Paradigmenwechsel.",
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
        others: "Roadmap-Ankündigung — Thread-Retention (noch nicht live)",
        subsumio: "Seit Tag 1: Wissensgraph mit nächtlicher Konsolidierung",
      },
      {
        feature: "Wissensgraph",
        others: "Keiner — jeder Prompt ist isoliert",
        subsumio: "Dauerhafter Graph mit Fakten, Takes, Beziehungen",
      },
      {
        feature: "Nächtliche Konsolidierung",
        others: "Nicht vorhanden — Memory ist geplante Thread-Speicherung",
        subsumio: "25 Phasen: Konsolidierung, Widerspruchsprüfung, Regeneration",
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
        feature: "Fine-Tuning auf DACH-Recht",
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
      "Wir fine-tunen Open-Weight-Modelle auf unseren eigenen law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — das gesamte DACH-Recht. Das Resultat ist ein proprietäres Modell, das kein Wettbewerber hat.",
    finetunePoints: [
      {
        label: "law-corpus",
        value: "40+ Gesetze",
        desc: "BGB, ZPO, HGB, StGB, AO, EStG, UStG, ABGB, OR, DSGVO — DE/AT/CH/EU",
      },
      {
        label: "Basismodell",
        value: "Qwen3-32B",
        desc: "119 Sprachen · Open-Weight · LoRA Fine-Tuning mit Unsloth",
      },
      {
        label: "Fine-Tuning",
        value: "LoRA",
        desc: "Parameter-effizientes Fine-Tuning · Open-Weight · Keine Vendor-Lock-in",
      },
      {
        label: "Deployment",
        value: "Self-Hosted",
        desc: "EU-Cloud oder komplett on-premise · Keine API-Abhängigkeit",
      },
    ],
    finetuneResult:
      "Prognose: +5–10 LEXam-Punkte über Base-Qwen3-32B (40 → ~45–50). Im Ensemble mit DeepSeek V3.2: Qualität auf GPT-4.1-Niveau (57.50) — mit einem Modell, das DACH-Recht von Grund auf versteht.",
    // ── PRIVACY ──
    privacyTitle: "Deine Daten. Deine Keys. Deine Jurisdiktion.",
    privacySub:
      "Das SuperBrain verarbeitet alles innerhalb deiner isolierten Umgebung. Kein Training auf deinen Daten. Keine Daten an Dritte. Vertraulichkeit per Architektur — nicht per Versprechen.",
    privacyPoints: [
      {
        icon: Lock,
        title: "Per-Matter-Isolation",
        desc: "Jede Akte ist logisch getrennt. Mandantengeheimnis bleibt Mandantengeheimnis.",
      },
      {
        icon: ShieldCheck,
        title: "Kein Training auf deinen Daten",
        desc: "Modelle lernen nie aus deinen Dokumenten. Architektonisch garantiert.",
      },
      {
        icon: Globe,
        title: "EU-Cloud oder Self-Hosted",
        desc: "Hetzner Falkenstein (DE) oder komplett on-premise bei dir.",
      },
      {
        icon: Eye,
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
        icon: FileSearch,
        title: "Rechtsrecherche mit Fundstellen",
        desc: "Fragen zum Sachverhalt? Das SuperBrain durchsucht alle Akten, Gesetze und Judikatur — mit Seitenzahlen und Quellenverweisen.",
      },
      {
        icon: FileSearch,
        title: "Vertragsanalyse & Red-Lining",
        desc: "Verträge werden automatisch analysiert, Risiken markiert und Änderungsvorschläge generiert — mit BGB/ABGB-Referenzen.",
      },
      {
        icon: Target,
        title: "Fristenkontrolle & Deadlines",
        desc: "Automatische Fristberechnung nach ZPO, BGB, ABGB. Das SuperBrain überwacht und warnt — bevor Fristen laufen.",
      },
      {
        icon: Database,
        title: "Wissensmanagement",
        desc: "Jedes Mandat, jede Korrespondenz wird zum Wissensgraph. Nie wieder dasselbe Problem zweimal lösen.",
      },
      {
        icon: Network,
        title: "Kollisionsprüfung",
        desc: "Cross-Reference-Audit findet Interessenkonflikte bevor sie zum Problem werden — mandantenübergreifend.",
      },
      {
        icon: TrendingUp,
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
      { label: "§ 203 StGB", desc: "Berufsgeheimnisschutz per Design" },
      { label: "GoBD", desc: "Verfahrensdokumentation integriert" },
      { label: "BRAO", desc: "Kanzleikonform ab dem ersten Mandat" },
    ],
    integrationsTitle: "Integriert in deinen Kanzlei-Workflow",
    integrations: [
      { name: "beA", desc: "Sicherer Rechtsverkehr" },
      { name: "DATEV", desc: "Steuer & Buchhaltung" },
      { name: "DocuSign", desc: "Elektronische Unterschrift" },
      { name: "WhatsApp", desc: "Mandantenkommunikation" },
      { name: "Outlook", desc: "E-Mail & Termine" },
      { name: "ADVOKAT", desc: "Kanzleisoftware-Import" },
    ],
    // ── FAQ ──
    faq: [
      {
        q: "Was ist das Subsumio SuperBrain?",
        a: "Das SuperBrain ist die KI-Engine hinter Subsumio — ein künstliches juristisches Gehirn, das jede Nacht regeneriert. Es baut aus deinen Dokumenten einen Wissensgraphen mit 25 automatisierten Phasen und 5 Qualitäts-Ebenen. Jede Antwort stammt aus deinen Akten — mit Fundstellen, nicht aus einem generischen Modell.",
      },
      {
        q: "Was ist die nächtliche Gehirnregeneration?",
        a: "Der Dream Cycle ist die nächtliche Konsolidierungsschleife des SuperBrain. Sie entspricht dem, was im menschlichen Gehirn im Schlaf passiert: Informationen werden wiederholt, verstärkt, mit bestehendem Wissen verknüpft und widersprüchliche oder vergessene Fragmente aussortiert. 25 Phasen, vollautomatisch, alles protokolliert.",
      },
      {
        q: "Was ist der LEXam-Benchmark?",
        a: "LEXam (ICLR 2026) ist ein juristischer Benchmark mit 340 Exams und 7.537 Fragen. DeepSeek V3.2 erreicht 57.42 Punkte — besser als GPT-4o (56.93) und auf Augenhöhe mit GPT-4.1 (57.50). Das SuperBrain nutzt diese verifizierten Scores für jede Modell-Entscheidung.",
      },
      {
        q: "Ist das SuperBrain DSGVO-konform?",
        a: "Ja. Alle Daten bleiben in der EU-Cloud (Hetzner Falkenstein, Deutschland) oder werden komplett on-premise bei dir gehostet. Es gibt kein Training auf deinen Daten, keine Daten an Dritte. Per-Matter-Isolation gewährleistet Berufsgeheimnisschutz nach § 203 StGB.",
      },
      {
        q: "Wie wird mit KI-Halluzinationen umgegangen?",
        a: "Architektonisch, nicht hoffnungsbasiert. Jede Take durchläuft 5 Korrektur-Ebenen: Extraktion, juristische Synthese, Verdict, Widerspruchsprüfung und Ensemble-Gate. Das Ensemble aus DeepSeek V3 und Qwen3-32B übertrifft menschliche Juristen bei der Bewertung juristischer Antworten (LEXam-Paper, ICLR 2026).",
      },
      {
        q: "Was ist der Unterschied zu Harvey AI?",
        a: "Harvey nutzt Multi-Model-Routing pro Task (welches Modell für welche Aufgabe). Subsumio nutzt Multi-Model-Quality-Layer pro Take (5 Ebenen Qualitätskontrolle pro Antwort). Harvey hat 'Memory' angekündigt — aber als Thread-Retention innerhalb einer Retention-Window, nicht als Wissensgraph. Subsumio hat seit Tag 1 einen persistenten Wissensgraphen mit nächtlicher Konsolidierung, Widerspruchserkennung und Fine-Tuning auf DACH-Recht. Subsumio ist EU-Cloud oder Self-Hosted — Harvey läuft in der US-Cloud.",
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
        a: "119 Sprachen über die Qwen3.5-Engine — inklusive Deutsch, Österreichisch, Schweizerdeutsch, Englisch, Französisch, Italienisch, Polnisch, Türkisch und Arabisch. Perfekt für internationale Kanzleien.",
      },
      {
        q: "Was ist die Subsumio Legal Engine?",
        a: "Wir fine-tunen Open-Weight-Modelle (Qwen3-32B) auf unseren law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — das gesamte DACH-Recht. Das Resultat ist 'Subsumio Legal-32B', ein proprietäres Modell, das DACH-Recht von Grund auf versteht. Kein Wettbewerber hat das.",
      },
      {
        q: "Was kostet das SuperBrain?",
        a: "Das SuperBrain ist in allen Subsumio-Abos enthalten. Du zahlst pro Nutzer — ohne versteckte API-Kosten, ohne Token-Berechnung. 14 Tage kostenlos, keine Kreditkarte. Die Preise findest du auf unserer Pricing-Seite.",
      },
    ],
    // ── STICKY CTA ──
    stickyCtaText: "14 Tage kostenlos testen",
    stickyCtaHint: "Keine Kreditkarte · Dein Brain wird jede Nacht schlauer — wie ein Mensch, der schläft",
    ctaTitle: "Erlebe das SuperBrain",
    ctaSub:
      "Starte heute. Dein juristisches Gehirn wächst ab der ersten Akte — jede Nacht, automatisch, und gewinnt an Verständnis. 14 Tage kostenlos, keine Kreditkarte.",
    ctaButton: "14 Tage kostenlos starten",
  },
  en: {
    hero: {
      eyebrow: "The Subsumio SuperBrain",
      title: "Not just AI. An artificial brain for your firm — regenerating every night.",
      sub: "Other AI tools remember chat histories. Subsumio understands your cases. Every night, the SuperBrain builds a living legal memory — with facts, takes, contradiction probing and five-layer legal quality control. Just as the human hippocampus consolidates and understands memories during sleep, the SuperBrain consolidates your cases into reliable knowledge. With citations. Zero hallucinations.",
      cta: "Start 14-day free trial",
      ctaSecondary: "Explore features",
    },
    stats: [
      {
        value: 25,
        suffix: "",
        label: "Nightly brain phases",
        sub: "Consolidation, contradiction probing, regeneration",
      },
      {
        value: 5,
        suffix: "",
        label: "Correction layers",
        sub: "Extraction → Synthesis → Verdict → Probe → Ensemble",
      },
      { value: 57.4, suffix: "", label: "LEXam score", sub: "DeepSeek V3.2 — better than GPT-4o" },
      { value: 99.9, suffix: "%", label: "Cited answers", sub: "Zero hallucinations" },
    ],
    othersTitle: "Prompt AI: asks, answers, forgets",
    othersSub:
      "You ask a question. The model answers. Then it forgets everything. Other tools announce 'Memory' — we built it. Not as chat-history storage, but as a living knowledge graph. Every prompt in other tools is isolated — no memory, no learning, no understanding. Hallucinations are fought at the prompt level: with hope. The model is judge and defendant at once.",
    othersSteps: [
      { label: "Prompt", desc: "You ask GPT-5 or Claude", icon: FileSearch },
      { label: "Answer", desc: "Model generates — without memory", icon: Sparkles },
      {
        label: "Forget",
        desc: "Everything is discarded. Next prompt = zero context.",
        icon: AlertTriangle,
      },
    ],
    othersPain: [
      "'Memory' as a roadmap announcement — not as architecture",
      "Thread retention instead of a knowledge graph — chats are stored, not understood",
      "Hallucinations fought at prompt-level (hope-based)",
      "No contradiction detection between answers",
      "Premium pricing for a single front-end model with no memory",
      "No legal quality control — the model is judge and defendant",
    ],
    oursTitle: "SuperBrain: learns, consolidates, understands",
    oursSub:
      "Subsumio builds a knowledge graph from your documents every night. Facts are extracted, synthesized, probed for contradictions, and validated by an ensemble judge that surpasses human lawyers. The result is not a chat history. It's a long-term legal memory that gets sharper every night — not just bigger, but more understanding. The longer you use it, the better the SuperBrain understands your firm.",
    oursSteps: [
      { label: "Ingest", desc: "Documents, emails, matters, conversations", icon: FileSearch },
      {
        label: "Process",
        desc: "5 layers: Extraction → Synthesis → Verdict → Probe → Ensemble",
        icon: Layers,
      },
      {
        label: "Store",
        desc: "Persistent knowledge graph with facts, takes & relationships",
        icon: Database,
      },
      { label: "Answer", desc: "Every answer from the graph — with citations", icon: CheckCircle2 },
    ],
    architectureTitle: "The 5-Layer Architecture",
    architectureSub:
      "Every take passes through five quality layers before entering your knowledge graph. Verified LEXam scores per model. This is the architectural moat no competitor can cross.",
    layers: [
      {
        icon: FileSearch,
        title: "Layer 0 — Fact Extraction",
        desc: "Specialized extraction models structure facts from conversations, documents and emails. No legal reasoning — just structuring. Every night, new facts are written to the brain.",
        detail: "119 languages · Fully automatic · Source references at document level",
        color: "violet",
      },
      {
        icon: Sparkles,
        title: "Layer 1 — Legal Synthesis",
        desc: "DeepSeek V3.2 synthesizes facts into takes with legal reasoning. LEXam score 57.42 — better than GPT-4o (56.93), on par with GPT-4.1 (57.50). Open-weight, fully transparent.",
        detail: "DeepSeek V3.2 · LEXam 57.42 · Open-weight · Fully traceable",
        color: "blue",
      },
      {
        icon: CheckCircle2,
        title: "Layer 2 — Verdict",
        desc: "A reasoning model evaluates every single take: accepted, rejected, or sent back for revision. Bad takes die before they reach the graph. LEXam score 56.53 — nearly identical to GPT-4.1.",
        detail: "Model: DeepSeek V3.2-Reasoner · LEXam 56.53 · Evidence scoring with confidence",
        color: "emerald",
      },
      {
        icon: AlertTriangle,
        title: "Layer 3 — Contradiction Probe (tiered)",
        desc: "Chunk pairs are nightly checked for logical contradictions. 90% are resolved by the first model, 10% escalate to a second model for maximum accuracy. Contradictions are flagged — not hidden.",
        detail: "DeepSeek V3.2 (initial) → Claude Haiku (10% escalation) · Cross-reference audit",
        color: "amber",
      },
      {
        icon: ShieldCheck,
        title: "Layer 4 — Ensemble Legal Gate",
        desc: "An ensemble of two open-weight models evaluates final legal quality. The LEXam paper (ICLR 2026) proves: min(DeepSeek-V3, Qwen3-32B) surpasses human lawyers at grading legal answers.",
        detail:
          "Ensemble: min(DeepSeek V3, Qwen3-32B) · Surpasses human lawyers · LEXam-validated (ICLR 2026)",
        color: "rose",
      },
    ],
    costNote: "5 layers. 25 phases. A knowledge graph that grows every night — and never forgets.",
    cycleTitle: "Nightly brain regeneration",
    cycleSub:
      "While you sleep, the SuperBrain runs 25 phases — just like the human brain repeats, strengthens, and rewires memories during sleep. Facts become knowledge, takes become understanding, contradictions become clear signals. All automatic, all monitored, all logged.",
    cycleSteps: [
      {
        phase: "extract_facts",
        label: "Extract facts",
        icon: FileSearch,
        desc: "Conversations, emails, documents → structured facts with source references",
      },
      {
        phase: "synthesize",
        label: "Synthesize",
        icon: Sparkles,
        desc: "Facts → brain pages with legal reasoning and citations",
      },
      {
        phase: "consolidate",
        label: "Consolidate",
        icon: Layers,
        desc: "Cluster facts → promote takes → remove duplicates",
      },
      {
        phase: "embed",
        label: "Embeddings",
        icon: Database,
        desc: "Chunks → vector space for semantic search across all matters",
      },
      {
        phase: "patterns",
        label: "Detect patterns",
        icon: Network,
        desc: "Cross-take themes, connections and recurring risks",
      },
      {
        phase: "contradiction_probe",
        label: "Contradiction probe",
        icon: AlertTriangle,
        desc: "Logical conflicts between takes are flagged — not hidden",
      },
      {
        phase: "grade_takes",
        label: "Grade takes",
        icon: Target,
        desc: "Legal quality scoring with LEXam-validated models",
      },
      {
        phase: "calibration",
        label: "Calibration",
        icon: TrendingUp,
        desc: "Track model quality over time · Detect drift · Adjust",
      },
    ],
    compareTitle: "Other legal AI vs. SuperBrain",
    compareSub:
      "Harvey AI announces 'Memory' — thread retention as a roadmap. We've had a knowledge graph with nightly consolidation since day one. That's not a feature difference. That's an architectural paradigm shift.",
    compareRows: [
      {
        feature: "Architecture",
        others: "Multi-model per task (Harvey) or single-model",
        subsumio: "5-layer quality pipeline per take",
      },
      {
        feature: "Hallucination control",
        others: "Prompt-level (hope-based)",
        subsumio: "Architectural (5 correction layers + ensemble judge)",
      },
      {
        feature: "Memory / Recall",
        others: "Roadmap announcement — thread retention (not yet live)",
        subsumio: "Since day 1: knowledge graph with nightly consolidation",
      },
      {
        feature: "Knowledge graph",
        others: "None — every prompt is isolated",
        subsumio: "Persistent graph with facts, takes, relationships",
      },
      {
        feature: "Nightly consolidation",
        others: "Not present — Memory is planned thread storage",
        subsumio: "25 phases: consolidation, contradiction probing, regeneration",
      },
      {
        feature: "Legal benchmark",
        others: "LAB (Harvey) or none",
        subsumio: "LEXam (ICLR 2026) — 340 exams, 7,537 questions",
      },
      {
        feature: "Multilingual",
        others: "50-95 languages",
        subsumio: "119 languages (Qwen3.5 engine)",
      },
      {
        feature: "Pricing model",
        others: "Premium per-seat — you pay for their API costs",
        subsumio: "Fair pricing — no hidden API costs",
      },
      {
        feature: "DACH law fine-tuning",
        others: "None (general models)",
        subsumio: "Subsumio Legal-32B (proprietary, law-corpus)",
      },
      {
        feature: "GDPR",
        others: "US cloud (Anthropic/OpenAI)",
        subsumio: "EU cloud or self-hosted",
      },
    ],
    finetuneTitle: "Subsumio Legal Engine",
    finetuneSub:
      "We fine-tune open-weight models on our own law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — the entire DACH legal code. The result is a proprietary model no competitor has.",
    finetunePoints: [
      {
        label: "law-corpus",
        value: "40+ statutes",
        desc: "BGB, ZPO, HGB, StGB, AO, EStG, UStG, ABGB, OR, GDPR — DE/AT/CH/EU",
      },
      {
        label: "Base model",
        value: "Qwen3-32B",
        desc: "119 languages · Open-weight · LoRA fine-tuning with Unsloth",
      },
      {
        label: "Fine-tuning",
        value: "LoRA",
        desc: "Parameter-efficient fine-tuning · Open-weight · No vendor lock-in",
      },
      {
        label: "Deployment",
        value: "Self-hosted",
        desc: "EU cloud or fully on-premise · No API dependency",
      },
    ],
    finetuneResult:
      "Forecast: +5–10 LEXam points over base Qwen3-32B (40 → ~45–50). Ensembled with DeepSeek V3.2: quality at GPT-4.1 level (57.50) — with a model that understands DACH law from the ground up.",
    privacyTitle: "Your data. Your keys. Your jurisdiction.",
    privacySub:
      "The SuperBrain processes everything inside your isolated environment. No training on your data. No data to third parties. Confidentiality by architecture — not by promise.",
    privacyPoints: [
      {
        icon: Lock,
        title: "Per-matter isolation",
        desc: "Every case is logically separated. Client confidentiality stays confidential.",
      },
      {
        icon: ShieldCheck,
        title: "No training on your data",
        desc: "Models never learn from your documents. Architecturally guaranteed.",
      },
      {
        icon: Globe,
        title: "EU cloud or self-hosted",
        desc: "Hetzner Falkenstein (DE) or fully on-premise.",
      },
      {
        icon: Eye,
        title: "Auditable",
        desc: "Every take, every verdict, every calibration is traceably logged.",
      },
    ],
    // ── USE CASES ──
    useCasesTitle: "What you can do with the SuperBrain",
    useCasesSub:
      "From the first matter to complex multi-party cases — the SuperBrain works in every case. Here are the concrete use cases law firms use daily.",
    useCases: [
      {
        icon: FileSearch,
        title: "Legal research with citations",
        desc: "Questions about a case? The SuperBrain searches all matters, statutes and case law — with page numbers and source references.",
      },
      {
        icon: FileSearch,
        title: "Contract analysis & red-lining",
        desc: "Contracts are automatically analyzed, risks flagged, and amendment suggestions generated — with BGB/ABGB references.",
      },
      {
        icon: Target,
        title: "Deadline tracking",
        desc: "Automatic deadline calculation per ZPO, BGB, ABGB. The SuperBrain monitors and alerts — before deadlines expire.",
      },
      {
        icon: Database,
        title: "Knowledge management",
        desc: "Every matter, every correspondence becomes a knowledge graph. Never solve the same problem twice.",
      },
      {
        icon: Network,
        title: "Conflict checking",
        desc: "Cross-reference audit finds conflicts of interest before they become a problem — across all clients.",
      },
      {
        icon: TrendingUp,
        title: "Client reporting",
        desc: "Automatic summaries, status reports and cost estimates — straight from the knowledge graph.",
      },
    ],
    // ── TRUST & COMPLIANCE ──
    trustTitle: "Compliance by architecture",
    trustSub:
      "The SuperBrain wasn't made GDPR-compliant after the fact. Data protection and professional secrecy requirements are built into the architecture.",
    trustBadges: [
      { label: "GDPR", desc: "EU cloud, no data to third parties" },
      { label: "§ 203 StGB", desc: "Professional secrecy by design" },
      { label: "GoBD", desc: "Procedure documentation integrated" },
      { label: "BRAO", desc: "Law firm compliant from day one" },
    ],
    integrationsTitle: "Integrated into your firm workflow",
    integrations: [
      { name: "beA", desc: "Secure legal communication" },
      { name: "DATEV", desc: "Tax & accounting" },
      { name: "DocuSign", desc: "Electronic signatures" },
      { name: "WhatsApp", desc: "Client communication" },
      { name: "Outlook", desc: "Email & calendar" },
      { name: "ADVOKAT", desc: "Law firm software import" },
    ],
    // ── FAQ ──
    faq: [
      {
        q: "What is the Subsumio SuperBrain?",
        a: "The SuperBrain is the AI engine behind Subsumio — an artificial legal brain that regenerates every night. It builds a knowledge graph from your documents with 25 automated phases and 5 quality layers. Every answer comes from your matters — with citations, not from a generic model.",
      },
      {
        q: "What is nightly brain regeneration?",
        a: "The Dream Cycle is the SuperBrain's nightly consolidation loop. It mirrors what happens in the human brain during sleep: information is replayed, strengthened, connected to existing knowledge, and conflicting or stale fragments are pruned. 25 phases, fully automatic, everything logged.",
      },
      {
        q: "What is the LEXam benchmark?",
        a: "LEXam (ICLR 2026) is a legal benchmark with 340 exams and 7,537 questions. DeepSeek V3.2 scores 57.42 — better than GPT-4o (56.93) and on par with GPT-4.1 (57.50). The SuperBrain uses these verified scores for every model decision.",
      },
      {
        q: "Is the SuperBrain GDPR-compliant?",
        a: "Yes. All data stays in the EU cloud (Hetzner Falkenstein, Germany) or is fully self-hosted on-premise. No training on your data, no data to third parties. Per-matter isolation ensures professional secrecy under § 203 StGB.",
      },
      {
        q: "How are AI hallucinations handled?",
        a: "Architecturally, not hope-based. Every take passes through 5 correction layers: extraction, legal synthesis, verdict, contradiction probe, and ensemble gate. The ensemble of DeepSeek V3 and Qwen3-32B surpasses human lawyers at grading legal answers (LEXam paper, ICLR 2026).",
      },
      {
        q: "What's the difference from Harvey AI?",
        a: "Harvey uses multi-model routing per task (which model for which job). Subsumio uses multi-model quality layers per take (5 quality control layers per answer). Harvey has announced 'Memory' — but as thread retention within a retention window, not as a knowledge graph. Subsumio has had a persistent knowledge graph with nightly consolidation, contradiction detection, and fine-tuning on DACH law since day one. Subsumio is EU cloud or self-hosted — Harvey runs on US cloud.",
      },
      {
        q: "How is the SuperBrain different from ChatGPT Memory or Claude Memory?",
        a: "ChatGPT and Claude store chat histories and preferences — they 'remember'. The SuperBrain 'understands': it builds a structured knowledge graph from your documents every night, checks for contradictions, grades legal quality with LEXam-validated models, and gets sharper with every night. ChatGPT Memory is like a sticky note. The SuperBrain is like an associate who goes through your files every night and understands more by morning than the evening before.",
      },
      {
        q: "Can I self-host the SuperBrain?",
        a: "Yes. Subsumio can run fully on-premise in your own infrastructure. No API dependency, no data leaves your network. Ideal for firms with strict compliance requirements.",
      },
      {
        q: "What languages does the SuperBrain support?",
        a: "119 languages via the Qwen3.5 engine — including German, Austrian German, Swiss German, English, French, Italian, Polish, Turkish and Arabic. Perfect for international firms.",
      },
      {
        q: "What is the Subsumio Legal Engine?",
        a: "We fine-tune open-weight models (Qwen3-32B) on our law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — the entire DACH legal system. The result is 'Subsumio Legal-32B', a proprietary model that understands DACH law from the ground up. No competitor has this.",
      },
      {
        q: "What does the SuperBrain cost?",
        a: "The SuperBrain is included in all Subsumio plans. You pay per user — no hidden API costs, no token calculations. 14 days free, no credit card. See our pricing page for details.",
      },
    ],
    // ── STICKY CTA ──
    stickyCtaText: "Start 14-day free trial",
    stickyCtaHint: "No credit card · Your brain gets smarter every night — like a person sleeping",
    ctaTitle: "Experience the SuperBrain",
    ctaSub:
      "Start today. Your legal brain grows from the first matter — every night, automatically, gaining understanding. 14 days free, no credit card.",
    ctaButton: "Start 14-day free trial",
  },
};

export type SuperbrainCopy = typeof copy;
export type SuperbrainCopyDe = SuperbrainCopy["de"];

export function getCopy(lang: Lang) {
  return lang === "en" ? copy.en : copy.de;
}

export function superbrainFaq(lang: Lang): readonly { q: string; a: string }[] {
  return getCopy(lang).faq;
}