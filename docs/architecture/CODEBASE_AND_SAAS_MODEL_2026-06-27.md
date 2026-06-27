# Subsumio Codebase & SaaS Model – Complete Overview

**Datum:** 27. Juni 2026  
**Zweck:** Umfassende Übersicht der gesamten Codebasis, Architektur und des SaaS-Modells

---

# 1. Architektur-Übersicht

## 1.1 High-Level Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Next.js App  │  │ Word Add-in  │  │ Outlook Add-in│         │
│  │ (Dashboard)  │  │ (Windows)    │  │ (Windows)    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Next.js API  │  │ Webhooks     │  │ Realtime SSE │         │
│  │ Routes       │  │ (DocuSign,   │  │ (Live Updates)│         │
│  │              │  │  WhatsApp)   │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Business Logic Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Engine Proxy │  │ Legal AI     │  │ Billing      │         │
│  │ (GBrain)     │  │ Pipeline     │  │ (Stripe)     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Permissions  │  │ Quota System │  │ Audit Log    │         │
│  │ (RBAC)       │  │ (Usage)      │  │ (Compliance) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Postgres     │  │ GBrain       │  │ Storage      │         │
│  │ (Multi-Tenant│  │ (Vector DB)  │  │ (Hetzner S3) │         │
│  │  + RLS)      │  │ (PGLite/PG)  │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         External Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Stripe       │  │ DocuSign     │  │ WhatsApp     │         │
│  │ (Billing)    │  │ (Signatures) │  │ (Messaging)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ WorkOS       │  │ DATEV        │  │ beA          │         │
│  │ (SSO/SCIM)   │  │ (Accounting) │  │ (German Bar) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

# 2. SaaS-Modell

## 2.1 Multi-Tenancy Architektur

### Tenant Isolation
- **Row-Level Security (RLS):** Postgres RLS Policies pro Tabelle
- **Organization Scoping:** Alle Daten sind an `organization_id` gebunden
- **User-Organization Mapping:** `organization_members` Tabelle für User-Rollen
- **Tenant Boundary Tests:** `src/lib/tenant-boundary.test.ts`

### Tenant Struktur
```typescript
interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  seats: number;
  created_at: string;
  settings: {
    default_language: 'de' | 'en';
    timezone: string;
    currency: 'EUR' | 'CHF';
  };
}

interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  invited_by: string;
  invited_at: string;
  accepted_at: string;
}
```

## 2.2 Billing & Plans

### Plan Tiers
```typescript
type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise';

interface PlanLimits {
  max_users: number;
  max_cases: number;
  max_storage_gb: number;
  ai_queries_per_month: number;
  whatsapp_messages_per_month: number;
  api_calls_per_month: number;
  features: string[];
}
```

### Plan Konfiguration
- **File:** `src/lib/billing/plans.ts`
- **Features:**
  - Free: 1 User, 10 Cases, 100 AI Queries
  - Starter: 5 Users, 50 Cases, 1,000 AI Queries
  - Professional: 20 Users, Unlimited Cases, 10,000 AI Queries
  - Enterprise: Unlimited Users, Unlimited Cases, Unlimited AI Queries

### Billing Integration
- **Provider:** Stripe
- **Checkout:** `src/app/api/billing/checkout/route.ts`
- **Webhook:** `src/app/api/billing/webhook/route.ts`
- **Portal:** `src/app/api/billing/portal/route.ts`
- **Proration:** `src/app/api/billing/proration/route.ts`
- **Seats:** `src/app/api/billing/seats/route.ts`

## 2.3 Quota System

### Quota Types
```typescript
type QuotaType = 
  | 'queries'           // AI Queries
  | 'pages'             // Brain Pages
  | 'storage'           // Storage Usage
  | 'whatsapp_messages' // WhatsApp Messages
  | 'api_calls'         // API Calls
  | 'seats';            // User Seats
```

### Quota Enforcement
- **File:** `src/lib/quota.test.ts`
- **API:** `src/app/api/usage/quota/route.ts`
- **Rate Limiting:** `src/lib/rate-limit-api.ts`
- **Usage Tracking:** `src/lib/usage.ts`

### Quota Logic
```typescript
interface QuotaCheck {
  quota_type: QuotaType;
  current_usage: number;
  limit: number;
  reset_at: string;
  exceeded: boolean;
}
```

## 2.4 Usage Tracking

### Usage Metrics
- **File:** `src/lib/usage.ts`
- **API:** `src/app/api/usage/route.ts`
- **Metrics:**
  - AI Queries per User/Org
  - Storage Usage per Org
  - WhatsApp Messages per Org
  - API Calls per User
  - Active Users per Day/Week/Month

