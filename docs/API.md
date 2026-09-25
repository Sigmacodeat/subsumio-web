# Subsumio API — Referenz

> Automatisch generiert aus den Route-Dateien. Regenerieren:
> `bun x tsx scripts/generate-api-docs.ts`

**534 Endpunkte** — Stand: 2026-09-25

## Authentifizierung

| Typ               | Beschreibung                                                |
| ----------------- | ----------------------------------------------------------- |
| Session           | Cookie-Session des angemeldeten Kanzlei-Nutzers             |
| Öffentlich        | Anonyme Flächen (Intake, Portal, Booking) — IP-rate-limited |
| Webhook-Signatur  | Signierte Provider-Callbacks (HMAC)                         |
| SCIM Bearer-Token | SCIM-Provisioning                                           |

## Endpunkte

| Pfad                                                        | Methoden                 | Auth                      | Action                            | Rate     |
| ----------------------------------------------------------- | ------------------------ | ------------------------- | --------------------------------- | -------- |
| `/api/2fa/qrcode`                                           | POST                     | Session                   | `auth.2fa`                        | standard |
| `/api/absences`                                             | GET, POST, PATCH         | Session                   | `brain.write`                     | standard |
| `/api/acls/groups`                                          | GET, POST                | Session                   | `settings.read`                   | standard |
| `/api/acls/groups/{groupId}`                                | DELETE                   | Session                   | `settings.write`                  | standard |
| `/api/acls/groups/{groupId}/members`                        | GET, POST                | Session                   | `settings.read`                   | standard |
| `/api/acls/groups/{groupId}/members/{userId}`               | DELETE                   | Session                   | `settings.write`                  | standard |
| `/api/acls/permissions`                                     | GET, POST                | Session                   | `settings.read`                   | standard |
| `/api/acls/permissions/{slug}/{groupId}`                    | DELETE                   | Session                   | `settings.write`                  | standard |
| `/api/act-imports`                                          | GET, POST                | Session                   | `brain.write`                     | heavy    |
| `/api/act-imports/{id}`                                     | GET                      | Session                   | `brain.read`                      | standard |
| `/api/act-imports/{id}/finalize`                            | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/act-imports/{id}/items`                               | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/act-imports/{id}/refresh`                             | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/act-imports/{id}/report`                              | GET                      | Session                   | `brain.read`                      | standard |
| `/api/admin/audit-export`                                   | POST                     | Session                   | `platform.operator`               | heavy    |
| `/api/admin/backup`                                         | GET, POST                | Session                   | `platform.operator`               | standard |
| `/api/admin/backup/{id}`                                    | GET, POST, DELETE        | Session                   | `platform.operator`               | standard |
| `/api/admin/chunk-inspector`                                | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/chunk-inspector/action`                         | POST                     | Session                   | `platform.operator`               | heavy    |
| `/api/admin/chunk-inspector/detail`                         | GET, PATCH, DELETE       | Session                   | `platform.operator`               | heavy    |
| `/api/admin/chunk-quality`                                  | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-alerts`                                  | GET, POST                | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-command-center`                          | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-command-center/trigger-delta`            | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-coverage-audit`                          | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/audit`                             | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/build-index`                       | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/bulk-edit`                         | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/create`                            | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/delete`                            | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/diff`                              | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/export`                            | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/flag`                              | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/list`                              | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/publish`                           | GET, POST                | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/read`                              | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/restore`                           | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/sample`                            | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/search`                            | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/validate-schema`                   | GET, POST                | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/versions`                          | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-files/write`                             | PUT                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-ingest-log`                              | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-law-coverage`                            | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-law-coverage/law`                        | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-law-coverage/refetch`                    | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-overview`                                | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/corpus-pipeline`                                | POST                     | Session                   | `platform.operator`               | standard |
| `/api/admin/data-delete`                                    | POST                     | Session                   | `platform.operator`               | heavy    |
| `/api/admin/data-export`                                    | POST                     | Session                   | `platform.operator`               | heavy    |
| `/api/admin/demo`                                           | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/dr`                                             | GET, POST                | Session                   | `create_backup`                   | standard |
| `/api/admin/eval-gate`                                      | GET                      | Session                   | `connector.read`                  | standard |
| `/api/admin/feature-flags`                                  | GET, POST, PATCH, DELETE | Session                   | `platform.operator`               | standard |
| `/api/admin/ip-allowlist`                                   | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/leads`                                          | PATCH, DELETE            | Session                   | `platform.operator`               | standard |
| `/api/admin/queue-health`                                   | GET                      | Session                   | `platform.operator`               | standard |
| `/api/admin/saas-usage`                                     | GET                      | Session                   | `admin.read`                      | standard |
| `/api/admin/spend-caps`                                     | GET, POST                | Session                   | `platform.operator`               | standard |
| `/api/admin/support-session`                                | GET, POST                | Session                   | `platform.operator`               | standard |
| `/api/admin/support-session/end`                            | POST                     | Session                   | `platform.support_session`        | standard |
| `/api/admin/tenants/{id}`                                   | PATCH                    | Session                   | `platform.operator`               | standard |
| `/api/admin/token-usage`                                    | GET                      | Session                   | `admin.read`                      | standard |
| `/api/admin/users/{id}`                                     | PATCH, DELETE            | Session                   | `platform.operator`               | standard |
| `/api/agent-templates`                                      | GET, POST                | Session                   | `agent.read`                      | standard |
| `/api/agent-templates/{slug}`                               | GET, PATCH, DELETE       | Session                   | `agent.read`                      | standard |
| `/api/agent-templates/{slug}/run`                           | POST                     | Session                   | `agent.write`                     | heavy    |
| `/api/agents`                                               | GET, POST                | Session                   | `agent.read`                      | heavy    |
| `/api/agents/{...slug}`                                     | GET, POST                | Session                   | `agent.control`                   | heavy    |
| `/api/agents/next-steps`                                    | POST                     | Session                   | `agent.write`                     | heavy    |
| `/api/agents/rundown`                                       | POST                     | Session                   | `agent.write`                     | heavy    |
| `/api/analytics/adoption`                                   | GET                      | Session → Engine          | `admin.*`                         | standard |
| `/api/api-keys`                                             | GET, POST, PATCH, DELETE | Session                   | `settings.read`                   | standard |
| `/api/api-keys/rotate`                                      | POST                     | Session                   | `settings.write`                  | standard |
| `/api/approvals`                                            | GET, POST, PATCH         | Session                   | `agent.read`                      | standard |
| `/api/approvals/execute`                                    | POST                     | Session                   | `agent.control`                   | standard |
| `/api/approvals/summary`                                    | GET                      | Session                   | `brain.read`                      | standard |
| `/api/audit`                                                | GET, POST                | Session                   | `settings.read`                   | standard |
| `/api/audit/verify`                                         | GET                      | Session                   | `admin.*`                         | standard |
| `/api/auth/2fa/disable`                                     | POST                     | Session                   | `auth.2fa`                        | standard |
| `/api/auth/2fa/login-verify`                                | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/2fa/setup`                                       | POST                     | Session                   | `auth.2fa`                        | standard |
| `/api/auth/2fa/verify`                                      | POST                     | Session                   | `auth.2fa`                        | standard |
| `/api/auth/email/confirm-change`                            | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/email/request-change`                            | POST                     | Session                   | `auth.email_change`               | standard |
| `/api/auth/forgot`                                          | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/login`                                           | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/logout`                                          | POST                     | Session                   | `auth.logout`                     | standard |
| `/api/auth/me`                                              | GET, PATCH               | Session                   | `settings.read`                   | standard |
| `/api/auth/reset`                                           | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/sessions`                                        | GET                      | Session                   | `settings.read`                   | standard |
| `/api/auth/sessions/revoke`                                 | POST                     | Session                   | `auth.sessions`                   | standard |
| `/api/auth/signup`                                          | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/sso/callback`                                    | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/sso/workos`                                      | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/auth/verify`                                          | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/automations`                                          | GET, POST, PATCH, DELETE | Session                   | `agent.read`                      | standard |
| `/api/autonomous/queue-stats`                               | GET                      | Session                   | `brain.read`                      | standard |
| `/api/autonomous/tasks`                                     | GET                      | Session                   | `brain.read`                      | standard |
| `/api/bea/export`                                           | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/bea/import`                                           | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/bea/receipt`                                          | POST                     | Session                   | `brain.write`                     | standard |
| `/api/bea/send`                                             | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/bea/send/retry`                                       | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/bea/status`                                           | GET                      | Session                   | `brain.read`                      | standard |
| `/api/billing/auto-reload-cron`                             | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/billing/case-usage`                                   | GET                      | Session                   | `billing.read`                    | standard |
| `/api/billing/checkout`                                     | POST                     | Session                   | `billing.write`                   | standard |
| `/api/billing/credit-checkout`                              | POST                     | Session                   | `billing.write`                   | standard |
| `/api/billing/credits`                                      | GET, POST                | Session                   | `billing.read`                    | standard |
| `/api/billing/estimate`                                     | GET                      | Session                   | `billing.read`                    | standard |
| `/api/billing/expire-credits`                               | GET, POST                | Session                   | `billing.write`                   | standard |
| `/api/billing/monthly-invoice`                              | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/billing/pipeline-reserve`                             | POST                     | Webhook-Signatur          | `billing.credit_consumption`      | standard |
| `/api/billing/pipeline-settle`                              | POST                     | Webhook-Signatur          | `billing.credit_consumption`      | standard |
| `/api/billing/portal`                                       | POST                     | Session                   | `billing.write`                   | standard |
| `/api/billing/token-usage`                                  | GET                      | Session                   | `billing.read`                    | standard |
| `/api/billing/webhook`                                      | POST                     | Webhook-Signatur          | `—`                               | standard |
| `/api/booking/public`                                       | GET, POST                | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/brain-quality`                                        | GET                      | Session                   | `brain.read`                      | standard |
| `/api/brain-quality/eval`                                   | GET                      | Session                   | `brain.read`                      | heavy    |
| `/api/brain/dream-cycle`                                    | POST                     | Session                   | `admin.*`                         | heavy    |
| `/api/brain/health`                                         | GET                      | Session                   | `brain.read`                      | standard |
| `/api/brain/stats`                                          | GET                      | Session                   | `brain.read`                      | standard |
| `/api/brains`                                               | GET                      | Session                   | `brain.read`                      | standard |
| `/api/bulk-cases`                                           | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/calendar/{token}/dav/documents`                       | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/calendar/{token}/dav/documents/{slug}`                | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/calendar/{token}/fristen.ics`                         | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cases/access`                                         | GET, PUT                 | Session                   | `brain.read`                      | standard |
| `/api/cases/ethical-wall`                                   | GET, PATCH               | Intern/spezial            | `—`                               | standard |
| `/api/cases/export`                                         | GET                      | Session                   | `brain.read`                      | heavy    |
| `/api/cases/legal-hold`                                     | POST                     | Session                   | `brain.write`                     | standard |
| `/api/cases/send-email`                                     | POST                     | Session                   | `brain.write`                     | standard |
| `/api/chat/sessions`                                        | GET, PUT, PATCH          | Session                   | `brain.read`                      | standard |
| `/api/claim-account`                                        | GET, POST, PATCH         | Session                   | `brain.write`                     | standard |
| `/api/clause-annotations`                                   | GET, POST, PATCH         | Session                   | `brain.read`                      | standard |
| `/api/comments`                                             | GET, POST, DELETE        | Session                   | `brain.read`                      | standard |
| `/api/concierge`                                            | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/concierge/lead`                                       | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/connectors`                                           | GET                      | Session                   | `connector.read`                  | standard |
| `/api/connectors/{service}/configure`                       | POST                     | Session                   | `connector.write`                 | standard |
| `/api/connectors/{service}/sync`                            | POST                     | Session                   | `connector.write`                 | heavy    |
| `/api/connectors/{service}/toggle`                          | POST                     | Session                   | `connector.write`                 | standard |
| `/api/copilot/draft-review`                                 | GET, POST, PATCH         | Session                   | `brain.read`                      | standard |
| `/api/copilot/explain`                                      | POST                     | Session                   | `brain.read`                      | search   |
| `/api/copilot/feedback`                                     | GET, POST                | Session                   | `copilot.tool`                    | standard |
| `/api/copilot/memory`                                       | GET, POST, PATCH, DELETE | Session                   | `brain.read`                      | standard |
| `/api/copilot/notifications`                                | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/copilot/plan`                                         | GET, POST, PATCH, DELETE | Session                   | `brain.read`                      | standard |
| `/api/copilot/tools`                                        | GET, POST                | Session                   | `copilot.tool`                    | standard |
| `/api/court-directory`                                      | GET                      | Session                   | `brain.read`                      | standard |
| `/api/cron/agent-tasks`                                     | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/analysis-retry`                                  | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/appointment-reminders`                           | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/auto-playbook`                                   | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/automations`                                     | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/autonomous-engine`                               | POST                     | Intern/spezial            | `—`                               | standard |
| `/api/cron/autopilot`                                       | POST                     | Intern/spezial            | `—`                               | standard |
| `/api/cron/billing-cleanup`                                 | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/case-law`                                        | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/case-scanner`                                    | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/contradiction-probe`                             | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/corpus-inventory`                                | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/daily-briefing`                                  | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/deadline-alerts`                                 | POST                     | Intern/spezial            | `—`                               | standard |
| `/api/cron/deadline-reminders`                              | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/deadlines`                                       | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/demo-cleanup`                                    | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/document-request-reminders`                      | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/dream-cycle`                                     | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/dunning-run`                                     | GET, POST                | Intern/spezial            | `—`                               | standard |
| `/api/cron/feedback-triage`                                 | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/health`                                          | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/imap-sync`                                       | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/integrity-recheck`                               | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/judgements-sync`                                 | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/law-sync`                                        | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/outlook-sync`                                    | GET, POST                | Intern/spezial            | `—`                               | standard |
| `/api/cron/outlook-user-sync`                               | GET, POST                | Intern/spezial            | `—`                               | standard |
| `/api/cron/post-upload-drain`                               | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/queue-alert`                                     | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/regulatory-monitors`                             | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/retention`                                       | GET                      | Intern/spezial            | `review`                          | standard |
| `/api/cron/ris-delta-watcher`                               | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/rundown`                                         | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/sanctions-sync`                                  | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/settlement-retry`                                | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/statute-currency`                                | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/time-suggestions`                                | GET, POST                | Intern/spezial            | `—`                               | standard |
| `/api/cron/time-tracking/inactivity-check`                  | GET, POST                | Intern/spezial            | `—`                               | standard |
| `/api/cron/trash-purge`                                     | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/trial-reminder`                                  | GET, POST                | Intern/spezial            | `—`                               | standard |
| `/api/cron/upload-multipart-cleanup`                        | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cron/upload-reconcile`                                | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/cti/webhook`                                          | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/dashboard/badges`                                     | GET                      | Session                   | `brain.read`                      | standard |
| `/api/dashboard/briefing`                                   | POST                     | Session                   | `brain.read`                      | standard |
| `/api/dashboard/cockpit`                                    | GET                      | Session                   | `brain.read`                      | standard |
| `/api/dashboard/operations`                                 | GET                      | Session                   | `brain.read`                      | standard |
| `/api/dashboard/widgets`                                    | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/data-export/backup`                                   | GET                      | Session                   | `admin.*`                         | heavy    |
| `/api/data-export/gdpr`                                     | GET                      | Session                   | `admin.data_export`               | heavy    |
| `/api/data-rooms`                                           | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/data-rooms/{id}`                                      | GET, PUT                 | Session                   | `brain.read`                      | standard |
| `/api/data-rooms/{id}/document`                             | GET                      | Session                   | `brain.read`                      | standard |
| `/api/data-rooms/{id}/members`                              | POST, DELETE             | Session                   | `brain.write`                     | standard |
| `/api/data-rooms/accept`                                    | POST                     | Session                   | `brain.read`                      | standard |
| `/api/datev/import`                                         | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/demo`                                                 | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/demo-data`                                            | GET, DELETE              | Session                   | `brain.read`                      | standard |
| `/api/demo/event`                                           | POST                     | Session                   | `brain.read`                      | standard |
| `/api/demo/gate`                                            | POST                     | Session                   | `brain.read`                      | standard |
| `/api/demo/health`                                          | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/demo/ingest`                                          | POST                     | Session                   | `brain.write`                     | standard |
| `/api/demo/session`                                         | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/demo/session/reset`                                   | POST                     | Session                   | `brain.write`                     | standard |
| `/api/dictation`                                            | GET, POST                | Session                   | `brain.write`                     | heavy    |
| `/api/dms/content`                                          | GET                      | Session                   | `brain.read`                      | standard |
| `/api/dms/import`                                           | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/dms/push`                                             | POST                     | Session                   | `brain.read`                      | heavy    |
| `/api/dms/search`                                           | GET                      | Session                   | `brain.read`                      | standard |
| `/api/dms/status`                                           | GET                      | Session                   | `settings.read`                   | standard |
| `/api/document-interviews`                                  | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/document-requests`                                    | GET, POST, PATCH         | Session                   | `brain.read`                      | standard |
| `/api/documents/retry`                                      | POST                     | Session                   | `brain.write`                     | standard |
| `/api/docusign/auth`                                        | GET                      | Session                   | `settings.read`                   | standard |
| `/api/docusign/callback`                                    | GET                      | Session                   | `settings.write`                  | standard |
| `/api/docusign/disconnect`                                  | POST                     | Session                   | `settings.write`                  | standard |
| `/api/docusign/envelopes`                                   | GET                      | Session                   | `settings.read`                   | standard |
| `/api/docusign/send`                                        | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/docusign/status`                                      | GET                      | Session                   | `settings.read`                   | standard |
| `/api/docusign/webhook`                                     | POST                     | Webhook-Signatur          | `—`                               | standard |
| `/api/e-invoice/generate`                                   | POST                     | Session                   | `invoice.e_invoice`               | standard |
| `/api/e-invoice/parse`                                      | POST                     | Session                   | `invoice.e_invoice`               | standard |
| `/api/e-invoice/send`                                       | GET, POST                | Session                   | `invoice.e_invoice`               | standard |
| `/api/e-invoice/validate`                                   | POST                     | Session                   | `invoice.e_invoice`               | standard |
| `/api/email-import`                                         | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/email/accounts`                                       | GET, POST                | Session                   | `settings.read`                   | standard |
| `/api/email/accounts/{id}`                                  | PATCH, DELETE            | Session                   | `settings.write`                  | standard |
| `/api/email/accounts/{id}/calendar-sync`                    | POST                     | Session                   | `settings.write`                  | standard |
| `/api/email/accounts/{id}/sync`                             | POST                     | Session                   | `settings.write`                  | heavy    |
| `/api/email/draft-reply`                                    | POST                     | Session                   | `brain.read`                      | heavy    |
| `/api/email/messages`                                       | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/email/messages/{id}`                                  | GET, PATCH               | Session                   | `brain.read`                      | standard |
| `/api/email/messages/{id}/draft-reply`                      | POST                     | Session                   | `brain.read`                      | heavy    |
| `/api/email/messages/{id}/reply`                            | POST                     | Session                   | `brain.write`                     | standard |
| `/api/email/messages/{id}/tracking`                         | GET                      | Session                   | `brain.read`                      | standard |
| `/api/email/oauth/{provider}/callback`                      | GET                      | Session                   | `settings.write`                  | standard |
| `/api/email/oauth/{provider}/start`                         | GET                      | Session                   | `settings.write`                  | standard |
| `/api/email/track/c/{trackingId}`                           | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/email/track/o/{trackingId}`                           | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/email/webhook/resend`                                 | POST                     | Webhook-Signatur          | `—`                               | standard |
| `/api/eval-fixture-reviews`                                 | GET, POST, PATCH         | Session                   | `legal.eval_fixture_review`       | standard |
| `/api/eval-fixture-reviews/questions`                       | GET                      | Session                   | `legal.eval_fixture_review`       | standard |
| `/api/expenses`                                             | GET, POST, PATCH, DELETE | Session                   | `expenses.read`                   | standard |
| `/api/expenses/mark-billed`                                 | POST                     | Session                   | `expenses.update`                 | standard |
| `/api/expenses/unbill`                                      | POST                     | Session                   | `expenses.update`                 | standard |
| `/api/experience`                                           | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/export`                                               | GET                      | Session                   | `brain.read`                      | heavy    |
| `/api/fachrechner`                                          | POST                     | Session                   | `brain.read`                      | standard |
| `/api/fao-tracking`                                         | GET, POST                | Session                   | `settings.write`                  | standard |
| `/api/fee-agreements`                                       | GET, POST                | Session                   | `invoice.write`                   | standard |
| `/api/fibu/bank-feed`                                       | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/fibu/camt-import`                                     | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/fibu/opos`                                            | GET, POST                | Session                   | `invoice.write`                   | standard |
| `/api/fibu/payment-links`                                   | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/files/{...slug}`                                      | GET                      | Session                   | `brain.read`                      | standard |
| `/api/graph`                                                | GET                      | Session                   | `brain.read`                      | standard |
| `/api/health`                                               | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/health/credits`                                       | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/inbound-register`                                     | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/inbox`                                                | GET                      | Session                   | `brain.read`                      | standard |
| `/api/inbox/read`                                           | PATCH                    | Session                   | `brain.write`                     | standard |
| `/api/insights`                                             | GET                      | Session                   | `brain.read`                      | heavy    |
| `/api/intake`                                               | GET, POST, PATCH         | Session                   | `brain.read`                      | standard |
| `/api/intake/convert`                                       | POST                     | Session                   | `brain.write`                     | standard |
| `/api/intake/public`                                        | POST                     | Session                   | `—`                               | standard |
| `/api/internal/alert`                                       | POST                     | Intern/spezial            | `—`                               | standard |
| `/api/internal/engine-user-status`                          | GET                      | Webhook-Signatur          | `—`                               | standard |
| `/api/internal/post-upload`                                 | POST                     | Intern/spezial            | `—`                               | standard |
| `/api/internal/revocation-check`                            | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/invoices/{slug}`                                      | GET, PATCH, DELETE       | Session                   | `invoice.read`                    | standard |
| `/api/invoices/{slug}/storno`                               | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/invoices/number`                                      | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/invoices/remind`                                      | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/invoices/send`                                        | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/kyc`                                                  | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/kyc/{id}`                                             | GET, PATCH               | Session                   | `brain.read`                      | standard |
| `/api/legal-insurance`                                      | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/legal/ai-deadlines`                                   | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/legal/analytics`                                      | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/legal/analytics/{slug}`                               | GET, PATCH, DELETE       | Session                   | `brain.read`                      | standard |
| `/api/legal/analyze`                                        | POST                     | Session                   | `legal.document_review`           | heavy    |
| `/api/legal/anonymize`                                      | POST                     | Session → Engine          | `legal.anonymize`                 | standard |
| `/api/legal/appointments/video-link`                        | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/auto-playbook`                                  | POST                     | Session → Engine          | `legal.playbook`                  | standard |
| `/api/legal/batch-pipeline`                                 | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/legal/berufungsgruende`                               | POST                     | Session                   | `legal.berufungsgruende`          | heavy    |
| `/api/legal/case-investigation`                             | POST                     | Session → Engine          | `legal.case_investigation`        | standard |
| `/api/legal/case-investigation/{runId}`                     | GET                      | Session                   | `brain.read`                      | standard |
| `/api/legal/case-investigation/{runId}/contradictions/{id}` | PATCH                    | Session                   | `legal.case_investigation_review` | standard |
| `/api/legal/case-number/allocate`                           | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/case-scanner`                                   | POST                     | Session → Engine          | `legal.case_scanner`              | heavy    |
| `/api/legal/case-strategy`                                  | POST                     | Session                   | `legal.strategy`                  | heavy    |
| `/api/legal/chronology`                                     | POST                     | Session                   | `brain.read`                      | standard |
| `/api/legal/commentaries`                                   | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/legal/commentaries/{id}`                              | GET, DELETE              | Session                   | `brain.read`                      | standard |
| `/api/legal/communications`                                 | GET                      | Session                   | `brain.read`                      | standard |
| `/api/legal/conflict-check`                                 | POST                     | Session → Engine          | `legal.conflict`                  | standard |
| `/api/legal/contract-draft`                                 | POST                     | Session → Engine          | `legal.contract_draft`            | standard |
| `/api/legal/contract-redline`                               | POST                     | Session                   | `legal.redline`                   | heavy    |
| `/api/legal/contradiction-probe`                            | GET                      | Session                   | `legal.contradictions`            | standard |
| `/api/legal/contradictions`                                 | POST                     | Session                   | `legal.contradictions`            | heavy    |
| `/api/legal/deadlines.ics`                                  | GET                      | Session                   | `brain.read`                      | standard |
| `/api/legal/deep-analysis`                                  | POST                     | Session → Engine          | `legal.deep_analysis`             | standard |
| `/api/legal/deep-analysis/run/{id}`                         | GET                      | Session                   | `legal.deep_analysis`             | standard |
| `/api/legal/deep-analysis/run/{id}/cancel`                  | POST                     | Session                   | `legal.deep_analysis`             | standard |
| `/api/legal/deep-analysis/start`                            | POST                     | Session → Engine          | `legal.deep_analysis`             | standard |
| `/api/legal/documents/checkin`                              | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/documents/checkout`                             | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/documents/release`                              | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/documents/versions`                             | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/legal/docx-fill`                                      | POST                     | Session                   | `legal.playbook`                  | heavy    |
| `/api/legal/eval-gate`                                      | POST                     | Session                   | `brain.read`                      | standard |
| `/api/legal/feedback`                                       | GET                      | Session                   | `brain.read`                      | standard |
| `/api/legal/folders/rename`                                 | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/legal/frist/compute`                                  | POST                     | Session                   | `brain.read`                      | standard |
| `/api/legal/fristen`                                        | GET                      | Session                   | `brain.read`                      | standard |
| `/api/legal/fristen/second-check`                           | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/fristenbuch`                                    | GET                      | Session                   | `brain.read`                      | standard |
| `/api/legal/fristenreport`                                  | POST                     | Session                   | `legal.fristenreport`             | standard |
| `/api/legal/ground`                                         | POST                     | Session                   | `legal.research`                  | standard |
| `/api/legal/judgements-db`                                  | GET                      | Session                   | `legal.judgements`                | standard |
| `/api/legal/judgements-db/{id}`                             | GET, POST                | Session                   | `legal.judgements`                | standard |
| `/api/legal/judgements-db/graph-embeddings`                 | GET, POST                | Session                   | `legal.judgements`                | standard |
| `/api/legal/judgements-db/import`                           | GET, POST                | Session                   | `legal.judgements`                | standard |
| `/api/legal/judgements-db/pipeline`                         | POST                     | Session                   | `legal.judgements`                | standard |
| `/api/legal/judgements-search`                              | GET                      | Session                   | `legal.judgements`                | standard |
| `/api/legal/judgements-sync`                                | POST                     | Session → Engine          | `legal.judgements`                | standard |
| `/api/legal/litigation`                                     | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/legal/litigation/{slug}`                              | GET, PATCH, DELETE       | Session                   | `brain.read`                      | standard |
| `/api/legal/matter-knowledge`                               | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/memo`                                           | POST                     | Session → Engine          | `legal.memo`                      | standard |
| `/api/legal/norm`                                           | GET                      | Session                   | `legal.research`                  | standard |
| `/api/legal/obligation-extract`                             | POST                     | Session → Engine          | `legal.obligation_extract`        | heavy    |
| `/api/legal/opponent-simulation`                            | POST                     | Session                   | `legal.opponent_simulation`       | heavy    |
| `/api/legal/pdf-tools`                                      | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/legal/perspektiven-room`                              | POST                     | Session                   | `legal.strategy`                  | heavy    |
| `/api/legal/playbooks`                                      | GET, POST                | Session                   | `legal.playbook`                  | standard |
| `/api/legal/playbooks/{slug}`                               | GET, PATCH, DELETE       | Session                   | `legal.playbook`                  | standard |
| `/api/legal/portfolio-insights`                             | GET                      | Session → Engine          | `legal.portfolio_insights`        | standard |
| `/api/legal/precedent-search`                               | POST                     | Session → Engine          | `legal.precedent_search`          | search   |
| `/api/legal/questionnaires`                                 | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/legal/receipts/{receiptId}`                           | GET                      | Session                   | `legal.receipt`                   | standard |
| `/api/legal/receipts/latest`                                | GET                      | Session                   | `legal.receipt`                   | standard |
| `/api/legal/reorder-gruende`                                | POST                     | Session                   | `legal.reorder_gruende`           | standard |
| `/api/legal/research`                                       | POST                     | Session                   | `legal.research`                  | heavy    |
| `/api/legal/retrieval-feedback`                             | GET, POST                | Session                   | `legal.retrieval_feedback`        | standard |
| `/api/legal/review-sets`                                    | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/legal/review-sets/{slug}`                             | GET, PATCH, DELETE       | Session                   | `brain.read`                      | standard |
| `/api/legal/risk-analysis`                                  | POST                     | Session → Engine          | `legal.risk_analysis`             | standard |
| `/api/legal/rksv`                                           | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/legal/rvg`                                            | GET, POST                | Session                   | `legal.rvg`                       | standard |
| `/api/legal/save-to-matter`                                 | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/schriftsatz`                                    | POST                     | Session → Engine          | `legal.schriftsatz`               | standard |
| `/api/legal/secretary-metrics`                              | GET                      | Session                   | `admin.*`                         | standard |
| `/api/legal/sources`                                        | GET, POST                | Session                   | `legal.judgements`                | standard |
| `/api/legal/submission-review`                              | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/submission-to-document`                         | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/legal/subsumption`                                    | POST                     | Session                   | `legal.subsumption`               | heavy    |
| `/api/legal/summarize`                                      | POST                     | Session → Engine          | `legal.document_review`           | standard |
| `/api/legal/support`                                        | POST                     | Session                   | `legal.research`                  | heavy    |
| `/api/legal/tabular-review`                                 | POST                     | Session → Engine          | `legal.tabular`                   | standard |
| `/api/legal/tabular-review/{slug}`                          | GET                      | Session                   | `legal.tabular`                   | standard |
| `/api/legal/tabular-review/{slug}/retry`                    | POST                     | Session                   | `legal.tabular`                   | heavy    |
| `/api/legal/tabular-review/start`                           | POST                     | Session → Engine          | `legal.tabular`                   | standard |
| `/api/legal/templates`                                      | GET, POST                | Session                   | `legal.playbook`                  | standard |
| `/api/legal/templates/{slug}`                               | GET, PATCH, DELETE       | Session                   | `legal.playbook`                  | standard |
| `/api/legal/translate`                                      | POST                     | Session → Engine          | `legal.translate`                 | heavy    |
| `/api/legal/trigger-pipeline`                               | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/legal/trust-accounts`                                 | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/legal/trust-accounts/{slug}`                          | GET, POST, PATCH, DELETE | Session                   | `brain.read`                      | standard |
| `/api/legal/trust-accounts/{slug}/reconciliations`          | POST                     | Session                   | `brain.write`                     | standard |
| `/api/legal/verjaehrung`                                    | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/legal/wiedervorlage`                                  | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/legal/writing-styles`                                 | GET, POST, DELETE        | Session                   | `brain.read`                      | standard |
| `/api/matter-context/{caseSlug}`                            | GET                      | Session                   | `brain.read`                      | standard |
| `/api/matter-context/{caseSlug}/investigation-suggest`      | GET                      | Session                   | `brain.read`                      | standard |
| `/api/matter-context/{caseSlug}/understanding`              | GET                      | Session                   | `brain.read`                      | standard |
| `/api/monitoring/publish-alert`                             | POST                     | Session                   | `brain.write`                     | standard |
| `/api/monitoring/slo`                                       | GET                      | Session                   | `platform.operator`               | standard |
| `/api/notifications`                                        | GET, POST, PATCH, DELETE | Session                   | `brain.read`                      | standard |
| `/api/notifications/health`                                 | GET                      | Session                   | `brain.read`                      | standard |
| `/api/ocr-status`                                           | GET                      | Session                   | `brain.read`                      | standard |
| `/api/onboarding`                                           | GET, POST, PATCH         | Session                   | `onboarding.complete`             | standard |
| `/api/openapi.json`                                         | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/org`                                                  | GET, POST, PATCH, DELETE | Session                   | `brain.read`                      | standard |
| `/api/org/invite`                                           | POST                     | Session                   | `brain.write`                     | standard |
| `/api/org/join`                                             | POST                     | Session                   | `brain.read`                      | standard |
| `/api/org/member`                                           | DELETE                   | Session                   | `brain.write`                     | standard |
| `/api/outbound-register`                                    | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/outlook/calendar`                                     | GET                      | Session                   | `connector.read`                  | standard |
| `/api/outlook/calendar/create`                              | POST                     | Session                   | `brain.write`                     | standard |
| `/api/outlook/callback`                                     | GET                      | Session                   | `settings.read`                   | standard |
| `/api/outlook/connect`                                      | GET                      | Session                   | `settings.read`                   | standard |
| `/api/outlook/disconnect`                                   | POST                     | Session                   | `settings.write`                  | standard |
| `/api/outlook/mail`                                         | GET                      | Session                   | `connector.read`                  | standard |
| `/api/outlook/status`                                       | GET                      | Session                   | `settings.read`                   | standard |
| `/api/pages`                                                | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/pages/{...slug}`                                      | GET, PATCH, DELETE       | Session                   | `brain.read`                      | standard |
| `/api/pages/batch`                                          | POST                     | Session                   | `brain.read`                      | standard |
| `/api/pages/batch-list`                                     | POST                     | Session                   | `brain.read`                      | standard |
| `/api/pipeline/list`                                        | GET                      | Session                   | `brain.read`                      | standard |
| `/api/pipeline/resume`                                      | POST                     | Intern/spezial            | `—`                               | standard |
| `/api/pipeline/start`                                       | POST                     | Intern/spezial            | `—`                               | standard |
| `/api/pkh-beratungshilfe`                                   | POST                     | Session                   | `legal.rvg`                       | standard |
| `/api/portal/case`                                          | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/chat`                                          | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/document`                                      | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/document-requests`                             | GET                      | Öffentlich (rate-limited) | `case.view`                       | standard |
| `/api/portal/feedback`                                      | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/generate`                                      | POST                     | Session                   | `brain.write`                     | standard |
| `/api/portal/invoices`                                      | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/links`                                         | GET                      | Session                   | `brain.read`                      | standard |
| `/api/portal/manifest`                                      | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/portal/message`                                       | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/messages`                                      | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/notify`                                        | POST, DELETE             | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/notify/confirm`                                | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/portal/push`                                          | GET, POST, DELETE        | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/questionnaires`                                | GET, POST                | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/reply`                                         | POST                     | Session                   | `brain.write`                     | standard |
| `/api/portal/revoke`                                        | POST                     | Session                   | `brain.write`                     | standard |
| `/api/portal/send-link`                                     | POST                     | Session                   | `brain.write`                     | standard |
| `/api/portal/session`                                       | POST, DELETE             | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/sign`                                          | POST                     | Öffentlich (rate-limited) | `signature.capture`               | standard |
| `/api/portal/signable-docs`                                 | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/portal/upload`                                        | POST                     | Öffentlich (rate-limited) | `document.upload`                 | standard |
| `/api/portal/verify`                                        | GET                      | Öffentlich (rate-limited) | `view`                            | standard |
| `/api/portal/workflows`                                     | GET, POST                | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/post-upload-tasks`                                    | GET                      | Session                   | `brain.read`                      | standard |
| `/api/post-upload-tasks/retry`                              | POST                     | Session                   | `brain.write`                     | standard |
| `/api/power-of-attorney`                                    | GET, POST                | Session                   | `brain.write`                     | standard |
| `/api/power-of-attorney/generate-pdf`                       | POST                     | Session                   | `brain.write`                     | standard |
| `/api/push/register`                                        | GET, POST, DELETE        | Session                   | `push.register`                   | standard |
| `/api/queries/recent`                                       | GET                      | Session                   | `brain.read`                      | standard |
| `/api/rciid/cases`                                          | GET                      | Session                   | `brain.read`                      | standard |
| `/api/rciid/detect-wallets`                                 | GET, POST, PUT           | Session                   | `brain.read`                      | standard |
| `/api/rciid/feedback`                                       | POST                     | Session                   | `brain.read`                      | standard |
| `/api/rciid/report`                                         | POST                     | Session                   | `brain.read`                      | standard |
| `/api/rciid/scan-case`                                      | POST                     | Session                   | `brain.read`                      | heavy    |
| `/api/rciid/status`                                         | POST                     | Session                   | `brain.read`                      | standard |
| `/api/rciid/submit`                                         | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/rciid/webhook`                                        | POST                     | Webhook-Signatur          | `rciid.webhook_received`          | standard |
| `/api/readiness`                                            | GET                      | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/realtime/presence`                                    | GET, POST                | Session                   | `presence.update`                 | standard |
| `/api/realtime/sse`                                         | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/red-team`                                             | POST                     | Session                   | `legal.risk_analysis`             | heavy    |
| `/api/review-inbox`                                         | GET                      | Session                   | `brain.read`                      | standard |
| `/api/review-inbox/deadline-decision`                       | POST                     | Session                   | `brain.write`                     | standard |
| `/api/review-table/ask`                                     | POST                     | Session                   | `brain.read`                      | heavy    |
| `/api/scim/Groups`                                          | GET, POST                | SCIM Bearer-Token         | `—`                               | standard |
| `/api/scim/Groups/{id}`                                     | GET, PUT, PATCH, DELETE  | SCIM Bearer-Token         | `—`                               | standard |
| `/api/scim/status`                                          | GET                      | Session                   | `scim.read`                       | standard |
| `/api/scim/sync`                                            | POST                     | Session                   | `scim.write`                      | heavy    |
| `/api/scim/Users`                                           | GET, POST                | SCIM Bearer-Token         | `—`                               | standard |
| `/api/scim/Users/{id}`                                      | GET, PUT, PATCH, DELETE  | SCIM Bearer-Token         | `—`                               | standard |
| `/api/search`                                               | GET                      | Session                   | `query.submit`                    | search   |
| `/api/settings/api-keys`                                    | GET, POST                | Session                   | `settings.write`                  | standard |
| `/api/settings/brain-learning`                              | GET, PATCH               | Session                   | `settings.read`                   | standard |
| `/api/settings/calendar-feed`                               | GET, POST, DELETE        | Session                   | `settings.read`                   | standard |
| `/api/settings/dav-access`                                  | GET, POST, DELETE        | Session                   | `settings.read`                   | standard |
| `/api/settings/gdpr/data-deletion`                          | POST                     | Session                   | `settings.write`                  | heavy    |
| `/api/settings/gdpr/data-export`                            | GET                      | Session                   | `settings.read`                   | heavy    |
| `/api/settings/jurisdiction`                                | POST                     | Session                   | `settings.write`                  | standard |
| `/api/settings/mcp-tokens`                                  | GET, POST                | Session                   | `settings.read`                   | standard |
| `/api/settings/mcp-tokens/{id}`                             | DELETE                   | Session                   | `settings.write`                  | standard |
| `/api/settings/model`                                       | GET, PATCH               | Session                   | `settings.read`                   | standard |
| `/api/settings/model-profile`                               | GET, PUT                 | Session                   | `settings.read`                   | standard |
| `/api/share`                                                | POST                     | Session                   | `share.receive`                   | standard |
| `/api/signature/capture`                                    | POST                     | Session                   | `brain.write`                     | standard |
| `/api/signature/qes/done/{token}`                           | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/signature/qes/error/{token}`                          | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/signature/qes/pdf/{token}`                            | GET                      | Intern/spezial            | `—`                               | standard |
| `/api/signature/qes/start`                                  | POST                     | Session                   | `brain.write`                     | standard |
| `/api/signature/qes/status`                                 | GET                      | Session                   | `brain.read`                      | standard |
| `/api/sms/consent`                                          | GET, POST                | Session                   | `agent.write`                     | standard |
| `/api/sms/send`                                             | POST                     | Session                   | `agent.write`                     | standard |
| `/api/sms/status`                                           | GET, POST                | Session                   | `agent.read`                      | standard |
| `/api/staff`                                                | GET, POST, PATCH         | Session                   | `brain.write`                     | standard |
| `/api/stats`                                                | GET                      | Session                   | `brain.read`                      | standard |
| `/api/team`                                                 | GET                      | Session                   | `settings.read`                   | standard |
| `/api/team/role`                                            | POST, PATCH              | Session                   | `team.role_change`                | standard |
| `/api/think`                                                | POST                     | Session                   | `query.submit`                    | heavy    |
| `/api/time`                                                 | GET, POST, PATCH, DELETE | Session                   | `invoice.read`                    | standard |
| `/api/time-suggestions`                                     | GET                      | Session                   | `brain.read`                      | standard |
| `/api/time-tracking/current`                                | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/time-tracking/heartbeat`                              | POST                     | Session                   | `brain.write`                     | standard |
| `/api/time-tracking/passive-preference`                     | GET, PUT                 | Session                   | `brain.read`                      | standard |
| `/api/time-tracking/stop`                                   | POST                     | Session                   | `brain.write`                     | standard |
| `/api/time/auto-extract`                                    | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/time/billing-summary`                                 | GET                      | Session                   | `invoice.read`                    | standard |
| `/api/time/mark-billed`                                     | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/time/unbill`                                          | POST                     | Session                   | `invoice.write`                   | standard |
| `/api/trash`                                                | GET, POST                | Session                   | `brain.read`                      | standard |
| `/api/triage`                                               | POST                     | Session                   | `brain.read`                      | standard |
| `/api/triage/action`                                        | POST                     | Session                   | `brain.write`                     | standard |
| `/api/upload`                                               | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/upload-status/{...slug}`                              | GET                      | Session                   | `brain.read`                      | standard |
| `/api/upload-token`                                         | POST                     | Session                   | `brain.write`                     | standard |
| `/api/upload/confirm`                                       | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/upload/presign`                                       | POST                     | Session                   | `brain.write`                     | standard |
| `/api/upload/presign-batch`                                 | POST                     | Session                   | `brain.write`                     | heavy    |
| `/api/usage`                                                | GET                      | Session                   | `brain.read`                      | standard |
| `/api/usage/quota`                                          | GET                      | Session                   | `brain.read`                      | standard |
| `/api/webhook/incoming`                                     | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/webhooks/outgoing`                                    | GET, POST, DELETE        | Session                   | `settings.write`                  | standard |
| `/api/whatsapp/client-invites`                              | POST                     | Session                   | `brain.write`                     | standard |
| `/api/whatsapp/flow-endpoint`                               | POST                     | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/whatsapp/identities`                                  | GET, POST, PATCH, DELETE | Session                   | `settings.read`                   | standard |
| `/api/whatsapp/muted`                                       | GET                      | Session                   | `agent.read`                      | standard |
| `/api/whatsapp/send`                                        | POST                     | Session                   | `agent.write`                     | standard |
| `/api/whatsapp/status`                                      | GET                      | Session                   | `settings.read`                   | standard |
| `/api/whatsapp/templates`                                   | GET, POST, PATCH, DELETE | Session                   | `settings.read`                   | standard |
| `/api/whatsapp/webhook`                                     | GET, POST                | Öffentlich (rate-limited) | `—`                               | standard |
| `/api/word-export`                                          | POST                     | Session                   | `brain.read`                      | standard |
| `/api/work-products`                                        | GET, POST                | Session                   | `legal.memo`                      | standard |
| `/api/work-products/{id}`                                   | GET, PATCH               | Session                   | `legal.memo`                      | standard |
| `/api/work-products/{id}/export`                            | GET                      | Session                   | `legal.memo`                      | standard |
| `/api/work-products/{id}/transition`                        | POST                     | Session                   | `legal.memo`                      | standard |
| `/api/work-products/memo/generate`                          | POST                     | Session                   | `legal.memo`                      | heavy    |
| `/api/workflows`                                            | GET, POST, PATCH         | Session                   | `admin.*`                         | standard |
| `/api/workflows/approve`                                    | POST                     | Session                   | `workflow.approve`                | standard |
