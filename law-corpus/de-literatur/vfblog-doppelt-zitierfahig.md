---
title: Verfassungsblog — Doppelt zitierfähig
type: literatur
genre: aufsatz
jurisdiction: de
work: Verfassungsblog
content_scope: full
version_date: '2021-06-10'
retrieved_at: '2026-07-18'
source: verfassungsblog-wp
source_url: https://verfassungsblog.de/doppelt-zitierfahig/
license: >-
  CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können
  abweichen). Namensnennung + Share-Alike erforderlich.
---

# Doppelt zitierfähig

Spätestens mit ihrer Erwähnung in den Fußnotenapparaten von Kommentaren, Handbüchern und höchstgerichtlichen Urteilen haben sich Wissenschaftsblogs als fester Bestandteil des juristischen Publikationssystems etabliert. Das Fach zeigt sich dennoch nach wie vor zurückhaltend gegenüber der Idee des freien Zugangs zu wissenschaftlichem Wissen. Eine empirisch-vergleichende Studie spitzt den Befund sogar noch zu: „The transition to Open Access of legal literature is in its infancy. Legal studies feature some of the lowest Open Access rates.“ Die tendenzielle Open Access-Skepsis der Rechtswissenschaften trifft dabei auf den Bedarf an öffentlichkeitswirksamen Medien zur tagesaktuellen Kommentierung rechtlicher und politischer Entwicklungen, um diese einzuordnen und wissenschaftlich zu begleiten. Hieraus erklärt sich im Wesentlichen der zunehmende Erfolg von Wissenschaftsblogs: Ihre Rezeption in der Wissenschaft und der breiten Öffentlichkeit steigt ebenso wie die Vielfalt an Angeboten. Die Corona-Pandemie hat diese Entwicklung noch beschleunigt.

Der Verfassungsblog und der Völkerrechtsblog arbeiten daran, diese Entwicklung weiter voranzutreiben. Ein wichtiger Schritt auf diesem Weg sind die Förderungen des Verfassungsblog-Projekts „Offener Zugang zu Öffentlichem Recht“ (OZOR) durch das BMBF und des Völkerrechtsblog-Projekts Wissenschaftsblogs als „Infrastruktur für digitale Publikationen und Wissenschaftskommunikation“ durch die Deutsche Forschungsgemeinschaft. Als erster gemeinsamer Projektertrag soll im Folgenden ein Workflow skizziert werden, mit dem Verfassungsblog und Völkerrechtsblog nicht nur den bibliothekarischen Katalognachweis und Langzeitarchivierung, sondern auch ihre dauerhafte digitale Zitierfähigkeit vermittels persistenter Webadressen – sogenannter Digital Object Identifiers (DOI) – sicherstellen. Dies beinhaltet auch Hinweise auf die dazu entwickelte Software zur freien Nachnutzung. Davon erhoffen wir uns, dass auch andere Projekte von unseren Erkenntnissen profitieren können.

## Die Trias guter Open-Access-Publikation

Damit Open-Access-Blogs über die unmittelbare kostenfreie Publikation den wissenschaftlichen Diskurs mitgestalten können, ist es erforderlich, dass auf ihnen veröffentlichte Beiträge gut auffindbar, langfristig abrufbar und zitierfähig sind – die drei Voraussetzungen einer guten Open-Access-Publikationskultur. Insbesondere die Flüchtigkeit und nachträgliche Veränderbarkeit digitaler Quellen stellt eine Herausforderung bei Verweisen auf Publikationen außerhalb klassischer, gedruckter Medien dar. Dem begegnen Verfassungsblog und Völkerrechtsblog seit einigen Jahren durch die Veröffentlichung einer Zweitversion ihrer Beiträge auf <intR>²Dok, dem Open-Access-Repositorium des Fachinformationsdiensts für internationale und interdisziplinäre Rechtsforschung, das auch anderen Projekten offensteht. Dadurch wird die bibliothekarische Katalognachweis, die Langzeitarchivierung und die dauerhafte digitale Zitierfähigkeit sichergestellt. Aufgabe des von der Deutschen Forschungsgemeinschaft an der Staatsbibliothek zu Berlin eingerichteten Fachinformationsdiensts für internationale und interdisziplinäre Rechtsforschung ist es, die Angehörigen juristischer Fakultäten und Wissenschaftseinrichtungen in der Bundesrepublik mit nachfragegetriebenen Service- und Infrastrukturangeboten zu unterstützen. Durch seine Kooperation mit Verfassungs- und Völkerrechtsblog gewinnt der Fachinformationsdienst an Sichtbarkeit von Seiten der rechtswissenschaftlichen Fachcommunity – eine unverzichtbare Voraussetzung seiner Arbeit –, und die Blogbeiträge werden in internationalen Bibliothekskatalogen auffindbar, was ihnen wiederum mehr Seriosität verschafft. Ihre Reichweite lässt sich durch die DOI-Auszeichnung auch im Social Web mithilfe alternativer Bibliometrie nachvollziehen. So profitieren die beiden Wissenschaftsblogs von der Zusammenarbeit auch über die drei angesprochenen Dimensionen hinaus.

