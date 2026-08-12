---
title: >-
  Verfassungsblog — Farbenfrohe Rechtsprechung: Verweisungsanalyse von
  Entscheidungen des Bundesverfassungsgerichts
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2015-01-26'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: >-
  https://verfassungsblog.de/farbenfrohe-rechtsprechung-verweisungsanalyse-von-entscheidungen-des-bundesverfassungsgerichts-2/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
content_hash: "e24d4fb487493372"
---

# Farbenfrohe Rechtsprechung: Verweisungsanalyse von Entscheidungen des Bundesverfassungsgerichts

Mit wachsender Rechenkraft und allgegenwärtigem Anfallen von Daten hat auch die Netzwerkanalyse als Methode der Sozialforschung rege Verbreitung gefunden. Sie knüpft an den Verbindungen von Einheiten an und sucht hieraus Schlüsse über die Beschaffenheit des Netzwerks und seiner Kausalitäten zu ziehen. Die Netzwerkanalyse wurde beispielsweise zur Erforschung digitaler Einflusssphären ebenso verwendet wie zur Analyse von Terrorzellen. Auch den Entscheidungen des U.S. Supreme Courts und schließlich auch dem deutschen BGB wurde bereits netzwerkanalytisch zu Leibe gerückt. Das Netzwerk, welches sich aus den Verweisungen der Entscheidungen des Bundesverfassungsgerichts aufeinander ergibt, liegt jedoch bisher im Dunkeln.

Um dies nachzuholen, wurden die von dem Projekt “Deutschsprachiges Fallrecht (DFR)” verdienstvoll digitalisierte und aufbereitete Sammlung der wichtigsten Entscheidungen des Bundesverfassungsgerichts verwendet und mit den Programmen R und Gephi netzwerkanalytisch aufbereitet. Diese Entscheidungszusammenstellung umfasst dabei den größten Teil der Juristen unter der Abkürzung BVerfGE geläufigen Sammlung. Die Auswahl durch das DFR-Projekt erfolgt nach Unterrichtsrelevanz. Beispielsweise Sozialrechts-, Pensions- und Steuerentscheidungen sind dadurch aber unterrepräsentiert. Bandnummern und Seitenzahlen der gedruckten Fassung (so werden die Entscheidungen gewöhnlich zitiert) werden übernommen und zusätzlich mit Kurztiteln versehen. Unser Datensatz umfasst aufgrund der Natur der Auswahl der BVerfGE-Sammlung vornehmlich Senats- und Plenumsentscheidungen (§ 31 Abs. 1 und 2 BVerfGGO). Die insgesamt 1394 vom DFR-Projekt digitalisierten Entscheidungen stellen damit nur einen Bruchteil der seit 1951 erledigten 200.000 Verfahren dar (davon rund 181.000 durch Entscheidung). Dabei kann man aber davon ausgehen, dass die in die Sammlung aufgenommenen Entscheidungen für Verfassungsrecht und Praxis besonders wichtig und rechtlich eher uneindeutig sind (siehe hierzu §§ 93-93d BVerfGG).

Am Anfang der Analyse stehen die Verweisungen von neueren auf ältere Entscheidungen als Verknüpfungen zwischen den Entscheidungen. Aus den Entscheidungen als Punkten und den Verweisungen als Linien ergibt sich das abgebildete Gesamtnetzwerk. Je häufiger eine Entscheidung zitiert wird, desto größer und zentraler der sie symbolisierende Knoten. Die Farben visualisieren dabei Entscheidungsgruppen – sprich: Cluster –, die sich durch relativ kurze Verweisungsketten innerhalb des Netzwerks ergeben. Insgesamt beträgt die durchschnittliche Pfadlänge zwischen zwei Knoten 3,48, die längste Pfadlänge geht über 18 Stationen und über 90% der Entscheidungen sind maximal 6 oder 7 Verweisungen voneinander entfernt.

Doch wie lassen sich aus diesem Netzwerk nun statistisch Aussagen gewinnen, die auch für die Praxis des Verfassungsrechts und die Rechtswissenschaft relevant sind? Auf zwei Hypothesen soll hier näher eingegangen werden.

## 1. Die meistzitiertesten Entscheidungen sind die insgesamt relevantesten.

Der Verweis auf eine vorhergehende Entscheidung in einer gerichtlichen Begründung kann als inhärente Beurteilung ihrer Relevanz für die Lösung des vorliegenden Falles gewertet werden. Geht man davon aus, dass die Relevanzbeurteilungen aller Begründungen in etwa gleichwertig sind und addiert sie, erhält man eine Liste der entscheidungsrelevantesten Präjudizien. Das heißt, entscheidungsrelevant für das Bundesverfassungsgericht und nach seiner eigenen Beurteilung. Dieses simple Verfahren lässt sich noch durch eine Gewichtung und Einbeziehung umliegender Verweisungen (also durch die Zentralität der Entscheidungen) verfeinern, was für den Zweck dieses Blogeintrags aber erstmal unterbleiben soll.

Entscheidung
Eingehende Verweisungen

18, 85 – Spezifisches Verfassungsrecht
125

7, 198 – Lüth
114

7, 377 – Apotheken-Urteil
88

6,32 – Elfes
87

8, 274 – Preisgesetz
77

1, 14 – Südweststaat
77

50, 290 – Mitbestimmung
76

