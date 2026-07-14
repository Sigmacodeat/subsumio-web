# LAB-DACH v3 Run Report

- **Run ID**: e2e-1784019909371
- **Mode**: LIVE ⚠️
- **Started**: 2026-07-14T09:05:09.371Z
- **Completed**: 2026-07-14T09:14:27.638Z
- **Tasks**: 7
- **Total cost**: $0.0033
- **Total tokens**: 14,331 in / 4,614 out

=== LAB-DACH v3 Benchmark Report ===

Total Tasks: 7
Strict All-Pass: 0/7 (0.0%) [CI: 0.0%–35.4%]
Critical All-Pass: 0/7 (0.0%) [CI: 0.0%–35.4%]
Criterion Pass Rate: 54.3% [CI: 42.7%–65.4%]
Critical Pass Rate: 33.3%
Weighted Avg Score: 0.464

--- Judge Status Distribution ---
  pass: 16
  fail: 12
  uncertain: 0
  not_judgeable: 0
  judge_error: 0

--- Verification States ---
  NEEDS_HUMAN_REVIEW: 7

--- By Jurisdiction ---
  AT: 0/7 all-pass (0.0%)

--- By Legal Area ---
  litigation: 0/7 (0.0%)

--- By Workflow ---
  rechtsfrage_memorandum: 0/6 (0.0%)
  schriftsatz_entwurf: 0/1 (0.0%)

--- Cost Metrics ---
  Total Tokens: 18945
  Total Cost: $0.0033
  Avg Latency: 79.7s


--- Per-Task Results ---

## gold-at-lit-001 — Berufung — Frist und Begründung nach § 401 ZPO
- **Workflow**: rechtsfrage_memorandum
- **Jurisdiction**: AT
- **All-pass**: ❌
- **Strict all-pass**: ❌
- **Critical all-pass**: ❌
- **Criteria**: 7/10 passed
- **Critical**: 4/6 passed
- **Verification state**: NEEDS_HUMAN_REVIEW
- **Receipt**: e2e-1784019909371-gold-at-lit-001
- **Prompt hash**: d0b0f45440370b94ea862ca4a9904963b36895ab8580d0781018135745233368
- **Output hash**: bc6e989977c531ed7b35a58d6fbd587f574af0f9b0cc7675e38f3cbdc8820623
- **Corpus hash**: 898e61a1848b6846134f7055bb35eefbbab81bef660655c05489dc4b9e446a95

### Criteria
- ❌ **auto-citation_grounded_v2** (critical) — 1 ungrounded citation(s): Citation "§ 461 ZPO" not found in retrieved context
- ✅ **auto-law_valid** (critical) — All law abbreviations are valid
- ✅ **auto-language_german** — Output is in German (49 German function words detected)
- ❌ **auto-jurisdiction_correct** (critical) — 2 cross-law contamination(s): Law "ZPO" cited but not in retrieved results (); Law "ASVG" cited but not in retrieved results ()
- ✅ **auto-min_citations** (critical) — Output cites 2 unique law(s): ZPO, ASVG
- ✅ **auto-substantiated_uncertainty** — No unsubstantiated uncertainty detected
- ✅ **crit-007** (critical) — Die KI-Ausgabe identifiziert korrekt, dass die Berufungsfrist nach § 461 ZPO 4 Wochen beträgt und erwähnt dies explizit im Hinweis für die Praxis. Zwar ist der Kontext unzureichend, da die relevanten Gesetze nicht enthalten sind, die Antwort gibt jedoch die korrekte Frist an und weist darauf hin, dass diese Information nicht aus dem bereitgestellten Kontext stammt, sondern allgemein gültig ist.
- ✅ **crit-008** (critical) — Die KI-Ausgabe führt die Fristberechnung korrekt durch, indem sie die Zustellung am 01.07.2026 als Ausgangspunkt nimmt, den Fristbeginn auf den 02.07.2026 legt und das Fristende auf den 29.07.2026 berechnet. Dies entspricht der korrekten Berechnung einer 4-wöchigen Frist gemäß § 461 ZPO, auch wenn die ZPO selbst nicht im Kontext enthalten ist. Die Ausgabe weist jedoch darauf hin, dass eine abschließende rechtliche Prüfung ohne die relevanten Gesetzestexte nicht möglich ist.
- ❌ **crit-009** — Die KI-Ausgabe prüft nicht explizit, ob die Sommer-vhfZ (15.07.–25.08.) die Frist hemmt und verlängert, was das spezifische Kriterium erfordert. Obwohl die allgemeine Fristberechnung erwähnt wird, fehlt eine direkte Auseinandersetzung mit der vhfZ gemäß § 222 ZPO.
- ✅ **crit-010** — Die KI-Ausgabe kommt zu einem klaren Ergebnis, dass die Berufung fristgerecht ist, wenn man die subsidiär geltende ZPO annimmt. Dies wird durch die Berechnung der Frist (01.07.2026 + 4 Wochen = 29.07.2026) und die Einbringung am 28.07.2026 gestützt. Die Ausgabe weist jedoch korrekt darauf hin, dass die vorgelegten Gesetze keine prozessualen Fristen regeln und empfiehlt eine Prüfung der ZPO.

