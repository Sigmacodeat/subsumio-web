// Download page — install paths for every platform.

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

export const DOWNLOAD: DownloadContent = {
  metaTitle: "Download — Subsumio auf jedem Gerät",
  metaDesc:
    "Installier Subsumio auf iPhone, iPad, Android und Desktop. Eine App, jeder Bildschirm — ohne App Store.",
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
        "Klick das Install-Icon in der Adressleiste (⊕ Bildschirm)",
        "Bestätige — Subsumio öffnet im eigenen Fenster",
        "Pinn es ans Dock oder die Taskleiste.",
      ],
    },
  ],
  storesTitle: "App Store & Google Play (Beta)",
  storesSub:
    "Native Apps sind in Vorbereitung — auf derselben Codebase via Capacitor, mit Push-Benachrichtigungen, biometrischer Entsperrung und einer „An Subsumio senden“-Share-Extension. Aktuell Beta — Store-Verfügbarkeit folgt auf den Cloud-Launch.",
  storesNote:
    "Die Store-Verfügbarkeit folgt auf den Cloud-Launch (Apple verlangt für das Review einen vollständigen Account-Flow). Installier heute die Web-App oben — es ist dasselbe Produkt, dein Konto zieht mit um.",
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
  ctaButton: "14 Tage kostenlos testen",
};
