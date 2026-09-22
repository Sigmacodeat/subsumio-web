import type { Metadata } from "next";
import ContactPage from "@/components/marketing/contact-page";
import { JsonLd, localBusinessLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Kontakt — Subsumio KI-Kanzleisoftware",
  description:
    "Fragen zu Subsumio, Self-Hosting, Enterprise oder Partnerschaften? Unser Team antwortet innerhalb eines Werktages — auch zu DSGVO, AVV, Berufsgeheimnis (§ 9 Abs. 2 RAO) und technisch-organisatorischen Maßnahmen.",
  alternates: {
    canonical: "/at/contact",
    languages: { "de-AT": "/at/contact", "de-DE": "/de/contact", "x-default": "/at/contact" },
  },
  openGraph: {
    title: "Kontakt — Subsumio KI-Kanzleisoftware",
    description:
      "Fragen zu Subsumio, Self-Hosting, Enterprise oder Partnerschaften? Unser Team antwortet innerhalb eines Werktages — auch zu DSGVO, AVV und Berufsgeheimnis.",
    url: "/at/contact",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={localBusinessLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Kontakt", url: "/at/contact" },
        ])}
      />
      <ContactPage />
    </>
  );
}
