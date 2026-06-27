# Asset Inventory

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

To maintain a comprehensive inventory of all Subsumio physical and logical assets, their classification, ownership, and security controls. Required for SOC 2 CC3.1, CC6.1, and ISO 27001 A.8.1.

---

## 2. Infrastructure Assets

### 2.1 Servers

| Asset ID | Name               | Type | Location        | IP             | OS        | Purpose            | Owner | Classification |
| -------- | ------------------ | ---- | --------------- | -------------- | --------- | ------------------ | ----- | -------------- |
| SRV-001  | subsumio-web-01    | CX33 | Falkenstein, DE | 167.233.134.25 | Debian 12 | Web Application    | CTO   | Confidential   |
| SRV-002  | subsumio-engine-01 | CX33 | Falkenstein, DE | 167.233.134.26 | Debian 12 | Engine API         | CTO   | Confidential   |
| SRV-003  | subsumio-db-01     | CX33 | Falkenstein, DE | 167.233.134.27 | Debian 12 | PostgreSQL Primary | CTO   | Restricted     |
| SRV-004  | subsumio-redis-01  | CX22 | Falkenstein, DE | 167.233.134.28 | Debian 12 | Redis Cache        | CTO   | Confidential   |
| SRV-005  | subsumio-web-dr    | CX33 | Helsinki, FI    | (DR)           | Debian 12 | Web App (DR)       | CTO   | Confidential   |
| SRV-006  | subsumio-db-dr     | CX33 | Helsinki, FI    | (DR)           | Debian 12 | PostgreSQL Replica | CTO   | Restricted     |

### 2.2 Storage

| Asset ID | Name          | Type                | Location        | Capacity | Purpose        | Encryption  | Owner |
| -------- | ------------- | ------------------- | --------------- | -------- | -------------- | ----------- | ----- |
| STO-001  | storage-box-1 | Hetzner Storage Box | Falkenstein, DE | 1 TB     | DB backups     | AES-256-GCM | CTO   |
| STO-002  | storage-box-2 | Hetzner Storage Box | Helsinki, FI    | 1 TB     | DR backups     | AES-256-GCM | CTO   |
| STO-003  | vault-storage | Local NVMe          | Falkenstein, DE | 160 GB   | Document Vault | AES-256-GCM | CTO   |

### 2.3 Network

| Asset ID | Name             | Type           | Provider   | Configuration          | Owner    |
| -------- | ---------------- | -------------- | ---------- | ---------------------- | -------- |
| NET-001  | subsum.eu domain | DNS            | Cloudflare | TTL 60s, EU edge       | CTO      |
| NET-002  | api.subsum.eu    | DNS A Record   | Cloudflare | Points to SRV-002      | CTO      |
| NET-003  | status.subsum.eu | DNS CNAME      | Cloudflare | Points to UptimeRobot  | CTO      |
| NET-004  | WAF              | Cloudflare WAF | Cloudflare | Managed rules + custom | Eng Lead |
| NET-005  | DDoS Protection  | Cloudflare     | Cloudflare | Always-on, EU edge     | Eng Lead |

---

## 3. Software Assets

### 3.1 Production Software

| Asset ID | Software        | Version | Purpose         | License            | Owner    | Patch Cycle |
| -------- | --------------- | ------- | --------------- | ------------------ | -------- | ----------- |
| SW-001   | Subsumio Web    | 2026.06 | Web Application | Proprietary        | CTO      | Continuous  |
| SW-002   | Subsumio Engine | 2026.06 | AI Engine       | Proprietary        | CTO      | Continuous  |
| SW-003   | PostgreSQL      | 16.x    | Database        | PostgreSQL License | Eng Lead | Monthly     |
| SW-004   | Redis           | 7.x     | Cache/Sessions  | BSD 3-Clause       | Eng Lead | Monthly     |
| SW-005   | Node.js / Bun   | 1.1.x   | Runtime         | MIT                | Eng Lead | Monthly     |
| SW-006   | Next.js         | 15.x    | Framework       | MIT                | Eng Lead | Continuous  |
| SW-007   | Nginx           | 1.26.x  | Reverse Proxy   | BSD 2-Clause       | Eng Lead | Monthly     |

### 3.2 SaaS Services

| Asset ID | Service           | Provider    | Purpose       | Plan     | Owner    | Data Accessed  |
| -------- | ----------------- | ----------- | ------------- | -------- | -------- | -------------- |
| SAAS-001 | Cloudflare        | Cloudflare  | CDN/WAF/DNS   | Business | CTO      | HTTP traffic   |
| SAAS-002 | GitHub            | Microsoft   | Code hosting  | Team     | CTO      | Source code    |
| SAAS-003 | 1Password         | AgileBits   | Password mgmt | Business | CTO      | Credentials    |
| SAAS-004 | UptimeRobot       | UptimeRobot | Monitoring    | Business | Eng Lead | URLs           |
| SAAS-005 | OpenAI            | OpenAI      | AI Inference  | API      | CTO      | Query text     |
| SAAS-006 | Anthropic         | Anthropic   | AI Inference  | API      | CTO      | Query text     |
| SAAS-007 | WhatsApp Business | Meta        | WhatsApp Bot  | API      | CTO      | Messages       |
| SAAS-008 | DocuSign          | DocuSign    | E-Signature   | Business | CTO      | Documents      |
| SAAS-009 | Stripe            | Stripe      | Payments      | Standard | CEO      | Billing info   |
| SAAS-010 | Google Workspace  | Google      | E-Mail/Docs   | Business | CEO      | Internal comms |

---

## 4. Data Assets

