---
title: Verfassungsblog — Where Are You Really From?
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2026-06-22'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: https://verfassungsblog.de/dialect-recognition-software-dias-law/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
---

# Where Are You Really From?

In recent years, both the European Union (EU) and its Member States have started relying heavily on advanced technologies, including Artificial Intelligence (AI), to support border control, migration management, and asylum administration. While resorting to such technologies is driven by the ambition to increase the efficiency and objectivity of procedures, gaining information about them has become ever more difficult. This leaves all those directly affected puzzled about the precise implications of these systems and makes it difficult to challenge their use.

One prominent example of the increasingly technified EU migration control system is the Dialect Identification Assistance System (DIAS) used by the German Federal Office of Migration and Refugees (BAMF) in the asylum procedure.1) While DIAS is often described as a neutral and objective tool, there are dangers for individual rights protection and a clear risk of institutional disguise.

## How Does DIAS Operate? On Its Purpose, Use and Technical Components

The dialect recognition software DIAS (also known as speech biometrics) is an assistance system within the BAMF’s “Integrated Identity Management” to handle applications for international protection. Since 2017, the BAMF has employed DIAS to support its workforce in determining an applicant’s country (or region) of origin. Notably, whenever identity documents are missing, were potentially obtained illegally, or show signs of fraud or forgery, and the applicant is over the age of 14, DIAS shall provide a first indication of where the protection seeker comes from. Its use is based on Section 16, paragraph 1, sentence 3, of the German Asylum Act. Currently, DIAS is programmed to recognise five major Arabic dialects (Maghrebian, Levantine, Egyptian, Iraqi and Gulf), and the dialects Dari and Persian/ Farsi.2)

Yet, to detect sore points, its practical use and functionality merit further scrutiny. Usually, DIAS is employed right at the beginning of the asylum procedure, i.e., when an asylum seeker files an application for international protection. To start the language analysis, the responsible BAMF staff member calls an in-house number, and the applicant is asked to describe a specific picture over the phone as fluently and as detailed as possible in their mother tongue. The description lasts for about two to three minutes, is recorded electronically3), and serves as the asylum seeker’s country-specific speech sample. Afterwards, the sample is processed, analysed, and classified by DIAS, using machine learning and computational linguistics.

Essentially, DIAS relies on two components for processing and classifying the speech sample: pre-existing language models and a language portal. The language models are a collection of statistics and aggregate information about the different dialects DIAS has been trained to recognise. To build these models, the BAMF has not only used its own data but has relied on externally purchased data, mainly from the Linguistic Data Consortium (LDC) at the University of Pennsylvania4) and a small proportion from Clickworker GmbH. The language portal, on the other hand, is based on centrally hosted, licensed third-party software.5) It compares the recorded speech sample with the pre-existing language models, thereby detecting patterns in the applicant’s speech sample and examining similarities between the sample and the models.6) On this basis, DIAS classifies the sample. The outcome is a probability calculation indicating the dialect most likely spoken by the applicant (e.g., 85% Arabic Gulf, 10% Arabic Levantine, 5% Arabic Maghrebian). Under consideration of the geographic distribution of the dialect, the classification may thus either confirm or refute the applicant’s statements regarding their country (or region) of origin.7) Hence, the machine-learning-driven analysis provides an initial indication of whether the applicant’s statements about their place of origin are credible. Further, if the DIAS analysis refutes the applicant’s statements, the outcome report shall enable more targeted questioning in the actual hearing to test the applicant’s narrative.

The BAMF repeatedly stresses that DIAS has only a supporting role in the asylum procedure and that humans assess various sources of information to reach a decision. Yet, asylum decisions might still end up being decisively influenced by the DIAS outcome. This is because the dialect spoken is, next to individual statements, often the only reliable information on the applicant’s origin. Further, within the BAMF, DIAS is perceived as a neutral, objective and scalable analytical tool. Worryingly, whenever humans perceive highly advanced technological tools as infallible, they tend to neglect dangers for the rights of those directly affected by the technology.

## Challenges for Fundamental Rights Protection

Overall, the starkest concerns with DIAS arise from the perspectives of data protection, non-discrimination, and the right to an effective remedy and to a fair trial. The analysis here focuses on the EU Charter of Fundamental Rights (CFR). While this may be unexpected, as DIAS is a national use case and the German Basic Law seems to be the natural fit, the CFR provides valuable insights and is well-suited to the analysis. This is because interest in dialect recognition technology is growing across other EU Member States, and the EU actively promotes advanced AI tools for border control, migration management, and asylum administration. Further, as the asylum procedure is pre-structured by EU law and the Member States thus implement Union law in the sense of Article 51(1) CFR, the Charter applies without any doubt. Protection of the rights enshrined in the EU Charter of Fundamental Rights thus deserves closer attention.

Crucially, the following observations shall give an overview of where fundamental rights concerns arise. They do not claim to be exhaustive, particularly since gaining substantive information on DIAS has proven quite difficult, in certain respects even impossible.

According to the right to data protection (Article 8 CFR), personal data must be processed fairly for specified purposes and on the basis of the consent of the person concerned or some other legitimate basis laid down by law (paragraph 2, sentence 1). While DIAS follows both a clearly defined purpose (i.e., to give a first indication of the protection seeker’s country or region of origin) and is based on a legitimate legal basis (namely, Section 16, paragraph 1, sentence 3 of the German Asylum Act), there are concerns about the fairness of the data processing. In particular, data quality seems to be an issue, with respect to both the applicant’s speech sample and the training data used to build the language models. While speech samples of insufficient quality may prompt a second recording, controlling the quality of the training data (which is massive in scale) is difficult in practice. In response to a personal request under the German Freedom of Information Law, the BAMF stresses that trained linguists regularly assess the quality of the training data through a “tagging procedure.” However, the last proper check was conducted in 2023, and no new data has been externally purchased for training purposes. Given that language evolves over time, this is certainly something to worry about, as the use of outdated data for training purposes can affect the accuracy of the DIAS output. Although the BAMF stresses that DIAS's recognition rate for dialects is consistently high at up to 85%, and could be further improved by continuous training, renowned linguists doubt that automated speech analyses like those performed by DIAS yield truly reliable results. Further, accountability is questionable. The BAMF is not able to indicate precisely how the DIAS outcome report is weighed in the final decision-making, and the BAMF workforce is not properly trained on how DIAS functions technically or where the technology shows limitations.

