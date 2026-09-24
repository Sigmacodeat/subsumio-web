import type { Metadata } from "next";
import EmailConfirmForm from "@/components/auth/email-confirm-form";

export const metadata: Metadata = {
  title: "E-Mail-Adresse bestätigen",
  robots: { index: false },
  alternates: {
    canonical: "/de/email-bestaetigen",
    languages: {
      "de-AT": "/at/email-bestaetigen",
      "de-DE": "/de/email-bestaetigen",
      "x-default": "/at/email-bestaetigen",
    },
  },
};

export default function Page() {
  return <EmailConfirmForm />;
}
