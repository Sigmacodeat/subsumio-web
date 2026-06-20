import type { Metadata } from "next";
import ContactPage from "@/components/marketing/contact-page";

export const metadata: Metadata = {
  title: "Contact Subsumio — talk to our team",
  description:
    "Questions about Subsumio, self-hosting, enterprise or partnerships? Reach our team — we speak your language, including your data protection officer's.",
  alternates: { canonical: "/contact", languages: { en: "/contact", de: "/de/contact" } },
};

export default function Page() {
  return <ContactPage lang="en" />;
}
