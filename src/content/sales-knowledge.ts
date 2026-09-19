// Answers the website concierge may give that no other page states.
// Keep this SHORT: anything a visitor should read belongs on a real page
// first (features, pricing, security, handbook) — the concierge reads those
// directly (src/lib/concierge/knowledge.ts). Every entry here must be true
// today; the concierge will quote it word for word.

import type { KnowledgeChunk } from "@/lib/concierge/knowledge";

export const SALES_KNOWLEDGE: KnowledgeChunk[] = [
  {
    id: "sales-contact",
    title: "Kontakt",
    url: "/at/contact",
    text:
      "Kontakt zu Subsumio: allgemeine Anfragen und Vertrieb unter hello@subsum.io, " +
      "Datenschutzanfragen an den Datenschutzbeauftragten unter dsb@subsum.io. " +
      "Im Chat können Sie auch einen Rückruf oder einen Termin anfragen; ein Mensch meldet sich.",
  },
  {
    id: "sales-concierge",
    title: "Über diesen Chat",
    url: "/at/contact",
    text:
      "Dieser Chat ist ein KI-Assistent von Subsumio. Er beantwortet Fragen zum Produkt, zu Tarifen, " +
      "Sicherheit und Einrichtung anhand der Inhalte dieser Website und nennt jeweils die Quelle. " +
      "Er gibt keine Rechtsberatung und beantwortet keine Fragen zu konkreten Rechtsfällen. " +
      "Bitte geben Sie im Chat keine Mandantendaten ein. Auf Wunsch übernimmt ein Mensch.",
  },
];
