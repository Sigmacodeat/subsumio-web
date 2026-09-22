import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen",
  robots: { index: false },
  alternates: {
    canonical: "/de/forgot",
    languages: { "de-DE": "/de/forgot", "de-AT": "/at/forgot", "x-default": "/at/forgot" },
  },
};

export default function Page() {
  return <RecoveryForm mode="forgot" />;
}
