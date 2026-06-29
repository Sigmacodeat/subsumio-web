// Subsumio pricing. Signup deep-links carry ?industry=legal so the product
// provisions the legal workspace.

import { type Lang, type PricingTier, deepMerge, applyReplacements } from "./site";

export interface VerticalPricing {
  title: string;
  sub: string;
  tiers: PricingTier[];
}

// industry key (signupIndustry) → bespoke pricing. Only verticals with a real
// override live here; everything else uses the global PRICING.
const _deVp: Partial<Record<string, VerticalPricing>> = {
  legal: {
    title: "Preise für Kanzleien",
    sub: "Pro Seat, jährliche Abrechnung. Akten-Synthese, WhatsApp-Copilot und Compliance-Infrastruktur — auf EU-Infrastruktur, die du kontrollierst.",
    tiers: [
      {
        id: "starter",
        name: "Starter",
        price: "399 €",
        period: "/Seat/Mon.",
        blurb:
          "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Monatlich kündbar. Bis 2 Seats.",
        features: [
          "Verwaltetes EU-Hosting — keine API-Keys",
          "Akten-Q&A mit seitengenauen Zitaten",
          "200 KI-Anfragen/Mon. · 15 GB",
          "50 WhatsApp-Nachrichten/Mon.",
          "ZPO-Fristen + Kollisionsprüfung (§ 43a BRAO / § 10 RAO / BGFA)",
          "E-Mail-Support",
          "Mehrverbrauch: 0,55 €/Anfrage · 0,30 €/WA",
        ],
        cta: "Starter testen",
        href: "/signup",
      },
      {
        id: "pro",
        name: "Professional",
        price: "890 €",
        period: "/Seat/Mon.",
        blurb: "Einzel- und Kleinkanzleien bis 4 Seats. Das volle Akten-Gehirn, voll verwaltet.",
        features: [
          "Verwaltetes EU-Hosting — keine API-Keys",
          "Akten-Q&A mit seitengenauen Zitaten",
          "1.000 KI-Anfragen/Seat/Mon. · 75 GB/Seat",
          "300 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
          "WhatsApp-Akten-Copilot + Sprachnotizen",
          "ZPO/BGB/ABGB-Fristen + Kollisionsprüfung (§ 43a BRAO / § 10 RAO / BGFA)",
          "beA-Eingang · RVG/BRAG-Rechner",
          "Priorisierter Support",
          "Mehrverbrauch: 0,45 €/Anfrage · 0,25 €/WA",
        ],
        cta: "Professional starten",
        href: "/signup",
      },
      {
        id: "team",
        name: "Kanzlei",
        price: "1.290 €",
        period: "/Seat/Mon.",
        blurb: "Ein gemeinsames Kanzlei-Brain, pro Anwalt gescoped. Ab 5 Seats.",
        features: [
          "Alles aus Professional",
          "4.000 KI-Anfragen/Seat/Mon. · 200 GB/Seat",
          "1.000 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
          "Geteiltes Akten-Gedächtnis + kanzleiweite Kollisionsprüfung",
          "Zeiterfassung, Auslagen, Rechnungen & DATEV-Export",
          "Vier-Augen-Freigabe + vollständiger Audit-Trail",
          "Onboarding & dedizierter Support",
          "Mehrverbrauch: 0,40 €/Anfrage · 0,20 €/WA",
        ],
        cta: "Kanzlei starten",
        href: "/signup",
        highlight: true,
      },
      {
        id: "ent",
        name: "Enterprise",
        price: "ab 1.890 €",
        period: "/Seat/Mon.",
        blurb: "Compliance-Grade, auf deiner Infrastruktur oder EU-Cloud. Ab 20 Seats.",
        features: [
          "15.000 KI-Anfragen/Seat/Mon. (Fair Use darüber)",
          "5.000 WhatsApp-Nachrichten/Seat/Mon.",
          "500 GB Speicher/Seat",
          "EU-Cloud oder On-Premise-Deployment",
          "AVV, SLA, SSO/SAML",
          "DMS / RA-MICRO / Advoware-Import",
          "Maximaler Recall-Modus",
          "Dedizierter CSM · individuelle Aufbewahrung & Speicher",
          "Mehrverbrauch: 0,35 €/Anfrage · 0,15 €/WA",
        ],
        cta: "Demo anfragen",
        href: "mailto:hello@subsum.eu",
      },
    ],
  },
};

