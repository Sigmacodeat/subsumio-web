# Disaster Recovery Plan

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

This plan defines the technical procedures for recovering Subsumio's production infrastructure after a catastrophic failure, data center loss, or major incident. It complements the Business Continuity Plan (BCP) and Incident Response Plan (IRP).

---

## 2. Disaster Scenarios

| Scenario                       | Probability | Impact   | RTO  | Strategy                        |
| ------------------------------ | ----------- | -------- | ---- | ------------------------------- |
| Data center loss (Falkenstein) | Low         | Critical | 4 h  | Failover to Helsinki            |
| Database corruption            | Medium      | Critical | 2 h  | Point-in-time recovery from WAL |
| Ransomware / cyber attack      | Low         | Critical | 8 h  | Rebuild from immutable backups  |
| Accidental data deletion       | Medium      | High     | 2 h  | Point-in-time recovery          |
| Configuration destruction      | Low         | High     | 1 h  | Git restore + redeploy          |
| Full system compromise         | Very Low    | Critical | 12 h | Full rebuild from scratch       |

---

## 3. Recovery Infrastructure

### 3.1 Primary Site (Falkenstein, DE)

| Component     | Spec                                  | Provider |
| ------------- | ------------------------------------- | -------- |
| Web Server    | CX33 (8 vCPU, 16 GB RAM)              | Hetzner  |
| Engine Server | CX33 (8 vCPU, 16 GB RAM)              | Hetzner  |
| PostgreSQL    | CX33 (8 vCPU, 16 GB RAM, 160 GB NVMe) | Hetzner  |
| Redis         | CX22 (4 vCPU, 8 GB RAM)               | Hetzner  |
| Storage Box   | 1 TB                                  | Hetzner  |

### 3.2 DR Site (Helsinki, FI)

| Component     | Spec                                  | Provider |
| ------------- | ------------------------------------- | -------- |
| Web Server    | CX33 (8 vCPU, 16 GB RAM)              | Hetzner  |
| Engine Server | CX33 (8 vCPU, 16 GB RAM)              | Hetzner  |
| PostgreSQL    | CX33 (8 vCPU, 16 GB RAM, 160 GB NVMe) | Hetzner  |
| Redis         | CX22 (4 vCPU, 8 GB RAM)               | Hetzner  |
| Storage Box   | 1 TB                                  | Hetzner  |

### 3.3 DNS & Routing

| Component     | Provider   | Configuration                |
| ------------- | ---------- | ---------------------------- |
| DNS           | Cloudflare | TTL 60s for failover records |
| CDN           | Cloudflare | EU edge, auto-failover       |
| Load Balancer | Cloudflare | Health checks every 10s      |

---

## 4. Recovery Procedures

### 4.1 PostgreSQL Failover (Falkenstein → Helsinki)

**RTO: 15 minutes**

```bash
# ON HELSINKI SERVER:

# 1. Check replica status
psql -c "SELECT pg_is_in_recovery();"
psql -c "SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();"

# 2. Promote replica to primary
pg_ctl promote -D /var/lib/postgresql/data

# 3. Verify
psql -c "SELECT pg_is_in_recovery();"  # Should return false
psql -c "SELECT count(*) FROM users;"
psql -c "SELECT count(*) FROM cases;"

# 4. Update application config
# Edit .env: DATABASE_URL=postgres://...helsinki...
systemctl restart subsumio-web
systemctl restart subsumio-engine

# 5. Update DNS
# Cloudflare API: Update A record to Helsinki IP
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"api.subsum.eu","content":"<HELSINKI_IP>"}'

# 6. Verify external access
curl -s https://api.subsum.eu/api/health
```

### 4.2 Full Infrastructure Rebuild

**RTO: 4 hours**

```bash
# 1. Provision new servers
hcloud server create --name subsumio-web --type cx33 --location hel1 --image debian-12
hcloud server create --name subsumio-engine --type cx33 --location hel1 --image debian-12
hcloud server create --name subsumio-db --type cx33 --location hel1 --image debian-12

# 2. Configure servers (Ansible)
ansible-playbook -i inventory.dr playbook/site.yml --tags="base,security"

# 3. Restore PostgreSQL from backup
# Download latest base backup from Storage Box
rsync -avz backup@storage.helsinki:/backups/pg/base/latest/ /var/lib/postgresql/data/

# Configure recovery
cat > /var/lib/postgresql/data/recovery.signal << 'EOF'
restore_command = 'cp /backups/pg/wal/%f %p'
recovery_target_time = '2026-06-27 14:30:00 CET'
recovery_target_action = 'promote'
EOF

# Start PostgreSQL
pg_ctl start -D /var/lib/postgresql/data

# 4. Restore Document Vault
rsync -avz backup@storage.helsinki:/backups/vault/daily/latest/ /var/subsumio/vault/

# 5. Deploy application
cd /opt/subsumio-web
git pull origin main
bun install
bun run build
systemctl start subsumio-web

# 6. Deploy engine
cd /opt/subsumio-engine
git pull origin main
bun install
systemctl start subsumio-engine

# 7. Update DNS to new servers
# (via Cloudflare API as above)

# 8. Verify
curl -s https://subsum.eu/api/health
curl -s https://api.subsum.eu/api/health
```

### 4.3 Ransomware / Cyber Attack Recovery

**RTO: 8 hours**

1. **Isolate (0–1 h):**
   - Disconnect all servers from internet
   - Preserve disk images for forensics
   - Notify Legal Counsel + Insurance

