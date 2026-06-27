---
status: DRAFT
created: 2026-06-12
author: Cascade (Principal Engineer)
---

# Blueprint: Cloud Agent Workspace Layer (SigmaWorkspace)

## 1. Ziel des Systems (aus User-Sicht)

SigmaWorkspace ist der Cloud-Ausführungslayer für Subsumio-Agenten. Er ermöglicht Nutzern:

- **Agenten in der Cloud zu starten**, die auch bei geschlossenem Laptop oder ausgeschaltetem Smartphone weiterarbeiten.
- **Von überall** (Desktop, Smartphone, Tablet) auf laufende Agenten zuzugreifen, sie zu steuern, zu pausieren oder zu stoppen.
- **Komplexe, langlaufende Aufgaben** (Recherche, Analyse, Code-Refactoring, Brain-Enrichment) an Agenten zu delegieren, ohne an ein Gerät gebunden zu sein.
- **Workspace-Isolation** pro Nutzer/Team mit voller Credential- und Infrastruktur-Kontrolle (kundenkontrolliertes Modell, Ona-Parität).

**Vision:** Subsumio wird nicht nur zum "Gedächtnis", sondern zur **vollständigen Agent-Infrastruktur** — Memory + Execution + Orchestration in einer Hand.

---

## 2. Kern-Userflows

### 2.1 Beginner-Flow: Erster Agent in der Cloud

1. Nutzer öffnet Dashboard → neuer Menüpunkt "Agenten".
2. Sieht Liste vordefinierter Agent-Templates ("Brain-Recherche", "Dokumentenanalyse", "Dream-Cycle-Setup").
3. Wählt Template, gibt Prompt ein, klickt "Starten".
4. Agent startet in Cloud-Workspace. Nutzer sieht Live-Status (Schritt X von Y, Tokens verbraucht).
5. Schließt Laptop. Agent läuft weiter.
6. Öffnet Smartphone-App/PWA → sieht denselben Agenten, kann Nachricht senden oder Status prüfen.
7. Agent beendet Arbeit. Nutzer erhält Push-Benachrichtigung.
8. Ergebnis steht im Dashboard bereit (mit Quellen, Zusammenfassung, Export).

### 2.2 Normal-Flow: Agent für unterwegs steuern

1. Nutzer startet langlaufenden Agenten am Desktop (z.B. "Analysiere alle Q2-Meeting-Notes").
2. Geht in Meeting, öffnet Smartphone.
3. Dashboard-App zeigt laufenden Agenten → "45% fertig, gerade bei: Extrahiere Entitäten".
4. Nutzer sendet Inbox-Nachricht: "Priorisiere die Ergebnisse nach Umsatzrelevanz".
5. Agent empfängt Nachricht im nächsten Iterationsschritt, passt Strategie an.
6. Nutzer pausiert Agenten während Meeting: "Pause bis 14:00 Uhr".
7. Agent pausiert, speichert Zustand, setzt um 14:00 fort.

### 2.3 Power-User-Flow: Multi-Agent-Orchestration

1. Power-User erstellt Agent-Gruppe ("Wave") mit 3 parallel laufenden Agenten:
   - Agent A: Recherche zu Topic X
   - Agent B: Recherche zu Topic Y
   - Agent C: Synthese, wartet auf A+B
2. Dashboard zeigt DAG-Visualisierung (Dependency-Graph).
3. Nutzer steuert Prioritäten, Ressourcen-Limits (max Tokens/h).
4. Bei Fehler in Agent A → Inbox-Nachricht an Nutzer mit Kontext, Optionen: "Retry", "Skip", "Manual fix".
5. Agent C startet automatisch, sobald A+B done.
6. Gesamter Wave wird als Audit-Trail (Session Transcript) im Brain gespeichert.

---

## 3. Alle UI-Elemente & Interaktionen

### 3.1 Navigation

**Dashboard Sidebar erweitern:**

- Neuer Nav-Item: `Agents` (Icon: `Bot` oder `Cpu` aus lucide-react)
- Badge auf Icon zeigt Anzahl aktiver Agenten
- Dream Cycle wird in Agenten-Bereich integriert (ist ja auch ein Agent)

**Topbar erweitern:**

