import type { Metadata } from "next";
import type { Audience } from "@/content/audiences";
import type { Lang } from "@/content/site";

export function audienceMetadata(lang: Lang, audience: Audience, canonical: string): Metadata {
  const en = !["de", "at", "ch"].includes(lang);
  const professional = audience === "professional";
  const title = professional
    ? en
      ? "Subsumio for law firms and legal teams — Solo, Firm, Enterprise"
      : "Subsumio für Kanzleien & Rechtsabteilungen — Solo, Kanzlei, Enterprise"
    : en
      ? "Subsumio for individuals — source-backed legal orientation"
      : "Subsumio für Privatpersonen — belegte rechtliche Orientierung";
  const description = professional
    ? en
      ? "Compare Solo, Firm and Enterprise access: cited case work, bulk ingestion, roles, shared knowledge and WhatsApp workflows."
      : "Solo, Kanzlei und Enterprise vergleichen: belegte Aktenarbeit, Massen-Ingest, Rollen, geteiltes Wissen und WhatsApp-Workflows."
    : en
      ? "A limited private access for source-backed first orientation on selected documents. No firm functions and no substitute for legal advice."
      : "Begrenzter Privatzugang für eine belegte Ersteinschätzung ausgewählter Unterlagen. Keine Kanzleifunktionen und kein Ersatz für Rechtsberatung.";

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
  };
}
