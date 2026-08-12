---
title: Verfassungsblog — Squaring the Circle
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2023-04-07'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: https://verfassungsblog.de/squaring-the-circle/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
content_hash: "7055e711be07f092"
---

# Squaring the Circle

At the end of last week, the ChatGPT hype finally reached the legal world. The Italian Data Protection Authority (DPA) imposed a temporary restriction on the processing of Italian users’ data by OpenAI, the US-based company that develops and manages the software. OpenAI has now taken ChatGPT offline in Italy and must notify the Italian DPA within 20 days of the measures taken to comply with the order or face a fine of up to €20 million or 4% of its total annual worldwide turnover. Below, I briefly explain what ChatGPT is, how the Italian DPA handled it, and what this tells us about the current state of EU data protection law and attempts to regulate ‘artificial intelligence’.

## ChatGPT is a Predictive Model

ChatGPT is probably the most well-known, and most popular example of a Large Language Model (LLM) and provides a very accessible example of what ‘AI’ can do today in terms of visibility and understandability. Many people have been impressed by the eloquent responses, seemingly emotional conversations, and its coding ability. Millions of users have tested LLMs for a variety of purposes. The technical functions of LLM have already been explained clearly here. What is important for an evaluation in terms of data protection is that LLMs require an (even) larger mass of training data than other machine-learning (ML) models, as human language is complex. Additionally, as with other ML-models, there are two processing steps (explained here, p. 42 f.): firstly, processing within the framework of the training of the model and the application of the model through actual use by the end users. The second step involves predicting the probability of word order in text, e.g. in response to a user-generated question. This process results in two different data processing operations for divergent purposes in terms of data protection law. Additionally, data security considerations cannot be disregarded; researchers have repeatedly shown that membership inference attacks can be used to extract personal data from LLM and thus enable re-identification of individuals.

## The Decision of the Italian DPA

Interestingly, the media hype surrounding ChatGPT was its undoing. The decision by the Italian data protection regulator explicitly mentions the media coverage regarding the programme. The ball was set rolling by a data leak on 20 March 2023, to which OpenAI officially responded:

“A bug may have caused the unintended visibility of payment-related information of 1.2% of ChatGPT Plus subscribers who were active during a certain nine-hour window. In the hours before we took ChatGPT offline on Monday, it was possible for some users to see another active user’s first and last name, email address, payment address, the last four digits (only) of a credit card number, and the credit card expiry date. The full credit card numbers were not disclosed at any time.”

Ten days later, the DPA issued a temporary ban on ChatGPT in Italy. The main points of the DPA’s decision address the following potential violations:

- lack of information for data subjects whose data is processed by OpenAI (Art. 13 GDPR),

- a lack of legal basis for the data processing (Art. 6 (1) GDPR),

- the incorrect processing of personal data because the information presented by ChatGPT does not always correspond to the actual data (Art. 5 (1) d GDPR),

- a breach of the requirements of Art. 8 GDPR, according to which an age verification mechanism is required to protect underage users.

These concerns involve not only violations of the general principles of the GDPR but also potential disregard for data subjects’ rights and for specific procedural requirements. Therefore, the decision of the Italian DPA draws attention to the unresolved conflict between data protection law, which is oriented to protecting individuals, and machine learning, which requires massive amounts of information and, to an extent, training through a large number of individuals. This training then inevitably relies on (and possibly even creates) personal data in the sense of the GDPR, which then close the loop to data protection law. This individual doctrinal construction on the one hand and collective technical functioning on the other leads to conflicts that data protection law may not be able to resolve (further reading here, p. 37).

## Information and Transparency

Regardless of the lively discussion about explainable AI or the right to explanation provided in the GDPR, in order to exercise their rights, data subjects first require information about the processing of their own personal data. The training of ML-models (first step) is a processing operation subject to authorisation under the GDPR if personal data are processed. The broader and more diverse the data basis, the more likely it is that personal data were also processed. From what we know about ChatGPT’s training data, the model was trained by collecting data from various sources on the internet, although we do not know exact sources. Given the sheer quantity, it appears impossible to identify and inform individuals of the processing, or to make a statement with regard to individual personal data processing. Rather, it can be assumed that personal data found on the internet was processed by the model.

This thus effectively rules out compliance with the data subject’s right to information provided in Art. 13 GDPR, which is tailored to protecting individual information. Rather, the example illustrates that LLMs like ChatGPT, and possibly also other generative AI models that create content, do not only affect at an individual level, but quasi-universally. However, said quasi-universal transgression indicates a fundamental mismatch between data-guzzling models like ChatGPT and the individual protections of data protection law (see further argumentation here, p. 47). Ultimately, this universality means that other data subject rights such as the right to rectification (Art. 16 GDPR) or the right to erasure (Art. 17 GDPR) exist on paper but cannot be enforced. The nearly unlimited scraping of (personal) data from the internet creates a collective dimension that goes beyond individual harm. Predictive models exploit collective data bases provided by millions of users, who have no control over it, nor any possibility to exploit their own data.

