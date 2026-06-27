# Shared Spaces Blueprint – Cross-Org Collaboration

**Datum:** 27. Juni 2026  
**Zweck:** Cross-Org Collaboration für Mandanten, Externe Counsel und Joint Ventures  
**Status:** Entwurf

---

# 1. Ziel des Systems

Mandanten können über einen sicheren Link Dokumente hochladen, die automatisch in einem Shared Space mit der Kanzlei geteilt werden. WhatsApp-Dokumente werden automatisch in Shared Spaces gespeichert. Client Portal nutzt Shared Spaces für Mandanten-Akten.

---

# 2. Kern-Userflows

## 2.1 Kanzlei erstellt Shared Space

1. Kanzlei navigiert zu `/dashboard/shared-spaces`
2. Klick auf "Neuer Shared Space"
3. Name, Beschreibung, Gültigkeitsdauer eingeben
4. Mandanten-Emails oder Rollen auswählen
5. System generiert sicheren Link
6. Link wird an Mandanten gesendet

## 2.2 Mandant lädt Dokumente hoch

1. Mandant öffnet Link
2. Authentifizierung via Email-Link oder Portal-Token
3. Drag & Drop oder Datei-Auswahl
4. Upload mit Fortschrittsanzeige
5. Dokumente erscheinen im Shared Space

## 2.3 WhatsApp → Shared Space

1. Mandant sendet Dokument via WhatsApp
2. System erkennt Dokument
3. System speichert Dokument in Shared Space
4. Kanzlei erhält Benachrichtigung
5. Dokument ist in Mandantenakte sichtbar

## 2.4 Client Portal → Shared Space

1. Mandant loggt sich in Client Portal ein
2. Navigiert zu "Dokumente"
3. Sieht Shared Space Dokumente
4. Kann eigene Dokumente hochladen
5. Kann Dokumente herunterladen

---

# 3. UI-Elemente & Interaktionen

## 3.1 Shared Spaces Dashboard

- Liste aller Shared Spaces
- Status (aktiv, abgelaufen, archiviert)
- Teilnehmer-Anzahl
- Dokumenten-Anzahl
- Erstellungsdatum
- Ablaufdatum
- Actions: Link kopieren, bearbeiten, archivieren, löschen

## 3.2 Shared Space Detail

- Name, Beschreibung
- Teilnehmer-Liste
- Dokumenten-Liste mit Thumbnails
- Upload-Zone (Drag & Drop)
- Filter nach Typ, Datum, Größe
- Suche nach Dateinamen
- Bulk-Actions (herunterladen, löschen)

## 3.3 Mandanten-Upload-Page

- Minimalistisches Design
- Upload-Zone prominent
- Drag & Drop Support
- Fortschrittsanzeige
- Erfolgsmeldung
- "Weitere Dokumente hochladen" Button

## 3.4 WhatsApp Integration

- Automatische Erkennung von Dokumenten
- Benachrichtigung an Kanzlei
- Zuordnung zu Shared Space (optional)
- Vorschau in WhatsApp Chat

---

# 4. Datenmodell

## 4.1 Shared Space Entity

```typescript
interface SharedSpace {
  id: string;
  slug: string;
  name: string;
  description?: string;
  organization_id: string; // Kanzlei
  created_by: string; // User ID
  created_at: string;
  expires_at?: string;
  status: "active" | "expired" | "archived";
  access_token: string; // Secure token for link
  settings: {
    allow_upload: boolean;
    allow_download: boolean;
    max_file_size: number; // bytes
    allowed_file_types: string[];
    require_auth: boolean;
  };
}
```

## 4.2 Shared Space Participant

```typescript
interface SharedSpaceParticipant {
  id: string;
  shared_space_id: string;
  user_id?: string; // Optional for external participants
  email?: string; // For external participants
  role: "owner" | "editor" | "viewer";
  invited_by: string;
  invited_at: string;
  accepted_at?: string;
}
```

## 4.3 Shared Space Document

```typescript
interface SharedSpaceDocument {
  id: string;
  shared_space_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_at: string;
  metadata?: {
    whatsapp_message_id?: string;
    client_portal_upload?: boolean;
  };
}
```

## 4.4 WhatsApp → Shared Space Mapping

```typescript
interface WhatsAppDocumentMapping {
  id: string;
  whatsapp_message_id: string;
  shared_space_id: string;
  document_id: string;
  mapped_at: string;
  mapped_by: string; // System or user
}
```

---

# 5. Architektur-Entscheidungen

## 5.1 Storage

- **Primary:** Hetzner S3-compatible Storage (B2)
- **Backup:** Second region (optional)
- **Encryption:** AES-256-GCM at rest
- **Access:** Signed URLs with expiration

## 5.2 Security

- **Access Tokens:** UUID with expiration
- **Rate Limiting:** Per IP and per space
- **File Validation:** Type checking, size limits, virus scan (optional)
- **Audit Logging:** All uploads, downloads, accesses

## 5.3 Multi-Tenancy

- **Row-Level Security:** Postgres RLS for shared_spaces
- **Organization Isolation:** Spaces scoped to org
- **Participant Isolation:** Participants can only access their spaces

## 5.4 WhatsApp Integration

- **Webhook:** WhatsApp Business API Webhook
- **Document Detection:** Media type detection
- **Auto-Mapping:** Rules-based mapping to spaces
- **Manual Override:** User can change mapping

