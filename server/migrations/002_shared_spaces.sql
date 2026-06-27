-- Migration: Shared Spaces (Cross-Org Collaboration)
-- Description: Enable cross-org collaboration for clients, external counsel, and joint ventures
-- Date: 2026-06-27

-- Shared Spaces Table
CREATE TABLE IF NOT EXISTS shared_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  access_token TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{
    "allow_upload": true,
    "allow_download": true,
    "max_file_size": 104857600,
    "allowed_file_types": ["pdf", "docx", "doc", "jpg", "jpeg", "png", "txt"],
    "require_auth": true
  }'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_spaces_organization_id ON shared_spaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_shared_spaces_created_by ON shared_spaces(created_by);
CREATE INDEX IF NOT EXISTS idx_shared_spaces_status ON shared_spaces(status);
CREATE INDEX IF NOT EXISTS idx_shared_spaces_expires_at ON shared_spaces(expires_at);
CREATE INDEX IF NOT EXISTS idx_shared_spaces_access_token ON shared_spaces(access_token);

-- Shared Space Participants Table
CREATE TABLE IF NOT EXISTS shared_space_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_space_id UUID NOT NULL REFERENCES shared_spaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(shared_space_id, user_id),
  UNIQUE(shared_space_id, email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_space_participants_shared_space_id ON shared_space_participants(shared_space_id);
CREATE INDEX IF NOT EXISTS idx_shared_space_participants_user_id ON shared_space_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_space_participants_email ON shared_space_participants(email);
CREATE INDEX IF NOT EXISTS idx_shared_space_participants_role ON shared_space_participants(role);

-- Shared Space Documents Table
CREATE TABLE IF NOT EXISTS shared_space_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_space_id UUID NOT NULL REFERENCES shared_spaces(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_space_documents_shared_space_id ON shared_space_documents(shared_space_id);
CREATE INDEX IF NOT EXISTS idx_shared_space_documents_uploaded_by ON shared_space_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_shared_space_documents_file_type ON shared_space_documents(file_type);
CREATE INDEX IF NOT EXISTS idx_shared_space_documents_uploaded_at ON shared_space_documents(uploaded_at);

-- WhatsApp Document Mapping Table
CREATE TABLE IF NOT EXISTS whatsapp_document_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_message_id TEXT NOT NULL,
  shared_space_id UUID REFERENCES shared_spaces(id) ON DELETE SET NULL,
  document_id UUID REFERENCES shared_space_documents(id) ON DELETE SET NULL,
  mapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapped_by TEXT NOT NULL DEFAULT 'system' CHECK (mapped_by IN ('system', 'user')),
  UNIQUE(whatsapp_message_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_document_mappings_whatsapp_message_id ON whatsapp_document_mappings(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_document_mappings_shared_space_id ON whatsapp_document_mappings(shared_space_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_document_mappings_document_id ON whatsapp_document_mappings(document_id);

-- Row-Level Security Policies

-- Shared Spaces RLS
ALTER TABLE shared_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_spaces_org_read ON shared_spaces
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
  ));

CREATE POLICY shared_spaces_org_insert ON shared_spaces
  FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
  ));

CREATE POLICY shared_spaces_org_update ON shared_spaces
  FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
  ));

CREATE POLICY shared_spaces_org_delete ON shared_spaces
  FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
  ));

-- Public access via token (for client uploads)
CREATE POLICY shared_spaces_public_read ON shared_spaces
  FOR SELECT
  USING (access_token = current_setting('request.jwt.claim.access_token', true));

-- Shared Space Participants RLS
ALTER TABLE shared_space_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_space_participants_space_read ON shared_space_participants
  FOR SELECT
  USING (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

CREATE POLICY shared_space_participants_space_insert ON shared_space_participants
  FOR INSERT
  WITH CHECK (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

CREATE POLICY shared_space_participants_space_delete ON shared_space_participants
  FOR DELETE
  USING (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

-- Shared Space Documents RLS
ALTER TABLE shared_space_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_space_documents_space_read ON shared_space_documents
  FOR SELECT
  USING (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

CREATE POLICY shared_space_documents_space_insert ON shared_space_documents
  FOR INSERT
  WITH CHECK (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

CREATE POLICY shared_space_documents_space_delete ON shared_space_documents
  FOR DELETE
  USING (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

-- WhatsApp Document Mappings RLS
ALTER TABLE whatsapp_document_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_document_mappings_space_read ON whatsapp_document_mappings
  FOR SELECT
  USING (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

CREATE POLICY whatsapp_document_mappings_space_insert ON whatsapp_document_mappings
  FOR INSERT
  WITH CHECK (shared_space_id IN (
    SELECT id FROM shared_spaces WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
    ))
  ));

-- Trigger to update expires_at status
CREATE OR REPLACE FUNCTION update_shared_space_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < NOW() THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shared_space_status
  BEFORE UPDATE ON shared_spaces
  FOR EACH ROW
  EXECUTE FUNCTION update_shared_space_status();

-- Trigger to auto-expire spaces
CREATE OR REPLACE FUNCTION expire_old_shared_spaces()
RETURNS void AS $$
BEGIN
  UPDATE shared_spaces
  SET status = 'expired'
  WHERE expires_at < NOW() AND status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Schedule to run daily (requires pg_cron extension)
-- SELECT cron.schedule('expire-shared-spaces', '0 0 * * *', 'SELECT expire_old_shared_spaces()');
