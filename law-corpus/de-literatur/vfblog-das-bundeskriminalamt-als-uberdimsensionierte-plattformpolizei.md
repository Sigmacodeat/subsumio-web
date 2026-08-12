---
title: >-
  Verfassungsblog — Das Bundeskriminalamt als überdimsensionierte
  Plattformpolizei
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2024-02-13'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: >-
  https://verfassungsblog.de/das-bundeskriminalamt-als-uberdimsensionierte-plattformpolizei/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
content_hash: "d9c6b9cf91f5a224"
---

# Das Bundeskriminalamt als überdimsensionierte Plattformpolizei

Das von der Bundesregierung vorgeschlagene Digitale-Dienste-Gesetz (DDG-E) soll im Bundestag bis zum März abschließend verhandelt werden und dann schon im April in Kraft treten.

Ein wichtiger Aspekt des Gesetzentwurfs erhält bisher zu wenig Aufmerksamkeit: Was genau soll eigentlich das Bundeskriminalamt (BKA) nach § 13 DDG-E – der nationalen „Begleitgesetzgebung” zu Art. 18 Digital Services Act (DSA) – machen? Ist diese Rolle im gegenwärtigen Entwurf hinreichend abgesichert? Und bedarf es dafür wirklich – wie geplant – 450 Stellen?

Bei näherem Hinsehen zeigen sich potenzielle Sollbruchstellen. Bei der „Entgegennahme” und dem Umgang mit Informationen zu potentiellen Straftaten gemäß § 13 DDG-E dürfte das BKA Beschränkungen unterliegen, die vermutlich nicht gewollt sind. Ferner sprechen empirische Anhaltspunkte deutlich gegen den prognostizierten Stellenbedarf.

## Der disruptive Art. 18 DSA

Nach Art. 18 DSA sind Hostingdienste verpflichtet, bei „Kenntnis von Informationen, die den Verdacht begründen, dass eine Straftat, die eine Gefahr für das Leben oder die Sicherheit einer Person … darstellt, begangen wurde”, die zuständigen Behörden zu informieren. Art. 18 DSA nennt als zuständige (Empfangs-) Behörden vorrangig die „Strafverfolgungs- oder Justizbehörden des betreffenden Mitgliedstaats”, was sich alternativ nach dem Tatort, dem Wohnsitz des Tatverdächtigen oder dem des Opfers der Straftat richtet.

## Die Rolle des BKA nach § 13 DDG-E

13 DDG-E soll die Meldungen der Hostingdienste kanalisieren: Das BKA „nimmt als Zentralstelle Informationen nach Artikel 18 [DSA]… entgegen, verarbeitet diese Informationen im Rahmen seiner gesetzlichen Aufgaben nach dem Bundeskriminalamtgesetz und leitet die Informationen an die jeweils zuständige Strafverfolgungsbehörde weiter”.

Dies klingt schlank: Zentrale Entgegennahme, Zuständigkeitsermittlung, Weiterleitung.

Tatsächlich ergeben sich eine Reihe von Fragen:

Nur ein Angebot – zur „Entgegennahme”

13 DDG-E formuliert defensiv: Das BKA „nimmt” die Informationen der Anbieter lediglich „entgegen”. Dem Vernehmen nach beruht die Formulierung auf der Erwägung, dass Art. 18 DSA bzgl. der möglichen Adressaten der Plattform-Meldungen abschließend sei: Die Anbieter müssen (nur) an die „Strafverfolgungs- oder Justizbehörden” liefern; man könne sie nicht mittels nationaler Regelung zwingen, an eine Mittler-Zentralstelle zu melden. § 13 DDG-E ist danach nur ein Angebot: Ihr könnt – statt an eine Staatsanwaltschaft – auch einfach zentral an das BKA melden!

Für die Anbieter ist dies interessant:

So wird es zwar Fälle geben, in denen für den Anbieter Anhaltspunkte zur zuständigen Staatsanwaltschaft vorliegen, z.B. zum potenziellen Tatort (YouTube-Video einer Gewalttat am Brandenburger Tor) oder zum Wohnsitz des Tatverdächtigen (Geodaten des Uploaders?). Dies wären jeweils Anhaltspunkte zur örtlich zuständigen Staatsanwaltschaft (§ 143 GVG, §§ 7, 8 StPO).

Oft wird der Anbieter aber keine entsprechende Kenntnis haben. Für die Anbieter wird daher regelmäßig nahe liegen, das „Angebot” anzunehmen und die Informationen iSv Art. 18 DSA an das BKA zu übermitteln. Zumal das BKA mit den Anbietern auch schon Gespräche führt und versucht, den Meldeprozess zu gestalten (Entwicklung einer Schnittstelle / API).

