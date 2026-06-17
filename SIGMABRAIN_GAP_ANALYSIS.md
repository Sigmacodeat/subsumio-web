# Sigmabrain — Repo-Scan & Gap-Analyse vs. Gesamtmarkt

> **Aktualisiert 13.06.2026:** Code-Verifikations-Pass. Mehrere zuvor als
> „❌ größte Lücke" geführte SaaS-Punkte (Team/Org + Invites, MFA/TOTP,
> Usage-Anzeige) sind im Code geschlossen — siehe §2c und §6. Echte Restlücken:
> SSO/SCIM (WorkOS), SOC 2/ISO 27001, Tenant-Audit-Log-UI, Engine-Vier-Augen-Gate,
> Hosting/Domain/Stripe-Keys-live (owner-seitig). Die neuen Governance-Stärken
> stehen jetzt auch öffentlich auf `/compare` (Governance-/EU-Compliance-Matrix).
>
> **INTERN — nicht in öffentliche Releases aufnehmen.** Ursprünglich: 11. Juni 2026.
> Basis: vollständiger Repo-Scan (inkl. laufender Parallel-Arbeit der KI-Agenten),
> Markt-Research Runden 1–3 (`SIGMABRAIN_STRATEGIE.md` §4–4b, `/compare`-Quellen).
> Ergänzt: `SIGMABRAIN_STATUS.md` (Was ist echt), `SIGMABRAIN_STRATEGIE.md` (Warum).

---

## 1. Repo-Inventar (was wir HABEN, Stand heute)

**Engine (Kern, produktionsreif, tausende Tests):**
- 91 Operationen contract-first (`src/core/operations.ts`), CLI + MCP generiert
- Hybrid-Retrieval: Vector + BM25 + Graph-Traversal + RRF, typed-edge relational
  retrieval (v0.42.34), Query-Cache mit knobs_hash-Isolation, 3 Search-Modes
- Selbstverdrahtender Wissensgraph (typisierte Kanten bei jedem Write, ohne Extra-LLM)
- Dream Cycle (Dedupe, Zitate, Widersprüche, Morning-Brief), Gap-Analyse in Antworten
- Multi-Tenant: Source-Isolation fuzz-getestet, scoped access, Trust-Boundary remote/local
- Engines: PGLite (zero-config) + Postgres/Supabase, Parität CI-gepinnt
- Resumable Sync, Jobs/Minions, Eval-Suite (BrainBench, longmemeval, Metric-Glossary)

**Ingestion (diese Woche massiv ausgebaut):**
- Dokument-Pipeline NEU: PDF (+ Scanned-OCR-Fallback), DOCX, EML, CSV/TSV, XLSX,
  Audio-Transkription (`src/core/extract-document.ts`, 15 Tests, compile-verifiziert)
- 9 Konnektoren NEU (Parallel-Arbeit): Gmail, Google Drive, Calendar, Notion, Slack,
  Jira, Asana, Dropbox, GitHub (`src/core/ingestion/connectors/` + OAuth + Daemon)
- Bilder mit OCR + EXIF, Code-Repos (tree-sitter), Web-Content, Meeting-Transkripte

**Skills & Vertikalisierung:**
- 58 Skill-Verzeichnisse, Resolver-Routing, Conformance-Tests
- Schema-Packs NEU: `gbrain-legal.yaml`, `gbrain-tax.yaml`, `gbrain-medical.yaml`
  (+ investor, engineer, creator, base)
- NEU: deadline-extract, document-ingest, connector-ingest, legal-brain (Dispatcher)

**Legal-Brain-Subsystem (Parallel-Arbeit, in Entwicklung):**
- `src/core/legal/` (anonymizer HMAC, repository, types), `src/commands/legal.ts`,
  `LEGAL_BRAIN_BLUEPRINT.md` (Profile, Fälle, Gegner-Analyse, Rechtsfrage-Flow),
  Admin-Seite `Legal.tsx` — ⚠️ Risiko-Flags in §4

**Produkt-Oberflächen:**
- Web-App: Marketing (24 Routen EN+DE, 5 Vertikale, /compare), Dashboard (7 Seiten),
  Auth (HMAC-Sessions, scrypt), Billing-Skeleton (Stripe-ready), Referral, PWA
- Admin-Panel (`admin/`): Dashboard, Agents, Jobs, RequestLog, Calibration, Legal NEU
- NEU: `web-api.ts` (HTTP-API für Frontends), `nl-console.ts` (NL-Admin-Queries)
- Mobile: Capacitor-Scaffold + Store-Guide

