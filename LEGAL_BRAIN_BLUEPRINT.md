# Legal Brain Blueprint — Sigmabrain Erweiterung

## Ziel
Ein vollständiges **Legal Brain** Subsystem für Anwälte und Kanzleien. Pseudonymisiert, datenschutzkonform, mit intelligenter Fallunterstützung.

## ⚖️ LEITPLANKEN (verbindlich — vor jedem Feature-Ausbau lesen)

1. **Pseudonymisierung, nicht Anonymisierung.** Der HMAC-Ansatz (anonymizer.ts)
   ist DSGVO-rechtlich Pseudonymisierung (Art. 4 Nr. 5) — mit Owner-Key
   auflösbar, also bleiben die Daten personenbezogen. Öffentliche Doku,
   Marketing und UI dürfen NIE „anonymisiert" behaupten. Sprachregelung:
   „pseudonymisiert; Klarnamen nur mit dem Schlüssel des Eigentümers auflösbar".
2. **Datenquellen der Gegner-Analyse (Flow 2/4) sind hart beschränkt auf:**
   (a) ÖFFENTLICHE Quellen (RIS, Urteilsdatenbanken, law-de/law-at-Corpus,
   Recherche-Skills auf öffentliche Inhalte) und (b) EIGENE Fälle der
   JEWEILIGEN Kanzlei (gleiche source_id). **NIEMALS Cross-Tenant-Daten,
   auch nicht pseudonymisiert** — § 203 StGB/Verschwiegenheit + unser
   /security-Versprechen („eure Mandate bleiben eure"). Das Repository ist
   bereits durchgängig source-gescoped (WHERE source_id = …); jede neue
   Query MUSS dieses Muster übernehmen (Engine-Invariante sourceScopeOpts).
3. **Keine autoritativen Rechtsschlüsse.** Chancen-/Strategie-Outputs
   (Flow 3/4) tragen IMMER den Verifikations-Standard aus deadline-extract:
   Quellen-Zitate (§§ mit Fassungsdatum aus law-de/law-at, Akten-Fundstellen)
   plus expliziter Hinweis „fachlich verifizieren — ersetzt keine
   anwaltliche Prüfung". Fristen werden nie berechnet, nur verbatim erfasst.
4. **Gesetzes-Zitate nur mit Versionsstand.** Der law-Corpus
   (server/scripts/ingest-law-corpus.ts) stempelt version_date je Gesetz —
   Antworten zitieren „§ X AHG, Fassung vom YYYY-MM-DD". Ein Zitat ohne
   Stand ist ein Bug.

## Kern-Userflows

### Flow 1: Anwalt/Kanzlei-Profil anlegen
1. Nutzer gibt Kanzleinamen + Rechtsgebiete ein
2. System erstellt anonymisiertes Profil (Hash-ID, keine personenbezogenen Daten im Brain)
3. Profil enthält: Rechtsgebiete, Spezialisierungen, erfolgreiche Verfahren (anonym), Schwerpunkte

### Flow 2: Fall anlegen & Gegner erfassen
1. Nutzer legt Rechtsfall an (Mandant anonymisiert)
2. Gegner wird eingetragen (Name, Kanzlei, Rechtsgebiet)
3. System baut Gegner-Profil aus öffentlichen Daten + Brain-Wissen
4. System analysiert: Chancen, Risiken, Strategieempfehlungen

### Flow 3: Rechtsfrage stellen
1. Nutzer: "Habe ich amtshaftungsrechtlich Chancen?"
2. System durchsucht:
   - Eigene anonymisierte Fälle
   - Öffentliche Rechtsprechung (per perplexity-research)
   - Gegner-Profile
   - Ähnliche Fälle im Brain
3. System gibt:
   - Rechtslage-Zusammenfassung
   - Chancen-Risiko-Analyse
   - Empfohlene Strategie
   - Relevante Präzedenzfälle
   - Gegner-Schwächen

### Flow 4: Gegner-Analyse
1. Nutzer gibt Gegner ein
2. System analysiert:
   - Frühere Verfahren des Gegners (Muster)
   - Gegnerische Kanzlei (Stärken/Schwächen)
   - Gerichtsstand-Statistiken
   - Erfolgsquoten in ähnlichen Fällen
3. System empfiehlt:
   - Prozessstrategie
   - Settlement-Schwellen
   - Zeitplanung

## Datenmodell

```typescript
interface LegalEntity {
  id: string;              // Hash-ID, nicht umkehrbar
  type: "lawyer" | "firm" | "court" | "opponent";
  displayName: string;      // Anzeigename (kann Pseudonym sein)
  legalAreas: string[];     // Rechtsgebiete
  specializations: string[];
  jurisdiction: string;     // Zuständigkeit
  anonymizedCases: CaseRef[];
  createdAt: Date;
  updatedAt: Date;
}

interface LegalCase {
  id: string;
  caseNumber: string;       // Interne Aktenzeichen
  displayTitle: string;     // Anonymisierter Titel
  legalArea: string;        // z.B. "Amtshaftungsrecht"
  subArea: string;          // z.B. "Polizeipflichtverletzung"
  status: "open" | "pending" | "settled" | "won" | "lost" | "appealed";
  opponentId: string;       // Referenz zu LegalEntity
  ownLawyerId: string;      // Referenz zu LegalEntity
  courtId: string;          // Referenz zu LegalEntity
  facts: string;            // Sachverhalt (anonymisiert)
  claims: string[];         // Ansprüche
  defense: string[];        // Einwendungen
  evidence: Evidence[];
  strategy: Strategy;
  outcome?: Outcome;
  similarCases: string[];    // Referenzen zu anderen Cases
  createdAt: Date;
  updatedAt: Date;
}

interface Evidence {
  id: string;
  type: "document" | "witness" | "expert" | "precedent" | "statute";
  description: string;
  source: string;
  weight: number;           // 0-1, Bewertung der Beweiskraft
  admitted: boolean;        // Zugelassen vom Gericht
}

interface Strategy {
  recommended: string;
  alternatives: string[];
  risks: string[];
  opportunities: string[];
  settlementRange?: { min: number; max: number; currency: string };
  timeline: string;
}

interface Outcome {
  result: "won" | "lost" | "settled" | "dismissed";
  amount?: number;
  currency?: string;
  reasoning: string;
  precedent: boolean;        // Kann als Präzedenzfall dienen
}
```

## Architektur

### 1. Skills (für den Agent)
- `skills/legal-brain/SKILL.md` — Hauptskill, Dispatcher für alle Legal-Operationen
- `skills/legal-case-create/SKILL.md` — Fall anlegen
- `skills/legal-opponent-analysis/SKILL.md` — Gegner-Analyse
- `skills/legal-chance-assessment/SKILL.md` — Chancen/Risiko-Bewertung
- `skills/legal-strategy/SKILL.md` — Strategie-Empfehlung
- `skills/legal-precedent-search/SKILL.md` — Präzedenzfall-Suche
- `skills/legal-entity-create/SKILL.md` — Anwalt/Kanzlei-Profil anlegen

### 2. Daten-Layer (src/core/legal/)
- `src/core/legal/types.ts` — TypeScript-Interfaces
- `src/core/legal/repository.ts` — CRUD-Operationen
- `src/core/legal/anonymizer.ts` — Anonymisierungs-Engine
- `src/core/legal/strategy-engine.ts` — Strategie-Generierung
- `src/core/legal/precedent-matcher.ts` — Präzedenzfall-Matching

### 3. CLI (src/commands/legal.ts)
- `gbrain legal case create` — Fall anlegen
- `gbrain legal case list` — Fälle auflisten
- `gbrain legal case show <id>` — Fall anzeigen
- `gbrain legal opponent analyze <name>` — Gegner-Analyse
- `gbrain legal chance-assess <case-id>` — Chancen-Bewertung
- `gbrain legal entity create` — Profil anlegen
- `gbrain legal entity list` — Profile auflisten
- `gbrain legal strategy <case-id>` — Strategie generieren
- `gbrain legal precedent-search <query>` — Präzedenzfälle suchen

### 4. Admin-UI (admin/src/pages/)
- `LegalDashboard.tsx` — Übersicht aller Fälle
- `LegalCaseDetail.tsx` — Fall-Detailansicht
- `LegalEntityManager.tsx` — Anwalt/Kanzlei-Profile verwalten
- `LegalOpponentAnalyzer.tsx` — Gegner-Analyse-Tool
- `LegalChanceAssessment.tsx` — Chancen/Risiko-Visualisierung

## Privacy & Compliance

- **Anonymisierung:** Alle personenbezogenen Daten werden gehasht. Keine Namen, Adressen oder Mandanten-Daten im Brain.
- **Pseudonymisierung:** Anwälte/Kanzleien können Pseudonyme verwenden.
- **Recht auf Vergessen:** `gbrain legal case delete --hard` löscht unwiderruflich.
- **Export:** `gbrain legal export --format=json` für Datenschutz-Anfragen.
- **Access Control:** Nur der Ersteller hat Zugriff auf eigene Fälle (keine Sharing-Features ohne explizite Freigabe).

## Definition of Done

- [ ] Alle 7 Skills implementiert und in RESOLVER.md registriert
- [ ] CLI-Befehle funktionieren (CRUD + Analyse)
- [ ] Admin-UI zeigt alle Fälle/Profile/Analysen
- [ ] Anonymisierung ist reversible (nur für den Ersteller)
- [ ] Integration mit perplexity-research für aktuelle Rechtsprechung
- [ ] Gegner-Analyse generiert tatsächliche Empfehlungen (nicht Mock)
- [ ] Chancen-Bewertung basiert auf Daten, nicht Halluzinationen
- [ ] Tests für Anonymisierung, Repository, Strategy-Engine
- [ ] Leere-Zustände (keine Fälle) sind nutzbar
- [ ] Error-States sind klar
