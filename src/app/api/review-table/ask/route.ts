/**
 * Gap 6: Ask Over Review API Endpoint.
 *
 * POST /api/review-table/ask
 * Body: { case_slug, table_title, query, columns, rows }
 *
 * Erlaubt dem Anwalt, Fragen über eine Review-Tabelle zu stellen
 * (Harvey-Feature: "Ask questions over any review table to summarize,
 * compare, or isolate key insights").
 */

import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL } from "@/lib/engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { case_slug, table_title, query, columns, rows } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    if (!Array.isArray(columns) || !Array.isArray(rows)) {
      return NextResponse.json({ error: "columns and rows are required" }, { status: 400 });
    }

    // Build a structured prompt from the table data
    const tableText = formatTableForPrompt(columns, rows);
    const prompt = `Du bist ein Legal AI Assistant. Ein Anwalt stellt eine Frage über eine Review-Tabelle.

TABELLE: ${table_title}
AKTE: ${case_slug || "—"}

SPALTEN: ${columns.join(", ")}

DATEN:
${tableText}

FRAGE DES ANWALTS: ${query}

Antworte präzise und strukturiert. Beziehe dich auf konkrete Zeilen und Werte.
Wenn die Frage nicht beantwortet werden kann, erkläre warum.
Beende die Antwort mit: "Diese Information ersetzt keine anwaltliche Prüfung."`;

    // Forward to engine chat endpoint
    const engineRes = await fetch(`${ENGINE_URL}/api/chat`, {
      method: "POST",
      headers: {
        Authorization: req.headers.get("authorization") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        brain_id: process.env.LEGAL_BRAIN_ID ?? "default",
        model: "anthropic:claude-sonnet-4-6",
        max_turns: 5,
      }),
    });

    if (!engineRes.ok) {
      // Fallback: return a simple structured answer
      const answer = generateSimpleAnswer(query, columns, rows, table_title);
      return NextResponse.json({ answer });
    }

    const result = await engineRes.json();
    const answer = String(result.response ?? result.text ?? result.answer ?? "");
    return NextResponse.json({ answer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function formatTableForPrompt(columns: string[], rows: Array<Record<string, unknown>>): string {
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((row) => {
    const cells = columns.map((col) => {
      const cell = (row as Record<string, Record<string, unknown>>).cells?.[col];
      const value =
        typeof cell === "object" && cell !== null
          ? String((cell as Record<string, unknown>).value ?? "")
          : String(cell ?? "");
      return value.replace(/\|/g, "\\|");
    });
    return `| ${cells.join(" | ")} |`;
  });
  return [header, separator, ...dataRows].join("\n");
}

function generateSimpleAnswer(
  query: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  title: string
): string {
  const lowerQuery = query.toLowerCase();
  // Simple heuristics
  if (lowerQuery.includes("wie viele") || lowerQuery.includes("anzahl")) {
    return `Die Tabelle "${title}" enthält ${rows.length} Einträge.\n\nDiese Information ersetzt keine anwaltliche Prüfung.`;
  }
  if (lowerQuery.includes("höchst") || lowerQuery.includes("max") || lowerQuery.includes("größt")) {
    // Find numeric max in first column
    let maxVal = -Infinity;
    let maxRow: Record<string, unknown> | null = null;
    for (const row of rows) {
      const cells = (row as Record<string, Record<string, unknown>>).cells ?? {};
      const firstCell = cells[columns[0] ?? ""] as Record<string, unknown> | undefined;
      const val =
        typeof firstCell === "object" && firstCell !== null
          ? Number(firstCell.value)
          : Number(firstCell);
      if (!isNaN(val) && val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }
    if (maxRow) {
      return `Der höchste Wert in "${title}" ist ${maxVal} (Zeile ${rows.indexOf(maxRow) + 1}).\n\nDiese Information ersetzt keine anwaltliche Prüfung.`;
    }
  }
  return `Ihre Frage "${query}" zur Tabelle "${title}" kann mit den verfügbaren Daten nicht automatisch beantwortet werden. Bitte prüfen Sie die Tabelle manuell.\n\nDiese Information ersetzt keine anwaltliche Prüfung.`;
}
