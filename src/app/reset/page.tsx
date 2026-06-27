import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Neues Passwort",
  robots: { index: false },
  alternates: { canonical: "/reset", languages: { de: "/reset", en: "/en/reset" } },
};

export default function Page() {
  return <RecoveryForm mode="reset" lang="de" />;
}
