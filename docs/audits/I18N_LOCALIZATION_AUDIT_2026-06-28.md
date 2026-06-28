# Subsumio i18n & Localization Audit — 2026-06-28

## Executive Summary

**Score: 55/100 — Teilweise lokalisiert, aber nicht AT-optimal**

Die i18n-Architektur ist solide aufgebaut (4 Locales, hreflang, deepMerge-Pattern), aber AT ist im Wesentlichen ein DE-Klon mit ein paar String-Replacements. Für echte 100% Österreich-Lokalisierung mit SEO-Optimierung fehlen substantielle Inhalte und sprachliche Anpassungen.

---

## 1. Architektur & Technische i18n-Struktur

### 1.1 Was funktioniert ✅

- **4 Locales**: `de`, `at`, `ch`, `en` mit korrekten Routen (`/`, `/at/`, `/ch/`, `/en/`)
- **hreflang-Tags**: Korrekt in Metadata (`de-DE`, `de-AT`, `de-CH`, `en`) — siehe `@/src/app/at/layout.tsx:12`
- **`<html lang>`-Attribut**: Server-seitig gesetzt via `@/src/app/layout.tsx:177` (`lang={lang}` basierend auf Pathname), client-seitig via `LangSetter` (`@/src/components/brand/lang-setter.tsx:6-17`)
- **`<div lang="de-AT">`**: AT-Layout wraps children mit korrektem BCP 47 Tag (`@/src/app/at/layout.tsx:21`)
- **Language Switcher**: Desktop-Dropdown und Mobile-Menu zeigen alle 4 Sprachen mit `HREFLANG` + `JURISDICTION_LABEL` (`@/src/components/marketing/chrome.tsx:534-557`)
- **Cookie-Persistenz**: `sb_lang` Cookie (365 Tage) verhindert Browser-Redirect-Override (`@/src/components/marketing/chrome.tsx:64-66`)
- **deepMerge-Pattern**: AT/CH überschreiben nur Delta-Felder vom DE-Base — saubere DRY-Architektur (`@/src/content/site.ts:42-66`)
- **applyReplacements**: LANDING.at wird via String-Replacement aus DE generiert (`@/src/content/site.ts:1584`)
- **Browser-Spracherkennung**: Middleware leitet Nicht-Deutsch-Sprecher nach `/en` weiter (`@/src/middleware.ts:207-227`)

### 1.2 Kritische technische Lücken ❌

#### Lücke 1: Kein `x-default` hreflang-Tag

**Status**: Fehlt komplett  
**Fund**: `grep -r "x-default" src/` → 0 Ergebnisse  
**Impact**: Google hat keinen Fallback für User, deren Sprache nicht matcht. Laut Google Search Central und Ahrefs-Studie (374.756 Domains) ist fehlendes `x-default` der häufigste hreflang-Fehler (56,3% aller Domains).  
**Empfehlung**: In jeder Layout-Metadata `alternates.languages` ein `x-default` hinzufügen:

```ts
alternates: {
  canonical: "/at",
  languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
}
```

#### Lücke 2: Language Switcher zeigt `lang.toUpperCase()` statt Jurisdiction-Label

**Fund**: `@/src/components/marketing/chrome.tsx:540`:

```tsx
<Globe size={12} /> {lang.toUpperCase()}
```

Auf der AT-Seite zeigt der Button `AT` — das ist ein Ländercode, keine Sprache. Ein österreichischer User erwartet hier `DE-AT` oder `Österreich` als aktive Anzeige.  
**Empfehlung**: `{JURISDICTION_LABEL[lang]}` oder `{HREFLANG[lang]}` anzeigen statt `lang.toUpperCase()`.

#### Lücke 3: Language Switcher nutzt `pathname.replace` statt `stripLangPrefix`

**Fund**: `@/src/components/marketing/chrome.tsx:548`:

```tsx
href={p(l, pathname.replace(/^\/(en|at|ch)/, ""))}
```

