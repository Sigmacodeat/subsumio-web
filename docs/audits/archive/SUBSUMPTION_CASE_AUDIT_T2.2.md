# Subsumption Case Audit Protocol — T2.2

**Audit Date:** 2026-07-13T12:26:38.940Z
**Total Cases:** 105

## Summary by Status

| Status    | Count | Percentage |
| --------- | ----- | ---------- |
| valid     | 97    | 92.4%      |
| corrected | 6     | 5.7%       |
| removed   | 0     | 0.0%       |
| disputed  | 2     | 1.9%       |

## Summary by Jurisdiction

### DE (70 cases)

- valid: 70
- corrected: 0
- removed: 0
- disputed: 0

### AT (35 cases)

- valid: 27
- corrected: 6
- removed: 0
- disputed: 2

## Superseded Metric

> 95,2% Pass Rate (E2E Subsumption Benchmark v3) — superseded by this audit. Do not display as quality number until re-validated.

## Known AT Errors (Regression Fixtures)

### sub-at-035 — Status: corrected

- **Law:** eheg § 43
- **Issues:**
  - expected_section § 43 EheG is about Wiederverheiratung nach Todeserklärung, not divorce
  - Divorce is in § 46 EheG; separation-based divorce in § 55 EheG
- **Corrections:**
  - expected_section → § 55
  - expected_conclusion → Nach § 55 EheG ist eine Scheidung nach Aufhebung der häuslichen Gemeinschaft möglich, wenn die Wiederherstellung der Lebensgemeinschaft nicht erwartet werden kann.
- **Notes:** Juristische Freigabe erforderlich. § 43 EheG betrifft Wiederverheiratung nach Todeserklärung.

### sub-at-031 — Status: corrected

- **Law:** bao § 80
- **Issues:**
  - expected_section § 80 BAO is not about Wiedereinsetzung
  - Wiedereinsetzung in den vorigen Stand is regulated in § 145 BAO
- **Corrections:**
  - expected_section → § 145
  - expected_conclusion → Nach § 145 BAO kann A Wiedereinsetzung in den vorigen Stand beantragen, wenn er ohne sein Verschulden an der Einhaltung einer Frist gehindert war.
- **Notes:** Juristische Freigabe erforderlich. § 80 BAO regelt nicht die Wiedereinsetzung.

### sub-at-019 — Status: corrected

- **Law:** ugb § 105
- **Issues:**
  - expected_section § 105 UGB defines the OHG, not personal liability
  - Personal unlimited liability of partners is in § 128 UGB
- **Corrections:**
  - expected_section → § 128
  - expected_conclusion → Nach § 128 UGB haften die Gesellschafter einer OHG persönlich und unbeschränkt für die Gesellschaftsschulden.
- **Notes:** Juristische Freigabe erforderlich. § 105 UGB definiert die OHG, § 128 UGB regelt die Haftung.

### sub-at-038 — Status: corrected

- **Law:** abgb § 1166
- **Issues:**
  - expected_section § 1166 ABGB defines Werkvertrag, warranty rights are in § 1167 ABGB
  - Question asks about defective work rights (Gewährleistung), not definition
- **Corrections:**
  - expected_section → § 1167
  - expected_conclusion → Nach § 1167 ABGB kann A Gewährleistung geltend machen: Nachbesserung, Preisminderung oder Wandlung bei mangelhaftem Werk.
- **Notes:** Juristische Freigabe erforderlich. § 1166 definiert den Werkvertrag, § 1167 regelt die Gewährleistung.

### sub-at-040 — Status: corrected

- **Law:** abgb § 399
- **Issues:**
  - expected_section § 399 ABGB is about Schatzteilung (treasure trove), not finder's duties
  - Finder's duties are in § 390 ABGB (Anzeigepflicht, Verwahrungspflicht)
- **Corrections:**
  - expected_section → § 390
  - expected_conclusion → Nach § 390 ABGB muss A den Fund unverzüglich dem Verlierer oder der zuständigen Behörde anzeigen und die Sache verwahren.
- **Notes:** Juristische Freigabe erforderlich. § 399 regelt die Teilung eines Schatzes, nicht die Finderpflichten.

### sub-at-041 — Status: disputed