---

## 2. Gap-Matrix vs. Gesamtmarkt

Legende: ✅ haben · 🟡 teilweise · ❌ fehlt · Priorität P0 (launch-blockierend) → P3 (nach Traktion)

### 2a. vs. Enterprise Legal AI (Harvey, Legora, CoCounsel, Noxtua, Luminance)

| Capability | Status | Prio | Kommentar |
|---|---|---|---|
| Q&A über eigene Akten, zitiert | ✅ | — | Unsere Kernstärke; seitengenau |
| Widerspruchs-Erkennung, Gap-Analyse, Graph | ✅ | — | Kein Wettbewerber zeigt das öffentlich |
| Rechtsrecherche (Rechtsdatenbank) | ❌ | P2 | Bewusst nicht unsere Kategorie. ABER: Anbindung ÖFFENTLICHER Quellen (rechtsprechung-im-internet.de, openlegaldata.io, EUR-Lex API) als „Public-Law-Konnektor" ist machbar und würde Flow 3 des Legal Brain legal füttern |
| Drafting / Redlining | ❌ | P3 | Bewusst nicht (siehe /compare). Nicht bauen |
| Legal-Benchmark-Teilnahme (Vals VLAIR) | ❌ | P2 | Eigene VLAIR-artige Eval auf Dokument-Q&A/Chronologie fahren — die Disziplinen, die wir können. Glaubwürdigkeits-Hebel |
| Matter-/Fall-Management | 🟡 | P1 | legal-brain-Subsystem entsteht parallel; braucht Tests + Berufsrechts-Review (§4) |
| Zitat-Sprung-UI (Antwort → Fundstelle, 1 Klick) | 🟡 | P1 | Engine liefert Zitate; Dashboard-UI fehlt. Vertrauens-Feature Nr. 1 für Anwälte |
| **DMS-Integration (iManage, NetDocuments)** | ❌ | P2 | DER Enterprise-Legal-Einkaufsfilter. Ohne: kein BigLaw — aber Mid-Market (unser Wedge) nutzt Datev/Dropbox/Drive → 🟡 via neue Konnektoren |
| **beA / e-Akte (DE)** | ❌ | P2 | DACH-Kanzlei-Differenzierer, kein US-Anbieter hat es. EML-Ingest ist die Vorstufe |
| **DATEV-Schnittstelle (Steuer-Vertikale)** | ❌ | P1–P2 | „Neben DATEV" verkauft sich nur mit Daten-Brücke (DATEV-Export-Import reicht für V1: CSV/XML kommt durch unsere neue Pipeline) |
| Audit-Trail (Hash-Kette, Compliance) | ❌ | P2 | Enterprise-Tier-Argument; Subsumio-Konzept notiert |
| SSO / SAML / SCIM | ❌ | P1 | Enterprise-Gate; jeder Wettbewerber hat es |
| SOC 2 / ISO 27001 | ❌ | P2 | Luminance/Glean haben es. Self-Host kompensiert im Mid-Market, Enterprise fragt trotzdem |

### 2b. vs. Knowledge Layer (Glean, Notion AI)

| Capability | Status | Prio | Kommentar |
|---|---|---|---|
| Konnektoren | 🟡 | P1 | 9 NEU vs. Gleans 100+. Die 9 decken ~80 % des Mid-Market-Bedarfs. Fehlt im Kern-Set: Outlook/M365 + Teams (DACH-Kanzleien sind Microsoft-Land!), SharePoint |
| **ACL-Vererbung aus Quellen** | ❌ | P1 | Glean übernimmt Berechtigungen der Quellsysteme. Unsere Konnektoren ingestieren in den eigenen Scope — sobald ein geteiltes Brain Drive/Slack synct, wird das zur Leak-Falle. Vor Team-Launch lösen oder Konnektoren auf Single-User-Brains beschränken |
| Browser-Extension / Slack-Bot-Surface | ❌ | P3 | Convenience, nach Traktion |
| Eigene Daten + Graph + Gap-Analyse | ✅ | — | Glean hat Graph, aber keine Gap-Analyse; Notion keins von beidem |
| Self-Host + Open Source | ✅ | — | Unser Strukturvorteil, SaaS-only-Konkurrenz kann nicht folgen |

### 2c. vs. SaaS-Grundanforderungen (alle Anbieter)

