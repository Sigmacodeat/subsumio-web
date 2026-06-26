import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Kostenlos starten",
  description:
    "Subsumio kostenlos starten: KI-Kanzleisoftware für Akten, Fristen, Dokumente und belegte Antworten ohne Kreditkarte testen.",
  robots: { index: false },
  alternates: { canonical: "/de/signup", languages: { en: "/signup", de: "/de/signup" } },
};

export default function Page() {
  return <AuthForm mode="signup" lang="de" />;
}