Das funktioniert für einfache Pfade, aber `stripLangPrefix()` (`@/src/content/site.ts:82-89`) ist die kanonische Funktion dafür. Inkonsistente Nutzung.  
**Empfehlung**: `p(l, stripLangPrefix(pathname))` verwenden.

#### Lücke 4: `setDashboardLang` setzt `document.documentElement.lang` auf `at` statt `de-AT`

**Fund**: `@/src/lib/use-lang.ts:113`:

```ts
document.documentElement.lang = lang; // "at" — kein gültiger BCP 47 Tag!
```

`at` ist keine gültige Sprachbezeichnung (ISO 639-1 `at` existiert nicht). Gültig wäre `de-AT`.  
**Impact**: Screenreader und Browser können die Sprache nicht korrekt erkennen.  
**Empfehlung**: Mapping verwenden: `document.documentElement.lang = HREFLANG[lang] || lang;`

#### Lücke 5: Keine AT-spezifischen Sitemap-Einträge

**Status**: Keine separate Sitemap für `/at/` gefunden.  
**Impact**: Google entdeckt AT-Seiten möglicherweise langsamer oder indexiert sie nicht optimal.  
**Empfehlung**: Sitemap mit hreflang-Annotationen pro URL generieren.

#### Lücke 6: Kein `content-language` Meta-Tag für Bing

**Fund**: Bing unterstützt kein hreflang — nutzt `content-language` Meta-Tag.  
**Impact**: AT-Seiten werden in Bing AT nicht korrekt zugeordnet.  
**Empfehlung**: `<meta http-equiv="content-language" content="de-AT" />` in AT-Pages.

---

## 2. AT-Lokalisierung: Textqualität & Sprachliche Korrektheit

### 2.1 Anrede: "Du" vs "Sie" — Kritischer Befund ❌

**DE-Base nutzt "Du" (informell), AT nutzt "Sie" (formell)** — das ist korrekt für Österreich (dort ist "Sie" im Geschäftsverkehr Standard). Aber:

#### Problem: Solutions.ts hat KEINE AT-Overrides

**Fund**: `@/src/content/solutions.ts:716`:

```ts
at: _solutionsDe,  // ← identisch mit DE, das "Du" verwendet!
```

AT-Seite zeigt "Das Wissen **deiner** Kanzlei", "**Du** bist das Wissens-Team", "**Dein** Akten-Brain" etc. — 35 Vorkommen von "deine/dein/du/Du" in solutions.ts.  
**Impact**: Österreichische Anwälte erwarten formelle Anrede ("Sie", "Ihre"). "Du" wirkt unprofessionell für eine Kanzleisoftware.  
**Empfehlung**: AT-Override für solutions.ts mit `deepMerge` + Sie/Ihre-Anrede, analog zu AT_REPLACEMENTS in site.ts.

#### Problem: Partners.ts hat KEINE AT-Overrides

**Fund**: `@/src/content/partners.ts:260`:

```ts
at: _dePartners,  // ← identisch mit DE!
```

"**Du** verdienst weiter", "**Dein** Publikum braucht ein Kanzlei-Brain" — 15 Vorkommen.  
**Empfehlung**: Gleiche Korrektur wie solutions.ts.

#### Problem: Verticals.ts hat KEINE AT-Overrides

**Fund**: `@/src/content/verticals.ts:308`:

```ts
at: _verticalsDe,  // ← identisch mit DE!
```

**Empfehlung**: Gleiche Korrektur.

#### Problem: Dashboard.ts hat KEINE AT-Overrides

**Fund**: `@/src/content/dashboard.ts` — `BiString = { de: string; en: string; at?: string; ch?: string }` — `at` und `ch` sind optional und werden nirgends gesetzt. `createT()` fallbackt auf `entry.de`.  
**Impact**: Dashboard zeigt immer DE-Texte, auch wenn User AT ausgewählt hat.  
**Empfehlung**: Entweder AT-spezifische Strings für kritische Pfade (z.B. Rechtsterminologie) oder bewusst dokumentieren, dass Dashboard DE nutzt.