- **Law:** abgb § 366
- **Issues:**
  - expected_law 'abgb' is wrong — question is about debt collection procedure (ZPO)
  - expected_section § 366 ABGB is about Eigenthumsklage (rei vindicatio), not debt collection
  - DE equivalent (sub-de-051) correctly uses zpo § 253
- **Corrections:**
  - expected_law → zpo
  - expected_section → § 236
  - expected_conclusion → Nach § 236 ZPO muss A eine Klageschrift beim zuständigen Gericht einreichen, die den Streitgegenstand und den Klageantrag enthält.
- **Notes:** DISPUTED: Juristische Freigabe erforderlich. Frage ist prozessualer Natur.

### sub-at-036 — Status: disputed

- **Law:** abgb § 762
- **Issues:**
  - expected_section § 762 ABGB is about 'Bedingungen und Belastungen' of Pflichtteil, not existence
  - Existence of Pflichtteilsanspruch is in § 761 ABGB
- **Corrections:**
  - expected_section → § 761
  - expected_conclusion → Nach § 761 ABGB haben die Kinder einen Pflichtteilsanspruch, auch wenn sie im Testament enterbt wurden.
- **Notes:** DISPUTED: § 762 im Pflichtteil-Kontext, aber regelt Bedingungen. Juristische Freigabe erforderlich.

### sub-at-025 — Status: corrected

- **Law:** zpo § 309
- **Issues:**
  - expected_section '§ 309' not found in zpo-at.md
  - expected_section § 309 ZPO does not exist in the AT ZPO corpus
  - Exekutionsvoraussetzungen (Vollstreckungstitel) are in § 291 ZPO
- **Corrections:**
  - expected_section → § 291
  - expected_conclusion → Nach § 291 ZPO benötigt A einen Vollstreckungstitel (z.B. ein Urteil) mit Exekutionsklausel, um die Zwangsvollstreckung durchzuführen.
- **Notes:** Juristische Freigabe erforderlich. § 309 existiert nicht in der österreichischen ZPO.

## All Cases

