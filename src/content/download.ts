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
    "Installieren Sie Subsumio auf iPhone, iPad, Android und Desktop — direkt aus dem Browser, ohne App Store.",
  badge: "iOS · iPadOS · Android · Desktop",
  h1a: "Ihr Kanzleiwissen,",
  h1b: "in Ihrer Tasche.",
  sub: "Subsumio lässt sich auf jedem Ihrer Geräte als Vollbild-App installieren — direkt aus dem Browser, ohne App Store. Ein Konto für alle Geräte.",
  platforms: [
    {
      id: "ios",
      icon: "Apple",
      name: "iPhone & iPad",
      tagline: "Über Safari installieren",
      steps: [
        "Öffnen Sie subsum.eu in Safari",
        "Tippen Sie auf das Teilen-Symbol (Quadrat mit Pfeil)",
        "Tippen Sie auf „Zum Home-Bildschirm“",
        "Tippen Sie auf „Hinzufügen“ — fertig. Subsumio erscheint mit dem Σ-Symbol.",
      ],
      note: "Ab iOS und iPadOS 16.4. Die App läuft im Vollbild, ohne Browser-Leiste.",
    },
    {
      id: "android",
      icon: "Smartphone",
      name: "Android",
      tagline: "Chrome bietet Ihnen die Installation an",
      steps: [
        "Öffnen Sie subsum.eu in Chrome",
        "Tippen Sie auf „App installieren“ (oder Menü ⋮ → „Zum Startbildschirm“)",
        "Bestätigen Sie — Subsumio erscheint in Ihrer App-Übersicht",
        "Startet im Vollbild wie jede andere App.",
      ],
      note: "Funktioniert auch in Edge, Samsung Internet und Firefox.",
    },
    {
      id: "desktop",
      icon: "Monitor",
      name: "Desktop (Mac, Windows, Linux)",
      tagline: "Ein Klick in Chrome oder Edge",
      steps: [
        "Öffnen Sie subsum.eu in Chrome oder Edge",
        "Klicken Sie auf das Installieren-Symbol in der Adressleiste (⊕ Bildschirm)",
        "Bestätigen Sie — Subsumio öffnet sich im eigenen Fenster",
        "Heften Sie es ans Dock oder an die Taskleiste.",
      ],
    },
  ],
  storesTitle: "App Store & Google Play (in Vorbereitung)",
  storesSub: "Was die Store-Apps zusätzlich bringen:",
  storesNote:
    "Bis dahin installieren Sie Subsumio wie oben beschrieben aus dem Browser — es ist dasselbe Produkt mit demselben Konto.",
  faqTitle: "Fragen zur Installation",
  faq: [
    {
      q: "Unterscheidet sich die installierte App von der Website?",
      a: "Nein: gleiches Produkt, gleiches Konto, gleiche Daten. Die Installation gibt Ihnen ein Vollbild-Fenster und ein Symbol auf dem Startbildschirm. Apps für App Store und Google Play sind in Vorbereitung; einen Termin nennen wir, sobald er feststeht.",
    },
    {
      q: "Funktioniert Subsumio offline?",
      a: "Startet auch ohne Netz — Abfragen brauchen eine Verbindung. Die App sagt Ihnen klar, wenn sie Ihr Kanzleiwissen nicht erreicht. Ihre Daten liegen in der EU-Cloud oder auf Ihrem eigenen Server (Enterprise), nicht auf dem Handy.",
    },
    {
      q: "Ist die App auf dem Handy sicher?",
      a: "Es ist dieselbe Anwendung wie im Browser: Die Übertragung ist verschlüsselt, und über die Sitzung hinaus werden keine Kanzleidaten auf dem Gerät gespeichert.",
    },
  ],
  ctaTitle: "Jetzt installieren. In der nächsten Verhandlung nutzen.",
  ctaSub: "In wenigen Minuten installiert — auf dem Gerät, das Sie gerade in der Hand halten.",
  ctaButton: "14 Tage kostenlos testen",
};
