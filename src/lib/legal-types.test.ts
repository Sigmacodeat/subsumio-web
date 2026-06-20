// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  frontmatterOf,
  caseFrontmatter,
  invoiceFrontmatter,
  type CaseFrontmatter,
  type ContactFrontmatter,
  type DeadlineEntry,
  type TimeEntry,
  type ExpenseEntry,
  type TaskEntry,
  type TimelineEntry,
  type DocumentEntry,
  type EvidenceEntry,
  type AuditLogEntry,
  type InvoiceFrontmatter,
} from "./legal-types";

// ── frontmatterOf ──────────────────────────────────────────────────────

describe("frontmatterOf", () => {
  test("extracts frontmatter from a page object", () => {
    const page = { frontmatter: { status: "open", priority: "high" } };
    const fm = frontmatterOf<Record<string, unknown>>(page);
    expect(fm.status).toBe("open");
    expect(fm.priority).toBe("high");
  });

  test("returns empty object for null page", () => {
    expect(frontmatterOf<Record<string, unknown>>(null)).toEqual({});
  });

  test("returns empty object for undefined page", () => {
    expect(frontmatterOf<Record<string, unknown>>(undefined)).toEqual({});
  });

  test("returns empty object when frontmatter is undefined", () => {
    expect(frontmatterOf<Record<string, unknown>>({})).toEqual({});
  });

  test("returns empty object when frontmatter is null", () => {
    const page = { frontmatter: null };
    expect(frontmatterOf<Record<string, unknown>>(page)).toEqual({});
  });

  test("returns empty object when frontmatter is a string", () => {
    const page = { frontmatter: "not-an-object" };
    expect(frontmatterOf<Record<string, unknown>>(page)).toEqual({});
  });

  test("returns empty object when frontmatter is a number", () => {
    const page = { frontmatter: 42 };
    expect(frontmatterOf<Record<string, unknown>>(page)).toEqual({});
  });

  test("preserves nested objects in frontmatter", () => {
    const page = {
      frontmatter: {
        strategy: { summary: "Test", risks: [{ description: "Risk 1" }] },
      },
    };
    const fm = frontmatterOf<CaseFrontmatter>(page);
    expect(fm.strategy).toBeDefined();
    expect(fm.strategy?.summary).toBe("Test");
    expect(fm.strategy?.risks).toHaveLength(1);
  });

  test("preserves arrays in frontmatter", () => {
    const page = {
      frontmatter: {
        deadlines: [{ title: "Frist 1", date: "2026-01-01" }],
        tasks: [{ id: "t1", text: "Task 1", done: false, createdAt: "2026-01-01" }],
      },
    };
    const fm = frontmatterOf<CaseFrontmatter>(page);
    expect(fm.deadlines).toHaveLength(1);
    expect(fm.tasks).toHaveLength(1);
  });
});

// ── caseFrontmatter ────────────────────────────────────────────────────