## Lack of Legal Basis

In addition to this general problem of the design of EU data protection law, ChatGPT seems to lack a suitable basis for authorising data processing altogether. In the case of publicly available data used to train ML-models, the legal basis of legitimate interest is usually invoked.

Art. 6 (1) f GDPR provides that processing is lawful where it is necessary for the purposes of pursuing the legitimate interests of the controller or by a third party, except where such interests are overridden by the need to protect the interests or fundamental rights and freedoms of the data subject. The broad wording of legitimate interests extends the understanding of legitimacy to cover every legal, economic, or idealistic interest, excluding only hypothetical and public interests. Hence, interests are legitimate when they are following other norms of data protection law or the legal system in general. The determination of the legitimate interest therefore boils down to a balancing of interests between the data processor and the data subject. All these factors must be interpreted in the light of the principles of data protection law. At the least, the aforementioned principle of data accuracy speaks for the interests of the data subjects concerned.

Furthermore, the context is crucial for the protective aspect of privacy and data protection. Even if data is publicly available, for example on the internet, made public by the data subject themselves, this does not entirely diminish the legitimacy of the data subject’s interest in data protection. Arguably, the typical internet user does neither expect nor intend their data to be used as training material for LLMs. The training of the model is a secondary purpose. In the vast majority of cases, publicly available data was likely not meant to provide a data learning set basis for financial benefit of LLM providers. Hence, the use of publicly available data constitutes a breach of contextual privacy.

The broad impact of this assessment must be considered. If many internet users are indeed affected while a single actor retains unilateral control over monetization through other people’s data, we observe yet another considerable power asymmetry in informational capitalism.

Data protection is always also a limitation of power. If we take the GDPR’s goals seriously, assuming that ChatGPT’s operator OpenAI holds a legitimate interest in processing these heaps of data does not seem particularly convincing de lege lata. Moreover, in the light of the entire legal order, potential copyright infringements (see in context of generative AI artworks here) must also be taken into account, which could also diminish the company’s legitimate interest.

Even if one considers OpenAI to have a legitimate interest as a suitable basis for data processing, this cannot apply to the processing of special categories of personal data of Art. 9(1) GDPR. The mass scraping of data from the internet does not distinguish between different categories of data established in data protection law: personal, non-personal, sensitive etc. This is not surprising, because the context of the data is initially irrelevant for its purpose of creating the broadest possible training base.

## Incorrect Processing of Personal Data

Further, the Italian DPA criticized a potential breach of the principle of data accuracy established in Art. 5 (1) d GDPR, because the information presented by ChatGPT does not always correspond to the actual data. LLMs function as predictive models In other words, LLMs generate predictions of a sequence of words. It has been shown that they deliver information about individuals and their personal data. But predictions are different from traditional data protection harms, they do not breach or publish existing information about individuals. Instead predictions assign new information to data subjects via inferences. This impacts the autonomy of the individual as information about them is produced and processed on the basis of the exploitation of collective data without any influence on their part over the process or their informal representation. LLMs make this process visible and the information that ChatGPT creates could have a huge leverage effect, making it harder to adapt to legal requirements. It is also not necessary for the inferences to be wrong to affect the rights of the individual.

## Requirements for Minors

As indicated above, the Italian DPA also criticised that ChatGPT fails to verify the age of its users. The age verification requirements for minors should be the easiest to fix. Here, too, the details of the requirements for the “reasonable efforts” of those responsible to verify the age of users are disputed, but there are various possibilities.

## Data Protection Regulation as AI Regulation?

To conclude, the Italian DPA’s handling of ChatGPT shows that, when enforced, the GDPR is theoretically equipped to address some of the challenges of AI. However, the question arises as to whether a ban on corresponding technologies allows for a sufficient balance of interests without inhibiting the innovation of AI that is often invoked in legal policy. Initially, the primary beneficiaries of ChatGPT’s payment model are OpenAI and Microsoft, rather than the European single market, consumers, or average internet users. In addition, the example illustrates the ‘move fast and break things’ or ‘don't ask for permission, ask for forgiveness’ mentality of the big technology companies, which although recently receding, is still present.

The most practical relevant question is, will other DPAs follow? It seems that Italy’s move to temporarily ban ChatGPT has inspired other European countries to think about stronger actions as well. According to press reports, data protection authorities from France and Ireland have already contacted their Italian counterparts to learn more about the basis of the ban, Canada is investigating OpenAI as well.

In the end, it remains questionable whether data protection law is equipped to regulate the incredibly fast-paced development in AI. The GDPR in its current state is not able to address the kind of problems generated by LLMs. In addition to the overburdened individual-protective regulatory framework, there are enforcement deficits: ML-models pose a type of ‘victimless data protection violation’. It is simply impossible to identify the data subjects concerned. Solutions should, therefore, also be sought outside data protection law: the regulation of data infrastructures, experimental regulatory models such as regulatory sandboxes and collective legal protection mechanisms. The EU’s proposed AI Act offers approaches for this, but has considerable potential for improvement.
