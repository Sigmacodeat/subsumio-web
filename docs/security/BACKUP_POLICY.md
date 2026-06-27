# Backup Policy

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

This policy defines the backup strategy, schedule, retention, verification, and restoration procedures for all Subsumio production systems to ensure data recoverability and business continuity.

---

## 2. Scope

This policy applies to:

- PostgreSQL production database (primary data store)
- PGLite instances (self-hosted customers)
- Document Vault (uploaded files, generated documents)
- Configuration files and secrets
- Application code (Git repository)
- Engine brain data (pages, embeddings, indexes)

---

## 3. Backup Strategy

### 3.1 PostgreSQL (Production)

| Attribute        | Value                                                           |
| ---------------- | --------------------------------------------------------------- |
| **Method**       | WAL streaming + pg_basebackup                                   |
| **Frequency**    | Continuous WAL archiving + hourly incremental                   |
| **Full Backup**  | Daily at 02:00 CET                                              |
| **Retention**    | 30 days (daily), 12 weeks (weekly), 12 months (monthly)         |
| **Storage**      | Hetzner Storage Box (Falkenstein, DE) + S3-compatible (offsite) |
| **Encryption**   | AES-256-GCM at rest                                             |
| **Compression**  | zstd level 3                                                    |
| **Verification** | Daily checksum + monthly restore test                           |

### 3.2 Document Vault

| Attribute        | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| **Method**       | rsync incremental + tar full                                 |
| **Frequency**    | Daily incremental at 03:00 CET, weekly full Sunday 03:00 CET |
| **Retention**    | 90 days (daily), 12 months (weekly)                          |
| **Storage**      | Hetzner Storage Box (Falkenstein, DE)                        |
| **Encryption**   | AES-256-GCM (files encrypted before upload)                  |
| **Verification** | Weekly checksum verification                                 |

### 3.3 Configuration & Secrets

| Attribute        | Value                                        |
| ---------------- | -------------------------------------------- |
| **Method**       | git-crypt encrypted commits                  |
| **Frequency**    | On every change (git push)                   |
| **Retention**    | Indefinite (version control)                 |
| **Storage**      | GitHub private repo + local mirror           |
| **Encryption**   | git-crypt (GPG-key based)                    |
| **Verification** | CI pipeline validates decryption on every PR |

### 3.4 Application Code

| Attribute        | Value                         |
| ---------------- | ----------------------------- |
| **Method**       | Git (GitHub)                  |
| **Frequency**    | On every commit               |
| **Retention**    | Indefinite                    |
| **Storage**      | GitHub + Hetzner local mirror |
| **Verification** | CI build + test on every push |

### 3.5 Engine Brain Data

| Attribute        | Value                             |
| ---------------- | --------------------------------- |
| **Method**       | Engine export API (`/api/export`) |
| **Frequency**    | Daily at 04:00 CET                |
| **Retention**    | 30 days                           |
| **Storage**      | Hetzner Storage Box               |
| **Encryption**   | AES-256-GCM                       |
| **Verification** | Daily import test (staging)       |

---

## 4. Backup Schedule Summary

| System           | Daily          | Weekly          | Monthly         | Real-time        |
| ---------------- | -------------- | --------------- | --------------- | ---------------- |
| PostgreSQL       | ✅ 02:00 CET   | ✅ Sunday       | ✅ 1st of month | ✅ WAL streaming |
| Document Vault   | ✅ 03:00 CET   | ✅ Sunday 03:00 | ❌              | ❌               |
| Configuration    | ✅ (on change) | ❌              | ❌              | ✅ (git push)    |
| Application Code | ❌             | ❌              | ❌              | ✅ (git push)    |
| Engine Brain     | ✅ 04:00 CET   | ❌              | ❌              | ❌               |

---

## 5. Retention Policy

### 5.1 Retention Tiers

| Tier      | Frequency | Retention  | Rationale                             |
| --------- | --------- | ---------- | ------------------------------------- |
| Hot       | Hourly    | 24 hours   | Quick recovery for accidental deletes |
| Warm      | Daily     | 30 days    | Standard recovery window              |
| Cold      | Weekly    | 12 weeks   | Mid-term compliance                   |
| Archive   | Monthly   | 12 months  | Long-term compliance & audit          |
| Permanent | On change | Indefinite | Code & config (git)                   |

### 5.2 Legal Hold

Upon legal hold notification:

- Affected backups are marked immutable
- Retention is extended until hold is released
- Access is restricted to Legal + CTO
- All access is logged

---

## 6. Storage & Security

### 6.1 Storage Locations

| Location    | Provider                | Region          | Encryption  | Redundancy     |
| ----------- | ----------------------- | --------------- | ----------- | -------------- |
| Primary     | Hetzner Storage Box     | Falkenstein, DE | AES-256-GCM | RAID-6         |
| Offsite     | S3-compatible (Hetzner) | Helsinki, FI    | AES-256-GCM | 3x replication |
| Code Mirror | Hetzner local           | Falkenstein, DE | git-crypt   | RAID-1         |

