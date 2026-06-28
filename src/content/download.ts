// Download page — install paths for every platform. EN + DE.

import { type Lang, deepMerge } from "./site";

export interface DownloadContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  platforms: {
    id: string;
    icon: string;
    name: string;
    tagline: string;
    steps: string[];
    note?: string;
  }[];
  storesTitle: string;
  storesSub: string;
  storesNote: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

const _deDownload: DownloadContent = {
  metaTitle: "Download — Subsumio auf jedem Gerät",
  metaDesc:
    "Installiere Subsumio auf iPhone, iPad, Android und Desktop. Eine App, jeder Bildschirm — ohne App Store.",
  badge: "iOS · iPadOS · Android · Desktop",
  h1a: "Dein Brain,",
  h1b: "in deiner Tasche.",
  sub: "Subsumio installiert sich als Vollbild-App auf jedem deiner Geräte — direkt aus dem Browser, ohne App Store, ohne Wartezeit. Ein Konto, jeder Bildschirm. Native Store-Apps sind in Arbeit.",
  platforms: [
    {
      id: "ios",
      icon: "Apple",
      name: "iPhone & iPad",
      tagline: "In 10 Sekunden über Safari installiert",
      steps: [
        "Öffne subsum.eu in Safari",
        "Tippe auf den Teilen-Button (Quadrat mit Pfeil)",
        "Tippe auf „Zum Home-Bildschirm“",
        "Tippe auf „Hinzufügen“ — fertig. Vollbild-App mit Σ-Icon.",
      ],
      note: "Funktioniert auf iOS und iPadOS 16.4+. Die App läuft im Standalone-Modus — ohne Browser-Leiste.",
    },
    {
      id: "android",
      icon: "Smartphone",
      name: "Android",
      tagline: "Chrome bietet dir die Installation an",
      steps: [
        "Öffne subsum.eu in Chrome",
        "Tippe auf „App installieren“ (oder Menü ⋮ → „Zum Startbildschirm“)",
        "Bestätige — Subsumio erscheint im App-Drawer",
        "Startet im Vollbild wie jede native App.",
      ],
      note: "Funktioniert auch in Edge, Samsung Internet und Firefox.",
    },
    {
      id: "desktop",
      icon: "Monitor",
      name: "Desktop (Mac, Windows, Linux)",
      tagline: "Ein Klick in Chrome oder Edge",
      steps: [
        "Öffne subsum.eu in Chrome oder Edge",
        "Klicke das Install-Icon in der Adressleiste (⊕ Bildschirm)",
        "Bestätige — Subsumio öffnet im eigenen Fenster",
        "Pinne es ans Dock oder die Taskleiste.",
      ],
    },
  ],
  storesTitle: "App Store & Google Play",
  storesSub:
    "Native Apps sind in Vorbereitung — auf derselben Codebase via Capacitor, mit Push-Benachrichtigungen, biometrischer Entsperrung und einer „An Subsumio senden“-Share-Extension.",
  storesNote:
    "Die Store-Verfügbarkeit folgt auf den Cloud-Launch (Apple verlangt für das Review einen vollständigen Account-Flow). Installiere heute die Web-App oben — es ist dasselbe Produkt, dein Konto zieht mit um.",
  faqTitle: "Fragen zur Installation",
  faq: [
    {
      q: "Unterscheidet sich die installierte App von der Website?",
      a: "Gleiches Produkt, gleiches Konto, gleiche Daten. Die Installation gibt dir ein Vollbild-Fenster, ein Home-Screen-Icon und einen Offline-Fallback. Native Store-Versionen ergänzen Push-Benachrichtigungen und Share-Extensions.",
    },
    {
      q: "Funktioniert es offline?",
      a: "Die App-Hülle lädt offline und sagt dir klar, wenn sie dein Brain nicht erreicht. Queries brauchen eine Verbindung — dein Brain lebt auf deinem Server oder deiner EU-Cloud-Instanz, nicht auf dem Handy.",
    },
    {
      q: "Ist die mobile App sicher?",
      a: "Es ist dieselbe gehärtete Web-App: verschlüsselter Transport, httpOnly-Session-Cookies, und deine Daten werden über die Session hinaus nicht auf dem Gerät gespeichert.",
    },
    {
      q: "Wann kommen die Store-Apps?",
      a: "Nach dem Cloud-Launch — Apples Review verlangt einen vollständigen Signup-Flow. Das Capacitor-Build-Setup liegt bereits im Repository (mobile/README.md).",
    },
  ],
  ctaTitle: "Jetzt installieren. In der nächsten Verhandlung nutzen.",
  ctaSub:
    "In unter fünf Minuten eingerichtet. Erste belegte Antwort am selben Tag — auf dem Gerät, das gerade in deiner Hand liegt.",
  ctaButton: "Demo anfragen",
};