---

# 6. API-Endpunkte

## 6.1 Shared Spaces CRUD

### GET /api/shared-spaces

- List all shared spaces for organization
- Query params: status, search, page, limit

### POST /api/shared-spaces

- Create new shared space
- Body: name, description, expires_at, settings

### GET /api/shared-spaces/:id

- Get shared space details

### PATCH /api/shared-spaces/:id

- Update shared space
- Body: name, description, expires_at, settings

### DELETE /api/shared-spaces/:id

- Archive or delete shared space

## 6.2 Participants

### GET /api/shared-spaces/:id/participants

- List participants

### POST /api/shared-spaces/:id/participants

- Invite participant
- Body: email, role

### DELETE /api/shared-spaces/:id/participants/:participant_id

- Remove participant

## 6.3 Documents

### GET /api/shared-spaces/:id/documents

- List documents
- Query params: type, date, search, page, limit

### POST /api/shared-spaces/:id/documents

- Upload document
- Body: multipart/form-data
- Returns: document_id, storage_path

### GET /api/shared-spaces/:id/documents/:document_id

- Get document details

### DELETE /api/shared-spaces/:id/documents/:document_id

- Delete document

### GET /api/shared-spaces/:id/documents/:document_id/download

- Download document
- Returns: signed URL or stream

## 6.4 Public Access (Mandanten)

### GET /s/:token

- Public shared space page
- Validates token
- Shows upload interface

### POST /s/:token/upload

- Upload document (public)
- Validates token
- Requires auth if settings.require_auth

## 6.5 WhatsApp Integration

### POST /api/whatsapp/document-to-space

- Map WhatsApp document to shared space
- Body: whatsapp_message_id, shared_space_id
- Returns: mapping_id

### GET /api/whatsapp/documents

- List WhatsApp documents
- Query params: unmapped_only, date_range

---

# 7. Edge-Cases & Fehlerszenarien

## 7.1 Token Expiration

- **Scenario:** Mandant öffnet abgelaufenen Link
- **Handling:** Zeige "Link abgelaufen" mit Option, neuen Link anzufordern

## 7.2 File Size Exceeded

- **Scenario:** Mandant lädt zu große Datei hoch
- **Handling:** Zeige Fehler mit Max-Größe, biete Komprimierung an

## 7.3 Invalid File Type

- **Scenario:** Mandant lädt nicht erlaubten Dateityp hoch
- **Handling:** Zeige Fehler mit erlaubten Typen

## 7.4 WhatsApp Document Mapping

- **Scenario:** WhatsApp Dokument kann keinem Space zugeordnet werden
- **Handling:** Speicher in "Unmapped" Queue, biete manuelle Zuordnung an

## 7.5 Storage Failure

- **Scenario:** Upload schlägt fehl
- **Handling:** Zeige Fehler, biete Retry an, logge Incident

## 7.6 Participant Access

- **Scenario:** Teilnehmer versucht auf Space zuzugreifen, ohne Berechtigung
- **Handling:** 403 Forbidden, logge Versuch

---

# 8. Definition of Done

- [ ] Shared Spaces CRUD API implementiert
- [ ] Shared Spaces UI implementiert
- [ ] Mandanten-Upload-Page implementiert
- [ ] WhatsApp → Shared Space Integration implementiert
- [ ] Client Portal → Shared Space Integration implementiert
- [ ] Security (RLS, Token Validation, Rate Limiting) implementiert
- [ ] Audit Logging implementiert
- [ ] E2E Tests für alle Flows
- [ ] Performance Tests (Upload unter Last)
- [ ] Security Tests (Token Leak, Access Control)
- [ ] Dokumentation (User Guide, API Docs)

---

# 9. Arbeitspakete

## Paket 1: Datenmodell & Database Schema

- Ziel: Shared Spaces Entities in Postgres
- Abhängigkeiten: Keine
- Aufwand: 2 Tage

## Paket 2: Shared Spaces API

- Ziel: CRUD API für Spaces, Participants, Documents
- Abhängigkeiten: Paket 1
- Aufwand: 3 Tage

## Paket 3: Shared Spaces UI

- Ziel: Dashboard und Detail-Page
- Abhängigkeiten: Paket 2
- Aufwand: 3 Tage

## Paket 4: Mandanten-Upload-Page

- Ziel: Public Upload-Page mit Token-Validation
- Abhängigkeiten: Paket 2
- Aufwand: 2 Tage

## Paket 5: WhatsApp Integration

- Ziel: Auto-Mapping von WhatsApp-Dokumenten
- Abhängigkeiten: Paket 2, Paket 4
- Aufwand: 2 Tage

## Paket 6: Client Portal Integration

- Ziel: Shared Spaces in Client Portal
- Abhängigkeiten: Paket 2, Paket 3
- Aufwand: 2 Tage

## Paket 7: Security & Audit

- Ziel: RLS, Token Validation, Rate Limiting, Audit Logging
- Abhängigkeiten: Paket 2
- Aufwand: 2 Tage

## Paket 8: Testing & Documentation

- Ziel: E2E Tests, Performance Tests, Security Tests, Docs
- Abhängigkeiten: Alle Pakete
- Aufwand: 2 Tage

**Gesamtaufwand:** 16 Tage (ca. 3-4 Wochen)

---

**Blueprint erstellt am:** 27. Juni 2026
