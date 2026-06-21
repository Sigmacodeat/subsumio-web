import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "New password",
  description: "Set a new Subsumio password for secure access to your legal workspace.",
  robots: { index: false },
  alternates: { canonical: "/reset", languages: { en: "/reset", de: "/de/reset" } },
};

export default function Page() {
  return <RecoveryForm mode="reset" lang="en" />;
}
