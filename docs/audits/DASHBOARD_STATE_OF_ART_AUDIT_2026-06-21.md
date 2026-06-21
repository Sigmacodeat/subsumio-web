# Subsumio Dashboard State-of-the-Art Audit

Datum: 2026-06-21
Scope: gesamtes `/dashboard`, App-Shell, Header/Footer-Abgrenzung, URL-Strategie, Onboarding, Hilfesystem, Support-Reduktion

## Research Snapshot

- App-Domain-Pattern: Marketing auf Root-Domain, Produkt auf kurzer App-Subdomain ist fuer SaaS Standard. Gute Kandidaten: `app.subsum.io`, `dashboard.subsum.io`, `my.subsum.io`. `app` ist am langlebigsten, `dashboard` ist explizit, `cockpit` ist markanter aber enger.
- Onboarding 2026: die besten SaaS-Produkte fuehren zum ersten echten Erfolg, nicht durch Feature-Erklaerungen. Muster: wenige Segmentierungsfragen, 3-5 outcome-basierte Tasks, kontextuelle Hilfe, kleine Wins, keine langen Tours.
- Legal-Tech: Clio, Smokeball, MyCase und PracticePanther verkaufen nicht "AI-Konsole", sondern Kanzlei-Betrieb: Matters/Akten, Calendar/Fristen, Intake, Documents, Billing, Team/Permissions.
- Support-Entlastung: In-App-Chat/AI-Agent ist sinnvoll, aber nur mit Produktwissen, Datenschutz-Hinweis, Escalation zu Mensch und klarer Trennung von Rechtsberatung.

Quellen:

- https://serverlessfirst.com/how-to-select-a-future-proof-subdomain-structure-for-your-saas-web-app/
- https://ghinda.com/blog/products/2020/domain-structure-for-saas-products.html
- https://www.appcues.com/blog/best-user-onboarding-examples
- https://formbricks.com/blog/user-onboarding-best-practices
- https://help.clio.com/hc/en-us
- https://www.clio.com/manage/

## Audit Ergebnis

### 1. Header/Footer Sichtbarkeit

Status: passt im Grundsatz.

`src/app/layout.tsx` setzt `hasOwnMain = pathname.startsWith("/dashboard") || pathname.startsWith("/portal")`.
Damit wird `MarketingShell` inklusive Marketing-Header, Footer, RefConsentBanner und AnalyticsConsentBanner fuer `/dashboard` ausgeschlossen.

Risiko:

- Diese Logik haengt am `x-pathname` Header aus `src/middleware.ts`. Fuer normale App-Routen ist das okay, aber bei zukuenftigen Host/Subdomain-Rewrites muss sichergestellt werden, dass `x-pathname` weiterhin korrekt gesetzt wird.
- Dashboard-Seiten nutzen teils eigene PageHeader/Breadcrumbs mit Label "Dashboard". Das ist okay, aber fachlich waere "Kanzlei-Cockpit" besser als Breadcrumb-Root.

Empfehlung:

- Keine Marketing-Footer/Header im Dashboard.
- Breadcrumb-Root von "Dashboard" auf "Kanzlei-Cockpit" vereinheitlichen.

### 2. URL-Strategie

Aktuell:

- Produkt liegt unter `/dashboard`.
- Marketing-Links zeigen direkt auf `/dashboard`.
- PWA `start_url` ist `/dashboard`.

Empfehlung:

- Canonical App-URL: `https://app.subsum.io`
- Intern bleibt Next technisch bei `/dashboard`; Vercel/DNS kann `app.subsum.io` auf dieselbe App routen und `/` auf `/dashboard` rewriten.
- `cockpit.subsum.io` nur verwenden, wenn "Cockpit" als starkes Produktversprechen dauerhaft gewollt ist. Fuer B2B-SaaS ist `app.subsum.io` weniger erklaerungsbeduerftig.

Umsetzungsschritte:

1. Vercel Domain `app.subsum.io` hinzufuegen.
2. Middleware Host-Erkennung: wenn Host `app.subsum.io` und Path `/`, intern nach `/dashboard`.
3. Auth-Redirects/Login `next` sauber host-aware halten.
4. Marketing CTAs auf `NEXT_PUBLIC_APP_URL` statt hart `/dashboard`.
5. PWA Manifest fuer App-Host ausliefern oder `start_url` host-neutral lassen.

### 3. Onboarding

Aktuell:

- Wizard vorhanden: Welcome, Branche, Upload, Query, Done.
- Completion wird ueber `/api/onboarding` gespeichert.
- Industry provisioniert Legal-Brain.

Luecken:

- Kanzlei-Grunddaten fehlen: Kanzleiname, Land/Region, Sprache, Rechtsgebiete, Teamrolle, Kalender/Fristen, beA/E-Mail, Rechnungs-/Briefkopfdaten.
- "Andere Branche" ist fuer Subsumio legal-only wahrscheinlich kontraproduktiv.
- Upload/Query als erste Schritte sind gut, aber nicht genug fuer Kanzlei-Betrieb.

Ziel-Onboarding:

1. Rolle: Anwalt, Assistenz, Partner/Management.
2. Kanzlei-Profil: Kanzleiname, Land, Sprache, Rechtsgebiete.
3. Betriebskanäle: beA, E-Mail, Kalender, Dokumentenablage.
4. Abrechnung/Briefkopf: optional, aber mit klarem "spaeter".
5. Erster Erfolg: Akte anlegen oder Dokument hochladen.
6. Checkliste im Cockpit: 3-5 Aktivierungsschritte, jederzeit fortsetzbar.

### 4. Erklaerungen und Hilfe

Aktuell:

- Command Palette hat Doku/Shortcuts/Support.
- Es gibt keine dezente produktweite Hilfe-Schicht im Dashboard.

Empfehlung:

- Keine langen Feature-Tours.
- Kontextuelle "Warum sehe ich das?"-Hilfen pro leerem Bereich.
- Onboarding-Checklist im Cockpit, bis Setup fertig ist.
- Command Palette bleibt Power-Tool.
- Dezenter Help-Agent unten rechts, aber erst nach Onboarding oder als "Hilfe" in der Topbar, nicht als lauter Chat-Bubble.

### 5. Chatbot / Support-Agent

Ja, sinnvoll, aber begrenzt:

- Aufgabe: Produktnavigation, Setup, Datenimport, Rechnungen, Rollen, Fristen-Workflows erklaeren.
- Nicht: Rechtsberatung oder inhaltliche Bewertung ohne Aktenkontext und Freigabe.
- Muss koennen: aktuelle Seite erkennen, passende Docs nennen, Nutzer zur richtigen Route schicken, Ticket/E-Mail an Support eskalieren.
- Datenschutz: keine sensiblen Akteninhalte an Drittanbieter ohne klare Policy.

MVP:

- "Subsumio Guide" als dezenter Drawer.
- Quellen: `src/content/docs.ts`, Dashboard-Navigation, aktuelle Route, FAQ.
- Aktionen: "Oeffne Fristen", "Zeig mir Kanzlei-Einstellungen", "Wie lade ich eine Akte hoch?"
- Escalation: Mailto oder Support-Ticket mit Kontext.

### 6. Dashboard-Code Inventar

Ermittelt:

- 61 Dashboard Pages.
- 61 `loading.tsx`.
- 61 `error.tsx`.
- Viele Seiten haben `PageHeader`, aber Breadcrumb-Labels sind nicht zentralisiert.
- Sidebar/Command Palette haben inzwischen eine gemeinsame Navigationsquelle.

Risiken:

- Zu viele Seiten koennen wie Feature-Sammlung wirken, wenn sie nicht in Workflows zusammengefuehrt werden.
- Einige System-/Brain-/Admin-Routen sind noch sehr sichtbar im Produktmodell.
- Onboarding completion ist binary; es gibt keinen granularen Setup-Fortschritt.
- App-Help ist eher Support-Link als In-App-Assistent.

## Priorisierte Umsetzung

P0:

- App-URL entscheiden: Empfehlung `app.subsum.io`. Code-Redirect fuer App-Host umgesetzt; DNS/Vercel offen.
- Dashboard-Breadcrumb-Root auf "Kanzlei-Cockpit" vereinheitlichen. Umgesetzt in `PageHeader`.
- Onboarding auf Kanzlei-Grunddaten umbauen. Erste Version umgesetzt: Rolle, Kanzleiname, Ansprechpartner, E-Mail, Land, Rechtsgebiete.
- Manifest/Install-App Copy auf Kanzlei-OS trimmen. Umgesetzt.

P1:

- Setup-Checklist im Cockpit. Erste Version im Subsumio Guide umgesetzt.
- Help-Agent MVP mit Produktwissen, route-aware. Dezenter Guide-Drawer umgesetzt; echter AI-Support-Agent bleibt naechster Ausbau.
- `NEXT_PUBLIC_APP_URL` fuer Marketing/Auth CTAs.
- Host-Rewrite fuer `app.subsum.io`.

P2:

- Role-based Cockpit: Anwalt, Assistenz, Management.
- Dashboard-Aggregat-API fuer echte Kanzlei-KPIs.
- Visual QA fuer Desktop/Mobile nach Auth-DB-SSL-Fix.