## gold-at-lit-002 — Klagebeantwortung — Inhalt und Frist nach § 243 ZPO
- **Workflow**: schriftsatz_entwurf
- **Jurisdiction**: AT
- **All-pass**: ❌
- **Strict all-pass**: ❌
- **Critical all-pass**: ❌
- **Criteria**: 6/10 passed
- **Critical**: 2/6 passed
- **Verification state**: NEEDS_HUMAN_REVIEW
- **Receipt**: e2e-1784019909371-gold-at-lit-002
- **Prompt hash**: 0827f0495930e6d4855082addce58341bc28c17fc0a2a4eb63d08ce3b749d055
- **Output hash**: b8288694446857788c8d2558a817ffac21be7707726231ba69a2343e0175c69c
- **Corpus hash**: 898e61a1848b6846134f7055bb35eefbbab81bef660655c05489dc4b9e446a95

### Criteria
- ❌ **auto-citation_grounded_v2** (critical) — 1 ungrounded citation(s): Citation "§ 239 ZPO" not found in retrieved context
- ✅ **auto-law_valid** (critical) — All law abbreviations are valid
- ✅ **auto-language_german** — Output is in German (61 German function words detected)
- ❌ **auto-jurisdiction_correct** (critical) — 1 cross-law contamination(s): Law "ZPO" cited but not in retrieved results ()
- ❌ **auto-min_citations** (critical) — Output cites only 1 law(s), expected at least 2
- ✅ **auto-substantiated_uncertainty** — No unsubstantiated uncertainty detected
- ❌ **crit-007** (critical) — Die KI-Ausgabe nennt § 239 ZPO anstelle der korrekten § 243 ZPO für die Klagebeantwortungsfrist von vier Wochen. Dies ist ein eindeutiger Fehler, da die richtige gesetzliche Grundlage nicht korrekt identifiziert wurde.
- ✅ **crit-008** (critical) — Die Ausgabe stellt korrekt dar, dass die Klagebeantwortung Anträge und eine Begründung (Bestreiten der Forderung) enthalten muss. Dies wird durch die expliziten Abschnitte 'Anträge' und 'Begründung' in der Ausgabe belegt, insbesondere durch die klare Formulierung des Bestreitens der Forderung und die Darlegung der fehlenden Substantiierung durch den Kläger.
- ✅ **crit-009** — Die Ausgabe erfüllt die formellen Anforderungen eines Schriftsatzes, da sie klar strukturierte Abschnitte für Rubrum, Anträge, Begründung sowie einen Hinweis auf Rechtsgrundlagen enthält. Der Rubrum ist korrekt aufgebaut und identifiziert die Parteien und ihre Vertretungen. Die Anträge sind konkret formuliert und die Begründung ist ausführlich dargelegt, einschließlich der Fristwahrung und des Bestreitens der Forderung. Es gibt auch einen Beweisangebot Teil, welcher die formellen Anforderungen zusätzlich unterstützt.
- ✅ **crit-010** — Die Klagebeantwortung formuliert das Bestreiten der Forderung substantiiert und nicht pauschal. Es wird konkret auf die fehlende Anspruchsgrundlage und die unzureichende Substantiierung der Klage eingegangen.