| Case ID    | Jur | Law  | Section | Status    | Issues |
| ---------- | --- | ---- | ------- | --------- | ------ |
| sub-de-031 | de  | bgb  | § 543   | valid     | 0      |
| sub-de-032 | de  | bgb  | § 434   | valid     | 0      |
| sub-de-033 | de  | bgb  | § 528   | valid     | 0      |
| sub-de-034 | de  | hgb  | § 128   | valid     | 0      |
| sub-de-035 | de  | bgb  | § 164   | valid     | 0      |
| sub-de-036 | de  | stgb | § 240   | valid     | 0      |
| sub-de-037 | de  | stgb | § 316   | valid     | 0      |
| sub-de-038 | de  | stgb | § 303a  | valid     | 0      |
| sub-de-039 | de  | stgb | § 370   | valid     | 0      |
| sub-de-040 | de  | stgb | § 323c  | valid     | 0      |
| sub-de-041 | de  | zpo  | § 23    | valid     | 0      |
| sub-de-042 | de  | zpo  | § 688   | valid     | 0      |
| sub-de-043 | de  | zpo  | § 704   | valid     | 0      |
| sub-de-044 | de  | zpo  | § 233   | valid     | 0      |
| sub-de-045 | de  | hgb  | § 1     | valid     | 0      |
| sub-de-046 | de  | hgb  | § 49    | valid     | 0      |
| sub-de-047 | de  | ao   | § 12    | valid     | 0      |
| sub-de-048 | de  | ao   | § 108   | valid     | 0      |
| sub-de-049 | de  | ao   | § 110   | valid     | 0      |
| sub-de-050 | de  | bgb  | § 929   | valid     | 0      |
| sub-de-051 | de  | zpo  | § 253   | valid     | 0      |
| sub-de-052 | de  | bgb  | § 823   | valid     | 0      |
| sub-de-053 | de  | bgb  | § 1566  | valid     | 0      |
| sub-de-054 | de  | bgb  | § 2303  | valid     | 0      |
| sub-de-055 | de  | bgb  | § 823   | valid     | 0      |
| sub-de-056 | de  | bgb  | § 634   | valid     | 0      |
| sub-de-057 | de  | bgb  | § 488   | valid     | 0      |
| sub-de-058 | de  | bgb  | § 965   | valid     | 0      |
| sub-de-059 | de  | bgb  | § 1113  | valid     | 0      |
| sub-de-060 | de  | bgb  | § 985   | valid     | 0      |
| sub-de-061 | de  | bgb  | § 119   | valid     | 0      |
| sub-de-062 | de  | bgb  | § 104   | valid     | 0      |
| sub-de-063 | de  | stgb | § 223   | valid     | 0      |
| sub-de-064 | de  | stgb | § 186   | valid     | 0      |
| sub-de-065 | de  | stgb | § 306   | valid     | 0      |
| sub-de-066 | de  | stgb | § 266   | valid     | 0      |
| sub-de-067 | de  | stgb | § 267   | valid     | 0      |
| sub-de-068 | de  | stgb | § 331   | valid     | 0      |
| sub-de-069 | de  | stgb | § 153   | valid     | 0      |
| sub-de-070 | de  | inso | § 286   | valid     | 0      |
| sub-de-071 | de  | zpo  | § 694   | valid     | 0      |
| sub-de-072 | de  | zpo  | § 542   | valid     | 0      |
| sub-de-073 | de  | zpo  | § 940   | valid     | 0      |
| sub-de-074 | de  | hgb  | § 171   | valid     | 0      |
| sub-de-075 | de  | hgb  | § 87    | valid     | 0      |
| sub-de-076 | de  | ao   | § 200   | valid     | 0      |
| sub-de-077 | de  | ao   | § 249   | valid     | 0      |
| sub-de-078 | de  | vwgo | § 42    | valid     | 0      |
| sub-de-079 | de  | uwg  | § 5     | valid     | 0      |
| sub-de-080 | de  | stgb | § 32    | valid     | 0      |
| sub-de-081 | de  | stgb | § 34    | valid     | 0      |
| sub-de-082 | de  | stgb | § 22    | valid     | 0      |
| sub-de-083 | de  | stgb | § 27    | valid     | 0      |
| sub-de-084 | de  | stgb | § 26    | valid     | 0      |
| sub-de-085 | de  | stgb | § 19    | valid     | 0      |
| sub-de-086 | de  | bgb  | § 323   | valid     | 0      |
| sub-de-087 | de  | bgb  | § 280   | valid     | 0      |
| sub-de-088 | de  | bgb  | § 280   | valid     | 0      |
| sub-de-089 | de  | bgb  | § 812   | valid     | 0      |
| sub-de-090 | de  | bgb  | § 434   | valid     | 0      |
| sub-de-091 | de  | bgb  | § 622   | valid     | 0      |
| sub-de-092 | de  | bgb  | § 280   | valid     | 0      |
| sub-de-093 | de  | bgb  | § 525   | valid     | 0      |
| sub-de-094 | de  | bgb  | § 168   | valid     | 0      |
| sub-de-095 | de  | bgb  | § 280   | valid     | 0      |
| sub-de-096 | de  | zpo  | § 253   | valid     | 0      |
| sub-de-097 | de  | bgb  | § 488   | valid     | 0      |
| sub-de-098 | de  | bgb  | § 323   | valid     | 0      |
| sub-de-099 | de  | bgb  | § 603   | valid     | 0      |
| sub-de-100 | de  | bgb  | § 985   | valid     | 0      |
| sub-at-016 | at  | abgb | § 1096  | valid     | 0      |
| sub-at-017 | at  | abgb | § 922   | valid     | 0      |
| sub-at-018 | at  | abgb | § 948   | valid     | 0      |
| sub-at-019 | at  | ugb  | § 105   | corrected | 2      |
| sub-at-020 | at  | abgb | § 1002  | valid     | 0      |
| sub-at-021 | at  | stgb | § 105   | valid     | 0      |
| sub-at-022 | at  | stgb | § 81    | valid     | 0      |
| sub-at-023 | at  | stgb | § 95    | valid     | 0      |
| sub-at-024 | at  | zpo  | § 27    | valid     | 0      |
| sub-at-025 | at  | zpo  | § 309   | corrected | 3      |
| sub-at-026 | at  | zpo  | § 146   | valid     | 0      |
| sub-at-027 | at  | ugb  | § 1     | valid     | 0      |
| sub-at-028 | at  | ugb  | § 49    | valid     | 0      |
| sub-at-029 | at  | bao  | § 27    | valid     | 0      |
| sub-at-030 | at  | bao  | § 78    | valid     | 0      |
| sub-at-031 | at  | bao  | § 80    | corrected | 2      |
| sub-at-032 | at  | abgb | § 380   | valid     | 0      |
| sub-at-033 | at  | zpo  | § 236   | valid     | 0      |
| sub-at-034 | at  | abgb | § 1311  | valid     | 0      |
| sub-at-035 | at  | eheg | § 43    | corrected | 2      |
| sub-at-036 | at  | abgb | § 762   | disputed  | 2      |
| sub-at-037 | at  | abgb | § 1311  | valid     | 0      |
| sub-at-038 | at  | abgb | § 1166  | corrected | 2      |
| sub-at-039 | at  | abgb | § 1235  | valid     | 0      |
| sub-at-040 | at  | abgb | § 399   | corrected | 2      |
| sub-at-041 | at  | abgb | § 366   | disputed  | 3      |
| sub-at-042 | at  | abgb | § 871   | valid     | 0      |
| sub-at-043 | at  | abgb | § 21    | valid     | 0      |
| sub-at-044 | at  | stgb | § 83    | valid     | 0      |
| sub-at-045 | at  | stgb | § 169   | valid     | 0      |
| sub-at-046 | at  | stgb | § 153   | valid     | 0      |
| sub-at-047 | at  | stgb | § 223   | valid     | 0      |
| sub-at-048 | at  | stgb | § 304   | valid     | 0      |
| sub-at-049 | at  | stgb | § 3     | valid     | 0      |
| sub-at-050 | at  | stgb | § 12    | valid     | 0      |

