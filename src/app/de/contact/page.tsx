import type { Metadata } from "next";
import ContactPage from "@/components/marketing/contact-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Kontakt — Subsumio KI-Kanzleisoftware",
  description:
    "Fragen zu Subsumio, Self-Hosting, Enterprise oder Partnerschaften? Unser Team antwortet innerhalb eines Werktages — auch zu DSGVO, AVV, Berufsgeheimnis (§ 203 StGB) und technisch-organisatorischen Maßnahmen.",
  alternates: {
    canonical: "/contact",
    languages: {
      "de-DE": "/contact",
      "de-AT": "/at/contact",
      "de-CH": "/ch/contact",
      en: "/en/contact",
    },
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
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Kontakt", url: "/de/contact" },
        ])}
      />
      <ContactPage lang="de" />
    </>
  );
}
