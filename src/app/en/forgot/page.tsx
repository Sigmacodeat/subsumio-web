import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Reset your Subsumio password securely and regain access to your legal workspace.",
  robots: { index: false },
  alternates: {
    canonical: "/en/forgot",
    languages: {
      "de-DE": "/forgot",
      "de-AT": "/at/forgot",
      "de-CH": "/ch/forgot",
      en: "/en/forgot",
    },
  },
};

export default function Page() {
  return <RecoveryForm mode="forgot" lang="en" />;
}
