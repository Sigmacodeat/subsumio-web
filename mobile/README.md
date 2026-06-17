# Sigmabrain — Native Apps (iOS & Android) via Capacitor

Die nativen Apps sind eine dünne Schale um die gehostete Web-App (`server.url` in
`web/capacitor.config.ts`). Eine Codebase, vier Plattformen: Web, PWA, iOS, Android.
Die native Schicht ergänzt, was die PWA nicht kann: **Push-Benachrichtigungen,
biometrische Entsperrung, „An Sigmabrain senden“-Share-Extension.**

> **Reihenfolge beachten (aus dem Pre-Mortem):** Store-Submission erst NACH dem
> Cloud-Launch mit Auth + Billing. Apple lehnt reine Web-Wrapper ohne vollständigen
> Account-Flow ab (Guideline 4.2 Minimum Functionality). Auth ist gebaut — sobald
> die Web-App unter sigmabrain.com läuft, ist der Store-Weg frei.

## Voraussetzungen

| Plattform | Du brauchst |
|---|---|
| Beide | Node 20+, `cd web && npm install` (zieht @capacitor/cli, core, ios, android — bereits in package.json) |
| iOS | macOS mit Xcode 15+, Apple Developer Program (99 $/Jahr) |
| Android | Android Studio (beliebiges OS), Google Play Console (25 $ einmalig) |

## Native Projekte generieren (einmalig)

```bash
cd web
npm install
npx cap add ios       # erzeugt ios/   (Xcode-Projekt)
npx cap add android   # erzeugt android/ (Gradle-Projekt)
```

Die generierten Ordner `web/ios/` und `web/android/` einchecken — sie tragen
App-Icons, Splash Screens, Signing-Konfiguration und native Plugins.

## Konfiguration

- **App-ID:** `com.sigmabrain.app` (in `capacitor.config.ts`; vor dem ersten
  `cap add` final entscheiden — spätere Änderung ist mühsam).
- **Server-URL:** Produktion lädt `https://sigmabrain.com`. Für Gerätetests gegen
  den Dev-Server: `CAP_SERVER_URL=http://<dein-lan-ip>:3000 npx cap sync`.
- **Icons & Splash:** `npm install -D @capacitor/assets`, dann
  `npx capacitor-assets generate --iconBackgroundColor '#06060f' --splashBackgroundColor '#06060f'`
  mit `web/public/icon-512.png` als Quelle (`assets/icon.png`).

## Build & Test

```bash
npx cap sync          # Config + Plugins in die nativen Projekte spiegeln
npx cap open ios      # Xcode: Gerät wählen → Run
npx cap open android  # Android Studio: Gerät wählen → Run
```

## Native Features (nach dem ersten Lauf ergänzen)

| Feature | Plugin | Hinweis |
|---|---|---|
| Push | `@capacitor/push-notifications` | Braucht APNs-Key (Apple) + FCM-Projekt (Google); Backend-Endpoint zum Token-Speichern unter `/api/push/register` anlegen. |
| Biometrie | `@capacitor-community/biometric-auth` | Lokale Entsperrung vor Session-Nutzung. |
| Share-Extension | `@capacitor/share` + iOS Share Target | „Text/URL an Sigmabrain senden“ → POST an `/api/think` bzw. Upload. |

## Store-Submission-Checkliste

**Apple App Store:**
1. App Store Connect: App anlegen (Bundle-ID `com.sigmabrain.app`).
2. Screenshots: 6.7" iPhone + 12.9" iPad (die PWA-Ansichten taugen als Basis).
3. Privacy Nutrition Label: entspricht unserer Datenschutzerklärung (Account-Daten,
   Nutzungsdaten; keine Werbe-Tracker — wir haben keine).
4. Review-Hinweis mitgeben: Demo-Account mit befülltem Demo-Brain (Reviewer
   müssen den Kern-Flow sehen können).
5. Häufigster Ablehnungsgrund vermeiden: App muss MEHR können als Safari —
   Push + Biometrie + Share-Extension VOR der ersten Submission einbauen.

**Google Play:**
1. Play Console: App anlegen, Data-Safety-Formular ausfüllen.
2. Signierten AAB hochladen (`Android Studio → Build → Generate Signed Bundle`).
3. Interner Test-Track zuerst (sofort live, kein Review-Stau), dann Production.

## Warum nicht React Native / Flutter?

Eine zweite UI-Codebase für dieselben Screens wäre Pre-Mortem-Killer K10
(Scope-Explosion). Capacitor liefert 95 % des Nutzens für 5 % der Kosten,
und der Weg zu „mehr nativ“ bleibt offen (einzelne Screens lassen sich später
nativ ersetzen).
