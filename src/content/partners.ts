// Partner program page — affiliate, in-product referral, vertical partners. EN + DE.

import { type Lang, applyReplacements, AT_REPLACEMENTS } from "./site";

export interface PartnersContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  tiers: {
    id: string;
    icon: string;
    name: string;
    headline: string;
    desc: string;
    points: string[];
    cta: string;
    href: string;
    highlight?: boolean;
  }[];
  calcTitle: string;
  calcSub: string;
  calcNote: string;
  howTitle: string;
  how: { step: string; title: string; desc: string }[];
  faqTitle: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

const _dePartners: PartnersContent = {
  metaTitle: "Subsumio Partnerprogramm — lebenslang wiederkehrend verdienen",
  metaDesc:
    "Subsumio empfehlen und lebenslang wiederkehrende Provision verdienen. Affiliate-, Referral- und zertifizierte Implementierungspartner-Tracks.",
  badge: "Partnerprogramm",
  h1a: "Empfiehl das Brain.",
  h1b: "Behalte die Provision.",
  sub: "Drei Wege, mit Subsumio zu verdienen — vom geteilten Link bis zur zertifizierten Implementierungs-Practice. Alle nach einem Prinzip: Du verdienst weiter, solange deine Empfehlungen zahlen.",
  tiers: [
    {
      id: "affiliate",
      icon: "Megaphone",
      name: "Affiliates",
      headline: "25 % lebenslang wiederkehrend (bis zu 30 %)",
      desc: "Für Legal-Tech-Blogger, Anwaltsverbands-Communities, Kanzlei-Berater und alle mit einem DACH-Rechts-Publikum.",
      points: [
        "25 % jeder Zahlung, solange dein geworbener Kunde bleibt — kein Stichtag, keine Obergrenze",
        "+5 % Override auf Kunden von Affiliates, die du rekrutiert hast (gesamt bis zu 30 %) — passives Einkommen aufbauen",
        "90 Tage Cookie-Fenster",
        "Monatliche Auszahlung ab 50 €, Echtzeit-Dashboard",
        "Fertige Assets: Demos, Screenshots, Vergleichsseiten",
      ],
      cta: "Als Affiliate bewerben",
      href: "mailto:partners@subsum.eu?subject=Affiliate-Bewerbung",
      highlight: true,
    },
    {
      id: "referral",
      icon: "Gift",
      name: "Kunden-Empfehlungen",
      headline: "Einen Monat schenken, einen bekommen",
      desc: "Schon Kunde? Dein Empfehlungslink wartet im Dashboard.",
      points: [
        "Du bekommst 1 Monat gratis für jede Empfehlung, die zahlender Kunde wird",
        "Der Geworbene bekommt seinen ersten Monat ebenfalls gratis — dein Link lohnt sich für beide",
        "Keine Obergrenze: 12 Empfehlungen = ein Gratisjahr",
        "Gilt für Pro- und Team-Pläne",
      ],
      cta: "Link in den Einstellungen",
      href: "/dashboard/settings",
    },
    {
      id: "vertical",
      icon: "Handshake",
      name: "Zertifizierte Partner",
      headline: "20 % lifetime + dein Dienstleistungsumsatz",
      desc: "Für Legal-Tech-Integratoren, IT-Häuser und Berater, die Subsumio bei Kanzleien implementieren.",
      points: [
        "20 % Revenue-Share — lebenslang für jeden gebrachten Kunden",
        "100 % deiner Implementierungs- und Beratungshonorare bleiben bei dir",
        "Status \u201eSubsumio Certified Partner\u201c ab 3 Live-Kunden",
        "Direkter Draht zu unserem Engineering für Integrationen",
      ],
      cta: "Als Partner bewerben",
      href: "mailto:partners@subsum.eu?subject=Partner-Bewerbung",
    },
  ],
  calcTitle: "Was lebenslang wiederkehrend wirklich heißt",
  calcSub:
    "Wirb 10 Team-Seats (1.290 €/Seat/Monat). Bei 25 % sind das 3.225 € jeden Monat — solange sie bleiben. Allein im ersten Jahr sind das 38.700 €. Und es läuft weiter.",
  calcNote:
    "Wir zahlen am oberen Ende der Branche, weil frühe Partner am meisten zählen. Je erfolgreicher deine Empfehlungen, desto mehr wachsen wir gemeinsam.",
  howTitle: "So funktioniert's",
  how: [
    {
      step: "01",
      title: "Bewerben & Link erhalten",
      desc: "Wir prüfen Bewerbungen innerhalb von 48 Stunden. Du bekommst einen getrackten Link und ein Partner-Dashboard.",
    },
    {
      step: "02",
      title: "Ehrlich empfehlen",
      desc: "Teile mit Publikum, das wirklich ein Company Brain braucht. Uns sind 10 echte Fits lieber als 1.000 Klicks.",
    },
    {
      step: "03",
      title: "Monatlich kassieren",
      desc: "Stripe-basierte Auszahlung jeden Monat, ab 50 €. Jede Empfehlung und ihr Status in Echtzeit sichtbar.",
    },
  ],
  faqTitle: "Partner-FAQ",
  faq: [
    {
      q: "Wann beginnt die Provision?",
      a: "Ab der ersten Zahlung deiner Empfehlung. Affiliate-Provisionen laufen so lange, wie der Kunde zahlt — kein Stichtag, keine Obergrenze.",
    },
    {
      q: "Was passiert bei einem Upgrade?",
      a: "Deine Provision folgt den tatsächlichen Zahlungen. Wirbst du einen Pro-Kunden, der auf Team upgradet, gelten deine Prozente auf den neuen Preis, automatisch.",
    },
    {
      q: "Kann ich Affiliate UND zertifizierter Partner sein?",
      a: "Ja. Viele starten als Affiliate und zertifizieren sich nach den ersten Implementierungen.",
    },
    {
      q: "Gibt es Regeln gegen Selbst-Empfehlung?",
      a: "Selbst-Empfehlungen werden nicht ausgezahlt — wir halten das Programm ehrlich, damit es für alle großzügig bleibt.",
    },
    {
      q: "Kann ich andere Affiliates rekrutieren?",
      a: "Ja. Wenn du einen weiteren Affiliate einbringst, verdienst du 5 % Override auf dessen geworbene Kunden. So belohnen wir dich fürs Ausbauen des Partner-Netzwerks.",
    },
    {
      q: "Kann ich Gebietsexklusivität bekommen?",
      a: "Bewirb dich als Regional Launch Partner — leistungsgebundener Vorrang in deiner Region und der volle 5-%-Override auf jeden Affiliate, den du lokal rekrutierst.",
    },
  ],
  ctaTitle: "Dein Publikum braucht ein Kanzlei-Brain. Du brauchst wiederkehrenden Umsatz.",
  ctaSub: "Bewerbungen werden innerhalb von 48 Stunden geprüft. Keine Exklusivität erforderlich.",
  ctaButton: "Jetzt bewerben",
};

