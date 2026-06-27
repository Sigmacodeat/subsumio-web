import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen",
  robots: { index: false },
  alternates: { canonical: "/forgot", languages: { de: "/forgot", en: "/en/forgot" } },
};

export default function Page() {
  return <RecoveryForm mode="forgot" lang="de" />;
}
