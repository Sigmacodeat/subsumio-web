# Aktenzugriff, Freigaben und Chinese Walls

Stand 19.09.2026. Beschreibt, wer in einer Kanzlei welche Akte sieht und
ändert, wie Kolleg:innen einander Akten freigeben und wo das durchgesetzt wird.

## Regeln pro Akte

Die Regeln stehen in `frontmatter.permissions` der Aktenseite (`legal_case`):

| Feld            | Bedeutung                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `visibility`    | `full` (Standard): ganze Kanzlei nach Rolle · `restricted`: Aktenteam, Freigaben, Admins · `confidential`: nur Aktenteam und Freigaben |
| `allowed_users` | Aktenteam (Nutzer-IDs)                                                                                                                 |
| `grants`        | Einzelfreigaben `{ user_id, level: read \| write, expires_at?, granted_by, granted_at }`                                               |
| `blocked_users` | Chinese Wall: Wer hier steht, sieht die Akte nirgends, auch als Admin                                                                  |

Rollen setzen die Obergrenze: `admin`, `lawyer`, `assistant` dürfen schreiben,
`client_viewer` nur lesen und nur Akten, in deren Team er steht oder die ihm
freigegeben wurden. Eine Freigabe gibt nie mehr als die Rolle erlaubt.

Die Regel steht zweimal im Code und ist per Test gleichgeschaltet:
`server/src/core/matter-access.ts` (Durchsetzung) und `src/lib/matter-access.ts`
(Oberfläche, Freigabe-Prüfung).

## Durchsetzung

1. Jeder Engine-Aufruf im Namen einer Person trägt ein signiertes
   Identitäts-Token mit Nutzer-ID und Rolle (`addCallerIdentity` in
   `src/lib/engine.ts`, für Sitzungen und API-Schlüssel).
2. Die Engine prüft, dass das Token für diese Kanzlei ausgestellt wurde, liest
   die Regeln aller Akten der Kanzlei und schränkt den Aktenumfang der Anfrage
   ein: gesperrte Akten und ihre Dokumente verschwinden aus Listen, Suche,
   Copilot/Think, Downloads und Einzelabrufen. Schreibzugriffe auf Akten mit
   reiner Lesefreigabe lehnt sie mit 403 ab.
3. Die Regeln selbst ändern sich nur über `PUT /api/cases/access`. Jeder andere
   Seiten-Schreibvorgang behält die gespeicherten Regeln bei.

## Wer was ändern darf

- **Administratoren**: Sichtbarkeit, Aktenteam, Chinese Walls und alle
  Freigaben. Niemand kann sich selbst aussperren.
- **Wer die Akte bearbeiten darf**: Kolleg:innen der eigenen Kanzlei Lese- oder
  Schreibzugriff geben, auf Wunsch befristet, und die eigenen Freigaben
  zurücknehmen.
- Jede Änderung landet im Audit-Log (`matter.access_update`) und steht auf der
  Seite „Zugriff & Freigaben“ (`/dashboard/matter-access?case=…`, im Aktenkopf
  über das Schild-Symbol).

## Copilot-Unterhaltungen

- Jede Unterhaltung wird nach der Antwort unter
  `chat-sessions/private/<Person>/<id>` gespeichert (`/api/chat/sessions`,
  Browser-Seite `src/lib/chat-server-sync.ts`). Die Engine blendet die privaten
  Bereiche aller anderen aus, auch für Administratoren.
- „Chat teilen“ legt eine Kopie unter `chat-sessions/shared/<Person>/<id>` an
  und kopiert einen Link. Kolleg:innen öffnen sie nur, wenn sie die Akte der
  Unterhaltung sehen dürfen (`case_slug`).
- `chat-sessions/` ist aus Suche und Copilot-Recherche ausgeschlossen
  (`DEFAULT_HARD_EXCLUDES`): alte Antworten sind nie Beleg für neue.

## Datenräume: Freigaben an andere Kanzleien

- Pro Akte ein Datenraum (`src/lib/data-rooms.ts`, API `/api/data-rooms`,
  Seiten unter `/dashboard/shared-spaces`). Anlegen und verwalten darf, wer die
  Akte ändern darf; geöffnet wird er auf „Zugriff & Freigaben“.
- Geteilt werden nur ausdrücklich gewählte Dokumente der Akte. Die Dokumente
  bleiben im Datenraum (brain) der Ursprungskanzlei; Gäste erhalten keinen
  Engine-Zugang. Jeder Abruf läuft über `/api/data-rooms/[id]/document`, das
  die Mitgliedschaft prüft, nur gelistete Dokumente ausliefert und den Abruf
  im Audit-Log der Ursprungskanzlei festhält.
- Einladung per E-Mail; annehmen kann nur ein angemeldetes Konto mit genau
  dieser Adresse, das zu einer anderen Kanzlei gehört. Einmal-Link, optional
  befristet, jederzeit entziehbar. Raum, Dokumentliste und Mitglieder liegen
  in der Postgres der Web-App (`subsumio_data_room*`).

## Noch nicht abgedeckt

- Gäste können im Datenraum nur lesen (kein Hochladen, keine Kommentare).
- Pfade ohne Personenbezug (Cron, Webhooks, WhatsApp) laufen weiter ohne
  Nutzer-Token; WhatsApp begrenzt den Aktenumfang über die Identität der Nummer.
