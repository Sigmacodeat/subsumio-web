import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "30 Tage kostenlos testen",
  description:
    "Subsumio kostenlos starten: KI-Kanzleisoftware für Akten, Fristen, Dokumente und belegte Antworten ohne Kreditkarte testen.",
  robots: { index: false },
  alternates: {
    canonical: "/de/signup",
    languages: { "de-DE": "/de/signup", "de-AT": "/at/signup", "x-default": "/at/signup" },
  },
};

export default function Page() {
  return <AuthForm mode="signup" />;
}
