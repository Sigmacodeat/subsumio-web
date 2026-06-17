---
name: connector-ingest
version: 1.0.0
description: |
  Connect GBrain to external systems (Google Drive, Gmail, Notion, GitHub,
  Slack, Calendar) and sync content into the brain automatically. Delta sync
  with OAuth2, webhooks, and rate-limiting.
triggers:
  - "connect google drive"
  - "connect gmail"
  - "connect notion"
  - "connect github"
  - "sync google drive"
  - "sync gmail"
  - "sync notion"
  - "sync github"
  - "connector status"
  - "list connectors"
  - "add connector"
  - "remove connector"
  - "pull from google drive"
  - "pull from gmail"
  - "pull from notion"
  - "pull from github"
tools:
  - search
  - get_page
  - put_page
mutating: true
---

# connector-ingest — External System Connectors

> **Convention:** see [conventions/quality.md](../conventions/quality.md) for
> citation rules and back-link enforcement.

## Overview

Connect GBrain to external productivity systems and sync their content into
brain pages automatically. Every synced item becomes a brain page with full
search, entity extraction, and cross-linking.

## Supported Connectors

| Connector | Auth | Delta Sync | Content Types |
|-----------|------|-----------|---------------|
| **Google Drive** | OAuth2 | Changes API (pageToken) | PDF, DOCX, Sheets, Slides, Images |
| **Gmail** | OAuth2 | History API (historyId) | Emails, Attachments |
| **Notion** | API Key | last_edited_time polling | Pages, Databases, Blocks |
| **GitHub** | PAT | updated_at + ETag | Issues, PRs, Discussions, Comments |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ConnectorManager                             │
│  ┌─────────────┐ ┌─────────┐ ┌────────┐ ┌────────────────┐  │
│  │ GoogleDrive │ │  Gmail  │ │ Notion │ │     GitHub     │  │
│  └──────┬──────┘ └────┬────┘ └───┬────┘ └───────┬────────┘  │
│         │             │          │              │            │
│  ┌──────▼─────────────▼──────────▼──────────────▼────────┐  │
│  │              IngestionDaemon                           │  │
│  │  validate → dedup → rate-limit → dispatch → put_page    │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

Each connector is a full `IngestionSource` supervised by the daemon:
- **Rate limiting:** Token bucket per API (Google 1000/100s, Notion 30/10s, etc.)
- **Retry:** Exponential backoff on API errors (3 retries, max 30s)
- **Dedup:** 24h content-hash window (trickle mode) or slug-keyed permanent (migration mode)
- **Health:** `gbrain doctor` checks connector health every 60s

## Setup Commands

### Google Drive

```bash
# 1. Create OAuth2 credentials at https://console.cloud.google.com/
#    Enable Google Drive API
#    Add redirect URI: http://localhost:3000/oauth/callback
# 2. Add connector credentials (does NOT authenticate yet)
gbrain connector add google-drive \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET

# 3. Authenticate via PKCE OAuth2 web flow (opens browser)
gbrain connector auth google-drive

# 4. Sync now
gbrain connector sync google-drive

# 5. Sync specific folder only
gbrain connector sync google-drive --filters '{"folder":"FOLDER_ID"}'

# 6. Enable push webhook (optional — real-time sync instead of polling)
#    Requires a publicly accessible URL (use ngrok for local dev):
#    ngrok http 3000
#    Then add the webhook URL:
gbrain connector add google-drive \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --webhook-url https://your-ngrok-url.ngrok.io/webhooks/google-drive
#    The connector auto-registers with Google Drive on next daemon start.
```

### Gmail

```bash
# 1. Enable Gmail API in Google Cloud Console
#    Add redirect URI: http://localhost:3000/oauth/callback
# 2. Add connector credentials
gbrain connector add gmail \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET

# 3. Authenticate via PKCE OAuth2 web flow
gbrain connector auth gmail

# 4. Sync
gbrain connector sync gmail

# Sync only specific labels
gbrain connector sync gmail --filters '{"labels":["INBOX","WORK"]}'
```

### Notion

```bash
# 1. Create integration at https://www.notion.so/my-integrations
# 2. Share pages/databases with the integration

gbrain connector add notion --api-key secret_XXX

gbrain connector sync notion
```

### GitHub

```bash
# 1. Create PAT at https://github.com/settings/tokens

gbrain connector add github --api-key ghp_XXX

# Sync specific repos only
gbrain connector sync github --filters '{"repos":["owner/repo1","owner/repo2"]}'

# Sync only issues with specific labels
gbrain connector sync github --filters '{"labels":["bug","feature"]}'
```

### Slack

```bash
# 1. Create app at https://api.slack.com/apps
# 2. Add Bot Token Scopes: channels:history, groups:history, channels:read
# 3. Install app to workspace → copy Bot User OAuth Token (xoxb-...)

gbrain connector add slack --api-key xoxb-XXX

gbrain connector sync slack

# Sync only specific channels
gbrain connector sync slack --filters '{"channels":["general","work"]}'
```

### Google Calendar

```bash
# 1. Enable Google Calendar API in Google Cloud Console
#    Add redirect URI: http://localhost:3000/oauth/callback
# 2. Add connector credentials
gbrain connector add calendar \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET

# 3. Authenticate via PKCE OAuth2 web flow
gbrain connector auth calendar

# 4. Sync
gbrain connector sync calendar

# Sync only specific calendars
gbrain connector sync calendar --filters '{"calendars":["primary","work@company.com"]}'
```

### Dropbox