1, 208 – 7,5%-Sperrklausel
72

4,7 – Investitionshilfe
71

1, 97 – Hinterbliebenenrente I
68

Eine solche Rangliste mag – insbesondere für den juristischen Laien – zunächst wichtig und bedeutend klingen. Es ist aber mit der generellen Relevanz von Entscheidungen, also ihrer Wichtigkeit für die Verfassungsrechtsprechung insgesamt, noch nicht allzuviel gewonnen. Die generelle Relevanz hilft kaum bei der verfassungsgerichtlichen Aufgabe, die für die Lösung des konkreten Einzelfalles relevanten Normen und Präjudizien auszuwählen. Sie hilft dem Verfassungsrechtler nicht dabei, normativ wertend zwischen Sacherverhalt und (Fall-)Recht hin- und herzublicken. Es ist zwar denkbar, dass eine solche Liste Ausgangspunkt für die Suche nach relevanten Präjudizien ist, aber für eine verfassungsrechtlich vorgebildete Person ist es aussichtsreicher Aufsätze, Lehrbücher, insbesondere aber auch Kommentare zu konsultieren. Außerdem geht das deutsche Verfassungsrechtsdenken vornehmlich vom Grundrecht aus und erst nachgeordnet von etwaigen Präjudizien.

Die These, dass die am meisten zitierten Entscheidungen die relevantesten sind, mag also grundsätzlich stimmen, ist aber praktisch wenig hilfreich. Eine Ausnahme mag vorliegen, wenn man sich das Verfassungsrecht anhand von Leitentscheidungen erschließen möchte. Um bestimmte Bereiche der Verfassungsrechtsprechung zu erhellen, kann es aber erfolgversprechend sein, sich auf bestimmte Entscheidungscluster zu konzentrieren. Es wird also von der Makroebene (Gesamtnetzwerk, wie oben abgebildet) auf die Mesoebene (Subnetzwerk) des Zitationsnetzwerks gewechselt.

## 2. Die sich ergebenden Entscheidungscluster entsprechen bestimmten Bereichen der Verfassungsrechtsprechung

Die farbig hervorgehobenen Entscheidungscluster werden durch einen Modularitätsalgorithmus bestimmt (hierzu z.B. Blondel u.a.). Entscheidungen in einem Cluster sind untereinander stärker verbunden, als sie mit Entscheidungen der jeweils anderen Cluster verbunden sind. In der Tat entsprechen die Cluster zum Teil bestimmten materiell-rechtlichen Bereichen des Verfassungsrechts. So lässt sich das in der Visualisierung gelb dargestellte Cluster vor allem dem Staatsorganisationsrecht zuordnen, sowie den verfassungsrechtlichen Bereichen von Parteien, Wahl und Mandat. Das grün dargestellte Cluster hingegen umfasst vornehmlich Entscheidungen zu Persönlichkeits- und Kommunikationsgrundrechten. Das rote Cluster scheint vor allem die Bereiche Steuern, Familie, Sozialleistungen und Gleichheitsfragen zu berühren. Das blaue Cluster hat die wirtschaftliche Betätigungsfreiheit, die Berufsfreiheit und Weiteres zum Inhalt. Gerade die letzten zwei genannten Cluster sind dabei aber alles andere als trennscharf.

Weitere Querverbindungen zwischen diesen Bereichen könnten sich aus gemeinsamen verfassungsprozessualen Problemen, Fragen der Grundrechtsberechtigung- und verpflichtung, übergreifenden dogmatischen Fragen (Schutzbereich – Eingriff – verfassungsrechtliche Rechtfertigung) und Ähnlichem ergeben. Auch die zeitliche Nähe von Entscheidungen könnte erklären, warum auf bestimmte Entscheidungen und nicht direkt auf frühere Grundlagenentscheidungen Bezug genommen wurde.

Die Cluster, aber gerade auch Ausschnitte von ihnen, können Ausgangspunkte sein, um sich Unterbereichen des Verfassungsrechts über Präjudizien zu nähern oder um bestimmte Entscheidungen in der Fülle der Rechtsprechung zu verorten. Auch kann ein solcher Zugang helfen, die Bedeutung einzelner Entscheidung aus rechtsgeschichtlicher Perspektive und die Genealogie dogmatischer Figuren zu ergründen, was allein durch die Rezeption der entsprechenden Literatur zumindest sehr aufwendig wäre. Einen genaueren zweiten Blick auf Art und Kontext der Zitierung kann die Netzwerkanalyse dabei freilich nicht ersetzen, aber sie kann eine brauchbaren Einstieg liefern. Als gewinnbringend könnte sich hier auch die Einbeziehung von Kammerentscheidungen in das Netzwerk herausstellen. Diese werden rechtswissenschaftlich nämlich eher selten thematisiert. Die Netzwerkanalyse von Verfassungsrechtsprechung kann also das juristische Arbeiten mit Entscheidungen, Kommentaren, Aufsätzen und Monografien natürlich niemals ersetzen, aber durch eine weitere Perspektive ergänzen.

Herzlicher Dank gebührt Prof. Dr. Puschmann für die netzwerkanalytische Aufbereitung und Auswertung der Daten und Prof. Dr. Tschentscher für einige wertvolle Hinweise zur ihrer Interpretation. Alle Fehler bleiben meine eigenen.