| Capability | Status | Prio | Kommentar |
|---|---|---|---|
| **Hosted Multi-Tenant-Provisioning** | ❌ | **P0** | Pre-Mortem K1, unverändert der Killer: Signup → Brain läuft. Scoping-Technik existiert; Provisioning-Pfad fehlt |
| Billing live (Stripe-Keys, Coupons) | 🟡 | P0 | Code fertig, Konto/Keys fehlen (nur Owner kann) |
| Domain, E-Mail, Hosting | ❌ | P0 | Nur Owner kann |
| Mobile Apps im Store | 🟡 | P3 | Scaffold da; erst nach SaaS-Launch (Apple 4.2) |
| Usage-Metering im Dashboard | ✅ | — | In `/dashboard/billing` sichtbar (`src/lib/usage.ts`); Übersichts-Karte wäre nice-to-have |

---

## 3. USP-Bewertung: das „Subgehirn über alle Kanzleien"

**Frage:** Ein Gehirn, das aus allem lernt, was in unsere Software reinkommt, sich
„über alle Kanzleien und wichtige Entscheidungen auskennt" — ist das ein USP?

**Ehrliche Antwort: In dieser Formulierung NEIN — es ist das Gegenteil, ein
Deal-Killer.** Drei Gründe:

1. **Es widerspricht wörtlich unserem eigenen Verkaufsargument.** Auf jeder
   Vertikal-Seite steht: „Dein Dealflow/Netzwerk trainiert niemals fremde Modelle"
   und „Mandantendaten verlassen nie eure Kontrolle". Ein Cross-Kanzlei-Lernen aus
   Kundendaten macht jede dieser Seiten zur Falschaussage — und unser /compare-
   Vertrauensversprechen kollabiert.
2. **Berufsrecht macht es unverkäuflich.** § 203 StGB + anwaltliche Verschwiegenheit:
   Eine Kanzlei darf Mandatsinhalte nicht in einen Pool geben, aus dem andere
   Kanzleien (potenziell die GEGENSEITE) Nutzen ziehen. Auch „anonymisiert" rettet
   das nicht: HMAC-Pseudonymisierung (so implementiert in
   `src/core/legal/anonymizer.ts`) ist DSGVO-rechtlich KEINE Anonymisierung —
   mit Owner-Key reversibel = pseudonym = bleibt personenbezogen. Und Fallkonstellationen
   sind re-identifizierbar (kleiner Gerichtsbezirk + Rechtsgebiet + Datum reicht).
