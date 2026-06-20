import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import JoinForm from "@/components/auth/join-form";

export const metadata: Metadata = {
  title: "Join team",
  robots: { index: false },
  alternates: { canonical: "/join", languages: { en: "/join", de: "/de/join" } },
};

// Invite landing page. Not signed in → through signup first, then back here
// (the `next` param survives the auth flow). The actual join is an explicit
// POST from the confirm button — a mail scanner prefetching this GET can
// never join anyone to anything.

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
    redirect(`/signup?next=${encodeURIComponent(`/join?${qs}`)}`);
  }
  return (
    <JoinForm
      token={params.token ?? ""}
      org={params.org ?? ""}
      email={params.email ?? ""}
      myEmail={me.email}
      lang={me.locale === "de" ? "de" : "en"}
    />
  );
}
