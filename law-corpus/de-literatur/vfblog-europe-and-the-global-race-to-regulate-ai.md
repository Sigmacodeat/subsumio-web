---
title: Verfassungsblog — Europe and the Global Race to Regulate AI
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2023-11-10'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: https://verfassungsblog.de/europe-and-the-global-race-to-regulate-ai/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
---

# Europe and the Global Race to Regulate AI

At last week’s Global AI Safety summit at Bletchley Park (the base of UK code breakers during the second world war), US Vice-President Kamala Harris said pointedly: “Let us be clear: when it comes to AI, America is a global leader. It is American companies that lead the world in AI innovation. It is America that can catalyse global action and build global consensus in a way no other country can.”

Where does that leave the EU’s ambition to set the global rule book for AI? This blog explains the complex “risk hierarchy” that pervades the proposed AI Act, currently in the final stages of trilogue negotiation. This contrasts with the US focus on “national security risks”, where there are existing federal executive powers that can compel AI companies. We point out shortcomings of the EU approach requiring comprehensive risk assessments (ex ante), at the level of technology development. Using economic analysis, we distinguish exogenous and endogenous sources of potential AI harm arising from input data. We are sceptical that legislators can anticipate the future of a general purpose technology, such as AI. We propose that from the perspective of encouraging ongoing innovation, (ex post) liability rules can provide the right incentives to improve data quality and AI safety.

## Regulatory competition

There is global anticipation, and excitement among investors, that AI will change the way we live and offer potentially enormous benefits, in education, energy, healthcare, manufacturing, transport. The technology is still moving rapidly, with advances in deep reinforcement learning (RL) and the application and tuning of foundation models into a variety of contexts beyond their original training sets.

The arrival of consumer facing AI, exemplified by the meteoric rise of ChatGPT (a large generative language model launched by OpenAI in November 2022) have made the workings of machine learning models more visible and led to acute policy concerns about safety, bias, personal data, intellectual property rights, industry structure, and crucially about the black box nature of the technology: the lack of explainability and interpretability of outcomes.

It is in this context that the big economic blocks are trying to identify and mitigate risks, shape a global policy agenda and compete for setting a regulatory blueprint. The Declaration adopted at the global AI safety summit on 1-2 November (at the UK’s Bletchley Park) offers worthy commitments “to intensify and sustain our cooperation”. Anticipating the summit, the US administration issued an executive order on Safe, Secure and Trustworthy Artificial Intelligence building on voluntary commitments extracted June 2023 from seven key US firms: Amazon, Anthropic, Google, Inflection, Meta, Microsoft, and OpenAI. China already has adopted Interim Measures for the Management of Generative Artificial Intelligence Services (that came into effect on 15 August 2023).

However, it is the European Union that is most advanced in adopting comprehensive and detailed legislation, with an ambitious AI Act that is currently in final trilogue negotiations between the Commission, the Council of member state governments and the European Parliament. The AI Act is expected to become law before the European Parliament elections in June 2024.

The EU’s new rules are complex and will affect science and technology policy globally, even if other jurisdictions decide to go down different paths. The AI Act cannot be avoided by anybody “placing on the market, putting into service and use” artificial intelligence systems in the EU. However, unrealistic ex ante requirements assessing risks at the development stage may also impede innovation and concentrate investments in more lenient jurisdictions.

## The EU’s risk based classification of all AI systems

The European Union has conceived of AI as a potentially high-risk technology that needs intervention before its uses and usefulness can be allowed to be explored at scale. Borrowing concepts from product safety legislation, the AI Act will establish obligations and duties for AI operators proportionate to the intensity and scope of the harm that AI systems can generate. The regulation follows a risk-hierarchy.

First, the AI Act singles out certain AI ‘practices’ that will be prohibited upfront. These practices include (1) AI systems deploying subliminal techniques beyond a person’s consciousness to materially distort a person’s behaviour, (2) AI systems that exploit vulnerabilities of a specific group of persons due to their age, physical or mental disability, (3) unjustified or disproportionate social scoring systems used by public authorities and (4) the use of ‘real-time’ remote biometric identification systems in publicly accessible spaces for the purpose of law enforcement, unless and in as far as such use is strictly necessary.

