import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — AI Legal Software for Law Firms | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio is AI legal software for law firms in Austria, Germany and Switzerland: matter management, deadline tracking per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check. GDPR-ready, EU cloud or self-hosted.",
  alternates: {
    canonical: "/en",
    languages: { de: "/", en: "/en" },
  },
};

export default function ENLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div lang="en">{children}</div>;
}