## Automatisierung mithilfe offener Standards

Lange Zeit haben Verfassungsblog und Völkerrechtsblog die bibliographischen Metadaten und Volltexte ihrer Veröffentlichungen nach <intR>²Dok händisch importiert und den dort geprägten DOI ebenfalls manuell wieder in die jeweilige Zitierempfehlung des Originalbeitrags übertragen. Mit dem wachsenden Erfolg der beiden Blogs nahm aber auch die Zahl an Veröffentlichungen zu, die in Folge der Pandemie nochmals stark ansteigen sollte. Es musste also eine automatisierte Lösung her. Zu diesem Zweck wurde von Seiten der Verbundzentrale des Gemeinsamen Bibliotheksverbunds, die Systemarchitektur wie technischen Betrieb von <intR>²Dok verantwortet, ein Mechanismus implementiert, der automatisiert sowohl den Beitragsinhalt mit den entsprechenden Metadaten importiert wie auch den dann erstellten DOI auf den Blog überträgt. Dabei verwendet das für Import und DOI-Übertragung eingesetzte Instrument die REST-Schnittstelle sowohl von WordPress, der weltweit verbreitetsten Blogplattform, als auch des kollaborativ entwickelten, quelloffenen Softwareframeworks MyCoRe, auf dem wiederum das Open Access-Repositorium des Fachinformationsdienstes für internationale und interdisziplinäre Rechtsforschung basiert.

In zwölfstündigen Intervallen wird anhand von Artikel-ID und URL eines Blogbeitrags überprüft, ob sich der Text in <intR>²Dok befindet. Ist das nicht der Fall, wird der automatische Importvorgang ausgelöst – unter Konversion der über einen gesicherten Kanal ausgetauschten bibliographischen Metadaten aus dem Format JSON nach MODS, dem internen Datenformat der MyCoRe-Repositorien. Auf Seiten von WordPress kommen dabei regelmäßig Plugins wie das quelloffene Advanced Custom Fields sowie ACF to REST API zum Einsatz, die die Funktionalität von WordPress erweitern und die Eintragung weiterer Metadaten erlauben. Parallel dazu transformiert ein Parser den HTML-Text des betreffenden Blogbeitrags in ein PDF- bzw. künftig in ein PDF/A-Dokument und somit in ein für die Langzeitarchivierung des Inhalts geeignetes Dateiformat. Die auf diese Weise automatisch importierten Metadaten und Volltexte kontrolliert das Team des Fachinformationsdiensts für internationale und interdisziplinäre Rechtsforschung anschließend auf Vollständigkeit und formale Konsistenz – ein Vorgang, an dessen Ende die Prägung eines DOI (in der Fabrica des Registrierungskonsortiums DataCite) steht. Dieser wird daraufhin spiegelbildlich auf dem für den Import beschrittenen Wege in ein zuvor gemeinsam bestimmtes, letztlich beliebiges Feld des Metadatenschemas von Verfassungsblog bzw. Völkerrechtsblog geschrieben.

Neben reinen Textbeiträgen werden inzwischen auch multimediale Inhalte wie Podcasts und Videoaufzeichnungen in das <intR>²Dok-Repositorium übertragen.

## Open Access – Gekommen um zu bleiben (und weiterverwendet zu werden)

 Ziel der Zusammenarbeit ist es, Musterlösungen zu entwickeln, auf denen in der Folge andere Projekte aufbauen können, um ihre Open-Access-Publikationen dauerhaft zitierfähig, langzeitarchiviert und bibliothekarisch erfassbar zu machen. Ganz dem Gedanken von Open Access folgend, dass Wissen allen uneingeschränkt zur Verfügung stehen soll, ist auch der eingesetzte Softwarecode frei veröffentlicht. Soweit es sich um Eigenentwicklungen handelt, werden diese auf den Github-Seiten der Verbundzentrale des Gemeinsamen Bibliotheksverbunds unter einer GNU General Public License zur Verfügung gestellt. Die Grundbedingung für die effektive Verwendung der Software ist die Kooperation mit einem auf MyCoRe basierenden institutionellen oder disziplinären Open Access-Repositorium wie z.B. <intR>²Dok, das allen juristischen Wissenschaftsblogs kostenfrei für eine solche Zusammenarbeit zugänglich ist. Der Fachinformationsdienst für internationale und interdisziplinäre Rechtsforschung freut sich jederzeit über eine Kontaktaufnahme, sofern Interesse an einer Kooperation besteht.

## Verwendete Open Source-Software

- 
WordPress

- 
Advanced Custom Fields

- 
ACF to REST API

- 
WordPress Importer Service

- 
WordPress Importer GUI

Dieser Text erscheint parallel auf Verfassungsblog, Völkerrechtsblog sowie auf SBB aktuell – Blognetzwerk der Staatsbibliothek zu Berlin.
