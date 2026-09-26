import type { Metadata } from "next";
import { AccessibilityContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Barrierefreiheit",
  description:
    "Barrierefreiheitserklärung für Subsumio nach § 15 BFSG: Geltungsbereich, Stand der Vereinbarkeit mit WCAG 2.2 AA, bekannte Einschränkungen, Feedback und Durchsetzungsverfahren.",
  alternates: {
    canonical: "/de/barrierefreiheit",
    languages: {
      "de-DE": "/de/barrierefreiheit",
      "de-AT": "/at/barrierefreiheit",
      "x-default": "/at/barrierefreiheit",
    },
  },
  openGraph: {
    title: "Barrierefreiheitserklärung — Subsumio",
    description:
      "Barrierefreiheitserklärung für Subsumio nach § 15 BFSG: Geltungsbereich, Stand der Vereinbarkeit mit WCAG 2.2 AA, bekannte Einschränkungen, Feedback und Durchsetzungsverfahren.",
    url: "/de/barrierefreiheit",
    type: "website",
  },
};

export default function AccessibilityPage() {
  return <AccessibilityContent home="/de" market="de" />;
}