A second point for concern is the principle of non-discrimination (Article 21 CFR). While the normative application of the principle has certainly become more difficult in the face of AI-aided decision-making that relies on fluid pattern recognition and makes it harder to identify a clearly disadvantaged group in comparison to another, the following should be acknowledged in the case of DIAS. Although the BAMF stresses that DIAS is used only for applicants who speak one of the dialects represented in its language models, the Office seems to overlook that individuals do not always speak a pure form or a clearly identifiable dialect. This is particularly true for individuals from a border region. Further, applicants may use minority dialects, or the way they speak may have changed due to a long migration trajectory and residence in different countries. All of this leads to complex cases that a system like DIAS can hardly assess properly. Further, the BAMF will not easily be able to identify these individuals. On the contrary, DIAS is precisely used to obtain indications of where the individual in question might come from. If the kind of dialect spoken was clear from the outset, using DIAS would not be necessary. Hence, employing DIAS “on suspicion” puts people with the above-described complex backgrounds at a clear disadvantage, as their DIAS outcome report becomes even more unreliable. Further, while the BAMF stresses that it usually does not use DIAS on people with speech disabilities (such as a lisp or stuttering), there is still a likelihood that people with such profiles are subjected to the DIAS analysis and thereby put at a disadvantage. A further point of concern is that the BAMF workforce is not specifically trained on how to address the phenomena of “automation bias” and “selective adherence”, which may both lead to overreliance on the DIAS output and reinforce discriminatory tendencies.

Finally, DIAS puts the right to an effective remedy and to a fair trial (Article 47 CFR) under pressure. First of all, the information provided to applicants on the DIAS procedure is rather scarce and rudimentary. While applicants have the right to object to the DIAS outcome report during the actual hearing and provide further evidence, they have no means of either understanding how DIAS functions technically (i.e., how their speech sample is analysed and classified) or of scrutinising how far the DIAS outcome influences the decision on their application for international protection. All of this directly influences their chances of challenging the use of DIAS in court and, thus, impacts their right under Article 47 CFR. Currently, there are no court cases pending on DIAS. Yet the hurdles described above are well known in the context of AI-aided and automated decision-making. Remedying them remains an acute challenge.

## Overarching Concerns: Institutional Disguise and Difficulties of Coming to Grasp with Technical Details

The difficulties applicants face in understanding how DIAS operates and how its output is used in the decision-making process link to more far-reaching concerns about institutional disguise and opacity. A recent personal request under the German Freedom of Information Law that contained numerous questions about the technical functioning of DIAS, the training of the BAMF workforce, and how challenges to fundamental rights protection are addressed was met with evasive, short responses devoid of any detail.  This tells a story on its own. When it is already difficult for researchers with sufficient time and resources to gain substantial information, the situation for directly affected individuals is far more delicate.

Overall, it is quite worrisome when state institutions provide very little information on migration control systems with a severe impact on individuals in often difficult life situations, and public scrutiny becomes ever harder. Regarding DIAS, an external scientific evaluation was conducted in 2024 by TH Nürnberg (TH Ohm), but a whitepaper with results is still pending, and no date for publication is in sight.

In the end, concerned individuals might be left at the mercy of advanced technological systems. This is even more problematic when the reliability of these systems is limited, the costs of maintaining them are high, and viable means to challenge their use are lacking.

We are thus at a crossroads of whether or not the protection of fundamental rights remains effective in the increasingly technified EU migration control system. Currently, we sadly witness a trend toward the negative.

 References[+]

 References  

 &#8593;1 Germany is currently the only country actively deploying such technology. Yet, there have been pilot tests and knowledge exchanges with other EU Member States (Deutsche Bundesregierung (2022): Drucksache 20/3238, p. 11, answer to question 12).

 &#8593;2 DIAS also used to be applied for the dialect Pashto, but in April 2023, the BAMF ceased to do so (https://fragdenstaat.de/anfrage/use-of-the-dialektidentifizierungsassistent-dias-in-the-asylum-procedure/#nachricht-1006445, Question 2).

 &#8593;3 Section 16, paragraph 1, sentence 3 of the German Asylum Act.

 &#8593;4 The LDC is an open consortium that constists of universities, libraries, corporations and government research laboratories hosted by the University of Pennsylvania in the United States (https://www.ldc.upenn.edu/about).

 &#8593;5 The software is called Nuance Speech Suite. It has been developed in cooperation with the private IT company “Atos,” which integrates products and services from “Nuance.”

“Atos” is a “multinational company” that presents itself as a “global leader in digital transformation, cloud and digital workplace.”

“Nuance” is another large IT company that specialises “in speech recognition software, among other products with forensic, criminal ID and audio mining capabilities for intelligence and military agencies” (Ozkul (2023) , p. 43).

 &#8593;6 The following techniques are used for analysing the speech sample: ”i-vector analysis (sound analysis, pronunciation of phonemes and sound production), phoneme distribution statistics as well as syntactical analyses”.

 &#8593;7 In the refuting case, DIAS may point towards the actual language/dialect spoken, thus giving a counter-indication on the applicant’s origin (BAMF).