describe("caseFrontmatter", () => {
  test("extracts CaseFrontmatter from a page", () => {
    const page = {
      frontmatter: {
        type: "case",
        case_number: "2026-001",
        status: "open",
        priority: "high",
        client_name: "Max Mustermann",
      },
    };
    const fm = caseFrontmatter(page);
    expect(fm.type).toBe("case");
    expect(fm.case_number).toBe("2026-001");
    expect(fm.status).toBe("open");
    expect(fm.priority).toBe("high");
    expect(fm.client_name).toBe("Max Mustermann");
  });

  test("returns empty object for page without frontmatter", () => {
    expect(caseFrontmatter({})).toEqual({});
  });

  test("returns empty object for page with null frontmatter (cast)", () => {
    expect(caseFrontmatter({ frontmatter: null as unknown as undefined })).toEqual({});
  });

  test("handles all CaseFrontmatter fields", () => {
    const page = {
      frontmatter: {
        type: "case",
        case_number: "AZ-2026-001",
        status: "pending",
        legal_area: "Zivilrecht",
        sub_area: "Vertragsrecht",
        priority: "critical",
        client_id: "c1",
        client_name: "Kläger GmbH",
        client_slug: "contact/klaeger-gmbh",
        opponent_id: "o1",
        opponent_name: "Beklagte AG",
        opponent_slugs: ["contact/beklagte-ag"],
        own_lawyer_id: "l1",
        own_lawyer_name: "Dr. Schmidt",
        own_lawyer_slug: "contact/dr-schmidt",
        court_id: "ct1",
        court_name: "LG Wien",
        court_slug: "contact/lg-wien",
        claims: ["Schadensersatz"],
        defenses: ["Leugnung"],
        evidence: [{ title: "Vertrag", type: "document", strength: "high" }],
        strategy: { summary: "Klage auf Schadensersatz", recommended: "Klage" },
        estimated_value: { min: 10000, max: 50000, currency: "EUR" },
        tags: ["Vertragsbruch"],
        deadlines: [{ title: "Klagefrist", date: "2026-03-01" }],
        timeline: [{ date: "2026-01-01", title: "Mandat erteilt" }],
        tasks: [{ id: "t1", text: "Klage einreichen", done: false, createdAt: "2026-01-01" }],
        time_entries: [{ id: "te1", description: "Recherche", minutes: 60, date: "2026-01-01" }],
        expenses: [{ id: "e1", description: "Gerichtsgebühr", date: "2026-01-01", amount: 300 }],
        documents: [{ id: "d1", name: "Vertrag.pdf", uploadedAt: "2026-01-01" }],
        portal_enabled: true,
        portal_note: "Mandant kann Dokumente einsehen",
        audit_log: [{ id: "a1", at: "2026-01-01", action: "created" }],
        version: 1,
      },
    };
    const fm = caseFrontmatter(page);
    expect(fm.legal_area).toBe("Zivilrecht");
    expect(fm.opponent_slugs).toEqual(["contact/beklagte-ag"]);
    expect(fm.estimated_value?.min).toBe(10000);
    expect(fm.portal_enabled).toBe(true);
    expect(fm.version).toBe(1);
  });
});

// ── invoiceFrontmatter ─────────────────────────────────────────────────

describe("invoiceFrontmatter", () => {
  test("extracts InvoiceFrontmatter from a page", () => {
    const page = {
      frontmatter: {
        type: "invoice",
        invoice_number: "INV-2026-001",
        client: "Max Mustermann",
        client_slug: "contact/max-mustermann",
        case_number: "2026-001",
        date: "2026-03-01",
        due_date: "2026-03-15",
        items: [{ description: "Recherche", date: "2026-01-15", hours: 2, rate: 200, amount: 400 }],
        expenses: [{ description: "Gerichtsgebühr", date: "2026-01-01", amount: 300 }],
        status: "paid",
        subtotal: 400,
        expense_total: 300,
        total: 700,
        vat_rate: 19,
        tax: 133,
      },
    };
    const fm = invoiceFrontmatter(page);
    expect(fm.invoice_number).toBe("INV-2026-001");
    expect(fm.items).toHaveLength(1);
    expect(fm.status).toBe("paid");
    expect(fm.total).toBe(700);
  });

  test("returns empty object for page without frontmatter", () => {
    expect(invoiceFrontmatter({})).toEqual({});
  });

  test("handles invoice_type field", () => {
    const page = {
      frontmatter: { invoice_type: "teilrechnung" },
    };
    const fm = invoiceFrontmatter(page);
    expect(fm.invoice_type).toBe("teilrechnung");
  });

  test("handles reminder fields", () => {
    const page = {
      frontmatter: {
        reminder_count: 2,
        reminder_sent_at: ["2026-03-16", "2026-03-23"],
        reminder_fee: 5.0,
      },
    };
    const fm = invoiceFrontmatter(page);
    expect(fm.reminder_count).toBe(2);
    expect(fm.reminder_sent_at).toHaveLength(2);
    expect(fm.reminder_fee).toBe(5.0);
  });
});

// ── Type contracts: DeadlineEntry ──────────────────────────────────────

