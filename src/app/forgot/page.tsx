import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Reset your Subsumio password securely and regain access to your legal workspace.",
  robots: { index: false },
  alternates: { canonical: "/forgot", languages: { en: "/forgot", de: "/de/forgot" } },
};

export default function Page() {
  return <RecoveryForm mode="forgot" lang="en" />;
}
