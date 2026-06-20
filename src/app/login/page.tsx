import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  alternates: { canonical: "/login", languages: { en: "/login", de: "/de/login" } },
};

export default function Page() {
  return <AuthForm mode="login" lang="en" />;
}
