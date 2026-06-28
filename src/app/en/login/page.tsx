import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Subsumio to work with matters, documents, deadlines, cited AI answers and your legal dashboard.",
  robots: { index: false },
  alternates: {
    canonical: "/en/login",
    languages: { "de-DE": "/login", "de-AT": "/at/login", "de-CH": "/ch/login", en: "/en/login" },
  },
};

export default function Page() {
  return <AuthForm mode="login" lang="en" />;
}
