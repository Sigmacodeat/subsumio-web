---
title: >-
  Verfassungsblog — Colourful Case Law: Citation Analysis of the German
  Constitutional Court’s Jurisprudence
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2015-01-26'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: >-
  https://verfassungsblog.de/farbenfrohe-rechtsprechung-verweisungsanalyse-von-entscheidungen-des-bundesverfassungsgerichts/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
content_hash: "4df6e736153326b1"
---

# Colourful Case Law: Citation Analysis of the German Constitutional Court’s Jurisprudence

With increasing computing power and the ubiquitous production of data, the method of network analysis has spread considerably. This method focuses on the connections of entities and looks for conclusions regarding the nature of certain networks and potential relations within it. For example, network analysis was used to study digital spheres of political opinion influence (Adamic et al., 2005) as well as analysing terror cells (Krebs, 2002). Decisions of the U.S. Supreme Court (Fowler et al., 2008) and even the German civil code (Bürgerliches Gesetzbuch) (Tolksdorf et al., 2012) have been subjected to an analysis of this kind. However, the network resulting from self-citations in decisions of the German constitutional court (“Bundesverfassungsgericht”, abbreviated “BVerfG”) has so far not been studied.

In order to change this, we subjected the collection of the most important decisions of the BVerfG, meritoriously digitised by the project “Deutschsprachiges Fallrecht” ([DFR]; http://www.servat.unibe.ch/dfr/dfr_info.html), to a network analysis using the programmes R and Gephi. This collection of decisions holds what most German jurists know as cases cited with the abbreviation “BVerfGE”. The DFR selects the cases according to their relevance in teaching. As a result, decisions regarding for example social law, pensions, and tax law are underrepresented. The volume and page numbers of the printed version (usually this is how the decisions are cited) are adopted and a short title is added. Following the selection criteria, the DFR database and our set of data mainly includes decisions by the senate and plenum of the court (cf. § 31 (1) and (2) BVerfGGO, which is the procedural by-law of the constitutional court). Therefore, the collection, which comprises 1,394 decisions, only encompasses a fraction of the overall 200.000 proceedings (of which approx. 181,000 are concluded with a decision) that have been processed by the court since 1951 (http://www.bundesverfassungsgericht.de/DE/Verfahren/Jahresstatistiken/2013/statistik_2013_node.html). One can assume that the decisions included in the collection are of high theoretical and practical value and that they are rather disputed (see §§ 93-93d BVerfGG, which is the Law of the constitutional court. It outlines which decisions are published.).

 

But how can we draw statistical conclusions from this network that will be useful in constitutional legal practice and theory? In this regard, two hypotheses shall be examined in more detail.The basis of the analysis are references from newer to older decisions as the connections of the network. The pictured overall network is created by the decisions depicted as dots and the references as lines connecting the dots. The more often a decision is cited, the bigger and more central the knot symbolising the respective decision. Different colours are used to visualise groups of decisions – or: clusters –, which exhibit considerably shorter chains of references internally than they have to other parts of the network. On average the length of the path connecting any two dots is 3.48, the overall longest line connects through 18 points. Further, over 90% of decisions are at a maximum distance of 6 or 7 hops away from each other.

## 1. The most cited decisions are the most relevant decisions overall.

The reference to a previous decision in a court’s reasoning can be considered an inherent assessment of its relevance in deciding the current case. Assuming that all assessments of relevance of all court judgments are more or less even and then adding these up, the result is a list of the most relevant precedents. This relevance pertains to the BVerfG’s task and is dervied from its own judgment. This simple method, could be further refined by weighing and including surrounding references (thus by using the centrality of the decision, cf. Fowler et al., 2008, p. 20). It is, however, omitted for the purpose of this piece.

Case
Incoming References

18, 85 – Spezifisches Verfassungsrecht
125

7, 198 – Lüth
114

7, 377 – Apotheken-Urteil
88

6, 32 – Elfes
87

8, 274 – Preisgesetz
77

1, 14 – Südweststaat
77

50, 290 – Mitbestimmung
76

1, 208 – 7,5%-Sperrklausel
72

4, 7 – Investitionshilfe
71

1, 97 – Hinterbliebenenrente I
68

Such a ranking may sound important and valuable at first – especially to the legal laymen. However, the general relevance of decisions, i.e. their importance for the constitutional jurisprudence in total, is not a big asset. The overall relevance is hardly helpful when the constitutional court faces the task of selecting the relevant laws and precedents for deciding a specific case. It does not help the constitutional jurist when making normative judgments by looking back and forth between the facts of a case and the law or preceding cases. It is possible that such a ranking could be the starting point when searching for relevant precedents. However, for a jurist with knowledge of constitutional law, it seems more promising to consult articles, textbooks and especially commentaries. Further, it is to be considered that German constitutional thinking is deeply rooted in each individual fundamental right enshrined in the Grundgesetz (abbreviated: GG, the German constitution) and that precedents only have a subordinate function.

The hypothesis that the most cited decisions are the most relevant, may therefore be correct in general. However, there is limited practical value to it. An exception could arise when one wants to understand the constitutional law by the means of precedents. To understand certain areas of constitutional jurisprudence it might make sense to focus on specific clusters of decisions. Therefore, we need to change from the macro-level (as shown above) to the meso-level (sub-network) of the citation network.

## 2. The resulting clusters of decisions relate to certain areas of constitutional jurisprudence.

The coloured clusters of decisions are determined by a modularity algorithm (see e.g. Blondel et al., 2008). Decisions within a cluster are stronger connected among each other than with decisions from other clusters. And in fact, the clusters partly represent certain fields of constitutional law. The yellow cluster in the diagram (see above) can be linked mainly to the field of state organisation (“Staatsorganisationsrecht”), as well as the constitutional areas of election, political parties, and mandate. On the other hand, the green cluster seems to predominantly encompass decisions based on the fundamental rights regarding personality and communication. The red cluster mainly touches upon the areas of taxes, family, social benefits, and questions of equality. The contents of the blue cluster are freedom of occupation and entrepreneurship and other areas. Especially, for the latter two there is no clear-cut separation.

Additional cross-connections between these fields (i.e. not only caused by material legal similarity) could arise from common constitutional procedural problems, questions of standing and obligations regarding fundamental rights in general, but also overarching dogmatic questions (scope of protection [Schutzbereich] – interference [Eingriff] – justification [verfassungsrechtliche Rechtfertigung]) and alike. Time should also be considered as a factor, when explaining why a decision cites a certain case rather than directly referencing an older landmark decision.

The clusters themselves and especially some of their sub-clusters could be a starting point when tackling sub-fields of constitutional law by using precedents or when trying to locate a decision within the vast amount of jurisprudence. Such method could further prove helpful when trying to ascertain the legal-historical perspective on and the genealogy of certain dogmatic or doctrinal figures – whereas using only the respective literature for this, would turn out time-consuming. Network analysis cannot replace a more detailed look at the context and type of the citation. However, it can provide a useful first step to the matter. Including the chamber decisions of the BVerfG into the network could be further beneficial, as these are rarely the topic of academic legal discourse. To conclude, the network analysis of constitutional jurisprudence can never replace meticulous legal work with decisions, commentaries, articles, and monographs, but it does supplement this work with a valuable additional perspective especially in the fields of legal history and legal sociology.

 

Prof. Dr. Cornelius Puschmann conducted the preparation, visualisation, and analysis of data. We would like to thank Prof. Dr. Axel Tschentscher for his helpful comments and Hanna Soditt for her valuable help with the translation of this piece.