### Usage Dashboard
- **File:** `src/app/dashboard/adoption-analytics/page.tsx`
- **Features:**
  - Total Users
  - Active Users (7d, 30d)
  - Feature Usage
  - User Breakdown
  - Usage Trends

---

# 3. Codebase-Struktur

## 3.1 Directory Layout

```
subsumio-web/
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── (marketing)/        # Marketing Pages
│   │   ├── (auth)/            # Auth Pages
│   │   ├── dashboard/         # Dashboard App
│   │   ├── api/               # API Routes
│   │   ├── de/                # German Pages
│   │   └── globals.css        # Global Styles
│   ├── components/            # React Components
│   │   ├── admin/            # Admin Components
│   │   ├── auth/             # Auth Components
│   │   ├── brand/            # Brand Components
│   │   ├── dashboard/        # Dashboard Components
│   │   ├── legal/            # Legal Components
│   │   └── ui/               # UI Components (shadcn/ui)
│   ├── lib/                  # Core Libraries
│   │   ├── auth/             # Auth Logic
│   │   ├── billing/          # Billing Logic
│   │   ├── dms/              # DMS Logic
│   │   ├── legal/            # Legal AI Logic
│   │   ├── whatsapp/         # WhatsApp Logic
│   │   ├── engine.ts         # GBrain Engine Proxy
│   │   ├── permissions.ts    # RBAC Logic
│   │   ├── quota.ts          # Quota Logic
│   │   └── usage.ts          # Usage Tracking
│   └── content/              # Content Files
│       ├── dashboard.ts      # Dashboard Content
│       ├── docs.ts           # Documentation Content
│       └── site.ts           # Site Content
├── server/                   # Server-Side Code
│   ├── migrations/          # Database Migrations
│   ├── scripts/              # Utility Scripts
│   └── docs/                 # Server Documentation
├── tests/                    # Tests
│   ├── e2e-playwright/       # E2E Tests
│   ├── heavy/                # Heavy Load Tests
│   └── load/                 # Load Tests (k6)
├── docs/                     # Documentation
│   ├── architecture/         # Architecture Docs
│   ├── audits/               # Audit Reports
│   ├── blueprints/           # Feature Blueprints
│   └── designs/              # Design Docs
└── .github/                  # GitHub Config
    ├── workflows/            # CI/CD Workflows
    └── dependabot.yml        # Dependency Updates
```

## 3.2 Wichtige Module

### 3.2.1 Auth & Identity
- **Files:**
  - `src/lib/auth/server.ts` – Server-side Auth Helpers
  - `src/lib/auth/store.ts` – Session Store
  - `src/lib/auth/api-key-auth.ts` – API Key Auth
  - `src/lib/auth/store-encryption.test.ts` – Encryption Tests
- **Features:**
  - Session-based Auth
  - API Key Auth
  - SSO via WorkOS
  - SCIM for User Provisioning
  - 2FA Support

### 3.2.2 Permissions (RBAC)
- **File:** `src/lib/permissions.ts`
- **Actions:**
  - `brain.read`, `brain.write`
  - `legal.contract_draft`
  - `case.create`, `case.update`, `case.delete`
  - `admin.users`
- **Roles:**
  - `owner`, `admin`, `editor`, `viewer`

### 3.2.3 Legal AI Pipeline
- **Files:**
  - `src/lib/legal/` – Legal AI Logic
  - `src/app/api/legal/` – Legal AI API Routes
- **Features:**
  - Contract Drafting
  - Contract Review
  - Contract Redline
  - Document Analysis
  - Risk Analysis
  - Obligation Extraction
  - AI Deadlines
  - Auto Playbooks

### 3.2.4 WhatsApp Integration
- **Files:**
  - `src/lib/whatsapp/` – WhatsApp Logic
  - `src/app/api/whatsapp/` – WhatsApp API Routes
- **Features:**
  - WhatsApp Webhook
  - Legal Chat Actions
  - Proactive Daily Briefings
  - Event Bus
  - Approval Rückkanal
  - Secretary Metrics

### 3.2.5 Billing & Subscriptions
- **Files:**
  - `src/lib/billing/` – Billing Logic
  - `src/app/api/billing/` – Billing API Routes
- **Features:**
  - Stripe Checkout
  - Subscription Management
  - Proration
  - Seat Management
  - Dunning

### 3.2.6 Practice Management
- **Files:**
  - `src/lib/` – Practice Management Logic
  - `src/app/dashboard/` – Dashboard UI
- **Features:**
  - Case Management
  - Contact Management
  - Deadline Management
  - Time Tracking
  - Invoicing
  - DATEV Export