describe("DeadlineEntry type contract", () => {
  test("minimal deadline entry", () => {
    const d: DeadlineEntry = { title: "Frist", date: "2026-03-01" };
    expect(d.title).toBe("Frist");
    expect(d.date).toBe("2026-03-01");
  });

  test("full deadline entry with all fields", () => {
    const d: DeadlineEntry = {
      id: "d1",
      title: "Klagefrist",
      description: "Frist zur Klageerhebung",
      date: "2026-03-01",
      due_date: "2026-03-01",
      status: "open",
      type: "legal_deadline",
      source: "court",
      court: "LG Wien",
      location: "Wien",
      start_date: "2026-01-01",
      rule_key: "zpo-klage",
      law: "ZPO",
      calculation_note: "Berechnet ab Zustellung",
      reminder_sent_at: "2026-02-15",
      review_status: "approved",
      reviewed_by: "Dr. Schmidt",
      reviewed_at: "2026-01-15",
      created_at: "2026-01-01",
      updated_at: "2026-01-15",
      audit_log: [{ at: "2026-01-01", action: "created", actor: "Dr. Schmidt" }],
    };
    expect(d.id).toBe("d1");
    expect(d.review_status).toBe("approved");
    expect(d.audit_log).toHaveLength(1);
  });

  test("review_status union type accepts all 4 values", () => {
    const statuses: DeadlineEntry["review_status"][] = ["unreviewed", "reviewed", "approved", "rejected"];
    for (const s of statuses) {
      const d: DeadlineEntry = { review_status: s };
      expect(d.review_status).toBe(s);
    }
  });
});

// ── Type contracts: ContactFrontmatter ─────────────────────────────────

describe("ContactFrontmatter type contract", () => {
  test("all role values are valid", () => {
    const roles: ContactFrontmatter["role"][] = ["client", "opponent", "court", "lawyer", "other"];
    for (const role of roles) {
      const c: ContactFrontmatter = { role };
      expect(c.role).toBe(role);
    }
  });

  test("full contact entry", () => {
    const c: ContactFrontmatter = {
      type: "contact",
      role: "client",
      name: "Max Mustermann",
      company: "Mustermann GmbH",
      email: "max@mustermann.at",
      phone: "+43 1 234 5678",
      address: "Wiener Straße 1, 1010 Wien",
      notes: "Stammmandant",
      tags: ["VIP", "Wien"],
    };
    expect(c.role).toBe("client");
    expect(c.email).toBe("max@mustermann.at");
  });
});

// ── Type contracts: TimeEntry, ExpenseEntry, TaskEntry ─────────────────

describe("TimeEntry type contract", () => {
  test("minimal entry", () => {
    const e: TimeEntry = { id: "t1", description: "Test", minutes: 30, date: "2026-01-01" };
    expect(e.id).toBe("t1");
  });

  test("full entry with all optional fields", () => {
    const e: TimeEntry = {
      id: "t1",
      description: "Recherche",
      minutes: 90,
      date: "2026-01-15",
      rate: 220,
      billable: true,
      billed: false,
      invoice_number: "INV-001",
      lawyer: "Dr. Schmidt",
      activity_type: "research",
      started_at: "2026-01-15T09:00:00Z",
      ended_at: "2026-01-15T10:30:00Z",
      note: "Recherche zu § 280 BGB",
    };
    expect(e.rate).toBe(220);
    expect(e.started_at).toBeDefined();
  });
});

describe("ExpenseEntry type contract", () => {
  test("minimal entry", () => {
    const e: ExpenseEntry = { id: "e1", description: "Gerichtsgebühr", date: "2026-01-01", amount: 300 };
    expect(e.amount).toBe(300);
  });

  test("full entry", () => {
    const e: ExpenseEntry = {
      id: "e1",
      description: "Reisekosten",
      date: "2026-01-15",
      amount: 45.50,
      vat_rate: 20,
      billable: true,
      billed: true,
      invoice_number: "INV-001",
      receipt_slug: "receipt-001",
    };
    expect(e.vat_rate).toBe(20);
    expect(e.receipt_slug).toBe("receipt-001");
  });
});

describe("TaskEntry type contract", () => {
  test("minimal entry", () => {
    const t: TaskEntry = { id: "t1", text: "Klage einreichen", done: false, createdAt: "2026-01-01" };
    expect(t.done).toBe(false);
  });

  test("done task", () => {
    const t: TaskEntry = { id: "t1", text: "Erledigt", done: true, createdAt: "2026-01-01" };
    expect(t.done).toBe(true);
  });
});

