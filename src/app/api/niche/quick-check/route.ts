import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

interface QuickCheckBody {
  case_description?: string;
  email?: string;
  niche?: string;
  source?: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const caseDescription = formData.get("case_description") as string | null;
    const email = formData.get("email") as string | null;
    const niche = formData.get("niche") as string | null;
    const files = formData.getAll("files");

    if (!caseDescription || caseDescription.trim().length < 20) {
      return NextResponse.json(
        { error: "Case description must be at least 20 characters." },
        { status: 400 }
      );
    }

    // Determine verdict based on case description analysis
    const text = caseDescription.toLowerCase();
    const positiveSignals = [
      "verlust",
      "betrug",
      "schaden",
      "anspruch",
      "frist",
      "urteil",
      "bescheid",
      "vertrag",
      "widerruf",
      "datenschutz",
      "verletzung",
      "impfung",
      "impfschaden",
      "abschiebung",
      "asyl",
      "amtshaftung",
      "behörde",
      "krypto",
      "bitcoin",
      "casino",
      "spiel",
      "kredit",
      "widerrufsbelehrung",
      "dsgvo",
      "strafe",
      "verteidigung",
      "beweis",
      "ermittlung",
    ];

    const matchCount = positiveSignals.filter((s) => text.includes(s)).length;
    const hasFiles = files.length > 0;

    let verdict: "aussichtsreich" | "bedingt" | "nicht-aussichtsreich";
    let summary: string;

    if (matchCount >= 3) {
      verdict = "aussichtsreich";
      summary = `Ihre Fallbeschreibung enthält mehrere juristisch relevante Hinweise. Basierend auf den genannten Sachverhalten gibt es vielversprechende rechtliche Handlungsansätze. Eine vertiefte AI-Analyse mit Dokumenten-Upload wird empfohlen, um die Erfolgsprognose zu präzisieren.`;
    } else if (matchCount >= 1) {
      verdict = "bedingt";
      summary = `Ihre Fallbeschreibung zeigt erste Anhaltspunkte für juristische Handlungsansätze. Für eine verlässliche Einschätzung sind weitere Details und idealerweise Dokumente erforderlich. Das AI-Dossier kann hier Klarheit schaffen.`;
    } else {
      verdict = "bedingt";
      summary = `Ihre Beschreibung gibt erste Hinweise auf den Sachverhalt. Für eine fundierte juristische Ersteinschätzung empfehlen wir, weitere Details nachzureichen und Dokumente hochzuladen. Das AI-Dossier analysiert dann alle Aspekte umfassend.`;
    }

    if (hasFiles) {
      summary += ` Sie haben ${files.length} Dokument(e) hochgeladen — diese werden in der vollständigen AI-Analyse berücksichtigt.`;
    }

    const nicheTitle = niche
      ? niche.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Ihr Rechtsgebiet";

    const nextSteps = [
      "Vollständiges AI-Dossier mit Rechtsgrundlagen und Urteilen erstellen",
      hasFiles
        ? "Hochgeladene Dokumente detailliert analysieren"
        : "Dokumente hochladen für detaillierte Aktenanalyse",
      "Erfolgsprognose und Streitwert-Bewertung erhalten",
    ];

    // Store lead (fire-and-forget — can be extended with CRM integration)
    if (email) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            niche: niche || "unknown",
            source: "niche-quick-check",
            case_description: caseDescription.substring(0, 500),
            verdict,
            has_files: hasFiles,
          }),
        });
      } catch {
        // Lead storage is best-effort — don't fail the check
      }
    }

    return NextResponse.json({
      verdict,
      summary,
      legalArea: nicheTitle,
      nextSteps,
    });
  } catch {
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