#### Problem: UI_STRINGS hat KEINE AT-Overrides

**Fund**: `@/src/content/site.ts:1788`:

```ts
at: _uiStringsDe,  // ← identisch mit DE!
```

"**Keine Kreditkarte**", "**Schreiben Sie uns**" (gemischt — einige "Sie", einige "deine"). Inkonsistent.

#### Problem: VALUE_PROPS hat KEINE AT-Overrides

**Fund**: `@/src/content/site.ts:1836`:

```ts
at: _valuePropsDe,  // ← identisch mit DE!
```

### 2.2 Nav-Beschreibungen: AT zeigt "Deine Daten, deine Keys" ❌

**Fund**: `@/src/content/site.ts:392` (AT-Nav Override):

```ts
description: "Deine Daten, deine Keys, deine Jurisdiktion";
```

AT-Nav überschreibt explizit die "Über uns"-Beschreibung mit "Aus Österreich für DACH-Kanzleien" (gut!), aber die "Sicherheit"-Beschreibung bleibt "Deine Daten, deine Keys, deine Jurisdiktion" — das ist DE-Base mit "Du".  
**Empfehlung**: In AT-Nav-Override: "Ihre Daten, Ihre Keys, Ihre Jurisdiktion".

### 2.3 Österreichische Rechtsterminologie — Fehlt teilweise ❌

Laut Wikipedia (Österreichisches Deutsch, Amts- und Juristendeutsch) unterscheiden sich:

| Begriff (DE)   | Begriff (AT)  | Status in Code                                    |
| -------------- | ------------- | ------------------------------------------------- |
| Schadensersatz | Schadenersatz | ❌ nicht ersetzt                                  |
| Schmerzensgeld | Schmerzengeld | ❌ nicht ersetzt                                  |
| die Akte       | der Akt       | ❌ nicht ersetzt (Kanzleikontext)                 |
| vereidigt      | angelobt      | ❌ nicht ersetzt                                  |
| Asylbewerber   | Asylwerber    | ❌ nicht ersetzt                                  |
| Januar         | Jänner        | ❌ nicht ersetzt (nur in Datum-Anzeigen relevant) |
| Februar        | Feber         | ❌ nicht ersetzt (kanzleisprachlich)              |

**Hinweis**: Nicht alle sind für eine Kanzleisoftware relevant (z.B. Asylwerber), aber **Schadenersatz** und **Schmerzengeld** sind Kernbegriffe im österreichischen Zivilrecht und sollten in AT-spezifischen Texten verwendet werden.

### 2.4 Schreibweise: Österreichische Besonderheiten

| Begriff (DE)  | Begriff (AT) | Status                   |
| ------------- | ------------ | ------------------------ |
| ohne Weiteres | ohneweiters  | ⚠️ nicht relevant für UI |
| Geschoss      | Geschoß      | ⚠️ nicht relevant        |
| Küken         | Kücken       | ⚠️ nicht relevant        |

**Fazit**: Schreibweise-Unterschiede sind für eine Kanzleisoftware kaum relevant. Die Rechtschreibreform-Unterschiede betreffen hauptsächlich Alltagsvokabular, nicht juristische Fachsprache.

### 2.5 AT_REPLACEMENTS-Mechanismus: Fragil ⚠️

**Fund**: `@/src/content/site.ts:1220-1252` — String-Replacement ist reihenfolgenabhängig und fehleranfällig:

- `"dir ": "Ihnen "` — funktioniert nur mit nachfolgendem Leerzeichen
- `"dich ": "Sie "` — gleiche Einschränkung
- `"deine": "Ihre"` — catch-all, aber ersetzt auch "deine" in zusammengesetzten Wörtern
- Keine Berücksichtigung von Groß-/Kleinschreibung am Satzanfang

