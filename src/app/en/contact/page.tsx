import type { Metadata } from "next";
import ContactPage from "@/components/marketing/contact-page";
import { JsonLd, localBusinessLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Contact Subsumio — talk to our team",
  description:
    "Questions about Subsumio, self-hosting, enterprise or partnerships? Reach our team about AI legal software, DSGVO compliance, AVV, professional secrecy and partner programs. Reply within one business day.",
  alternates: {
    canonical: "/en/contact",
    languages: {
      "de-DE": "/contact",
      "de-AT": "/at/contact",
      "de-CH": "/ch/contact",
      en: "/en/contact",
    },
  },
  openGraph: {
    title: "Contact Subsumio — talk to our team",
    description:
      "Questions about Subsumio, self-hosting, enterprise or partnerships? Reach our team about AI legal software, security and partner programs.",
    url: "/en/contact",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={localBusinessLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Contact", url: "/en/contact" },
        ])}
      />
      <ContactPage lang="en" />
    </>
  );
}
