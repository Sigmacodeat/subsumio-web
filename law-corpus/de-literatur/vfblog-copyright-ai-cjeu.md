---
title: >-
  Verfassungsblog — Copyright, AI, and the Future of Internet Search before the
  CJEU
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2025-07-17'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: https://verfassungsblog.de/copyright-ai-cjeu/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
content_hash: "57746809d3c04e5d"
---

# Copyright, AI, and the Future of Internet Search before the CJEU

It is a busy time in AI and copyright law. Alongside a growing body of academic analysis and media coverage, real-world litigation, possible regulatory measures, and first lower court rulings are now beginning to shape the field.

With Like Company v Google, the first groundbreaking AI copyright case is now headed to the Court of Justice of the European Union (CJEU). In this case, a Hungarian press publisher challenges Google and its Gemini chatbot for reproducing and communicating its editorial content without authorisation.

The Court’s decision will establish the legal framework for AI’s relationship with copyright and press publishers’ rights across the EU. It will potentially reshape how generative AI systems can or cannot lawfully access, process and reproduce journalistic and other protected content. This may even fundamentally affect the economic and technical architecture of future AI development.

In this piece, I will not only try to answer the questions the CJEU will have to grapple with. I also argue that the legally correct answers expose a very serious policy problem: namely, the lack of coherent mechanisms to ensure appropriate remuneration for rightsholders. A problem that requires immediate attention by European legislators.

## Case background

In Like Company v Google, a Hungarian press publisher sued Google Ireland after its Gemini chatbot generated a detailed summary of one of its articles. That piece described a celebrity’s plan to introduce dolphins to Lake Balaton; when prompted by a user, Gemini reproduced substantial portions of the protected content. The Budapest court referred four questions to the CJEU to determine whether such AI-generated responses constitute copyright infringement through unauthorized reproduction and communication to the public under EU copyright directives.

This case is not only the first case at the intersection of AI and copyright to reach the CJEU. It also reflects a broader shift that could reshape much of the information ecosystem. Generative AI is now built into search engines like Google, Bing, or ChatGPT Search and Perplexity. Instead of showing lists of websites, they increasingly offer direct answers or summaries. This redirects user traffic. Instead of clicking on links, users may increasingly only read the AI-generated summaries. Hence, this new search model threatens the advertising revenue of content publishers, which depends on users actually visiting their website – and not just reading AI summaries of it.

To grasp the extraordinary significance of this case, particularly as Large Language Models (LLMs) increasingly generate search summaries, we need to look at the three main issues at the intersection of AI and existing copyright law: model training, the model itself, and the model’s output.

First, training an AI model on copyrighted content usually requires copying that content into a data set, formatting it, and processing it during the training and testing procedure. Like Company claims that Google used its protected content for training without a licence. Generally, this is illegal unless a specific copyright exemption applies that allows such training. In the US, such activities might fall under the general fair use defense, as two lower courts have ruled. In the EU, by contrast, a specific legal framework exists: the text and data mining (TDM) exceptions in the Copyright in the Digital Single Market (CDSM) Directive. However, there is ongoing debate whether these exceptions apply to the training of generative AI models at all. The CJEU will now have to decide this debate, and with it the fate of advanced AI training in the EU.

Second, once the model has been trained, another question arises: does the model itself qualify as a potentially illegal “copy” of the protected training material under copyright law? While AI models currently do not store images or text like a computer hard drive, they can reproduce exact training content when prompted. A phenomenon known as memorisation and model inversion attacks. Some scholars reasonably argue that the model itself may qualify as a copy under copyright law. The CJEU will, however, likely be able to bracket this tricky question.

Finally, the model’s output may resemble copyrighted works. This is particularly likely if the model was trained on copyrighted material. In such cases, the output itself may (again) violate copyright.

Overall, the CJEU case focuses on two of these issues: the use of copyrighted material for AI training, and the copyright status of AI-generated output.

## The CJEU case

Against this background, the CJEU has a chance to clarify the TDM framework in the EU and its application to AI. Hence, the case’s relevance goes well beyond the dispute between Like Company, the Hungarian press publisher, and Google about an unauthorised summary of a dolphin-relocation-related article.