**Beispiel-Problem**: "Deine Daten" → AT_REPLACEMENTS hat `"deine": "Ihre"` (kleingeschrieben). `"Deine Daten"` wird nur durch den separaten Eintrag `"deine Daten": "Ihre Daten"` erfasst. Wenn ein neuer Text "Deine Akten" hinzugefügt wird, wird er NICHT ersetzt, weil nur `"deine Akten": "Ihre Akten"` existiert, nicht `"Deine Akten": "Ihre Akten"`.

**Empfehlung**: Statt String-Replacement AT-spezifische Content-Objekte mit `deepMerge` verwenden (wie bereits bei SECURITY und DOWNLOAD gemacht). Oder Replacement case-insensitive machen.

---

## 3. SEO-Audit: AT-Seiten bei Google

### 3.1 Metadata-Qualität der AT-Seiten ✅

**AT Landing Page** (`@/src/app/at/page.tsx:12-27`):

- **Title**: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich | AT · DE · CH" ✅
- **Description**: Erwähnt ZPO/ABGB, ADATEV, § 10 RAO ✅
- **Canonical**: `/at` ✅
- **hreflang**: Alle 4 Varianten ✅
- **OpenGraph**: AT-spezifisch ✅

### 3.2 Fehlende AT-spezifische Keywords ❌

**Root-Layout Keywords** (`@/src/app/layout.tsx:41-89`) sind DE-zentrisch:

- "Kanzleisoftware Österreich" ✅ vorhanden
- "Fristenberechnung ABGB" ✅ vorhanden
- "ADATEV" ✅ vorhanden
- **Aber**: "Kanzleisoftware Österreich" taucht nur 1x auf, nicht als AT-spezifischer Cluster

**Fehlende AT-Keywords** (laut Google Trends AT):

- "Rechtsanwaltssoftware Österreich" — ❌ fehlt
- "Anwaltssoftware Österreich" — ❌ fehlt
- "Kanzleisoftware Wien" — ❌ fehlt
- "RAKO Alternative" — ❌ fehlt
- "§ 10 RAO Kollisionsprüfung" — ❌ fehlt
- "Schadenersatz Software" — ❌ fehlt
- "ADATEV RVG" — ❌ fehlt
- "RA 24" — ❌ fehlt (österreichisches Rechtsanwaltsverzeichnis)

### 3.3 AT-Title-Tags: Gut, aber nicht optimal für lokale Suche

**AT-Title**: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich | AT · DE · CH"  
**Verbesserungspotential**: "AT · DE · CH" am Ende verschwendet Title-Tag-Space (60 Zeichen Limit). Besser: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich" oder "Subsumio — Kanzleisoftware Österreich | KI, Fristen, ADATEV"

### 3.4 Duplicate Content Risk ⚠️

AT- und DE-Seiten teilen sich 80%+ identischen Content (nur Rechtsterminologie und Anrede unterscheiden sich). Google könnte dies als Duplicate Content werten.  
**Mitigation**:

- hreflang ist korrekt gesetzt ✅
- Canonical ist korrekt pro Locale ✅
- Aber: Wenn der Textunterschied < 20% ist, kann Google AT-Seiten als Duplikat von DE einstufen
- **Empfehlung**: AT-spezifische Inhalte stärken — lokale Case Studies, AT-Rechtsfälle, AT-spezifische FAQ-Einträge

### 3.5 Strukturierte Daten (JSON-LD) ✅

AT-Landing nutzt `softwareApplicationLd("at")`, `faqPageLd(LANDING.at.faq)`, `howToLd(LANDING.at.how, "at")` ✅  
**Aber**: FAQ und HowTo nutzen AT_REPLACEMENTS-ausgeführte DE-Texte — Qualität hängt vom Replacement ab.

---

## 4. Header & Language Dropdown: Verhalten auf AT-Seiten

### 4.1 Desktop-Dropdown ✅ (mit Bug)

