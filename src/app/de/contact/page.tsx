import type { Metadata } from "next";
import ContactPage from "@/components/marketing/contact-page";
import { JsonLd, localBusinessLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Kontakt — Subsumio KI-Kanzleisoftware",
  description:
    "Fragen zu Subsumio, Self-Hosting, Enterprise oder Partnerschaften? Unser Team antwortet innerhalb eines Werktages — auch zu DSGVO, AVV, Berufsgeheimnis (§ 43a Abs. 2 BRAO) und technisch-organisatorischen Maßnahmen.",
  alternates: {
    canonical: "/de/contact",
    languages: { "de-DE": "/de/contact", "de-AT": "/at/contact", "x-default": "/at/contact" },
  },
  openGraph: {
    title: "Kontakt — Subsumio KI-Kanzleisoftware",
    description:
      "Fragen zu Subsumio, Self-Hosting, Enterprise oder Partnerschaften? Unser Team antwortet innerhalb eines Werktages — auch zu DSGVO, AVV und Berufsgeheimnis.",
    url: "/de/contact",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={localBusinessLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Kontakt", url: "/de/contact" },
        ])}
      />
      <ContactPage />
    </>
  );
}