Second, high-risk AI systems are subjected to comprehensive risk management duties, taking into account “the generally acknowledged state of the art” (Art. 9(3)) throughout their entire lifecycle. Providers of high-risk AI systems have to undergo a conformity assessment procedure and must register in an EU AI database prior to entering the market. High-risk AI includes systems that are safety components of products or systems, or which are themselves products or systems subject to existing sectoral safety legislation (for example machinery, medical devices or toys). Further, systems intended to be used in critical areas, including biometric identification and categorization of natural persons, management and operation of critical infrastructure, education, employment, access to essential private and public services, law enforcement and democratic processes are considered high-risk AI.

In response to the ChatGPT frenzy, drafters additionally added two other AI categories, namely ‘general purpose AI’ (GPAI) and Foundation Models (Hacker, Engel & Maurer 2023). GPAI is defined as an AI system intended by the provider to perform generally applicable functions such as image and speech recognition, audio and video generation, pattern detection, question answering, translation and others, and thus may be used in a plurality of contexts and be integrated into a plurality of other AI systems. GPAI that ‘may’ be used as high-risk AI or as a component of a high-risk AI system shall comply with the requirements established for such high-risk AI. This applies irrespective of whether the GPAI is put into service as a pre-trained model and whether further fine-tuning of the model is to be performed by the user of the GPAI.

Foundation Models, in the Parliament text, are “an AI system model that is trained on broad data at scale, is designed for generality of output, and can be adapted to a wide range of distinctive tasks”, a subset of general purpose AI. Even though they have no intended use, providers still have to identify, reduce and mitigate “reasonably foreseeable risks”. They have to file documentation, such as datasheets, model cards and intelligible instruction that allows “downstream AI providers” to understand the model, as well as offer a detailed summary of the use of training data under copyright law.

## Troubles with data quality

The logic of the product safety approach is to work backward from certain harms to measures that mitigate the risk that these harms materialise. However, we think applying this logic to AI carries certain dangers. Unlike for traditional technology, the core input of AI is data, which can be specific to contexts that may change over time or which can be manipulated.

The AI Act proposal does lay out explicit goals for data quality, such as that training, validation and testing data sets “shall be relevant, representative, free of errors and complete” (Art. 17(3)). These criteria, alone and in combination, however, are incompatible with core underlying statistical concepts in machine learning, and unrealistic. For example, a dataset could be considered complete if it contains only one feature for the entire population, all features of one subject, or all features of the entire population. In machine learning terminology the latter would be called ground truth. In the statistical sense, representativeness is related to completeness. A representative dataset reflects the moments (e.g. mean, standard deviation, skewness, etc.) of the distribution of the population, i.e. of a “complete” dataset. Finally, whether a dataset is error-free can be determined only if one has a good understanding of what the ground truth is, i.e. with access to either a complete dataset or a representative dataset.

Errors in input data uncorrelated to outcomes (e.g. random lens flare in image data) become critical in applications where inaccuracy is only acceptable within tight margins (e.g. self-driving vehicles), and much less so if AI is used as a complementary system that recommends actions to a human decision maker. Further, applications have varying tolerance for type I and type II errors. Consider the trade-off between freedom of speech and illegal content in content moderation systems. Avoiding type I errors (not removing illegal content) seems preferable to avoiding type II errors (removing lawful content). However, these prediction errors can only be classified if the ground truth is at least approximately known. This is, of course, close to impossible in many real-world settings, e.g. when freedom of speech is concerned.

## Input risks and liability rules

Rather than drafting impossible obligations on data quality that cannot work at scale and without bias, and impose potentially huge compliance costs, we suggest that the input risks, especially concerning data, and the relationship between AI system developers and deployers should be approached from a liability perspective.

