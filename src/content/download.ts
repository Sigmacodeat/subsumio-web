// Download page — install paths for every platform. EN + DE.

import { type Lang, deepMerge, applyReplacements } from "./site";

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
  storesTitle: "App Store & Google Play (Beta)",
  storesSub:
    "Native Apps sind in Vorbereitung — auf derselben Codebase via Capacitor, mit Push-Benachrichtigungen, biometrischer Entsperrung und einer „An Subsumio senden“-Share-Extension. Aktuell Beta — Store-Verfügbarkeit folgt auf den Cloud-Launch.",
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

const _enDownload: DownloadContent = {
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
        "Tap \u201cAdd to Home Screen\u201d",
        "Tap \u201cAdd\u201d \u2014 done. Full-screen app with the \u03a3 icon.",
      ],
      note: "Works on iOS and iPadOS 16.4+. The app runs in standalone mode \u2014 no browser chrome.",
    },
    {
      id: "android",
      icon: "Smartphone",
      name: "Android",
      tagline: "Chrome offers the install for you",
      steps: [
        "Open subsum.eu in Chrome",
        "Tap the \u201cInstall app\u201d prompt (or menu \u22ee \u2192 \u201cAdd to Home screen\u201d)",
        "Confirm \u2014 Subsumio appears in your app drawer",
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
        "Click the install icon in the address bar (\u2295 screen)",
        "Confirm \u2014 Subsumio opens in its own window",
        "Pin it to your Dock or taskbar.",
      ],
    },
  ],
  storesTitle: "App Store & Google Play (Beta)",
  storesSub:
    "Native apps are in preparation \u2014 built on the same codebase via Capacitor, with push notifications, biometric unlock and a \u201cSend to Subsumio\u201d share extension. Currently in beta \u2014 store availability follows the hosted-cloud launch.",
  storesNote:
    "Store availability follows the hosted-cloud launch (Apple requires a full account flow for review). Install the web app above today \u2014 it's the same product, and your account carries over.",
  faqTitle: "Install questions",
  faq: [
    {
      q: "Is the installed app different from the website?",
      a: "Same product, same account, same data. The install gives you a full-screen window, a home-screen icon, and an offline fallback. Native store versions will add push notifications and share extensions.",
    },
    {
      q: "Does it work offline?",
      a: "The app shell loads offline and tells you clearly when it can't reach your brain. Queries need a connection \u2014 your brain lives on your server or your EU cloud instance, not on the phone.",
    },
    {
      q: "Is the mobile app secure?",
      a: "It's the same hardened web app: encrypted transport, httpOnly session cookies, and your data never stored on the device beyond the session.",
    },
    {
      q: "When do the store apps arrive?",
      a: "After the hosted cloud is live \u2014 Apple's review requires a complete signup flow. The Capacitor build setup is already in the repository (mobile/README.md).",
    },
  ],
  ctaTitle: "Install now. Use it in your next hearing.",
  ctaSub:
    "Set up in under five minutes. First cited answer the same day \u2014 on whatever device is in your hand.",
  ctaButton: "Request a demo",
};

