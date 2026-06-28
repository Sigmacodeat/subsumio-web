import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import JoinForm from "@/components/auth/join-form";

export const metadata: Metadata = {
  title: "Team beitreten",
  robots: { index: false },
  alternates: {
    canonical: "/ch/join",
    languages: { "de-DE": "/join", "de-AT": "/at/join", "de-CH": "/ch/join", en: "/en/join" },
  },
};

// Einladungs-Landingpage. Nicht angemeldet → zuerst zur Registrierung,
// dann zurück hier (der `next`-Parameter überlebt den Auth-Flow).

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; org?: string; email?: string }>;
}) {
  const params = await searchParams;
  const me = await getSessionUser();
  if (!me) {
    const qs = new URLSearchParams({
      token: params.token ?? "",
      org: params.org ?? "",
      email: params.email ?? "",
    }).toString();
    redirect(`/ch/signup?next=${encodeURIComponent(`/ch/join?${qs}`)}`);
  }
  return (
    <JoinForm
      token={params.token ?? ""}
      org={params.org ?? ""}
      email={params.email ?? ""}
      myEmail={me.email}
      lang="ch"
    />
  );
}