### 3.2.7 Shared Spaces (Cross-Org)
- **Files:**
  - `src/lib/shared-spaces.ts` – Shared Spaces Logic
  - `src/app/api/shared-spaces/` – Shared Spaces API
  - `src/app/dashboard/shared-spaces/` – Shared Spaces UI
- **Features:**
  - Cross-Org Collaboration
  - Document Sharing
  - WhatsApp → Shared Spaces
  - Client Portal Integration

---

# 4. Database Schema

## 4.1 Core Tables

### Users & Organizations
```sql
users (id, email, name, created_at)
organizations (id, name, slug, plan, seats, created_at)
organization_members (id, organization_id, user_id, role, invited_by, invited_at, accepted_at)
```

### Cases & Documents
```sql
legal_cases (id, title, status, case_number, organization_id, created_at)
documents (id, title, file_type, file_size, storage_path, case_id, uploaded_by, uploaded_at)
```

### Billing & Usage
```sql
subscriptions (id, organization_id, stripe_customer_id, stripe_subscription_id, plan, status, created_at)
usage_records (id, organization_id, user_id, quota_type, amount, recorded_at)
```

### WhatsApp
```sql
whatsapp_identities (id, phone_number, organization_id, user_id, verified_at)
whatsapp_messages (id, message_id, phone_number, direction, content, created_at)
```

### Shared Spaces
```sql
shared_spaces (id, slug, name, description, organization_id, created_by, expires_at, status, access_token, settings)
shared_space_participants (id, shared_space_id, user_id, email, role, invited_by, invited_at, accepted_at)
shared_space_documents (id, shared_space_id, uploaded_by, file_name, file_type, file_size, storage_path, uploaded_at, metadata)
whatsapp_document_mappings (id, whatsapp_message_id, shared_space_id, document_id, mapped_at, mapped_by)
```

---

# 5. API Architecture

## 5.1 API Handler Pattern

### createHandler Wrapper
```typescript
export const POST = createHandler(
  {
    action: "legal.contract_draft",
    rateTier: "heavy",
    quota: "queries",
    body: contractDraftSchema,
    audit: (ctx, body) => ({
      action: "legal.contract_draft",
      entityType: "contract",
      details: { type: body.type },
    }),
  },
  async (ctx, body, req) => {
    // Handler logic
    return apiSuccess(result);
  }
);
```

### Guards Applied
1. Engine config check
2. Auth (session → EngineContext)
3. RBAC (can(user, action))
4. CSRF (double-submit token)
5. Rate limit (per-user, tier-based)
6. Quota (optional)
7. Input validation (Zod schema)
8. Handler execution
9. Audit log (after success)

## 5.2 API Routes

### Legal AI
- `/api/legal/contract-draft` – Contract Drafting
- `/api/legal/contract-redline` – Contract Redline
- `/api/legal/analyze` – Document Analysis
- `/api/legal/risk-analysis` – Risk Analysis
- `/api/legal/ai-deadlines` – AI Deadlines
- `/api/legal/auto-playbook` – Auto Playbooks

### Brain & Search
- `/api/think` – Brain Query
- `/api/search` – Search
- `/api/pages` – Brain Pages CRUD
- `/api/graph` – Graph Query

### Billing
- `/api/billing/checkout` – Checkout
- `/api/billing/webhook` – Stripe Webhook
- `/api/billing/portal` – Customer Portal
- `/api/billing/seats` – Seat Management

### WhatsApp
- `/api/whatsapp/webhook` – WhatsApp Webhook
- `/api/whatsapp/send` – Send Message
- `/api/whatsapp/flow-endpoint` – Flow Endpoint
- `/api/whatsapp/document-to-space` – Document to Space Mapping

### Shared Spaces
- `/api/shared-spaces` – Shared Spaces CRUD
- `/api/shared-spaces/[id]` – Shared Space Detail
- `/api/shared-spaces/[id]/documents` – Documents CRUD

---

# 6. Security Architecture

## 6.1 Security Layers

### 1. Network Layer
- IP Allow-Listing (Middleware)
- HTTPS Only
- CSP Headers

### 2. Auth Layer
- Session-based Auth
- API Key Auth
- SSO via WorkOS
- 2FA Support

### 3. Authorization Layer
- RBAC (Permissions)
- Row-Level Security (RLS)
- Tenant Boundary Enforcement

### 4. CSRF Protection
- Double-Submit Cookie
- Header Validation
- Timing-Safe Comparison

### 5. Rate Limiting
- Per-User Rate Limits
- Tier-Based Rate Limits
- IP-Based Rate Limits

### 6. Quota Enforcement
- Per-Organization Quotas
- Per-User Quotas
- Reset Logic

### 7. Audit Logging
- All Actions Logged
- User Attribution
- Timestamp
- Details

## 6.2 Compliance

