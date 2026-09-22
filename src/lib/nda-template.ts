/**
 * Standard German-language NDA (Geheimhaltungsvereinbarung) text used as the
 * starting document for the signature quick-create flow. This is a plain
 * mutual-NDA boilerplate, not tailored legal advice for a specific matter —
 * the lawyer is expected to review/adjust the text before sending it, same
 * as any other drafted document.
 */
export function buildNdaTemplate(input: {
  firmName?: string;
  recipientName: string;
  effectiveDate?: string;
  durationYears?: number;
}): string {
  const firm = input.firmName?.trim() || "[Kanzlei]";
  const partner = input.recipientName.trim() || "[Vertragspartner]";
  const date =
    input.effectiveDate ??
    new Date().toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
  const years = input.durationYears ?? 3;

  return `GEHEIMHALTUNGSVEREINBARUNG (NDA)

zwischen

${firm}
– nachfolgend „Kanzlei" genannt –

und

${partner}
– nachfolgend „Vertragspartner" genannt –

geschlossen am ${date}.

§ 1 Gegenstand und Zweck
Die Parteien beabsichtigen den Austausch vertraulicher Informationen im Zusammenhang mit
einer bestehenden oder angebahnten Zusammenarbeit. Diese Vereinbarung regelt den Umgang
mit den dabei offengelegten vertraulichen Informationen.

§ 2 Vertrauliche Informationen
Vertrauliche Informationen im Sinne dieser Vereinbarung sind alle mündlichen, schriftlichen
oder elektronisch übermittelten Informationen, Unterlagen, Daten und sonstigen Kenntnisse,
die von einer Partei ("Offenlegende Partei") an die andere Partei ("Empfangende Partei")
weitergegeben werden und als vertraulich gekennzeichnet sind oder erkennbar vertraulichen
Charakter haben.

§ 3 Pflichten der Empfangenden Partei
Die Empfangende Partei verpflichtet sich,
(a) vertrauliche Informationen streng vertraulich zu behandeln und nicht an Dritte weiterzugeben,
(b) vertrauliche Informationen ausschließlich zum in § 1 genannten Zweck zu verwenden,
(c) vertrauliche Informationen nur den eigenen Mitarbeitenden zugänglich zu machen, die sie
    zur Erfüllung des Zwecks benötigen und ihrerseits zur Vertraulichkeit verpflichtet sind, und
(d) angemessene Sicherheitsvorkehrungen zum Schutz der vertraulichen Informationen zu treffen.

§ 4 Ausnahmen
Die Verpflichtungen aus § 3 gelten nicht für Informationen, die
(a) der Empfangenden Partei bereits vor Offenlegung bekannt waren,
(b) öffentlich bekannt sind oder werden, ohne dass die Empfangende Partei dies zu vertreten hat,
(c) der Empfangenden Partei von einem Dritten rechtmäßig ohne Vertraulichkeitsverpflichtung
    zugänglich gemacht wurden, oder
(d) aufgrund gesetzlicher Pflicht oder behördlicher/gerichtlicher Anordnung offengelegt werden
    müssen — in diesem Fall wird die Offenlegende Partei, soweit rechtlich zulässig, vorab
    informiert.

§ 5 Dauer
Diese Vereinbarung tritt mit Unterzeichnung in Kraft und gilt für die Dauer der Zusammenarbeit
sowie ${years} Jahre über deren Beendigung hinaus fort.

§ 6 Rückgabe/Löschung
Auf Verlangen der Offenlegenden Partei sind alle vertraulichen Informationen einschließlich
etwaiger Kopien zurückzugeben oder nachweislich zu löschen, soweit keine gesetzliche
Aufbewahrungspflicht entgegensteht.

§ 7 Keine Rechteübertragung
Diese Vereinbarung begründet keine Lizenz- oder sonstigen Nutzungsrechte an den offengelegten
Informationen über den in § 1 genannten Zweck hinaus.

§ 8 Schlussbestimmungen
Es gilt das Recht der Republik Österreich unter Ausschluss des UN-Kaufrechts. Gerichtsstand
ist, soweit gesetzlich zulässig, der Sitz der Kanzlei. Sollte eine Bestimmung dieser
Vereinbarung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

Mit der elektronischen Unterschrift bestätigen beide Parteien, den Inhalt dieser
Vereinbarung zur Kenntnis genommen zu haben und ihm zuzustimmen.`;
}
