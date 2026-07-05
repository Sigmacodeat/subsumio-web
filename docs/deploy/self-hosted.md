# Self-Hosted Deployment (D1)

## Overview

Subsumio can be self-hosted on your own infrastructure. This guide covers the complete setup.

## Prerequisites

- Docker 24+ and Docker Compose v2
- Domain with DNS control
- SSL certificate (Let's Encrypt or custom)
- PostgreSQL 15+ (or use the included container)
- Minimum: 4 vCPU, 8GB RAM, 50GB disk

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/sigmacodeat/subsumio-web.git
cd subsumio-web

# 2. Copy environment template
cp .env.example .env
# Edit .env with your settings

# 3. Start services
docker compose -f docker-compose.self-hosted.yml up -d

# 4. Run database migrations
docker compose exec web npx tsx server/migrations/run-all.ts

# 5. Create admin user
docker compose exec web npx tsx scripts/create-admin.ts --email admin@yourfirm.com
```

## Configuration

### Required Environment Variables

| Variable              | Description            | Example                                   |
| --------------------- | ---------------------- | ----------------------------------------- |
| `AUTH_SECRET`         | Session encryption key | (generate with `openssl rand -hex 32`)    |
| `ENGINE_URL`          | GBrain engine URL      | `http://engine:3001`                      |
| `DATABASE_URL`        | PostgreSQL connection  | `postgresql://user:pass@db:5432/subsumio` |
| `PORTAL_TOKEN_SECRET` | Portal token signing   | (generate with `openssl rand -hex 32`)    |
| `CRON_SECRET`         | Cron job auth          | (generate with `openssl rand -hex 32`)    |

### Optional Integrations

| Variable               | Description               |
| ---------------------- | ------------------------- |
| `MS365_CLIENT_ID`      | Microsoft Graph (Outlook) |
| `MS365_CLIENT_SECRET`  | Microsoft Graph (Outlook) |
| `MS365_TENANT_ID`      | Microsoft Graph (Outlook) |
| `DOCUSIGN_CLIENT_ID`   | DocuSign e-signature      |
| `DOCUSIGN_PRIVATE_KEY` | DocuSign private key      |
| `STRIPE_SECRET_KEY`    | Stripe billing            |
| `DATEV_API_KEY`        | DATEV direct API          |

## License Check

The self-hosted package includes a license verification endpoint:

```bash
curl -H "Authorization: Bearer YOUR_LICENSE_KEY" \
  https://yourfirm.com/api/license/verify
```

Contact `license@subsum.io` for licensing terms.

## AVV Template

An Auftragsverarbeitungsvertrag (AVV) template is provided in `docs/avv-template.md`.
Customize it with your firm's details before signing with Subsumio.

## Backup & Restore

See `docs/BACKUP-RESTORE-PLAN.md` for the complete backup strategy.

## Updates

```bash
git pull origin main
docker compose -f docker-compose.self-hosted.yml build
docker compose -f docker-compose.self-hosted.yml up -d
docker compose exec web npx tsx server/migrations/run-all.ts
```

## Support

- Community: GitHub Issues
- Enterprise: support@subsum.io (SLA customers only)