## Detailed Case Entries

### sub-at-019 — corrected

- **Jurisdiction:** at
- **Expected:** ugb § 105
- **Conclusion:** Nach § 105 UGB haften die Gesellschafter einer OG persönlich und unbeschränkt für die Gesellschaftsschulden....
- **Issues:**
  - expected_section § 105 UGB defines the OHG, not personal liability
  - Personal unlimited liability of partners is in § 128 UGB
- **Proposed Corrections:**
  - section → § 128
  - conclusion → Nach § 128 UGB haften die Gesellschafter einer OHG persönlich und unbeschränkt für die Gesellschaftsschulden.
- **Notes:** Juristische Freigabe erforderlich. § 105 UGB definiert die OHG, § 128 UGB regelt die Haftung.

### sub-at-025 — corrected

- **Jurisdiction:** at
- **Expected:** zpo § 309
- **Conclusion:** Nach § 309 ZPO benötigt A einen Vollstreckungstitel (z.B. ein Urteil) mit Exekutionsklausel, um die Zwangsvollstreckung ...
- **Issues:**
  - expected_section '§ 309' not found in zpo-at.md
  - expected_section § 309 ZPO does not exist in the AT ZPO corpus
  - Exekutionsvoraussetzungen (Vollstreckungstitel) are in § 291 ZPO
- **Proposed Corrections:**
  - section → § 291
  - conclusion → Nach § 291 ZPO benötigt A einen Vollstreckungstitel (z.B. ein Urteil) mit Exekutionsklausel, um die Zwangsvollstreckung durchzuführen.
- **Notes:** Juristische Freigabe erforderlich. § 309 existiert nicht in der österreichischen ZPO.

### sub-at-031 — corrected

- **Jurisdiction:** at
- **Expected:** bao § 80
- **Conclusion:** Nach § 80 BAO kann A Wiedereinsetzung beantragen, wenn er ohne Verschulden an der Einhaltung der Frist gehindert war....
- **Issues:**
  - expected_section § 80 BAO is not about Wiedereinsetzung
  - Wiedereinsetzung in den vorigen Stand is regulated in § 145 BAO
- **Proposed Corrections:**
  - section → § 145
  - conclusion → Nach § 145 BAO kann A Wiedereinsetzung in den vorigen Stand beantragen, wenn er ohne sein Verschulden an der Einhaltung einer Frist gehindert war.
- **Notes:** Juristische Freigabe erforderlich. § 80 BAO regelt nicht die Wiedereinsetzung.

### sub-at-035 — corrected