„Entgegennahme” auch nur „zur Verfügung” gestellter Informationen?

Bei näherer Betrachtung zeigt sich ein Spannungsverhältnis zwischen Art. 18 DSA und der Vorstellung einer Zentralstelle iSv § 13 DDG-E, an welche die Anbieter vermeintlich „unbekümmert” alle Daten iSv Art. 18 DSA zentralisiert ausleiten können.

Hierfür muss man zunächst die Funktionsweise von Art. 18 DSA beachten. Die Vorschrift regelt den Zugriff auf zwei grundsätzlich verschiedene Datensätze. Einerseits der „Verdacht” auf eine Straftat, den die Anbieter „mitteilen”, d.h. tatsächlich übermitteln müssen. Andererseits die weiteren „einschlägigen Informationen” (Ermittlungsansätze wie z.B. IP-Adresse, Bezahldaten, Nutzername, Telefonnummer usw.), die nur „zur Verfügung” zu stellen sind, ggfs. z.B. in einem Datenraum zum Abruf (umfassend Holznagel, in: Müller-Terpitz/Köhler, DSA, Art. 18 Rn. 35 ff.). Diese Differenzierung ist im Wortlaut des Art. 18 DSA angelegt. V.a. dient diese Differenzierung dem gebotenen Grundrechtsschutz: Erst wenn die Behörde feststellt, dass am (zwingend) übermittelten Verdacht etwas dran ist, kann sie – gestützt auf spezifische Befugnisnormen und nur soweit erforderlich – die weiteren Ermittlungsansätze abrufen, was dann auch erst gewährleistet, dass die für verschiedene Datenkategorien nach dem jeweiligen nationalen Verfassungsrecht ggfs. gebotenen Zugriffshürden beachtet werden (ausführlich Holznagel aaO Rn. 43 f.).

Wenn die Anbieter – entsprechend der Konstruktion des Art. 18 DSA und entgegen der Vorstellung des BKA – tatsächlich zunächst nur den Verdacht (und nicht das Gesamtpaket aller einschlägigen Informationen) übermitteln, dann könnte § 13 DDG-E mit der dortigen passiven Formulierung der „Entgegennahme” an Grenzen stoßen. Denn ist es vom Wortlaut („Entgegennehmen”) noch gedeckt, wenn das BKA dann tatsächlich Daten abruft? Eventuell kann man § 13 DDG-E hier großzügig auslegen, oder aber man sieht den „Abruf” als Minus der nach §§ 9 – 10a BKAG zulässigen Auskunftsverlangen erfasst. Aber ganz risikolos erscheinen diese Lesarten nicht, da das BVerfG gerade beim staatlichen Datenzugriff zu Ermittlungszwecken relativ streng auf Normenklarheit achtet (vgl. BVerfG, Beschl. v. 24.01.2012 – 1 BvR 1299/05 („Bestandsdatenauskunft I”), Rn. 174).

BKA stellt sich wohl eine „Paketlösung” vor: Alles wird übermittelt

Die genannte Differenzierung (Verdacht ist zu übermitteln, einschlägige Informationen sind zur Verfügung zu stellen) erzeugt jedenfalls insofern ein Problem, als mit dem Gesetzentwurf vermutlich gerade angestrebt ist, dass die Anbieter gleich alle Daten iSv Art. 18 DSA an das BKA „in einem Rutsch” übermitteln (hier sog. Paketlösung).

Offenbar kommuniziert das BKA gegenüber den Anbietern auch, dass man sich eine solche Paketlösung wünscht. Dem Vernehmen nach arbeitet das BKA sogar an einer API, bei deren Nutzung die Anbieter zwingend Datensätze jenseits des reinen „Verdachts” übermitteln müssen (z.B. IP-Adresse als „required data”).

Eine solche „Paketlösung” impliziert natürlich, dass im Zweifel überschießend auch solche Daten übermittelt werden, die für den eigentlichen Zweck von § 13 DDG-E, nämlich der Weiterleitung an die zuständige Strafverfolgungsbehörde (hier sog. Verteilfunktion) nicht zwingend erforderlich sind. Wenn bspw. YouTube Kenntnis von einem Video erhält, das eine schwere Gewalttat am Brandenburger Tor zeigt, und dem BKA neben dem Video (Verdacht) zugleich IP-Adresse und gespeicherte Zahlungsdaten des Uploaders (einschlägige Informationen) übermittelt, so sind dies mehr Daten, als zur Bestimmung der zuständigen Staatsanwaltschaft (Berlin) erforderlich sind. Und wenn das BKA das Datenpaket dann weiterleitet, erhält die Staatsanwaltschaft Berlin zwingend Kenntnis z.B. der IP-Adresse, deren Beauskunftung sonst unter einem grundsätzlichen Richtervorbehalt stünde (§ 100k, 101a Abs. 1a, 100e StPO).

