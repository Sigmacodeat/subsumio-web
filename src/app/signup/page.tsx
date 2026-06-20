import type { Metadata } from "next";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Start free",
  alternates: { canonical: "/signup", languages: { en: "/signup", de: "/de/signup" } },
};

export default function Page() {
  return <AuthForm mode="signup" lang="en" />;
}
