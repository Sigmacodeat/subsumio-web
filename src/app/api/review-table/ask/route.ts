import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

const postSchema = z.object({
  case_slug: z.string().optional(),
  table_title: z.string().optional(),
  query: z.string().min(1),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
});

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
  if (lowerQuery.includes("wie viele") || lowerQuery.includes("anzahl")) {
    return `Die Tabelle "${title}" enthält ${rows.length} Einträge.\n\nDiese Information ersetzt keine anwaltliche Prüfung.`;
  }
  if (lowerQuery.includes("höchst") || lowerQuery.includes("max") || lowerQuery.includes("größt")) {
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

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    body: postSchema,
  },
  async (ctx, body) => {
    const tableText = formatTableForPrompt(body.columns, body.rows);
    const prompt = `Du bist ein Legal AI Assistant. Ein Anwalt stellt eine Frage über eine Review-Tabelle.

TABELLE: ${body.table_title}
AKTE: ${body.case_slug || "—"}

SPALTEN: ${body.columns.join(", ")}

DATEN:
${tableText}

FRAGE DES ANWALTS: ${body.query}

Antworte präzise und strukturiert. Beziehe dich auf konkrete Zeilen und Werte.
Wenn die Frage nicht beantwortet werden kann, erkläre warum.
Beende die Antwort mit: "Diese Information ersetzt keine anwaltliche Prüfung."`;

    const engineRes = await fetch(`${ENGINE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        prompt,
        brain_id: ctx.brainId,
        model: "anthropic:claude-sonnet-4-6",
        max_turns: 5,
      }),
    });

    if (!engineRes.ok) {
      const answer = generateSimpleAnswer(
        body.query,
        body.columns,
        body.rows,
        body.table_title ?? ""
      );
      return Response.json({ answer });
    }

    const result = await engineRes.json();
    const answer = String(result.response ?? result.text ?? result.answer ?? "");
    return Response.json({ answer });
  }
);