| Asset ID | Data Type                      | Location           | Classification | Retention         | Encryption | Owner         |
| -------- | ------------------------------ | ------------------ | -------------- | ----------------- | ---------- | ------------- |
| DAT-001  | Customer PII (names, contacts) | PostgreSQL         | Confidential   | Contract + 30d    | AES-256    | CTO           |
| DAT-002  | Case data (legal matters)      | PostgreSQL + Vault | Confidential   | Contract + 30d    | AES-256    | CTO           |
| DAT-003  | Documents (uploaded files)     | Vault (NVMe)       | Confidential   | Contract + 30d    | AES-256    | CTO           |
| DAT-004  | AI queries & responses         | PostgreSQL         | Internal       | 90 days           | AES-256    | Eng Lead      |
| DAT-005  | Audit logs                     | PostgreSQL         | Restricted     | 365 days          | AES-256    | Security Lead |
| DAT-006  | System logs                    | Server / Hetzner   | Internal       | 90 days           | Disk-level | Eng Lead      |
| DAT-007  | Backup data                    | Storage Box        | Restricted     | Per backup policy | AES-256    | CTO           |
| DAT-008  | Source code                    | GitHub             | Confidential   | Indefinite        | git-crypt  | CTO           |
| DAT-009  | Configuration & secrets        | GitHub (git-crypt) | Restricted     | Indefinite        | GPG        | CTO           |
| DAT-010  | Employee credentials           | 1Password          | Restricted     | Indefinite        | 1Password  | CTO           |

---

## 5. Cryptographic Assets

| Asset ID | Key Type            | Purpose              | Rotation                 | Storage                 | Owner    |
| -------- | ------------------- | -------------------- | ------------------------ | ----------------------- | -------- |
| CRY-001  | TLS certificate     | subsum.eu            | Let's Encrypt (auto 90d) | Server                  | Eng Lead |
| CRY-002  | AES-256 DB key      | Database encryption  | Annually                 | Env var + 1Password     | CTO      |
| CRY-003  | AES-256 Vault key   | File encryption      | Annually                 | Env var + 1Password     | CTO      |
| CRY-004  | JWT signing key     | Authentication       | Quarterly                | Env var + 1Password     | Eng Lead |
| CRY-005  | CSRF secret         | CSRF protection      | Quarterly                | Env var                 | Eng Lead |
| CRY-006  | WhatsApp API token  | WhatsApp integration | On compromise            | Env var + 1Password     | CTO      |
| CRY-007  | OpenAI API key      | AI inference         | On compromise            | Env var + 1Password     | CTO      |
| CRY-008  | GPG key (git-crypt) | Secret encryption    | Annually                 | Hardware token + backup | CTO      |
| CRY-009  | SSH key (deploy)    | Server deployment    | Annually                 | 1Password               | Eng Lead |
| CRY-010  | Hetzner API token   | Infrastructure mgmt  | On compromise            | 1Password               | CTO      |

---

## 6. Endpoint Assets

| Asset ID | Device                 | Type   | User      | Encryption  | MDM | Owner     |
| -------- | ---------------------- | ------ | --------- | ----------- | --- | --------- |
| EP-001   | MacBook Pro (CTO)      | Laptop | CTO       | FileVault 2 | ✅  | CTO       |
| EP-002   | MacBook Pro (Eng Lead) | Laptop | Eng Lead  | FileVault 2 | ✅  | Eng Lead  |
| EP-003   | MacBook Pro (Dev)      | Laptop | Developer | FileVault 2 | ✅  | Developer |

---

## 7. Asset Lifecycle

### 7.1 Acquisition

- All assets must be approved by CTO
- Asset is registered in this inventory within 24h
- Security controls applied before production use
- Asset ID assigned sequentially

### 7.2 Maintenance

- Software patched per patch cycle (see Section 3.1)
- Hardware inspected annually
- Inventory reviewed quarterly
- Classification reviewed annually

### 7.3 Disposal

- Data securely wiped (DoD 5220.22-M or equivalent)
- Hardware physically destroyed (if cannot be wiped)
- Disposal documented with certificate
- Asset removed from inventory
- Crypto keys associated with asset revoked

---

## 8. Access Control Matrix

| Asset                    | CTO | Eng Lead  | Developer    | Security Lead | On-Call        |
| ------------------------ | --- | --------- | ------------ | ------------- | -------------- |
| Production servers (SSH) | ✅  | ✅        | ❌           | ❌            | ✅             |
| PostgreSQL (admin)       | ✅  | ✅        | ❌           | ❌            | ✅ (read)      |
| Cloudflare dashboard     | ✅  | ✅        | ❌           | ❌            | ❌             |
| Hetzner console          | ✅  | ✅        | ❌           | ❌            | ❌             |
| GitHub (admin)           | ✅  | ✅        | ✅ (repo)    | ❌            | ❌             |
| 1Password vaults         | ✅  | ✅        | ✅ (limited) | ✅ (security) | ✅ (on-call)   |
| Production env vars      | ✅  | ✅        | ❌           | ❌            | ✅ (via vault) |
| Audit logs               | ✅  | ✅ (read) | ❌           | ✅            | ✅ (read)      |

---

## 9. Compliance Mapping

| Framework         | Requirement                          | This Inventory        |
| ----------------- | ------------------------------------ | --------------------- |
| SOC 2 CC3.1       | Identify and manage assets           | Full inventory        |
| SOC 2 CC6.1       | Logical and physical access controls | Section 8             |
| ISO 27001 A.8.1.1 | Asset inventory                      | Full inventory        |
| ISO 27001 A.8.1.2 | Ownership of assets                  | All assets have owner |
| ISO 27001 A.8.1.3 | Acceptable use of assets             | Section 7, 8          |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. September 2026 (quarterly)  
**Classification:** Internal
