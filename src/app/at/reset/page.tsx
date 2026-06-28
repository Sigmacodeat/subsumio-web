import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Neues Passwort",
  robots: { index: false },
  alternates: {
    canonical: "/at/reset",
    languages: { "de-DE": "/reset", "de-AT": "/at/reset", "de-CH": "/ch/reset", en: "/en/reset" },
  },
};

export default function Page() {
  return <RecoveryForm mode="reset" lang="at" />;
}