- Globaler "Neuer Agent"-Button (schneller Start)
- Benachrichtigungs-Bell zeigt Agent-Events (fertig, fehlgeschlagen, Nachricht)

### 3.2 Agent-Listenseite (`/dashboard/agents`)

| Element                                                                          | Interaktion                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Status-Filter** (Tabs: Alle / Aktiv / Pausiert / Fertig / Fehler)              | Klick filtert Liste                             |
| **Agent-Card** (pro Agent)                                                       | Klick öffnet Detail                             |
| Card-Inhalt: Name, Status-Badge, Fortschrittsbalken, Startzeit, ETA, Token-Count | Hover zeigt Quick-Actions (Pause, Stop, Replay) |
| **Template-Galerie** (oben oder Sidebar)                                         | Klick startet neuen Agent                       |
| **Bulk-Actions** (Checkbox + Dropdown)                                           | Multi-Select: Stop alle, Replay alle            |
| **Live-Socket-Indikator**                                                        | Grüner Punkt = Echtzeit-Updates aktiv           |

### 3.3 Agent-Detail-Seite (`/dashboard/agents/[id]`)

| Element                                                                        | Interaktion                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------ |
| **Status-Header** mit großem Status-Badge, Pause/Resume/Stop-Buttons           | Klick triggert Aktion via API                    |
| **Progress-Panel** (Step X/Y, aktuelle Aktion, Tokens In/Out, Kosten)          | Auto-updated via SSE/WebSocket                   |
| **Transcript-Stream** (Chronologischer Log: LLM-Turns, Tool-Calls, Ergebnisse) | Scroll, Klick auf Tool-Call expandiert Details   |
| **Inbox-Panel** (Nachrichten an/vom Agenten)                                   | Input-Feld + Senden; Read-Receipts               |
| **Ergebnis-Panel** (nur bei Status=fertig)                                     | Markdown-Render, Export, in Brain speichern      |
| **Einstellungen-Accordion** (Model, Max Iterations, Ressource-Limit)           | Edit, Save                                       |
| **Mobile-Optimierung**                                                         | Alles vertikal stapelbar, Bottom-Nav für Actions |

### 3.4 Interaktionen: Keyboard, Focus, Drag/Drop

- **Keyboard:** `Space` = Pause/Resume im Detail, `Esc` = zurück zur Liste, `Cmd+K` = "Neuer Agent"-Palette
- **Focus:** Agent-Cards sind tab-bar, Detail-Seite fokussiert Inbox-Input nach Load
- **Drag/Drop:** Agent-Cards in Listenansicht umsortierbar (Priorität), Drag auf Trash = Stop

### 3.5 Mobile/PWA

- Capacitor-App erweignert Dashboard-Nav um Bottom-Tab: "Agenten"
- Push-Notifications für: Agent fertig, Agent-Fehler, neue Inbox-Nachricht
- Swipe-Gesten auf Agent-Card: Links = Pause, Rechts = Details

---

## 4. Datenmodell & State-Management

### 4.1 Neue/erweiterte DB-Schema (Postgres/PGLite)

