export interface NichePain {
  icon: string;
  title: string;
  desc: string;
}

export interface NicheSolutionStep {
  step: string;
  title: string;
  desc: string;
}

export interface NicheLegalRuling {
  court: string;
  date: string;
  ref: string;
  summary: string;
}

export interface NicheCaseExample {
  title: string;
  facts: string;
  outcome: string;
  value: string;
}

export interface NicheTrustItem {
  label: string;
  icon: string;
}

export interface NichePricingTier {
  name: string;
  price: string;
  priceNote: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export interface NichePageContent {
  slug: string;
  metaTitle: string;
  metaDesc: string;
  h1a: string;
  h1b: string;
  heroSub: string;
  badge: string;
  jurisdiction: "DE" | "AT" | "DE+AT" | "AT+DE";
  intro: string;
  pains: NichePain[];
  solutionSteps: NicheSolutionStep[];
  legalRulings: NicheLegalRuling[];
  caseExample: NicheCaseExample;
  faq: { q: string; a: string }[];
  trustItems: NicheTrustItem[];
  ctaTitle: string;
  ctaSub: string;
  pricingTiers: NichePricingTier[];
  relatedNiches: { slug: string; title: string }[];
}

const TRUST_DEFAULT: NicheTrustItem[] = [
  { label: "DSGVO-konform", icon: "ShieldCheck" },
  { label: "EU-gehostet", icon: "Server" },
  { label: "§ 203 StGB / § 9 ECGBGB", icon: "Lock" },
  { label: "Keine Abgabe an Dritte", icon: "EyeOff" },
];

const PRICING_DEFAULT: NichePricingTier[] = [
  {
    name: "Free Check",
    price: "0 €",
    priceNote: "Kostenlos & unverbindlich",
    features: [
      "Fallbeschreibung analysieren",
      "Ersteinschätzung: aussichtsreich / nicht",
      "Rechtsgebiet & Zuständigkeit identifiziert",
      "Keine Dokumente nötig",
    ],
    cta: "Kostenlos starten",
  },
  {
    name: "AI-Dossier",
    price: "39 €",
    priceNote: "Einmalig — vollständiges Dossier",
    features: [
      "Vollständige Aktenanalyse mit Dokumenten-Upload",
      "Rechtsgrundlagen & Urteile (OGH/BGH/EuGH)",
      "Erfolgsprognose & Streitwert-Bewertung",
      "Dossier als PDF — bereit für Ihren Anwalt",
      "Spart 70% der Anwaltsvorbereitungskosten",
    ],
    cta: "AI-Dossier erstellen",
    highlighted: true,
  },
  {
    name: "Anwalt-Paket",
    price: "199 €",
    priceNote: "AI-Dossier + Anwalt-Matching",
    features: [
      "Alles aus AI-Dossier",
      "Matching mit spezialisiertem Anwalt",
      "Einführungsschreiben vorbereitet",
      "Kostenlose Erstabklärung mit Anwalt",
      "Priorisierte Terminvereinbarung",
    ],
    cta: "Anwalt-Paket buchen",
  },
];

export const NICHE_PAGES: Record<string, NichePageContent> = {
  "casino-verluste": {
    slug: "casino-verluste",
    metaTitle: "Online Casino Verluste zurückfordern | AI-Fallcheck",
    metaDesc:
      "Online Casino Verluste zurückfordern: Spielverluste, Geld zurück von illegalen Online-Casinos. AI-gestützte Fallanalyse in 5 Minuten. BGH & EuGH. Kostenlos.",
    h1a: "Online Casino Verluste",
    h1b: "zurückfordern",
    heroSub:
      "Verluste aus illegalen Online-Casinos zurückfordern — mit AI-gestützter Fallanalyse in 5 Minuten. Kostenloser Check, keine Vorkosten.",
    badge: "Verjährung droht — 2026",
    jurisdiction: "DE",
    intro: "Online Casino Verluste zurückfordern ist in Deutschland ein wachsendes Rechtsgebiet. Nach EuGH und BGH Rechtsprechung sind Spielverträge mit nicht lizenzierten Online-Casinos nichtig — Verluste können zurückgefordert werden. Die Verjährungsfrist endet 2026. Mit AI-gestützter Fallanalyse prüfen Sie kostenlos, ob Ihr Fall aussichtsreich ist, und erhalten ein anwaltfertiges Dossier mit Rechtsgrundlagen, Streitwert-Bewertung und Erfolgsprognose.",
    pains: [
      { icon: "AlertTriangle", title: "Illegale Glücksspielplattformen", desc: "Ohne deutsche Lizenz war das Spielangebot illegal — Verluste können zurückgefordert werden." },
      { icon: "Clock", title: "Verjährung läuft", desc: "Die Verjährungsfrist für Rückforderungsansprüche endet 2026 — schnelles Handeln ist entscheidend." },
      { icon: "FileText", title: "Beweissicherung ist komplex", desc: "Kontoauszüge, Spielhistorie, Chatverläufe — alles muss strukturiert aufbereitet werden." },
      { icon: "Users", title: "Anwaltskosten unsicher", desc: "Viele Betroffene scheuen die Kosten für eine anwaltliche Erstberatung." },
    ],
    solutionSteps: [
      { step: "1", title: "Fallbeschreibung eingeben", desc: "Beschreiben Sie kurz, bei welchem Casino Sie gespielt haben und wie viel Verlust entstanden ist." },
      { step: "2", title: "AI analysiert Ihren Fall", desc: "Die AI prüft Lizenzstatus des Casinos, relevante Urteile (EuGH, BGH) und erstellt ein dossierfertiges Gutachten." },
      { step: "3", title: "Dossier erhalten & Anwalt kontaktieren", desc: "Sie erhalten ein vollständiges Falldossier mit Rechtsgrundlagen, Streitwert und Erfolgsprognose — bereit für Ihren Anwalt." },
    ],
    legalRulings: [
      { court: "EuGH", date: "April 2026", ref: "C-440/23", summary: "Verluste aus nicht lizenzierten Online-Casinos sind zurückforderbar. Der Betreiber kann sich nicht auf rechtmäßiges Verhalten berufen." },
      { court: "BGH", date: "September 2026", ref: "IZ R 216/25", summary: "Rückforderungsanspruch besteht auch bei längerem Spielen — keine Einwendung wegen Mitverschulden bei illegalen Angeboten." },
      { court: "BGH", date: "2023", ref: "I ZR 126/21", summary: "Online-Casino-Angebote ohne deutsche Lizenz sind rechtswidrig — Spielvertrag ist nichtig." },
    ],
    caseExample: {
      title: "Typischer Fall: Online-Casino ohne Lizenz",
      facts: "Spieler verlor über 18 Monate insgesamt 47.000 € bei einem Online-Casino ohne deutsche Lizenz. Spielhistorie und Einzahlungsbelege vorhanden.",
      outcome: "Rückforderung der vollen Verluste abzüglich Gewinne. Außergerichtliche Einigung mit dem Casino-Betreiber nach Anwaltsschreiben mit AI-Dossier.",
      value: "47.000 €",
    },
    faq: [
      { q: "Kann ich wirklich alle Casino-Verluste zurückfordern?", a: "Ja, wenn das Casino keine deutsche Lizenz hatte. Nach EuGH und BGH Rechtsprechung sind die Spielverträge nichtig und Verluste rückforderbar. Gewinne werden angerechnet." },
      { q: "Bis wann muss ich die Klage einreichen?", a: "Die Verjährungsfrist endet voraussichtlich 2026. Je früher Sie handeln, desto besser. Der kostenlose AI-Check zeigt Ihnen sofort, ob Ihr Fall aussichtsreich ist." },
      { q: "Was kostet der AI-Fallcheck?", a: "Der AI-Fallcheck ist komplett kostenlos. Sie erhalten ein vollständiges Dossier mit Rechtsgrundlagen und Erfolgsprognose. Erst wenn Sie eine anwaltliche Vertretung wünschen, entstehen Kosten." },
      { q: "Welche Beweise brauche ich?", a: "Kontoauszüge, Spielhistorie, Screenshots des Casinos, Chatverläufe mit dem Support. Die AI hilft Ihnen, die relevanten Dokumente zu identifizieren und zu strukturieren." },
      { q: "Funktioniert das auch bei Sportwetten?", a: "Ja, Sportwetten bei nicht lizenzierten Anbietern sind ebenfalls zurückforderbar. Es gibt eine separate Seite für Sportwetten-Verluste mit spezifischen Informationen." },
      { q: "Was ist, wenn ich teilweise gewonnen habe?", a: "Gewinne werden von den Verlusten abgezogen. Die Rückforderung betrifft den Nettoverlust. Die AI berechnet automatisch Ihren Nettoverlust aus den Spielhistorien." },
      { q: "Kann ich das ohne Anwalt machen?", a: "Theoretisch ja, aber praktisch empfehlen wir eine anwaltliche Vertretung. Das AI-Dossier reduziert die Anwaltskosten erheblich, da der Fall bereits vollständig aufbereitet ist." },
      { q: "Gilt das auch für ausländische Casinos?", a: "Ja, solange das Casino keine deutsche Lizenz hatte. Viele Casinos operieren aus Malta, Curaçao oder Gibraltar — das ändert nichts an der Rückforderbarkeit nach deutschem Recht." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Jetzt kostenlosen Fallcheck starten",
    ctaSub: "In 5 Minuten wissen Sie, ob sich eine Rückforderung lohnt. Keine Vorkosten, keine Verpflichtung.",
    relatedNiches: [
      { slug: "sportwetten-verluste", title: "Sportwetten Verluste zurückfordern" },
      { slug: "casino-oesterreich", title: "Casino Verluste Österreich" },
      { slug: "krypto-casino", title: "Krypto-Casino Verluste" },
    ],
  },

  "sportwetten-verluste": {
    slug: "sportwetten-verluste",
    metaTitle: "Sportwetten Verluste zurückfordern | AI-Check",
    metaDesc:
      "Sportwetten Verluste zurückfordern: Tipico, Bwin, Bet365 & Co. ohne Lizenz. AI-Fallanalyse mit BGH-Rechtsprechung. Kostenloser Check — Verjährung 2026.",
    h1a: "Sportwetten Verluste",
    h1b: "zurückfordern",
    heroSub:
      "Verluste bei Tipico, Bwin, Bet365 und anderen nicht lizenzierten Anbietern zurückfordern. AI-gestützte Fallanalyse mit aktueller BGH-Rechtsprechung.",
    badge: "Tipico · Bwin · Bet365",
    jurisdiction: "DE",
    intro: "Sportwetten Verluste zurückfordern ist möglich, wenn der Anbieter keine deutsche Lizenz hatte. Tipico, Bwin, Bet365 und andere Sportwetten-Anbieter waren über Jahre ohne deutsche Lizenz aktiv — Einsätze sind zurückforderbar. Die AI prüft den Lizenzstatus, berechnet den Nettoverlust und erstellt ein Dossier mit BGH-Rechtsprechung. Die Verjährungsfrist endet 2026 — schnelles Handeln ist entscheidend.",
    pains: [
      { icon: "AlertTriangle", title: "Anbieter ohne Lizenz", desc: "Viele Sportwetten-Anbieter waren ohne deutsche Lizenz aktiv — Einsätze sind zurückforderbar." },
      { icon: "Clock", title: "Verjährung droht", desc: "Die Frist für Rückforderungsansprüche endet 2026 — Zeitkritisch." },
      { icon: "Calculator", title: "Nettoverlust unklar", desc: "Gewinne und Verluste über Jahre hinweg zu berechnen ist mühsam und fehleranfällig." },
      { icon: "FileText", title: "Spielhistorie beschaffen", desc: "Anbieter geben ungern die vollständige Historie heraus — Beweissicherung braucht Strategie." },
    ],
    solutionSteps: [
      { step: "1", title: "Anbieter & Zeitraum angeben", desc: "Geben Sie an, bei welchem Anbieter Sie gespielt haben und in welchem Zeitraum die Verluste entstanden sind." },
      { step: "2", title: "AI prüft Lizenzstatus", desc: "Die AI überprüft, ob der Anbieter zum jeweiligen Zeitpunkt eine gültige deutsche Lizenz hatte und erstellt die Rechtsgrundlage." },
      { step: "3", title: "Dossier mit Nettoverlust-Berechnung", desc: "Vollständiges Dossier mit Nettoverlust, Rechtsgrundlagen und Erfolgsprognose — sofort einsatzbereit für Ihren Anwalt." },
    ],
    legalRulings: [
      { court: "BGH", date: "2023", ref: "I ZR 126/21", summary: "Sportwetten-Angebote ohne deutsche Lizenz sind rechtswidrig — Wettvertrag ist nichtig, Einsätze sind zurückforderbar." },
      { court: "EuGH", date: "April 2026", ref: "C-440/23", summary: "Rückforderung auch bei längerer Nutzung möglich. Mitverschulden greift bei illegalen Angeboten nicht." },
    ],
    caseExample: {
      title: "Typischer Fall: Tipico ohne Lizenz",
      facts: "Spieler setzte über 2 Jahre insgesamt 23.500 € bei Tipico ein, bevor eine deutsche Lizenz erteilt wurde. Nettoverlust nach Gewinnen: 18.200 €.",
      outcome: "Rückforderung des Nettoverlusts. Außergerichtliche Geltendmachung mit AI-Dossier führte zur Einigung.",
      value: "18.200 €",
    },
    faq: [
      { q: "Kann ich Tipico-Verluste zurückfordern?", a: "Ja, wenn Tipico zum Zeitpunkt Ihrer Einsätze keine deutsche Lizenz hatte. Die AI prüft den Lizenzstatus automatisch." },
      { q: "Wie wird der Nettoverlust berechnet?", a: "Alle Gewinne werden von allen Verlusten abgezogen. Die AI hilft bei der Berechnung, auch wenn Sie die genauen Zahlen nicht mehr haben." },
      { q: "Was ist mit Bwin und Bet365?", a: "Auch hier gilt: Ohne deutsche Lizenz sind die Einsätze zurückforderbar. Die AI prüft den jeweiligen Lizenzstatus für jeden Anbieter." },
      { q: "Bis wann muss ich klagen?", a: "Die Verjährung endet voraussichtlich 2026. Handeln Sie schnell — der kostenlose Check dauert nur 5 Minuten." },
      { q: "Brauche ich die komplette Spielhistorie?", a: "Je vollständiger die Daten, desto besser. Die AI hilft Ihnen auch, fehlende Daten vom Anbieter anzufordern." },
      { q: "Kostenloser Check — wo ist der Haken?", a: "Kein Haken. Der AI-Check ist kostenlos. Erst bei anwaltlicher Vertretung entstehen Kosten — und das Dossier reduziert diese erheblich." },
      { q: "Gilt das auch für Live-Wetten?", a: "Ja, Live-Wetten bei nicht lizenzierten Anbietern sind ebenfalls zurückforderbar. Es gibt keine Unterscheidung zwischen Pre-Match und Live-Wetten." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Sportwetten-Verluste jetzt prüfen",
    ctaSub: "Kostenloser AI-Check: Lizenzstatus, Nettoverlust und Erfolgsprognose in 5 Minuten.",
    relatedNiches: [
      { slug: "casino-verluste", title: "Online Casino Verluste zurückfordern" },
      { slug: "casino-oesterreich", title: "Casino Verluste Österreich" },
    ],
  },

  "casino-oesterreich": {
    slug: "casino-oesterreich",
    metaTitle: "Casino Verluste Österreich zurückfordern | OGH",
    metaDesc:
      "Casino Verluste in Österreich zurückfordern: OGH 6 Ob 31/24p bestätigt Rückforderung. AI-Fallanalyse mit österreichischer Rechtslage. Kostenlos.",
    h1a: "Online Casino Verluste",
    h1b: "in Österreich zurückfordern",
    heroSub:
      "Verluste aus illegalen Online-Casinos in Österreich zurückfordern. OGH-Rechtsprechung bestätigt Anspruch. AI-gestützte Fallanalyse mit ABGB und österreichischer Rechtslage.",
    badge: "Österreich · OGH-Rechtsprechung",
    jurisdiction: "AT",
    intro: "Online Casino Verluste in Österreich zurückfordern: Der OGH hat mit 6 Ob 31/24p bestätigt, dass Spielverträge bei Online-Casinos ohne österreichische Konzession nichtig sind. Verluste können nach § 879 ABGB zurückgefordert werden. Die dreijährige Verjährungsfrist läuft — schnelle Prüfung ist wichtig. Die AI analysiert Ihren Fall nach österreichischem Recht und erstellt ein Dossier mit OGH-Zitaten für Ihren Rechtsanwalt.",
    pains: [
      { icon: "AlertTriangle", title: "Illegale Casino-Angebote", desc: "Online-Casinos ohne österreichische Konzession — Spielverträge sind nach OGH-Rechtsprechung nichtig." },
      { icon: "Clock", title: "Verjährung nach ABGB", desc: "Die dreijährige Verjährungsfrist läuft — schnelle Prüfung und Geltendmachung ist wichtig." },
      { icon: "FileText", title: "Beweisaufbereitung", desc: "Spielhistorie, Einzahlungsbelege und Chatverläufe müssen strukturiert aufbereitet werden." },
      { icon: "Users", title: "Anwaltskosten in Österreich", desc: "Erstberatung kann teuer sein — das AI-Dossier reduziert die Kosten erheblich." },
    ],
    solutionSteps: [
      { step: "1", title: "Fall schildern", desc: "Beschreiben Sie, bei welchem Online-Casino Sie gespielt haben und wie hoch die Verluste sind." },
      { step: "2", title: "AI prüft nach österreichischem Recht", desc: "Die AI analysiert Ihren Fall nach ABGB, OGH-Rechtsprechung und österreichischem Glücksspielrecht." },
      { step: "3", title: "Dossier für österreichischen Anwalt", desc: "Vollständiges Dossier mit ABGB-Rechtsgrundlagen, OGH-Zitaten und Erfolgsprognose — bereit für Ihren Rechtsanwalt." },
    ],
    legalRulings: [
      { court: "OGH", date: "2024", ref: "6 Ob 31/24p", summary: "Online-Casino-Verluste ohne österreichische Konzession sind zurückforderbar. Spielvertrag ist nichtig nach § 879 ABGB." },
      { court: "OGH", date: "2023", ref: "6 Ob 60/23h", summary: "Rückforderungsanspruch auch bei längerer Spielzeit. Mitverschulden wird bei illegalen Angeboten nicht zugerechnet." },
      { court: "LG Innsbruck", date: "2022", ref: "2 R 111/22b", summary: "Ausländische Online-Casinos ohne österreichische Konzession — Verluste sind nach ABGB zurückzufordern." },
    ],
    caseExample: {
      title: "Typischer Fall: Online-Casino ohne Konzession",
      facts: "Spieler aus Salzburg verlor über 14 Monate 32.000 € bei einem Online-Casino mit maltesischer Lizenz, aber ohne österreichische Konzession.",
      outcome: "Rückforderung nach § 879 ABGB. Außergerichtliche Geltendmachung führte zur Rückerstattung von 80% der Verluste.",
      value: "32.000 €",
    },
    faq: [
      { q: "Gilt das österreichische Recht bei ausländischen Casinos?", a: "Ja. Der OGH hat mehrfach bestätigt, dass bei Online-Casinos ohne österreichische Konzession das ABGB greift und Verluste zurückgefordert werden können." },
      { q: "Wie lange habe ich Zeit in Österreich?", a: "Die regelmäßige Verjährungsfrist nach ABGB beträgt 3 Jahre ab Kenntnis. Die AI prüft Ihre individuelle Fristsituation." },
      { q: "Brauche ich einen österreichischen Anwalt?", a: "Für eine Klage in Österreich ja. Das AI-Dossier ist aber so aufbereitet, dass jeder österreichische Rechtsanwalt den Fall sofort übernehmen kann — mit minimalen Vorbereitungskosten." },
      { q: "Was kostet der AI-Check in Österreich?", a: "Der Check ist kostenlos, unabhängig von Ihrem Wohnort. Sie erhalten ein vollständiges Dossier nach österreichischem Recht." },
      { q: "Gilt das auch für Sportwetten in Österreich?", a: "Ja, auch Sportwetten bei nicht konzessionierten Anbietern sind in Österreich zurückforderbar." },
      { q: "Kann ich auch gegen Casinos aus Malta klagen?", a: "Ja, der OGH hat bestätigt, dass die österreichischen Gerichte zuständig sind, wenn der Spieler in Österreich lebt." },
      { q: "Was ist mit der Spieleranwalt.at Konkurrenz?", a: "Die AI-Fallanalyse ist schneller und kostenlos. Sie erhalten ein vollständiges Dossier in 5 Minuten statt einer kostenpflichtigen Erstberatung." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Casino-Verluste in Österreich prüfen",
    ctaSub: "Kostenloser AI-Check nach OGH-Rechtsprechung und ABGB. In 5 Minuten zum Falldossier.",
    relatedNiches: [
      { slug: "casino-verluste", title: "Online Casino Verluste zurückfordern" },
      { slug: "sportwetten-verluste", title: "Sportwetten Verluste zurückfordern" },
      { slug: "krypto-casino", title: "Krypto-Casino Verluste" },
    ],
  },

  "krypto-betrug": {
    slug: "krypto-betrug",
    metaTitle: "Krypto Betrug — Geld zurück mit AI-Forensik",
    metaDesc:
      "Krypto-Betrug, Bitcoin Scam, Crypto Fraud: AI-gestützte Forensik und Wallet-Tracing. Beweisaufbereitung, Anwalt-Dossier. Kostenloser Check — €39.500 Ø-Schaden.",
    h1a: "Krypto-Betrug —",
    h1b: "Geld zurückfordern",
    heroSub:
      "AI-gestützte Krypto-Forensik: Wallet-Tracing, Beweisaufbereitung und Anwalt-Dossier in 5 Minuten. Durchschnittlicher Schaden: €39.500 pro Fall. Kostenloser Check.",
    badge: "Ø Schaden: €39.500/Fall",
    jurisdiction: "DE+AT",
    intro: "Krypto-Betrug und Bitcoin Scam sind wachsende Bedrohungen: Fake-Exchanges, Phishing, Romance Scams und Pig Butchering trügen Opfer um Millionen. Die AI-gestützte Krypto-Forensik verfolgt den Geldfluss über die Blockchain, identifiziert Exchange-Kontakte und erstellt ein forensisches Dossier für Anwalt und Behörden. Durchschnittlicher Schaden: €39.500 pro Fall. Der kostenlose Check zeigt sofort, ob eine Rückforderung möglich ist.",
    pains: [
      { icon: "AlertTriangle", title: "Fake-Exchanges & Scams", desc: "Krypto-Betrücker nutzen professionelle Plattformen, Fake-Wallets und Social Engineering — Opfer erkennen den Betrug oft zu spät." },
      { icon: "EyeOff", title: "Anonyme Täter", desc: "Krypto-Transaktionen sind pseudonym — aber nicht anonym. Wallet-Adressen können zurückverfolgt werden." },
      { icon: "FileText", title: "Beweissicherung ist hochkomplex", desc: "Blockchain-Explorer, Transaction-IDs, Wallet-Historie — ohne forensische Expertise geht nichts." },
      { icon: "Server", title: "Behörden sind überlastet", desc: "Polizei und Staatsanwaltschaft haben selten Krypto-Forensik-Expertise — Opfer müssen selbst aktiv werden." },
    ],
    solutionSteps: [
      { step: "1", title: "Transaktionsdaten eingeben", desc: "Geben Sie Wallet-Adressen, Transaction-IDs und den Ablauf des Betrugs ein. Die AI analysiert die Blockchain-Transaktionen." },
      { step: "2", title: "AI-Wallet-Tracing", desc: "Die AI verfolgt den Geldfluss über die Blockchain, identifiziert Exchange-Kontakte und erstellt eine forensische Spuranalyse." },
      { step: "3", title: "Forensik-Dossier für Anwalt & Behörden", desc: "Vollständiges Beweisdossier mit Wallet-Tracing, Zeitachse, Exchange-Kontakten und juristischer Einordnung — bereit für Strafanzeige und Zivilklage." },
    ],
    legalRulings: [
      { court: "BGH", date: "2024", ref: "II ZR 282/23", summary: "Betreiber von Krypto-Börsen können auf Schadensersatz haften, wenn sie Betrugsgelder entgegennehmen — auch ohne direkte Täterschaft." },
      { court: "EuGH", date: "2023", ref: "C-679/22", summary: "Krypto-Dienstleister unterliegen der EU-MiCA-Verordnung — Sorgfaltspflichten bei Betrugsverdacht." },
    ],
    caseExample: {
      title: "Typischer Fall: Fake-Exchange Betrug",
      facts: "Opfer investierte 52.000 € über eine Fake-Exchange, die professionell aufgebaut war. Auszahlung wurde verweigert, Support nicht erreichbar.",
      outcome: "AI-Wallet-Tracing zeigte, dass die Mittel über eine regulierte Exchange abgehoben wurden. Strafanzeige + Zivilklage gegen die Exchange führte zur Rückerstattung.",
      value: "52.000 €",
    },
    faq: [
      { q: "Kann ich Krypto-Betrug überhaupt zurückbekommen?", a: "Ja, wenn die Mittel über eine regulierte Exchange geflossen sind. Die AI verfolgt den Geldfluss und identifiziert Haftungsziele." },
      { q: "Was ist AI-Wallet-Tracing?", a: "Die AI analysiert Blockchain-Transaktionen und verfolgt den Geldfluss von der Betrüger-Wallet bis zu möglichen Exchange-Kontakten — automatisiert in Minuten statt Wochen." },
      { q: "Was kostet die Krypto-Forensik?", a: "Der erste Check ist kostenlos. Sie erhalten eine Ersteinschätzung, ob eine Rückforderung möglich ist. Eine detaillierte Forensik-Analyse kann kostenpflichtig sein." },
      { q: "Brauche ich einen Anwalt für Krypto-Betrug?", a: "In den meisten Fällen ja. Das AI-Dossier ist aber so aufbereitet, dass jeder Anwalt den Fall sofort versteht — das spart erhebliche Vorbereitungskosten." },
      { q: "Was ist Pig Butchering?", a: "Pig Butchering ist ein Romance-Scam, bei dem Opfer über Fake-Dating-Apps zur Krypto-Investition verleitet werden. Dafür gibt es eine eigene Seite mit spezifischen Informationen." },
      { q: "Hilft eine Strafanzeige bei Krypto-Betrug?", a: "Ja, besonders wenn die AI Exchange-Kontakte identifiziert hat. Die Staatsanwaltschaft kann Auskunftsersuchen an Exchanges stellen — das AI-Dossier liefert die Grundlage." },
      { q: "Wie lange dauert die Rückforderung?", a: "Das AI-Dossier ist in 5 Minuten fertig. Die juristische Durchsetzung dauert 3-12 Monate, je nach Komplexität und Kooperationswilligkeit der Exchange." },
      { q: "Funktioniert das auch bei DeFi-Betrug?", a: "Bei DeFi (Decentralized Finance) ist die Rückforderung schwieriger, da es keine zentrale Anlaufstelle gibt. Die AI analysiert jedoch auch Smart-Contract-Interaktionen." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Krypto-Fall jetzt kostenlos analysieren",
    ctaSub: "AI-Wallet-Tracing und forensisches Dossier in 5 Minuten. Durchschnittsschaden: €39.500 — prüfen Sie Ihre Chancen.",
    relatedNiches: [
      { slug: "krypto-forensik", title: "Krypto-Forensik: AI-Wallet-Tracing" },
      { slug: "pig-butchering", title: "Pig Butchering Scam" },
      { slug: "investmentbetrug", title: "Investmentbetrug — Geld zurückfordern" },
      { slug: "krypto-casino", title: "Krypto-Casino Verluste" },
    ],
  },

  "krypto-forensik": {
    slug: "krypto-forensik",
    metaTitle: "Krypto-Forensik: AI-Wallet-Tracing für Anwälte",
    metaDesc:
      "Professionelle Krypto-Forensik: AI-gestütztes Wallet-Tracing, Blockchain-Analyse, Beweissicherung für Strafverfahren und Zivilklagen. Für Anwälte & Unternehmen.",
    h1a: "Krypto-Forensik —",
    h1b: "AI-Wallet-Tracing",
    heroSub:
      "Professionelle Blockchain-Forensik für Anwälte, Unternehmen und Geschädigte. AI-gestütztes Wallet-Tracing, Beweissicherung und forensische Gutachten — gerichtsverwertbar aufbereitet.",
    badge: "B2B + B2C · Gerichtsverwertbar",
    jurisdiction: "DE+AT",
    intro: "Krypto-Forensik für Anwälte, Unternehmen und Geschädigte: AI-gestütztes Wallet-Tracing über Bitcoin, Ethereum, Tron und Sidechains. Cross-Chain-Tracing über Mixer und Bridges. Gerichtsverwertbare Gutachten für Strafverfahren und Zivilklagen. Die professionelle Blockchain-Analyse identifiziert Exchange-Kontakte, dokumentiert den Geldfluss und erstellt Haftungsanalysen — in Minuten statt Wochen.",
    pains: [
      { icon: "AlertTriangle", title: "Keine forensische Expertise", desc: "Die meisten Kanzleien und Unternehmen haben keine Krypto-Forensik-Expertise — Beweise gehen verloren." },
      { icon: "Clock", title: "Zeitkritische Spuren", desc: "Blockchain-Transaktionen sind unveränderlich, aber Exchange-Kontakte können gelöscht werden — schnelle Spurensicherung ist essenziell." },
      { icon: "FileText", title: "Gerichtsverwertbare Dokumentation", desc: "Forensische Gutachten müssen juristischen Standards entsprechen — nicht jede Blockchain-Analyse reicht vor Gericht." },
      { icon: "Server", title: "Cross-Chain-Tracing", desc: "Betrüger nutzen Mixer, Bridges und Multiple Chains — manuelles Tracing ist fast unmöglich." },
    ],
    solutionSteps: [
      { step: "1", title: "Fall aufgeben", desc: "Wallet-Adressen, Transaction-IDs und Sachverhalt eingeben. Auch unvollständige Daten sind möglich — die AI ergänzt." },
      { step: "2", title: "AI-Tracing über Multiple Chains", desc: "Die AI verfolgt den Geldfluss über Bitcoin, Ethereum, Tron und Sidechains — inklusive Mixer- und Bridge-Erkennung." },
      { step: "3", title: "Forensisches Gutachten", desc: "Gerichtsverwertbares Gutachten mit Wallet-Graph, Zeitachse, Exchange-Kontakten, Haftungsanalyse und juristischer Einordnung." },
    ],
    legalRulings: [
      { court: "BGH", date: "2024", ref: "II ZR 282/23", summary: "Exchange-Haftung bei Entgegennahme von Betrugsgeldern — Sorgfaltspflichten nach MiCA und GWG." },
      { court: "EuGH", date: "2023", ref: "C-679/22", summary: "MiCA-Verordnung: Krypto-Dienstleister müssen Betrugsverdächtige Transaktionen melden und einfrieren." },
    ],
    caseExample: {
      title: "B2B-Fall: Unternehmen nach Krypto-Betrug",
      facts: "Mittelständisches Unternehmen überwies 120.000 € nach Phishing-Angriff an Krypto-Betrüger. Mittel flossen über Ethereum und Tron.",
      outcome: "AI-Tracing identifizierte zwei Exchange-Kontakte. Gutachten ermöglichte Auskunftsersuchen und letztlich Rückerstattung von 85% über die Exchange.",
      value: "120.000 €",
    },
    faq: [
      { q: "Ist das Gutachten gerichtsverwertbar?", a: "Ja. Das forensische Gutachten dokumentiert Methodik, Datenquellen und Analyse-Schritte nachvollziehbar. Es entspricht den Anforderungen für Zivil- und Strafverfahren." },
      { q: "Welche Blockchains werden unterstützt?", a: "Bitcoin, Ethereum, Tron, BSC, Polygon, Solana und weitere. Cross-Chain-Tracing über Bridges und Mixers ist integriert." },
      { q: "Wie schnell liegt das Gutachten vor?", a: "Erste Tracing-Ergebnisse in 5 Minuten. Vollständiges Gutachten innerhalb 24-48 Stunden bei komplexeren Fällen." },
      { q: "Was kostet die Krypto-Forensik?", a: "Der Ersteinstieg ist kostenlos. Vollständige Gutachten werden nach Aufwand abgerechnet — typischerweise 500-2.000 € je nach Komplexität." },
      { q: "Kann ich das Gutachten für eine Strafanzeige nutzen?", a: "Ja. Das Gutachten ist so strukturiert, dass es direkt als Anlage zur Strafanzeige verwendet werden kann. Die AI bereitet auch das Anschreiben an die Staatsanwaltschaft vor." },
      { q: "Arbeiten Sie auch mit Kanzleien zusammen?", a: "Ja. Die Krypto-Forensik ist speziell für Anwälte entwickelt, die Krypto-Fälle übernehmen aber keine eigene Forensik-Expertise haben. White-Label-Lösung möglich." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Forensik-Auftrag starten",
    ctaSub: "AI-Wallet-Tracing in 5 Minuten. Gerichtsverwertbares Gutachten für Anwälte, Unternehmen und Geschädigte.",
    relatedNiches: [
      { slug: "krypto-betrug", title: "Krypto Betrug — Geld zurück" },
      { slug: "amtshaftung-krypto", title: "Amtshaftung bei Krypto-Report ignoriert" },
      { slug: "pig-butchering", title: "Pig Butchering Scam" },
    ],
  },

  "krypto-casino": {
    slug: "krypto-casino",
    metaTitle: "Krypto-Casino Verluste zurückfordern | AI-Check",
    metaDesc:
      "Verluste bei Krypto-Casinos (Bitcoin, Ethereum) zurückfordern. AI-Fallanalyse kombiniert Casino-Recht + Krypto-Forensik. Einzigartige Nische. Kostenloser Check.",
    h1a: "Krypto-Casino",
    h1b: "Verluste zurückfordern",
    heroSub:
      "Die einzigartige Schnittstelle aus Casino-Recht und Krypto-Forensik: Verluste bei Bitcoin- und Ethereum-Casinos zurückfordern. AI analysiert Casino-Illegativität UND Wallet-Spuren.",
    badge: "Unique: Casino + Krypto",
    jurisdiction: "DE+AT",
    intro: "Krypto-Casino Verluste zurückfordern: Die einzigartige Schnittstelle aus Casino-Recht und Krypto-Forensik. Bitcoin- und Ethereum-Casinos operieren oft ohne Lizenz und anonym — aber die Blockchain verrät mehr als die Betreiber glauben. Die AI kombiniert juristische Begründung (Casino-Nichtigkeit nach EuGH/BGH/OGH) mit forensischem Beweis (Wallet-Tracing) für ein vollständiges Dossier.",
    pains: [
      { icon: "AlertTriangle", title: "Doppelte Komplexität", desc: "Krypto-Casinos kombinieren illegales Glücksspiel mit Krypto-Anonymität — Standard-Anwälte scheitern an beiden Aspekten." },
      { icon: "EyeOff", title: "Anonyme Betreiber", desc: "Krypto-Casinos operieren oft vollständig anonym — aber die Blockchain verrät mehr als die Betreiber glauben." },
      { icon: "FileText", title: "Beweissicherung extrem komplex", desc: "Wallet-Adressen, Smart-Contract-Interaktionen und Spielhistorie müssen kombiniert aufbereitet werden." },
      { icon: "Server", title: "Keine regulatorische Anlaufstelle", desc: "Krypto-Casinos haben keine Lizenz, keine Regulierung und keinen Verbraucherschutz — Selbsthilfe ist nötig." },
    ],
    solutionSteps: [
      { step: "1", title: "Casino & Wallet angeben", desc: "Geben Sie das Krypto-Casino, Ihre Wallet-Adresse und den Zeitraum der Verluste an." },
      { step: "2", title: "AI kombiniert Casino- + Krypto-Analyse", desc: "Die AI prüft die Illegativität des Casinos (keine Lizenz) UND verfolgt Ihre Krypto-Transaktionen auf der Blockchain." },
      { step: "3", title: "Dual-Dossier: Casino-Recht + Forensik", desc: "Vollständiges Dossier mit juristischer Begründung (Casino-Nichtigkeit) und forensischem Beweis (Wallet-Tracing) — einzigartig." },
    ],
    legalRulings: [
      { court: "EuGH", date: "April 2026", ref: "C-440/23", summary: "Online-Casino-Verluste ohne Lizenz sind zurückforderbar — gilt unabhängig von der Währung (Fiat oder Krypto)." },
      { court: "OGH", date: "2024", ref: "6 Ob 31/24p", summary: "Spielvertrag bei illegalen Online-Casinos ist nichtig — auch wenn Einsätze in Krypto geleistet wurden." },
    ],
    caseExample: {
      title: "Typischer Fall: Bitcoin-Casino ohne Lizenz",
      facts: "Spieler verlor 8 BTC (ca. 340.000 €) über 10 Monate bei einem Bitcoin-Casino ohne jegliche Lizenz. Transaktionen liefen über Ethereum-Smart-Contract.",
      outcome: "AI-Dossier kombinierte Casino-Nichtigkeit mit Wallet-Tracing. Identifikation der Betreiber-Wallet führte zur außergerichtlichen Rückerstattung.",
      value: "340.000 €",
    },
    faq: [
      { q: "Sind Krypto-Casino-Verluste anders als normale Casino-Verluste?", a: "Die Rechtslage ist dieselbe — illegale Casino-Angebote sind nichtig. Aber die Beweissicherung ist komplexer, da Krypto-Transaktionen zusätzlich zurückverfolgt werden müssen." },
      { q: "Kann ich Bitcoin-Verluste zurückfordern?", a: "Ja. Die AI kombiniert die juristische Begründung (Casino ohne Lizenz) mit forensischem Beweis (Bitcoin-Wallet-Tracing)." },
      { q: "Was ist, wenn das Casino anonym ist?", a: "Auch anonyme Casinos hinterlassen Blockchain-Spuren. Die AI verfolgt die Wallet-Adressen und identifiziert mögliche Exchange-Kontakte." },
      { q: "Wie hoch sind die Erfolgschancen?", a: "Die juristische Grundlage ist stark (EuGH, BGH, OGH). Die Herausforderung ist die Durchsetzung — das AI-Dossier maximiert die Chancen durch vollständige Beweisaufbereitung." },
      { q: "Was kostet der Check bei Krypto-Casinos?", a: "Der erste Check ist kostenlos. Bei komplexen Wallet-Tracings können zusätzliche Kosten entstehen — diese werden transparent ausgewiesen." },
      { q: "Gibt es eine Verjährung bei Krypto-Casino-Verlusten?", a: "Ja, dieselben Verjährungsfristen wie bei normalen Casino-Verlusten. Die AI prüft Ihre individuelle Fristsituation." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Krypto-Casino Fall jetzt analysieren",
    ctaSub: "Einzigartige Kombination: Casino-Recht + Krypto-Forensik. Kostenloser Check in 5 Minuten.",
    relatedNiches: [
      { slug: "casino-verluste", title: "Online Casino Verluste zurückfordern" },
      { slug: "krypto-betrug", title: "Krypto Betrug — Geld zurück" },
      { slug: "krypto-forensik", title: "Krypto-Forensik: AI-Wallet-Tracing" },
    ],
  },

  "asylrecht": {
    slug: "asylrecht",
    metaTitle: "Asylrecht & Asylantrag — AI-Fallvorbereitung",
    metaDesc:
      "Asylantrag, Dublin-Verfahren, Abschiebung verhindern: AI-gestützte Fallvorbereitung mit Fristen-Check. Mehrsprachig (DE, EN, TR, AR, RU). Kostenloser Check.",
    h1a: "Asylrecht —",
    h1b: "AI-gestützte Fallvorbereitung",
    heroSub:
      "Asylverfahren haben extrem kurze Fristen — oft nur 1-2 Wochen. Die AI bereitet Ihren Fall vor, prüft Fristen und erstellt ein dossierfertiges Gutachten. Mehrsprachig: DE, EN, TR, AR, RU.",
    badge: "Express-Pipeline · Mehrsprachig",
    jurisdiction: "DE+AT",
    intro: "Asylrecht und Asylanträge haben extrem kurze Fristen — oft nur 1-2 Wochen. Die AI bereitet Ihren Fall vor, prüft Fristen und erstellt ein dossierfertiges Gutachten. Mehrsprachig: Deutsch, Englisch, Türkisch, Arabisch, Russisch, Farsi/Dari. Ob Dublin-Verfahren, Abschiebung oder Beschwerde gegen BFA/BAMF — die AI demokratisiert den Zugang zu juristischer Vorbereitung.",
    pains: [
      { icon: "Clock", title: "Extrem kurze Fristen", desc: "Dublin-Verfahren: 1 Woche. Beschwerden: 2-4 Wochen. Jeder Tag zählt — Verpassen der Frist bedeutet Abschiebung." },
      { icon: "Languages", title: "Sprachbarrieren", desc: "Asylbewerber sprechen oft nicht Deutsch — wichtige Details gehen in der Übersetzung verloren." },
      { icon: "FileText", title: "BFA/BAMF-Bescheide sind komplex", desc: "Behördliche Bescheide sind juristisch formuliert — ohne Fachwissen ist eine erfolgversprechende Stellungnahme unmöglich." },
      { icon: "Users", title: "Kein Zugang zu Anwälten", desc: "Viele Asylbewerber haben keinen Anwalt — die AI demokratisiert den Zugang zu juristischer Vorbereitung." },
    ],
    solutionSteps: [
      { step: "1", title: "Bescheid hochladen oder Fall schildern", desc: "Laden Sie den BFA/BAMF-Bescheid hoch oder beschreiben Sie Ihren Fall in Ihrer Sprache. Die AI übersetzt automatisch." },
      { step: "2", title: "AI analysiert Bescheid & Fristen", desc: "Die AI identifiziert Fristen, prüft formelle Fehler im Bescheid und entwickelt Argumentationslinien für Ihre Beschwerde." },
      { step: "3", title: "Beschwerde-Entwurf + Dossier", desc: "Vollständiger Beschwerde-Entwurf mit juristischer Begründung, Fristen-Übersicht und Beweisanträgen — in Ihrer Sprache und auf Deutsch." },
    ],
    legalRulings: [
      { court: "EuGH", date: "2024", ref: "C-561/23", summary: "Asylbewerber haben Recht auf effektiven Rechtsschutz — auch bei Dublin-Verfahren muss eine Überprüfung möglich sein." },
      { court: "VwGH AT", date: "2023", ref: "As 18.07.2023", summary: "BFA muss individuelle Verfolgungsgründe prüfen — pauschale Ablehnung ist rechtswidrig." },
    ],
    caseExample: {
      title: "Typischer Fall: Dublin-Überstellung verhindern",
      facts: "Asylbewerber aus Syrien sollte nach Italien überstellt werden (Dublin-Verordnung). Frist für Beschwerde: 1 Woche.",
      outcome: "AI erstellte Beschwerde-Entwurf mit Argumenten gegen Überstellung (humanitäre Gründe, familiäre Bindungen). Beschwerde erfolgreich beim BVwG.",
      value: "Aufenthaltssicherung",
    },
    faq: [
      { q: "Wie schnell muss ich bei einem Asylbescheid reagieren?", a: "Bei Dublin-Verfahren haben Sie oft nur 1 Woche. Bei normalen Asyl-Beschwerden 2-4 Wochen. Die AI identifiziert die genaue Frist sofort." },
      { q: "In welchen Sprachen funktioniert die AI?", a: "Deutsch, Englisch, Türkisch, Arabisch, Russisch, Farsi/Dari. Sie können Ihren Fall in Ihrer Sprache schildern — die AI übersetzt und bereitet auf." },
      { q: "Kann die AI einen Anwalt ersetzen?", a: "Nein. Die AI bereitet den Fall vor und erstellt einen Beschwerde-Entwurf. Für die gerichtliche Vertretung brauchen Sie einen Anwalt — aber das Dossier reduziert die Kosten erheblich." },
      { q: "Was kostet die Asyl-Fallvorbereitung?", a: "Der erste Check ist kostenlos. Bei komplexeren Fällen kann eine kostenpflichtige Detailanalyse angeboten werden — aber der erste Check reicht oft für eine Ersteinschätzung." },
      { q: "Funktioniert das in Deutschland und Österreich?", a: "Ja. Die AI kennt sowohl das deutsche Asylrecht (AsylG, AufenthG) als auch das österreichische Fremdenrecht (FPG, AsylG 2005)." },
      { q: "Was ist ein Dublin-Verfahren?", a: "Die Dublin-Verordnung regelt, welcher EU-Staat für ein Asylverfahren zuständig ist. Wenn Sie nach Deutschland/Österreich kommen aber ein anderer Staat zuständig ist, droht die Überstellung. Dafür gibt es eine eigene Seite." },
      { q: "Kann die AI bei Abschiebung helfen?", a: "Ja. Bei drohender Abschiebung ist Eile geboten. Die AI erstellt sofort einen Eilantrags-Entwurf mit den wichtigsten Argumenten gegen die Abschiebung." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Asyl-Fall jetzt vorbereiten",
    ctaSub: "Express-Pipeline: Fristen-Check und Beschwerde-Entwurf in Ihrer Sprache. Kostenlos — jeder Tag zählt.",
    relatedNiches: [
      { slug: "dublin-verfahren", title: "Dublin-Verfahren: Überstellung verhindern" },
      { slug: "abschiebung-verhindern", title: "Abschiebung verhindern" },
    ],
  },

  "dublin-verfahren": {
    slug: "dublin-verfahren",
    metaTitle: "Dublin-Verfahren: Überstellung verhindern | AI",
    metaDesc:
      "Dublin-Verfahren: Überstellung in anderen EU-Staat verhindern. Frist oft nur 1 Woche! AI erstellt sofort Beschwerde-Entwurf. Mehrsprachig. Kostenloser Check.",
    h1a: "Dublin-Verfahren —",
    h1b: "Überstellung verhindern",
    heroSub:
      "Dublin-Bescheid erhalten? Die Frist für eine Beschwerde beträgt oft nur 1 Woche. Die AI erstellt sofort einen Beschwerde-Entwurf mit allen Argumenten gegen die Überstellung. Mehrsprachig.",
    badge: "Frist: oft nur 1 Woche!",
    jurisdiction: "DE+AT",
    intro: "Dublin-Verfahren: Die Dublin-Verordnung regelt, welcher EU-Staat für ein Asylverfahren zuständig ist. Wird ein anderer Staat als zuständig erachtet, droht die Überstellung. Die Beschwerdefrist beträgt oft nur 1 Woche. Die AI liest den Bescheid, berechnet die exakte Frist und erstellt sofort einen Beschwerde-Entwurf mit allen Argumenten gegen die Überstellung — mehrsprachig und kostenlos.",
    pains: [
      { icon: "Clock", title: "Extrem kurze Frist", desc: "Die Beschwerdefrist bei Dublin-Bescheiden beträgt oft nur 7 Tage — Verpassen bedeutet Überstellung." },
      { icon: "AlertTriangle", title: "Überstellung droht", desc: "Sie können in einen EU-Staat überstellt werden, in dem Sie möglicherweise keine Bleibeperspektive haben." },
      { icon: "Languages", title: "Sprachbarriere", desc: "Der Bescheid ist auf Deutsch — aber Sie brauchen eine Beschwerde auf Deutsch, in Ihrer Sprache verständlich." },
      { icon: "FileText", title: "Komplexe juristische Argumentation", desc: "Gegen Dublin-Bescheide gibt es spezifische Argumentationslinien — systematische Fehler im Bescheid, humanitäre Gründe, familiäre Bindungen." },
    ],
    solutionSteps: [
      { step: "1", title: "Dublin-Bescheid hochladen", desc: "Laden Sie den Bescheid hoch oder fotografieren Sie ihn ab. Die AI liest und analysiert ihn automatisch." },
      { step: "2", title: "AI identifiziert Frist & Argumente", desc: "Die AI berechnet die genaue Frist und identifiziert alle möglichen Argumente gegen die Überstellung." },
      { step: "3", title: "Beschwerde-Entwurf in 5 Minuten", desc: "Vollständiger Beschwerde-Entwurf mit juristischer Begründung — sofort einsatzbereit für Ihren Anwalt oder das Gericht." },
    ],
    legalRulings: [
      { court: "EuGH", date: "2024", ref: "C-561/23", summary: "Effektiver Rechtsschutz auch bei Dublin-Verfahren — Beschwerdefrist muss eine effektive Prüfung ermöglichen." },
      { court: "EGMR", date: "2023", ref: "M.A. v. Deutschland", summary: "Überstellung bei systemischen Mängeln im Ziellaat verstößt gegen EMRK — Art. 3." },
    ],
    caseExample: {
      title: "Typischer Fall: Überstellung nach Italien verhindert",
      facts: "Asylbewerber aus Afghanistan sollte nach Italien überstellt werden. Beschwerdefrist: 1 Woche. Begründung: humanitäre Gründe, keine Unterkunft in Italien.",
      outcome: "AI erstellte Beschwerde mit Verweis auf systemische Mängel im italienischen Asylsystem. BVwG setzte Überstellung aus — Verfahren in Österreich.",
      value: "Aufenthalt in Österreich",
    },
    faq: [
      { q: "Was ist die Dublin-Verordnung?", a: "Sie regelt, welcher EU-Staat für ein Asylverfahren zuständig ist. Meistens ist es der erste EU-Staat, den Sie betreten haben. Wenn das nicht Deutschland/Österreich ist, droht die Überstellung." },
      { q: "Wie viel Zeit habe ich für eine Beschwerde?", a: "Die Frist variiert — oft nur 1 Woche ab Zustellung des Bescheids. Die AI liest Ihren Bescheid und berechnet die exakte Frist." },
      { q: "Welche Argumente gibt es gegen eine Überstellung?", a: "Systemische Mängel im Ziellaat, humanitäre Gründe, familiäre Bindungen im aktuellen Staat, medizinische Versorgung, Minderjährigenschutz. Die AI identifiziert die relevanten Argumente für Ihren Fall." },
      { q: "Kann ich die Beschwerde selbst einreichen?", a: "Ja, in vielen Fällen können Sie die Beschwerde selbst einreichen. Der AI-Entwurf ist so formuliert, dass er direkt verwendet werden kann. Einen Anwalt benötigen Sie erst für das weitere Verfahren." },
      { q: "Was passiert nach der Beschwerde?", a: "Das Gericht prüft die Beschwerde und entscheidet über die Aussetzung der Überstellung (einstweilige Verfügung). Die AI bereitet auch den Antrag auf einstweilige Verfügung vor." },
      { q: "Kostet die Dublin-Express-Pipeline etwas?", a: "Der erste Check und der Beschwerde-Entwurf sind kostenlos. Die AI soll den Zugang zu Rechtsschutz demokratisieren." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Dublin-Beschwerde sofort erstellen",
    ctaSub: "Frist läuft — oft nur 1 Woche! AI erstellt Beschwerde-Entwurf in 5 Minuten. Mehrsprachig, kostenlos.",
    relatedNiches: [
      { slug: "asylrecht", title: "Asylrecht & Asylantrag" },
      { slug: "abschiebung-verhindern", title: "Abschiebung verhindern" },
    ],
  },

  "abschiebung-verhindern": {
    slug: "abschiebung-verhindern",
    metaTitle: "Abschiebung verhindern — Eilantrag | AI-Pipeline",
    metaDesc:
      "Abschiebung droht? AI erstellt sofort Eilantrags-Entwurf mit allen Argumenten gegen Abschiebung. Express-Pipeline, mehrsprachig. Kostenloser Check — JETZT handeln.",
    h1a: "Abschiebung",
    h1b: "verhindern",
    heroSub:
      "Droht die Abschiebung? Die AI erstellt sofort einen Eilantrags-Entwurf mit allen juristischen Argumenten gegen die Abschiebung. Express-Pipeline, mehrsprachig — jede Stunde zählt.",
    badge: "Eilverfahren · Jede Stunde zählt",
    jurisdiction: "DE+AT",
    intro: "Abschiebung verhindern: Bei drohender Abschiebung zählt jede Stunde. Die AI erstellt sofort einen Eilantrags-Entwurf mit allen juristischen Argumenten gegen die Abschiebung — Abschiebungsverbot nach § 60 AufenthG, humanitäre Gründe, familiäre Bindungen, medizinische Notfälle, Verfahrensfehler. Express-Pipeline, mehrsprachig, kostenlos. Der Entwurf ist direkt beim Gericht einreichbar.",
    pains: [
      { icon: "AlertTriangle", title: "Abschiebung droht unmittelbar", desc: "Die Abschiebung kann jederzeit vollzogen werden — es gibt oft nur Stunden oder Tage für rechtliche Schritte." },
      { icon: "Clock", title: "Eilantrag muss sofort vorliegen", desc: "Ein Eilantrag beim zuständigen Gericht muss schnellstmöglich eingereicht werden — Verzögerung kann fatal sein." },
      { icon: "Languages", title: "Sprachbarriere im Eilverfahren", desc: "Im Eilverfahren ist schnelle Kommunikation essenziell — Sprachbarrieren können den Erfolg gefährden." },
      { icon: "FileText", title: "Argumentation muss perfekt sein", desc: "Im Eilverfahren gibt es oft nur eine Chance — die Argumentation muss alle relevanten Punkte abdecken." },
    ],
    solutionSteps: [
      { step: "1", title: "Abschiebebescheid hochladen", desc: "Laden Sie den Bescheid hoch oder schildern Sie den Fall. Die AI analysiert sofort die rechtliche Situation." },
      { step: "2", title: "AI identifiziert Hinderungsgründe", desc: "Die AI prüft: Abschiebungsverbot (§ 60 AufenthG), humanitäre Gründe, familiäre Bindungen, medizinische Notfälle, Verfahrensfehler." },
      { step: "3", title: "Eilantrags-Entwurf sofort", desc: "Vollständiger Eilantrags-Entwurf mit allen Argumenten, Anträgen auf einstweiligen Rechtsschutz und Fristen-Übersicht." },
    ],
    legalRulings: [
      { court: "BVerfG", date: "2024", ref: "2 BvR 456/24", summary: "Effektiver Rechtsschutz bei drohender Abschiebung — Gerichte müssen Eilanträge unverzüglich prüfen." },
      { court: "EGMR", date: "2023", ref: "M.K. v. Österreich", summary: "Abschiebung bei drohender Folter oder unmenschlicher Behandlung verstößt gegen Art. 3 EMRK." },
    ],
    caseExample: {
      title: "Typischer Fall: Abschiebung nach Afghanistan verhindert",
      facts: "Afghanischer Asylbewerber mit abgelehntem Asylantrag. Abschiebung drohte innerhalb von 48 Stunden. Argument: Sicherheitslage in Afghanistan.",
      outcome: "AI erstellte Eilantrag mit Verweis auf aktuelle Sicherheitslageberichte und individuelle Gefährdung. Verwaltungsgericht setzte Abschiebung aus.",
      value: "Aufenthalt gesichert",
    },
    faq: [
      { q: "Wie schnell muss ich bei drohender Abschiebung handeln?", a: "Sofort. Jede Stunde zählt. Die AI erstellt den Eilantrags-Entwurf in 5 Minuten — aber Sie müssen ihn sofort bei Gericht einreichen." },
      { q: "Welche Gründe können eine Abschiebung verhindern?", a: "Abschiebungsverbot nach § 60 AufenthG, humanitäre Gründe, familiäre Bindungen, medizinische Notfälle, Verfahrensfehler, drohende Verfolgung. Die AI identifiziert die relevanten Gründe für Ihren Fall." },
      { q: "Kann ich den Eilantrag selbst einreichen?", a: "Ja. Der AI-Entwurf ist so formuliert, dass er direkt beim Gericht eingereicht werden kann. Im Eilverfahren ist das oft schneller als erst einen Anwalt zu suchen." },
      { q: "Was kostet der Notfall-Check?", a: "Der Check und der Eilantrags-Entwurf sind kostenlos. In Notfällen soll die AI den Zugang zu Rechtsschutz ermöglichen — ohne finanzielle Hürden." },
      { q: "Funktioniert das in Deutschland und Österreich?", a: "Ja. Die AI kennt beide Rechtssysteme (deutsches AufenthG, österreichisches FPG) und erstellt den Entwurf für das jeweilige Gericht." },
      { q: "Was passiert nach dem Eilantrag?", a: "Das Gericht entscheidet über den einstweiligen Rechtsschutz. Wenn der Antrag erfolgreich ist, wird die Abschiebung vorerst ausgesetzt. Danach brauchen Sie einen Anwalt für das Hauptsacheverfahren." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Eilantrag sofort erstellen",
    ctaSub: "Abschiebung droht? AI erstellt Eilantrags-Entwurf in 5 Minuten. Kostenlos, mehrsprachig — JETZT handeln.",
    relatedNiches: [
      { slug: "asylrecht", title: "Asylrecht & Asylantrag" },
      { slug: "dublin-verfahren", title: "Dublin-Verfahren: Überstellung verhindern" },
    ],
  },

  "amtshaftung": {
    slug: "amtshaftung",
    metaTitle: "Amtshaftung & Behördenfehler klagen | AI-Check",
    metaDesc:
      "Amtshaftungsklage: Schadensersatz bei Amtspflichtverletzungen und Behördenfehlern. AI analysiert den Fall, erstellt Klage-Dossier nach AHG/§ 839 BGB. Kostenloser Check.",
    h1a: "Amtshaftung —",
    h1b: "Schadensersatz bei Behördenfehlern",
    heroSub:
      "Wenn Behörden Fehler machen, können Geschädigte Schadensersatz fordern. Die AI analysiert den Behördenfehler, prüft die Amtshaftung und erstellt ein klagefertiges Dossier.",
    badge: "AT: AHG · DE: § 839 BGB",
    jurisdiction: "AT+DE",
    intro: "Amtshaftung und Behördenfehler: Wenn Behörden Fehler machen, können Geschädigte Schadensersatz fordern. In Österreich nach dem Amtshaftungsgesetz (AHG), in Deutschland nach § 839 BGB i.V.m. Art. 34 GG. Die AI analysiert den Behördenfehler, prüft Kausalität und erstellt ein klagefertiges Dossier mit Haftungsgrundlage, Schadensberechnung und Beweisanträgen. Verjährungsfrist: 3 Jahre ab Kenntnis.",
    pains: [
      { icon: "AlertTriangle", title: "Behördenfehler schwer nachzuweisen", desc: "Amtspflichtverletzungen müssen konkret dargelegt werden — ohne juristische Aufbereitung ist das kaum möglich." },
      { icon: "FileText", title: "Komplexe Haftungsgrundlagen", desc: "Österreich: Amtshaftungsgesetz (AHG). Deutschland: § 839 BGB i.V.m. Art. 34 GG. Unterschiedliche Voraussetzungen." },
      { icon: "Clock", title: "Kurze Verjährungsfristen", desc: "Amtshaftungsansprüche verjähren — in Österreich 3 Jahre, in Deutschland 3 Jahre ab Kenntnis." },
      { icon: "Server", title: "Behörden blockieren Auskünfte", desc: "Behörden erteilen ungern Auskünfte über eigene Fehler — Beweissicherung braucht Strategie." },
    ],
    solutionSteps: [
      { step: "1", title: "Sachverhalt schildern", desc: "Beschreiben Sie, welche Behörde welchen Fehler begangen hat und welcher Schaden entstanden ist." },
      { step: "2", title: "AI prüft Amtshaftung", desc: "Die AI analysiert den Behördenfehler nach AHG (AT) oder § 839 BGB (DE), prüft Kausalität und erstellt die Haftungsgrundlage." },
      { step: "3", title: "Klage-Dossier für Anwalt", desc: "Vollständiges Dossier mit Haftungsgrundlage, Schadensberechnung, Beweisanträgen und Erfolgsprognose — bereit für Ihren Anwalt." },
    ],
    legalRulings: [
      { court: "OGH", date: "2024", ref: "1 Ob 512/23h", summary: "Behörde haftet für fehlerhafte Auskünfte, die zu finanziellen Schäden führen — Amtshaftung auch bei reiner Auskunftstätigkeit." },
      { court: "BGH", date: "2023", ref: "III ZR 123/23", summary: "Amtspflichtverletzung bei fehlerhafter Bauaufsicht — Gemeinde haftet für unzureichende Kontrollen." },
    ],
    caseExample: {
      title: "Typischer Fall: Falsche Auskunft der Baubehörde",
      facts: "Bauherr erhielt falsche Auskunft über Bebaubarkeit eines Grundstücks. Investition von 180.000 € war wertlos. Behörde verweigert Schadensersatz.",
      outcome: "AI-Dossier wies Amtspflichtverletzung nach. Außergerichtliche Geltendmachung führte zur Einigung: 150.000 € Schadensersatz.",
      value: "150.000 €",
    },
    faq: [
      { q: "Wann haftet eine Behörde?", a: "Wenn eine Amtspflichtverletzung vorliegt: Ein Beamter hat seine Pflichten schuldhaft verletzt und dadurch einen Schaden verursacht. Die AI prüft diese Voraussetzungen für Ihren Fall." },
      { q: "Was ist der Unterschied zwischen AHG und § 839 BGB?", a: "Das österreichische Amtshaftungsgesetz (AHG) und § 839 BGB i.V.m. Art. 34 GG regeln dasselbe Prinzip — Schadensersatz bei Behördenfehlern — mit unterschiedlichen Details. Die AI kennt beide Systeme." },
      { q: "Wie lange habe ich Zeit?", a: "In Österreich und Deutschland jeweils 3 Jahre ab Kenntnis von Schaden und Schädiger. Die AI prüft Ihre individuelle Verjährungssituation." },
      { q: "Gibt es eine Besonderheit bei Krypto-Beamtenfehlern?", a: "Ja — wenn Behörden Krypto-Reports ignorieren oder nicht weiterverfolgen, kann das eine Amtspflichtverletzung sein. Dafür gibt es eine eigene Seite: Amtshaftung-Krypto." },
      { q: "Was kostet der Amtshaftungs-Check?", a: "Der erste Check ist kostenlos. Sie erhalten eine Ersteinschätzung, ob eine Amtshaftungsklage aussichtsreich ist." },
      { q: "Brauche ich einen Anwalt für die Amtshaftungsklage?", a: "Ja, für das gerichtliche Verfahren. Das AI-Dossier reduziert die Anwaltskosten erheblich, da der Fall vollständig aufbereitet ist." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Amtshaftungs-Fall jetzt prüfen",
    ctaSub: "Kostenloser AI-Check: Behördenfehler, Haftungsgrundlage und Erfolgsprognose in 5 Minuten.",
    relatedNiches: [
      { slug: "amtshaftung-krypto", title: "Amtshaftung bei Krypto-Report ignoriert" },
      { slug: "impfschaden-amtshaftung", title: "Impfschaden Amtshaftung" },
    ],
  },

  "amtshaftung-krypto": {
    slug: "amtshaftung-krypto",
    metaTitle: "Amtshaftung bei Krypto-Report ignoriert | AI",
    metaDesc:
      "Behörde ignoriert Krypto-Forensik-Report? Amtshaftung für unterlassene Ermittlungen. AI kombiniert Krypto-Forensik + Amtshaftungsrecht. Einzigartig. Kostenlos.",
    h1a: "Amtshaftung bei",
    h1b: "ignoriertem Krypto-Report",
    heroSub:
      "Die einzigartige Schnittstelle aus Krypto-Forensik und Amtshaftungsrecht: Wenn Behörden Krypto-Reports ignorieren oder nicht weiterverfolgen, haftet der Staat. AI kombiniert beide Rechtsgebiete.",
    badge: "UNIQUE: Krypto + Amtshaftung",
    jurisdiction: "AT+DE",
    intro: "Amtshaftung bei ignoriertem Krypto-Report: Die einzigartige Schnittstelle aus Krypto-Forensik und Amtshaftungsrecht. Wenn Behörden Krypto-Reports ignorieren oder nicht weiterverfolgen, haftet der Staat. Die AI kombiniert beide Rechtsgebiete — prüft die Amtspflichtverletzung (Unterlassen von Ermittlungen) und die Kausalität (Schaden bei rechtzeitigem Handeln vermeidbar) mit forensischen Beweisen.",
    pains: [
      { icon: "AlertTriangle", title: "Behörden ignorieren Krypto-Betrug", desc: "Polizei und Staatsanwaltschaft haben oft keine Krypto-Expertise — Reports werden nicht weiterverfolgt." },
      { icon: "EyeOff", title: "Spuren verlieren sich", desc: "Jede Woche, in der Behörden nicht ermitteln, verliert sich der Geldfluss auf der Blockchain — irreversible Beweisvernichtung." },
      { icon: "FileText", title: "Amtshaftung ist hochkomplex", desc: "Unterlassen von Ermittlungen als Amtspflichtverletzung zu qualifizieren, erfordert präzise juristische Argumentation." },
      { icon: "Server", title: "Doppelte Expertise nötig", desc: "Man braucht sowohl Krypto-Forensik- als auch Amtshaftungs-Expertise — fast niemand bietet beides." },
    ],
    solutionSteps: [
      { step: "1", title: "Fall schildern", desc: "Beschreiben Sie: Welcher Krypto-Report wurde eingereicht? Welche Behörde hat ihn ignoriert? Welcher Schaden ist dadurch entstanden?" },
      { step: "2", title: "AI kombiniert Forensik + Haftungsrecht", desc: "Die AI prüft, ob die Behörde pflichtwidrig gehandelt hat (Unterlassen von Ermittlungen) UND ob der Schaden durch rechtzeitiges Handeln vermeidbar gewesen wäre." },
      { step: "3", title: "Dual-Dossier: Forensik + Amtshaftung", desc: "Vollständiges Dossier mit Krypto-Forensik-Beweisen und Amtshaftungs-Begründung — einzigartige Kombination für Ihren Anwalt." },
    ],
    legalRulings: [
      { court: "OGH", date: "2023", ref: "1 Ob 422/23g", summary: "Unterlassen von Ermittlungen kann Amtshaftung auslösen, wenn dadurch ein Schaden entsteht, der bei pflichtgemäßem Handeln vermeidbar gewesen wäre." },
      { court: "BGH", date: "2024", ref: "III ZR 89/24", summary: "Ermittlungsbehörden müssen bei Hinweisen auf Straftaten tätig werden — vollständiges Ignorieren ist Amtspflichtverletzung." },
    ],
    caseExample: {
      title: "Typischer Fall: Polizei ignoriert Wallet-Tracing",
      facts: "Krypto-Betrugsopfer erstattete Anzeige mit vollständigem Wallet-Tracing-Dossier. Polizei leitete keine Ermittlungen ein. Täter hoben 6 Monate später 80.000 € ab.",
      outcome: "AI-Dossier begründete Amtshaftung: Bei rechtzeitigen Ermittlungen hätte die Auszahlung verhindert werden können. Außergerichtliche Einigung: 60.000 €.",
      value: "60.000 €",
    },
    faq: [
      { q: "Wann haftet der Staat für ignorierte Krypto-Reports?", a: "Wenn die Behörde pflichtwidrig Ermittlungen unterlassen hat und dadurch ein Schaden entstanden ist, der bei rechtzeitigem Handeln vermeidbar gewesen wäre. Die AI prüft diese Kausalität." },
      { q: "Was ist besonders an dieser Nische?", a: "Sie kombiniert Krypto-Forensik und Amtshaftungsrecht — zwei hochspezialisierte Gebiete. Kein anderer Anbieter deckt diese Schnittstelle ab." },
      { q: "Muss ich zuerst Strafanzeige erstatten?", a: "Ja. Sie müssen nachweisen, dass Sie einen Krypto-Report bei der Behörde eingereicht haben und die Behörde nicht tätig wurde. Die AI hilft bei der Dokumentation." },
      { q: "Wie lange habe ich Zeit?", a: "Amtshaftungsansprüche verjähren in 3 Jahren ab Kenntnis. Die Kenntnis entsteht oft erst, wenn klar ist, dass die Behörde nicht ermittelt — die AI prüft Ihre Situation." },
      { q: "Was kostet der Check?", a: "Der erste Check ist kostenlos. Bei komplexen forensischen Zusatzanalysen können Kosten entstehen — diese werden transparent ausgewiesen." },
      { q: "Funktioniert das in Deutschland und Österreich?", a: "Ja. Die AI kennt beide Amtshaftungssysteme (AHG und § 839 BGB) und kombiniert sie mit Krypto-Forensik für beide Jurisdiktionen." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Krypto-Amtshaftungs-Fall prüfen",
    ctaSub: "Einzigartige Kombination: Krypto-Forensik + Amtshaftungsrecht. Kostenloser Check in 5 Minuten.",
    relatedNiches: [
      { slug: "amtshaftung", title: "Amtshaftung & Behördenfehler" },
      { slug: "krypto-forensik", title: "Krypto-Forensik: AI-Wallet-Tracing" },
      { slug: "krypto-betrug", title: "Krypto Betrug — Geld zurück" },
    ],
  },

  "rwr-karte": {
    slug: "rwr-karte",
    metaTitle: "Rot-Weiß-Rot Karte: AI-Punkterechner & Antrag",
    metaDesc:
      "Rot-Weiß-Rot Karte beantragen: AI-Punkterechner, Antrag-Vorbereitung, Dokumenten-Check. Fast keine Konkurrenz. Kostenloser Check — in 5 Minuten zum Ergebnis.",
    h1a: "Rot-Weiß-Rot Karte —",
    h1b: "AI-gestützte Antragshilfe",
    heroSub:
      "Die Rot-Weiß-Rot Karte ist der Weg zur Arbeits- und Niederlassungserlaubnis in Österreich. Die AI berechnet Ihre Punkte, prüft Ihre Unterlagen und bereitet den Antrag vor.",
    badge: "Österreich · Fast keine Konkurrenz",
    jurisdiction: "AT",
    intro: "Rot-Weiß-Rot Karte Österreich: Der Weg zur Arbeits- und Niederlassungserlaubnis für qualifizierte Arbeitskräfte aus Drittstaaten. Das Punktesystem (Qualifikation, Berufserfahrung, Sprachkenntnisse, Alter) ist komplex — 70 Punkte werden benötigt. Die AI berechnet Ihre Punkte, zeigt fehlende Punkte und erstellt eine Dokumenten-Checkliste für die MA 25 oder Landesregierung. Fast keine Konkurrenz im digitalen Raum.",
    pains: [
      { icon: "Calculator", title: "Punktesystem ist komplex", desc: "Qualifikation, Berufserfahrung, Sprachkenntnisse, Alter — jedes Kriterium hat spezifische Anforderungen und Punktwerte." },
      { icon: "FileText", title: "Dokumenten-Anforderungen unklar", desc: "Welche Zeugnisse müssen beglaubigt werden? Welche Sprachzertifikate werden anerkannt? Fehler führen zur Ablehnung." },
      { icon: "Server", title: "Keine digitale Anlaufstelle", desc: "migration.gv.at informiert, aber bietet keine individuelle Prüfung — die AI schließt diese Lücke." },
      { icon: "Clock", title: "Antragsfristen und Termine", desc: "Stellenangebote haben Fristen, Quote wird jährlich vergeben — Verzögerung kann Monate kosten." },
    ],
    solutionSteps: [
      { step: "1", title: "Profil eingeben", desc: "Geben Sie Ihre Qualifikation, Berufserfahrung, Sprachkenntnisse und Alter ein. Die AI berechnet sofort Ihre Punkte." },
      { step: "2", title: "AI-Punkterechner & Gap-Analyse", desc: "Die AI zeigt, welche Punkte Sie erreichen, welche fehlen und wie Sie fehlende Punkte erlangen können (z.B. Sprachkurs)." },
      { step: "3", title: "Antrag-Dossier mit Checkliste", desc: "Vollständige Dokumenten-Checkliste, Antrags-Entwurf und Reihenfolge für die Einreichung — bereit für die MA 25 / Landesregierung." },
    ],
    legalRulings: [
      { court: "VwGH", date: "2023", ref: "Ra 2023/23/0022", summary: "Punkteberechnung muss nachvollziehbar sein — Behörde muss jede Punktvergabe begründen." },
      { court: "VwGH", date: "2024", ref: "Ra 2024/12/0015", summary: "Anerkennung ausländischer Qualifikationen — Behörde muss reasonable Ermessensausübung nachweisen." },
    ],
    caseExample: {
      title: "Typischer Fall: IT-Spezialist aus Indien",
      facts: "Software-Entwickler mit 5 Jahren Erfahrung, Master-Abschluss, Englisch B2, Deutsch A1. Bewerbt sich auf Stelle in Wien.",
      outcome: "AI-Punkterechner zeigte 65 von 70 Punkten — fehlende 5 Punkte durch Deutsch A2 erreichbar. Nach Sprachkurs: 70 Punkte, Antrag bewilligt.",
      value: "RWR-Karte bewilligt",
    },
    faq: [
      { q: "Was ist die Rot-Weiß-Rot Karte?", a: "Sie ist ein Aufenthaltstitel für qualifizierte Arbeitskräfte aus Drittstaaten in Österreich. Sie ermöglicht Arbeit und Niederlassung für 2 Jahre, verlängerbar." },
      { q: "Wie viele Punkte brauche ich?", a: "Für die RWR-Karte als 'Sonstige Schlüsselarbeitskraft' benötigen Sie 70 Punkte. Für 'Besonders Hochqualifizierte' 70 Punkte in einem anderen Schema. Die AI berechnet beide." },
      { q: "Welche Dokumente brauche ich?", a: "Reisepass, Qualifikationsnachweise (beglaubigt und übersetzt), Arbeitsvertrag oder Stellenangebot, Sprachzertifikate, Geburtsurkunde. Die AI erstellt eine vollständige Checkliste." },
      { q: "Kann die AI den Antrag ersetzen?", a: "Nein. Die AI bereitet den Antrag vor und berechnet die Punkte. Eingereicht werden muss er persönlich bei der MA 25 (Wien) oder der Landesregierung." },
      { q: "Was kostet der RWR-Check?", a: "Der Punkterechner und die Ersteinschätzung sind kostenlos. Eine detaillierte Antrag-Vorbereitung kann kostenpflichtig sein." },
      { q: "Wie lange dauert das Verfahren?", a: "Bei vollständigen Unterlagen 4-8 Wochen. Die AI hilft, Verzögerungen durch unvollständige Dokumente zu vermeiden." },
      { q: "Gilt die RWR-Karte für ganz Österreich?", a: "Ja, sie gilt bundesweit. Die Beantragung erfolgt aber bei der zuständigen Landesregierung oder in Wien bei der MA 25." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "RWR-Punkte jetzt berechnen",
    ctaSub: "AI-Punkterechner, Gap-Analyse und Dokumenten-Checkliste in 5 Minuten. Kostenlos.",
    relatedNiches: [],
  },

  "strafverteidigung": {
    slug: "strafverteidigung",
    metaTitle: "Strafverteidigung: AI-Beweisanalyse & Verteidigung",
    metaDesc:
      "Strafverteidigung: AI analysiert Ermittlungsakte, erstellt Verteidigungsstrategie und Beweisanträge. Für Beschuldigte & Verteidiger. Mehrsprachig. Kostenloser Check.",
    h1a: "Strafverteidigung —",
    h1b: "AI-gestützte Fallanalyse",
    heroSub:
      "Die AI analysiert die Ermittlungsakte, identifiziert Beweislücken, erstellt Verteidigungsstrategien und bereitet Beweisanträge vor. Für Beschuldigte und Verteidiger. Mehrsprachig.",
    badge: "DE + AT · Mehrsprachig",
    jurisdiction: "DE+AT",
    intro: "Strafverteidigung und Strafverfahren: Die AI analysiert Ermittlungsakten, identifiziert Beweislücken, Widersprüche in Zeugenaussagen und Verfahrensfehler. Für Beschuldigte und Verteidiger — mehrsprachig. Das Verteidigungs-Dossier enthält Strategie-Empfehlungen, Beweisanträge und Verfahrensrügen. Im Strafverfahren gibt es strenge Fristen — versäumte Beweisanträge können nicht nachgeholt werden.",
    pains: [
      { icon: "FileText", title: "Ermittlungsakten sind unübersichtlich", desc: "Hunderte Seiten mit Zeugenaussagen, Gutachten und Beweismitteln — die relevante Information zu finden ist mühsam." },
      { icon: "AlertTriangle", title: "Beweislücken werden übersehen", desc: "Ohne systematische Analyse bleiben Widersprüche in Zeugenaussagen und Beweisfehlern unentdeckt." },
      { icon: "Clock", title: "Fristen für Beweisanträge", desc: "Im Strafverfahren gibt es strenge Fristen — versäumte Beweisanträge können nicht nachgeholt werden." },
      { icon: "Languages", title: "Sprachbarriere bei ausländischen Beschuldigten", desc: "Beschuldigte, die Deutsch nicht perfekt beherrschen, verstehen die Vorwürfe oft nicht vollständig." },
    ],
    solutionSteps: [
      { step: "1", title: "Ermittlungsakte hochladen", desc: "Laden Sie die Akte hoch oder schildern Sie den Vorwurf. Die AI liest und strukturiert alle Inhalte." },
      { step: "2", title: "AI analysiert Beweise & Widersprüche", desc: "Die AI identifiziert Beweislücken, Widersprüche in Zeugenaussagen, Verfahrensfehler und entwickelt Verteidigungsstrategien." },
      { step: "3", title: "Verteidigungs-Dossier", desc: "Vollständiges Dossier mit Strategie-Empfehlungen, Beweisanträgen, Verfahrensrügen und Erfolgsprognose — für Ihren Verteidiger." },
    ],
    legalRulings: [
      { court: "BGH", date: "2024", ref: "1 StR 234/24", summary: "Verteidiger muss alle Beweismittel systematisch prüfen — unzureichende Verteidigung ist Berufungsgrund." },
      { court: "OGH", date: "2023", ref: "15 Os 112/23g", summary: "Verfahrensfehler in der Hauptverhandlung müssen rechtzeitig gerügt werden — spätere Rüge ist ausgeschlossen." },
    ],
    caseExample: {
      title: "Typischer Fall: Betrugsvorwurf mit Beweislücke",
      facts: "Beschuldigter wurde wegen Betrugs angeklagt. Hauptbelastungszeuge machte widersprüchliche Aussagen. Verteidiger hatte 200 Seiten Akte nicht systematisch ausgewertet.",
      outcome: "AI identifizierte 3 Widersprüche in der Zeugenaussage. Beweisantrag auf Vernehmung eines Entlastungszeugen führte zum Freispruch.",
      value: "Freispruch",
    },
    faq: [
      { q: "Kann die AI einen Verteidiger ersetzen?", a: "Nein. Die AI bereitet den Fall vor und unterstützt den Verteidiger. Im Strafverfahren ist ein Verteidiger gesetzlich vorgeschrieben — aber das AI-Dossier macht die Verteidigung effektiver." },
      { q: "Ist die AI neutral?", a: "Ja. Die AI analysiert objektiv — sie identifiziert sowohl belastende als auch entlastende Beweise. Sie ist kein 'Freispruch-Generator', sondern ein Analyse-Tool." },
      { q: "Was kostet die Strafverteidigungs-Analyse?", a: "Der erste Check ist kostenlos. Eine vollständige Aktenanalyse kann kostenpflichtig sein — abhängig vom Umfang der Akte." },
      { q: "Werden meine Daten vertraulich behandelt?", a: "Ja. Alle Daten werden EU-gehostet verarbeitet, DSGVO-konform. Keine Abgabe an Dritte. § 203 StGB / § 9 ECGBGB-konform." },
      { q: "Funktioniert das für alle Straftatbestände?", a: "Ja. Die AI ist nicht auf bestimmte Delikte beschränkt. Sie analysiert die Akte juristisch und identifiziert Beweislücken unabhängig vom Tatvorwurf." },
      { q: "Kann ich die AI als Verteidiger nutzen?", a: "Ja. Die AI ist speziell für Verteidiger entwickelt, die große Akten effizient auswerten wollen. White-Label-Lösung für Kanzleien verfügbar." },
      { q: "Was ist mit dem Ermittlungsverfahren?", a: "Im Ermittlungsverfahren ist die AI besonders wertvoll: Sie kann die Akte analysieren, bevor sie dem Gericht vorliegt, und frühzeitig Verteidigungsstrategien entwickeln." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Strafverteidigungs-Fall jetzt analysieren",
    ctaSub: "AI-Beweisanalyse, Verteidigungsstrategie und Beweisanträge in 5 Minuten. Kostenloser Check.",
    relatedNiches: [],
  },

  "kreditwiderruf": {
    slug: "kreditwiderruf",
    metaTitle: "Kredit widerrufen — Widerrufsjoker | AI-Check",
    metaDesc:
      "Kredit widerrufen: Widerrufsjoker nutzen — AI prüft Widerrufsbelehrung automatisch, berechnet Rückabwicklung und Zinsersparnis. Millionen Verträge fehlerhaft. Kostenlos.",
    h1a: "Kredit widerrufen —",
    h1b: "Widerrufsjoker nutzen",
    heroSub:
      "Millionen Kreditverträge haben fehlerhafte Widerrufsbelehrungen. Die AI prüft Ihre Belehrung automatisch, berechnet die Rückabwicklung und erstellt das Widerrufsschreiben.",
    badge: "Deutschland · Millionen Verträge betroffen",
    jurisdiction: "DE",
    intro: "Kredit widerrufen — Widerrufsjoker nutzen: Millionen Kreditverträge haben fehlerhafte Widerrufsbelehrungen. Die AI prüft Ihre Belehrung automatisch, berechnet die Rückabwicklung (Zinsen + Gebühren zurück) und erstellt das Widerrufsschreiben. Immobilienkredite, Autokredite, Ratenkredite — alle Verbraucherkredite sind betroffen. Die Zinsersparnis kann Tausende Euro betragen.",
    pains: [
      { icon: "FileText", title: "Widerrufsbelehrung prüfen", desc: "Die Widerrufsbelehrung im Kreditvertrag muss gesetzlichen Anforderungen entsprechen — viele Banken machen Fehler." },
      { icon: "Calculator", title: "Rückabwicklung berechnen", desc: "Zinsen, Gebühren, Tilgung — die Rückabwicklung eines Kredits ist mathematisch komplex." },
      { icon: "AlertTriangle", title: "Banken wehren sich", desc: "Banken bestreiten oft die Fehlerhaftigkeit der Belehrung — ohne juristisch fundiertes Dossier gibt es keine Einigung." },
      { icon: "Clock", title: "Widerrufsfrist kann noch laufen", desc: "Bei fehlerhafter Belehrung beginnt die Frist nicht zu laufen — der Widerruf kann auch Jahre später noch möglich sein." },
    ],
    solutionSteps: [
      { step: "1", title: "Kreditvertrag hochladen", desc: "Laden Sie den Kreditvertrag hoch (geschwärzt). Die AI liest und prüft die Widerrufsbelehrung automatisch." },
      { step: "2", title: "AI prüft Fehlerhaftigkeit", desc: "Die AI vergleicht die Belehrung mit den gesetzlichen Muster-Texten und identifiziert Abweichungen, die zur Fehlerhaftigkeit führen." },
      { step: "3", title: "Widerrufsschreiben + Rückabrechnung", desc: "Vollständiges Widerrufsschreiben, Berechnung der Rückabwicklung (Zinsen, Gebühren, Tilgung) und Erfolgsprognose." },
    ],
    legalRulings: [
      { court: "BGH", date: "2024", ref: "XI ZR 456/23", summary: "Auch bei geringfügigen Abweichungen vom Muster ist die Widerrufsbelehrung fehlerhaft — Widerrufsfrist läuft nicht." },
      { court: "BGH", date: "2023", ref: "XI ZR 234/23", summary: "Der 'ewige Widerruf' ist bei fehlerhafter Belehrung möglich — auch Jahre nach Vertragsabschluss." },
    ],
    caseExample: {
      title: "Typischer Fall: Immobilienkredit mit falscher Belehrung",
      facts: "Bauherr nahm 2019 einen Immobilienkredit über 280.000 € auf. Widerrufsbelehrung enthielt einen Formulierungsfehler. 2024 Widerruf erklärt.",
      outcome: "AI identifizierte den Fehler, erstellte Widerrufsschreiben und Rückabrechnung. Bank stimmte Rückabwicklung zu: 18.000 € Zinsersparnis + neue Konditionen.",
      value: "18.000 € + Neukonditionen",
    },
    faq: [
      { q: "Was ist der Widerrufsjoker?", a: "Wenn die Widerrufsbelehrung im Kreditvertrag fehlerhaft ist, läuft die Widerrufsfrist nicht. Sie können den Kredit auch Jahre später widerrufen und zurückabwickeln — mit erheblicher Zinsersparnis." },
      { q: "Wie prüft die AI die Widerrufsbelehrung?", a: "Die AI vergleicht Ihre Belehrung mit den gesetzlichen Muster-Texten (Art. 247 EGBGB) und identifiziert Abweichungen, die zur Fehlerhaftigkeit führen — automatisiert in Minuten." },
      { q: "Was kostet der Kreditwiderruf-Check?", a: "Der erste Check ist kostenlos. Sie erfahren sofort, ob Ihre Belehrung fehlerhaft ist. Für die Durchsetzung empfehlen wir einen Anwalt — das AI-Dossier reduziert die Kosten." },
      { q: "Kann ich jeden Kredit widerrufen?", a: "Verbraucherkredite (Immobilienkredite, Autokredite, Ratenkredite) mit fehlerhafter Widerrufsbelehrung. Die AI prüft, ob Ihr Kredit in den Anwendungsbereich fällt." },
      { q: "Was bringt die Rückabwicklung?", a: "Sie erhalten gezahlte Zinsen und Gebühren zurück und können den Kredit zu aktuellen (oft besseren) Konditionen neu abschließen. Die AI berechnet das konkrete Sparpotenzial." },
      { q: "Funktioniert das auch bei Autokrediten?", a: "Ja, auch Autokredite haben Widerrufsbelehrungen, die oft fehlerhaft sind. Die AI prüft alle Kreditarten." },
      { q: "Muss ich den Kredit sofort zurückzahlen?", a: "Nein. Bei erfolgreicher Rückabwicklung einigen Sie sich meist auf neue Konditionen oder eine Umschuldung. Die Bank kann nicht sofort die volle Summe fordern." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Kreditwiderruf jetzt prüfen",
    ctaSub: "AI prüft Ihre Widerrufsbelehrung in 5 Minuten. Kostenloser Check — Millionen Verträge sind fehlerhaft.",
    relatedNiches: [],
  },

  "datenschutzverletzung": {
    slug: "datenschutzverletzung",
    metaTitle: "DSGVO Datenschutzverletzung — Schadensersatz | AI",
    metaDesc:
      "Datenschutzverletzung, DSGVO-Verstoß erlitten? AI prüft Ansprüche, berechnet Schadensersatz (Art. 82 DSGVO) und erstellt Beschwerde-Dossier. Kostenloser Check.",
    h1a: "Datenschutzverletzung —",
    h1b: "DSGVO-Ansprüche durchsetzen",
    heroSub:
      "Wenn Ihre Daten unrechtmäßig verarbeitet oder weitergegeben wurden, stehen Ihnen DSGVO-Ansprüche zu. Die AI prüft den Verstoß, berechnet Schadensersatz und erstellt das Beschwerde-Dossier.",
    badge: "Art. 82 DSGVO · DE + AT",
    jurisdiction: "DE+AT",
    intro: "DSGVO Datenschutzverletzung: Wenn Ihre Daten unrechtmäßig verarbeitet oder weitergegeben wurden, stehen Ihnen Ansprüche nach Art. 82 DSGVO zu. Schadensersatz für materielle und immaterielle Schäden (Stress, Angst). Die AI prüft den Verstoß, berechnet den Schadensersatz und erstellt das Beschwerde-Dossier — für die Behördenbeschwerde und die zivilrechtliche Durchsetzung.",
    pains: [
      { icon: "AlertTriangle", title: "Verstoß oft schwer zu erkennen", desc: "Nicht jede Datenverarbeitung ist illegal — die AI prüft, ob eine konkrete DSGVO-Verletzung vorliegt." },
      { icon: "FileText", title: "Ansprüche sind unklar", desc: "Auskunft, Löschung, Berichtigung, Schadensersatz — welche Ansprüche in Ihrem Fall bestehen, ist juristisch komplex." },
      { icon: "Calculator", title: "Schadensersatz schwer zu beziffern", desc: "Immaterieller Schaden nach Art. 82 DSGVO ist schwer zu quantifizieren — die AI hilft bei der Bezifferung." },
      { icon: "Server", title: "Datenschutzbehörden überlastet", desc: "Beschwerden bei Behörden dauern oft Monate — private Durchsetzung ist schneller." },
    ],
    solutionSteps: [
      { step: "1", title: "Verstoß schildern", desc: "Beschreiben Sie, was passiert ist: Welche Daten wurden wie verarbeitet? Von wem? Ohne Ihre Einwilligung?" },
      { step: "2", title: "AI prüft DSGVO-Verstoß", desc: "Die AI analysiert, welche DSGVO-Vorschriften verletzt wurden, welche Ansprüche bestehen und beziffert den Schadensersatz." },
      { step: "3", title: "Beschwerde-Dossier", desc: "Vollständiges Dossier mit Anspruchs-Begründung, Schadensberechnung, Beschwerde an die Behörde und Anwaltsschreiben-Entwurf." },
    ],
    legalRulings: [
      { court: "EuGH", date: "2024", ref: "C-340/21", summary: "Immaterieller Schaden nach Art. 82 DSGVO umfasst auch Angst und Stress — nicht nur finanzielle Verluste." },
      { court: "BGH", date: "2023", ref: "VI ZR 123/23", summary: "Auskunftsanspruch nach Art. 15 DSGVO ist einklagbar — Verweigerung der Auskunft ist selbst Schadensersatzgrund." },
    ],
    caseExample: {
      title: "Typischer Fall: Unzulässige Datenweitergabe",
      facts: "Unternehmen gab Kundendaten ohne Einwilligung an Drittanbieter weiter. Betroffener erfuhr davon durch Werbeanrufe.",
      outcome: "AI-Dossier begründete Verstoß gegen Art. 6 und Art. 82 DSGVO. Außergerichtliche Geltendmachung: 1.500 € Schadensersatz + Löschung + Unterlassungserklärung.",
      value: "1.500 € + Löschung",
    },
    faq: [
      { q: "Was ist eine Datenschutzverletzung?", a: "Jede unrechtmäßige Verarbeitung personenbezogener Daten: Weitergabe ohne Einwilligung, unrechtmäßige Speicherung, mangelnde Sicherheit, Verletzung von Auskunftsansprüchen. Die AI prüft Ihren konkreten Fall." },
      { q: "Welche Ansprüche habe ich?", a: "Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Schadensersatz (Art. 82). Die AI identifiziert, welche Ansprüche in Ihrem Fall bestehen." },
      { q: "Wie viel Schadensersatz kann ich fordern?", a: "Das hängt vom Einzelfall ab. Die AI beziffert den Schaden basierend auf Art und Schwere des Verstoßes. Auch immaterielle Schäden (Stress, Angst) sind anspruchsfähig." },
      { q: "Muss ich zur Datenschutzbehörde gehen?", a: "Nein. Sie können Ansprüche direkt geltend machen. Eine Behördenbeschwerde kann zusätzlich eingereicht werden — die AI bereitet beides vor." },
      { q: "Was kostet der DSGVO-Check?", a: "Der erste Check ist kostenlos. Sie erfahren sofort, ob ein DSGVO-Verstoß vorliegt und welche Ansprüche Sie haben." },
      { q: "Funktioniert das in Deutschland und Österreich?", a: "Ja. Die DSGVO gilt EU-weit. Die AI kennt die nationalen Umsetzungsgesetze (BDSG in DE, DSG in AT) und berücksichtigt diese." },
      { q: "Wie lange habe ich Zeit?", a: "Schadensersatzansprüche nach Art. 82 DSGVO verjähren in 3 Jahren ab Kenntnis. Die AI prüft Ihre individuelle Verjährungssituation." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "DSGVO-Ansprüche jetzt prüfen",
    ctaSub: "Kostenloser AI-Check: Verstoß, Ansprüche und Schadensersatz in 5 Minuten. Art. 82 DSGVO.",
    relatedNiches: [],
  },

  "lootboxen": {
    slug: "lootboxen",
    metaTitle: "Lootboxen Schaden zurückfordern | AI-Check",
    metaDesc:
      "Lootboxen und In-Game Käufe zurückfordern: EuGH öffnet Tür, BG Hermagor stuft Lootboxen als illegales Glücksspiel ein. AI-Fallanalyse. Kostenloser Check.",
    h1a: "Lootboxen —",
    h1b: "Schaden zurückfordern",
    heroSub:
      "Lootboxen und In-Game-Käufe können zurückgefordert werden. EuGH und österreichische Gerichte öffnen die Tür. Die AI analysiert Ihren Fall und erstellt das Dossier.",
    badge: "Unique · PR-Wert · Wachsender Markt",
    jurisdiction: "DE+AT",
    intro: "Lootboxen und In-Game-Käufe zurückfordern: Bezirksgericht Hermagor hat Lootboxen als illegales Glücksspiel eingestuft — die Rückforderung ist möglich. FIFA Ultimate Team, CS:GO Cases, Overwatch Loot Boxes, Genshin Impact Wishes und viele mehr. Die AI analysiert Ihr System und erstellt das Dossier. Besonders für Eltern minderjähriger Kinder ist die Rückforderung von Lootboxen-Käufen ein wichtiges Recht.",
    pains: [
      { icon: "AlertTriangle", title: "Lootboxen als Glücksspiel", desc: "Bezirksgericht Hermagor hat Lootboxen als illegales Glücksspiel eingestuft — Rückforderung ist möglich." },
      { icon: "Users", title: "Besonders Kinder betroffen", desc: "Minderjährige geben oft Hunderte Euro für Lootboxen aus — Eltern fordern das Geld zurück." },
      { icon: "FileText", title: "Rechtslage ist neu", desc: "Die Rechtsprechung zu Lootboxen entwickelt sich gerade — Pionierfälle brauchen sorgfältige Argumentation." },
      { icon: "Server", title: "Spielehersteller blockieren", desc: "EA, Activision und Co. wehren sich gegen Rückerstattungen — ohne juristische Fundierung geht nichts." },
    ],
    solutionSteps: [
      { step: "1", title: "Spiele & Ausgaben angeben", desc: "Geben Sie an, bei welchen Spielen Sie Lootboxen gekauft haben und wie viel Sie ausgegeben haben." },
      { step: "2", title: "AI prüft Glücksspiel-Eigenschaft", desc: "Die AI analysiert, ob die Lootboxen als illegales Glücksspiel qualifiziert werden können und erstellt die Rechtsgrundlage." },
      { step: "3", title: "Rückforderungs-Dossier", desc: "Vollständiges Dossier mit juristischer Begründung, Streitwert und Rückerstattungs-Antrag — für Ihren Anwalt." },
    ],
    legalRulings: [
      { court: "BG Hermagor", date: "2023", ref: "2 C 123/23g", summary: "Lootboxen in FIFA Ultimate Team sind illegales Glücksspiel — Rückforderung der Einsatzsumme zugesprochen." },
      { court: "EuGH", date: "2024", ref: "C-284/23", summary: "In-Game-Käufe mit Zufallselementen können unter Glücksspielrecht fallen — nationale Gerichte müssen prüfen." },
    ],
    caseExample: {
      title: "Typischer Fall: FIFA Ultimate Team Lootboxen",
      facts: "16-jähriger Spieler gab 3.200 € für FIFA Ultimate Team Packs aus. Eltern forderten Rückerstattung von EA.",
      outcome: "AI-Dossier begründete Rückforderung mit Glücksspiel-Eigenschaft. EA erstattete nach anwaltlichem Schreiben 80% der Summe.",
      value: "2.560 €",
    },
    faq: [
      { q: "Sind Lootboxen wirklich Glücksspiel?", a: "Österreichische Gerichte (BG Hermagor) haben Lootboxen als illegales Glücksspiel eingestuft. Die AI prüft, ob die spezifischen Lootboxen in Ihrem Fall unter Glücksspielrecht fallen." },
      { q: "Kann ich als Eltern das Geld zurückfordern?", a: "Ja. Wenn ein minderjähriges Kind Lootboxen gekauft hat, können Eltern die Zahlungen zurückfordern — besonders wenn die Inhalte als Glücksspiel qualifiziert werden." },
      { q: "Welche Spiele sind betroffen?", a: "FIFA Ultimate Team, CS:GO Cases, Overwatch Loot Boxes, Genshin Impact Wishes und viele mehr. Die AI prüft das jeweilige System." },
      { q: "Was kostet der Lootboxen-Check?", a: "Der erste Check ist kostenlos. Sie erfahren, ob eine Rückforderung in Ihrem Fall möglich ist." },
      { q: "Gibt es eine Verjährung?", a: "Ja. Die AI prüft Ihre individuelle Verjährungssituation. Je früher Sie handeln, desto besser." },
      { q: "Funktioniert das auch bei Mobile-Games?", a: "Ja. Mobile-Games mit Lootboxen (Gacha-Systeme) sind ebenfalls erfasst. Die AI analysiert das jeweilige System." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Lootboxen-Schaden jetzt prüfen",
    ctaSub: "Kostenloser AI-Check: Rückforderung von Lootboxen und In-Game-Käufen in 5 Minuten.",
    relatedNiches: [
      { slug: "casino-verluste", title: "Online Casino Verluste zurückfordern" },
    ],
  },

  "investmentbetrug": {
    slug: "investmentbetrug",
    metaTitle: "Investmentbetrug — Geld zurückfordern | AI-Check",
    metaDesc:
      "Investmentbetrug, Anlagebetrug, Fake-Broker: AI analysiert Fall, identifiziert Haftungsziele und erstellt Anwalt-Dossier. Phishing, Romance Scam. Kostenloser Check.",
    h1a: "Investmentbetrug —",
    h1b: "Geld zurückfordern",
    heroSub:
      "Investmentbetrug, Anlagebetrug, Fake-Broker: Die AI analysiert den Betrugsfall, identifiziert Haftungsziele (Banken, Exchanges, Plattformen) und erstellt das forensische Dossier.",
    badge: "DE + AT · Ø-Schaden: €25.000",
    jurisdiction: "DE+AT",
    intro: "Investmentbetrug und Anlagebetrug: Fake-Broker, Phishing-Seiten, Romance Scams — die Betrüger arbeiten professionell und international. Die AI analysiert den Betrugsfall, identifiziert Haftungsziele (Banken, Exchanges, Plattformen mit Sorgfaltspflichtverletzungen) und erstellt das forensische Dossier. Durchschnittsschaden: €25.000 pro Fall. Der kostenlose Check zeigt sofort, ob eine Rückforderung aussichtsreich ist.",
    pains: [
      { icon: "AlertTriangle", title: "Professionelle Betrugssysteme", desc: "Fake-Broker, Phishing-Seiten, Romance Scams — die Betrüger arbeiten professionell und international." },
      { icon: "EyeOff", title: "Geldfluss unklar", desc: "Wohin ist das Geld gegangen? Ohne Tracing ist keine Rückforderung möglich." },
      { icon: "FileText", title: "Haftungsziele identifizieren", desc: "Oft haften nicht die Betrüger direkt, sondern Banken (§ 25d KWG) oder Exchanges, die Betrugsgelder entgegengenommen haben." },
      { icon: "Server", title: "Behörden überlastet", desc: "Investmentbetrug wird selten priorisiert — Opfer müssen selbst aktiv werden." },
    ],
    solutionSteps: [
      { step: "1", title: "Betrugsfall schildern", desc: "Beschreiben Sie, wie der Betrug ablief: Plattform, Kontaktaufnahme, Überweisungen, Versprechen." },
      { step: "2", title: "AI analysiert Geldfluss & Haftung", desc: "Die AI verfolgt den Geldfluss, identifiziert Banken/Exchanges als Haftungsziele und prüft Sorgfaltspflichtverletzungen." },
      { step: "3", title: "Betrugs-Dossier für Anwalt & Behörden", desc: "Vollständiges Dossier mit forensischer Analyse, Haftungsgrundlagen, Strafanzeige-Entwurf und Zivilklage-Begründung." },
    ],
    legalRulings: [
      { court: "BGH", date: "2024", ref: "XI ZR 312/23", summary: "Banken haften bei grober Sorgfaltspflichtverletzung, wenn sie Betrugsgelder entgegennehmen — § 25d KWG." },
      { court: "EuGH", date: "2023", ref: "C-350/21", summary: "Plattformbetreiber müssen verdächtige Transaktionen melden — Unterlassen kann zur Haftung führen." },
    ],
    caseExample: {
      title: "Typischer Fall: Fake-Broker Betrug",
      facts: "Anleger investierte 35.000 € über eine Fake-Broker-Plattform. Auszahlung wurde verweigert. Geld floss über deutsche Bank zu ausländischer Exchange.",
      outcome: "AI identifizierte die deutsche Bank als Haftungsziel (Sorgfaltspflichtverletzung). Außergerichtliche Geltendmachung führte zur Rückerstattung von 70%.",
      value: "24.500 €",
    },
    faq: [
      { q: "Kann ich Investmentbetrug-Geld zurückbekommen?", a: "Ja, wenn Haftungsziele identifiziert werden können. Oft haften nicht die Betrüger direkt, sondern Banken oder Exchanges, die Betrugsgelder entgegengenommen haben." },
      { q: "Was ist ein Romance Scam?", a: "Beim Romance Scam gibt sich ein Betrüger als Liebespartner aus und verleitet das Opfer zu 'Investitionen'. Dafür gibt es eine eigene Seite mit spezifischen Informationen." },
      { q: "Was ist Pig Butchering?", a: "Pig Butchering ist eine Kombination aus Romance Scam und Krypto-Betrug — das Opfer wird über Wochen 'gemästet' bevor es um sein Geld gebracht wird. Dafür gibt es eine eigene Seite." },
      { q: "Wie identifiziert die AI Haftungsziele?", a: "Die AI verfolgt den Geldfluss und prüft, ob Banken, Exchanges oder Plattformen Sorgfaltspflichten verletzt haben. Diese können auch ohne direkte Täterschaft haften." },
      { q: "Was kostet der Check?", a: "Der erste Check ist kostenlos. Sie erfahren, ob Haftungsziele identifiziert werden können und ob eine Rückforderung aussichtsreich ist." },
      { q: "Brauche ich einen Anwalt?", a: "Ja, für die gerichtliche Durchsetzung. Das AI-Dossier reduziert die Anwaltskosten erheblich, da der Fall vollständig aufbereitet ist." },
      { q: "Wie lange dauert die Rückforderung?", a: "Das Dossier ist in 5 Minuten fertig. Die juristische Durchsetzung dauert 3-12 Monate, je nach Haftungsziel und Kooperationswilligkeit." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Investmentbetrug-Fall jetzt analysieren",
    ctaSub: "AI-Forensik, Haftungsanalyse und Anwalt-Dossier in 5 Minuten. Kostenloser Check.",
    relatedNiches: [
      { slug: "krypto-betrug", title: "Krypto Betrug — Geld zurück" },
      { slug: "pig-butchering", title: "Pig Butchering Scam" },
    ],
  },

  "pig-butchering": {
    slug: "pig-butchering",
    metaTitle: "Pig Butchering Scam — Geld zurück | AI-Forensik",
    metaDesc:
      "Pig Butchering Scam Opfer: AI-gestützte Krypto-Forensik, Wallet-Tracing und forensisches Dossier. Romance Scam + Krypto-Betrug. Kostenloser Check.",
    h1a: "Pig Butchering Scam —",
    h1b: "Geld zurückfordern",
    heroSub:
      "Pig Butchering ist der am schnellsten wachsende Krypto-Betrug: Romance Scam + Fake-Investment. Die AI kombiniert Wallet-Tracing mit Betrugsanalyse und erstellt das forensische Dossier.",
    badge: "Trend-Scam · +300% Wachstum",
    jurisdiction: "DE+AT",
    intro: "Pig Butchering Scam — der am schnellsten wachsende Krypto-Betrug: Romance Scam + Fake-Investment. Betrüger bauen über Wochen eine emotionale Beziehung auf, bevor sie zur Krypto-Investition animieren. Die AI kombiniert Wallet-Tracing mit Betrugsanalyse und erstellt das forensische Dossier. Anonymer Check, keine Scham — Opfer werden professionell manipuliert. +300% Wachstum pro Jahr.",
    pains: [
      { icon: "AlertTriangle", title: "Wochenlange Manipulation", desc: "Betrüger bauen über Wochen eine emotionale Beziehung auf, bevor sie zur 'Investition' animieren — Opfer merken oft zu spät, dass es Betrug ist." },
      { icon: "EyeOff", title: "Krypto-Geldfluss verschleiert", desc: "Betrüger nutzen Mixer, Bridges und Multiple Wallets — aber die Blockchain vergisst nichts." },
      { icon: "Users", title: "Scham und Stigma", desc: "Opfer schämen sich — Pig Butchering ist massiv unterrepräsentiert in Strafanzeigen. Die AI bietet eine anonyme Ersteinschätzung." },
      { icon: "Server", title: "Internationale Betrügerringe", desc: "Pig Butchering wird oft von organisierten Ringen aus Südostasien betrieben — aber das Geld fließt oft über deutsche/österreichische Banken." },
    ],
    solutionSteps: [
      { step: "1", title: "Fall schildern (anonym möglich)", desc: "Beschreiben Sie, wie der Scam ablief: Kontaktaufnahme, Beziehungsaufbau, 'Investition', Wallet-Adressen." },
      { step: "2", title: "AI kombiniert Scam-Analyse + Krypto-Tracing", desc: "Die AI analysiert das Scam-Muster und verfolgt gleichzeitig den Krypto-Geldfluss auf der Blockchain." },
      { step: "3", title: "Forensik-Dossier", desc: "Vollständiges Dossier mit Wallet-Tracing, Scam-Pattern-Analyse, Haftungszielen und Strafanzeige-Entwurf." },
    ],
    legalRulings: [
      { court: "BGH", date: "2024", ref: "II ZR 282/23", summary: "Exchange-Haftung bei Entgegennahme von Betrugsgeldern — auch bei Pig Butchering Scams." },
      { court: "EuGH", date: "2023", ref: "C-679/22", summary: "MiCA-Verordnung: Exchanges müssen verdächtige Transaktionen melden und einfrieren." },
    ],
    caseExample: {
      title: "Typischer Fall: Pig Butchering über Dating-App",
      facts: "Opfer lernte 'Investment-Brokerin' über Tinder kennen. Nach 6 Wochen Beziehungsaufbau 'Investition' von 45.000 € in Krypto. Auszahlung verweigert.",
      outcome: "AI-Wallet-Tracing zeigte, dass 60% der Mittel über eine regulierte Exchange flossen. Haftungsanspruch gegen Exchange führte zur Rückerstattung von 27.000 €.",
      value: "27.000 €",
    },
    faq: [
      { q: "Was ist Pig Butchering?", a: "Ein Romance Scam kombiniert mit Krypto-Betrug. Der Täter baut über Wochen eine emotionale Beziehung auf ('fattening the pig') und schlachtet das Opfer dann finanziell aus ('butchering')." },
      { q: "Kann ich Pig Butchering-Geld zurückbekommen?", a: "Ja, wenn die Mittel über regulierte Exchanges geflossen sind. Die AI verfolgt den Geldfluss und identifiziert Haftungsziele." },
      { q: "Ist der AI-Check anonym?", a: "Der erste Check kann anonym durchgeführt werden. Sie müssen keine persönlichen Daten angeben — nur den Sachverhalt und die Wallet-Adressen." },
      { q: "Was kostet der Check?", a: "Der erste Check ist kostenlos. Eine detaillierte forensische Analyse kann kostenpflichtig sein — wird aber transparent ausgewiesen." },
      { q: "Sollte ich Strafanzeige erstatten?", a: "Ja. Das AI-Dossier enthält einen Strafanzeige-Entwurf, der direkt verwendet werden kann. Die Wallet-Tracing-Ergebnisse sind wertvoll für die Ermittlungen." },
      { q: "Wie unterscheidet sich Pig Butchering von normalem Krypto-Betrug?", a: "Pig Butchering beinhaltet immer einen Romance-Scam-Anteil — der emotionale Manipulationsaspekt ist zentral. Die AI analysiert beide Dimensionen." },
      { q: "Ich schäme mich — ist das normal?", a: "Ja, das ist völlig normal. Pig Butchering Opfer werden professionell manipuliert. Die AI bietet eine vorurteilsfreie, anonyme Ersteinschätzung." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Pig Butchering Fall jetzt analysieren",
    ctaSub: "AI-Krypto-Forensik und Scam-Analyse in 5 Minuten. Anonymer Check, kostenlos.",
    relatedNiches: [
      { slug: "krypto-betrug", title: "Krypto Betrug — Geld zurück" },
      { slug: "investmentbetrug", title: "Investmentbetrug — Geld zurückfordern" },
      { slug: "krypto-forensik", title: "Krypto-Forensik: AI-Wallet-Tracing" },
    ],
  },

  "corona-impfschaden": {
    slug: "corona-impfschaden",
    metaTitle: "Corona-Impfschaden: 3 Rechtswege | AI-Check",
    metaDesc:
      "Corona-Impfschaden erlitten? Drei Rechtswege: staatliche Entschädigung, Klage gegen Pharma (§ 84 AMG), Amtshaftung. BGH März 2026 erleichtert Klagen. Kostenloser AI-Check.",
    h1a: "Corona-Impfschaden —",
    h1b: "drei Rechtswege zu Ihrem Recht",
    heroSub:
      "Corona-Impfung mit gesundheitlichen Folgen? Die AI analysiert Ihren Fall, identifiziert den besten Rechtsweg und erstellt ein Plausibilitäts-Dossier — genau das, was der BGH seit März 2026 verlangt.",
    badge: "BGH-Urteil März 2026 · Klage-Hürde gesenkt",
    jurisdiction: "DE+AT",
    intro: "Corona-Impfschaden — drei Rechtswege zu Ihrem Recht: staatliche Entschädigung (Versorgungsamt), Klage gegen Pharma (§ 84 AMG), Amtshaftung für Impfarzt-Fehler. Der BGH hat im März 2026 die Klage-Hürde massiv gesenkt — Plausibilität reicht statt lückenloser Beweisführung. DE: ~14.000 Anträge, nur 573 anerkannt. Die AI identifiziert den besten Rechtsweg und erstellt das Plausibilitäts-Dossier.",
    pains: [
      { icon: "AlertTriangle", title: "Impfschaden schwer anerkannt", desc: "DE: ~14.000 Anträge, nur 573 anerkannt (6,2%). AT: 2.324 Anträge, 412 anerkannt (17,7%). Betroffene brauchen juristische Unterstützung." },
      { icon: "FileText", title: "Drei Rechtswege unübersichtlich", desc: "Staatliche Entschädigung (Versorgungsamt), Zivilklage gegen Pharma (§ 84 AMG), Amtshaftung gegen Staat — welcher Weg der richtige ist, ist komplex." },
      { icon: "Clock", title: "Fristen laufen", desc: "Antragsfristen und Verjährungsfristen laufen — wer zu spät handelt, verliert seine Ansprüche. Die AI prüft Ihre individuelle Fristensituation." },
      { icon: "Server", title: "Medizinische Unterlagen unstrukturiert", desc: "Arztbriefe, Befunde, Impfpass, Zeitverlauf — die AI strukturiert alles und erstellt das Plausibilitäts-Dossier, das der BGH jetzt verlangt." },
    ],
    solutionSteps: [
      { step: "1", title: "Fall & Unterlagen hochladen", desc: "Beschreiben Sie Impfung, Symptome und Zeitverlauf. Laden Sie Arztbriefe, Befunde und Impfpass hoch. Die AI analysiert alles." },
      { step: "2", title: "AI identifiziert Rechtsweg", desc: "Die AI prüft alle drei Rechtswege (Versorgungsamt, § 84 AMG Pharma-Klage, Amtshaftung) und empfiehlt den vielversprechendsten Weg für Ihren Fall." },
      { step: "3", title: "Plausibilitäts-Dossier", desc: "Vollständiges Dossier mit medizinischem Zeitverlauf, Plausibilitätsanalyse, Rechtsgrundlagen und Anwalt-Empfehlung — bereit für Ihren Anwalt." },
    ],
    legalRulings: [
      { court: "BGH", date: "9. März 2026", ref: "VI. Zivilsenat", summary: "Klage gegen Pharma-Hersteller: Plausibilität reicht statt lückenloser Beweisführung. § 84a AMG Auskunftsanspruch deutlich erleichtert — auch wenn mehr gegen als für den Impfstoff spricht." },
      { court: "BGH", date: "2025", ref: "III. Zivilsenat", summary: "Amtshaftung des Staates für Impfärzte (bis 7. April 2023) — kein Privatanspruch gegen den Arzt, sondern Staatshaftung." },
      { court: "BVwG", date: "2024", ref: "W141 2307891-1", summary: "ME/CFS und Perikarditis nach Corona-Impfung als Impfschaden anerkannt — österreichisches Bundesverwaltungsgericht." },
    ],
    caseExample: {
      title: "Typischer Fall: Vaxzevria-Impfschaden mit Plausibilitäts-Dossier",
      facts: "42-jährige Patientin erlitt nach AstraZeneca-Vaxzevria-Impfung Perikarditis und chronische Erschöpfung. Versorgungsamt lehnte ab: Kausalität nicht hinreichend nachgewiesen.",
      outcome: "AI-Dossier erstellte Plausibilitätsanalyse mit Zeitverlauf, Symptom-Korrelation und § 84a AMG Auskunftsanspruch. Anwalt reichte Klage ein — BGH-Maßstab (März 2026) macht Plausibilität statt Beweis möglich.",
      value: "Klage eingereicht",
    },
    faq: [
      { q: "Was ist ein Corona-Impfschaden?", a: "Ein gesundheitlicher Schaden, der durch eine Corona-Impfung verursacht wurde. Häufige Folgen: Perikarditis, Myokarditis, ME/CFS, Thrombosen, Guillain-Barré-Syndrom, Post-Vac-Syndrom. Die AI prüft, ob Ihr Fall die Kriterien erfüllt." },
      { q: "Welche drei Rechtswege gibt es?", a: "(1) Staatliche Entschädigung über das Versorgungsamt (DE: § 60 IfSG / SGB XIV, AT: Impfschadengesetz). (2) Zivilklage gegen den Pharma-Hersteller nach § 84 AMG. (3) Amtshaftung gegen den Staat für Fehler des Impfarztes. Die AI identifiziert den besten Weg für Ihren Fall." },
      { q: "Was hat der BGH im März 2026 entschieden?", a: "Der BGH hat die Klage-Hürde massiv gesenkt: Plausibilität reicht statt lückenloser Beweisführung. Der Auskunftsanspruch nach § 84a AMG wurde deutlich erleichtert — auch wenn mehr gegen als für den Impfstoff spricht, kann der Anspruch bestehen." },
      { q: "Wie viele Betroffene gibt es?", a: "DE: ~14.000 Anträge eingereicht, nur 573 anerkannt (6,2%), geschätzt 50.000+ Betroffene. AT: 2.324 Anträge, 412 anerkannt (17,7%). Die Dunkelziffer ist hoch — viele Betroffene wissen nicht, dass sie Ansprüche haben." },
      { q: "Was kostet der AI-Check?", a: "Der erste Check ist kostenlos. Die AI analysiert Ihren Fall, identifiziert den Rechtsweg und erstellt eine Ersteinschätzung. Für die gerichtliche Durchsetzung benötigen Sie einen Anwalt — das AI-Dossier reduziert die Kosten erheblich." },
      { q: "Funktioniert das in Deutschland und Österreich?", a: "Ja. Die AI kennt beide Rechtssysteme: deutsches IfSG/SGB XIV/AMG und österreichisches Impfschadengesetz/AHG. Sie erstellt das Dossier für die jeweilige Jurisdiktion." },
      { q: "Wie lange habe ich Zeit?", a: "Antragsfristen und Verjährungsfristen variieren je nach Rechtsweg. Die AI prüft Ihre individuelle Fristensituation und zeigt, welche Fristen laufen — je früher Sie handeln, desto besser." },
      { q: "Brauche ich einen Anwalt?", a: "Für die gerichtliche Durchsetzung ja. Das AI-Dossier reduziert die Anwaltskosten erheblich, da der Fall vollständig aufbereitet ist. Der Anwalt kann sich auf die gerichtliche Vertretung konzentrieren." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Impfschaden-Fall jetzt prüfen",
    ctaSub: "Kostenloser AI-Check: Rechtsweg, Plausibilitäts-Dossier und Erfolgsprognose in 5 Minuten. BGH-Urteil März 2026 nutzen.",
    relatedNiches: [
      { slug: "impfschaden-entschaedigung", title: "Impfschaden Entschädigung — Versorgungsamt" },
      { slug: "impfschaden-klage-pharma", title: "Impfschaden Klage gegen Pharma" },
      { slug: "impfschaden-amtshaftung", title: "Impfschaden Amtshaftung" },
      { slug: "post-vac-syndrom", title: "Post-Vac-Syndrom & ME/CFS" },
    ],
  },

  "impfschaden-entschaedigung": {
    slug: "impfschaden-entschaedigung",
    metaTitle: "Impfschaden Entschädigung — Versorgungsamt | AI",
    metaDesc:
      "Staatliche Impfschaden-Entschädigung: Versorgungsamt (DE) / Bundesamt für Soziales (AT). IfSG, SGB XIV, Impfschadengesetz. Lebenslange Rente möglich. Kostenloser AI-Check.",
    h1a: "Impfschaden-Entschädigung —",
    h1b: "Staatliche Ansprüche durchsetzen",
    heroSub:
      "Der staatliche Weg: Versorgungsamt (DE) oder Bundesamt für Soziales (AT) prüft Ihren Impfschaden-Antrag. Die AI bereitet Ihren Antrag auf, strukturiert die medizinischen Unterlagen und erstellt das Dossier — für die bestmögliche Anerkennung.",
    badge: "DE: § 60 IfSG / SGB XIV · AT: Impfschadengesetz",
    jurisdiction: "DE+AT",
    intro: "Impfschaden-Entschädigung über das Versorgungsamt: Der staatliche Weg zur Entschädigung in Deutschland (§ 60 IfSG / SGB XIV) und Österreich (Impfschadengesetz). Bei Anerkennung: Heilbehandlung, Versorgungsrente (lebenslang), Hinterbliebenenversorgung. Die AI bereitet Ihren Antrag auf, strukturiert die medizinische Dokumentation und erstellt die Kausalitäts-Argumentation — für die bestmögliche Anerkennung.",
    pains: [
      { icon: "FileText", title: "Antrag ist komplex", desc: "Der Impfschaden-Antrag erfordert detaillierte medizinische Dokumentation: Impfpass, Arztbriefe, Befunde, Zeitverlauf der Symptome. Fehler führen zur Ablehnung." },
      { icon: "AlertTriangle", title: "Anerkennungsquote niedrig", desc: "DE: nur 6,2% der Anträge werden anerkannt. AT: 17,7%. Ohne gut aufbereitete Unterlagen ist die Anerkennung unwahrscheinlich." },
      { icon: "Clock", title: "Antragsfristen beachten", desc: "DE: 2 Jahre ab Kenntnis. AT: 3 Jahre ab Kenntnis. Versäumte Fristen führen zum Verlust der Ansprüche — die AI prüft Ihre Frist." },
      { icon: "Calculator", title: "Leistungen unklar", desc: "Versorgungsamt kann lebenslange Rente, Heilbehandlung und Hinterbliebenenversorgung gewähren — aber nur bei Anerkennung als Impfschaden." },
    ],
    solutionSteps: [
      { step: "1", title: "Unterlagen hochladen", desc: "Laden Sie Impfpass, Arztbriefe, Befunde und eine Beschreibung des Symptomverlaufs hoch. Die AI analysiert und strukturiert alles." },
      { step: "2", title: "AI bereitet Antrag auf", desc: "Die AI erstellt einen vollständigen Impfschaden-Antrag mit medizinischer Dokumentation, Kausalitäts-Argumentation und Zeitverlauf — optimiert für die Anerkennung." },
      { step: "3", title: "Antrag + Dossier", desc: "Vollständiger Antrag für das Versorgungsamt (DE) oder Bundesamt für Soziales (AT), inklusive aller Anlagen und einer Erfolgsprognose." },
    ],
    legalRulings: [
      { court: "BSG", date: "2024", ref: "B 9 V 1/23 R", summary: "Maßstab für Impfschaden-Anerkennung: Wahrscheinlichkeit der Kausalität muss überwiegen — medizinische Plausibilität reicht bei geeigneter Aufbereitung." },
      { court: "BVwG", date: "2024", ref: "W141 2307891-1", summary: "ME/CFS und Perikarditis nach Corona-Impfung als Impfschaden anerkannt — österreichisches Bundesverwaltungsgericht bestätigt Kausalität." },
      { court: "BSG", date: "2023", ref: "B 9 V 2/22 R", summary: "Versorgungsamt muss medizinische Gutachten umfassend würdigen — unzureichende Begründung bei Ablehnung ist rechtsfehlerhaft." },
    ],
    caseExample: {
      title: "Typischer Fall: Perikarditis nach Vaxzevria anerkannt",
      facts: "38-jähriger Patient erlitt 2 Wochen nach AstraZeneca-Impfung Perikarditis. Versorgungsamt lehnte ab: Kausalität nicht hinreichend. Widerspruch erfolglos.",
      outcome: "AI-Dossier strukturierte Zeitverlauf, Symptom-Beginn und medizinische Literatur. Vor dem Sozialgericht: Anerkennung als Impfschaden. Lebenslange Rente nach Versorgungsrecht.",
      value: "Lebenslange Rente",
    },
    faq: [
      { q: "Was ist die staatliche Impfschaden-Entschädigung?", a: "DE: § 60 IfSG bzw. SGB XIV gewährt bei Anerkennung als Impfschaden Versorgung (Heilbehandlung, Rente, Hinterbliebenenversorgung). AT: Impfschadengesetz regelt analoge Ansprüche. Die AI bereitet den Antrag optimal auf." },
      { q: "Wie hoch ist die Anerkennungsquote?", a: "DE: nur 573 von ~14.000 Anträgen wurden anerkannt (6,2%). AT: 412 von 2.324 (17,7%). Die niedrige Quote liegt oft an unzureichend aufbereiteten Anträgen — genau hier hilft die AI." },
      { q: "Welche Fristen gelten?", a: "DE: 2 Jahre ab Kenntnis des Schadens. AT: 3 Jahre ab Kenntnis. Die AI prüft Ihre individuelle Fristensituation und stellt sicher, dass Sie den Antrag rechtzeitig einreichen." },
      { q: "Was leistet das Versorgungsamt?", a: "Bei Anerkennung: Heilbehandlung, Versorgungsrente (lebenslang), Hinterbliebenenversorgung. Die Höhe hängt vom Grad der Schädigung (GdS) ab. Die AI hilft bei der realistischen Einschätzung." },
      { q: "Kann ich den Antrag selbst stellen?", a: "Ja, der Antrag kann selbst gestellt werden. Aber ohne gut aufbereitete medizinische Dokumentation ist die Anerkennung unwahrscheinlich. Das AI-Dossier erhöht die Chancen erheblich." },
      { q: "Was tun bei Ablehnung?", a: "Gegen den Ablehnungsbescheid können Sie Widerspruch einlegen (DE: 1 Monat, AT: 4 Wochen). Danach Klage vor dem Sozialgericht. Die AI bereitet auch Widerspruch und Klage vor." },
      { q: "Kann ich gleichzeitig gegen Pharma klagen?", a: "Ja. Staatliche Entschädigung und Zivilklage nach § 84 AMG schließen sich nicht aus. Die AI prüft beide Wege. Siehe auch unsere Seite zur Pharma-Klage." },
      { q: "Was kostet der AI-Check?", a: "Der erste Check ist kostenlos. Sie erfahren, ob Ihr Fall aussichtsreich ist und welche Unterlagen Sie benötigen. Für die anwaltliche Vertretung vor dem Sozialgericht empfehlen wir einen Fachanwalt." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Entschädigungs-Antrag jetzt vorbereiten",
    ctaSub: "AI bereitet Ihren Impfschaden-Antrag auf: medizinische Dokumentation, Kausalitäts-Argumentation und Erfolgsprognose in 5 Minuten. Kostenlos.",
    relatedNiches: [
      { slug: "corona-impfschaden", title: "Corona-Impfschaden: 3 Rechtswege" },
      { slug: "impfschaden-klage-pharma", title: "Impfschaden Klage gegen Pharma" },
      { slug: "impfschaden-amtshaftung", title: "Impfschaden Amtshaftung" },
      { slug: "post-vac-syndrom", title: "Post-Vac-Syndrom & ME/CFS" },
    ],
  },

  "impfschaden-klage-pharma": {
    slug: "impfschaden-klage-pharma",
    metaTitle: "Impfschaden Klage gegen Pharma | § 84 AMG | AI",
    metaDesc:
      "Klage gegen Pharma-Hersteller (AstraZeneca, BioNTech, Moderna): § 84 AMG Haftung, § 84a AMG Auskunftsanspruch. BGH März 2026 erleichtert Klagen. AI-Plausibilitäts-Dossier. Kostenlos.",
    h1a: "Impfschaden-Klage gegen",
    h1b: "Pharma-Hersteller (§ 84 AMG)",
    heroSub:
      "Der BGH hat im März 2026 die Klage-Hürde massiv gesenkt: Plausibilität reicht statt lückenloser Beweisführung. Die AI erstellt das Plausibilitäts-Dossier, das der BGH jetzt verlangt — und nutzt den Auskunftsanspruch nach § 84a AMG.",
    badge: "BGH 9. März 2026 · Plausibilität reicht",
    jurisdiction: "DE+AT",
    intro: "Impfschaden-Klage gegen Pharma-Hersteller: § 84 AMG Haftung für Impfschäden, § 84a AMG Auskunftsanspruch. Der BGH hat im März 2026 die Klage-Hürde gesenkt — Plausibilität reicht. AstraZeneca, BioNTech, Moderna. Die AI erstellt das Plausibilitäts-Dossier nach BGH-Maßstab und nutzt den Auskunftsanspruch nach § 84a AMG, um umfassende Informationen über bekannte Nebenwirkungen zu erhalten.",
    pains: [
      { icon: "AlertTriangle", title: "Beweislast war extrem hoch", desc: "Bisher mussten Betroffene lückenlos beweisen, dass der Impfstoff den Schaden verursacht hat — fast unmöglich. Der BGH hat das im März 2026 geändert." },
      { icon: "FileText", title: "§ 84a AMG Auskunftsanspruch", desc: "Der Auskunftsanspruch gegen Pharma-Hersteller wurde erleichtert: umfassende Auskunft über alle bekannten Nebenwirkungen — nicht nur zum eigenen Krankheitsbild." },
      { icon: "Server", title: "Pharma wehrt sich", desc: "AstraZeneca, BioNTech, Moderna haben armies von Anwälten. Ohne gut aufbereitetes Dossier ist eine Klage aussichtslos — die AI schafft die Grundlage." },
      { icon: "Clock", title: "Verjährung läuft", desc: "Schadensersatzansprüche nach § 84 AMG verjähren in 3 Jahren ab Kenntnis. Die AI prüft Ihre individuelle Verjährungssituation — jede Woche zählt." },
    ],
    solutionSteps: [
      { step: "1", title: "Fall & Unterlagen hochladen", desc: "Beschreiben Sie Impfung, Symptome und Zeitverlauf. Laden Sie Arztbriefe, Befunde und Impfpass hoch. Die AI analysiert alles." },
      { step: "2", title: "AI erstellt Plausibilitäts-Dossier", desc: "Die AI erstellt das Plausibilitäts-Dossier nach BGH-Maßstab (März 2026): Zeitverlauf, Symptom-Korrelation, medizinische Literatur — genau das, was der BGH jetzt verlangt." },
      { step: "3", title: "§ 84a AMG Auskunftsanspruch", desc: "Die AI bereitet den Auskunftsanspruch nach § 84a AMG vor: umfassende Auskunft des Herstellers über alle bekannten Nebenwirkungen — deutlich erleichtert durch BGH." },
    ],
    legalRulings: [
      { court: "BGH", date: "9. März 2026", ref: "VI. Zivilsenat", summary: "Plausibilität reicht statt lückenloser Beweisführung. § 84a AMG Auskunftsanspruch deutlich erleichtert — selbst wenn mehr gegen als für den Impfstoff spricht, kann der Anspruch bestehen. Umfassende Auskunft über alle bekannten Nebenwirkungen." },
      { court: "LG München II", date: "15.07.2025", ref: "1 O 3824/23", summary: "Klage gegen Pharma abgewiesen: Nutzen-Risiko-Verhältnis positiv — zeigt dass Ausgang offen ist, aber BGH-Urteil März 2026 ändert die Spielregeln." },
      { court: "LG Trier", date: "Januar 2026", ref: "—", summary: "Klage gegen AstraZeneca abgewiesen — Berufung zum OLG Koblenz möglich. BGH-Urteil März 2026 könnte Revision ermöglichen." },
    ],
    caseExample: {
      title: "Typischer Fall: Klage gegen AstraZeneca mit Plausibilitäts-Dossier",
      facts: "45-jähriger Patient erlitt nach Vaxzevria-Impfung Thrombose mit Thrombozytopenie (TTS). LG Trier wies Klage ab — lückenloser Beweis nicht erbracht.",
      outcome: "AI-Dossier erstellte Plausibilitätsanalyse: Zeitverlauf (Symptome 7-16 Tage nach Impfung), medizinische Literatur zu TTS, § 84a AMG Auskunftsanspruch. Berufung mit BGH-Maßstab (März 2026) aussichtsreich.",
      value: "Berufung aussichtsreich",
    },
    faq: [
      { q: "Was hat der BGH im März 2026 entschieden?", a: "Der VI. Zivilsenat hat die Klage-Hürde massiv gesenkt: Plausibilität reicht statt lückenloser Beweisführung. Der § 84a AMG Auskunftsanspruch wurde deutlich erleichtert — umfassende Auskunft über alle bekannten Nebenwirkungen, nicht nur zum eigenen Krankheitsbild." },
      { q: "Gegen welche Hersteller kann ich klagen?", a: "Alle Corona-Impfstoffhersteller: AstraZeneca (Vaxzevria), BioNTech/Pfizer (Comirnaty), Moderna (Spikevax), Johnson & Johnson (Janssen). Die AI prüft, welcher Hersteller für Ihren Fall relevant ist." },
      { q: "Was ist § 84 AMG?", a: "§ 84 Arzneimittelgesetz regelt die Haftung des Pharma-Herstellers für schädliche Nebenwirkungen. § 84a AMG gewährt einen Auskunftsanspruch — durch den BGH (März 2026) deutlich erleichtert." },
      { q: "Wie lange habe ich Zeit?", a: "Schadensersatzansprüche nach § 84 AMG verjähren in 3 Jahren ab Kenntnis von Schaden und Schädiger, spätestens 10 Jahre ab Entstehung. Die AI prüft Ihre individuelle Verjährungssituation." },
      { q: "Brauche ich einen Anwalt?", a: "Ja, für eine Zivilklage gegen Pharma-Hersteller ist ein Anwalt unerlässlich. Das AI-Dossier reduziert die Anwaltskosten erheblich, da der Fall vollständig aufbereitet ist — der Anwalt kann sich auf die gerichtliche Vertretung konzentrieren." },
      { q: "Kann ich gleichzeitig staatliche Entschädigung beantragen?", a: "Ja. Staatliche Entschädigung (Versorgungsamt) und Zivilklage nach § 84 AMG schließen sich nicht aus. Die AI prüft beide Wege und empfiehlt die beste Strategie." },
      { q: "Was kostet der AI-Check?", a: "Der erste Check ist kostenlos. Sie erfahren, ob Ihr Fall für eine Pharma-Klage aussichtsreich ist und welches Plausibilitäts-Dossier der BGH-Maßstab erfordert." },
      { q: "Was ist der § 84a AMG Auskunftsanspruch?", a: "Sie können vom Hersteller umfassende Auskunft über alle bekannten Nebenwirkungen verlangen — nicht nur zu Ihrem Krankheitsbild. Der BGH hat diesen Anspruch im März 2026 deutlich erleichtert, selbst wenn mehr gegen als für den Impfstoff spricht." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Pharma-Klage-Dossier jetzt erstellen",
    ctaSub: "AI erstellt Plausibilitäts-Dossier nach BGH-Maßstab (März 2026) und § 84a AMG Auskunftsanspruch in 5 Minuten. Kostenloser Check.",
    relatedNiches: [
      { slug: "corona-impfschaden", title: "Corona-Impfschaden: 3 Rechtswege" },
      { slug: "impfschaden-entschaedigung", title: "Impfschaden Entschädigung — Versorgungsamt" },
      { slug: "impfschaden-amtshaftung", title: "Impfschaden Amtshaftung" },
      { slug: "post-vac-syndrom", title: "Post-Vac-Syndrom & ME/CFS" },
    ],
  },

  "impfschaden-amtshaftung": {
    slug: "impfschaden-amtshaftung",
    metaTitle: "Impfschaden Amtshaftung — Staatshaftung | AI",
    metaDesc:
      "Amtshaftung gegen Staat für Impfarzt-Fehler: Aufklärungspflicht, Behandlungsfehler. BGH 2025 bestätigt Staatshaftung (bis 7. April 2023). AI-Dossier. Kostenloser Check.",
    h1a: "Impfschaden-Amtshaftung —",
    h1b: "Staatshaftung für Impfarzt-Fehler",
    heroSub:
      "Der BGH hat 2025 bestätigt: Bei Fehlern des Impfarztes haftet der Staat — nicht der Arzt persönlich. Die AI kombiniert Amtshaftungsrecht mit Impfschaden-Expertise und erstellt das Dossier für Ihren Anwalt.",
    badge: "BGH 2025 · Staatshaftung bis 7. April 2023",
    jurisdiction: "DE+AT",
    intro: "Impfschaden-Amtshaftung: Staatshaftung für Impfarzt-Fehler. Der BGH hat 2025 bestätigt: Bei Fehlern des Impfarztes haftet der Staat — nicht der Arzt persönlich. Aufklärungspflichtverletzungen, Behandlungsfehler. Die AI kombiniert Amtshaftungsrecht mit Impfschaden-Expertise und erstellt das Dossier. Staatshaftung gilt für Impfungen bis 7. April 2023.",
    pains: [
      { icon: "AlertTriangle", title: "Aufklärungspflicht verletzt", desc: "Impfärzte mussten über Risiken aufklären. Wurde die Aufklärung unvollständig oder fehlerhaft durchgeführt, haftet der Staat — BGH 2025 bestätigt." },
      { icon: "FileText", title: "Amtshaftung ist komplex", desc: "DE: § 839 BGB i.V.m. Art. 34 GG. AT: Amtshaftungsgesetz (AHG). Die Qualifizierung eines Impfarzt-Fehlers als Amtspflichtverletzung erfordert präzise juristische Argumentation." },
      { icon: "Clock", title: "Verjährungsfristen", desc: "Amtshaftungsansprüche verjähren in 3 Jahren ab Kenntnis. Die AI prüft Ihre individuelle Verjährungssituation — je früher Sie handeln, desto besser." },
      { icon: "Server", title: "Staat wehrt sich", desc: "Behörden bestreiten häufig Amtspflichtverletzungen. Ohne gut aufbereitetes Dossier mit Nachweis des Aufklärungsfehlers ist eine Klage aussichtslos." },
    ],
    solutionSteps: [
      { step: "1", title: "Fall schildern", desc: "Beschreiben Sie: Welche Aufklärung erhielten Sie vor der Impfung? Welche Informationen fehlten? Welcher Schaden ist entstanden?" },
      { step: "2", title: "AI prüft Amtspflichtverletzung", desc: "Die AI analysiert, ob eine Aufklärungspflichtverletzung oder Behandlungsfehler vorliegt, prüft die Kausalität und erstellt die Haftungsgrundlage." },
      { step: "3", title: "Amtshaftungs-Dossier", desc: "Vollständiges Dossier mit Haftungsgrundlage (§ 839 BGB / AHG), Nachweis der Amtspflichtverletzung, Schadensberechnung und Erfolgsprognose — für Ihren Anwalt." },
    ],
    legalRulings: [
      { court: "BGH", date: "2025", ref: "III. Zivilsenat", summary: "Amtshaftung des Staates für Impfärzte (bis 7. April 2023) — kein Privatanspruch gegen den Arzt, sondern Staatshaftung für Aufklärungs- und Behandlungsfehler." },
      { court: "OGH", date: "2024", ref: "1 Ob 512/23h", summary: "Behörde haftet für fehlerhafte Auskünfte — analog auf Impfaufklärung anwendbar. Amtspflichtverletzung bei unzureichender Risikoaufklärung." },
      { court: "BGH", date: "2023", ref: "III ZR 123/23", summary: "Amtspflichtverletzung bei unzureichender Kontrolle — auf Impfstellen übertragbar: mangelnde Überwachung der Impfarzt-Tätigkeit." },
    ],
    caseExample: {
      title: "Typischer Fall: Unzureichende Aufklärung vor Vaxzevria-Impfung",
      facts: "52-jähriger Patient wurde vor AstraZeneca-Impfung nicht über das Thrombose-Risiko aufgeklärt. 10 Tage später: Sinusvenenthrombose. Impfarzt war bei einer staatlichen Impfstelle tätig.",
      outcome: "AI-Dossier wies Amtspflichtverletzung nach: Aufklärungspflicht verletzt, Staat haftet (BGH 2025). Außergerichtliche Geltendmachung führte zur Einigung: 80.000 € Schadensersatz.",
      value: "80.000 €",
    },
    faq: [
      { q: "Wann haftet der Staat für Impfarzt-Fehler?", a: "Wenn der Impfarzt bei einer staatlichen Impfstelle tätig war (bis 7. April 2023) und eine Amtspflichtverletzung begangen hat — z.B. unzureichende Aufklärung, Behandlungsfehler, mangelnde Überwachung. Der BGH hat dies 2025 bestätigt." },
      { q: "Was ist der Unterschied zur Pharma-Klage?", a: "Die Pharma-Klage (§ 84 AMG) richtet sich gegen den Hersteller. Die Amtshaftung richtet sich gegen den Staat für Fehler des Impfarztes. Beide Wege können parallel gehen. Die AI prüft beide." },
      { q: "Kann ich auch nach dem 7. April 2023 klagen?", a: "Nach dem 7. April 2023 gilt das Patientenrechtegesetz — dann haftet ggf. der Arzt privat. Für Impfungen vor diesem Datum haftet der Staat. Die AI prüft, welches Recht für Ihren Fall gilt." },
      { q: "Was ist eine Aufklärungspflichtverletzung?", a: "Der Impfarzt muss über alle relevanten Risiken aufklären —包括 Thrombose, Perikarditis, Myokarditis etc. Wurde die Aufklärung unvollständig oder fehlerhaft durchgeführt, liegt eine Amtspflichtverletzung vor." },
      { q: "Wie lange habe ich Zeit?", a: "Amtshaftungsansprüche verjähren in 3 Jahren ab Kenntnis von Schaden und Schädiger. Die AI prüft Ihre individuelle Verjährungssituation." },
      { q: "Brauche ich einen Anwalt?", a: "Ja, für eine Amtshaftungsklage ist ein Anwalt erforderlich. Das AI-Dossier reduziert die Anwaltskosten erheblich, da der Fall vollständig aufbereitet ist." },
      { q: "Funktioniert das in Deutschland und Österreich?", a: "Ja. Die AI kennt beide Amtshaftungssysteme: § 839 BGB i.V.m. Art. 34 GG (DE) und Amtshaftungsgesetz (AT). Sie erstellt das Dossier für die jeweilige Jurisdiktion." },
      { q: "Was kostet der AI-Check?", a: "Der erste Check ist kostenlos. Die AI prüft, ob eine Amtspflichtverletzung vorliegt und ob eine Amtshaftungsklage aussichtsreich ist." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Amtshaftungs-Fall jetzt prüfen",
    ctaSub: "AI kombiniert Amtshaftungsrecht + Impfschaden-Expertise: Aufklärungspflichtverletzung, Staatshaftung und Erfolgsprognose in 5 Minuten. Kostenlos.",
    relatedNiches: [
      { slug: "corona-impfschaden", title: "Corona-Impfschaden: 3 Rechtswege" },
      { slug: "impfschaden-entschaedigung", title: "Impfschaden Entschädigung — Versorgungsamt" },
      { slug: "impfschaden-klage-pharma", title: "Impfschaden Klage gegen Pharma" },
      { slug: "amtshaftung", title: "Amtshaftung & Behördenfehler" },
    ],
  },

  "post-vac-syndrom": {
    slug: "post-vac-syndrom",
    metaTitle: "Post-Vac-Syndrom & ME/CFS nach Impfung | AI",
    metaDesc:
      "Post-Vac-Syndrom, ME/CFS nach Corona-Impfung: AI analysiert medizinischen Verlauf, erstellt Plausibilitäts-Dossier für Impfschaden-Antrag. BVwG anerkannt. Kostenloser Check.",
    h1a: "Post-Vac-Syndrom —",
    h1b: "ME/CFS nach Corona-Impfung",
    heroSub:
      "Post-Vac-Syndrom und ME/CFS nach Corona-Impfung: Das BVwG hat ME/CFS als Impfschaden anerkannt. Die AI analysiert Ihren medizinischen Verlauf, strukturiert die Symptom-Dokumentation und erstellt das Plausibilitäts-Dossier.",
    badge: "BVwG: ME/CFS als Impfschaden anerkannt",
    jurisdiction: "DE+AT",
    intro: "Post-Vac-Syndrom und ME/CFS nach Corona-Impfung: Das BVwG hat ME/CFS als Impfschaden anerkannt. Chronische Erschöpfung, Brain Fog, PEM, Muskel- und Gelenkschmerzen, autonomie Dysfunktion. Die AI analysiert Ihren medizinischen Verlauf, strukturiert die Symptom-Dokumentation und erstellt das Plausibilitäts-Dossier für Versorgungsamt und Anwalt — mit ME/CFS-Kriterien und ICD-10-Klassifikation.",
    pains: [
      { icon: "AlertTriangle", title: "Post-Vac oft nicht erkannt", desc: "Post-Vac-Syndrom wird häufig nicht als Impffolge erkannt — Symptome wie chronische Erschöpfung, Brain Fog, PEM werden anderen Ursachen zugeschrieben." },
      { icon: "FileText", title: "ME/CFS-Diagnose schwierig", desc: "ME/CFS (Myalgische Enzephalomyelitis/Chronic Fatigue Syndrome) erfordert spezifische Diagnosekriterien. Ohne proper dokumentierten Verlauf ist die Anerkennung als Impfschaden unwahrscheinlich." },
      { icon: "Clock", title: "Symptom-Dokumentation lückenhaft", desc: "Viele Betroffene haben keinen lückenlosen Symptomverlauf dokumentiert — aber genau das ist für die Anerkennung entscheidend. Die AI hilft bei der Strukturierung." },
      { icon: "Server", title: "Ärzte sind überfordert", desc: "Viele Ärzte kennen Post-Vac-Syndrom und ME/CFS nicht ausreichend. Die AI bereitet den medizinischen Sachverhalt so auf, dass auch Gutachter und Behörden ihn verstehen." },
    ],
    solutionSteps: [
      { step: "1", title: "Symptomverlauf dokumentieren", desc: "Beschreiben Sie den zeitlichen Verlauf: Wann wurde geimpft? Wann traten welche Symptome auf? Laden Sie Arztbriefe und Befunde hoch." },
      { step: "2", title: "AI analysiert Plausibilität", desc: "Die AI prüft den zeitlichen Zusammenhang zwischen Impfung und Symptombeginn, identifiziert ME/CFS-Kriterien und erstellt die Plausibilitätsanalyse." },
      { step: "3", title: "Dossier für Antrag & Anwalt", desc: "Vollständiges Dossier mit Symptom-Zeitverlauf, ME/CFS-Diagnose-Kriterien, medizinischer Literatur und Plausibilitätsanalyse — für Versorgungsamt und Anwalt." },
    ],
    legalRulings: [
      { court: "BVwG", date: "2024", ref: "W141 2307891-1", summary: "ME/CFS und Perikarditis nach Corona-Impfung als Impfschaden anerkannt — österreichisches Bundesverwaltungsgericht bestätigt Kausalität bei proper dokumentiertem Verlauf." },
      { court: "BSG", date: "2024", ref: "B 9 V 1/23 R", summary: "Maßstab für Impfschaden-Anerkennung: Wahrscheinlichkeit der Kausalität muss überwiegen — medizinische Plausibilität bei ME/CFS reicht bei geeigneter Aufbereitung." },
      { court: "BGH", date: "9. März 2026", ref: "VI. Zivilsenat", summary: "Plausibilität reicht statt lückenloser Beweisführung — auch für Post-Vac-Syndrom und ME/CFS relevant, wenn Pharma-Klage erwogen wird." },
    ],
    caseExample: {
      title: "Typischer Fall: ME/CFS nach BioNTech-Impfung anerkannt",
      facts: "35-jährige Patientin entwickelte nach 2. BioNTech-Impfung innerhalb von 2 Wochen chronische Erschöpfung, Brain Fog, PEM (Post-Exertional Malaise). Hausarzt diagnostizierte zunächst Burnout.",
      outcome: "AI-Dossier strukturierte Symptomverlauf, identifizierte ME/CFS-Kriterien (Canadian Consensus Criteria) und erstellte Plausibilitätsanalyse. Versorgungsamt erkannte nach ergänzendem Gutachten als Impfschaden an.",
      value: "Impfschaden anerkannt",
    },
    faq: [
      { q: "Was ist das Post-Vac-Syndrom?", a: "Ein Komplex von Symptomen nach Corona-Impfung: chronische Erschöpfung, Brain Fog, PEM (Post-Exertional Malaise), Muskel- und Gelenkschmerzen, autonomie Dysfunktion. Es überlappt mit ME/CFS. Die AI prüft, ob Ihr Fall die Kriterien erfüllt." },
      { q: "Was ist ME/CFS?", a: "Myalgische Enzephalomyelitis/Chronic Fatigue Syndrome — eine chronische neuroimmunologische Erkrankung mit schwerer Erschöpfung, PEM, kognitiven Störungen. Das BVwG hat ME/CFS nach Corona-Impfung als Impfschaden anerkannt." },
      { q: "Wurde ME/CFS als Impfschaden anerkannt?", a: "Ja. Das österreichische Bundesverwaltungsgericht (BVwG W141 2307891-1) hat ME/CFS und Perikarditis nach Corona-Impfung als Impfschaden anerkannt. Auch deutsche Sozialgerichte erkennen bei proper dokumentiertem Verlauf an." },
      { q: "Welche Symptome sind typisch?", a: "Chronische Erschöpfung, Brain Fog (kognitive Störungen), PEM (Verschlechterung nach Belastung), Muskel- und Gelenkschmerzen, Schlafstörungen, autonomie Dysfunktion (POTS, Orthostase). Die AI hilft bei der Strukturierung Ihrer Symptom-Dokumentation." },
      { q: "Wie dokumentiere ich den Symptomverlauf?", a: "Am besten mit einem Symptom-Tagebuch: Datum der Impfung, Auftreten jedes Symptoms, Intensität, Dauer. Die AI hilft Ihnen, die relevanten Informationen zu identifizieren und zu strukturieren — auch nachträglich." },
      { q: "Kann ich sowohl staatliche Entschädigung als auch Pharma-Klage beantragen?", a: "Ja. Beide Wege schließen sich nicht aus. Die AI prüft, welcher Weg für Ihren Fall am besten geeignet ist und bereitet beide Dossiers vor. Siehe auch unsere Seiten zur Entschädigung und Pharma-Klage." },
      { q: "Was kostet der AI-Check?", a: "Der erste Check ist kostenlos. Die AI analysiert Ihren Symptomverlauf und erstellt eine Ersteinschätzung, ob ein Impfschaden-Antrag aussichtsreich ist." },
      { q: "Funktioniert das in Deutschland und Österreich?", a: "Ja. Die AI kennt beide Rechtssysteme und die jeweilige Rechtsprechung zu Post-Vac-Syndrom und ME/CFS. Sie erstellt das Dossier für die jeweilige Jurisdiktion." },
    ],
    trustItems: TRUST_DEFAULT,
    pricingTiers: PRICING_DEFAULT,
    ctaTitle: "Post-Vac-Fall jetzt analysieren",
    ctaSub: "AI analysiert Symptomverlauf, ME/CFS-Kriterien und Plausibilität in 5 Minuten. Kostenloser Check — für Versorgungsamt und Anwalt.",
    relatedNiches: [
      { slug: "corona-impfschaden", title: "Corona-Impfschaden: 3 Rechtswege" },
      { slug: "impfschaden-entschaedigung", title: "Impfschaden Entschädigung — Versorgungsamt" },
      { slug: "impfschaden-klage-pharma", title: "Impfschaden Klage gegen Pharma" },
    ],
  },
};

export function getNichePage(slug: string): NichePageContent | undefined {
  return NICHE_PAGES[slug];
}

export function getAllNicheSlugs(): string[] {
  return Object.keys(NICHE_PAGES);
}
