// Knowledge the website concierge may answer from — built from the same
// content modules the website renders, never from a separate bot FAQ. If the
// website says it, the concierge can say it (with a link to where it says
// it); if the website does not say it, the concierge cannot.
//
// Prices and limits come from the billing source (src/lib/billing/plans.ts),
// so the concierge quotes exactly what checkout charges.

import { BILLABLE_PLANS, BILLING_PLANS_DISPLAY } from "@/lib/billing/plans";
import { TRIAL_DAYS } from "@/lib/billing/trial";
import { professionalPricing } from "@/content/audiences";
import { PRICING_FAQ, LANDING } from "@/content/site";
import { FEATURES_PAGE } from "@/content/features";
import { SECURITY } from "@/content/security";
import { SOLUTIONS, SOLUTION_SLUGS } from "@/content/solutions";
import { HANDBOOK, HANDBOOK_FAQ } from "@/content/handbook";
import { PROOF } from "@/content/proof-points";
import { SALES_KNOWLEDGE } from "@/content/sales-knowledge";

export interface KnowledgeChunk {
  /** Stable id, e.g. "pricing-faq-2". Cited by the model, checked by the server. */
  id: string;
  /** Short label shown under the answer ("Preise – Häufige Fragen"). */
  title: string;
  text: string;
  /** Public page (path) the visitor can open to read it themselves. */
  url: string;
}

const eur = (n: number) => `${n.toLocaleString("de-AT").replace(/\s/g, ".")} €`;

function pricingChunks(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  const solo = BILLABLE_PLANS.pro;
  const team = BILLABLE_PLANS.team;
  chunks.push({
    id: "pricing-overview",
    title: "Preise",
    url: "/at/pricing",
    text:
      `Tarife: ${solo.name} ${eur(solo.monthlyEur)} pro Monat für ${solo.seats} Nutzer. ` +
      `${team.name} ${eur(team.monthlyEur)} pro Monat inklusive ${team.seats} Nutzern. ` +
      `Enterprise auf Anfrage. ${professionalPricing().footnote} ` +
      `Community ist kostenlos und wird selbst betrieben (Self-Hosting). ` +
      `Zusätzliche KI-Nutzung kann über KI-Guthaben dazugekauft werden. ` +
      `Testphase: ${TRIAL_DAYS} Tage mit vollem Funktionsumfang, ohne Kreditkarte.`,
  });
  for (const plan of BILLING_PLANS_DISPLAY) {
    chunks.push({
      id: `plan-${plan.id}`,
      title: `Tarif ${plan.name}`,
      url: "/at/pricing",
      text: `Tarif ${plan.name} (${plan.price}): ${plan.features.join("; ")}.`,
    });
  }
  for (const tier of professionalPricing().tiers) {
    chunks.push({
      id: `tier-${tier.id}`,
      title: `Tarif ${tier.name}`,
      url: "/at/pricing",
      text: `${tier.name} – ${tier.price} ${tier.period}. ${tier.blurb} ${tier.features.join("; ")}.`,
    });
  }
  PRICING_FAQ.items.forEach((item, i) =>
    chunks.push({
      id: `pricing-faq-${i}`,
      title: "Preise – Häufige Fragen",
      url: "/at/pricing",
      text: `${item.q} ${item.a}`,
    })
  );
  return chunks;
}

function faqChunks(
  prefix: string,
  title: string,
  url: string,
  faq: { q: string; a: string }[]
): KnowledgeChunk[] {
  return faq.map((item, i) => ({
    id: `${prefix}-faq-${i}`,
    title,
    url,
    text: `${item.q} ${item.a}`,
  }));
}

function featureChunks(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  for (const cat of FEATURES_PAGE.categories) {
    chunks.push({
      id: `feature-${cat.id}`,
      title: `Funktionen – ${cat.label}`,
      url: "/at/features",
      text: `${cat.title}. ${cat.intro} ${cat.items.map((it) => `${it.title}: ${it.desc}`).join(" ")}`,
    });
  }
  chunks.push(
    ...faqChunks("features", "Funktionen – Häufige Fragen", "/at/features", FEATURES_PAGE.faq)
  );
  return chunks;
}

