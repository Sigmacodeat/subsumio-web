import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Anmelden",
  description:
    "Bei Subsumio anmelden und mit Akten, Dokumenten, Fristen, belegten KI-Antworten und der Kanzlei-Übersicht arbeiten.",
  robots: { index: false },
  alternates: {
    canonical: "/de/login",
    languages: { "de-DE": "/de/login", "de-AT": "/at/login", "x-default": "/at/login" },
  },
};

export default function Page() {
  return <AuthForm mode="login" />;
}
