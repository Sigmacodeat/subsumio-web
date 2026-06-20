/**
 * GoBD-Verfahrensdokumentations-Generator (GoBD Rz. 151 ff.).
 *
 * Erzeugt aus den Kanzlei-Settings + einer kurzen Prozessbeschreibung eine
 * strukturierte Verfahrensdokumentation als Markdown — die vier von der GoBD
 * erwarteten Teile: Allgemeine Beschreibung, Anwenderdokumentation, technische
 * Systemdokumentation, Betriebsdokumentation, plus Änderungshistorie/IKS.
 *
 * EHRLICHKEITSREGEL: Das ist eine VORLAGE mit den ausgefüllten Stammdaten —
 * kein fertiges, prüfungssicheres Dokument. Sie MUSS anwaltlich/steuerlich
 * geprüft, an den tatsächlichen Ablauf angepasst und vom Berater/Prüfer
 * abgenommen werden. Der Generator behauptet keine GoBD-Konformität.
 */

export interface VerfahrensdokuInput {
  /** Stammdaten (aus den Kanzlei-Settings). */
  kanzleiName: string;
  anwaltName: string;
  ustId: string;
  /** Verantwortliche/r für die Ordnungsmäßigkeit der Ablage. */
  verantwortlich: string;
  /** Eingesetzte DV-Systeme, frei (z. B. "Subsumio, DATEV, beA"). */
  systeme: string;
  /** Wie Belege eingehen (Post, E-Mail, Upload, Scan-Eingang). */
  belegEingang: string;
  /** Wie/wann Belege erfasst und verbucht werden. */
  erfassung: string;
  /** Wo die Belege revisionssicher abgelegt werden. */
  ablageOrt: string;
  /** Sicherungs-/Backup-Konzept. */
  backup: string;
  /** Zugriffsschutz / Berechtigungskonzept. */
  zugriffsschutz: string;
  /** Internes Kontrollsystem (IKS). */
  iks: string;
  /** Stand (ISO-Datum YYYY-MM-DD). */
  stand: string;
}

const PLACEHOLDER = "_[bitte ergänzen / vom Berater prüfen lassen]_";

/** Leeren Eingabewert auf einen sichtbaren Platzhalter abbilden. */
function v(value: string): string {
  const trimmed = (value || "").trim();
  return trimmed.length > 0 ? trimmed : PLACEHOLDER;
}

/**
 * Baut die Verfahrensdokumentation als Markdown. Reine Funktion — testbar und
 * frei von DOM/Brain-Abhängigkeiten.
 */
export function buildVerfahrensdoku(input: VerfahrensdokuInput): string {
  const kanzlei = v(input.kanzleiName);
  return `# Verfahrensdokumentation zur ordnungsmäßigen Beleg- und Buchführung (GoBD)

> **Entwurf — zwingend zu prüfen.** Diese Verfahrensdokumentation wurde aus den
> hinterlegten Kanzlei-Stammdaten und einer Kurzbeschreibung des Ablaufs
> generiert (GoBD Rz. 151 ff.). Sie ist eine **Vorlage**, kein prüfungssicheres
> Dokument: Sie muss an den tatsächlichen Ablauf angepasst, anwaltlich/steuerlich
> geprüft und vom steuerlichen Berater bzw. Betriebsprüfer abgenommen werden.
> Subsumio liefert hierfür technische Bausteine (Aufbewahrungsfrist-Stempel,
> Inhalts-Hash zur Manipulations-Evidenz) — keine Zusage der GoBD-Konformität.

**Stand:** ${v(input.stand)}

## 1. Allgemeine Beschreibung

- **Unternehmen / Kanzlei:** ${kanzlei}
- **Vertretungsberechtigte/r:** ${v(input.anwaltName)}
- **USt-IdNr.:** ${v(input.ustId)}
- **Verantwortlich für die Ordnungsmäßigkeit:** ${v(input.verantwortlich)}

Diese Verfahrensdokumentation beschreibt das in der Kanzlei eingesetzte
DV-gestützte Verfahren zur Erfassung, Verarbeitung, Aufbewahrung und
Auswertbarkeit steuerlich relevanter Belege gemäß den Grundsätzen zur
ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen und
Unterlagen in elektronischer Form (GoBD).

## 2. Anwenderdokumentation (Ablaufbeschreibung)

### 2.1 Belegeingang
${v(input.belegEingang)}

### 2.2 Erfassung und Verbuchung
${v(input.erfassung)}

### 2.3 Ablage und Unveränderbarkeit
${v(input.ablageOrt)}

Steuerlich relevante Belege werden beim Eingang mit einer Aufbewahrungsfrist
(10 Jahre, § 147 Abs. 3 AO) und einem Inhalts-Hash (SHA-256, § 146 Abs. 4 AO)
versehen. Eine spätere Neuberechnung des Hashes über denselben Beleg deckt jede
nachträgliche Änderung auf; die Unveränderbarkeit ist damit nachprüfbar
(GoBD Rz. 107 ff.).

## 3. Technische Systemdokumentation

**Eingesetzte Systeme:** ${v(input.systeme)}

Die technische Systemdokumentation beschreibt die eingesetzte Hard- und
Software, die Datenflüsse zwischen den Systemen sowie die Schnittstellen
(z. B. DATEV-Export zur maschinellen Auswertbarkeit, GoBD Rz. 126 ff.).
${PLACEHOLDER}

## 4. Betriebsdokumentation

### 4.1 Datensicherung
${v(input.backup)}

### 4.2 Zugriffsschutz und Berechtigungskonzept
${v(input.zugriffsschutz)}

### 4.3 Internes Kontrollsystem (IKS)
${v(input.iks)}

Das IKS sichert die Einhaltung der Ordnungsmäßigkeit (GoBD Rz. 100 ff.):
Funktionstrennung, Plausibilitäts- und Vollständigkeitskontrollen, sowie
die Protokollierung von Änderungen.

## 5. Aufbewahrung und Auswertbarkeit

- **Aufbewahrungsfrist:** 10 Jahre (§ 147 Abs. 3 AO), je Beleg im System vermerkt.
- **Maschinelle Auswertbarkeit:** Steuerlich relevante Daten sind exportierbar
  (u. a. DATEV-kompatibler Export), GoBD Rz. 126 ff.
- **Lesbarmachung:** Belege bleiben über die gesamte Aufbewahrungsfrist lesbar
  und maschinell auswertbar reproduzierbar.

## 6. Änderungshistorie

| Datum | Version | Änderung | Verantwortlich |
|---|---|---|---|
| ${v(input.stand)} | 1.0 | Ersterstellung (generierter Entwurf) | ${v(input.verantwortlich)} |

---

*Generiert mit Subsumio. Diese Vorlage ersetzt keine steuerliche oder
rechtliche Beratung. Vor Verwendung durch den steuerlichen Berater prüfen und
an den tatsächlichen Kanzleiablauf anpassen.*
`;
}
