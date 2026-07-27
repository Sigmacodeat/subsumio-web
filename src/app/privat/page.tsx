import AudiencePage from "@/components/marketing/audience-page";
import { JsonLd, breadcrumbLd, serviceLd } from "@/components/seo/jsonld";
import { audienceMetadata } from "@/lib/audience-metadata";

export const metadata = audienceMetadata("de", "private", "/privat");

export default function Page() {
  return (
    <>
      <JsonLd
        data={serviceLd({
          name: "Subsumio Privatzugang",
          description:
            "Automatisierte, belegte rechtliche Ersteinschätzung ausgewählter Unterlagen.",
          url: "/privat",
          lang: "de",
          audience: "Privatpersonen",
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Privatpersonen", url: "/privat" },
        ])}
      />
      <AudiencePage lang="de" audience="private" />
    </>
  );
}