We categorise input risks according to the underlying reasons that may impede data quality. In some applications the most adequate dataset may not exist yet, or a once adequate dataset is no longer up-to-date because the context changed over time. All these issues are exogenous; methods to collect adequate data may not exist yet, or the environment simply has changed, but the underlying reasons that make data quality suboptimal are not due to specific actions of any individual stakeholder. On the other hand, data quality may change because of strategic behaviour of market participants. For example, even a large language model that was trained on essentially all the information on the internet suffers from data quality issues. It can only work with information that someone has decided to make publicly available. As a result of such input biases, an AI system may produce outputs of insufficient quality.

For constructing a liability framework we therefore analyse data quality as a function of exogenous issues, such as cold start (underrepresented data), concept drift (when data becomes outdated), and data availability because of privacy concerns. At the other extreme, data quality can be understood as a function of endogenous issues, such as agents trying to “game the system”, for example with the AI equivalent of search engine optimization or adversarial attacks that inject biased/selected data.

Liability framework focused on AI inputs and deployment models

An example of one-shot deployment would be a computer vision system to recognize license plate details to manage access of cars to a parking garage. Once the system has learned how to detect license plates in pictures of cars, and how to decipher characters from license plates, there is little need to update underlying datasets because there will be little to no change in how license plates look in the medium to long run. For continuous deployment, we can think of a chat system connected to a large language model. For such a system to be truly useful, data needs to be updated relatively frequently, for example by incorporating user feedback or by adding new data points to the training set.

Clear liability rules will incentivise firms to invest in high-quality inputs, by regularly updating datasets or underrepresented subsections of datasets despite potentially high costs, or by investing in research and development to mitigate effects of biased input data. While the EU is proposing to adjust its liability rules with two Directives designed to complement the AI Act (Hacker 2023), they are an afterthought rather than the central institutional setting for making AI safe. Rules that govern responsibility when something goes wrong and define who needs to act, remedy and possibly pay can facilitate innovation in AI and rapid behavioural change in the notoriously difficult task of anticipating output risks.

## Recommendations

We suggest that placing too high a burden on technology developers (vis-à-vis deployers) may (a) give an advantage to larger firms who can shoulder the legal risk, and (b) slow down technological development in uncharted territory. That is, technological developments may be directed at applications for which the developer has low liability, either because most risk is borne by the deployer or because it is considered a low-risk application in the first place.

While AI providers should not be allowed to routinely avoid liability vis-à-vis downstream operators with contractual clauses, such as “we will not be liable to you under any theory of liability—whether based in contract, tort, negligence, strict liability, warranty, or otherwise—for any indirect, consequential, incidental, or special damages or lost profits”,  we suggest that there are significant differences between AI that gets deployed once (e.g. computer vision to recognize car license plates) and AI that is constantly (re-)deployed and developed (e.g. chatbots that complement humans in creative tasks). This matters for liability rules that may require firms to know in particular what their AI inputs were and how to retrain or retune systems to remedy breaches of existing laws.

The EU AI Act offers a blueprint for a comprehensive risk-based approach that seeks to prevent harmful outcomes ex ante, for all AI systems and before the event. Societies are right to regulate ex ante the development of unacceptably high-risk technologies, such as nuclear power. AI we argue is more like electricity – a general purpose technology. Rather than requiring detailed risk declarations, enlightened (ex post) liability rules can offer space for open source innovation (where European firms have particular strengths) and incentivise investment in high-quality model inputs.

 

Note

We are four unrelated academics who work in the same field but from very different disciplinary starting points. Inevitably, we sometimes get confused. We therefore decided to collaborate on this piece and let AI solve the issue of attribution. Authors should be cited in random order.

The argument in this blog is developed more fully in Martin Kretschmer, Tobias Kretschmer, Alexander Peukert, Christian Peukert, “The risks of risk-based AI regulation: taking liability seriously”, CEPR Discussion Paper DP18517, 10 October 2023; also available open access via ArXiv and SSRN.
