/**
 * Verfahrensdokumentations-Generator (Österreich: §§ 131, 132 BAO).
 *
 * Erzeugt aus den Kanzlei-Settings + einer kurzen Prozessbeschreibung eine
 * strukturierte Verfahrensdokumentation als Markdown — mit den üblichen Teilen:
 * Allgemeine Beschreibung, Anwenderdokumentation, technische
 * Systemdokumentation, Betriebsdokumentation, plus Änderungshistorie/IKS.
 *
 * EHRLICHKEITSREGEL: Das ist eine VORLAGE mit den ausgefüllten Stammdaten —
 * kein fertiges, prüfungssicheres Dokument. Sie MUSS anwaltlich/steuerlich
 * geprüft, an den tatsächlichen Ablauf angepasst und vom Berater/Prüfer
 * abgenommen werden. Der Generator behauptet keine Ordnungsmäßigkeit im Sinne
 * der BAO. (Dateiname historisch: "gobd-…" — der erzeugte Text ist österreichisch.)
 */

export interface VerfahrensdokuInput {
  /** Stammdaten (aus den Kanzlei-Settings). */
  kanzleiName: string;
  anwaltName: string;
  ustId: string;
  /** Verantwortliche/r für die Ordnungsmäßigkeit der Ablage. */
  verantwortlich: string;
  /** Eingesetzte DV-Systeme, frei (z. B. "Subsumio, Buchhaltungssoftware"). */
  systeme: string;
  /** Wie Belege eingehen (Post, E-Mail, Upload, Scan-Eingang). */
  belegEingang: string;
  /** Wie/wann Belege erfasst und verbucht werden. */
  erfassung: string;
  /** Wo die Belege unveränderbar abgelegt werden. */
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
  return `# Verfahrensdokumentation zur ordnungsmäßigen Beleg- und Buchführung

> **Entwurf — zwingend zu prüfen.** Diese Verfahrensdokumentation wurde aus den
> hinterlegten Kanzlei-Stammdaten und einer Kurzbeschreibung des Ablaufs
> generiert. Sie ist eine **Vorlage, kein prüfungssicheres Dokument**: Sie muss
> an den tatsächlichen Ablauf angepasst, anwaltlich/steuerlich geprüft und von
> Ihrer Steuerberatung abgenommen werden. Subsumio liefert hierfür technische
> Bausteine (Aufbewahrungsfrist-Vermerk, Prüfsumme des Inhalts zur Erkennung
> nachträglicher Änderungen) — keine Zusage der Ordnungsmäßigkeit nach
> §§ 131, 132 BAO.

**Stand:** ${v(input.stand)}

## 1. Allgemeine Beschreibung

- **Unternehmen / Kanzlei:** ${kanzlei}
- **Vertretungsberechtigte/r:** ${v(input.anwaltName)}
- **UID-Nummer:** ${v(input.ustId)}
- **Verantwortlich für die Ordnungsmäßigkeit:** ${v(input.verantwortlich)}

Diese Verfahrensdokumentation beschreibt das in der Kanzlei eingesetzte
DV-gestützte Verfahren zur Erfassung, Verarbeitung, Aufbewahrung und
Auswertbarkeit steuerlich relevanter Belege. Maßstab sind die Vorschriften der
Bundesabgabenordnung über die Führung von Büchern und Aufzeichnungen (§ 131 BAO)
und über deren Aufbewahrung (§ 132 BAO).

## 2. Anwenderdokumentation (Ablaufbeschreibung)

### 2.1 Belegeingang
${v(input.belegEingang)}

### 2.2 Erfassung und Verbuchung
${v(input.erfassung)}

### 2.3 Ablage und Unveränderbarkeit
${v(input.ablageOrt)}

Steuerlich relevante Belege werden beim Eingang mit einer Aufbewahrungsfrist
(7 Jahre, § 132 BAO) und einer Prüfsumme des Inhalts (SHA-256) versehen. Eine
spätere Neuberechnung der Prüfsumme über denselben Beleg deckt nachträgliche
Änderungen auf; die Unveränderbarkeit der Aufzeichnungen (§ 131 BAO) ist damit
nachprüfbar.

## 3. Technische Systemdokumentation

**Eingesetzte Systeme:** ${v(input.systeme)}

Die technische Systemdokumentation beschreibt die eingesetzte Hard- und
Software, die Datenflüsse zwischen den Systemen sowie die Schnittstellen
(z. B. Export der Buchungsdaten an die Steuerberatung zur maschinellen
Auswertbarkeit).
${PLACEHOLDER}

## 4. Betriebsdokumentation

### 4.1 Datensicherung
${v(input.backup)}

### 4.2 Zugriffsschutz und Berechtigungskonzept
${v(input.zugriffsschutz)}

### 4.3 Internes Kontrollsystem (IKS)
${v(input.iks)}

Das IKS sichert die Einhaltung der Ordnungsmäßigkeit (§ 131 BAO):
Funktionstrennung, Plausibilitäts- und Vollständigkeitskontrollen, sowie
die Protokollierung von Änderungen.

## 5. Aufbewahrung und Auswertbarkeit

- **Aufbewahrungsfrist:** 7 Jahre (§ 132 BAO), je Beleg im System vermerkt.
  Längere Fristen aus anderen Vorschriften oder wegen anhängiger Verfahren
  sind gesondert zu prüfen.
- **Maschinelle Auswertbarkeit:** Steuerlich relevante Daten sind exportierbar
  (Export der Buchungsdaten in einem maschinell auswertbaren Format).
- **Lesbarmachung:** Belege bleiben über die gesamte Aufbewahrungsfrist
  inhaltsgleich, vollständig und geordnet wiedergebbar (§ 132 BAO).

## 6. Änderungshistorie

| Datum | Version | Änderung | Verantwortlich |
|---|---|---|---|
| ${v(input.stand)} | 1.0 | Ersterstellung (generierter Entwurf) | ${v(input.verantwortlich)} |

---

*Generiert mit Subsumio. Diese Vorlage ersetzt keine steuerliche oder
rechtliche Beratung. Vor Verwendung durch Ihre Steuerberatung prüfen lassen und
an den tatsächlichen Kanzleiablauf anpassen.*
`;
}