## gold-at-lit-003 — Amtshaftung — Schaden durch Amtswalterhandlung
- **Workflow**: rechtsfrage_memorandum
- **Jurisdiction**: AT
- **All-pass**: ❌
- **Strict all-pass**: ❌
- **Critical all-pass**: ❌
- **Criteria**: 6/10 passed
- **Critical**: 2/6 passed
- **Verification state**: NEEDS_HUMAN_REVIEW
- **Receipt**: e2e-1784019909371-gold-at-lit-003
- **Prompt hash**: 6b87eefaf4156d4e0a9e59d583ffed6b35d0521e2b4484db04e206741dd87e54
- **Output hash**: 92b434efc683fe8ad60713e8cab3ac72987a2397b05c4747673599cbf0e6188d
- **Corpus hash**: 898e61a1848b6846134f7055bb35eefbbab81bef660655c05489dc4b9e446a95

### Criteria
- ❌ **auto-citation_grounded_v2** (critical) — 1 ungrounded citation(s): Citation "§ 335 BDG" not found in retrieved context
- ✅ **auto-law_valid** (critical) — All law abbreviations are valid
- ✅ **auto-language_german** — Output is in German (60 German function words detected)
- ❌ **auto-jurisdiction_correct** (critical) — 1 cross-law contamination(s): Law "BDG" cited but not in retrieved results ()
- ❌ **auto-min_citations** (critical) — Output cites only 1 law(s), expected at least 2
- ✅ **auto-substantiated_uncertainty** — No unsubstantiated uncertainty detected
- ❌ **crit-007** (critical) — Die Ausgabe nennt § 335 BDG als Anspruchsgrundlage, nicht jedoch § 1 AHG (Amtshaftungsgesetz), welches die korrekte Anspruchsgrundlage für Amtshaftungsfälle in Österreich darstellt. Die Haftung des Dienstgebers für Schäden durch Beamte wird zwar im BDG geregelt, jedoch ist das AHG die primäre Rechtsgrundlage für Amtshaftungsansprüche.
- ✅ **crit-008** (critical) — Die KI-Ausgabe stellt klar dar, dass der Beamte als Amtswalter in Vollziehung der Gesetze gehandelt hat, indem sie spezifisch auf § 335 BDG verweist und darlegt, dass der Beamte im Rahmen seiner dienstlichen Tätigkeit (Bauaufsicht) gehandelt hat. Dies entspricht der korrekten Subsumtion der Amtswaltereigenschaft.
- ✅ **crit-009** — Die Ausgabe stellt die Fahrlässigkeit des Amtswalters als Voraussetzung für die Amtshaftung korrekt dar. Es wird explizit auf § 335 BDG Bezug genommen, der die Haftung des Dienstgebers für fahrlässig verursachte Schäden durch Beamte regelt. Die Fahrlässigkeit wird im Sachverhalt klar benannt und in der rechtlichen Würdigung als erfüllter Tatbestand bestätigt.
- ✅ **crit-010** — Die Ausgabe kommt korrekt zum Ergebnis, dass die Gemeinde G nach § 335 BDG (Beamten-Dienstrechtsgesetz) schadenersatzpflichtig ist. Die Begründung ist klar und stützt sich auf die relevanten rechtlichen Grundlagen, insbesondere die Fahrlässigkeit des Beamten während der dienstlichen Tätigkeit. Die Ausführung ist präzise und entspricht den Anforderungen des Kriteriums.

## gold-at-lit-004 — Verjährung — Dreijährige Verjährung nach § 1489 ABGB
- **Workflow**: rechtsfrage_memorandum
- **Jurisdiction**: AT
- **All-pass**: ❌
- **Strict all-pass**: ❌
- **Critical all-pass**: ❌
- **Criteria**: 3/10 passed
- **Critical**: 1/6 passed
- **Verification state**: NEEDS_HUMAN_REVIEW
- **Receipt**: e2e-1784019909371-gold-at-lit-004
- **Prompt hash**: ca0100bd8c434dc76284e81c304317b9ac542c107f5a6c7e6a2c8df5a4419277
- **Output hash**: c24e68bdf8fcc1b2859413b6861738cc789e33f2efbe4e25ee2251c86578b59e
- **Corpus hash**: 898e61a1848b6846134f7055bb35eefbbab81bef660655c05489dc4b9e446a95