**Fund**: `@/src/components/marketing/chrome.tsx:534-557`

Der Dropdown zeigt alle 4 Sprachen:

- `de-DE — Deutschland`
- `de-AT — Österreich`
- `de-CH — Schweiz`
- `en — International`

**Aktive Sprache**: Der Button zeigt `{lang.toUpperCase()}` = `AT` auf der AT-Seite.  
**Bug**: `AT` ist kein Sprachcode. Sollte `DE-AT` oder `Österreich` zeigen.

**Highlighting**: Aktive Sprache wird mit `font-medium` markiert ✅

### 4.2 Mobile-Dropdown ✅

**Fund**: `@/src/components/marketing/chrome.tsx:677-695`

Zeigt "Sprache / Language" Header und alle 4 Optionen mit `HREFLANG[l] — JURISDICTION_LABEL[l]` ✅

### 4.3 Sprache wird beim Klick persistiert ✅

`setLangPref(l)` setzt Cookie `sb_lang` ✅

### 4.4 Redirect-Logik: AT-User kommt auf DE-Seite ⚠️

**Fund**: `@/src/middleware.ts:207-226`

Die Browser-Spracherkennung prüft nur: "Ist Deutsch?" → ja → redirect zu `/` (DE).  
**Problem**: Ein österreichischer User mit `Accept-Language: de-AT` wird auf `/` (DE) geleitet, nicht auf `/at`.  
**Impact**: AT-User sehen zuerst DE-Content mit "Du"-Anrede.  
**Empfehlung**: Erweiterte Erkennung:

```ts
if (primaryLang === "de-at" || primaryLang.startsWith("de-at")) {
  // Redirect nach /at
} else if (primaryLang === "de-ch" || primaryLang.startsWith("de-ch")) {
  // Redirect nach /ch
}
```

---

## 5. Content-Dateien: AT-Override-Status

| Datei                   | AT-Override             | Anrede                            | Rechtsterminologie  | Status               |
| ----------------------- | ----------------------- | --------------------------------- | ------------------- | -------------------- |
| `site.ts` (NAV)         | `deepMerge` ✅          | ⚠️ "Deine Daten" in Security-Desc | ✅ "Aus Österreich" | **Teilweise**        |
| `site.ts` (FOOTER)      | explizit ✅             | ✅ "Ihre Daten"                   | —                   | **Gut**              |
| `site.ts` (PRICING)     | explizit ✅             | ✅ "Ihr Kanzleiwissen"            | ✅ ZPO/ABGB, ADATEV | **Gut**              |
| `site.ts` (FAQ)         | explizit ✅             | ✅ "Ihre"                         | ✅ AT-spezifisch    | **Gut**              |
| `site.ts` (LANDING)     | `applyReplacements` ⚠️  | ✅ "Sie/Ihre"                     | ✅ ZPO/ABGB         | **Gut, aber fragil** |
| `site.ts` (UI_STRINGS)  | `_uiStringsDe` ❌       | ⚠️ gemischt                       | —                   | **Fehlt**            |
| `site.ts` (VALUE_PROPS) | `_valuePropsDe` ❌      | ⚠️ "Keine versteckten Kosten"     | —                   | **Fehlt**            |
| `solutions.ts`          | `_solutionsDe` ❌       | ❌ "Du/deine"                     | ❌ § 43a BRAO       | **Kritisch**         |
| `security.ts`           | `deepMerge` ✅          | ✅ "Ihre Daten"                   | ✅ § 9 RAO          | **Gut**              |
| `partners.ts`           | `_dePartners` ❌        | ❌ "Du/dein"                      | —                   | **Kritisch**         |
| `download.ts`           | `deepMerge` ✅          | ✅ "Ihr Brain"                    | —                   | **Gut**              |
| `docs.ts`               | `_docsDe` ❌            | ❌ "deine"                        | ❌ DATEV            | **Kritisch**         |
| `verticals.ts`          | `_verticalsDe` ❌       | ❌ "deine"                        | —                   | **Kritisch**         |
| `vertical-pricing.ts`   | `_verticalPricingDe` ❌ | ❌ "deine"                        | —                   | **Kritisch**         |
| `dashboard.ts`          | `at?` (nie set) ❌      | ❌ "deine"                        | ❌ DATEV            | **Fehlt**            |

