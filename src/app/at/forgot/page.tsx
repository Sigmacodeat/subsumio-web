import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen",
  robots: { index: false },
  alternates: {
    canonical: "/at/forgot",
    languages: {
      "de-DE": "/forgot",
      "de-AT": "/at/forgot",
      "de-CH": "/ch/forgot",
      en: "/en/forgot",
    },
  },
};

export default function Page() {
  return <RecoveryForm mode="forgot" lang="at" />;
}