export const DOWNLOAD: Record<Lang, DownloadContent> = {
  en: _enDownload,
  de: _deDownload,
  at: deepMerge(_deDownload, {
    metaDesc:
      "Installier Subsumio auf iPhone, iPad, Android und Desktop. Eine App, jeder Bildschirm — ohne App Store.",
    h1a: "Dein Brain,",
    h1b: "in deiner Tasche.",
    sub: "Subsumio installiert sich als Vollbild-App auf jedem deiner Geräte — direkt aus dem Browser, ohne App Store, ohne Wartezeit. Ein Konto, jeder Bildschirm. Native Store-Apps sind in Arbeit.",
    platforms: [
      {
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
        tagline: "Chrome bietet dir die Installation an",
        steps: [
          "Öffne subsum.eu in Chrome",
          "Tippe auf „App installieren“ (oder Menü ⋮ → „Zum Startbildschirm“)",
          "Bestätige — Subsumio erscheint im App-Drawer",
          "Startet im Vollbild wie jede native App.",
        ],
      },
      {
        steps: [
          "Öffne subsum.eu in Chrome oder Edge",
          "Klick das Install-Icon in der Adressleiste (⊕ Bildschirm)",
          "Bestätige — Subsumio öffnet im eigenen Fenster",
          "Pinn es ans Dock oder die Taskleiste.",
        ],
      },
    ],
    storesNote:
      "Die Store-Verfügbarkeit folgt auf den Cloud-Launch (Apple verlangt für das Review einen vollständigen Account-Flow). Installier heute die Web-App oben — es ist dasselbe Produkt, dein Konto zieht mit um.",
    faq: [
      {
        a: "Gleiches Produkt, gleiches Konto, gleiche Daten. Die Installation gibt dir ein Vollbild-Fenster, ein Home-Screen-Icon und einen Offline-Fallback. Native Store-Versionen ergänzen Push-Benachrichtigungen und Share-Extensions.",
      },
      {
        a: "Die App-Hülle lädt offline und sagt dir klar, wenn sie dein Brain nicht erreicht. Queries brauchen eine Verbindung — dein Brain lebt auf deinem Server oder deiner EU-Cloud-Instanz, nicht auf dem Handy.",
      },
      {
        a: "Es ist dieselbe gehärtete Web-App: verschlüsselter Transport, httpOnly-Session-Cookies, und deine Daten werden über die Session hinaus nicht auf dem Gerät gespeichert.",
      },
      {},
    ],
    ctaSub:
      "In unter fünf Minuten eingerichtet. Erste belegte Antwort am selben Tag — auf dem Gerät, das gerade in deiner Hand liegt.",
  }),
  ch: deepMerge(_deDownload, {
    metaDesc:
      "Installier Subsumio auf iPhone, iPad, Android und Desktop. Eine App, jeder Bildschirm — ohne App Store.",
    h1a: "Dein Brain,",
    h1b: "in deiner Tasche.",
    sub: "Subsumio installiert sich als Vollbild-App auf jedem deiner Geräte — direkt aus dem Browser, ohne App Store, ohne Wartezeit. Ein Konto, jeder Bildschirm. Native Store-Apps sind in Arbeit.",
    platforms: [
      {
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
        tagline: "Chrome bietet dir die Installation an",
        steps: [
          "Öffne subsum.eu in Chrome",
          "Tippe auf „App installieren“ (oder Menü ⋮ → „Zum Startbildschirm“)",
          "Bestätige — Subsumio erscheint im App-Drawer",
          "Startet im Vollbild wie jede native App.",
        ],
      },
      {
        steps: [
          "Öffne subsum.eu in Chrome oder Edge",
          "Klick das Install-Icon in der Adressleiste (⊕ Bildschirm)",
          "Bestätige — Subsumio öffnet im eigenen Fenster",
          "Pinn es ans Dock oder die Taskleiste.",
        ],
      },
    ],
    storesNote:
      "Die Store-Verfügbarkeit folgt auf den Cloud-Launch (Apple verlangt für das Review einen vollständigen Account-Flow). Installier heute die Web-App oben — es ist dasselbe Produkt, dein Konto zieht mit um.",
    faq: [
      {
        a: "Gleiches Produkt, gleiches Konto, gleiche Daten. Die Installation gibt dir ein Vollbild-Fenster, ein Home-Screen-Icon und einen Offline-Fallback. Native Store-Versionen ergänzen Push-Benachrichtigungen und Share-Extensions.",
      },
      {
        a: "Die App-Hülle lädt offline und sagt dir klar, wenn sie dein Brain nicht erreicht. Queries brauchen eine Verbindung — dein Brain lebt auf deinem Server oder deiner EU-Cloud-Instanz, nicht auf dem Handy.",
      },
      {
        a: "Es ist dieselbe gehärtete Web-App: verschlüsselter Transport, httpOnly-Session-Cookies, und deine Daten werden über die Session hinaus nicht auf dem Gerät gespeichert.",
      },
      {},
    ],
    ctaSub:
      "In unter fünf Minuten eingerichtet. Erste belegte Antwort am selben Tag — auf dem Gerät, das gerade in deiner Hand liegt.",
  }),
  it: applyReplacements(JSON.parse(JSON.stringify(_enDownload)), {
    "Download — Subsumio on every device": "Download — Subsumio su ogni dispositivo",
    "Install Subsumio on iPhone, iPad, Android and desktop. One app, every screen — no app store required.":
      "Installa Subsumio su iPhone, iPad, Android e desktop. Un'app, ogni schermo — senza App Store.",
    "Your brain,": "Il tuo brain,",
    "in your pocket.": "nella tua tasca.",
    "Subsumio installs as a full-screen app on every device you own — straight from the browser, no app store, no waiting. One account, every screen. Native store apps are on the way.":
      "Subsumio si installa come app a schermo intero su ogni tuo dispositivo — direttamente dal browser, senza App Store, senza attese. Un account, ogni schermo. Le app native degli store sono in arrivo.",
    "Install via Safari in 10 seconds": "Installa via Safari in 10 secondi",
    "Chrome offers the install for you": "Chrome offre l'installazione",
    "One click in Chrome or Edge": "Un clic in Chrome o Edge",
    "App Store & Google Play (Beta)": "App Store & Google Play (Beta)",
    "Install questions": "Domande sull'installazione",
    "Install now. Use it in your next hearing.": "Installa ora. Usalo nella prossima udienza.",
    "Request a demo": "Richiedi una demo",
    // Platform
    "Desktop (Mac, Windows, Linux)": "Desktop (Mac, Windows, Linux)",
    "Open subsum.eu in Safari": "Apri subsum.eu in Safari",
    "Tap the Share button (square with arrow)":
      "Tocca il pulsante Condividi (quadrato con freccia)",
    "Tap \u201cAdd to Home Screen\u201d": "Tocca \u201cAggiungi a Home\u201d",
    "Tap \u201cAdd\u201d \u2014 done. Full-screen app with the \u03a3 icon.":
      "Tocca \u201cAggiungi\u201d \u2014 fatto. App a schermo intero con icona \u03a3.",
    "Works on iOS and iPadOS 16.4+. The app runs in standalone mode \u2014 no browser chrome.":
      "Funziona su iOS e iPadOS 16.4+. L'app gira in modalità standalone \u2014 senza barra del browser.",
    "Open subsum.eu in Chrome": "Apri subsum.eu in Chrome",
    "Tap the \u201cInstall app\u201d prompt (or menu \u22ee \u2192 \u201cAdd to Home screen\u201d)":
      "Tocca il prompt \u201cInstalla app\u201d (o menu \u22ee \u2192 \u201cAggiungi a Home\u201d)",
    "Confirm \u2014 Subsumio appears in your app drawer":
      "Conferma \u2014 Subsumio appare nel drawer delle app",
    "Launches full-screen like any native app.":
      "Avvia a schermo intero come qualsiasi app nativa.",
    "Also works in Edge, Samsung Internet and Firefox.":
      "Funziona anche in Edge, Samsung Internet e Firefox.",
    "Open subsum.eu in Chrome or Edge": "Apri subsum.eu in Chrome o Edge",
    "Click the install icon in the address bar (\u2295 screen)":
      "Clicca l'icona di installazione nella barra degli indirizzi (\u2295 schermo)",
    "Confirm \u2014 Subsumio opens in its own window":
      "Conferma \u2014 Subsumio si apre in una finestra propria",
    "Pin it to your Dock or taskbar.": "Aggiungilo al Dock o alla barra delle applicazioni.",
    // Stores
    "Native apps are in preparation \u2014 built on the same codebase via Capacitor, with push notifications, biometric unlock and a \u201cSend to Subsumio\u201d share extension. Currently in beta \u2014 store availability follows the hosted-cloud launch.":
      "Le app native sono in preparazione \u2014 costruite sulla stessa codebase via Capacitor, con notifiche push, sblocco biometrico e share extension \u201cInvia a Subsumio\u201d. Attualmente in beta \u2014 la disponibilità negli store seguirà il lancio del cloud hosted.",
    "Store availability follows the hosted-cloud launch (Apple requires a full account flow for review). Install the web app above today \u2014 it's the same product, and your account carries over.":
      "La disponibilità negli store segue il lancio del cloud hosted (Apple richiede un flusso account completo per la review). Installa oggi la web app qui sopra \u2014 è lo stesso prodotto, e il tuo account si trasferisce.",
    // FAQ
    "Is the installed app different from the website?": "L'app installata è diversa dal sito web?",
    "Same product, same account, same data. The install gives you a full-screen window, a home-screen icon, and an offline fallback. Native store versions will add push notifications and share extensions.":
      "Stesso prodotto, stesso account, stessi dati. L'installazione ti dà una finestra a schermo intero, un'icona nella home e un fallback offline. Le versioni native degli store aggiungeranno notifiche push e share extension.",
    "Does it work offline?": "Funziona offline?",
    "The app shell loads offline and tells you clearly when it can't reach your brain. Queries need a connection \u2014 your brain lives on your server or your EU cloud instance, not on the phone.":
      "Il shell dell'app si carica offline e ti dice chiaramente quando non può raggiungere il tuo brain. Le query richiedono una connessione \u2014 il tuo brain vive sul tuo server o la tua istanza cloud EU, non sul telefono.",
    "Is the mobile app secure?": "L'app mobile è sicura?",
    "It's the same hardened web app: encrypted transport, httpOnly session cookies, and your data never stored on the device beyond the session.":
      "È la stessa web app indurita: trasporto cifrato, cookie di sessione httpOnly, e i tuoi dati mai salvati sul dispositivo oltre la sessione.",
    "When do the store apps arrive?": "Quando arrivano le app degli store?",
    "After the hosted cloud is live \u2014 Apple's review requires a complete signup flow. The Capacitor build setup is already in the repository (mobile/README.md).":
      "Dopo che il cloud hosted è live \u2014 la review di Apple richiede un flusso di signup completo. Il setup di build Capacitor è già nel repository (mobile/README.md).",
    // CTA
    "Set up in under five minutes. First cited answer the same day \u2014 on whatever device is in your hand.":
      "Configurato in meno di cinque minuti. Prima risposta citata lo stesso giorno \u2014 su qualsiasi dispositivo tu abbia in mano.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enDownload)), {
    "Download — Subsumio on every device": "Descargar — Subsumio en cada dispositivo",
    "Install Subsumio on iPhone, iPad, Android and desktop. One app, every screen — no app store required.":
      "Instala Subsumio en iPhone, iPad, Android y escritorio. Una app, cada pantalla — sin App Store.",
    "Your brain,": "Tu cerebro,",
    "in your pocket.": "en tu bolsillo.",
    "Subsumio installs as a full-screen app on every device you own — straight from the browser, no app store, no waiting. One account, every screen. Native store apps are on the way.":
      "Subsumio se instala como app a pantalla completa en cada dispositivo — directamente desde el navegador, sin App Store, sin esperas. Una cuenta, cada pantalla. Las apps nativas de las tiendas están en camino.",
    "Install via Safari in 10 seconds": "Instala vía Safari en 10 segundos",
    "Chrome offers the install for you": "Chrome ofrece la instalación",
    "One click in Chrome or Edge": "Un clic en Chrome o Edge",
    "Install questions": "Preguntas de instalación",
    "Install now. Use it in your next hearing.": "Instala ahora. Úsalo en tu próxima audiencia.",
    "Request a demo": "Solicitar una demo",
    // Platform
    "Desktop (Mac, Windows, Linux)": "Escritorio (Mac, Windows, Linux)",
    "Open subsum.eu in Safari": "Abre subsum.eu en Safari",
    "Tap the Share button (square with arrow)": "Toca el botón Compartir (cuadrado con flecha)",
    "Tap \u201cAdd to Home Screen\u201d": "Toca \u201cAñadir a pantalla de inicio\u201d",
    "Tap \u201cAdd\u201d \u2014 done. Full-screen app with the \u03a3 icon.":
      "Toca \u201cAñadir\u201d \u2014 listo. App a pantalla completa con icono \u03a3.",
    "Works on iOS and iPadOS 16.4+. The app runs in standalone mode \u2014 no browser chrome.":
      "Funciona en iOS y iPadOS 16.4+. La app funciona en modo standalone \u2014 sin barra del navegador.",
    "Open subsum.eu in Chrome": "Abre subsum.eu en Chrome",
    "Tap the \u201cInstall app\u201d prompt (or menu \u22ee \u2192 \u201cAdd to Home screen\u201d)":
      "Toca el prompt \u201cInstalar app\u201d (o menú \u22ee \u2192 \u201cAñadir a pantalla de inicio\u201d)",
    "Confirm \u2014 Subsumio appears in your app drawer":
      "Confirma \u2014 Subsumio aparece en tu drawer de apps",
    "Launches full-screen like any native app.":
      "Se inicia a pantalla completa como cualquier app nativa.",
    "Also works in Edge, Samsung Internet and Firefox.":
      "También funciona en Edge, Samsung Internet y Firefox.",
    "Open subsum.eu in Chrome or Edge": "Abre subsum.eu en Chrome o Edge",
    "Click the install icon in the address bar (\u2295 screen)":
      "Haz clic en el icono de instalación en la barra de direcciones (\u2295 pantalla)",
    "Confirm \u2014 Subsumio opens in its own window":
      "Confirma \u2014 Subsumio se abre en su propia ventana",
    "Pin it to your Dock or taskbar.": "Fíjalo al Dock o a la barra de tareas.",
    // Stores
    "Native apps are in preparation \u2014 built on the same codebase via Capacitor, with push notifications, biometric unlock and a \u201cSend to Subsumio\u201d share extension. Currently in beta \u2014 store availability follows the hosted-cloud launch.":
      "Las apps nativas están en preparación \u2014 construidas en la misma codebase vía Capacitor, con notificaciones push, desbloqueo biométrico y share extension \u201cEnviar a Subsumio\u201d. Actualmente en beta \u2014 la disponibilidad en stores sigue al lanzamiento del cloud hosted.",
    "Store availability follows the hosted-cloud launch (Apple requires a full account flow for review). Install the web app above today \u2014 it's the same product, and your account carries over.":
      "La disponibilidad en stores sigue al lanzamiento del cloud hosted (Apple requiere un flujo de cuenta completo para la review). Instala hoy la web app de arriba \u2014 es el mismo producto, y tu cuenta se transfiere.",
    // FAQ
    "Is the installed app different from the website?":
      "¿La app instalada es diferente del sitio web?",
    "Same product, same account, same data. The install gives you a full-screen window, a home-screen icon, and an offline fallback. Native store versions will add push notifications and share extensions.":
      "Mismo producto, misma cuenta, mismos datos. La instalación te da una ventana a pantalla completa, un icono en la pantalla de inicio y un fallback offline. Las versiones nativas de store añadirán notificaciones push y share extensions.",
    "Does it work offline?": "¿Funciona offline?",
    "The app shell loads offline and tells you clearly when it can't reach your brain. Queries need a connection \u2014 your brain lives on your server or your EU cloud instance, not on the phone.":
      "El shell de la app se carga offline y te dice claramente cuando no puede alcanzar tu brain. Las queries necesitan conexión \u2014 tu brain vive en tu servidor o tu instancia cloud EU, no en el teléfono.",
    "Is the mobile app secure?": "¿Es segura la app móvil?",
    "It's the same hardened web app: encrypted transport, httpOnly session cookies, and your data never stored on the device beyond the session.":
      "Es la misma web app endurecida: transporte cifrado, cookies de sesión httpOnly, y tus datos nunca almacenados en el dispositivo más allá de la sesión.",
    "When do the store apps arrive?": "¿Cuándo llegan las apps de store?",
    "After the hosted cloud is live \u2014 Apple's review requires a complete signup flow. The Capacitor build setup is already in the repository (mobile/README.md).":
      "Después de que el cloud hosted esté live \u2014 la review de Apple requiere un flujo de signup completo. El setup de build Capacitor ya está en el repositorio (mobile/README.md).",
    // CTA
    "Set up in under five minutes. First cited answer the same day \u2014 on whatever device is in your hand.":
      "Configurado en menos de cinco minutos. Primera respuesta citada el mismo día \u2014 en cualquier dispositivo que tengas en la mano.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enDownload)), {
    "Download — Subsumio on every device": "Pobierz — Subsumio na każdym urządzeniu",
    "Install Subsumio on iPhone, iPad, Android and desktop. One app, every screen — no app store required.":
      "Zainstaluj Subsumio na iPhone, iPad, Android i desktop. Jedna aplikacja, każdy ekran — bez App Store.",
    "Your brain,": "Twój brain,",
    "in your pocket.": "w twojej kieszeni.",
    "Subsumio installs as a full-screen app on every device you own — straight from the browser, no app store, no waiting. One account, every screen. Native store apps are on the way.":
      "Subsumio instaluje się jako aplikacja pełnoekranowa na każdym twoim urządzeniu — bezpośrednio z przeglądarki, bez App Store, bez czekania. Jedno konto, każdy ekran. Aplikacje natywne ze sklepów są w drodze.",
    "Install via Safari in 10 seconds": "Zainstaluj przez Safari w 10 sekund",
    "Chrome offers the install for you": "Chrome oferuje instalację",
    "One click in Chrome or Edge": "Jedno kliknięcie w Chrome lub Edge",
    "Install questions": "Pytania o instalację",
    "Install now. Use it in your next hearing.": "Zainstaluj teraz. Użyj na najbliższej rozprawie.",
    "Request a demo": "Zamów demo",
    // Platform
    "Desktop (Mac, Windows, Linux)": "Desktop (Mac, Windows, Linux)",
    "Open subsum.eu in Safari": "Otwórz subsum.eu w Safari",
    "Tap the Share button (square with arrow)": "Stuknij przycisk Udostępnij (kwadrat ze strzałką)",
    "Tap \u201cAdd to Home Screen\u201d": "Stuknij \u201cDodaj do ekranu głównego\u201d",
    "Tap \u201cAdd\u201d \u2014 done. Full-screen app with the \u03a3 icon.":
      "Stuknij \u201cDodaj\u201d \u2014 gotowe. App pełnoekranowa z ikoną \u03a3.",
    "Works on iOS and iPadOS 16.4+. The app runs in standalone mode \u2014 no browser chrome.":
      "Działa na iOS i iPadOS 16.4+. App działa w trybie standalone \u2014 bez paska przeglądarki.",
    "Open subsum.eu in Chrome": "Otwórz subsum.eu w Chrome",
    "Tap the \u201cInstall app\u201d prompt (or menu \u22ee \u2192 \u201cAdd to Home screen\u201d)":
      "Stuknij prompt \u201cZainstaluj app\u201d (lub menu \u22ee \u2192 \u201cDodaj do ekranu głównego\u201d)",
    "Confirm \u2014 Subsumio appears in your app drawer":
      "Potwierdź \u2014 Subsumio pojawia się w drawerze app",
    "Launches full-screen like any native app.":
      "Uruchamia się pełnoekranowo jak każda natywna app.",
    "Also works in Edge, Samsung Internet and Firefox.":
      "Działa też w Edge, Samsung Internet i Firefox.",
    "Open subsum.eu in Chrome or Edge": "Otwórz subsum.eu w Chrome lub Edge",
    "Click the install icon in the address bar (\u2295 screen)":
      "Kliknij ikonę instalacji w pasku adresu (\u2295 ekran)",
    "Confirm \u2014 Subsumio opens in its own window":
      "Potwierdź \u2014 Subsumio otwiera się we własnym oknie",
    "Pin it to your Dock or taskbar.": "Przypnij do Docka lub paska zadań.",
    // Stores
    "Native apps are in preparation \u2014 built on the same codebase via Capacitor, with push notifications, biometric unlock and a \u201cSend to Subsumio\u201d share extension. Currently in beta \u2014 store availability follows the hosted-cloud launch.":
      "Aplikacje natywne są w przygotowaniu \u2014 zbudowane na tej samej codebase via Capacitor, z powiadomieniami push, odblokowaniem biometrycznym i share extension \u201cWyślij do Subsumio\u201d. Obecnie w beta \u2014 dostępność w store'ach nastąpi po launchu chmury hosted.",
    "Store availability follows the hosted-cloud launch (Apple requires a full account flow for review). Install the web app above today \u2014 it's the same product, and your account carries over.":
      "Dostępność w store'ach nastąpi po launchu chmury hosted (Apple wymaga pełnego flow konta do review). Zainstaluj dziś web app powyżej \u2014 to ten sam produkt, a twoje konto się przenosi.",
    // FAQ
    "Is the installed app different from the website?":
      "Czy zainstalowana app różni się od strony web?",
    "Same product, same account, same data. The install gives you a full-screen window, a home-screen icon, and an offline fallback. Native store versions will add push notifications and share extensions.":
      "Ten sam produkt, to samo konto, te same dane. Instalacja daje ci okno pełnoekranowe, ikonę na ekranie głównym i fallback offline. Natywne wersje store dodadzą powiadomienia push i share extension.",
    "Does it work offline?": "Czy działa offline?",
    "The app shell loads offline and tells you clearly when it can't reach your brain. Queries need a connection \u2014 your brain lives on your server or your EU cloud instance, not on the phone.":
      "Shell app ładuje się offline i mówi ci jasno, kiedy nie może dotrzeć do twojego brain. Query potrzebują połączenia \u2014 twój brain żyje na twoim serwerze lub instancji cloud EU, nie na telefonie.",
    "Is the mobile app secure?": "Czy app mobile jest bezpieczna?",
    "It's the same hardened web app: encrypted transport, httpOnly session cookies, and your data never stored on the device beyond the session.":
      "To ta sama zahardened web app: szyfrowany transport, ciasteczka sesyjne httpOnly, a twoje dane nigdy nie są zapisywane na urządzeniu poza sesją.",
    "When do the store apps arrive?": "Kiedy przyjdą app ze store?",
    "After the hosted cloud is live \u2014 Apple's review requires a complete signup flow. The Capacitor build setup is already in the repository (mobile/README.md).":
      "Po tym jak chmura hosted będzie live \u2014 review Apple wymaga pełnego flow signup. Setup build Capacitor jest już w repozytorium (mobile/README.md).",
    // CTA
    "Set up in under five minutes. First cited answer the same day \u2014 on whatever device is in your hand.":
      "Skonfiguruj w mniej niż pięć minut. Pierwsza odpowiedź z cytatem tego samego dnia \u2014 na jakimkolwiek urządzeniu masz w ręce.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enDownload)), {
    "Download — Subsumio on every device": "Télécharger — Subsumio sur chaque appareil",
    "Install Subsumio on iPhone, iPad, Android and desktop. One app, every screen — no app store required.":
      "Installez Subsumio sur iPhone, iPad, Android et ordinateur. Une app, chaque écran — sans App Store.",
    "Your brain,": "Votre brain,",
    "in your pocket.": "dans votre poche.",
    "Subsumio installs as a full-screen app on every device you own — straight from the browser, no app store, no waiting. One account, every screen. Native store apps are on the way.":
      "Subsumio s'installe comme application plein écran sur chacun de vos appareils — directement depuis le navigateur, sans App Store, sans attente. Un compte, chaque écran. Les applications natives des stores sont en préparation.",
    "Install via Safari in 10 seconds": "Installation via Safari en 10 secondes",
    "Chrome offers the install for you": "Chrome propose l'installation",
    "One click in Chrome or Edge": "Un clic dans Chrome ou Edge",
    "Install questions": "Questions d'installation",
    "Install now. Use it in your next hearing.":
      "Installez maintenant. Utilisez-le à votre prochaine audience.",
    "Request a demo": "Demander une démo",
    // Platform
    "Desktop (Mac, Windows, Linux)": "Desktop (Mac, Windows, Linux)",
    "Open subsum.eu in Safari": "Ouvrez subsum.eu dans Safari",
    "Tap the Share button (square with arrow)": "Touchez le bouton Partager (carré avec flèche)",
    "Tap \u201cAdd to Home Screen\u201d": "Touchez \u201cAjouter à l'écran d'accueil\u201d",
    "Tap \u201cAdd\u201d \u2014 done. Full-screen app with the \u03a3 icon.":
      "Touchez \u201cAjouter\u201d \u2014 terminé. App plein écran avec icône \u03a3.",
    "Works on iOS and iPadOS 16.4+. The app runs in standalone mode \u2014 no browser chrome.":
      "Fonctionne sur iOS et iPadOS 16.4+. L'app fonctionne en mode standalone \u2014 sans barre du navigateur.",
    "Open subsum.eu in Chrome": "Ouvrez subsum.eu dans Chrome",
    "Tap the \u201cInstall app\u201d prompt (or menu \u22ee \u2192 \u201cAdd to Home screen\u201d)":
      "Touchez le prompt \u201cInstaller l'app\u201d (ou menu \u22ee \u2192 \u201cAjouter à l'écran d'accueil\u201d)",
    "Confirm \u2014 Subsumio appears in your app drawer":
      "Confirmez \u2014 Subsumio apparaît dans votre drawer d'apps",
    "Launches full-screen like any native app.": "Se lance en plein écran comme toute app native.",
    "Also works in Edge, Samsung Internet and Firefox.":
      "Fonctionne aussi dans Edge, Samsung Internet et Firefox.",
    "Open subsum.eu in Chrome or Edge": "Ouvrez subsum.eu dans Chrome ou Edge",
    "Click the install icon in the address bar (\u2295 screen)":
      "Cliquez sur l'icône d'installation dans la barre d'adresse (\u2295 écran)",
    "Confirm \u2014 Subsumio opens in its own window":
      "Confirmez \u2014 Subsumio s'ouvre dans sa propre fenêtre",
    "Pin it to your Dock or taskbar.": "Épinglez-le au Dock ou à la barre des tâches.",
    // Stores
    "Native apps are in preparation \u2014 built on the same codebase via Capacitor, with push notifications, biometric unlock and a \u201cSend to Subsumio\u201d share extension. Currently in beta \u2014 store availability follows the hosted-cloud launch.":
      "Les apps natives sont en préparation \u2014 construites sur la même codebase via Capacitor, avec notifications push, déverrouillage biométrique et share extension \u201cEnvoyer à Subsumio\u201d. Actuellement en beta \u2014 la disponibilité en store suit le lancement du cloud hosted.",
    "Store availability follows the hosted-cloud launch (Apple requires a full account flow for review). Install the web app above today \u2014 it's the same product, and your account carries over.":
      "La disponibilité en store suit le lancement du cloud hosted (Apple requiert un flux de compte complet pour la review). Installez la web app ci-dessus aujourd'hui \u2014 c'est le même produit, et votre compte est transféré.",
    // FAQ
    "Is the installed app different from the website?":
      "L'app installée est-elle différente du site web?",
    "Same product, same account, same data. The install gives you a full-screen window, a home-screen icon, and an offline fallback. Native store versions will add push notifications and share extensions.":
      "Même produit, même compte, mêmes données. L'installation vous donne une fenêtre plein écran, une icône sur l'écran d'accueil et un fallback offline. Les versions natives de store ajouteront des notifications push et des share extensions.",
    "Does it work offline?": "Ça fonctionne offline?",
    "The app shell loads offline and tells you clearly when it can't reach your brain. Queries need a connection \u2014 your brain lives on your server or your EU cloud instance, not on the phone.":
      "Le shell de l'app se charge offline et vous dit clairement quand il ne peut pas atteindre votre brain. Les query nécessitent une connexion \u2014 votre brain vit sur votre serveur ou votre instance cloud EU, pas sur le téléphone.",
    "Is the mobile app secure?": "L'app mobile est-elle sécurisée?",
    "It's the same hardened web app: encrypted transport, httpOnly session cookies, and your data never stored on the device beyond the session.":
      "C'est la même web app durcie: transport chiffré, cookies de session httpOnly, et vos données jamais stockées sur l'appareil au-delà de la session.",
    "When do the store apps arrive?": "Quand les apps de store arrivent-elles?",
    "After the hosted cloud is live \u2014 Apple's review requires a complete signup flow. The Capacitor build setup is already in the repository (mobile/README.md).":
      "Après que le cloud hosted soit live \u2014 la review d'Apple requiert un flux de signup complet. Le setup de build Capacitor est déjà dans le repository (mobile/README.md).",
    // CTA
    "Set up in under five minutes. First cited answer the same day \u2014 on whatever device is in your hand.":
      "Configuré en moins de cinq minutes. Première réponse citée le même jour \u2014 sur n'importe quel appareil dans votre main.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enDownload)), {
    "Download — Subsumio on every device": "Download — Subsumio op elk apparaat",
    "Install Subsumio on iPhone, iPad, Android and desktop. One app, every screen — no app store required.":
      "Installeer Subsumio op iPhone, iPad, Android en desktop. Één app, elk scherm — zonder App Store.",
    "Your brain,": "Je brain,",
    "in your pocket.": "in je broekzak.",
    "Subsumio installs as a full-screen app on every device you own — straight from the browser, no app store, no waiting. One account, every screen. Native store apps are on the way.":
      "Subsumio installeert als full-screen app op elk apparaat — direct vanuit de browser, zonder App Store, zonder wachten. Eén account, elk scherm. Native store-apps zijn onderweg.",
    "Install via Safari in 10 seconds": "Installeer via Safari in 10 seconden",
    "Chrome offers the install for you": "Chrome biedt de installatie aan",
    "One click in Chrome or Edge": "Eén klik in Chrome of Edge",
    "Install questions": "Installatievragen",
    "Install now. Use it in your next hearing.":
      "Installeer nu. Gebruik het bij je volgende zitting.",
    "Request a demo": "Vraag een demo aan",
    // Platform
    "Desktop (Mac, Windows, Linux)": "Desktop (Mac, Windows, Linux)",
    "Open subsum.eu in Safari": "Open subsum.eu in Safari",
    "Tap the Share button (square with arrow)": "Tik op de Deel-knop (vierkant met pijl)",
    "Tap \u201cAdd to Home Screen\u201d": "Tik op \u201cVoeg toe aan beginscherm\u201d",
    "Tap \u201cAdd\u201d \u2014 done. Full-screen app with the \u03a3 icon.":
      "Tik op \u201cToevoegen\u201d \u2014 klaar. Full-screen app met \u03a3-icoon.",
    "Works on iOS and iPadOS 16.4+. The app runs in standalone mode \u2014 no browser chrome.":
      "Werkt op iOS en iPadOS 16.4+. De app draait in standalone modus \u2014 zonder browserbalk.",
    "Open subsum.eu in Chrome": "Open subsum.eu in Chrome",
    "Tap the \u201cInstall app\u201d prompt (or menu \u22ee \u2192 \u201cAdd to Home screen\u201d)":
      "Tik op de \u201cInstalleer app\u201d-prompt (of menu \u22ee \u2192 \u201cToevoegen aan beginscherm\u201d)",
    "Confirm \u2014 Subsumio appears in your app drawer":
      "Bevestig \u2014 Subsumio verschijnt in je app-drawer",
    "Launches full-screen like any native app.": "Start full-screen zoals elke native app.",
    "Also works in Edge, Samsung Internet and Firefox.":
      "Werkt ook in Edge, Samsung Internet en Firefox.",
    "Open subsum.eu in Chrome or Edge": "Open subsum.eu in Chrome of Edge",
    "Click the install icon in the address bar (\u2295 screen)":
      "Klik op het installatie-icoon in de adresbalk (\u2295 scherm)",
    "Confirm \u2014 Subsumio opens in its own window":
      "Bevestig \u2014 Subsumio opent in een eigen venster",
    "Pin it to your Dock or taskbar.": "Pin het aan je Dock of taakbalk.",
    // Stores
    "Native apps are in preparation \u2014 built on the same codebase via Capacitor, with push notifications, biometric unlock and a \u201cSend to Subsumio\u201d share extension. Currently in beta \u2014 store availability follows the hosted-cloud launch.":
      "Native apps zijn in voorbereiding \u2014 gebouwd op dezelfde codebase via Capacitor, met push-notificaties, biometrische ontgrendeling en een \u201cStuur naar Subsumio\u201d share-extension. Momenteel in beta \u2014 store-beschikbaarheid volgt na de hosted-cloud launch.",
    "Store availability follows the hosted-cloud launch (Apple requires a full account flow for review). Install the web app above today \u2014 it's the same product, and your account carries over.":
      "Store-beschikbaarheid volgt na de hosted-cloud launch (Apple vereist een volledig account-flow voor review). Installeer vandaag de web-app hierboven \u2014 het is hetzelfde product, en je account wordt overgezet.",
    // FAQ
    "Is the installed app different from the website?":
      "Is de geïnstalleerde app anders dan de website?",
    "Same product, same account, same data. The install gives you a full-screen window, a home-screen icon, and an offline fallback. Native store versions will add push notifications and share extensions.":
      "Zelfde product, zelfde account, zelfde data. De installatie geeft je een full-screen venster, een icoon op het beginscherm en een offline-fallback. Native store-versies zullen push-notificaties en share-extensions toevoegen.",
    "Does it work offline?": "Werkt het offline?",
    "The app shell loads offline and tells you clearly when it can't reach your brain. Queries need a connection \u2014 your brain lives on your server or your EU cloud instance, not on the phone.":
      "De app-shell laadt offline en zegt je duidelijk wanneer hij je brain niet kan bereiken. Queries hebben verbinding nodig \u2014 je brain leeft op je server of je EU-cloud-instantie, niet op de telefoon.",
    "Is the mobile app secure?": "Is de mobiele app veilig?",
    "It's the same hardened web app: encrypted transport, httpOnly session cookies, and your data never stored on the device beyond the session.":
      "Het is dezelfde verharde web-app: versleuteld transport, httpOnly-sessiecookies, en je data nooit opgeslagen op het apparaat buiten de sessie.",
    "When do the store apps arrive?": "Wanneer komen de store-apps?",
    "After the hosted cloud is live \u2014 Apple's review requires a complete signup flow. The Capacitor build setup is already in the repository (mobile/README.md).":
      "Nadat de hosted cloud live is \u2014 Apple's review vereist een volledig signup-flow. De Capacitor build-setup staat al in de repository (mobile/README.md).",
    // CTA
    "Set up in under five minutes. First cited answer the same day \u2014 on whatever device is in your hand.":
      "Ingesteld in minder dan vijf minuten. Eerste geciteerde antwoord dezelfde dag \u2014 op welk apparaat je ook in je hand hebt.",
  }),
};
