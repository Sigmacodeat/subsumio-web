---
title: >-
  Verfassungsblog — The Paradox of Efficiency: Frictions Between Law and
  Algorithms
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2022-04-02'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: https://verfassungsblog.de/roa-the-paradox-of-efficiency/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
---

# The Paradox of Efficiency: Frictions Between Law and Algorithms

On the 13th of January 2022, a Spanish Administrative court ruled in favour of algorithmic opacity. Fundación Civio, an independent foundation that monitors and accounts public authorities, reported that an algorithm used by the government was committing errors.1) BOSCO, the name of the application which contained the algorithm, was implemented by the Spanish public administration to more efficiently identify citizens eligible for grants to pay electricity bills. Meanwhile, Civio designed a web app to inform citizens whether they would be entitled for this grant.2) Thousands of citizens used this application and some of them reported that, while Civio’s web app suggested they were eligible, the aid was denied. On this basis, Civio requested BOSCO’s source code from the Transparency Council, yet the petition was declined. In response, Civio decided to take the case to court, which resulted in a ruling denying public access to the source code on the grounds of security. The ruling is currently under appeal.

This example clearly exposes the paradox of efficiency: the implementation of algorithmic systems for the sake of efficiency that end up being inefficient, due to unforeseen issues when installing the system in real life, such as bugs, errors, or biases. Moreover, we claim that this paradox leads to friction between current legal frameworks and algorithms.

## Demystifying Algorithmic Efficiency

An algorithm is defined as a finite sequence of instructions to solve a problem. Although we implement different types of algorithms in our daily life unwittingly (culinary recipes, directions on the street to get somewhere), computational algorithms have been at the forefront of debate in recent years. Governments across the European Union (EU) have implemented this type of algorithm in different sectors, such as in law enforcement, welfare, educational or healthcare systems. The implementation of these types of algorithms is usually justified for the sake of efficiency, providing high-quality and effective services to citizens. However, do algorithms facilitate people’s lives or the opposite? Does algorithmic efficiency speed up bureaucratic procedures?

In the case of BOSCO, the algorithmic procedure is jeopardising citizens’ rights despite its efficiency. This algorithm is based on a set of rule-based instructions that reflect the policy criteria to obtain financial support. For instance, if households with more than 5 members were eligible, this can be translated into:

# RULE 1:
IF (applicant’s household size > 5) THEN eligible
ELSE not eligible

Or individuals whose salary was less than 12,000 EUR per year:

# RULE 2:
IF (applicant’s annual salary < 12000 EUR) THEN eligible
ELSE not eligible
These rules are combined considering more complex scenarios. If individuals’ household’s size is bigger than 4 and salary is less than 15,000 EUR, then the rule is algorithmically written as:

# RULE 3:
IF [(applicant’s household > 4) AND (applicant’s annual salary < 15000 EUR)] THEN eligible
ELSE not eligible
After setting the rules, the algorithm receives inputs and prints outputs. The input of rule-based algorithms is a set of values, which in the case of BOSCO is the applicant’s or family income, the household size or how many minors are living in the household, among others. Then, these values are evaluated through the rules and the algorithm outputs the decision (eligible or not eligible). For example, if an applicant earns 14,459 EUR per year and lives with six members of her family, the algorithm will output that she is eligible for financial aid (see Rule 3).

Algorithms are commonly considered to be more efficient and intelligent than humans by governments and private actors. These adjectives are usually utilised to justify the digitalisation of processes. In the case of BOSCO, the algorithm can process millions of applications per day, which relieves human labour. However, algorithms are coded by humans and may contain glitches. For instance, Rule 3:

# RULE 3_ERROR:
IF [(applicant’s household < 4) AND (applicant’s annual salary > 15000 EUR)] THEN eligible
ELSE not eligible
In this case, the sign in both expressions has changed, which implies that now households of 3 people or less with a salary greater than 15,000 EUR will be eligible. This error could lead to unintended consequences, leaving vulnerable families and individuals at risk of default, which could mean leaving them without heating in winter.

