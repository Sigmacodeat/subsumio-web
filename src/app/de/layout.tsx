import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio ist die KI-Kanzleisoftware für Aktenverwaltung, Fristenkontrolle, Dokumentenmanagement und belegte KI-Antworten — DSGVO-konform, gebaut für Anwälte in Österreich, Deutschland und der Schweiz.",
  alternates: {
    canonical: "/de",
    languages: { en: "/", de: "/de" },
  },
};

export default function DELayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div lang="de">
      {children}
    </div>
  );
}