const _enPartners: PartnersContent = {
  metaTitle: "Subsumio Partner Program — earn lifetime recurring commission",
  metaDesc:
    "Recommend Subsumio and earn lifetime recurring commission. Affiliate, referral and certified implementation partner tracks.",
  badge: "Partner program",
  h1a: "Recommend the brain.",
  h1b: "Keep the commission.",
  sub: "Three ways to earn with Subsumio — from a single shared link to a certified implementation practice. All built on one principle: you keep earning as long as your referrals keep paying.",
  tiers: [
    {
      id: "affiliate",
      icon: "Megaphone",
      name: "Affiliates",
      headline: "25% lifetime recurring (up to 30%)",
      desc: "For legal-tech bloggers, bar association communities, law firm consultants and anyone with a DACH legal audience.",
      points: [
        "25% of every payment for as long as your referred customer stays — no cutoff, no cap",
        "+5% override on customers referred by affiliates you recruit (total up to 30%) — build passive income",
        "90-day cookie window",
        "Monthly payouts from €50, real-time dashboard",
        "Ready-made assets: demos, screenshots, comparison pages",
      ],
      cta: "Apply as affiliate",
      href: "mailto:partners@subsum.eu?subject=Affiliate%20application",
      highlight: true,
    },
    {
      id: "referral",
      icon: "Gift",
      name: "Customer referrals",
      headline: "Give a month, get a month",
      desc: "Already a customer? Your referral link lives in your dashboard.",
      points: [
        "You get 1 month free for every referral who becomes a paying customer",
        "They get their first month free too — your link is worth taking",
        "No caps: 12 referrals = a free year",
        "Counts on Pro and Team plans",
      ],
      cta: "Find your link in Settings",
      href: "/dashboard/settings",
    },
    {
      id: "vertical",
      icon: "Handshake",
      name: "Certified partners",
      headline: "20% lifetime + your services revenue",
      desc: "For legal-tech integrators, IT firms and consultants who implement Subsumio for law firms.",
      points: [
        "20% revenue share for the lifetime of every client you bring",
        "You keep 100% of your implementation and consulting fees",
        "“Subsumio Certified Partner” status after 3 live clients",
        "Direct line to our engineering for integrations",
      ],
      cta: "Apply as partner",
      href: "mailto:partners@subsum.eu?subject=Certified%20partner%20application",
    },
  ],
  calcTitle: "What lifetime recurring actually means",
  calcSub:
    "Refer 10 Team seats (€1,290/seat/month). At 25%, that's €3,225 every month — for as long as they stay. Year one alone is €38,700. And it keeps compounding.",
  calcNote:
    "We pay at the top of the industry range because early partners matter most. The more successful your referrals, the more we all grow.",
  howTitle: "How it works",
  how: [
    {
      step: "01",
      title: "Apply & get your link",
      desc: "We review applications within 48 hours. You get a tracked link and a partner dashboard.",
    },
    {
      step: "02",
      title: "Recommend honestly",
      desc: "Share with audiences who actually need a company brain. We'd rather have 10 real fits than 1,000 clicks.",
    },
    {
      step: "03",
      title: "Get paid monthly",
      desc: "Stripe-powered payouts every month, from €50. You see every referral and its status in real time.",
    },
  ],
  faqTitle: "Partner FAQ",
  faq: [
    {
      q: "When do commissions start?",
      a: "From the first payment your referral makes. Affiliate commissions continue for as long as they remain a paying customer — no cutoff, no cap.",
    },
    {
      q: "What if a customer upgrades?",
      a: "Your commission follows their actual payments. Refer a Pro customer who upgrades to Team — your percentage applies to the new price, automatically.",
    },
    {
      q: "Can I be both an affiliate and a certified partner?",
      a: "Yes. Many partners start with the affiliate track and certify once they've implemented for a few clients.",
    },
    {
      q: "Is there a self-referral policy?",
      a: "Self-referrals don't pay out — we keep the program honest so it stays generous for everyone.",
    },
    {
      q: "Can I recruit other affiliates?",
      a: "Yes. When you bring in another affiliate, you earn a 5% override on the customers they refer. It's our way of rewarding you for growing the partner network.",
    },
    {
      q: "Can I get territory exclusivity?",
      a: "Apply as a Regional Launch Partner — performance-gated priority in your region and the full 5% override on every affiliate you recruit locally.",
    },
  ],
  ctaTitle: "Your audience needs a legal brain. You need recurring revenue.",
  ctaSub: "Applications reviewed within 48 hours. No exclusivity required to start.",
  ctaButton: "Apply now",
};