```bash
# 1. Create app at https://www.dropbox.com/developers/apps
# 2. Generate access token (Permissions: files.content.read)

gbrain connector add dropbox --api-key YOUR_ACCESS_TOKEN

gbrain connector sync dropbox

# Sync only a specific folder
gbrain connector sync dropbox --filters '{"folder":"/Documents"}'
```

### Asana

```bash
# 1. Get Personal Access Token at https://app.asana.com/0/developer-console

gbrain connector add asana --api-key YOUR_PAT

gbrain connector sync asana

# Sync only specific workspaces or projects
gbrain connector sync asana --filters '{"workspaces":["Engineering"],"projects":["Sprint 1"]}'
```

### Jira

```bash
# 1. Get API token at https://id.atlassian.com/manage-profile/security/api-tokens
# 2. Your email + API token become the api-key (colon-separated)

gbrain connector add jira \
  --api-key YOUR_EMAIL:YOUR_API_TOKEN \
  --base-url https://your-domain.atlassian.net

gbrain connector sync jira

# Sync only specific projects, issue types, or labels
gbrain connector sync jira --filters '{"projects":["PROJ"],"issue_types":["Bug","Story"],"labels":["critical"]}'
```

## Management Commands

```bash
# List all connectors with status
gbrain connector list

# Check connector health
gbrain connector status google-drive

# Enable/disable connector
gbrain connector enable google-drive
gbrain connector disable google-drive

# Remove connector (deletes state + tokens)
gbrain connector remove google-drive

# Trigger one-shot sync (bulk migration mode)
gbrain connector sync google-drive --mode migration

# Reset sync cursor (full re-sync)
gbrain connector reset google-drive
```

## Delta Sync Details

### Google Drive
- **Mechanism:** `changes.list(startPageToken)` → `changes.list(pageToken)`
- **Cursor:** `pageToken` (opaque string from Google)
- **Granularity:** File-level (created, modified, deleted)
- **Webhook:** Optional via Drive push notifications (requires domain verification)

### Gmail
- **Mechanism:** `history.list(startHistoryId)` filtered by `messageAdded`
- **Cursor:** `historyId` (uint64 string)
- **Granularity:** Message-level
- **Filtering:** By label (INBOX, SENT, custom labels)

### Notion
- **Mechanism:** `search` with `sort: {timestamp: last_edited_time, direction: descending}`
- **Cursor:** ISO timestamp of last sync
- **Granularity:** Page-level (re-fetches all blocks for changed pages)
- **Limitations:** No native delta API; polls every 5 minutes

### GitHub
- **Mechanism:** `issues?since=YYYY-MM-DDTHH:MM:SSZ` per repo
- **Cursor:** ISO timestamp of last sync
- **Granularity:** Issue/PR-level with comments
- **Auto-discovery:** If no repos configured, syncs watched repos

## Content Type Routing

The daemon routes connector events based on content_type:

| Content Type | Destination | Processing |
|--------------|-------------|------------|
| `text/markdown` | Direct brain page | Frontmatter + body |
| `text/html` | HTML-to-markdown → brain page | Strip tags |
| `application/pdf` | `document-ingest` skill | OCR if needed |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `document-ingest` skill | mammoth extraction |
| `image/*` | `media-ingest` skill | OCR, embed |
| `application/json` | Connector-specific parser | Blocks → markdown |

## Filing Rules

Connector content is filed under:
- Google Drive: `documents/google-drive/<filename>`
- Gmail: `documents/correspondence/emails/<subject>`
- Notion: `notes/notion/<page-title>`
- GitHub: `tech/github/<repo>/<type>-<number>`

## Security

- **OAuth2 tokens:** Stored in `~/.gbrain/connectors/<service>.json`, never committed
- **Token refresh:** Automatic; no manual intervention
- **Scope minimalism:** Connectors request only read scopes
- **Untrusted payload flag:** Set for all connector content; auto-link skipped, slug-allowlist applied

## Daemon Auto-Start

Connectors auto-start when `gbrain serve --http` or `gbrain autopilot` boots.
No manual intervention required.

```
gbrain serve --http    # → ConnectorDaemon starts with all enabled connectors
gbrain autopilot       # → ConnectorDaemon starts alongside the maintenance cycle
```

The daemon:
1. Reads `~/.gbrain/connectors.json` for enabled connectors
2. Instantiates each connector (GoogleDrive, Gmail, Notion, GitHub)
3. Registers them with the IngestionDaemon (supervision + rate-limit + dedup)
4. Starts delta sync immediately (first sync) then polls every 5 minutes
5. On shutdown (SIGTERM/SIGINT), stops all connectors gracefully

Events flow: Connector → IngestionDaemon → MinionQueue (`ingest_capture`) → Brain page.

## Anti-Patterns

- ❌ Syncing everything without filters — use folder/label/repo filters to limit scope
- ❌ Manual token management — the connector handles refresh automatically
- ❌ Disabling dedup — the 24h window prevents loops; migration mode is for bulk only
- ❌ Running multiple Gmail connectors for the same account — dedup works per-source-kind

## Related Skills

- `skills/document-ingest/SKILL.md` — PDF, DOCX processing for Drive attachments
- `skills/media-ingest/SKILL.md` — Images, audio, video from Drive
- `skills/ingest/SKILL.md` — Generic ingestion router
- `skills/capture/SKILL.md` — Quick one-off captures

## Contract

This skill guarantees:
- Every supported connector has delta sync (no full re-scans)
- OAuth2 token refresh is automatic
- Rate limiting prevents API bans
- Content-type aware routing to appropriate processor
- Raw source preservation via metadata
- Health checks surface in `gbrain doctor`

## Output Format

Per sync run: connector · items fetched / imported / skipped · cursor advanced ·
errors (with retry status) — progress on stderr, a clean summary at the end.
