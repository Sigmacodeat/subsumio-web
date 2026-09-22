import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Anmelden",
  description:
    "Bei Subsumio anmelden und mit Akten, Dokumenten, Fristen, belegten KI-Antworten und der Kanzlei-Übersicht arbeiten.",
  robots: { index: false },
  alternates: {
    canonical: "/at/login",
    languages: { "de-AT": "/at/login", "de-DE": "/de/login", "x-default": "/at/login" },
  },
};

export default function Page() {
  return <AuthForm mode="login" />;
}