### Criteria
- ❌ **auto-citation_grounded_v2** (critical) — 3 ungrounded citation(s): Citation "§ 1478 ABGB" not found in retrieved context; Citation "§ 1479 ABGB" not found in retrieved context; Citation "§ 1494" not found in retrieved context
- ✅ **auto-law_valid** (critical) — All law abbreviations are valid
- ✅ **auto-language_german** — Output is in German (54 German function words detected)
- ❌ **auto-jurisdiction_correct** (critical) — 1 cross-law contamination(s): Law "ABGB" cited but not in retrieved results ()
- ❌ **auto-min_citations** (critical) — Output cites only 1 law(s), expected at least 2
- ✅ **auto-substantiated_uncertainty** — No unsubstantiated uncertainty detected
- ❌ **crit-007** (critical) — Die Ausgabe nennt § 1478 ABGB als maßgebliche Norm für die dreijährige Verjährungsfrist, während das Kriterium explizit nach § 1489 ABGB fragt. Dies ist eine falsche Normenangabe, da § 1489 ABGB nicht erwähnt wird. Die Ausgabe erfüllt das Kriterium daher nicht.
- ❌ **crit-008** (critical) — Die Ausgabe stellt den Verjährungsbeginn inkorrekt dar. Zwar wird richtigerweise die Kenntnis von Schaden und Schädiger erwähnt, jedoch wird fälschlicherweise der Beginn der Verjährung auf den Schluss des Jahres der Forderungsentstehung festgelegt, was gemäß § 1489 ABGB nicht korrekt ist. Der Verjährungsbeginn sollte mit der Kenntniserlangung von Schaden und Schädiger beginnen, nicht erst mit dem Jahresende.
- ❌ **crit-009** — Die Ausgabe beantwortet zwar die Frage nach der Verjährungsdauer und dem Verjährungsende, jedoch wird die spezifische Fristberechnung '01.03.2023 + 3 Jahre = 01.03.2026' nicht direkt erwähnt oder bestätigt. Stattdessen wird eine abweichende Berechnung (Verjährungsbeginn: 01.01.2024, Verjährungsende: 31.12.2026) präsentiert, die auf der Grundlage der Jahresendregelung (§ 1479 ABGB) basiert. Dies entspricht nicht der geforderten direkten Berechnung der Frist ohne Berücksichtigung der Jahresendregelung.
- ❌ **crit-010** — Die Ausgabe kommt zum Ergebnis, dass die Forderung noch nicht verjährt ist, was jedoch nicht mit der gestellten Aufgabe übereinstimmt. Die Aufgabe fragt explizit, ob die Forderung verjährt ist, wenn die Mahnung am 15.06.2026 erfolgt, was nach der korrekten Berechnung der Verjährungsfrist (Ende am 31.12.2026) tatsächlich der Fall wäre. Die Ausgabe hat die Verjährungsfrist falsch berechnet und kommt zu einem falschen Ergebnis.

## gold-at-lit-005 — Schadenersatz — Personenschaden nach § 1311 ABGB
- **Workflow**: rechtsfrage_memorandum
- **Jurisdiction**: AT
- **All-pass**: ❌
- **Strict all-pass**: ❌
- **Critical all-pass**: ❌
- **Criteria**: 5/10 passed
- **Critical**: 1/6 passed
- **Verification state**: NEEDS_HUMAN_REVIEW
- **Receipt**: e2e-1784019909371-gold-at-lit-005
- **Prompt hash**: 7a3f869dd093607714115aaca36ae06ad341c81ed42018abaa3a932a7cb0f946
- **Output hash**: 8d5ed198fd3fdcabaae964ce540e5058af4720a4e847fb79bcf873e597626eb4
- **Corpus hash**: 898e61a1848b6846134f7055bb35eefbbab81bef660655c05489dc4b9e446a95

