# Kanzleien, Konten und Abrechnung

Stand 17.09.2026. Beschreibt, wie Subsumio eine Kanzlei, ihre Konten und ihr
Guthaben zusammenhält, und was der Betreiber in der Konsole damit tun kann.

## Begriffe

- **Kanzlei (Mandant, `Tenant`)**: entweder eine Organisation mit Team
  (`subsumio_orgs`) oder eine Einzelkanzlei, also ein Konto ohne Team.
  Einzelkanzleien haben die ID `solo-<userId>`. Modul: `src/lib/tenants.ts`.
- **Datenraum (`brainId`)**: alle Akten, Dokumente und Fristen einer Kanzlei.
  Gründet eine Einzelkanzlei ein Team, übernimmt das Team ihren Datenraum.
- **Mitgliedschaft (`user.orgId`)**: bedeutet ausschließlich „gehört zu diesem
  Team“. Zeigt `orgId` auf keine existierende Organisation, gilt das Konto als
  Einzelkanzlei; `engineContext()` repariert den Datensatz beim nächsten Aufruf.
- **Zahlendes Konto (`billing`)**: das Konto, dessen Abonnement und Guthaben
  eine Anfrage verbraucht. Eine Regel für alles (Guthaben, Testguthaben,
  Reservierungen, Kostenlimit, Budget-Warnungen):
  - Einzelkanzlei: das eigene Konto.
  - Team: `org.billingUserId`, bei der Gründung der Gründer. Ein
    Inhaberwechsel ändert den Zahler nicht.
    Berechnet einmal pro Anfrage in `engineContext()` / API-Key-Kontext und als
    `ctx.billing` an alle Routen gegeben. Modul: `src/lib/billing/billing-account.ts`.
    Das Abrechnungskonto in `saas_orgs` trägt die ID des zahlenden Nutzers.
- **Plan**: der Plan des zahlenden Kontos gilt für die ganze Kanzlei.

## Sperre

- Betreiber sperrt eine Kanzlei mit Pflichtgrund. Alle aktiven Konten werden
  abgemeldet und deaktiviert; die IDs stehen in `org.suspendedMemberIds`.
- Entsperren stellt genau diese Konten wieder her. Wen die Kanzlei vorher selbst
  deaktiviert hatte, bleibt deaktiviert.
- Zusätzlich blockiert der Kanzleistatus jedes Konto, auch eines, das nach der
  Sperre hinzukam. Geprüft an: Login, Zwei-Faktor-Abschluss, SSO-Rückkehr,
  `getSessionUser`, Echtzeit-Stream, `engineContext()`, API-Keys
  (`src/lib/auth/account-status.ts`).
- Anmeldeformular zeigt: „Dieses Konto ist gesperrt. Bitte wenden Sie sich an
  Ihre Kanzlei oder an support@subsum.io.“ Der Status wird erst nach korrektem
  Passwort verraten.

## Betreiber-Aktionen (`PATCH /api/admin/tenants/[id]`)

| Aktion           | Regeln                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `suspend`        | Grund mindestens 10 Zeichen; nicht doppelt                                                             |
| `reactivate`     | nur wenn gesperrt                                                                                      |
| `set_role`       | Inhaber bleibt Admin; Kanzlei behält mindestens einen aktiven Admin; betroffenes Konto wird abgemeldet |
| `transfer_owner` | neues Mitglied muss aktiv sein und wird Admin; Zahler bleibt                                           |

Die Nutzerseite der Konsole (`PATCH /api/admin/users/[id]`) nutzt für Rollen
im Team dieselben Regeln. Jede Aktion landet im Betreiber-Audit.

## Support-Zugriff

Siehe `src/lib/support-session.ts`: Pflichtgrund, 60 Minuten, Banner, Eintrag im
Audit-Protokoll der Kanzlei. Funktioniert für Teams und Einzelkanzleien.
KI-Nutzung während einer Support-Sitzung wird dem zahlenden Konto der Kanzlei
belastet (offener Punkt).

## Vor dem Go-live auf der Produktionsdatenbank prüfen

```sql
-- Konten, deren orgId auf keine Organisation zeigt (werden automatisch repariert)
SELECT count(*) FROM subsumio_users u
 WHERE coalesce(u.data->>'orgId','') <> ''
   AND NOT EXISTS (SELECT 1 FROM subsumio_orgs o WHERE o.id = u.data->>'orgId');

-- Abrechnungskonten eines Nutzers, die nicht dessen ID tragen (Guthaben wäre unerreichbar)
SELECT s.id, s.slug FROM saas_orgs s
 WHERE s.slug LIKE 'user-%'
   AND NOT EXISTS (SELECT 1 FROM subsumio_users u WHERE u.id = s.id::text);

-- Guthaben auf Team-IDs (vor der Umstellung gebucht, jetzt ungenutzt)
SELECT b.org_id, b.purchased_credit, b.included_credit FROM saas_credit_balance b
  JOIN subsumio_orgs o ON o.id = b.org_id::text;
```

Treffer in Abfrage 2 oder 3 brauchen eine einmalige Umbuchung auf das zahlende
Konto. Lokal gab es nur einen alten Testdatensatz ohne Nutzer.