The CJEU has been asked by the referring court (Budapest Környéki Törvényszék) to answer four questions. Two of the questions directly concern AI training. The other two questions address the output of the LLM. The CJEU must decide whether output that partially replicates protected press content, qualifies as reproduction or communication to the public, considering the probabilistic nature of AI content generation. It must also assess whether the TDM exception applies even in the absence of a license.

More specifically, Article 15 of the CDSM Directive introduces a new related right for press publishers to protect their online publications. This right gives them control over the digital use of their press content by information society service providers, particularly on platforms, such as Google or its Gemini chatbot. It covers reproduction and communication to the public of press publications or parts thereof. However, Google and other service providers remain free to use individual words or very short extracts without a license or exemption. The core issue, then, is how this right applies to summaries by AI chatbots, in contrast to classical hyperlinks in search engines replies. This precisely reflects the major shift from traditional search engines to AI-generated overviews.

## Training and reproduction: interpreting Article 2 of the InfoSoc Directive

While I do not possess a crystal ball to predict the CJEU judgment, unfortunately, the following answers seem possible and well justified. We shall look at them in the order in which they come up in AI training.

One question (more precisely: Question 2 posed by the referring court) is whether training an LLM-based chatbot count as reproduction under Article 2 of Directive 2001/29 (the so-called InfoSoc Directive), given that training involves observing and matching linguistic patterns. My answer to this is: yes.

Article 2 of the InfoSoc Directive fully harmonises, and contains an autonomous concept of “reproduction”. It also covers partial and temporary copies. The CJEU held that even eleven words may qualify as a reproduction if they reflect originality (Infopaq case).

In my view, training an LLM on press articles typically constitutes reproduction under Article 2 InfoSoc Directive because it usually involves copying protected expression into the system’s memory for analysis, even if not stored permanently. The CJEU has confirmed that even temporary, partial, and digital reproductions, such as those on a USB stick, can fall under reproduction rights when they contain original content.

The fact that the training involves “observing and matching patterns,” mediated through Natural Language Processing (NLP), does not change this. Reproduction may take different formats, and the purpose is irrelevant (except for the exceptions). One might ask whether training that involves only NLP analysis – without making any type of digital copies – would still count as reproduction. Is the right to mine merely a right to read – similar to reading a book?

This, however, is the wrong question to ask. In LLM training, text is split up into tokens and represented as numbers (more specifically, as high-dimensional vectors). The model then uses this mathematical representation, to generate new text when prompted by a human user. Whether these technical and mathematical steps count as separate reproductions cannot be fully answered here. For this to happen, the content needs to be at least temporarily copied to be broken up into tokens and converted into numbers. That process which involves “observing and matching of patterns” essentially captures the economic value of the work. It allows the system to reproduce it. Therefore, LLM training usually processes training data in a way that counts as “reproduction” under copyright law.

## Generative AI Training as text and data mining under Article 4 CDSM

The next question (Question 3 of the referring court) is whether such training falls under the exception in Article 4 CDSM Directive, which permits text and data mining (TDM) of lawfully accessible works. In my view, the answer is yes.

This clearly is the bombshell question. If the TDM exception does not apply to LLM/AI training, AI providers are in very deep copyright trouble.

Article 4 CDSM Directive allows reproductions for commercial text and data mining if the source content is lawfully accessible and not subject to a machine-readable reservation. Thus, if the publisher has not explicitly opted out, reproductions for AI training purposes fall under this exception – if, and only if, generative AI training qualifies as text and data mining in the sense of Art. 4. Again, this is contested in academia.

Art. 2(2) CDSM defines “text and data mining” as “any automated analytical technique aimed at analysing text and data in digital form in order to generate information which includes but is not limited to patterns, trends and correlations.” To me, it seems fairly clear that generative AI training clearly fits this definition. It is an automated analytical technique, it analyses text and data, and it does that to generate information (directly, encoded in the model’s mathematical framework and indirectly, by enabling specific output). This open definition does not limit mining to non-generative AI, though transformer models (born in 2017) likely were not specifically considered by the CDSM legislators. Yet, Recital 18 CDSM confirms that text and data mining can lead to the “development of new applications or technologies,” exemplified by generative AI. Art. 53(1)(c) and Recital 105 AI Act arguably also take this as a given.