### Criteria
- ❌ **auto-citation_grounded_v2** (critical) — 2 ungrounded citation(s): Citation "§ 1295 ABGB" not found in retrieved context; Citation "§ 1325 ABGB" not found in retrieved context
- ✅ **auto-law_valid** (critical) — All law abbreviations are valid
- ✅ **auto-language_german** — Output is in German (55 German function words detected)
- ❌ **auto-jurisdiction_correct** (critical) — 1 cross-law contamination(s): Law "ABGB" cited but not in retrieved results ()
- ❌ **auto-min_citations** (critical) — Output cites only 1 law(s), expected at least 2
- ✅ **auto-substantiated_uncertainty** — No unsubstantiated uncertainty detected
- ❌ **crit-007** (critical) — Die Ausgabe nennt zwar Schadenersatzansprüche, jedoch wird § 1311 ABGB nicht korrekt als Anspruchsgrundlage identifiziert. Stattdessen wird auf § 1295 ABGB verwiesen, welcher allgemeine deliktische Ansprüche regelt, nicht aber speziell Schadenersatz bei Personenverletzung. Das Kriterium verlangt jedoch die korrekte Identifizierung von § 1311 ABGB, was nicht erfolgt ist.
- ❌ **crit-008** (critical) — Die Ausgabe zitiert und behandelt § 1295 ABGB, welcher die deliktische Haftung regelt, jedoch wird § 1293 ABGB (die Grundnorm für Schadenersatz) nicht erwähnt oder zitiert. Das Kriterium verlangt jedoch explizit, dass § 1293 ABGB korrekt zitiert wird, was in der Ausgabe nicht erfolgt ist.
- ✅ **crit-009** — Die KI-Ausgabe stellt korrekt dar, dass F Heilungskosten in Höhe von 3.000 € und einen Verdienstentgang für 6 Wochen geltend machen kann. Die relevanten Positionen werden klar benannt und im Zusammenhang mit dem Schadenersatzanspruch erläutert.
- ✅ **crit-010** — Die Ausgabe stellt das Verschulden des A korrekt dar, indem sie die Fahrlässigkeit im Zusammenhang mit dem Rotlichtverstoß klar benennt und rechtlich einordnet. Die Darstellung ist präzise und stützt sich auf die relevanten rechtlichen Grundlagen, ohne unbegründete Behauptungen aufzustellen.

## gold-at-lit-006 — Eigentumsklage — Herausgabe nach § 366 ABGB
- **Workflow**: rechtsfrage_memorandum
- **Jurisdiction**: AT
- **All-pass**: ❌
- **Strict all-pass**: ❌
- **Critical all-pass**: ❌
- **Criteria**: 7/10 passed
- **Critical**: 3/6 passed
- **Verification state**: NEEDS_HUMAN_REVIEW
- **Receipt**: e2e-1784019909371-gold-at-lit-006
- **Prompt hash**: b1f047c827726f54d046bd6e658db7839cc3fcbc09524e340ea63493c3f65c44
- **Output hash**: 60139758eae37989061e77a505bb6094ab8ebdbac86d7f0cbcd624993ba60d26
- **Corpus hash**: 898e61a1848b6846134f7055bb35eefbbab81bef660655c05489dc4b9e446a95

### Criteria
- ❌ **auto-citation_grounded_v2** (critical) — 2 ungrounded citation(s): Citation "§ 366 ABGB" not found in retrieved context; Citation "§ 339 ABGB" not found in retrieved context
- ✅ **auto-law_valid** (critical) — All law abbreviations are valid
- ✅ **auto-language_german** — Output is in German (69 German function words detected)
- ❌ **auto-jurisdiction_correct** (critical) — 1 cross-law contamination(s): Law "ABGB" cited but not in retrieved results ()
- ❌ **auto-min_citations** (critical) — Output cites only 1 law(s), expected at least 2
- ✅ **auto-substantiated_uncertainty** — No unsubstantiated uncertainty detected
- ✅ **crit-007** (critical) — Die KI-Ausgabe nennt § 366 ABGB korrekt als Anspruchsgrundlage für den Herausgabeanspruch des Eigentümers. Die Ausführung ist klar und stützt sich auf die rechtlichen Voraussetzungen des § 366 ABGB, insbesondere die Eigentümerstellung des E und den unrechtmäßigen Besitz des B. Die Behauptung des B wird zutreffend als unbelegt und irrelevant für den Herausgabeanspruch dargestellt.
- ✅ **crit-008** (critical) — Die Ausgabe stellt klar dar, dass E Eigentümer des Fahrrads ist und somit klageberechtigt nach § 366 ABGB ist. Es wird unmissverständlich erwähnt, dass E Eigentümer des Fahrrads ist und dies unstreitig ist. Zudem wird auf den Herausgabeanspruch nach § 366 ABGB Bezug genommen, der dem Eigentümer zusteht. Diese Darstellung ist korrekt und deckt sich mit den Anforderungen des Kriteriums.
- ✅ **crit-009** — Die Ausgabe stellt klar dar, dass B Besitzer des Fahrrads ist, jedoch kein Recht zum Besitz hat. Es wird explizit erwähnt, dass die Kaufbehauptung des B unwahr ist und kein gutgläubiger Erwerb vorliegt. Dies erfüllt das Kriterium vollständig.
- ✅ **crit-010** — Die KI-Ausgabe kommt zum korrekten Ergebnis, dass E gegen B einen Herausgabeanspruch nach § 366 ABGB hat. Die Ausführung ist klar und logisch aufgebaut, beginnend mit der Feststellung des Eigentums von E, über die unrechtmäßige Besitznahme durch B bis hin zur Begründung des Herausgabeanspruchs. Die Behauptung des B, das Fahrrad gekauft zu haben, wird zutreffend als unwahr und ohne rechtliche Bedeutung für den Besitzanspruch bewertet. Die Argumentation stützt sich auf die im ABGB verankerten Prinzipien des Eigentums- und Besitzrechts.

