# Subsumio — Faktenblatt für das Website-Audit (Stand 17.09.2026)

Markt: NUR Österreich (AT). Keine Aussage zu Deutschland oder der Schweiz, keine "DACH", keine "3 Jurisdiktionen".
Recht: ABGB, ZPO (öst.), EO, UGB, RAO (§ 9 Abs. 2 Verschwiegenheit, § 10 Doppelvertretung), RATG/AHK (Honorar), BAO §§ 131/132 (Aufbewahrung 7 Jahre), DSGVO, RIS als Rechtsquelle.
FALSCH für AT (deutsches Recht/Begriffe): BRAO, BORA, beA, RVG, GoBD, DATEV als Kernintegration, BGB, "Klageerwiderung" (AT: Klagebeantwortung), BGH, § 520 ZPO als Berufungsbegründung (deutsch), "Rechtsanwaltskammer München" usw.
Anrede: durchgehend Sie-Form. Jede Du-Form ("du", "dein", "deiner", "kannst", Imperative wie "Hör auf", "Fang an", "Starte") ist ein Fehler.
Benennung im Produkt: "Assistent" (nicht Copilot, nicht Brain Copilot), "Kanzleiwissen"/"Wissensbasis" (nicht Brain, nicht SuperBrain als UI-Begriff — die Seite /superbrain darf den Namen als Produktnamen führen), "Übersicht" (nicht Dashboard/Cockpit), "Akten", "Fristen", "Posteingang", "Rechtsrecherche".
Echte Seitenleiste des Produkts: Übersicht, Akten, Fristen, Posteingang, Rechtsrecherche, Assistent; Gruppen: Mandate & Beteiligte, Termine & Aufgaben, Dokumente & Wissen, Benutzerverwaltung, Plan & Abrechnung.
Preise (einzige Wahrheit): Solo 249 €/Monat (1 Nutzer), Kanzlei 1.499 €/Monat (5 Nutzer inkl.), Enterprise auf Anfrage. 14 Tage Test, keine Kreditkarte. Alles andere (Community, Pro 890 €, Team 1.290 €, Enterprise 1.890 €, "20 % Jahresrabatt") ist veraltet und falsch.
Benchmark: 99,8 % Recall@8 auf LongMemEval (500 Fragen) ist der einzige belegte Wert (Methodik-Seite). Er misst Retrieval, nicht Antwortqualität. Andere Zahlen ohne Quelle sind verdächtig.
KI-Modelle: keine Modellnamen-Versprechen, die nicht belegt sind (GPT-5, "besser als GPT-4o", DeepSeek-Scores, Qwen-Prognosen sind verdächtig und zu melden).
Zertifikate: SOC 2 / ISO 27001 sind NICHT vorhanden ("geplant"/"Vorbereitung" ist als Vertrauensbeleg ungeeignet — melden).
Integrationen mit Code-Beleg: DocuSign, E-Mail-Postfach per IMAP (seit 17.09.2026: `src/lib/email/imap-sync.ts`, Abruf alle 5 Minuten, nur lesend; Versand über SMTP des Postfachs) sowie .eml/.msg-Upload, WhatsApp Business, Word-Add-in (Projekt `word-addin/` mit Manifest), SSO/SAML über WorkOS (Enterprise). DocuSign: `src/lib/docusign.ts` + Routen. OHNE Beleg: webERV-Anbindung, RA-Micro-Import, BMD/RZL-Export — melden.
Hosting: EU-Cloud (Hetzner) oder On-Premise (Enterprise).
Technik-Jargon, der in Anwaltstexten nichts verloren hat: Recall@8, Embedding, Vector, BM25, Graph, Engine, Pipeline, Slug, Frontmatter, RAG, Token, LLM-Namen. Auf /docs und /benchmark-methodology ist Technik erlaubt.