function securityChunks(): KnowledgeChunk[] {
  const s = SECURITY;
  const url = "/at/security";
  return [
    {
      id: "security-pillars",
      title: "Sicherheit",
      url,
      text: s.pillars.map((p) => `${p.title}: ${p.desc}`).join(" "),
    },
    {
      id: "security-hosting",
      title: "Sicherheit – Betrieb",
      url,
      text: `${s.hostingTitle}. ${s.hostingSub} ${s.hostingOptions
        .map((o) => `${o.title}: ${o.points.join("; ")}`)
        .join(" ")}`,
    },
    {
      id: "security-compliance",
      title: "Sicherheit – Compliance",
      url,
      text: `${s.complianceTitle}. ${s.complianceItems.map((c) => `${c.title}: ${c.desc}`).join(" ")}`,
    },
    {
      id: "security-ai-act",
      title: "Sicherheit – AI Act",
      url,
      text: `${s.aiActTitle}. ${s.aiActText} ${s.aiActItems.map((c) => `${c.title}: ${c.desc}`).join(" ")}`,
    },
    {
      id: "security-enterprise",
      title: "Sicherheit – Enterprise",
      url,
      text: `${s.enterpriseTitle}. ${s.enterpriseText} ${s.enterpriseItems
        .map((c) => `${c.title}: ${c.desc}`)
        .join(" ")}`,
    },
    ...faqChunks("security", "Sicherheit – Häufige Fragen", url, s.faq),
  ];
}

function solutionChunks(): KnowledgeChunk[] {
  return SOLUTION_SLUGS.flatMap((slug) => {
    const s = SOLUTIONS[slug];
    const url = `/at/solutions/${slug}`;
    return [
      {
        id: `solution-${slug}`,
        title: s.badge,
        url,
        text: `${s.h1a} ${s.h1b} ${s.sub} ${s.features.map((f) => `${f.title}: ${f.desc}`).join(" ")}`,
      },
      ...faqChunks(`solution-${slug}`, `${s.badge} – Häufige Fragen`, url, s.faq),
    ];
  });
}

function handbookChunks(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  for (const group of HANDBOOK) {
    for (const ch of group.chapters) {
      const parts = [
        `${ch.title}. ${ch.lead}`,
        `Im Produkt unter: ${ch.where}.`,
        ...(ch.steps ?? []).map((s) => `${s.title}: ${s.body}`),
        ...(ch.facts ?? []).map((f) => `${f.term}: ${f.body}`),
        ch.note ?? "",
      ];
      chunks.push({
        id: `handbook-${ch.id}`,
        title: `Handbuch – ${ch.title}`,
        url: `/at/docs#${ch.id}`,
        text: parts.filter(Boolean).join(" "),
      });
    }
  }
  chunks.push(...faqChunks("handbook", "Handbuch – Häufige Fragen", "/at/docs", HANDBOOK_FAQ));
  return chunks;
}

let cached: KnowledgeChunk[] | null = null;

/** Every chunk the concierge may cite. Built once per process. */
export function knowledgeBase(): KnowledgeChunk[] {
  if (cached) return cached;
  cached = [
    ...pricingChunks(),
    ...faqChunks("landing", "Häufige Fragen", "/at", LANDING.faq),
    ...featureChunks(),
    ...securityChunks(),
    ...solutionChunks(),
    ...handbookChunks(),
    {
      id: "proof-recall",
      title: "Messung der Suchqualität",
      url: "/at/benchmark-methodology",
      text: PROOF.recall8.plain,
    },
    ...SALES_KNOWLEDGE,
  ];
  return cached;
}

export function chunkById(id: string): KnowledgeChunk | undefined {
  return knowledgeBase().find((c) => c.id === id);
}