2. **Assess (1–2 h):**
   - Determine attack vector
   - Identify compromised credentials
   - Assess data exfiltration risk

3. **Rebuild (2–6 h):**
   - Provision fresh servers (do not reuse compromised)
   - Restore from immutable backups (verified clean)
   - Rotate ALL credentials (database, API keys, SSH, SSL)
   - Update all passwords and tokens

4. **Verify (6–7 h):**
   - Security scan of new infrastructure
   - Penetration test (basic)
   - Data integrity verification

5. **Restore Service (7–8 h):**
   - Update DNS
   - Enable services
   - Monitor closely for 48h

6. **Post-Recovery:**
   - Full forensic report
   - Customer notification (if data exfiltrated)
   - GDPR notification (if personal data involved, within 72h)
   - Insurance claim

### 4.4 Accidental Data Deletion

**RTO: 2 hours**

```bash
# 1. Identify deletion time (from logs)
grep "DELETE FROM" /var/log/postgresql/postgresql.log

# 2. Stop application
systemctl stop subsumio-web

# 3. Point-in-time recovery
# Restore to timestamp BEFORE deletion
pg_ctl stop -D /var/lib/postgresql/data
rsync -avz /backup/pg/base/latest/ /var/lib/postgresql/data/

cat > /var/lib/postgresql/data/recovery.signal << 'EOF'
restore_command = 'cp /backup/pg/wal/%f %p'
recovery_target_time = '2026-06-27 13:45:00 CET'  # 15 min before deletion
recovery_target_action = 'promote'
EOF

pg_ctl start -D /var/lib/postgresql/data

# 4. Verify recovered data
psql -c "SELECT count(*) FROM <affected_table>"

# 5. Resume service
systemctl start subsumio-web
```

---

## 5. Recovery Time Objectives

| System                | RTO | RPO    | Method                      |
| --------------------- | --- | ------ | --------------------------- |
| PostgreSQL            | 2 h | 15 min | WAL streaming + base backup |
| Web Application       | 4 h | 1 h    | Git + CI/CD rebuild         |
| Engine API            | 4 h | 1 h    | Git + CI/CD rebuild         |
| Authentication        | 2 h | 15 min | Part of PostgreSQL          |
| Document Vault        | 4 h | 24 h   | rsync from Storage Box      |
| WhatsApp Bot          | 8 h | 1 h    | Reconfigure webhook         |
| Full DR (all systems) | 8 h | 15 min | Sequential recovery         |

---

## 6. DR Testing

### 6.1 Test Schedule

| Test                | Frequency | Scope       | Success Criteria                                |
| ------------------- | --------- | ----------- | ----------------------------------------------- |
| PostgreSQL failover | Monthly   | DB only     | Replica promoted, app connects, data consistent |
| Partial failover    | Quarterly | Web + DB    | Services run on DR site for 1h                  |
| Full DR exercise    | Annually  | All systems | Full failover, 1h operation, failback           |
| Surprise DR drill   | Annually  | All systems | Unannounced, tests real readiness               |

### 6.2 Test Documentation

Each DR test must document:

- Date, time, duration
- Participants and roles
- Scenario tested
- Step-by-step timeline
- RTO achieved vs. target
- RPO achieved vs. target
- Issues encountered
- Root cause of issues
- Action items with owners and deadlines
- Updated procedures (if needed)

---

## 7. Failback Procedure

After failover to DR site, return to primary site:

1. **Verify primary site is healthy** (data center issue resolved)
2. **Set up replication from DR to primary** (reverse the direction)
3. **Wait for replication to catch up** (lag < 60 sec)
4. **Schedule maintenance window** (72h notice)
5. **During maintenance:**
   - Stop application
   - Promote primary (now caught up)
   - Update DNS back to primary
   - Start application
   - Verify
6. **Post-failback:** Monitor for 24h, document in DR log

---

## 8. DR Contact List

| Role               | Primary          | Backup           | Contact            |
| ------------------ | ---------------- | ---------------- | ------------------ |
| DR Coordinator     | CTO              | Engineering Lead | +43 XXX            |
| DB Admin           | Engineering Lead | Senior Engineer  | +43 XXX            |
| Network            | Engineering Lead | CTO              | +43 XXX            |
| Hetzner Support    | —                | —                | +49 30 9 83 87 999 |
| Cloudflare Support | —                | —                | Enterprise plan    |
| Customer Comms     | Head of CS       | CTO              | +43 XXX            |

---

## 9. Pre-positioned Resources

| Resource                     | Location                  | Status               |
| ---------------------------- | ------------------------- | -------------------- |
| DR servers (pre-provisioned) | Helsinki                  | ✅ Running (replica) |
| Latest backups               | Storage Box (Helsinki)    | ✅ Daily             |
| Ansible playbooks            | GitHub + local            | ✅ Versioned         |
| DNS failover config          | Cloudflare dashboard      | ✅ Configured        |
| Emergency credentials        | 1Password (offline vault) | ✅ Updated quarterly |
| Runbook (this doc)           | GitHub + printed          | ✅                   |

---

## 10. Compliance Mapping

| Framework        | Requirement                     | This Plan    |
| ---------------- | ------------------------------- | ------------ |
| SOC 2 A1.3       | Recovery infrastructure         | Section 3, 9 |
| SOC 2 CC9.1      | Recovery procedures             | Section 4    |
| ISO 27001 A.17.1 | Information security continuity | Full plan    |
| GDPR Art. 32     | Ability to restore availability | Section 4, 5 |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Dezember 2026  
**Classification:** Internal
