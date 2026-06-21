import type { Metadata } from "next";
import ContactPage from "@/components/marketing/contact-page";

export const metadata: Metadata = {
  title: "Contact Subsumio — talk to our team",
  description:
    "Questions about Subsumio, self-hosting, enterprise or partnerships? Reach our team about AI legal software, security and partner programs.",
  alternates: { canonical: "/contact", languages: { en: "/contact", de: "/de/contact" } },
};

export default function Page() {
  return <ContactPage lang="en" />;
}