This case, though a simple example for illustrative purposes, highlights the paradox of efficiency, which is the faith that governmental actors have in the efficiency of algorithms. As Deborah Stone claims ‘Efficient choices are ones that result in the largest benefit for the same cost, or the least cost given the benefit’.3) Therefore, one could conclude that algorithmic systems make governments’ choices more efficient given that they process information faster than humans (largest benefit) and are cheaper than human labour (for the least cost). Yet implementing an algorithm in real life is the opposite of efficient. The algorithmic lifecycle can turn into a wearisome task, by digitising the procedure, gathering data, cleaning data, training the algorithm, evaluating the algorithm, implementing the algorithm in the system, testing the performance in real life, amongst other tasks. Moreover, algorithmic errors, such as in the case of BOSCO, can also impact on efficiency. In this case, the algorithm needs to be accounted for by independent bodies, reducing efficiency further. Overall, algorithmic efficiency must be called into question and should be demystified.

When Civio reported to the court the incoherencies detected through the web application, they were asking for the source code to be opened and then audited. In doing so, they could have checked whether algorithmic rules, as the ones we have seen above, reflected the legal framework and official criteria to obtain a benefit for paying electricity bills. However, this case clearly shows friction between law and algorithms: while citizens should have a right to know whether the decision has been taken by an algorithm, courtrooms rule in favour of algorithmic opacity.

## Citizen’s Rights and the Rule of Law

Legal disciplines have been using algorithms since their very beginning. Lex posterior derogat legi priori and lex specialis derogat legi generali4) are two traditional examples of legal decision-making where an algorithm is used. Thus, the use of algorithms in the legal realm is not an issue, what is at stake are the conditions of their applicability.

The case law that has had the opportunity to analyse the application of algorithms so far has approached the issue under the perspective of the parties’ rights. In the case decided on 10 September 2018 by the Italian Regional Administrative Court for Lazio, the applicants were teachers who challenged the mobility rules approved by the Italian Ministry of Education, University and Research; rules that determined how the vacant positions in schools around Italy would be assigned to applicants. From the three allegations included in the claim, one was related to the use of an algorithm in the selection process, which entailed the absence of human intervention in the proceeding:

“The [ministerial] plan was not accompanied by any administrative activity but was entrusted to an algorithm, still unknown, as a result of which the transfers and assignments were made, in clear breach of the fundamental principle of the instrumental use of information technology in administrative procedures. There was therefore a decision-making activity without prior investigation and procedure. The algorithm has essentially replaced the investigation committed to an office and an officer.”

According to the position of the claimants, the result of an unknown algorithm produced a breach of Article 8.1 of the European Convention of Human Rights, protection for family and private life, as the algorithm assigned the teachers workplaces that were far away from their residences and family life. The Italian administrative court accepted the claim and rejected the use of the automatic proceeding:

“[T]he institutes of participation, transparency and access, in short, of the relationship of the private individual with the public authorities cannot be legitimately weakened and compressed by supplanting human activity with impersonal activity, which is not activity, i.e. the product of human actions, that can be carried out by applying computer or mathematical rules or procedures.”

In the Netherlands, the The Hague Court of Justice analysed the legality of the usage of an algorithm in the Dutch System Risk Indication, a legal instrument used by the government to prevent and combat fraud in the field of social security and income-dependent schemes, tax and contribution levies and labour laws. The sentence, dated 5 February 2020, stated that the automatic system was in conflict with Article 8.2 of the European Convention on Human Rights on privacy: transparency, with a view to accountability, is relevant because the use of the model entails the risk of (unintended) discriminatory effects, which cannot be known by the person whose personal data is in use. This violates the principle of transparency applicable to management of personal data.

Again, the parties’ rights were the main issue subject to analysis in a case from the Ordinary Court of Bologna, Italy, dated 27 November 2020. In this case, the claim was related to the inequality produced by the algorithm between Deliveroo riders, a well-known delivery company. The software determined the riders’ labour conditions based on parameters whose weight was unknown to the parties. The court declared that the usage of the software was discriminatory due to the different hours when the riders could access the application to choose slots for their work. The so-called “Self Service Booking” (SSB) tool established three different time slots (Monday at 11:00 am, 15:00 pm and 17:00 pm) but did not disclose why the workers were included in one of the groups, leaving the latter two slots less opportunities to work.