### 6.2 Access Control

- Backup storage access restricted to CTO + Engineering Lead
- SSH key-based authentication only
- All backup access logged (syslog + Hetzner audit log)
- Backup decryption keys stored in 1Password (separate from backup storage)
- Key rotation: Annually or upon personnel change

### 6.3 Immutability

- Weekly and monthly backups are set to immutable (WORM) for retention period
- Immutable backups cannot be deleted or modified by any user (including root)
- Immutability is enforced at storage layer (Hetzner Storage Box feature)

---

## 7. Backup Verification

### 7.1 Automated Checks

| Check                           | Frequency  | Alert                                 |
| ------------------------------- | ---------- | ------------------------------------- |
| Backup file exists              | Daily      | Slack + E-Mail if missing             |
| Checksum valid                  | Daily      | Slack + E-Mail if mismatch            |
| File size within expected range | Daily      | Slack + E-Mail if anomaly             |
| WAL archiving lag < 5 min       | Continuous | PagerDuty if exceeded                 |
| Storage capacity < 80%          | Daily      | Slack warning at 80%, critical at 90% |

### 7.2 Restore Tests

| Test                     | Frequency | Environment | Success Criteria                         |
| ------------------------ | --------- | ----------- | ---------------------------------------- |
| PostgreSQL point-in-time | Monthly   | Staging     | All tables accessible, row count matches |
| Full DB restore          | Quarterly | Staging     | Application starts, all features work    |
| Vault restore            | Monthly   | Staging     | All files accessible, checksums match    |
| Engine brain import      | Monthly   | Staging     | All pages present, search functional     |
| DR full failover         | Annually  | DR site     | Full service operational within RTO      |

### 7.3 Restore Test Documentation

Each restore test is documented with:

- Date and time
- Performed by
- Backup source (date/timestamp)
- Restore duration
- Verification results
- Issues encountered
- Improvement actions

---

## 8. Restoration Procedures

### 8.1 PostgreSQL Point-in-Time Recovery

```bash
# 1. Stop application
systemctl stop subsumio-web

# 2. Stop PostgreSQL
pg_ctl stop -D /var/lib/postgresql/data

# 3. Restore base backup
rsync -avz /backup/pg/base/latest/ /var/lib/postgresql/data/

# 4. Configure recovery
cat > /var/lib/postgresql/data/recovery.signal << EOF
restore_command = 'cp /backup/pg/wal/%f %p'
recovery_target_time = '2026-06-27 14:30:00 CET'
recovery_target_action = 'promote'
EOF

# 5. Start PostgreSQL
pg_ctl start -D /var/lib/postgresql/data

# 6. Verify
psql -c "SELECT count(*) FROM users;"
psql -c "SELECT count(*) FROM cases;"

# 7. Start application
systemctl start subsumio-web
```

### 8.2 Document Vault Restore

```bash
# 1. Identify backup date
ls -la /backup/vault/daily/

# 2. Restore files
rsync -avz /backup/vault/daily/2026-06-27/ /var/subsumio/vault/

# 3. Verify checksums
find /var/subsumio/vault/ -name "*.sha256" -exec sha256sum -c {} \;

# 4. Verify file count
find /var/subsumio/vault/ -type f | wc -l
```

### 8.3 Full Disaster Recovery

See `DISASTER_RECOVERY.md` for full DR procedure.

---

## 9. RPO and RTO

| System           | RPO     | RTO | Method                      |
| ---------------- | ------- | --- | --------------------------- |
| PostgreSQL       | 15 min  | 2 h | WAL streaming + base backup |
| Document Vault   | 24 h    | 4 h | Daily incremental           |
| Configuration    | 0 (git) | 1 h | Git clone                   |
| Application Code | 0 (git) | 1 h | Git clone + CI build        |
| Engine Brain     | 24 h    | 8 h | Daily export                |

---

## 10. Responsibilities

| Role             | Responsibility                                 |
| ---------------- | ---------------------------------------------- |
| CTO              | Policy ownership, DR approval, key management  |
| Engineering Lead | Backup execution, restore tests, monitoring    |
| On-Call Engineer | Backup alert response, emergency restores      |
| Security Lead    | Backup access audit, immutability verification |

---

## 11. Compliance Mapping

| Framework        | Requirement                    | This Policy     |
| ---------------- | ------------------------------ | --------------- |
| SOC 2 CC9.1      | Backup and recovery procedures | Section 3, 7, 8 |
| SOC 2 A1.2       | Environmental protections      | Section 6       |
| SOC 2 A1.3       | Recovery infrastructure        | Section 3, 6    |
| GDPR Art. 32     | Appropriate technical measures | Section 6       |
| ISO 27001 A.12.3 | Information backup             | Section 3, 4, 5 |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Dezember 2026  
**Classification:** Internal
