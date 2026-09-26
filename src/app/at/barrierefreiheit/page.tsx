import type { Metadata } from "next";
import { AccessibilityContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Barrierefreiheit",
  description:
    "Barrierefreiheitserklärung für Subsumio: Geltungsbereich, Stand der Vereinbarkeit mit WCAG 2.2 AA, bekannte Einschränkungen, Feedback und Durchsetzungsverfahren.",
  alternates: {
    canonical: "/at/barrierefreiheit",
    languages: {
      "de-AT": "/at/barrierefreiheit",
      "de-DE": "/de/barrierefreiheit",
      "x-default": "/at/barrierefreiheit",
    },
  },
  openGraph: {
    title: "Barrierefreiheitserklärung — Subsumio",
    description:
      "Barrierefreiheitserklärung für Subsumio: Geltungsbereich, Stand der Vereinbarkeit mit WCAG 2.2 AA, bekannte Einschränkungen, Feedback und Durchsetzungsverfahren.",
    url: "/at/barrierefreiheit",
    type: "website",
  },
};

export default function AccessibilityPage() {
  return <AccessibilityContent home="/at" market="at" />;
}