// ── Type contracts: TimelineEntry, DocumentEntry, EvidenceEntry ────────

describe("TimelineEntry type contract", () => {
  test("minimal entry", () => {
    const t: TimelineEntry = { date: "2026-01-01", title: "Mandat erteilt" };
    expect(t.title).toBe("Mandat erteilt");
  });

  test("full entry", () => {
    const t: TimelineEntry = {
      id: "tl1",
      date: "2026-01-01",
      title: "Klage eingereicht",
      description: "Klage beim LG Wien eingereicht",
      type: "filing",
      status: "completed",
    };
    expect(t.type).toBe("filing");
  });
});

describe("DocumentEntry type contract", () => {
  test("minimal entry", () => {
    const d: DocumentEntry = { id: "d1", name: "Vertrag.pdf", uploadedAt: "2026-01-01" };
    expect(d.name).toBe("Vertrag.pdf");
  });

  test("full entry", () => {
    const d: DocumentEntry = {
      id: "d1",
      name: "Klage.pdf",
      url: "https://example.com/klage.pdf",
      uploadedAt: "2026-01-01",
      size: 102400,
      slug: "doc-klage",
      source: "upload",
      kind: "pdf",
    };
    expect(d.size).toBe(102400);
  });
});

describe("EvidenceEntry type contract", () => {
  test("minimal entry", () => {
    const e: EvidenceEntry = { title: "Vertrag" };
    expect(e.title).toBe("Vertrag");
  });

  test("full entry with weight", () => {
    const e: EvidenceEntry = {
      title: "Zeugenaussage",
      description: "Aussage des Zeugen Müller",
      type: "witness",
      strength: "high",
      source: "Verhandlung",
      weight: 0.85,
    };
    expect(e.weight).toBe(0.85);
  });
});

// ── Type contracts: AuditLogEntry ──────────────────────────────────────

describe("AuditLogEntry type contract", () => {
  test("minimal entry", () => {
    const a: AuditLogEntry = { id: "a1", at: "2026-01-01", action: "created" };
    expect(a.action).toBe("created");
  });

  test("all action types are valid", () => {
    const actions: AuditLogEntry["action"][] = [
      "created", "updated", "deleted", "status_changed", "time_added", "deadline_added", "reminder_sent",
    ];
    for (const action of actions) {
      const a: AuditLogEntry = { id: "a1", at: "2026-01-01", action };
      expect(a.action).toBe(action);
    }
  });

  test("full entry with all optional fields", () => {
    const a: AuditLogEntry = {
      id: "a1",
      at: "2026-01-01T12:00:00Z",
      action: "status_changed",
      actor: "Dr. Schmidt",
      actorId: "user-1",
      field: "status",
      oldValue: "open",
      newValue: "won",
      note: "Urteil verkündet",
    };
    expect(a.field).toBe("status");
    expect(a.oldValue).toBe("open");
    expect(a.newValue).toBe("won");
  });
});

// ── Type contracts: InvoiceFrontmatter ─────────────────────────────────

describe("InvoiceFrontmatter type contract", () => {
  test("handles bank details", () => {
    const inv: InvoiceFrontmatter = {
      bank: { name: "Erste Bank", iban: "AT11 1234 5678 9012 3456", bic: "GIBAATWWXXX" },
    };
    expect(inv.bank?.name).toBe("Erste Bank");
    expect(inv.bank?.iban).toContain("AT");
  });

  test("handles invoice_type union", () => {
    const types: InvoiceFrontmatter["invoice_type"][] = ["standard", "teilrechnung", "sammelrechnung", "gutschrift"];
    for (const t of types) {
      const inv: InvoiceFrontmatter = { invoice_type: t };
      expect(inv.invoice_type).toBe(t);
    }
  });

  test("handles case_slugs array", () => {
    const inv: InvoiceFrontmatter = { case_slugs: ["case-1", "case-2"] };
    expect(inv.case_slugs).toHaveLength(2);
  });
});
