/** Engine warning codes → German text for the lawyer (the raw codes are technical). */
export function translationWarningText(w: string): string {
  const code = w.split(":")[0]?.trim();
  switch (code) {
    case "DOCUMENT_TRUNCATED_FOR_ANALYSIS":
      return "Das Dokument ist sehr lang: Nur der erste Teil wurde übersetzt. Den Rest bitte gesondert übersetzen.";
    case "TRANSLATION_INCOMPLETE":
      return "Die Übersetzung konnte nicht vollständig erstellt werden und wird daher nicht angezeigt. Bitte erneut versuchen.";
    case "UNSTRUCTURED_OUTPUT":
      return "Die Übersetzung kam in unerwartetem Format zurück und kann unvollständig sein — bitte mit dem Original abgleichen.";
    case "LLM_CALL_FAILED":
    case "LLM_NOT_CONFIGURED":
      return "Der Übersetzungsdienst ist derzeit nicht erreichbar. Bitte später erneut versuchen.";
    case "DOCUMENT_NOT_FOUND":
      return "Das Dokument wurde nicht gefunden.";
    case "NO_TEXT":
      return "Es wurde kein Text zum Übersetzen übergeben.";
    default:
      return w;
  }
}