Die genannten Bedenken (nicht erforderliche Datenverarbeitungen, Umgehung von Eingriffshürden der StPO) lassen sich zwar wegargumentieren: Denn wenn formal betrachtet gar kein Zwang besteht, an das BKA zu melden, dann gehen die genannten „überschießenden” Datenübermittlungen ja nicht (unmittelbar) auf ein hoheitliches Handeln zurück. Formal betrachtet liegt der schwarze Peter bei den Anbietern, die sich fragen müssen: Dürfen wir überhaupt das großzügige Angebot des BKA annehmen und dorthin gleich das ganze „Paket” ausleiten? Oder müssten wir uns nicht – datensparsam – zunächst auf die Übermittlung des Verdachts beschränken?

Wenn die Paketlösung gewünscht ist, d.h. wenn man die Anbieter zum Übermitteln gleich aller Daten „anlocken” möchte, dann sollte der Gesetzgeber wohl eine entsprechende Erlaubnis bzw. Privilegierung der Anbieter klarstellen.

Vorprüfung auf strafrechtliche Relevanz (Filterfunktion)

An die erörterte Datenübermittlung schließt sich eine Folgefrage an. Soll das BKA, bevor es zur eigentlichen Kernaufgabe – der Übermittlung an die örtlich zuständige Strafverfolgungsbehörde (Verteilfunktion) – schreitet, die übermittelten Verdachtsmomente auf strafrechtliche Relevanz prüfen?

Für ein solches Aufgabenverständnis spricht, dass schon die bisherige Arbeit des BKA mit der 2022 (wegen § 3a NetzDG) eingerichteten Zentralen Meldestelle für strafbare Inhalte im Internet (ZMI BKA) eine solche Relevanzprüfung umfasst (vgl. BT-Drs. 19/17741, S. 31), wie auch auf der dortigen Webseite zu lesen ist:

„Die ZMI BKA prüft die … angelieferten Meldungen hinsichtlich einer strafrechtlichen Relevanz …”

Eine solche Relevanzprüfung impliziert, dass das BKA – falls kein strafbares Verhalten erkannt wird – den Vorgang „einstellt”. Dies erscheint zulässig, weil die Übermittlung des Verdachts nach Art. 18 DSA noch keine Strafanzeige iSv § 158 Abs. 1 StPO darstellt, über welche nunmehr zwingend die zuständige Strafverfolgungsbehörde entscheiden müsste.

Auch Vorermittlung bei drohendem Beweismittelverlust?

Unklar erscheint, ob und inwiefern das BKA überschießende Vorermittlungen durchführen soll, d.h. Ermittlungen, die über das hinausgehen, was zur Ermittlung der örtlich zuständigen Strafverfolgungsbehörde erforderlich ist.

Wenn bspw. TikTok das Video eines (fremdgefährdenden) illegalen Autorennens am Kölner Dom übermittelt (zuständige Staatsanwaltschaft steht fest), soll das BKA dann auch noch schnell die (ggfs.) übermittelte Uploader-IP-Adresse beim Zugangsanbieter abgleichen lassen, um den Tatverdächtigen bzw. potenzielle Zeugen zu ermitteln? Praktisch wäre dies schon, z.B. um Beweismittelverlusten vorzubeugen.

Wieder lohnt ein Blick auf die Webseite der ZMI BKA, wo zu lesen ist:

„Die ZMI BKA … stellt nach Möglichkeit den mutmaßlichen Verfasser fest &#8230;”

Für das Verständnis einer entsprechenden Aufgabe spricht auch die Gesetzesbegründung zum DDG-E (BT-Drs. 20/10031, S. 72):

„Durch die zentrale Entgegennahme … können Doppelarbeiten in den Ländern vermieden und zeitkritische Maßnahmen sofort ergriffen werden.”

Ob entsprechende Ermittlungen durch das BKA zulässig sind, erscheint fraglich.

Nach § 13 DDG-E erfolgt die weitere Datenverarbeitung im Rahmen der Aufgaben nach dem BKAG. Mangels Anpassung des BKAG müsste das BKA die etwaige Aufgabe zu (zeitkritischen) Vorermittlungen wohl mit der allgemeinen Zentralstellenfunktion nach § 2 Abs. 1 BKAG begründen, was ein extensives Verständnis der dortigen Unterstützungsfunktion voraussetzt (und wozu dann eine Klarstellung des Gesetzgebers durchaus wünschenswert wäre).