export const PARTNERS: Record<Lang, PartnersContent> = {
  en: _enPartners,
  de: _dePartners,
  at: applyReplacements(_dePartners, AT_REPLACEMENTS),
  ch: _dePartners,
  it: applyReplacements(JSON.parse(JSON.stringify(_enPartners)), {
    "Subsumio Partner Program — earn lifetime recurring commission":
      "Programma Partner Subsumio — guadagna commissioni ricorrenti a vita",
    "Recommend Subsumio and earn lifetime recurring commission. Affiliate, referral and certified implementation partner tracks.":
      "Raccomanda Subsumio e guadagna commissioni ricorrenti a vita. Track affiliate, referral e partner di implementazione certificato.",
    "Partner program": "Programma partner",
    "Recommend the brain.": "Raccomanda il brain.",
    "Keep the commission.": "Tieni la commissione.",
    "Three ways to earn with Subsumio — from a single shared link to a certified implementation practice. All built on one principle: you keep earning as long as your referrals keep paying.":
      "Tre modi per guadagnare con Subsumio — da un singolo link condiviso a una practice di implementazione certificata. Tutti su un principio: continui a guadagnare finché i tuoi referral pagano.",
    "Apply as affiliate": "Candidati come affiliate",
    "Apply now": "Candidati ora",
    "Your audience needs a legal brain. You need recurring revenue.":
      "Il tuo pubblico ha bisogno di un brain legale. Tu hai bisogno di entrate ricorrenti.",
    "Applications reviewed within 48 hours. No exclusivity required to start.":
      "Candidature esaminate entro 48 ore. Nessuna esclusività richiesta per iniziare.",
    // Tiers
    "25% lifetime recurring (up to 30%)": "25% a vita ricorrente (fino a 30%)",
    "For legal-tech bloggers, bar association communities, law firm consultants and anyone with a DACH legal audience.":
      "Per blogger legal-tech, community di ordini forensi, consulenti di studi legali e chiunque abbia un pubblico giuridico DACH.",
    "25% of every payment for as long as your referred customer stays — no cutoff, no cap":
      "25% di ogni pagamento finché il cliente rimane — nessun cutoff, nessun tetto",
    "+5% override on customers referred by affiliates you recruit (total up to 30%) — build passive income":
      "+5% override sui clienti referiti da affiliate che recluti (totale fino a 30%) — costruisci entrate passive",
    "90-day cookie window": "Cookie window di 90 giorni",
    "Monthly payouts from €50, real-time dashboard":
      "Pagamenti mensili da €50, dashboard in tempo reale",
    "Ready-made assets: demos, screenshots, comparison pages":
      "Asset pronti: demo, screenshot, pagine di confronto",
    "Customer referrals": "Referral clienti",
    "Give a month, get a month": "Regala un mese, ricevi un mese",
    "Already a customer? Your referral link lives in your dashboard.":
      "Già cliente? Il tuo link referral è nella dashboard.",
    "You get 1 month free for every referral who becomes a paying customer":
      "Ottieni 1 mese gratis per ogni referral che diventa cliente pagante",
    "They get their first month free too — your link is worth taking":
      "Anche loro ottengono il primo mese gratis — il tuo link vale la pena",
    "No caps: 12 referrals = a free year": "Nessun tetto: 12 referral = un anno gratis",
    "Counts on Pro and Team plans": "Valido per piani Pro e Team",
    "Find your link in Settings": "Trova il tuo link in Impostazioni",
    "Certified partners": "Partner certificati",
    "20% lifetime + your services revenue": "20% a vita + i tuoi ricavi dai servizi",
    "For legal-tech integrators, IT firms and consultants who implement Subsumio for law firms.":
      "Per integratori legal-tech, aziende IT e consulenti che implementano Subsumio per studi legali.",
    "20% revenue share for the lifetime of every client you bring":
      "20% revenue share per la vita di ogni cliente che porti",
    "You keep 100% of your implementation and consulting fees":
      "Tieni il 100% dei tuoi onorari di implementazione e consulenza",
    "“Subsumio Certified Partner” status after 3 live clients":
      "Status “Subsumio Certified Partner” dopo 3 clienti live",
    "Direct line to our engineering for integrations":
      "Linea diretta al nostro engineering per integrazioni",
    "Apply as partner": "Candidati come partner",
    // Calc
    "What lifetime recurring actually means": "Cosa significa davvero a vita ricorrente",
    "Refer 10 Team seats (€1,290/seat/month). At 25%, that's €3,225 every month — for as long as they stay. Year one alone is €38,700. And it keeps compounding.":
      "Referisci 10 posti Team (€1.290/posto/mese). Al 25%, sono €3.225 ogni mese — finché restano. Il primo anno da solo è €38.700. E continua a compoundare.",
    "We pay at the top of the industry range because early partners matter most. The more successful your referrals, the more we all grow.":
      "Paghiamo al top del range di settore perché i partner precoci contano di più. Più successo hanno i tuoi referral, più cresciamo tutti.",
    // How
    "How it works": "Come funziona",
    "Apply & get your link": "Candidati e ottieni il link",
    "We review applications within 48 hours. You get a tracked link and a partner dashboard.":
      "Esaminiamo le candidature entro 48 ore. Ottieni un link tracciato e una dashboard partner.",
    "Recommend honestly": "Raccomanda onestamente",
    "Share with audiences who actually need a company brain. We'd rather have 10 real fits than 1,000 clicks.":
      "Condividi con pubblico che ha davvero bisogno di un brain aziendale. Preferiamo 10 fit reali a 1.000 clic.",
    "Get paid monthly": "Ricevi pagamento mensile",
    "Stripe-powered payouts every month, from €50. You see every referral and its status in real time.":
      "Pagamenti via Stripe ogni mese, da €50. Vedi ogni referral e il suo status in tempo reale.",
    // FAQ
    "Partner FAQ": "FAQ Partner",
    "When do commissions start?": "Quando iniziano le commissioni?",
    "From the first payment your referral makes. Affiliate commissions continue for as long as they remain a paying customer — no cutoff, no cap.":
      "Dal primo pagamento del tuo referral. Le commissioni affiliate continuano finché rimane cliente pagante — nessun cutoff, nessun tetto.",
    "What if a customer upgrades?": "Cosa succede se un cliente upgrade?",
    "Your commission follows their actual payments. Refer a Pro customer who upgrades to Team — your percentage applies to the new price, automatically.":
      "La tua commissione segue i pagamenti effettivi. Referisci un cliente Pro che upgrade a Team — la tua percentuale si applica al nuovo prezzo, automaticamente.",
    "Can I be both an affiliate and a certified partner?":
      "Posso essere sia affiliate che partner certificato?",
    "Yes. Many partners start with the affiliate track and certify once they've implemented for a few clients.":
      "Sì. Molti partner iniziano con il track affiliate e si certificano dopo aver implementato per alcuni clienti.",
    "Is there a self-referral policy?": "C'è una policy contro self-referral?",
    "Self-referrals don't pay out — we keep the program honest so it stays generous for everyone.":
      "I self-referral non pagano — manteniamo il programma onesto così resta generoso per tutti.",
    "Can I recruit other affiliates?": "Posso reclutare altri affiliate?",
    "Yes. When you bring in another affiliate, you earn a 5% override on the customers they refer. It's our way of rewarding you for growing the partner network.":
      "Sì. Quando porti un altro affiliate, guadagni un 5% override sui clienti che referisce. È il nostro modo di ricompensarti per aver fatto crescere il network di partner.",
    "Can I get territory exclusivity?": "Posso ottenere esclusività territoriale?",
    "Apply as a Regional Launch Partner — performance-gated priority in your region and the full 5% override on every affiliate you recruit locally.":
      "Candidati come Regional Launch Partner — priorità performance-gated nella tua regione e il pieno 5% override su ogni affiliate che recluti localmente.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enPartners)), {
    "Subsumio Partner Program — earn lifetime recurring commission":
      "Programa de Partners Subsumio — gana comisión recurrente de por vida",
    "Recommend Subsumio and earn lifetime recurring commission. Affiliate, referral and certified implementation partner tracks.":
      "Recomienda Subsumio y gana comisión recurrente de por vida. Tracks de afiliado, referido y partner de implementación certificado.",
    "Partner program": "Programa de partners",
    "Recommend the brain.": "Recomienda el cerebro.",
    "Keep the commission.": "Quédate la comisión.",
    "Three ways to earn with Subsumio — from a single shared link to a certified implementation practice. All built on one principle: you keep earning as long as your referrals keep paying.":
      "Tres formas de ganar con Subsumio — desde un enlace compartido hasta una practice de implementación certificada. Todo en un principio: sigues ganando mientras tus referidos sigan pagando.",
    "Apply as affiliate": "Solicitar como afiliado",
    "Apply now": "Solicitar ahora",
    "Your audience needs a legal brain. You need recurring revenue.":
      "Tu audiencia necesita un cerebro legal. Tú necesitas ingresos recurrentes.",
    "Applications reviewed within 48 hours. No exclusivity required to start.":
      "Solicitudes revisadas en 48 horas. Sin exclusividad para empezar.",
    // Tiers
    "25% lifetime recurring (up to 30%)": "25% recurrente de por vida (hasta 30%)",
    "For legal-tech bloggers, bar association communities, law firm consultants and anyone with a DACH legal audience.":
      "Para bloggers legal-tech, comunidades de colegios de abogados, consultores de bufetes y cualquiera con audiencia jurídica DACH.",
    "25% of every payment for as long as your referred customer stays — no cutoff, no cap":
      "25% de cada pago mientras tu cliente referido permanezca — sin cutoff, sin tope",
    "+5% override on customers referred by affiliates you recruit (total up to 30%) — build passive income":
      "+5% override en clientes referidos por afiliados que reclutas (total hasta 30%) — construye ingresos pasivos",
    "90-day cookie window": "Cookie window de 90 días",
    "Monthly payouts from €50, real-time dashboard":
      "Pagos mensuales desde €50, dashboard en tiempo real",
    "Ready-made assets: demos, screenshots, comparison pages":
      "Assets listos: demos, screenshots, páginas de comparación",
    "Customer referrals": "Referidos de clientes",
    "Give a month, get a month": "Regala un mes, recibe un mes",
    "Already a customer? Your referral link lives in your dashboard.":
      "¿Ya eres cliente? Tu link de referido está en tu dashboard.",
    "You get 1 month free for every referral who becomes a paying customer":
      "Obtienes 1 mes gratis por cada referido que se hace cliente pagador",
    "They get their first month free too — your link is worth taking":
      "Ellos también obtienen su primer mes gratis — tu link vale la pena",
    "No caps: 12 referrals = a free year": "Sin topes: 12 referidos = un año gratis",
    "Counts on Pro and Team plans": "Válido para planes Pro y Team",
    "Find your link in Settings": "Encuentra tu link en Ajustes",
    "Certified partners": "Partners certificados",
    "20% lifetime + your services revenue": "20% de por vida + tus ingresos de servicios",
    "For legal-tech integrators, IT firms and consultants who implement Subsumio for law firms.":
      "Para integradores legal-tech, empresas de IT y consultores que implementan Subsumio para bufetes.",
    "20% revenue share for the lifetime of every client you bring":
      "20% revenue share de por vida por cada cliente que traigas",
    "You keep 100% of your implementation and consulting fees":
      "Te quedas con el 100% de tus honorarios de implementación y consultoría",
    "“Subsumio Certified Partner” status after 3 live clients":
      "Status “Subsumio Certified Partner” tras 3 clientes live",
    "Direct line to our engineering for integrations":
      "Línea directa a nuestro engineering para integraciones",
    "Apply as partner": "Solicitar como partner",
    // Calc
    "What lifetime recurring actually means": "Qué significa realmente recurrente de por vida",
    "Refer 10 Team seats (€1,290/seat/month). At 25%, that's €3,225 every month — for as long as they stay. Year one alone is €38,700. And it keeps compounding.":
      "Refiere 10 puestos Team (€1.290/puesto/mes). Al 25%, son €3.225 cada mes — mientras permanezcan. El primer año solo son €38.700. Y sigue compoundando.",
    "We pay at the top of the industry range because early partners matter most. The more successful your referrals, the more we all grow.":
      "Pagamos en el tope del rango de la industria porque los partners tempranos importan más. Cuanto más exitosos tus referidos, más crecemos todos.",
    // How
    "How it works": "Cómo funciona",
    "Apply & get your link": "Solicita y obtén tu link",
    "We review applications within 48 hours. You get a tracked link and a partner dashboard.":
      "Revisamos solicitudes en 48 horas. Obtienes un link rastreado y un dashboard de partner.",
    "Recommend honestly": "Recomienda honestamente",
    "Share with audiences who actually need a company brain. We'd rather have 10 real fits than 1,000 clicks.":
      "Comparte con audiencias que realmente necesitan un brain empresarial. Preferimos 10 fits reales a 1.000 clics.",
    "Get paid monthly": "Cobra mensualmente",
    "Stripe-powered payouts every month, from €50. You see every referral and its status in real time.":
      "Pagos vía Stripe cada mes, desde €50. Ves cada referido y su status en tiempo real.",
    // FAQ
    "Partner FAQ": "FAQ Partner",
    "When do commissions start?": "¿Cuándo empiezan las comisiones?",
    "From the first payment your referral makes. Affiliate commissions continue for as long as they remain a paying customer — no cutoff, no cap.":
      "Desde el primer pago de tu referido. Las comisiones de afiliado continúan mientras permanezca como cliente pagador — sin cutoff, sin tope.",
    "What if a customer upgrades?": "¿Qué pasa si un cliente upgrade?",
    "Your commission follows their actual payments. Refer a Pro customer who upgrades to Team — your percentage applies to the new price, automatically.":
      "Tu comisión sigue sus pagos reales. Refiere un cliente Pro que upgrade a Team — tu porcentaje se aplica al nuevo precio, automáticamente.",
    "Can I be both an affiliate and a certified partner?":
      "¿Puedo ser afiliado y partner certificado?",
    "Yes. Many partners start with the affiliate track and certify once they've implemented for a few clients.":
      "Sí. Muchos partners empiezan con el track de afiliado y se certifican tras implementar para algunos clientes.",
    "Is there a self-referral policy?": "¿Hay una policy de self-referral?",
    "Self-referrals don't pay out — we keep the program honest so it stays generous for everyone.":
      "Los self-referrals no pagan — mantenemos el programa honesto para que se mantenga generoso para todos.",
    "Can I recruit other affiliates?": "¿Puedo reclutar otros afiliados?",
    "Yes. When you bring in another affiliate, you earn a 5% override on the customers they refer. It's our way of rewarding you for growing the partner network.":
      "Sí. Cuando traes otro afiliado, ganas un 5% override en los clientes que refiere. Es nuestra forma de recompensarte por hacer crecer el network de partners.",
    "Can I get territory exclusivity?": "¿Puedo obtener exclusividad territorial?",
    "Apply as a Regional Launch Partner — performance-gated priority in your region and the full 5% override on every affiliate you recruit locally.":
      "Solicita como Regional Launch Partner — prioridad performance-gated en tu región y el full 5% override en cada afiliado que reclutes localmente.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enPartners)), {
    "Subsumio Partner Program — earn lifetime recurring commission":
      "Program Partnerski Subsumio — zarabiaj dożywotnią prowizję cykliczną",
    "Recommend Subsumio and earn lifetime recurring commission. Affiliate, referral and certified implementation partner tracks.":
      "Polecaj Subsumio i zarabiaj dożywotnią prowizję cykliczną. Tracki afiliacyjny, referencyjny i certyfikowanego partnera wdrożeniowego.",
    "Partner program": "Program partnerski",
    "Recommend the brain.": "Polecaj brain.",
    "Keep the commission.": "Zatrzymaj prowizję.",
    "Three ways to earn with Subsumio — from a single shared link to a certified implementation practice. All built on one principle: you keep earning as long as your referrals keep paying.":
      "Trzy sposoby zarabiania z Subsumio — od pojedynczego udostępnionego linku po certyfikowaną practice wdrożeniową. Wszystko na jednej zasadzie: zarabiasz tak długo, jak długo Twoi polecani płacą.",
    "Apply as affiliate": "Zgłoś się jako afiliant",
    "Apply now": "Zgłoś się teraz",
    "Your audience needs a legal brain. You need recurring revenue.":
      "Twoja publiczność potrzebuje prawniczego brain. Ty potrzebujesz powtarzalnych przychodów.",
    "Applications reviewed within 48 hours. No exclusivity required to start.":
      "Aplikacje rozpatrywane w 48 godzin. Bez wymogu wyłączności na start.",
    // Tiers
    "25% lifetime recurring (up to 30%)": "25% dożywotnio cyklicznie (do 30%)",
    "For legal-tech bloggers, bar association communities, law firm consultants and anyone with a DACH legal audience.":
      "Dla bloggerów legal-tech, społeczności okręgów adwokackich, konsultantów kancelarii i każdego z publicznością prawniczą DACH.",
    "25% of every payment for as long as your referred customer stays — no cutoff, no cap":
      "25% każdej płatności tak długo, jak twój polecony klient zostaje — bez cutoff, bez limitu",
    "+5% override on customers referred by affiliates you recruit (total up to 30%) — build passive income":
      "+5% override na klientów referowanych przez afiliantów, których rekrutujesz (łącznie do 30%) — buduj dochód pasywny",
    "90-day cookie window": "Cookie window 90 dni",
    "Monthly payouts from €50, real-time dashboard":
      "Miesięczne wypłaty od €50, dashboard w czasie rzeczywistym",
    "Ready-made assets: demos, screenshots, comparison pages":
      "Gotowe assety: demo, screenshoty, strony porównawcze",
    "Customer referrals": "Polecenia klientów",
    "Give a month, get a month": "Daj miesiąc, otrzymaj miesiąc",
    "Already a customer? Your referral link lives in your dashboard.":
      "Już klient? Twój link referencyjny jest w dashboardzie.",
    "You get 1 month free for every referral who becomes a paying customer":
      "Otrzymujesz 1 miesiąc gratis za każdego poleconego, który staje się płacącym klientem",
    "They get their first month free too — your link is worth taking":
      "Oni też otrzymują pierwszy miesiąc gratis — twój link warto polecieć",
    "No caps: 12 referrals = a free year": "Bez limitów: 12 poleceń = rok gratis",
    "Counts on Pro and Team plans": "Liczy się dla planów Pro i Team",
    "Find your link in Settings": "Znajdź swój link w Ustawieniach",
    "Certified partners": "Certyfikowani partnerzy",
    "20% lifetime + your services revenue": "20% dożywotnio + twoje przychody z usług",
    "For legal-tech integrators, IT firms and consultants who implement Subsumio for law firms.":
      "Dla integratorów legal-tech, firm IT i konsultantów, którzy implementują Subsumio dla kancelarii.",
    "20% revenue share for the lifetime of every client you bring":
      "20% revenue share przez całe życie każdego klienta, którego przyprowadzisz",
    "You keep 100% of your implementation and consulting fees":
      "Zatrzymujesz 100% swoich opłat za implementację i konsulting",
    "“Subsumio Certified Partner” status after 3 live clients":
      "Status „Subsumio Certified Partner” po 3 klientach live",
    "Direct line to our engineering for integrations":
      "Bezpośrednia linia do naszego engineeringu dla integracji",
    "Apply as partner": "Zgłoś się jako partner",
    // Calc
    "What lifetime recurring actually means": "Co naprawdę znaczy dożywotnio cyklicznie",
    "Refer 10 Team seats (€1,290/seat/month). At 25%, that's €3,225 every month — for as long as they stay. Year one alone is €38,700. And it keeps compounding.":
      "Poleć 10 miejsc Team (€1.290/miejsce/miesiąc). Przy 25%, to €3.225 każdego miesiąca — tak długo, jak zostają. Sam pierwszy rok to €38.700. I dalej rośnie.",
    "We pay at the top of the industry range because early partners matter most. The more successful your referrals, the more we all grow.":
      "Płacimy na górze zakresu w branży, ponieważ wczesni partnerzy liczą się najbardziej. Im bardziej udani twoi polecani, tym bardziej wszyscy rośniemy.",
    // How
    "How it works": "Jak to działa",
    "Apply & get your link": "Zgłoś się i otrzymaj link",
    "We review applications within 48 hours. You get a tracked link and a partner dashboard.":
      "Rozpatrujemy aplikacje w 48 godzin. Otrzymujesz link śledzony i dashboard partnera.",
    "Recommend honestly": "Polecaj uczciwie",
    "Share with audiences who actually need a company brain. We'd rather have 10 real fits than 1,000 clicks.":
      "Dziel się z publicznością, która naprawdę potrzebuje braina firmowego. Wolimy 10 prawdziwych fitów niż 1.000 kliknięć.",
    "Get paid monthly": "Otrzymuj wypłatę miesięcznie",
    "Stripe-powered payouts every month, from €50. You see every referral and its status in real time.":
      "Wypłaty via Stripe co miesiąc, od €50. Widzisz każde polecenie i jego status w czasie rzeczywistym.",
    // FAQ
    "Partner FAQ": "FAQ Partner",
    "When do commissions start?": "Kiedy zaczynają się prowizje?",
    "From the first payment your referral makes. Affiliate commissions continue for as long as they remain a paying customer — no cutoff, no cap.":
      "Od pierwszej płatności twojego poleconego. Prowizje afiliacyjne trwają tak długo, jak pozostaje płacącym klientem — bez cutoff, bez limitu.",
    "What if a customer upgrades?": "Co jeśli klient upgrade?",
    "Your commission follows their actual payments. Refer a Pro customer who upgrades to Team — your percentage applies to the new price, automatically.":
      "Twoja prowizja podąża za ich faktycznymi płatnościami. Poleć klienta Pro, który upgrade do Team — twój procent stosuje się do nowej ceny, automatycznie.",
    "Can I be both an affiliate and a certified partner?":
      "Czy mogę być afiliantem i certyfikowanym partnerem?",
    "Yes. Many partners start with the affiliate track and certify once they've implemented for a few clients.":
      "Tak. Wielu partnerów zaczyna od tracku afiliacyjnego i certyfikuje się po implementacji u kilku klientów.",
    "Is there a self-referral policy?": "Czy jest zasada przeciw self-referral?",
    "Self-referrals don't pay out — we keep the program honest so it stays generous for everyone.":
      "Self-referrale nie wypłacają się — utrzymujemy program uczciwym, by pozostał hojny dla wszystkich.",
    "Can I recruit other affiliates?": "Czy mogę rekrutować innych afiliantów?",
    "Yes. When you bring in another affiliate, you earn a 5% override on the customers they refer. It's our way of rewarding you for growing the partner network.":
      "Tak. Kiedy przyprowadzisz innego afilianta, zarabiasz 5% override na klientach, których referuje. To nasz sposób nagradzania cię za rozwijanie sieci partnerów.",
    "Can I get territory exclusivity?": "Czy mogę otrzymać ekskluzywność terytorialną?",
    "Apply as a Regional Launch Partner — performance-gated priority in your region and the full 5% override on every affiliate you recruit locally.":
      "Zgłoś się jako Regional Launch Partner — priorytet performance-gated w twoim regionie i pełny 5% override na każdego afilianta, którego rekrutujesz lokalnie.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enPartners)), {
    "Subsumio Partner Program — earn lifetime recurring commission":
      "Programme Partenaire Subsumio — gagnez une commission récurrente à vie",
    "Recommend Subsumio and earn lifetime recurring commission. Affiliate, referral and certified implementation partner tracks.":
      "Recommandez Subsumio et gagnez une commission récurrente à vie. Tracks affiliaé, parrainage et partenaire d'implémentation certifié.",
    "Partner program": "Programme partenaire",
    "Recommend the brain.": "Recommandez le brain.",
    "Keep the commission.": "Gardez la commission.",
    "Three ways to earn with Subsumio — from a single shared link to a certified implementation practice. All built on one principle: you keep earning as long as your referrals keep paying.":
      "Trois façons de gagner avec Subsumio — d'un simple lien partagé à une practice d'implémentation certifiée. Tout sur un principe: vous continuez à gagner tant que vos parrainés paient.",
    "Apply as affiliate": "Postuler comme affilié",
    "Apply now": "Postuler maintenant",
    "Your audience needs a legal brain. You need recurring revenue.":
      "Votre audience a besoin d'un brain juridique. Vous avez besoin de revenus récurrents.",
    "Applications reviewed within 48 hours. No exclusivity required to start.":
      "Candidatures examinées sous 48 heures. Aucune exclusivité requise pour commencer.",
    // Tiers
    "25% lifetime recurring (up to 30%)": "25% récurrent à vie (jusqu'à 30%)",
    "For legal-tech bloggers, bar association communities, law firm consultants and anyone with a DACH legal audience.":
      "Pour les bloggers legal-tech, les communautés d'ordres d'avocats, les consultants de cabinets et quiconque a une audience juridique DACH.",
    "25% of every payment for as long as your referred customer stays — no cutoff, no cap":
      "25% de chaque paiement tant que votre client parrainé reste — sans cutoff, sans plafond",
    "+5% override on customers referred by affiliates you recruit (total up to 30%) — build passive income":
      "+5% override sur les clients parrainés par les affiliés que vous recrutez (total jusqu'à 30%) — construisez des revenus passifs",
    "90-day cookie window": "Cookie window de 90 jours",
    "Monthly payouts from €50, real-time dashboard":
      "Paiements mensuels dès €50, dashboard en temps réel",
    "Ready-made assets: demos, screenshots, comparison pages":
      "Assets prêts: demos, screenshots, pages de comparaison",
    "Customer referrals": "Parrainages clients",
    "Give a month, get a month": "Donnez un mois, recevez un mois",
    "Already a customer? Your referral link lives in your dashboard.":
      "Déjà client? Votre lien de parrainage est dans votre dashboard.",
    "You get 1 month free for every referral who becomes a paying customer":
      "Vous obtenez 1 mois gratuit pour chaque parrainé qui devient client payant",
    "They get their first month free too — your link is worth taking":
      "Eux aussi obtiennent leur premier mois gratuit — votre lien vaut le coup",
    "No caps: 12 referrals = a free year": "Sans plafond: 12 parrainages = un an gratuit",
    "Counts on Pro and Team plans": "Valable pour les plans Pro et Team",
    "Find your link in Settings": "Trouvez votre lien dans les Paramètres",
    "Certified partners": "Partners certifiés",
    "20% lifetime + your services revenue": "20% à vie + vos revenus de services",
    "For legal-tech integrators, IT firms and consultants who implement Subsumio for law firms.":
      "Pour les intégrateurs legal-tech, entreprises IT et consultants qui implémentent Subsumio pour les cabinets.",
    "20% revenue share for the lifetime of every client you bring":
      "20% revenue share à vie pour chaque client que vous apportez",
    "You keep 100% of your implementation and consulting fees":
      "Vous gardez 100% de vos honoraires d'implémentation et de conseil",
    "“Subsumio Certified Partner” status after 3 live clients":
      "Statut «Subsumio Certified Partner» après 3 clients live",
    "Direct line to our engineering for integrations":
      "Ligne directe vers notre engineering pour les intégrations",
    "Apply as partner": "Postuler comme partner",
    // Calc
    "What lifetime recurring actually means": "Ce que récurrent à vie signifie vraiment",
    "Refer 10 Team seats (€1,290/seat/month). At 25%, that's €3,225 every month — for as long as they stay. Year one alone is €38,700. And it keeps compounding.":
      "Parrainez 10 sièges Team (€1.290/siège/mois). À 25%, cela fait €3.225 chaque mois — tant qu'ils restent. La première année seule est €38.700. Et ça continue de compounder.",
    "We pay at the top of the industry range because early partners matter most. The more successful your referrals, the more we all grow.":
      "Nous payons au top du range de l'industrie car les partners précoces comptent le plus. Plus vos parrainés réussissent, plus nous grandissons tous.",
    // How
    "How it works": "Comment ça marche",
    "Apply & get your link": "Postulez et obtenez votre lien",
    "We review applications within 48 hours. You get a tracked link and a partner dashboard.":
      "Nous examinons les candidatures sous 48 heures. Vous obtenez un lien tracé et un dashboard partner.",
    "Recommend honestly": "Recommandez honnêtement",
    "Share with audiences who actually need a company brain. We'd rather have 10 real fits than 1,000 clicks.":
      "Partagez avec des audiences qui ont vraiment besoin d'un brain d'entreprise. Nous préférons 10 fits réels à 1.000 clics.",
    "Get paid monthly": "Soyez payé mensuellement",
    "Stripe-powered payouts every month, from €50. You see every referral and its status in real time.":
      "Paiements via Stripe chaque mois, dès €50. Vous voyez chaque parrainage et son statut en temps réel.",
    // FAQ
    "Partner FAQ": "FAQ Partner",
    "When do commissions start?": "Quand commencent les commissions?",
    "From the first payment your referral makes. Affiliate commissions continue for as long as they remain a paying customer — no cutoff, no cap.":
      "Dès le premier paiement de votre parrainé. Les commissions d'affilié continuent tant qu'il reste client payant — sans cutoff, sans plafond.",
    "What if a customer upgrades?": "Que se passe-t-il si un client upgrade?",
    "Your commission follows their actual payments. Refer a Pro customer who upgrades to Team — your percentage applies to the new price, automatically.":
      "Votre commission suit leurs paiements réels. Parrainez un client Pro qui upgrade vers Team — votre pourcentage s'applique au nouveau prix, automatiquement.",
    "Can I be both an affiliate and a certified partner?":
      "Puis-je être à la fois affilié et partner certifié?",
    "Yes. Many partners start with the affiliate track and certify once they've implemented for a few clients.":
      "Oui. Beaucoup de partners commencent avec le track affilié et se certifient après avoir implémenté pour quelques clients.",
    "Is there a self-referral policy?": "Y a-t-il une policy de self-referral?",
    "Self-referrals don't pay out — we keep the program honest so it stays generous for everyone.":
      "Les self-referrals ne paient pas — nous gardons le programme honnête pour qu'il reste généreux pour tous.",
    "Can I recruit other affiliates?": "Puis-je recruter d'autres affiliés?",
    "Yes. When you bring in another affiliate, you earn a 5% override on the customers they refer. It's our way of rewarding you for growing the partner network.":
      "Oui. Quand vous amenez un autre affilié, vous gagnez 5% d'override sur les clients qu'il parraine. C'est notre façon de vous récompenser pour avoir fait grandir le network de partners.",
    "Can I get territory exclusivity?": "Puis-je obtenir l'exclusivité territoriale?",
    "Apply as a Regional Launch Partner — performance-gated priority in your region and the full 5% override on every affiliate you recruit locally.":
      "Postulez comme Regional Launch Partner — priorité performance-gated dans votre région et le plein 5% override sur chaque affilié que vous recrutez localement.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enPartners)), {
    "Subsumio Partner Program — earn lifetime recurring commission":
      "Subsumio Partnerprogramma — verdien levenslange terugkerende commissie",
    "Recommend Subsumio and earn lifetime recurring commission. Affiliate, referral and certified implementation partner tracks.":
      "Beveel Subsumio aan en verdien levenslange terugkerende commissie. Affiliate-, referral- en gecertificeerde implementatiepartner tracks.",
    "Partner program": "Partnerprogramma",
    "Recommend the brain.": "Beveel het brain aan.",
    "Keep the commission.": "Houd de commissie.",
    "Three ways to earn with Subsumio — from a single shared link to a certified implementation practice. All built on one principle: you keep earning as long as your referrals keep paying.":
      "Drie manieren om te verdienen met Subsumio — van een enkele gedeelde link tot een gecertificeerde implementatiepractice. Allemaal op één principe: je blijft verdienen zolang je referrals blijven betalen.",
    "Apply as affiliate": "Meld je aan als affiliate",
    "Apply now": "Meld je nu aan",
    "Your audience needs a legal brain. You need recurring revenue.":
      "Jouw publiek heeft een juridisch brain nodig. Jij hebt terugkerende inkomsten nodig.",
    "Applications reviewed within 48 hours. No exclusivity required to start.":
      "Aanvragen beoordeeld binnen 48 uur. Geen exclusiviteit vereist om te starten.",
    // Tiers
    "25% lifetime recurring (up to 30%)": "25% levenslang terugkerend (tot 30%)",
    "For legal-tech bloggers, bar association communities, law firm consultants and anyone with a DACH legal audience.":
      "Voor legal-tech bloggers, advocatenorde-community's, kantoor-consultants en iedereen met een DACH juridisch publiek.",
    "25% of every payment for as long as your referred customer stays — no cutoff, no cap":
      "25% van elke betaling zolang je doorverwezen klant blijft — geen cutoff, geen plafond",
    "+5% override on customers referred by affiliates you recruit (total up to 30%) — build passive income":
      "+5% override op klanten doorverwezen door affiliates die jij rekruteert (totaal tot 30%) — bouw passief inkomen op",
    "90-day cookie window": "Cookie window van 90 dagen",
    "Monthly payouts from €50, real-time dashboard":
      "Maandelijkse uitbetalingen vanaf €50, real-time dashboard",
    "Ready-made assets: demos, screenshots, comparison pages":
      "Kant-en-klare assets: demo's, screenshots, vergelijkingspagina's",
    "Customer referrals": "Klantverwijzingen",
    "Give a month, get a month": "Geef een maand, krijg een maand",
    "Already a customer? Your referral link lives in your dashboard.":
      "Al klant? Je verwijzingslink staat in je dashboard.",
    "You get 1 month free for every referral who becomes a paying customer":
      "Je krijgt 1 maand gratis voor elke verwijzing die betalende klant wordt",
    "They get their first month free too — your link is worth taking":
      "Zij krijgen ook hun eerste maand gratis — je link is het waard",
    "No caps: 12 referrals = a free year": "Geen plafond: 12 verwijzingen = een gratis jaar",
    "Counts on Pro and Team plans": "Geldig voor Pro- en Team-plannen",
    "Find your link in Settings": "Vind je link in Instellingen",
    "Certified partners": "Gecertificeerde partners",
    "20% lifetime + your services revenue": "20% levenslang + jouw service-omzet",
    "For legal-tech integrators, IT firms and consultants who implement Subsumio for law firms.":
      "Voor legal-tech integrators, IT-firms en consultants die Subsumio implementeren voor advocatenkantoren.",
    "20% revenue share for the lifetime of every client you bring":
      "20% revenue share voor de levensduur van elke klant die je brengt",
    "You keep 100% of your implementation and consulting fees":
      "Jij houdt 100% van je implementatie- en advieskosten",
    "“Subsumio Certified Partner” status after 3 live clients":
      "Status “Subsumio Certified Partner” na 3 live klanten",
    "Direct line to our engineering for integrations":
      "Directe lijn naar onze engineering voor integraties",
    "Apply as partner": "Meld je aan als partner",
    // Calc
    "What lifetime recurring actually means": "Wat levenslang terugkerend echt betekent",
    "Refer 10 Team seats (€1,290/seat/month). At 25%, that's €3,225 every month — for as long as they stay. Year one alone is €38,700. And it keeps compounding.":
      "Verwijs 10 Team-zitplaatsen (€1.290/zitplaats/maand). Bij 25%, dat is €3.225 elke maand — zolang ze blijven. Alleen jaar één is €38.700. En het blijft compounderen.",
    "We pay at the top of the industry range because early partners matter most. The more successful your referrals, the more we all grow.":
      "We betalen aan de top van de brancherange omdat vroege partners het meest tellen. Hoe succesvoller je verwijzingen, hoe meer we allemaal groeien.",
    // How
    "How it works": "Hoe het werkt",
    "Apply & get your link": "Meld aan en krijg je link",
    "We review applications within 48 hours. You get a tracked link and a partner dashboard.":
      "We beoordelen aanvragen binnen 48 uur. Je krijgt een getrackte link en een partner-dashboard.",
    "Recommend honestly": "Beveel eerlijk aan",
    "Share with audiences who actually need a company brain. We'd rather have 10 real fits than 1,000 clicks.":
      "Deel met publiek dat echt een company brain nodig heeft. We hebben liever 10 echte fits dan 1.000 klikken.",
    "Get paid monthly": "Krijg maandelijks betaald",
    "Stripe-powered payouts every month, from €50. You see every referral and its status in real time.":
      "Stripe-aangedreven uitbetalingen elke maand, vanaf €50. Je ziet elke verwijzing en de status in real-time.",
    // FAQ
    "Partner FAQ": "Partner FAQ",
    "When do commissions start?": "Wanneer beginnen de commissies?",
    "From the first payment your referral makes. Affiliate commissions continue for as long as they remain a paying customer — no cutoff, no cap.":
      "Vanaf de eerste betaling van je verwijzing. Affiliate-commissies lopen door zolang ze betalende klant blijven — geen cutoff, geen plafond.",
    "What if a customer upgrades?": "Wat als een klant upgrade?",
    "Your commission follows their actual payments. Refer a Pro customer who upgrades to Team — your percentage applies to the new price, automatically.":
      "Je commissie volgt hun werkelijke betalingen. Verwijs een Pro-klant die naar Team upgrade — je percentage geldt voor de nieuwe prijs, automatisch.",
    "Can I be both an affiliate and a certified partner?":
      "Kan ik zowel affiliate als gecertificeerd partner zijn?",
    "Yes. Many partners start with the affiliate track and certify once they've implemented for a few clients.":
      "Ja. Veel partners beginnen met het affiliate-track en certificeren nadat ze voor een paar klanten hebben geïmplementeerd.",
    "Is there a self-referral policy?": "Is er een self-referral beleid?",
    "Self-referrals don't pay out — we keep the program honest so it stays generous for everyone.":
      "Self-referrals betalen niet uit — we houden het programma eerlijk zodat het genereus blijft voor iedereen.",
    "Can I recruit other affiliates?": "Kan ik andere affiliates rekruteren?",
    "Yes. When you bring in another affiliate, you earn a 5% override on the customers they refer. It's our way of rewarding you for growing the partner network.":
      "Ja. Wanneer je een andere affiliate brengt, verdien je 5% override op de klanten die ze verwijzen. Het is onze manier om je te belonen voor het laten groeien van het partner-network.",
    "Can I get territory exclusivity?": "Kan ik territoriale exclusiviteit krijgen?",
    "Apply as a Regional Launch Partner — performance-gated priority in your region and the full 5% override on every affiliate you recruit locally.":
      "Meld je aan als Regional Launch Partner — performance-gated prioriteit in jouw regio en de volledige 5% override op elke affiliate die je lokaal rekruteert.",
  }),
};