```sql
-- Agent-Workspaces (isolierte Ausführungsumgebungen pro User/Org)
CREATE TABLE agent_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES orgs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('provisioning','ready','suspended','terminated')),
  engine_type TEXT NOT NULL DEFAULT 'container', -- container | vm | serverless
  config JSONB NOT NULL DEFAULT '{}',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent-Jobs (erweitert bestehende minion_jobs-Logik oder neue Tabelle)
CREATE TABLE agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting','active','paused','completed','failed','dead','cancelled')),
  template_id TEXT, -- optional: verweist auf Agent-Template
  prompt TEXT NOT NULL,
  model TEXT DEFAULT 'claude-sonnet-4-6',
  max_iterations INTEGER DEFAULT 50,
  tools JSONB DEFAULT '[]',
  progress JSONB DEFAULT '{}', -- { step, total, message, tokens_in, tokens_out }
  result TEXT, -- finale Ausgabe
  stacktrace JSONB DEFAULT '[]', -- TranscriptEntries
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_cache_read INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,6), -- computed at read-time from pricing table
  inbox JSONB DEFAULT '[]', -- InboxMessages
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inbox-Messages (separate Tabelle für Concurrent-Safety)
CREATE TABLE agent_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user','system','parent')),
  payload TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_inbox_unread ON agent_inbox (job_id) WHERE read_at IS NULL;

-- Agent-Templates (vorkonfigurierte Agenten)
CREATE TABLE agent_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  default_prompt TEXT NOT NULL,
  default_model TEXT,
  default_tools JSONB DEFAULT '[]',
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 State-Management (Frontend)

- **Zustand-Store** (`useAgentStore`): Aktive Agenten-Liste, selektierter Agent, Live-Status
- **React Query** (`@tanstack/react-query`): Server-State für Listen, Detail, History
- **SSE-Connection** (`EventSource`): Echtzeit-Updates für aktive Agenten (Status, Progress)
- **WebSocket-Fallback:** Für Inbox-Realtime ( bidirektional)

### 4.3 API-Endpoints (Next.js App Router)

```
/api/agents              GET list | POST create
/api/agents/[id]         GET detail | PATCH update | DELETE cancel
/api/agents/[id]/pause   POST
/api/agents/[id]/resume  POST
/api/agents/[id]/replay  POST
/api/agents/[id]/inbox   GET messages | POST send
/api/agents/[id]/events  GET SSE stream (real-time)
/api/agents/templates    GET list
/api/workspaces          GET list | POST create
/api/workspaces/[id]     GET | DELETE
```

---

## 5. Architektur-Entscheidungen

### 5.1 Execution-Model: "Remote-First, Local-Fallback"

| Komponente               | Wo läuft es?                                | Warum                                             |
| ------------------------ | ------------------------------------------- | ------------------------------------------------- |
| Agent-Queue + State      | GBrain-DB (Postgres/PGLite)                 | Single source of truth, bereits vorhanden         |
| Agent-Handler (LLM-Loop) | Cloud-Worker (separater Service)            | Skalierbar, unabhängig vom User-Gerät             |
| Dashboard-UI             | Next.js App (Render/Vercel/self-host)       | Schon vorhanden                                   |
| Workspace-Isolation      | Docker-Container pro User/Org               | Security, Compliance, Tool-Isolation              |
| Realtime-Updates         | SSE (Server-Sent Events) + Fallback-Polling | Einfacher als WebSocket, funktioniert über HTTP/2 |

### 5.2 Warum kein GBrain-eigener LLM-Loop?

> _"GBrain is orchestration, not execution."_ — `@/Users/msc/Subsumio/server/docs/designs/MINIONS_AGENT_ORCHESTRATION.md:301`

Wir bleiben diesem Prinzip treu:

- **GBrain-Repo**: Queue, State, Inbox, Token-Tracking, Transcripts, Dashboard-UI
- **Execution-Worker**: Ein separater, leichtgewichtiger Service (Node.js/Bun), der die GBrain-API abfragt, den LLM-Loop ausführt, und Ergebnisse zurückschreibt

Das ist strategisch klug:

- Execution-Worker kann in jeder Cloud laufen (Fly.io, Railway, Render, AWS)
- User können self-hosten (Compliance)
- GBrain bleibt "Memory-First", wird nicht zu einem monolithischen Monster

### 5.3 Tech-Stack für den Execution-Worker

```
Language: TypeScript / Bun
Runtime: Docker-Container
Queue-Consumer: Polls GBrain /api/agents for 'waiting' jobs
LLM-Calls: Anthropic/OpenRouter via Gateway
Tools: MCP-Tool-Calls via GBrain-MCP-Bridge
State-Persistence: Writes back to GBrain DB via REST API
```

### 5.4 Security & Trust Boundary

- **Workspace-Isolation:** Jeder User/Org bekommt eigenen Container-Namespace
- **Credential-Vault:** Keine Credentials im Container-FS, nur via GBrain Credential Gateway
- **Audit-Trail:** Jeder Agent-Run wird als Brain-Page gespeichert (`type: agent_run`)
- **Scope-Gating:** API-Endpunkte prüfen `session.user.id` gegen `agent_jobs.user_id`
- **Rate Limiting:** Pro-User Token-Budget, max concurrent Agents

---

## 6. Edge-Cases & Fehlerszenarien

| Szenario                                          | Verhalten                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User startet Agent, geht offline**              | Agent läuft im Cloud-Worker weiter. Bei Fertigstellung: Push-Notification + Email-Fallback.                                                          |
| **Agent hängt sich auf (Endlosschleife)**         | Max-Iterations-Hardlimit. Governor killt nach Token-Budget. User bekommt "Agent timed out" mit Partial-Result.                                       |
| **Cloud-Worker crasht mid-run**                   | Job-Status bleibt 'active' mit abgelaufenem Lock. Next Worker erkennt Stalled-Job via Lock-Timeout, resumed von letztem Checkpoint (Progress-JSONB). |
| **User sendet Inbox-Nachricht an fertigen Agent** | System-Reply: "Dieser Agent ist beendet. Möchtest du einen Replay starten?"                                                                          |
| **Zwei Geräte gleichzeitig (Desktop + Mobile)**   | SSE-Stream ist idempotent. Beide Clients sehen dieselben Events. Write-Ops (Pause) sind atomar via DB.                                               |
| **Agent braucht Tool, das nicht verfügbar ist**   | Graceful degrade: Agent bekommt Fehlermeldung als Tool-Result, entscheidet selbst (Retry/Skip/Abort).                                                |
| **Token-Budget erschöpft**                        | Governor pausiert Agent. Inbox-Nachricht an User: "Budget erschöpft. Erhöhen oder abbrechen?"                                                        |
| **PGLite-User will Cloud-Agenten**                | Fallback: Agent läuft lokal im Browser-Worker (Web Worker) mitPolling. Limitiert, aber funktional.                                                   |

---

## 7. Definition of Done (klar überprüfbar)

### Release 1.0 — "Agent Workspace MVP"

- [ ] Dashboard zeigt Nav-Item "Agenten" mit aktiver Badge-Anzahl
- [ ] `/dashboard/agents` listet alle Agenten mit Status, Progress, Token-Count
- [ ] Agent kann aus Template gestartet werden (mindestens 3 Templates)
- [ ] Agent läuft in Cloud-Worker, auch wenn User-Tab geschlossen ist
- [ ] Agent-Detail zeigt Live-Progress (SSE) mit Transcript-Stream
- [ ] Inbox: User kann Nachricht an laufenden Agenten senden
- [ ] Pause/Resume/Stop funktioniert über API und UI
- [ ] Push-Benachrichtigung bei Agenten-Abschluss (via PWA/OneSignal)
- [ ] Mobile Dashboard responsive, PWA-fähig
- [ ] Audit: Jeder Agent-Run landet als Page im Brain (`type: agent_run`)
- [ ] Security: Scope-gated, User kann nur eigene Agenten sehen
- [ ] E2E-Test: Voller Flow "Start → Laufen lassen → Benachrichtigung → Ergebnis"

### Release 2.0 — "Agent Orchestration"

- [ ] Agent-Gruppen / Waves (Parent-Child DAG)
- [ ] Dashboard-DAG-Visualisierung
- [ ] Ressourcen-Governor (Token-Budget, Max-Concurrency)
- [ ] Team-Shared Agenten (Org-Scope)
- [ ] Agent-Scheduling ("Starte morgen um 9 Uhr")

### Release 3.0 — "Enterprise Workspace"

- [ ] Workspace-Typen: Serverless, Container, Dedicated VM
- [ ] Custom Tool-Registry pro Workspace
- [ ] SSO/SAML für Workspace-Zugang
- [ ] Compliance-Export (Logs, Transcripts, Audit-Trail)
- [ ] On-Premise Execution-Worker

---

## Appendix: Anbindung an bestehende GBrain-Features

| GBrain-Feature     | Wiederverwendung im Workspace                  |
| ------------------ | ---------------------------------------------- |
| Minions Queue      | Agent-Jobs erweitern/wrapen `minion_jobs`      |
| MCP Server         | Agent-Handler ruft Tools via GBrain-MCP        |
| Credential Gateway | Workspace-Credentials via `credential-gateway` |
| Brain-Schema       | Agent-Runs als `type: agent_run` speichern     |
| Search/Think       | Agent nutzt `gbrain think` für Recherche       |
| Graph              | Agent-Ergebnisse verlinken via Typed Edges     |
| Dream Cycle        | Langlaufende Enrichment-Jobs sind Agenten      |
| OAuth/Auth         | Bestehendes Session-System                     |
| Admin Dashboard    | Erweitern um Agent-Übersicht                   |