- **Jurisdiction:** at
- **Expected:** eheg § 43
- **Conclusion:** Nach § 43 EheG ist eine Scheidung wegen Verschuldens möglich, wenn die Ehe zerrüttet ist und ein Verschulden vorliegt....
- **Issues:**
  - expected_section § 43 EheG is about Wiederverheiratung nach Todeserklärung, not divorce
  - Divorce is in § 46 EheG; separation-based divorce in § 55 EheG
- **Proposed Corrections:**
  - section → § 55
  - conclusion → Nach § 55 EheG ist eine Scheidung nach Aufhebung der häuslichen Gemeinschaft möglich, wenn die Wiederherstellung der Lebensgemeinschaft nicht erwartet werden kann.
- **Notes:** Juristische Freigabe erforderlich. § 43 EheG betrifft Wiederverheiratung nach Todeserklärung.

### sub-at-036 — disputed

- **Jurisdiction:** at
- **Expected:** abgb § 762
- **Conclusion:** Nach § 762 ABGB haben die Kinder einen Pflichtteilsanspruch, auch wenn sie im Testament enterbt wurden....
- **Issues:**
  - expected_section § 762 ABGB is about 'Bedingungen und Belastungen' of Pflichtteil, not existence
  - Existence of Pflichtteilsanspruch is in § 761 ABGB
- **Proposed Corrections:**
  - section → § 761
  - conclusion → Nach § 761 ABGB haben die Kinder einen Pflichtteilsanspruch, auch wenn sie im Testament enterbt wurden.
- **Notes:** DISPUTED: § 762 im Pflichtteil-Kontext, aber regelt Bedingungen. Juristische Freigabe erforderlich.

### sub-at-038 — corrected

- **Jurisdiction:** at
- **Expected:** abgb § 1166
- **Conclusion:** Nach § 1166 ABGB kann A Nachbesserung verlangen, den Preis mindern oder vom Vertrag zurücktreten, wenn das Werk mangelha...
- **Issues:**
  - expected_section § 1166 ABGB defines Werkvertrag, warranty rights are in § 1167 ABGB
  - Question asks about defective work rights (Gewährleistung), not definition
- **Proposed Corrections:**
  - section → § 1167
  - conclusion → Nach § 1167 ABGB kann A Gewährleistung geltend machen: Nachbesserung, Preisminderung oder Wandlung bei mangelhaftem Werk.
- **Notes:** Juristische Freigabe erforderlich. § 1166 definiert den Werkvertrag, § 1167 regelt die Gewährleistung.

### sub-at-040 — corrected

- **Jurisdiction:** at
- **Expected:** abgb § 399
- **Conclusion:** Nach § 399 ABGB muss A den Fund unverzüglich dem Verlierer oder der Fundbehörde anzeigen....
- **Issues:**
  - expected_section § 399 ABGB is about Schatzteilung (treasure trove), not finder's duties
  - Finder's duties are in § 390 ABGB (Anzeigepflicht, Verwahrungspflicht)
- **Proposed Corrections:**
  - section → § 390
  - conclusion → Nach § 390 ABGB muss A den Fund unverzüglich dem Verlierer oder der zuständigen Behörde anzeigen und die Sache verwahren.
- **Notes:** Juristische Freigabe erforderlich. § 399 regelt die Teilung eines Schatzes, nicht die Finderpflichten.

### sub-at-041 — disputed

- **Jurisdiction:** at
- **Expected:** abgb § 366
- **Conclusion:** Nach § 366 ABGB hat A als Eigentümer einen Herausgabeanspruch gegen B, der die Sache ohne Rechtgrund besitzt....
- **Issues:**
  - expected_law 'abgb' is wrong — question is about debt collection procedure (ZPO)
  - expected_section § 366 ABGB is about Eigenthumsklage (rei vindicatio), not debt collection
  - DE equivalent (sub-de-051) correctly uses zpo § 253
- **Proposed Corrections:**
  - law → zpo
  - section → § 236
  - conclusion → Nach § 236 ZPO muss A eine Klageschrift beim zuständigen Gericht einreichen, die den Streitgegenstand und den Klageantrag enthält.
- **Notes:** DISPUTED: Juristische Freigabe erforderlich. Frage ist prozessualer Natur.

---

**Disclaimer:** This audit was prepared by an AI agent. Juridical review is external mandatory work. No legal validity is claimed.