const _enVp: Partial<Record<string, VerticalPricing>> = {
  legal: {
    title: "Pricing for law firms",
    sub: "Per seat, billed annually. Case synthesis, WhatsApp copilot and compliance infrastructure — on EU infrastructure you control.",
    tiers: [
      {
        id: "starter",
        name: "Starter",
        price: "€399",
        period: "/seat/mo",
        blurb:
          "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.",
        features: [
          "Managed EU hosting — no API keys",
          "Case Q&A with page-level citations",
          "200 AI queries/mo · 15 GB",
          "50 WhatsApp messages/mo",
          "ZPO deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)",
          "Email support",
          "Overage: €0.55/query · €0.30/WA msg",
        ],
        cta: "Try Starter",
        href: "/signup",
      },
      {
        id: "pro",
        name: "Professional",
        price: "€890",
        period: "/seat/mo",
        blurb: "Solo and small firms up to 4 seats. The full case brain, fully managed.",
        features: [
          "Managed EU hosting — no API keys",
          "Case Q&A with page-level citations",
          "1,000 AI queries/seat/mo · 75 GB/seat",
          "300 WhatsApp messages/mo (firm total)",
          "WhatsApp matter copilot + voice notes",
          "ZPO/BGB/ABGB deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)",
          "beA intake · RVG/BRAG fee calculator",
          "Priority support",
          "Overage: €0.45/query · €0.25/WA msg",
        ],
        cta: "Start Professional",
        href: "/signup",
      },
      {
        id: "team",
        name: "Kanzlei",
        price: "€1,290",
        period: "/seat/mo",
        blurb: "One shared firm brain, scoped per lawyer. From 5 seats.",
        features: [
          "Everything in Professional",
          "4,000 AI queries/seat/mo · 200 GB/seat",
          "1,000 WhatsApp messages/mo (firm total)",
          "Shared matter memory + firm-wide conflict checks",
          "Time tracking, expenses, invoicing & DATEV export",
          "Four-eyes approval + full audit trail",
          "Onboarding & dedicated support",
          "Overage: €0.40/query · €0.20/WA msg",
        ],
        cta: "Start Firm plan",
        href: "/signup",
        highlight: true,
      },
      {
        id: "ent",
        name: "Enterprise",
        price: "from €1,890",
        period: "/seat/mo",
        blurb: "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.",
        features: [
          "15,000 AI queries/seat/mo (Fair Use beyond)",
          "5,000 WhatsApp messages/seat/mo",
          "500 GB storage/seat",
          "EU cloud or on-premise deployment",
          "DPA, SLA, SSO/SAML",
          "DMS / RA-MICRO / Advoware import",
          "Maximum-recall search mode",
          "Dedicated CSM · custom retention & storage",
          "Overage: €0.35/query · €0.15/WA msg",
        ],
        cta: "Request a demo",
        href: "mailto:hello@subsum.eu",
      },
    ],
  },
};

