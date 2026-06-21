import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Anmelden",
  description:
    "Bei Subsumio anmelden und mit Akten, Dokumenten, Fristen, belegten KI-Antworten und dem Kanzlei-Dashboard arbeiten.",
  alternates: { canonical: "/de/login", languages: { en: "/login", de: "/de/login" } },
};

export default function Page() {
  return <AuthForm mode="login" lang="de" />;
}
