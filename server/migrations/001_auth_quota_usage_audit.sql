-- Migration 001: Auth, quota, usage, audit, and session revocation tables
-- These were previously created ad-hoc in application code. Consolidated here
-- for proper schema management and migration tracking.

-- Auth: users
CREATE TABLE IF NOT EXISTS subsumio_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  referral_code text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subsumio_users_org_id_idx ON subsumio_users ((data->>'orgId'));

-- Auth: organizations
CREATE TABLE IF NOT EXISTS subsumio_orgs (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subsumio_orgs_owner_id_idx ON subsumio_orgs (owner_id);

-- Session revocation (S-01)
CREATE TABLE IF NOT EXISTS subsumio_session_revocations (
  user_id text PRIMARY KEY,
  min_version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Quota tracking (D-02)
CREATE TABLE IF NOT EXISTS subsumio_quota (
  brain_id text NOT NULL,
  month text NOT NULL,
  queries integer NOT NULL DEFAULT 0,
  pages integer NOT NULL DEFAULT 0,
  uploads integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brain_id, month)
);

-- Usage metering (D-02)
CREATE TABLE IF NOT EXISTS subsumio_usage (
  brain_id text NOT NULL,
  month text NOT NULL,
  query_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brain_id, month)
);

-- Audit log (D-04) — dedicated table, append-only, tamper-evident
CREATE TABLE IF NOT EXISTS subsumio_audit_log (
  id bigserial PRIMARY KEY,
  brain_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  user_id text,
  user_email text,
  details jsonb,
  ip text,
  hash text,
  prev_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subsumio_audit_log_brain_id_idx ON subsumio_audit_log (brain_id);
CREATE INDEX IF NOT EXISTS subsumio_audit_log_action_idx ON subsumio_audit_log (action);
CREATE INDEX IF NOT EXISTS subsumio_audit_log_created_at_idx ON subsumio_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS subsumio_audit_log_entity_idx ON subsumio_audit_log (entity_type, entity_id);
