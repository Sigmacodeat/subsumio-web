import type { Metadata } from "next";
import ContactPage from "@/components/marketing/contact-page";

export const metadata: Metadata = {
  title: "Kontakt — sprich mit unserem Team",
  description:
    "Fragen zu Subsumio, Self-Hosting, Enterprise oder Partnerschaften? Erreichen Sie unser Team — wir sprechen Ihre Sprache, auch die Ihres Datenschutzbeauftragten.",
  alternates: { canonical: "/de/contact", languages: { en: "/contact", de: "/de/contact" } },
};

export default function Page() {
  return <ContactPage lang="de" />;
}
