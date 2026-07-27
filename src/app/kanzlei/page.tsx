import AudiencePage from "@/components/marketing/audience-page";
import { JsonLd, breadcrumbLd, serviceLd } from "@/components/seo/jsonld";
import { audienceMetadata } from "@/lib/audience-metadata";

export const metadata = audienceMetadata("de", "professional", "/kanzlei");

export default function Page() {
  return (
    <>
      <JsonLd
        data={serviceLd({
          name: "Subsumio für Kanzleien",
          description: "KI-Aktenarbeit für Solo-Berufsträger, Kanzleien und Rechtsabteilungen.",
          url: "/kanzlei",
          lang: "de",
          audience: "Kanzleien und Rechtsabteilungen",
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Kanzleien", url: "/kanzlei" },
        ])}
      />
      <AudiencePage lang="de" audience="professional" />
    </>
  );
}
