import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — AI Legal Workspace für Kanzleien in DACH",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio ist Kanzleisoftware für Akten, Fristen, Dokumente, Recherche und KI-Antworten mit Fundstellen — gebaut für Anwälte in Österreich, Deutschland und der Schweiz.",
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
