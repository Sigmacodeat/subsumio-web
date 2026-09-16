import type { Metadata } from "next";
import RecoveryForm from "@/components/auth/recovery-form";

export const metadata: Metadata = {
  title: "Neues Passwort",
  robots: { index: false },
  alternates: {
    canonical: "/at/reset",
  },
};

export default function Page() {
  return <RecoveryForm mode="reset" />;
}