## gold-at-lit-007 — Werkvertrag — Mängelgewährleistung nach §§ 1165, 1170 ABGB
- **Workflow**: rechtsfrage_memorandum
- **Jurisdiction**: AT
- **All-pass**: ❌
- **Strict all-pass**: ❌
- **Critical all-pass**: ❌
- **Criteria**: 4/10 passed
- **Critical**: 1/6 passed
- **Verification state**: NEEDS_HUMAN_REVIEW
- **Receipt**: e2e-1784019909371-gold-at-lit-007
- **Prompt hash**: c091c109cf4c70da08d70342cdbcf6159ad2866f6c1641bddce2d0f2448a62c4
- **Output hash**: fd38bf2dac052e45dd08e238bdf212270d4402b5ae0489d44ba6026755f340a7
- **Corpus hash**: 898e61a1848b6846134f7055bb35eefbbab81bef660655c05489dc4b9e446a95

### Criteria
- ❌ **auto-citation_grounded_v2** (critical) — 1 ungrounded citation(s): Citation "§ 633 BGB" not found in retrieved context
- ✅ **auto-law_valid** (critical) — All law abbreviations are valid
- ✅ **auto-language_german** — Output is in German (57 German function words detected)
- ❌ **auto-jurisdiction_correct** (critical) — 1 cross-law contamination(s): Law "BGB" cited but not in retrieved results ()
- ❌ **auto-min_citations** (critical) — Output cites only 1 law(s), expected at least 2
- ✅ **auto-substantiated_uncertainty** — No unsubstantiated uncertainty detected
- ❌ **crit-007** (critical) — Die Ausgabe identifiziert zwar das ABGB als maßgeblich für Werkverträge, jedoch wird § 1165 ABGB nicht explizit als Grundnorm genannt. Stattdessen wird auf § 633 BGB verwiesen, was für die österreichische Rechtsordnung nicht korrekt ist. Die Ausgabe erfüllt somit das Kriterium nicht, da die spezifische Norm des ABGB nicht korrekt identifiziert wird.
- ❌ **crit-008** (critical) — Die KI-Ausgabe stellt zwar den Anspruch auf Nachbesserung bei Mängeln dar, jedoch wird dies nicht korrekt auf § 1165 ABGB bezogen, sondern stattdessen auf § 633 BGB verweisen. Dies ist falsch, da die spezifische Norm des österreichischen Rechts (§ 1165 ABGB) nicht genannt wird. Zudem wird behauptet, dass das ABGB 'analog § 633 BGB' anzuwenden sei, was rechtsdogmatisch nicht korrekt ist. Die Ausgabe enthält daher eine unzutreffende Rechtsgrundlage.
- ❌ **crit-009** — Die KI-Ausgabe zitiert § 1170 ABGB nicht, obwohl dies das geforderte Kriterium war. Stattdessen wird allgemein auf das ABGB verwiesen, ohne die spezifische Gewährleistungsfrist von zwei Jahren zu erwähnen. Dies erfüllt das Kriterium nicht.
- ✅ **crit-010** — Das Memorandum kommt zum korrekten Ergebnis, dass B Nachbesserung verlangen kann und T zur Mängelbehebung verpflichtet ist. Die Ausführung basiert auf allgemeinen zivilrechtlichen Grundsätzen, die für Werkverträge gelten, auch wenn das ABGB nicht im bereitgestellten Kontext enthalten ist. Die Argumentation ist schlüssig und rechtlich fundiert.