Fraglich bleibt, mit welchen Ermittlungsbefugnissen das BKA dann vorgehen soll. Auf die §§ 10, 10a BKAG könnte sich das BKA wohl nicht stützen (wegen der dortigen Zweckbeschränkung, „die zuständige Strafverfolgungsbehörde … zu ermitteln”). Und auch die allgemeine Befugnisnorm in § 2 Abs. 2 Nr. 1 BKAG („Informationen zu sammeln und auszuwerten”) würde wohl überdehnt (vgl. insofern BT-Drs. 13/1550, S. 21 f.); hierauf gestützte „echte” Ermittlungen könnten zudem die gebotenen (vgl. BVerfG, Beschl. v. 27.05.2020 – 1 BvR 1873/13 („Bestandsdatenauskunft II”), Rn. 204 ff.) Eingriffshürden der §§ 94 ff., 100j, 100k StPO umgehen.

## 450 Stellen für das BKA?

Heute sind ca. 39 Mitarbeiter:innen bei der ZMI BKA tätig. Künftig sollen es wegen § 13 DDG-E nun insgesamt 450 Stellen werden.

Schon die zugrundeliegende Schätzung zu jährlich 720.000 übermittelten Vorgängen (BT-Drs. 20/10031, S. 64) erscheint aber weit überzogen:

Hosting-Anbieter haben selten Kenntnis iSv Art. 18 DSA: Art. 18 DSA erfordert einen positiven Verdacht des Hosting-Anbieters. Erkenntnisse mittels Meldungen nach Art. 16 DSA können zwar zugerechnet werden, aber die automatisierte Content-Moderation (Filter) begründet wohl keine Kenntnis (Holznagel aaO Rn. 20 ff.), d.h. löst auch keine Meldepflicht des Anbieters aus, weshalb die Anbieter schon mangels Kenntnis selten meldepflichtig werden.

Nur schwere Straftaten: Art. 18 DSA gilt nur bei Straftaten, die eine Gefahr für das Leben oder die Sicherheit einer Person darstellen. Von Anhaltspunkten zu solch schweren Straftaten werden die Anbieter selten Kenntnis erlangen.

Bisherige Empirik: Art. 18 DSA ist für die sehr großen Online-Plattformen (Facebook, TikTok, usw.) längst anwendbar, nämlich seit August 2023 (vgl. Art. 92 DSA sowie hier). Anbieter leiten bereits Daten nach Art. 18 DSA aus: An Europol, aber u.a. auch an das BKA. Für 2023 wird von Fallzahlen im niedrigen dreistelligen (!) Bereich (d.h. weit unter den angenommenen 720.000) berichtet, davon ein Großteil Suizidversuche, die streng genommen gar nicht unter Art. 18 DSA fallen. Die sog. NCMEC-Zahlen (vgl. sog. Löschbericht der Bundesregierung 2021, S. 31) passen auch nicht als Grundlage für eine höhere Schätzung, da dort die Anbieter z.T. auch automatisiert aufgefundene Sachverhalte ausleiten.

Die im Gesetzentwurf geschätzte Prüfdauer von 60 Minuten pro Fall erscheint ebenso überhöht. Zum vergleichbaren § 3a NetzDG ging die Bundesregierung noch von im Regelfall 10 Minuten Prüfzeit aus (BT-Drs. 19/17741, S. 24).

## Zusammenfassung

Art. 18 DSA ist eine disruptive Regelung. Der nun als nationale Begleitgesetzgebung vorgeschlagene § 13 DDG-E könnte das gesetzgeberische Ziel verfehlen, das BKA hier als effektive Zentralstelle für die Meldungen der Anbieter zu etablieren.

Insofern sollten Nachbesserungen geprüft werden:

Paketlösung und Abrufbefugnis: Soll das BKA nicht nur den Straftatenverdacht, sondern gleich – wie wohl sinnvoll – alle einschlägigen Informationen erhalten und abrufen können („Paketlösung”), sollte diese Aufgabe, und auch die entsprechende Befugnis klargestellt werden. Dies würde zugleich den Anbietern die erforderliche Rechtssicherheit vermitteln, damit sie „in einem Rutsch” (Paketlösung) alle Daten an das BKA ausleiten dürfen.

Vorermittlungen: Zur Aufgabe des BKA nach § 13 DDG-E sollte ferner konkretisiert werden, inwiefern auch zeitkritische Vorermittlungen erfolgen sollen. Insofern wären zugleich die Ermittlungsbefugnisse klarzustellen.

Realistische Stellenplanung: Mit 450 geplanten Stellen schätzt die BReg viel zu großzügig; dies sollte nach unten korrigiert werden.