export const VERTICAL_PRICING: Record<Lang, Partial<Record<string, VerticalPricing>>> = {
  en: _enVp,
  de: _deVp,
  at: deepMerge(_deVp, {
    legal: {
      sub: "Pro Seat, jährliche Abrechnung. Akten-Synthese, WhatsApp-Copilot und Compliance-Infrastruktur — auf EU-Infrastruktur, die du kontrollierst.",
      tiers: [
        {
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "200 KI-Anfragen/Mon. · 15 GB",
            "50 WhatsApp-Nachrichten/Mon.",
            "ZPO-Fristen + Kollisionsprüfung (§ 10 RAO / § 43a BRAO / BGFA)",
            "E-Mail-Support",
            "Mehrverbrauch: 0,55 €/Anfrage · 0,30 €/WA",
          ],
        },
        {
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "1.000 KI-Anfragen/Seat/Mon. · 75 GB/Seat",
            "300 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "WhatsApp-Akten-Copilot + Sprachnotizen",
            "ZPO/ABGB-Fristen + Kollisionsprüfung (§ 10 RAO / § 43a BRAO / BGFA)",
            "beA-Eingang · RVG/BRAG-Rechner",
            "Priorisierter Support",
            "Mehrverbrauch: 0,45 €/Anfrage · 0,25 €/WA",
          ],
        },
        {
          features: [
            "Alles aus Professional",
            "4.000 KI-Anfragen/Seat/Mon. · 200 GB/Seat",
            "1.000 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "Geteiltes Akten-Gedächtnis + kanzleiweite Kollisionsprüfung",
            "Zeiterfassung, Auslagen, Rechnungen & ADATEV-Export",
            "Vier-Augen-Freigabe + vollständiger Audit-Trail",
            "Onboarding & dedizierter Support",
            "Mehrverbrauch: 0,40 €/Anfrage · 0,20 €/WA",
          ],
        },
        {
          features: [
            "15.000 KI-Anfragen/Seat/Mon. (Fair Use darüber)",
            "5.000 WhatsApp-Nachrichten/Seat/Mon.",
            "500 GB Speicher/Seat",
            "EU-Cloud oder On-Premise-Deployment",
            "AVV, SLA, SSO/SAML",
            "DMS / RA-MICRO / Advoware-Import",
            "Maximaler Recall-Modus",
            "Dedizierter CSM · individuelle Aufbewahrung & Speicher",
            "Mehrverbrauch: 0,35 €/Anfrage · 0,15 €/WA",
          ],
        },
      ],
    },
  }),
  ch: deepMerge(_deVp, {
    legal: {
      sub: "Pro Seat, jährliche Abrechnung. Akten-Synthese, WhatsApp-Copilot und Compliance-Infrastruktur — auf EU-Infrastruktur, die du kontrollierst.",
      tiers: [
        {
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "200 KI-Anfragen/Mon. · 15 GB",
            "50 WhatsApp-Nachrichten/Mon.",
            "ZPO/ZGB-Fristen + Kollisionsprüfung (BGFA / § 43a BRAO / § 10 RAO)",
            "E-Mail-Support",
            "Mehrverbrauch: 0,55 CHF/Anfrage · 0,30 CHF/WA",
          ],
        },
        {
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "1.000 KI-Anfragen/Seat/Mon. · 75 GB/Seat",
            "300 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "WhatsApp-Akten-Copilot + Sprachnotizen",
            "ZPO/ZGB-Fristen + Kollisionsprüfung (BGFA / § 43a BRAO / § 10 RAO)",
            "beA-Eingang · RVG/BRAG-Rechner",
            "Priorisierter Support",
            "Mehrverbrauch: 0,45 CHF/Anfrage · 0,25 CHF/WA",
          ],
        },
        {
          features: [
            "Alles aus Professional",
            "4.000 KI-Anfragen/Seat/Mon. · 200 GB/Seat",
            "1.000 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "Geteiltes Akten-Gedächtnis + kanzleiweite Kollisionsprüfung",
            "Zeiterfassung, Auslagen, Rechnungen & DATEV-Export",
            "Vier-Augen-Freigabe + vollständiger Audit-Trail",
            "Onboarding & dedizierter Support",
            "Mehrverbrauch: 0,40 CHF/Anfrage · 0,20 CHF/WA",
          ],
        },
        {
          features: [
            "15.000 KI-Anfragen/Seat/Mon. (Fair Use darüber)",
            "5.000 WhatsApp-Nachrichten/Seat/Mon.",
            "500 GB Speicher/Seat",
            "EU-Cloud oder On-Premise-Deployment",
            "AVV, SLA, SSO/SAML",
            "DMS / RA-MICRO / Advoware-Import",
            "Maximaler Recall-Modus",
            "Dedizierter CSM · individuelle Aufbewahrung & Speicher",
            "Mehrverbrauch: 0,35 CHF/Anfrage · 0,15 CHF/WA",
          ],
        },
      ],
    },
  }),
  it: applyReplacements(JSON.parse(JSON.stringify(_enVp)), {
    "Pricing for law firms": "Prezzi per studi legali",
    "Per seat, billed annually. Case synthesis, WhatsApp copilot and compliance infrastructure — on EU infrastructure you control.":
      "Per seat, fatturazione annuale. Sintesi pratiche, copilot WhatsApp e infrastruttura compliance — su infrastruttura UE che controlli.",
    "Try Starter": "Prova Starter",
    "Start Professional": "Avvia Professional",
    "Start Firm plan": "Avvia piano Studio",
    "Request a demo": "Richiedi una demo",
    "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.":
      "Professionisti singoli che esplorano il lavoro assistito da AI. Fatturazione mensile, cancellazione in qualsiasi momento. Fino a 2 seat.",
    "Solo and small firms up to 4 seats. The full case brain, fully managed.":
      "Professionisti singoli e piccoli studi fino a 4 seat. Il brain pratiche completo, fully managed.",
    "One shared firm brain, scoped per lawyer. From 5 seats.":
      "Un brain studio condiviso, scoped per avvocato. Da 5 seat.",
    "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.":
      "Grado compliance, sulla tua infrastruttura o cloud UE. Da 20 seat.",
    "Managed EU hosting — no API keys": "Hosting UE gestito — nessuna API key",
    "Case Q&A with page-level citations": "Q&A pratiche con citazioni a livello di pagina",
    "200 AI queries/mo · 15 GB": "200 query AI/mese · 15 GB",
    "50 WhatsApp messages/mo": "50 messaggi WhatsApp/mese",
    "ZPO deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Scadenze ZPO + controllo conflitti (§ 43a BRAO / § 10 RAO / BGFA)",
    "Email support": "Supporto email",
    "Overage: €0.55/query · €0.30/WA msg": "Overage: €0,55/query · €0,30/msg WA",
    "1,000 AI queries/seat/mo · 75 GB/seat": "1.000 query AI/seat/mese · 75 GB/seat",
    "300 WhatsApp messages/mo (firm total)": "300 messaggi WhatsApp/mese (totale studio)",
    "WhatsApp matter copilot + voice notes": "Copilot WhatsApp per pratiche + note vocali",
    "ZPO/BGB/ABGB deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Scadenze ZPO/BGB/ABGB + controllo conflitti (§ 43a BRAO / § 10 RAO / BGFA)",
    "beA intake · RVG/BRAG fee calculator": "Ricezione beA · calcolatore parcelle RVG/BRAG",
    "Priority support": "Supporto prioritario",
    "Overage: €0.45/query · €0.25/WA msg": "Overage: €0,45/query · €0,25/msg WA",
    "Everything in Professional": "Tutto di Professional",
    "4,000 AI queries/seat/mo · 200 GB/seat": "4.000 query AI/seat/mese · 200 GB/seat",
    "1,000 WhatsApp messages/mo (firm total)": "1.000 messaggi WhatsApp/mese (totale studio)",
    "Shared matter memory + firm-wide conflict checks":
      "Memoria pratiche condivisa + controllo conflitti a livello studio",
    "Time tracking, expenses, invoicing & DATEV export":
      "Tracking tempo, spese, fatturazione & export DATEV",
    "Four-eyes approval + full audit trail": "Approvazione a quattro occhi + audit trail completo",
    "Onboarding & dedicated support": "Onboarding & supporto dedicato",
    "Overage: €0.40/query · €0.20/WA msg": "Overage: €0,40/query · €0,20/msg WA",
    "15,000 AI queries/seat/mo (Fair Use beyond)": "15.000 query AI/seat/mese (Fair Use oltre)",
    "5,000 WhatsApp messages/seat/mo": "5.000 messaggi WhatsApp/seat/mese",
    "500 GB storage/seat": "500 GB storage/seat",
    "EU cloud or on-premise deployment": "Cloud UE o deployment on-premise",
    "DPA, SLA, SSO/SAML": "DPA, SLA, SSO/SAML",
    "DMS / RA-MICRO / Advoware import": "Import DMS / RA-MICRO / Advoware",
    "Maximum-recall search mode": "Modalità ricerca maximum-recall",
    "Dedicated CSM · custom retention & storage":
      "CSM dedicato · retention & storage personalizzati",
    "Overage: €0.35/query · €0.15/WA msg": "Overage: €0,35/query · €0,15/msg WA",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enVp)), {
    "Pricing for law firms": "Precios para bufetes",
    "Per seat, billed annually. Case synthesis, WhatsApp copilot and compliance infrastructure — on EU infrastructure you control.":
      "Por seat, facturación anual. Síntesis de asuntos, copilot WhatsApp e infraestructura de compliance — en infraestructura UE que controlas.",
    "Try Starter": "Probar Starter",
    "Start Professional": "Iniciar Professional",
    "Start Firm plan": "Iniciar plan Bufete",
    "Request a demo": "Solicitar una demo",
    "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.":
      "Profesionales individuales que exploran el trabajo asistido por IA. Facturación mensual, cancela cuando quieras. Hasta 2 seat.",
    "Solo and small firms up to 4 seats. The full case brain, fully managed.":
      "Profesionales individuales y bufetes pequeños hasta 4 seat. El brain de asuntos completo, fully managed.",
    "One shared firm brain, scoped per lawyer. From 5 seats.":
      "Un brain de bufete compartido, scoped por abogado. Desde 5 seat.",
    "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.":
      "Grado compliance, en tu infraestructura o cloud UE. Desde 20 seat.",
    "Managed EU hosting — no API keys": "Hosting UE gestionado — sin API keys",
    "Case Q&A with page-level citations": "Q&A de asuntos con citas a nivel de página",
    "200 AI queries/mo · 15 GB": "200 queries IA/mes · 15 GB",
    "50 WhatsApp messages/mo": "50 mensajes WhatsApp/mes",
    "ZPO deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Plazos ZPO + control de conflictos (§ 43a BRAO / § 10 RAO / BGFA)",
    "Email support": "Soporte email",
    "Overage: €0.55/query · €0.30/WA msg": "Overage: €0,55/query · €0,30/msg WA",
    "1,000 AI queries/seat/mo · 75 GB/seat": "1.000 queries IA/seat/mes · 75 GB/seat",
    "300 WhatsApp messages/mo (firm total)": "300 mensajes WhatsApp/mes (total bufete)",
    "WhatsApp matter copilot + voice notes": "Copilot WhatsApp para asuntos + notas de voz",
    "ZPO/BGB/ABGB deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Plazos ZPO/BGB/ABGB + control de conflictos (§ 43a BRAO / § 10 RAO / BGFA)",
    "beA intake · RVG/BRAG fee calculator": "Recepción beA · calculador de honorarios RVG/BRAG",
    "Priority support": "Soporte prioritario",
    "Overage: €0.45/query · €0.25/WA msg": "Overage: €0,45/query · €0,25/msg WA",
    "Everything in Professional": "Todo de Professional",
    "4,000 AI queries/seat/mo · 200 GB/seat": "4.000 queries IA/seat/mes · 200 GB/seat",
    "1,000 WhatsApp messages/mo (firm total)": "1.000 mensajes WhatsApp/mes (total bufete)",
    "Shared matter memory + firm-wide conflict checks":
      "Memoria de asuntos compartida + control de conflictos a nivel bufete",
    "Time tracking, expenses, invoicing & DATEV export":
      "Tracking de tiempo, gastos, facturación & export DATEV",
    "Four-eyes approval + full audit trail": "Aprobación de cuatro ojos + audit trail completo",
    "Onboarding & dedicated support": "Onboarding & soporte dedicado",
    "Overage: €0.40/query · €0.20/WA msg": "Overage: €0,40/query · €0,20/msg WA",
    "15,000 AI queries/seat/mo (Fair Use beyond)": "15.000 queries IA/seat/mes (Fair Use más allá)",
    "5,000 WhatsApp messages/seat/mo": "5.000 mensajes WhatsApp/seat/mes",
    "500 GB storage/seat": "500 GB storage/seat",
    "EU cloud or on-premise deployment": "Cloud UE o deployment on-premise",
    "DPA, SLA, SSO/SAML": "DPA, SLA, SSO/SAML",
    "DMS / RA-MICRO / Advoware import": "Import DMS / RA-MICRO / Advoware",
    "Maximum-recall search mode": "Modo de búsqueda maximum-recall",
    "Dedicated CSM · custom retention & storage":
      "CSM dedicado · retention & storage personalizados",
    "Overage: €0.35/query · €0.15/WA msg": "Overage: €0,35/query · €0,15/msg WA",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enVp)), {
    "Pricing for law firms": "Cennik dla kancelarii",
    "Per seat, billed annually. Case synthesis, WhatsApp copilot and compliance infrastructure — on EU infrastructure you control.":
      "Per seat, rozliczenie roczne. Synteza spraw, copilot WhatsApp i infrastruktura compliance — na infrastrukturze UE, którą kontrolujesz.",
    "Try Starter": "Wypróbuj Starter",
    "Start Professional": "Uruchom Professional",
    "Start Firm plan": "Uruchom plan Kancelaria",
    "Request a demo": "Zamów demo",
    "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.":
      "Samodzielni prawnicy eksplorujący pracę wspieraną AI. Rozliczenie miesięczne, anulacja w dowolnym momencie. Do 2 seat.",
    "Solo and small firms up to 4 seats. The full case brain, fully managed.":
      "Samodzielni prawnicy i małe kancelarie do 4 seat. Pełny brain spraw, fully managed.",
    "One shared firm brain, scoped per lawyer. From 5 seats.":
      "Współdzielony brain kancelarii, scoped per prawnik. Od 5 seat.",
    "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.":
      "Klasa compliance, na twojej infrastrukturze lub cloud UE. Od 20 seat.",
    "Managed EU hosting — no API keys": "Hosting UE zarządzany — bez API keys",
    "Case Q&A with page-level citations": "Q&A spraw z cytatami na poziomie strony",
    "200 AI queries/mo · 15 GB": "200 zapytań AI/mies · 15 GB",
    "50 WhatsApp messages/mo": "50 wiadomości WhatsApp/mies",
    "ZPO deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Terminy ZPO + kontrola konfliktów (§ 43a BRAO / § 10 RAO / BGFA)",
    "Email support": "Wsparcie email",
    "Overage: €0.55/query · €0.30/WA msg": "Overage: €0,55/zapytanie · €0,30/msg WA",
    "1,000 AI queries/seat/mo · 75 GB/seat": "1.000 zapytań AI/seat/mies · 75 GB/seat",
    "300 WhatsApp messages/mo (firm total)": "300 wiadomości WhatsApp/mies (łącznie kancelaria)",
    "WhatsApp matter copilot + voice notes": "Copilot WhatsApp dla spraw + notatki głosowe",
    "ZPO/BGB/ABGB deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Terminy ZPO/BGB/ABGB + kontrola konfliktów (§ 43a BRAO / § 10 RAO / BGFA)",
    "beA intake · RVG/BRAG fee calculator": "Odbiór beA · kalkulator opłat RVG/BRAG",
    "Priority support": "Wsparcie priorytetowe",
    "Overage: €0.45/query · €0.25/WA msg": "Overage: €0,45/zapytanie · €0,25/msg WA",
    "Everything in Professional": "Wszystko z Professional",
    "4,000 AI queries/seat/mo · 200 GB/seat": "4.000 zapytań AI/seat/mies · 200 GB/seat",
    "1,000 WhatsApp messages/mo (firm total)":
      "1.000 wiadomości WhatsApp/mies (łącznie kancelaria)",
    "Shared matter memory + firm-wide conflict checks":
      "Współdzielona pamięć spraw + kontrola konfliktów w całej kancelarii",
    "Time tracking, expenses, invoicing & DATEV export":
      "Tracking czasu, koszty, fakturowanie & export DATEV",
    "Four-eyes approval + full audit trail": "Aprobata czworga oczu + pełny audit trail",
    "Onboarding & dedicated support": "Onboarding & dedykowane wsparcie",
    "Overage: €0.40/query · €0.20/WA msg": "Overage: €0,40/zapytanie · €0,20/msg WA",
    "15,000 AI queries/seat/mo (Fair Use beyond)": "15.000 zapytań AI/seat/mies (Fair Use powyżej)",
    "5,000 WhatsApp messages/seat/mo": "5.000 wiadomości WhatsApp/seat/mies",
    "500 GB storage/seat": "500 GB storage/seat",
    "EU cloud or on-premise deployment": "Cloud UE lub deployment on-premise",
    "DPA, SLA, SSO/SAML": "DPA, SLA, SSO/SAML",
    "DMS / RA-MICRO / Advoware import": "Import DMS / RA-MICRO / Advoware",
    "Maximum-recall search mode": "Tryb wyszukiwania maximum-recall",
    "Dedicated CSM · custom retention & storage": "Dedykowany CSM · retention & storage custom",
    "Overage: €0.35/query · €0.15/WA msg": "Overage: €0,35/zapytanie · €0,15/msg WA",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enVp)), {
    "Pricing for law firms": "Tarifs pour cabinets",
    "Per seat, billed annually. Case synthesis, WhatsApp copilot and compliance infrastructure — on EU infrastructure you control.":
      "Par seat, facturation annuelle. Synthèse de dossiers, copilot WhatsApp et infrastructure de compliance — sur infrastructure UE que vous contrôlez.",
    "Try Starter": "Essayer Starter",
    "Start Professional": "Démarrer Professional",
    "Start Firm plan": "Démarrer plan Cabinet",
    "Request a demo": "Demander une démo",
    "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.":
      "Avocats indépendants explorant le travail assisté par IA. Facturation mensuelle, annulation à tout moment. Jusqu'à 2 seat.",
    "Solo and small firms up to 4 seats. The full case brain, fully managed.":
      "Avocats indépendants et petits cabinets jusqu'à 4 seat. Le brain de dossiers complet, fully managed.",
    "One shared firm brain, scoped per lawyer. From 5 seats.":
      "Un brain de cabinet partagé, scoped par avocat. À partir de 5 seat.",
    "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.":
      "Grade compliance, sur votre infrastructure ou cloud UE. À partir de 20 seat.",
    "Managed EU hosting — no API keys": "Hosting UE géré — sans API keys",
    "Case Q&A with page-level citations": "Q&A dossiers avec citations au niveau de la page",
    "200 AI queries/mo · 15 GB": "200 queries IA/mois · 15 GB",
    "50 WhatsApp messages/mo": "50 messages WhatsApp/mois",
    "ZPO deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Délais ZPO + contrôle des conflits (§ 43a BRAO / § 10 RAO / BGFA)",
    "Email support": "Support email",
    "Overage: €0.55/query · €0.30/WA msg": "Overage: €0,55/query · €0,30/msg WA",
    "1,000 AI queries/seat/mo · 75 GB/seat": "1.000 queries IA/seat/mois · 75 GB/seat",
    "300 WhatsApp messages/mo (firm total)": "300 messages WhatsApp/mois (total cabinet)",
    "WhatsApp matter copilot + voice notes": "Copilot WhatsApp pour dossiers + notes vocales",
    "ZPO/BGB/ABGB deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Délais ZPO/BGB/ABGB + contrôle des conflits (§ 43a BRAO / § 10 RAO / BGFA)",
    "beA intake · RVG/BRAG fee calculator": "Réception beA · calculateur d'honoraires RVG/BRAG",
    "Priority support": "Support prioritaire",
    "Overage: €0.45/query · €0.25/WA msg": "Overage: €0,45/query · €0,25/msg WA",
    "Everything in Professional": "Tout de Professional",
    "4,000 AI queries/seat/mo · 200 GB/seat": "4.000 queries IA/seat/mois · 200 GB/seat",
    "1,000 WhatsApp messages/mo (firm total)": "1.000 messages WhatsApp/mois (total cabinet)",
    "Shared matter memory + firm-wide conflict checks":
      "Mémoire des dossiers partagée + contrôle des conflits à l'échelle du cabinet",
    "Time tracking, expenses, invoicing & DATEV export":
      "Tracking du temps, frais, facturation & export DATEV",
    "Four-eyes approval + full audit trail": "Approbation à quatre yeux + audit trail complet",
    "Onboarding & dedicated support": "Onboarding & support dédié",
    "Overage: €0.40/query · €0.20/WA msg": "Overage: €0,40/query · €0,20/msg WA",
    "15,000 AI queries/seat/mo (Fair Use beyond)": "15.000 queries IA/seat/mois (Fair Use au-delà)",
    "5,000 WhatsApp messages/seat/mo": "5.000 messages WhatsApp/seat/mois",
    "500 GB storage/seat": "500 GB storage/seat",
    "EU cloud or on-premise deployment": "Cloud UE ou deployment on-premise",
    "DPA, SLA, SSO/SAML": "DPA, SLA, SSO/SAML",
    "DMS / RA-MICRO / Advoware import": "Import DMS / RA-MICRO / Advoware",
    "Maximum-recall search mode": "Mode de recherche maximum-recall",
    "Dedicated CSM · custom retention & storage": "CSM dédié · retention & storage personnalisés",
    "Overage: €0.35/query · €0.15/WA msg": "Overage: €0,35/query · €0,15/msg WA",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enVp)), {
    "Pricing for law firms": "Prijzen voor advocatenkantoren",
    "Per seat, billed annually. Case synthesis, WhatsApp copilot and compliance infrastructure — on EU infrastructure you control.":
      "Per seat, jaarlijkse facturatie. Zaaksynthese, WhatsApp copilot en compliance-infrastructuur — op EU-infrastructuur die je controleert.",
    "Try Starter": "Probeer Starter",
    "Start Professional": "Start Professional",
    "Start Firm plan": "Start Kantoor-plan",
    "Request a demo": "Vraag een demo aan",
    "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.":
      "Zelfstandige advocaten die AI-ondersteund zaakwerk verkennen. Maandelijkse facturatie, opzeggen wanneer dan ook. Tot 2 seat.",
    "Solo and small firms up to 4 seats. The full case brain, fully managed.":
      "Zelfstandige advocaten en kleine kantoren tot 4 seat. De volledige zaak-brain, fully managed.",
    "One shared firm brain, scoped per lawyer. From 5 seats.":
      "Eén gedeeld kantoor-brain, scoped per advocaat. Vanaf 5 seat.",
    "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.":
      "Compliance-grade, op jouw infrastructuur of EU-cloud. Vanaf 20 seat.",
    "Managed EU hosting — no API keys": "Beheerde EU-hosting — geen API keys",
    "Case Q&A with page-level citations": "Q&A zaken met paginaniveau-citaten",
    "200 AI queries/mo · 15 GB": "200 AI-queries/mnd · 15 GB",
    "50 WhatsApp messages/mo": "50 WhatsApp-berichten/mnd",
    "ZPO deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "ZPO-termijnen + conflictencontrole (§ 43a BRAO / § 10 RAO / BGFA)",
    "Email support": "Email-support",
    "Overage: €0.55/query · €0.30/WA msg": "Overage: €0,55/query · €0,30/WA-bericht",
    "1,000 AI queries/seat/mo · 75 GB/seat": "1.000 AI-queries/seat/mnd · 75 GB/seat",
    "300 WhatsApp messages/mo (firm total)": "300 WhatsApp-berichten/mnd (totaal kantoor)",
    "WhatsApp matter copilot + voice notes": "WhatsApp copilot voor zaken + spraaknotities",
    "ZPO/BGB/ABGB deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "ZPO/BGB/ABGB-termijnen + conflictencontrole (§ 43a BRAO / § 10 RAO / BGFA)",
    "beA intake · RVG/BRAG fee calculator": "beA-ontvangst · RVG/BRAG-kosten calculator",
    "Priority support": "Priority support",
    "Overage: €0.45/query · €0.25/WA msg": "Overage: €0,45/query · €0,25/WA-bericht",
    "Everything in Professional": "Alles van Professional",
    "4,000 AI queries/seat/mo · 200 GB/seat": "4.000 AI-queries/seat/mnd · 200 GB/seat",
    "1,000 WhatsApp messages/mo (firm total)": "1.000 WhatsApp-berichten/mnd (totaal kantoor)",
    "Shared matter memory + firm-wide conflict checks":
      "Gedeelde zaak-geheugen + kantoorbrede conflictencontrole",
    "Time tracking, expenses, invoicing & DATEV export":
      "Tijd-tracking, kosten, facturatie & DATEV-export",
    "Four-eyes approval + full audit trail": "Vier-ogen-goedkeuring + volledige audit trail",
    "Onboarding & dedicated support": "Onboarding & dedicated support",
    "Overage: €0.40/query · €0.20/WA msg": "Overage: €0,40/query · €0,20/WA-bericht",
    "15,000 AI queries/seat/mo (Fair Use beyond)": "15.000 AI-queries/seat/mnd (Fair Use daarna)",
    "5,000 WhatsApp messages/seat/mo": "5.000 WhatsApp-berichten/seat/mnd",
    "500 GB storage/seat": "500 GB opslag/seat",
    "EU cloud or on-premise deployment": "EU-cloud of on-premise deployment",
    "DPA, SLA, SSO/SAML": "DPA, SLA, SSO/SAML",
    "DMS / RA-MICRO / Advoware import": "DMS / RA-MICRO / Advoware import",
    "Maximum-recall search mode": "Maximum-recall zoekmodus",
    "Dedicated CSM · custom retention & storage": "Dedicated CSM · custom retention & opslag",
    "Overage: €0.35/query · €0.15/WA msg": "Overage: €0,35/query · €0,15/WA-bericht",
  }),
};

export function pricingForIndustry(
  lang: Lang,
  industry: string | null | undefined
): VerticalPricing | null {
  if (industry !== "legal") return null;
  return VERTICAL_PRICING[lang].legal ?? null;
}