Using a different approach, in the BOSCO case, the argument is that what is at stake with algorithmic transparency is the core of our legal system: the rule of law. The application of the rule of law becomes impossible if the software source code inhabited by the algorithm is not accessible.

Civio’s arguments also point out that during the last centuries, states have configured their legal existence using natural languages. This type of language has been used to formalise in writing their constitutions and their legal texts. Now we are witnessing how the language of states is changing. Software is not only being included universally as a tool for decision-making processes, but also as a framework for reality. If natural language produces institutions,5) software configuration is providing the boundaries for possible worlds: what does not comply with the categories designed by the software is out of existence. Concurrently, epistemology is now mediated by these possibilities, from which it inherits its bias, its bugs, and its features. Information and Communication Technologies are not only a tool to manage the world, but also the glasses used to inspect it, and to produce the models that serve as representations (and substitutions) of reality. These algorithmic features generate friction between current legal frameworks.

The impossibility of accessing the source code of algorithmic decision-making has several relevant implications: it affects the ability to check if the final result has been obtained via biased reasoning that does not comply with the law, as, for example, a facial recognition system could be biased against specific ethnical minorities. Without reading the source code, neither the categories nor the boundaries used to difference concepts that the developers have used can be analysed in a rigorous way. A black box system, where the rules of determining why one option is preferred to another are not cognizable, affects the capacity of the parties to appeal against a decision. Without the knowledge on how the decision-making process is built, an appeal would not be able to complete its reasoning. Which was the rule that was applied? What are the parameters used as building blocks of the decision argumentation? What is the specific weight given to each parameter? Which are the rights in confrontation, if any? Just imagine any case related to the limits of the freedom of press,6) where the parameters could be related to the content of the news, the celebrity status of the persons involved, if they make a living selling their image, their presumed addiction to cocaine, the hidden place where the photographer took the images of the person leaving a narcotics anonymous meeting… For the parties to produce their reasoning when appealing any decision, the information to make the reasoning process transparent must be available. It is evident that this availability does not exist when the source code of the algorithm is not readable.

Finally, the invisibility of the source code does not only affect the rights of the parties involved in an administrative or judicial proceeding. It also affects the checks and balances designed in the constitutional norms that serve as reciprocal controls between the powers of the state. How can the judiciary control whether the executive exercises it power in accordance with the law, if its decisions and acts are built and executed by an opaque algorithm? Therefore, source code and algorithmic transparency are also a matter of constitutional law because they affect the relationships between the different powers of a state.

## Algorithmic Practices contra legem

There is a clear friction between law and algorithms that exposes the paradox of efficiency. States implement algorithmic systems for the sake of efficiency without being aware that technology should not propose nor develop solutions contra legem. Technology, as we have long known, is not neutral but is charged with ideology.7) Civio, through the BOSCO case, is trying to demonstrate not only how these technologies affect individual rights, but also their deeper implications in the social and political spheres, contravening the rule of law due to their obscurity in a land where light must reign.

 References[+]

 References  

 &#8593;1 Disclaimer: This author is the lawyer defendant of Fundación Civio in BOSCO’s case, herein commented.

 &#8593;2 See: https://civio.es/bono-social/ (Last accessed: March 10, 2022).

 &#8593;3 Stone, D.A., 1997. Policy paradox: The art of political decision making (Vol. 13). New York: Norton.

 &#8593;4 Posterior laws override prior laws, specific regulations override general ones.

 &#8593;5 Searle, J.R., 2010. Making the Social World. The Structure of Human Civilization. Oxford: Oxford University Press.

 &#8593;6 Parameters extracted from the European Court of Human Rights, case of MGN Limited v. the United Kingdom, Application no. 39401/04, 18 January 2011.

 &#8593;7 Winner, L., 1978. Autonomous Technology. Technics-out-of-Control as a Theme in Political Thought. Cambridge, Massachusetts: The MIT Press.