---

## 6. Österreichisches Deutsch: Empfohlene Austriazismen für Kanzleisoftware

### 6.1 Rechtsterminologie (relevant für AT-Seiten)

| DE (Bundesdeutsch)      | AT (Österreichisch)     | Priorität                             |
| ----------------------- | ----------------------- | ------------------------------------- |
| Schadensersatz          | Schadenersatz           | **Hoch** — Kernbegriff Zivilrecht     |
| Schmerzensgeld          | Schmerzengeld           | **Hoch** — Kernbegriff Schadensersatz |
| die Akte (Gerichtsakte) | der Akt                 | **Mittel** — formell, aber relevant   |
| vereidigt               | angelobt                | **Niedrig** — selten in UI            |
| Notfrist                | Notfrist                | ✅ identisch                          |
| Berufungsfrist          | Berufungsfrist          | ✅ identisch                          |
| Rechtsanwalt            | Rechtsanwalt            | ✅ identisch                          |
| Rechtsanwältin          | Rechtsanwältin          | ✅ identisch                          |
| Rechtsanwaltskammer     | Rechtsanwaltskammer     | ✅ identisch                          |
| DATEV                   | ADATEV                  | ✅ bereits ersetzt                    |
| § 203 StGB              | § 9 RAO                 | ✅ bereits ersetzt                    |
| § 43a BRAO              | § 10 RAO                | ✅ bereits ersetzt                    |
| RVG                     | RVG (AT: RVG identisch) | ✅ identisch                          |
| BGB                     | ABGB                    | ✅ bereits ersetzt                    |

### 6.2 Anrede (höchste Priorität)

| DE    | AT    | Status                                                  |
| ----- | ----- | ------------------------------------------------------- |
| Du    | Sie   | ❌ nicht in solutions/partners/verticals/docs/dashboard |
| deine | Ihre  | ❌ nicht in solutions/partners/verticals/docs/dashboard |
| dein  | Ihr   | ❌ nicht in solutions/partners/verticals/docs/dashboard |
| dir   | Ihnen | ❌ nicht in solutions/partners/verticals/docs/dashboard |
| dich  | Sie   | ❌ nicht in solutions/partners/verticals/docs/dashboard |

### 6.3 Monatsnamen (für Fristen/Datumsanzeigen)

| DE      | AT            | Priorität                                          |
| ------- | ------------- | -------------------------------------------------- |
| Januar  | Jänner        | **Mittel** — offiziell in AT                       |
| Februar | Februar/Feber | **Niedrig** — Februar ist auch in AT standardmäßig |

**Empfehlung**: Datumsformatierung in AT auf `Jänner` anpassen, wenn Monatsnamen ausgeschrieben werden.

---

## 7. Handlungsempfehlungen (Priorisiert)

### P0 — Sofort beheben (kritisch für AT-Launch)

1. **`solutions.ts` AT-Override hinzufügen**: `deepMerge(_solutionsDe, AT_SOLUTIONS_OVERRIDE)` mit Sie/Ihre-Anrede und AT-Rechtsterminologie (§ 10 RAO statt § 43a BRAO, ABGB statt BGB, Schadenersatz statt Schadensersatz)
2. **`partners.ts` AT-Override hinzufügen**: Gleiche Korrektur für Anrede
3. **`docs.ts` AT-Override hinzufügen**: Anrede + DATEV → ADATEV
4. **`verticals.ts` AT-Override hinzufügen**: Anrede
5. **`vertical-pricing.ts` AT-Override hinzufügen**: Anrede
6. **Language Switcher Button**: `lang.toUpperCase()` → `JURISDICTION_LABEL[lang]` oder `HREFLANG[lang]`
7. **`setDashboardLang`**: `document.documentElement.lang = HREFLANG[lang]` statt `lang`
8. **`x-default` hreflang**: In allen Layout-Metadaten hinzufügen

