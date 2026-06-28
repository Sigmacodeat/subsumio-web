import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Anmelden",
  description:
    "Bei Subsumio anmelden und mit Akten, Dokumenten, Fristen, belegten KI-Antworten und dem Kanzlei-Dashboard arbeiten.",
  robots: { index: false },
  alternates: {
    canonical: "/login",
    languages: {
      "de-DE": "/login",
      "de-AT": "/at/login",
      "de-CH": "/ch/login",
      en: "/en/login",
      "x-default": "/login",
    },
  },
};

export default function Page() {
  return <AuthForm mode="login" lang="de" />;
}