export const DOWNLOAD: Record<Lang, DownloadContent> = {
  en: {
    metaTitle: "Download — Subsumio on every device",
    metaDesc:
      "Install Subsumio on iPhone, iPad, Android and desktop. One app, every screen — no app store required.",
    badge: "iOS · iPadOS · Android · Desktop",
    h1a: "Your brain,",
    h1b: "in your pocket.",
    sub: "Subsumio installs as a full-screen app on every device you own — straight from the browser, no app store, no waiting. One account, every screen. Native store apps are on the way.",
    platforms: [
      {
        id: "ios",
        icon: "Apple",
        name: "iPhone & iPad",
        tagline: "Install via Safari in 10 seconds",
        steps: [
          "Open subsum.eu in Safari",
          "Tap the Share button (square with arrow)",
          "Tap “Add to Home Screen”",
          "Tap “Add” — done. Full-screen app with the Σ icon.",
        ],
        note: "Works on iOS and iPadOS 16.4+. The app runs in standalone mode — no browser chrome.",
      },
      {
        id: "android",
        icon: "Smartphone",
        name: "Android",
        tagline: "Chrome offers the install for you",
        steps: [
          "Open subsum.eu in Chrome",
          "Tap the “Install app” prompt (or menu ⋮ → “Add to Home screen”)",
          "Confirm — Subsumio appears in your app drawer",
          "Launches full-screen like any native app.",
        ],
        note: "Also works in Edge, Samsung Internet and Firefox.",
      },
      {
        id: "desktop",
        icon: "Monitor",
        name: "Desktop (Mac, Windows, Linux)",
        tagline: "One click in Chrome or Edge",
        steps: [
          "Open subsum.eu in Chrome or Edge",
          "Click the install icon in the address bar (⊕ screen)",
          "Confirm — Subsumio opens in its own window",
          "Pin it to your Dock or taskbar.",
        ],
      },
    ],
    storesTitle: "App Store & Google Play",
    storesSub:
      "Native apps are in preparation — built on the same codebase via Capacitor, with push notifications, biometric unlock and a “Send to Subsumio” share extension.",
    storesNote:
      "Store availability follows the hosted-cloud launch (Apple requires a full account flow for review). Install the web app above today — it's the same product, and your account carries over.",
    faqTitle: "Install questions",
    faq: [
      {
        q: "Is the installed app different from the website?",
        a: "Same product, same account, same data. The install gives you a full-screen window, a home-screen icon, and an offline fallback. Native store versions will add push notifications and share extensions.",
      },
      {
        q: "Does it work offline?",
        a: "The app shell loads offline and tells you clearly when it can't reach your brain. Queries need a connection — your brain lives on your server or your EU cloud instance, not on the phone.",
      },
      {
        q: "Is the mobile app secure?",
        a: "It's the same hardened web app: encrypted transport, httpOnly session cookies, and your data never stored on the device beyond the session.",
      },
      {
        q: "When do the store apps arrive?",
        a: "After the hosted cloud is live — Apple's review requires a complete signup flow. The Capacitor build setup is already in the repository (mobile/README.md).",
      },
    ],
    ctaTitle: "Install now. Use it in your next hearing.",
    ctaSub:
      "Set up in under five minutes. First cited answer the same day — on whatever device is in your hand.",
    ctaButton: "Request a demo",
  },
  de: _deDownload,
  at: deepMerge(_deDownload, {
    metaDesc:
      "Installieren Sie Subsumio auf iPhone, iPad, Android und Desktop. Eine App, jeder Bildschirm — ohne App Store.",
    h1a: "Ihr Brain,",
    h1b: "in Ihrer Tasche.",
    sub: "Subsumio installiert sich als Vollbild-App auf jedem Ihrer Geräte — direkt aus dem Browser, ohne App Store, ohne Wartezeit. Ein Konto, jeder Bildschirm. Native Store-Apps sind in Arbeit.",
    platforms: [
      {
        tagline: "In 10 Sekunden über Safari installiert",
        steps: [
          "Öffnen Sie subsum.eu in Safari",
          "Tippen Sie auf den Teilen-Button (Quadrat mit Pfeil)",
          "Tippen Sie auf „Zum Home-Bildschirm“",
          "Tippen Sie auf „Hinzufügen“ — fertig. Vollbild-App mit Σ-Icon.",
        ],
        note: "Funktioniert auf iOS und iPadOS 16.4+. Die App läuft im Standalone-Modus — ohne Browser-Leiste.",
      },
      {
        tagline: "Chrome bietet Ihnen die Installation an",
        steps: [
          "Öffnen Sie subsum.eu in Chrome",
          "Tippen Sie auf „App installieren“ (oder Menü ⋮ → „Zum Startbildschirm“)",
          "Bestätigen Sie — Subsumio erscheint im App-Drawer",
          "Startet im Vollbild wie jede native App.",
        ],
      },
      {
        steps: [
          "Öffnen Sie subsum.eu in Chrome oder Edge",
          "Klicken Sie das Install-Icon in der Adressleiste (⊕ Bildschirm)",
          "Bestätigen Sie — Subsumio öffnet im eigenen Fenster",
          "Pinnen Sie es ans Dock oder die Taskleiste.",
        ],
      },
    ],
    storesNote:
      "Die Store-Verfügbarkeit folgt auf den Cloud-Launch (Apple verlangt für das Review einen vollständigen Account-Flow). Installieren Sie heute die Web-App oben — es ist dasselbe Produkt, Ihr Konto zieht mit um.",
    faq: [
      {
        a: "Gleiches Produkt, gleiches Konto, gleiche Daten. Die Installation gibt Ihnen ein Vollbild-Fenster, ein Home-Screen-Icon und einen Offline-Fallback. Native Store-Versionen ergänzen Push-Benachrichtigungen und Share-Extensions.",
      },
      {
        a: "Die App-Hülle lädt offline und sagt Ihnen klar, wenn sie Ihr Brain nicht erreicht. Queries brauchen eine Verbindung — Ihr Brain lebt auf Ihrem Server oder Ihrer EU-Cloud-Instanz, nicht auf dem Handy.",
      },
      {
        a: "Es ist dieselbe gehärtete Web-App: verschlüsselter Transport, httpOnly-Session-Cookies, und Ihre Daten werden über die Session hinaus nicht auf dem Gerät gespeichert.",
      },
      {},
    ],
    ctaSub:
      "In unter fünf Minuten eingerichtet. Erste belegte Antwort am selben Tag — auf dem Gerät, das gerade in Ihrer Hand liegt.",
  }),
  ch: deepMerge(_deDownload, {
    metaDesc:
      "Installieren Sie Subsumio auf iPhone, iPad, Android und Desktop. Eine App, jeder Bildschirm — ohne App Store.",
    h1a: "Ihr Brain,",
    h1b: "in Ihrer Tasche.",
    sub: "Subsumio installiert sich als Vollbild-App auf jedem Ihrer Geräte — direkt aus dem Browser, ohne App Store, ohne Wartezeit. Ein Konto, jeder Bildschirm. Native Store-Apps sind in Arbeit.",
    platforms: [
      {
        tagline: "In 10 Sekunden über Safari installiert",
        steps: [
          "Öffnen Sie subsum.eu in Safari",
          "Tippen Sie auf den Teilen-Button (Quadrat mit Pfeil)",
          "Tippen Sie auf „Zum Home-Bildschirm“",
          "Tippen Sie auf „Hinzufügen“ — fertig. Vollbild-App mit Σ-Icon.",
        ],
        note: "Funktioniert auf iOS und iPadOS 16.4+. Die App läuft im Standalone-Modus — ohne Browser-Leiste.",
      },
      {
        tagline: "Chrome bietet Ihnen die Installation an",
        steps: [
          "Öffnen Sie subsum.eu in Chrome",
          "Tippen Sie auf „App installieren“ (oder Menü ⋮ → „Zum Startbildschirm“)",
          "Bestätigen Sie — Subsumio erscheint im App-Drawer",
          "Startet im Vollbild wie jede native App.",
        ],
      },
      {
        steps: [
          "Öffnen Sie subsum.eu in Chrome oder Edge",
          "Klicken Sie das Install-Icon in der Adressleiste (⊕ Bildschirm)",
          "Bestätigen Sie — Subsumio öffnet im eigenen Fenster",
          "Pinnen Sie es ans Dock oder die Taskleiste.",
        ],
      },
    ],
    storesNote:
      "Die Store-Verfügbarkeit folgt auf den Cloud-Launch (Apple verlangt für das Review einen vollständigen Account-Flow). Installieren Sie heute die Web-App oben — es ist dasselbe Produkt, Ihr Konto zieht mit um.",
    faq: [
      {
        a: "Gleiches Produkt, gleiches Konto, gleiche Daten. Die Installation gibt Ihnen ein Vollbild-Fenster, ein Home-Screen-Icon und einen Offline-Fallback. Native Store-Versionen ergänzen Push-Benachrichtigungen und Share-Extensions.",
      },
      {
        a: "Die App-Hülle lädt offline und sagt Ihnen klar, wenn sie Ihr Brain nicht erreicht. Queries brauchen eine Verbindung — Ihr Brain lebt auf Ihrem Server oder Ihrer EU-Cloud-Instanz, nicht auf dem Handy.",
      },
      {
        a: "Es ist dieselbe gehärtete Web-App: verschlüsselter Transport, httpOnly-Session-Cookies, und Ihre Daten werden über die Session hinaus nicht auf dem Gerät gespeichert.",
      },
      {},
    ],
    ctaSub:
      "In unter fünf Minuten eingerichtet. Erste belegte Antwort am selben Tag — auf dem Gerät, das gerade in Ihrer Hand liegt.",
  }),
};