Admittedly, one could read Art. 4 and 2(2) CDSM narrowly, since generative AI training is more extensive than traditional TDM, and its output may commercially compete with the copyrighted works. But, in my view, these valid concerns are better addressed through new policy tools, such as a new compensation scheme, as discussed below. Ultimately, they do not speak against the applicability of the TDM exception to generative AI training.

## Communication to the public: AI chatbot output under Article 15 CDSM and InfoSoc Directive

The next question, captured in Question 1 of the referring court, concerns the output generated by an LLM-based chatbot. Specifically, the question is whether a chatbot’s response that includes text partially identical to protected press content and exceeds the “very short extract” threshold under Article 15 CDSM Directive qualifies as a communication to the public. This assessment must be made under both that directive and Article 3(2) of the InfoSoc Directive. Further, does the generative nature of the chatbot’s output, merely predicting the next word based on observed patterns, affect that classification?

My answer is, again, yes to the first, but no to the second subquestion.

Art. 15(1) CDSM grants press publishers rights to reproduction and communication to the public by referring to Art. 2 and 3(2) InfoSoc Directive. According to the definition, there needs to be 1) communication to 2) a public, and the public must be able to access the work 3) when and from where they want. The CJEU has clarified that giving access generally counts as communication; and that the public is “an indeterminate number of potential recipients […] involving a fairly large number of people.” Also, 4), a “new public” must be addressed, either through a different technical way than before or to a different audience.

In my view, a chatbot that displays protected press content qualifies as a communication to the public under Article 15(1) DSM and Article 3(2) InfoSoc Directive. It makes the content available to an indeterminate public – anyone using the AI system at a time and place of their choosing. The non-deterministic nature of AI output may differ from what the user expects. Sometimes it reproduces a work only after several prompts – or not at all. But the fact that generative AI is less reliable than other means of getting information (e.g., traditional search or databases) does not exempt it from copyright law. The chatbot also generates and delivers the content through a new technical means, which satisfies the CJEU’s “new public” criterion. The probabilistic and predictive nature of AI output is not decisive. Under EU law, what matters is the effect of the act, not the method used (with the only exception being the specific requirement of a “new technical means,” which is fulfilled here).

## Attribution of reproductions in chatbot outputs under Article 15(1) CDSM and Article 2 InfoSoc Directive

The final question (Question 4 of the referring court) asks whether Article 15(1) CDSM Directive and Article 2 InfoSoc Directive imply that when a user asks an LLM-based chatbot using wording that matches or refers to a press publication, and the chatbot responds by showing part or all of that publication’s content, this reproduction counts as attributable to the chatbot service provider. Again, my answer is yes.

When a chatbot reproduces part or all of a press article in response to a user prompt, the reproduction is attributable to the service provider, not (only) the user. It is the provider’s system that fixes and delivers protected content. Whether it fetches the material externally or generates it internally, this act triggers the reproduction right under Article 15(1) DSM and Article 2 InfoSoc Directive. Even making user-generated content available, without any content generated by a platform itself, can constitute a communication to the public. Importantly, no applicable exception justifies AI output when it exceeds a very short extract; the TDM exception itself does not cover the output.

## Policy options

This legal result presents a vexing policy problem. Unlike older forms of TDM, generative AI output may, in certain contexts, economically substitute the works it was trained on – for example in Internet search concerning news. If the Court confirms the above reasoning, the TDM exception would apply to AI training. However, content creators would not receive any remuneration unless it is specifically agreed by contract. Thus, EU policymakers arguably face the task of recalibrating the TDM framework in the upcoming revision of the CDSM Directive. A review process is already on its way.

Several policy options are available. One option would be to reverse the current default by introducing a necessary opt-in mechanism under Article 4 CDSM for commercial AI, requiring express rightsholder consent for TDM instead of permitting TDM unless expressly reserved.

Alternatively, the exception could be refined to differentiate between types of commercial uses, requiring opt-in only for general-purpose AI or certain applications (such as AI for entertainment), while retaining the opt-out format for particularly socially valuable contexts, such as commercial medical AI systems.

The third and, in my opinion, most attractive option is a clearly defined and administrable remuneration mechanism. It could work either through a statutory royalty scheme or a lump-sum levy paid to collective management organizations, based on verifiable parameters such as the type of output or the commercial availability of the resulting AI system. Otherwise, artists and creators may indeed be left behind. The future of search, and creative remuneration, depends on these policy choices, for better or worse.