### P1 — Kurzfristig (SEO-Optimierung)

9. **AT-spezifische Keywords**: Erweitern der Keywords-Liste für AT-Seiten
10. **AT-Title-Tags**: "AT · DE · CH" Suffix entfernen, AT-relevante Keywords stattdessen
11. **Browser-Redirect**: `de-AT` Accept-Language → `/at` statt `/`
12. **`content-language` Meta-Tag**: Für Bing-Kompatibilität
13. **AT-Nav "Sicherheit"-Beschreibung**: "Deine Daten" → "Ihre Daten" in AT-Nav-Override
14. **UI_STRINGS AT-Override**: Separates AT-Objekt mit Sie/Ihre

### P2 — Mittelfristig (Content-Qualität)

15. **AT-spezifische FAQ**: Lokale Rechtsfälle, AT-spezifische Fragen (z.B. "Funktioniert das mit RAKO?")
16. **AT-Case Studies**: Wenn verfügbar, lokale Referenzen
17. **AT-spezifische Sitemap**: Mit hreflang-Annotationen
18. **AT-Datumsformat**: `Jänner` in ausgeschriebenen Datumsanzeigen
19. **AT-Preisdarstellung**: Sicherstellen, dass €-Beträge korrekt sind (österreichische USt 20% vs 19% DE) — bereits in Pricing korrekt ✅
20. **Dashboard AT-Strings**: Mindestens für rechtsterminologische Begriffe (Schadenersatz, Schmerzengeld)

### P3 — Langfristig (Full Localization)

21. **AT-spezifischer Blog/Content**: SEO-Content für österreichische Suchanfragen
22. **AT-spezifische Structured Data**: LocalBusiness mit AT-Adresse
23. **AT-spezifische Open Graph Images**: Mit AT-Branding
24. **AT-Telefonnummer**: +43 Nummer in Footer/Impressum
25. **AT-Impressum**: Österreichische Rechtsform, FB-Nummer, WKO-Mitgliedschaft

---

## 8. Zusammenfassung

| Bereich                     | Score      | Status                                                                                     |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| Technische i18n-Architektur | 75/100     | Solide, aber `x-default` und BCP 47 Bug                                                    |
| AT-Text-Lokalisierung       | 40/100     | Nur LANDING/PRICING/SECURITY/DOWNLOAD haben AT-Overrides; 5 Content-Dateien nutzen DE-Base |
| Anrede (Sie vs Du)          | 30/100     | Kritisch: solutions, partners, docs, verticals, dashboard zeigen "Du" auf AT-Seiten        |
| Rechtsterminologie          | 70/100     | Gute Basis (ABGB, RAO, ADATEV), aber Schadenersatz/Schmerzengeld fehlen                    |
| SEO hreflang                | 65/100     | Gut, aber `x-default` fehlt, kein `content-language` für Bing                              |
| SEO Keywords AT             | 35/100     | DE-zentrisch, AT-spezifische Keywords fehlen                                               |
| Header/Dropdown             | 70/100     | Funktioniert, aber Button zeigt `AT` statt `Österreich`                                    |
| Browser-Erkennung           | 50/100     | AT-User wird auf DE-Seite geleitet                                                         |
| **Gesamt**                  | **55/100** | **Teilweise lokalisiert — nicht AT-optimal**                                               |

---

_Audit erstellt: 2026-06-28_  
_Methodik: Code-Review aller i18n-relevanten Dateien + Web-Recherche (Wikipedia Österreichisches Deutsch, Google Search Central hreflang, Ahrefs hreflang study 2025, DACH SEO Guide 2026)_