### SOC 2 Type II
- **Status:** Policies dokumentiert, Audit ausständig
- **File:** `docs/security/SOC2_SECURITY_POLICIES_2026-06-27.md`

### GDPR
- Data Export API
- Data Retention Policies
- Right to Deletion
- Consent Management

### AI Act
- AI Act Compliance Dashboard
- AI Notice Components
- Citation Gate
- Grounding Metadata

---

# 7. CI/CD Pipeline

## 7.1 GitHub Actions Workflow

### Jobs
1. **lint** – ESLint
2. **format-check** – Prettier
3. **build** – Next.js Build
4. **typecheck** – TypeScript Check
5. **test** – Unit Tests
6. **check-resolvable** – Skill Tree Check
7. **e2e** – Playwright E2E Tests
8. **server-verify** – Server Verification
9. **release-gate-eval** – Release Gate Evaluation
10. **security-scan** – Snyk Security Scan
11. **lighthouse-ci** – Lighthouse Performance Test
12. **load-test** – k6 Load Test
13. **production-gate** – All Checks Must Pass

### Production Gate
- All jobs must pass
- Security scan required
- Performance tests required
- Load tests required

## 7.2 Dependencies

### Dependabot
- **File:** `.github/dependabot.yml`
- **Scope:** npm (Root + Server), GitHub Actions
- **Schedule:** Weekly
- **Labels:** dependencies, security

---

# 8. Testing Strategy

## 8.1 Test Tiers

### Unit Tests
- **Framework:** Vitest
- **Coverage:** Core Libraries
- **Files:** `src/lib/*.test.ts`

### Integration Tests
- **Framework:** Vitest
- **Coverage:** API Routes
- **Files:** `src/app/api/*.test.ts`

### E2E Tests
- **Framework:** Playwright
- **Coverage:** Critical Flows
- **Files:** `tests/e2e-playwright/*.spec.ts`

### Load Tests
- **Framework:** k6
- **Coverage:** Performance Under Load
- **Files:** `tests/load/*.js`

## 8.2 Test Coverage

### Critical Flows
- Auth Flow
- Case Management Flow
- Signature Flow
- Billing Flow
- CLM Flow
- WhatsApp Flow

---

# 9. Deployment Architecture

## 9.1 Infrastructure

### Server
- **Provider:** Hetzner (CX33, Falkenstein)
- **OS:** Linux
- **SSH:** `subsumio-hetzner`

### Storage
- **Primary:** Hetzner S3-compatible Storage (B2)
- **Backup:** Second Region (optional)
- **Encryption:** AES-256-GCM at rest

### Database
- **Primary:** Postgres with pgvector
- **Backup:** Daily Backups
- **Replication:** Optional

## 9.2 Deployment Process

### CI/CD
- **Trigger:** Push to main
- **Build:** Docker Build
- **Test:** Full CI Pipeline
- **Deploy:** Production Gate → Deploy

### Environment Variables
- **File:** `.env.example`
- **Scope:** API URLs, Secrets, Auth, Billing, WhatsApp, Encryption, Redis, Integrations, Monitoring

---

# 10. Monitoring & Observability

## 10.1 Metrics

### Application Metrics
- Request Latency
- Error Rate
- Throughput
- User Activity
- Feature Usage

### Business Metrics
- Active Users
- Subscription Revenue
- Churn Rate
- Feature Adoption
- Quota Usage

## 10.2 Logging

### Audit Log
- **File:** `src/lib/audit.ts`
- **Scope:** All User Actions
- **Fields:** Action, User, Timestamp, Details

### Error Log
- **Scope:** Application Errors
- **Fields:** Error Type, Stack Trace, Context

---

# 11. External Integrations

## 11.1 Payment
- **Stripe:** Billing, Subscriptions, Checkout

## 11.2 Identity
- **WorkOS:** SSO, SCIM

## 11.3 Legal
- **DocuSign:** Electronic Signatures
- **beA:** German Bar Association
- **DATEV:** Accounting Export

## 11.4 Communication
- **WhatsApp:** Messaging, Legal Secretary

## 11.5 Storage
- **Hetzner S3:** Document Storage

---

# 12. Roadmap & Future Work

## 12.1 Completed (2026-06-27)
- ✅ P0-P3 Audit Tasks
- ✅ Shared Spaces Implementation
- ✅ Load Testing
- ✅ Security Scanning
- ✅ Performance Testing

## 12.2 Pending
- ⬜ Penetration Testing (External)
- ⬜ SOC 2 Type II Audit (External)
- ⬜ Additional Enterprise Features
- ⬜ Advanced Analytics

---

**Dokument erstellt am:** 27. Juni 2026  
**Version:** 1.0
