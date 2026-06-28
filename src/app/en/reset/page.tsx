import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "New password",
  description: "Set a new Subsumio password for secure access to your legal workspace.",
  robots: { index: false },
  alternates: {
    canonical: "/en/reset",
    languages: { "de-DE": "/reset", "de-AT": "/at/reset", "de-CH": "/ch/reset", en: "/en/reset" },
  },
};

export default function Page() {
  return <RecoveryForm mode="reset" lang="en" />;
}