3. **Gegner-Profiling benannter Anwälte/Kanzleien** („Schwächen", Erfolgsquoten) aus
   Pool-Daten ist DSGVO-Profiling natürlicher Personen + UWG-Risiko. Aus ÖFFENTLICHEN
   Quellen (Urteilsdatenbanken) ist es vertretbarer — aus Kundendaten nicht.

**ABER: Drei legale Varianten desselben Instinkts sind echte USPs:**

| Variante | Was es ist | USP-Wert |
|---|---|---|
| **A. Compounding-Brain pro Kanzlei** | Jedes Kunden-Brain wird mit JEDEM eigenen Fall besser (eigene Präzedenzfälle, eigene Gegner-Historie, eigene Gerichts-Erfahrung). Harvey/Noxtua sind pro Anfrage stateless — wir verzinsen. | **Hoch — das ist unser Kern-USP und heute schon wahr.** „Das Brain eurer Kanzlei kennt nach 2 Jahren jeden Fall, den ihr je geführt habt" schlägt jedes Pool-Versprechen, weil es verkaufbar UND legal ist |
| **B. Zentrales Public-Law-Brain** | EIN von uns gepflegtes Subgehirn aus ausschließlich ÖFFENTLICHEN Quellen (Urteile, Gesetze, Gerichtsstatistiken), als mountbares Brain an alle Kunden ausgeliefert (`gbrain mounts add` existiert!). Gegner-Analyse speist sich HIERAUS. | Mittel-hoch — legal sauber, technisch sofort machbar (mounts + Konnektoren), differenziert gegen US-Anbieter im DACH-Recht. Aber: Content-Moat von beck-online/Westlaw bleibt unerreichbar; wir kuratieren offene Quellen statt sie zu ersetzen |
| **C. Opt-in-Struktur-Lernen** | Aggregiertes Lernen über NUTZUNG, nie Inhalte: welche Schema-Felder, Query-Muster, Extraktions-Prompts funktionieren. Fließt als Produkt-Updates (Schema-Packs, Tuning) an alle. | Mittel — Standard-SaaS-Praxis, sauber per AVV deklarierbar, macht das Produkt schneller besser, ist aber kein Marketing-Claim für „kennt alle Kanzleien" |

**Empfohlene Sprachregelung nach außen:** „Jede Kanzlei bekommt ihr eigenes Gehirn,
das mit jedem Fall klüger wird — plus ein zentrales Rechtswissen-Brain aus
öffentlichen Quellen, das wir für alle pflegen. Eure Mandate bleiben eure."
Das Wort „Subgehirn über alle Kanzleien" intern streichen; es beschreibt Variante
A+B zusammen, klingt aber nach dem illegalen Pool.

---

## 4. Risiko-Flags aus der Parallel-Arbeit (an die Agenten zurückspielen)

1. **`legal-brain` Flow 2–4 (Gegner-Analyse):** Datenquelle MUSS auf öffentliche
   Quellen + eigene Fälle der JEWEILIGEN Kanzlei beschränkt werden (Variante A+B).
   Kein Cross-Tenant-Read, auch nicht „anonymisiert". Source-Isolation-Invariante
   gilt auch hier (`sourceScopeOpts`).
2. **Anonymizer-Begriff:** HMAC = Pseudonymisierung, nicht Anonymisierung. Doku +
   Blueprint-Sprache korrigieren, sonst ist die DSGVO-Selbstbeschreibung angreifbar.
3. **„Chancen-Bewertung / Strategieempfehlung":** Als Werkzeug FÜR Anwälte ok
   (kein RDG-Verstoß), aber Output braucht den Disclaimer-Standard aus
   deadline-extract: nie autoritativ, immer „professionell verifizieren".
4. **Konnektoren + geteilte Brains:** ACL-Vererbung ungelöst (§2b). Bis dahin:
   Konnektoren nur in Single-User-Brains dokumentieren/erzwingen.
5. **Neue Module ohne Tests:** `src/core/legal/`, 9 Konnektoren (nur nl-console hat
   Tests). Vor Ship: Test-Pflicht gemäß Repo-Konvention.
6. **Medical-Pack (`gbrain-medical.yaml`):** Öffnet Gesundheitsdaten-Vertikale =
   DSGVO Art. 9. Nicht bewerben, bevor AVV/TOMs dafür stehen (K8: Fokus halten!).

---

## 5. Bau-Reihenfolge (kondensiert)

1. **P0 — SaaS-Launchpfad** (unverändert K1): Provisioning, Billing-Keys, Domain.
   Ohne das ist jede weitere Feature-Arbeit Fassade.
2. **P1 — Vertrauen + Stickiness im Wedge:** Zitat-Sprung-UI, Usage-Meter,
   SSO-Minimum (Google/Microsoft OAuth fürs Team-Tier), Outlook/M365-Konnektor,
   ACL-Entscheidung, legal-brain auf Variante-A/B-Leitplanken + Tests.
3. **P2 — Enterprise-Tür + DACH-Differenzierung:** DATEV-Brücke (V1 = Export-Dateien
   durch bestehende Pipeline), Public-Law-Brain (Variante B), Audit-Hash-Kette,
   eigene VLAIR-artige Eval, beA/e-Akte-Konzept, SOC2-Roadmap.
4. **P3 — nach Traktion:** Konnektoren-Katalog-Ausbau, Browser/Slack-Surfaces,
   Store-Apps, weitere Vertikale (Versicherung, Family Office).

---

## 6. Enterprise-Readiness-Vergleich (Juni 2026, Runde 4) — Verwaltungsschicht vs. die Besten

**Die Messlatte (Glean-Admin-Console + 2026er „Table Stakes"-Konsens):** SSO (SAML/OIDC),
SCIM-Provisioning, MFA, org-gescopte RBAC (Gruppen als Principals, 4 Rollen-Stufen),
manipulationssichere + exportierbare Audit-Logs, Team-Invites + Seat-Verwaltung,
Billing auf Org-Ebene, Usage-Metering.

**Ehrliches Urteil in zwei Hälften:**

- **Engine/Code-Tiefe: Marktspitze, ja.** Tausende Tests, CI-Guards, Engine-Parität,
  fuzz-getestete Source-Isolation, Open Source — diese Engineering-Disziplin hat in
  der Kategorie niemand öffentlich nachweisbar. Retrieval+Graph+Gap-Analyse: führend.
- **SaaS-Verwaltungsschicht: solide V1, NICHT Glean-Niveau — und das ist ok.**
  Erste-10-Kunden-ready: ja. Enterprise-Procurement-ready: nein. Der Abstand ist
  benannt, nicht schöngeredet.

  **Update 13.06.2026:** Die drei in der ursprünglichen Tabelle als „❌ größte
  Lücke" geführten Punkte sind inzwischen im Code geschlossen — **Team/Org +
  Invites**, **MFA/TOTP** und **Usage-Anzeige** (Billing). Verifiziert gegen
  `src/app/dashboard/team/page.tsx`, `src/lib/totp.ts` +
  `settings/security/page.tsx`, `src/lib/usage.ts`. Es bleiben als **echte
  Restlücken nur noch:** SSO/SCIM (WorkOS-Weg, ab erstem Enterprise-Lead),
  SOC 2 / ISO 27001 (Zertifizierungs-Prozess, kein Code), Tenant-Audit-Log-UI
  + Export, und das Engine-seitige Vier-Augen-Gate für autonome Minion-Writes
  (§7e). Aktualisierte Tabelle:

| Enterprise-Feature | Wir | Lösungsweg + Aufwand |
|---|---|---|
| **Team/Org-Modell + Invites** | ✅ **GESCHLOSSEN (Stand 13.06.2026):** Org-Entity (`Org`/`OrgStore` in `src/lib/auth/store.ts`, `orgId` am User), member/admin/owner-Rollen, Invite-Flow in `src/app/dashboard/team/page.tsx` (280 Z.) via Action-Token (`tokens.ts` + `mail.ts`). Team-Brain = Org-brainId | — erledigt. Offen nur noch: Glean-Granularität (feinere RBAC) erst bei Enterprise |
| SSO (SAML/OIDC) + SCIM | ❌ ECHTE RESTLÜCKE | NICHT selbst bauen: WorkOS/AuthKit (Industrie-Standardweg, Tage statt Wochen). Ab erstem Enterprise-Lead |
| MFA/2FA | ✅ **GESCHLOSSEN (Stand 13.06.2026):** Eigenbau-TOTP (`src/lib/totp.ts`, 97 Z.) + Authenticator-QR + 2FA-UI in `src/app/dashboard/settings/security/page.tsx`. WorkOS-Weg später optional, nicht mehr blockierend | — erledigt |
| Kunden-Audit-Log (export.) | 🟡 Engine loggt (mcp_request_log); `src/components/admin/audit-trail.tsx` + `src/lib/audit.ts` existieren | Source-Spalte ins Log + Tenant-Dashboard-Seite + CSV-Export. Hash-Kette (Subsumio-Idee) fürs Enterprise-Tier obendrauf |
| Org-gescopte RBAC | ✅ member/admin/owner pro Org (Team-Tier) | Glean-Granularität erst bei Enterprise |
| Usage-Metering im Dashboard | 🟡 in `/dashboard/billing` sichtbar (Verbrauch je Brain via `src/lib/usage.ts`) | Zusätzlich prominente Karte in der Dashboard-Übersicht wäre nice-to-have; Pricing-Versprechen „Live-Verbrauch" ist erfüllt |
| Onboarding/Demo-Brain | ❌ (Pre-Mortem K7) | Seed-Source `demo` read-only je Neukunde mounten, ~1 Session |
| A11y-CI (axe-core) | ❌ (manuell auditiert) | GitHub-Action + axe auf Build, ~Stunden |

**Bau-Reihenfolge der Lösungswege (Rest, Stand 13.06.2026):** ~~(1) Usage-Meter~~ ✅,
~~(2) Org/Team + Invites~~ ✅, (3) Demo-Brain [K7], (4) Tenant-Audit-Log-UI + Export,
(5) WorkOS-Integration ab erstem Enterprise-Lead, (6) axe-CI jederzeit nebenbei,
(7) Engine-seitiges Vier-Augen-Gate (§7e).

Quellen Runde 4: Glean-Admin-Doku (docs.glean.com/administration), WorkOS
Enterprise-Readiness-Checklist 2026 (workos.com/blog/enterprise-readiness-checklist-2026).

## 7. Vergessene Lücken (Runde 5, 13. Juni 2026) — Blind Spots, die in §1–6 fehlten

Repo-weiter Gegen-Scan: für die folgenden fünf Themen gibt es im **gesamten Code +
allen Docs + `/compare` + `/security`** keine bzw. nur inzidentelle Treffer. Sie
fehlten in der bisherigen Gap-Matrix komplett. Reihenfolge = Dringlichkeit.

### 7a. EU AI Act / KI-VO — die größte vergessene Lücke (P0–P1)

**Befund:** `grep` über das ganze Repo nach „AI Act / KI-VO / KI-Verordnung /
Hochrisiko / Art. 50" = **0 Treffer.** Für ein Legal/Tax-AI-OS in der EU ist das
Mitte 2026 der gravierendste Blind Spot.

**Warum jetzt kritisch (Timeline):** AI Act in Kraft seit 01.08.2024; GPAI-Pflichten
seit 02.08.2025; **Art.-50-Transparenzpflichten + die meisten Hochrisiko-Pflichten
(Annex III) greifen ab 02.08.2026** — also in Wochen, nicht „irgendwann".

| Teilpflicht | Trifft uns | Lösungsweg + Aufwand |
|---|---|---|
| **Art. 50 Transparenz** — KI-generierte Inhalte (Schriftsatz-Entwürfe, KI-Antworten) müssen maschinenlesbar + für Nutzer erkennbar als KI-Output gekennzeichnet sein | **Sicher ja** | ✅ **Umgesetzt (13.06.2026):** zentrale Konstanten in `src/lib/ai-act.ts` (`AI_NOTICE`, `AI_BADGE_LABEL`, `AI_FRONTMATTER`). Sichtbarer „KI-generiert · zu prüfen"-Badge + Fußnote auf `/dashboard/drafting`, `AI_NOTICE` im Word-Export, `ai_generated:true`/`ai_notice` im gespeicherten Frontmatter, `X-AI-Generated`-Header auf `/api/think`. beA-Entwürfe: „Inhalt KI-generiert"-Checkbox schreibt `AI_FRONTMATTER` + zeigt Badge in der Entwurfsliste. Query-Seite: KI-Antworten tragen den Badge an der Antwort. |
| **Hochrisiko-Einstufung (Annex III 8a)** — primär für *Justizbehörden*; Anwalts-Werkzeuge i.d.R. NICHT automatisch hochrisiko, aber einzelfallabhängig (Fristberechnung, Rechtsfolgen-Vorschlag) | **Bewertung nötig** | Dokumentierte Einstufungs-Analyse je Feature; wo hochrisiko: Risk-Management-Doku, Logging, menschliche Aufsicht (→ 7e). Doku-Arbeit, kein Engine-Rebuild |
| **Nachvollziehbarkeit/Logging** der KI-Entscheidungen | teils (mcp_request_log) | An die Audit-Log-Arbeit aus §6 koppeln |
| **`/security`-Sichtbarkeit** | ❌ fehlt | ✅ **umgesetzt (13.06.2026):** „EU AI Act — wo wir stehen"-Box (EN+DE) mit Stichtag 02.08.2026, 3 Punkten (Art. 50-Kennzeichnung, menschliche Aufsicht, Annex-III-Einstufung) in `content/security.ts` + `security-page.tsx` |

**Einordnung:** Das ist überwiegend Doku + ein Output-Label, kein Engine-Umbau —
aber komplett ungemacht, und es ist die *erste* Frage jeder EU-Kanzlei-IT / jedes
Datenschutzbeauftragten. Harvey/Legora/Noxtua adressieren es im Enterprise-Sales.

### 7b. GoBD / revisionssichere Archivierung — Steuer-Vertikale (P1)

**Befund:** „GoBD/revisionssicher" erscheint nur **im Gesetzestext** des Law-Corpus,
nie als Produktzusage. Für StB/WP ist GoBD-konforme, **revisionssichere** Beleg-
archivierung (Unveränderbarkeit, 10-Jahre-Aufbewahrung, Verfahrensdokumentation)
harte Einkaufsanforderung — DATEV erfüllt sie. Unsere Audit-Hash-Kette (§2a, P2)
ist verwandt, aber GoBD ist spezifischer. **Lösungsweg:** WORM-Verhalten +
Hash-Kette + generierte Verfahrensdoku für die Tenant-Source; ~1–2 Sessions.
Ohne das ist die `/taxumio`-Positionierung „neben DATEV" angreifbar.

✅ **V1 umgesetzt (13.06.2026):** `src/lib/gobd.ts` (Single-Source, analog
`ai-act.ts`) — Aufbewahrungsfrist-Stempel (`retention_until` = +10 J, § 147 AO)
+ SHA-256-Manipulations-Evidenz (`content_hash` über belegrelevante Felder,
§ 146 Abs. 4 AO). Rechnungen (`/dashboard/invoicing`) werden beim Anlegen
gestempelt (`gobdFrontmatter`). GoBD-Reiter (7 Punkte: Unveränderbarkeit,
10-J-Aufbewahrung, Belegfunktion, Verfahrensdoku, maschinelle Auswertbarkeit,
IKS, Datensicherheit) als Selbsteinschätzung in `/dashboard/compliance` neben
DSGVO/GwG. **Ehrlich gehalten:** technische Bausteine, KEIN „revisionssicher"-
Claim — volle Konformität braucht Verfahrensdoku + Prüfer-Abnahme.
✅ **V2 umgesetzt (13.06.2026):** Die drei offenen Bausteine ergänzt.
(1) **Hash-Stempel auf hochgeladene Belege** — `src/app/dashboard/upload/page.tsx`
hat einen opt-in-Schalter „steuerlich relevanter Beleg"; ist er gesetzt, wird die
hochgeladene Datei nach dem Upload über `sha256HexBytes` (neu in `gobd.ts`)
gehasht und per `updatePage` mit `gobdFrontmatter` + `belegart: steuerbeleg`
gestempelt. (2) **Verfahrensdoku-Generator** — `src/app/dashboard/verfahrensdoku/`
erzeugt aus Kanzlei-Settings + Ablaufbeschreibung eine GoBD-Verfahrensdokumentation
(GoBD Rz. 151 ff.) als Brain-Page (`type document`, Slug
`legal/gobd/verfahrensdokumentation`) mit PDF-Druck + Word(.doc)-Export; Template
in `src/lib/gobd-verfahrensdoku.ts`, klar als zu prüfender Entwurf markiert.
(3) **Verifikations-Button** — `src/components/gobd-integrity-panel.tsx` in der
Brain-Detailansicht: Rechnungen werden über `invoiceContentString` (geteilte
Single-Source mit der Ausstellung) neu gehasht, hochgeladene Belege über die im
Browser gewählte Originaldatei → grün „unverändert" / rot „verändert seit
Ausstellung". **Hinweis DATEV:** `/dashboard/datev-export` exportiert nur
(CSV-Generierung), es gibt keinen Import-Pfad — daher dort kein Stempel nötig.
**Weiterhin ehrlich gehalten:** technische Bausteine, kein „revisionssicher"-Claim.

### 7c. DACH-Anwaltssoftware-Brücke (RA-MICRO / Advoware) (P1–P2)

**Befund:** §2a nennt nur US-DMS (iManage/NetDocuments). Der echte DACH-Switching-
Cost liegt bei **RA-MICRO** (Marktführer) und **Advoware** — dort liegen die Akten.
beA + DATEV-Export haben wir, aber eine **RA-MICRO/Advoware-Import-Brücke** ist die
eigentliche Mid-Market-Eintrittskarte und fehlt (nur in Blueprint-Docs erwähnt, kein
Konnektor). **Lösungsweg:** Export-Import (RA-MICRO-Schnittstellen/Advoware-Export)
durch die bestehende Dokument-Pipeline, analog DATEV-V1. Aufwand hoch (Formate).

✅ **V1 umgesetzt (13.06.2026):** `/dashboard/import-kanzlei` (Sidebar
„Kanzlei-Import" unter Daten & Integration). RA-MICRO, Advoware UND DATEV Anwalt
exportieren ihre Aktenliste als CSV — die Seite ist ein generischer,
delimiter-robuster CSV-Import (`;`/`,`, Quotes/BOM) mit **Auto-Spalten-Mapping**
per Header-Heuristik (Aktenzeichen, Mandant, Gegner, Rechtsgebiet, Gericht,
Sachbearbeiter, Status), Vorschau und Import als `legal_case`-Seiten
(`source: kanzlei-import`). **Ehrlich gehalten:** kein proprietärer Parser/Live-
Connector, sondern Export→Import von Stammdaten (keine Dokumente); Mapping ist
nutzergeprüft. **Offen:** Dokument-/Dateianhang-Übernahme, echte API-Anbindung
(RA-MICRO Schnittstelle), Zeit-/Fristen-Spalten, Dedupe gegen bestehende Akten.

### 7d. Confidence- / Halluzinations-Transparenz (P2)

**Befund:** Keine nutzergerichtete Confidence/Groundedness-Anzeige. Nach der Stanford-
RegLab-Studie (Harvey/Lexis/Westlaw halluzinieren) ist „verifizierbare Quellenbindung
mit Confidence" ein Vertrauens-Verkaufsargument. Wir liefern Zitate, aber kein „diese
Antwort ist zu X% durch eigene Akten gedeckt / hier ist die Lücke". Nah an der
vorhandenen Gap-Analyse-Funktion der Engine, als Trust-UI nicht ausgespielt. ~1 Session.

✅ **V1 umgesetzt (13.06.2026):** `src/lib/groundedness.ts` (pure `assessGroundedness(citations, gaps)`)
+ Quellendeckungs-Badge an jeder Antwort in `/dashboard/query` (Gut gestützt /
Teilweise gestützt / Ungestützt, mit Quellenzahl + Tooltip). **Ehrlich gehalten:**
misst Quellen-Belegung als Halluzinations-Vorsicht-Signal, ausdrücklich KEINE
Korrektheits-Garantie. **Offen:** gleiches Signal auf `/dashboard/drafting` +
`/dashboard/rechtsprechung`; optional ein echter Engine-seitiger
Groundedness-Score (Anteil belegter Aussagen) statt der Zitat/Lücken-Heuristik.

### 7e. Vier-Augen- / Human-in-the-Loop-Freigabe für Agenten (P2)

**Befund:** Wir verkaufen „Agenten, die Mitarbeiter ersetzen", haben aber kein
Freigabe-Gate, bevor eine Agenten-Aktion (Fristnotierung, Schriftsatz-Versand-Vorbereitung,
Buchung) wirksam wird. Berufsrechtliche Letztverantwortung (Anwalt/StB) macht die
*fehlende* menschliche Freigabe zum Haftungsrisiko — und es ist zugleich eine Annex-III-
Anforderung (menschliche Aufsicht, → 7a). **Lösungsweg:** Approval-Status an
Minion-Jobs (pending_approval → approved → executed), Dashboard-Freigabe-Queue. ~1–2 Sessions.

✅ **V1 umgesetzt (13.06.2026):** Vier-Augen-Workflow im Web-Layer (ohne
Engine-Umbau): `src/lib/approval.ts` (Policy: `REQUIRES_APPROVAL`-Set,
`ActionType`, `agentActionFrontmatter`). Producer: Schriftsatz-Generator hat
„Zur Freigabe" → legt `agent_action`-Page (status=pending) an, die den Entwurf
referenziert. Consumer: neue Seite `/dashboard/approvals` (Sidebar „Freigaben")
— eine zweite Person gibt frei (→ Entwurf-Status `approved`) oder lehnt ab (mit
dokumentiertem Grund); entschiedene Aktionen bleiben als Audit-Spur. **Offen:**
Engine-seitiges Gate für autonome Minion-Writes (pending_approval an Minion-Jobs),
weitere Producer (Fristnotierung, beA-Versand, DATEV-Buchung) auf den Gate-Pfad
heben.

### 7f. Kondensierte Prioritäts-Sicht

| Lücke | Prio | Status | Warum vergessen kritisch |
|---|---|---|---|
| **EU AI Act / Art. 50** | **P0–P1** | ✅ V1 (Rest: beA-Entwürfe) | Erste Frage jeder EU-Kanzlei; Pflicht ab 02.08.2026; 0 Erwähnung |
| GoBD / revisionssicher | P1 (Tax) | ✅ V1 (Stempel+Verfahrensdoku+Verify) | DATEV-Parität bei StB-Vertikale |
| RA-MICRO/Advoware-Brücke | P1–P2 | ✅ V1 (CSV-Import) | echter DACH-Switching-Cost |
| Confidence/Halluzinations-UI | P2 | ✅ V1 (Query) | Trust-Hebel, Engine kann es fast |
| Vier-Augen-Freigabe (Agenten) | P2 | ✅ V1 Web (Rest: Engine-Gate) | Haftung + Annex-III-Aufsicht |

**Alle fünf vergessenen Lücken haben am 13.06.2026 einen ehrlichen V1.** Die
verbleibenden „Offen"-Punkte je Lücke (oben je Abschnitt benannt) sind Ausbau,
nicht Blocker — der größte ist das Engine-seitige Vier-Augen-Gate für autonome
Minion-Writes (7e), gefolgt von der echten RA-MICRO-API-Anbindung (7c).

**Quellen Runde 5:** EU AI Act VO (EU) 2024/1689, Art. 50 (Transparenz) + Annex III Nr. 8
(Justiz), Anwendungs-Timeline Art. 113; GoBD (BMF-Schreiben, Aufbewahrung § 147 AO);
Stanford RegLab „Hallucination-Free?"-Studie zu Legal-AI-Tools.

## Quellen

Markt-Daten: siehe `SIGMABRAIN_STRATEGIE.md` §4–4b und `web/src/content/compare.ts`
(sources[]). Rechtliche Einordnung §203/Pseudonymisierung: BStBK-FAQ KI (Jan. 2026),
DSGVO Art. 4 Nr. 5 (Pseudonymisierung), Erwägungsgrund 26 (Anonymisierung).
