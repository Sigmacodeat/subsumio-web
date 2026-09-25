// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkProtectedArrayWrite,
  guardProtectedPageWrite,
  type CurrentPageLike,
  type WriteActor,
} from "@/lib/page-write-guards";

const assistant: WriteActor = { email: "assistenz@kanzlei.example", canWriteSettings: false };
const admin: WriteActor = { email: "admin@kanzlei.example", canWriteSettings: true };

function judge(input: Partial<Parameters<typeof guardProtectedPageWrite>[0]> & { slug: string }) {
  return guardProtectedPageWrite({ current: null, actor: assistant, mode: "merge", ...input });
}
const rejected = (r: ReturnType<typeof guardProtectedPageWrite>) =>
  "reject" in r ? r.reject : null;

const settingsPage: CurrentPageLike = {
  slug: "legal/settings/kanzlei",
  type: "kanzlei_settings",
  frontmatter: { require2FA: true, iban: "AT00 1111" },
};

describe("Kanzlei-Einstellungen (OPS-18)", () => {
  it("an assistant may not change the settings via the generic API", () => {
    const r = judge({
      slug: "legal/settings/kanzlei",
      current: settingsPage,
      frontmatter: { require2FA: false },
    });
    expect(rejected(r)?.status).toBe(403);
  });

  it("the settings type is recognised from storage even under another slug", () => {
    const r = judge({
      slug: "legal/settings/other",
      current: { ...settingsPage, slug: "legal/settings/other" },
      frontmatter: { iban: "AT99" },
    });
    expect(rejected(r)?.status).toBe(403);
  });

  it("an admin may save them", () => {
    const r = judge({
      slug: "legal/settings/kanzlei",
      current: settingsPage,
      actor: admin,
      frontmatter: { iban: "AT22" },
    });
    expect(rejected(r)).toBeNull();
  });

  it("nobody deletes them or array-mutates them generically", () => {
    expect(
      rejected(
        judge({
          slug: "legal/settings/kanzlei",
          current: settingsPage,
          actor: admin,
          mode: "delete",
        })
      )?.status
    ).toBe(403);
    expect(
      rejected(
        judge({
          slug: "legal/settings/kanzlei",
          current: settingsPage,
          actor: admin,
          mode: "array",
          field: "x",
        })
      )?.status
    ).toBe(403);
  });
});

describe("KYC (OPS-7) and Anderkonten (GELD-7) only via their routes", () => {
  const kyc: CurrentPageLike = {
    slug: "legal/kyc/k1",
    type: "kyc_verification",
    frontmatter: { status: "in_progress" },
  };
  const trust: CurrentPageLike = {
    slug: "trust-accounts/1",
    type: "trust_account",
    frontmatter: { transactions: [], current_balance: 100 },
  };

  it("a merge that sets a KYC record to verified is rejected", () => {
    const r = judge({
      slug: "legal/kyc/k1",
      current: kyc,
      actor: admin,
      frontmatter: { status: "verified" },
    });
    expect(rejected(r)?.error).toBe("protected_page");
  });

  it("a KYC record cannot be created through the generic API either", () => {
    expect(
      rejected(judge({ slug: "x/y", type: "kyc_verification", mode: "replace" }))?.status
    ).toBe(403);
    expect(rejected(judge({ slug: "legal/kyc/new", mode: "replace" }))?.status).toBe(403);
  });

  it("trust account bookings cannot be changed, deleted or array-mutated generically", () => {
    for (const mode of ["merge", "replace", "delete", "array"] as const) {
      const r = judge({
        slug: "trust-accounts/1",
        current: trust,
        actor: admin,
        mode,
        field: "transactions",
        frontmatter: { transactions: [] },
      });
      expect(rejected(r)?.status).toBe(403);
    }
  });
});

describe("Freigaben (OPS-13)", () => {
  const decided: CurrentPageLike = {
    slug: "agent-action/a",
    type: "agent_action",
    frontmatter: { status: "approved", decided_by: "x@y" },
  };

  it("a new approval is always pending and stamped with the submitter", () => {
    const r = judge({
      slug: "legal/approvals/1",
      type: "agent_action",
      mode: "replace",
      frontmatter: { type: "agent_action", status: "pending", decided_by: "fake", summary: "s" },
    });
    expect(rejected(r)).toBeNull();
    const fm = "frontmatter" in r ? r.frontmatter : undefined;
    expect(fm?.status).toBe("pending");
    expect(fm?.decided_by).toBeUndefined();
    expect(fm?.submitted_by).toBe(assistant.email);
    expect(fm?.summary).toBe("s");
  });

  it("an approval cannot be created as already approved", () => {
    const r = judge({
      slug: "legal/approvals/1",
      type: "agent_action",
      mode: "replace",
      frontmatter: { status: "approved" },
    });
    expect(rejected(r)?.status).toBe(403);
  });

  it("an existing approval is not decided via the generic API", () => {
    const r = judge({
      slug: "agent-action/a",
      current: { ...decided, frontmatter: { status: "pending" } },
      actor: admin,
      frontmatter: { status: "approved" },
    });
    expect(rejected(r)?.status).toBe(403);
  });

  it("a decided approval cannot be deleted, a pending one can", () => {
    expect(
      rejected(judge({ slug: "agent-action/a", current: decided, mode: "delete" }))?.status
    ).toBe(403);
    expect(
      rejected(
        judge({
          slug: "agent-action/a",
          current: { ...decided, frontmatter: { status: "pending" } },
          mode: "delete",
        })
      )
    ).toBeNull();
  });
});

describe("Akten: Kollisionsstatus, Legal Hold, Archiv, Löschen (OPS-7, AKT-8, AKT-24)", () => {
  const matter: CurrentPageLike = {
    slug: "legal/cases/m1",
    type: "legal_case",
    frontmatter: { status: "active", conflict_status: "conflict_detected", legal_hold: true },
  };

  it("a merge without type may not set conflict_status on a matter", () => {
    const r = judge({
      slug: "legal/cases/m1",
      current: matter,
      actor: admin,
      frontmatter: { conflict_status: "conflict_cleared" },
    });
    expect(rejected(r)?.error).toBe("protected_fields");
  });

  it("echoing the stored conflict status unchanged is fine", () => {
    const r = judge({
      slug: "legal/cases/m1",
      current: matter,
      frontmatter: { conflict_status: "conflict_detected", notes: "x" },
    });
    expect(rejected(r)).toBeNull();
  });

  it("mandate_acceptance cannot be rewritten on an existing matter", () => {
    const r = judge({
      slug: "legal/cases/m1",
      current: matter,
      frontmatter: { mandate_acceptance: { status: "accepted" } },
    });
    expect(rejected(r)?.status).toBe(403);
  });

  it("legal_hold cannot be lifted through the generic API", () => {
    const r = judge({
      slug: "legal/cases/m1",
      current: matter,
      actor: admin,
      frontmatter: { legal_hold: false },
    });
    expect(rejected(r)?.error).toBe("protected_fields");
  });

  it("status tombstoned/archived and deletion markers are rejected", () => {
    expect(
      rejected(
        judge({ slug: "legal/cases/m1", current: matter, frontmatter: { status: "archived" } })
      )?.status
    ).toBe(403);
    expect(
      rejected(
        judge({
          slug: "legal/documents/d1",
          current: {
            slug: "legal/documents/d1",
            type: "document",
            frontmatter: { status: "active" },
          },
          actor: admin,
          frontmatter: { status: "tombstoned" },
        })
      )?.status
    ).toBe(403);
    expect(
      rejected(
        judge({
          slug: "legal/documents/d1",
          current: { slug: "legal/documents/d1", type: "document", frontmatter: {} },
          frontmatter: { tombstoned_at: "2026-09-25" },
        })
      )?.status
    ).toBe(403);
  });

  it("other page types may still use status 'archived' (e.g. review sets)", () => {
    const r = judge({
      slug: "review-sets/r1",
      current: { slug: "review-sets/r1", type: "review_set", frontmatter: { status: "produced" } },
      frontmatter: { status: "archived" },
    });
    expect(rejected(r)).toBeNull();
  });

  it("an archived matter takes no writes — merge or array op — except the restore path", () => {
    const archived: CurrentPageLike = {
      slug: "legal/cases/m2",
      type: "legal_case",
      frontmatter: { status: "archived", archived_at: "2026-01-01" },
    };
    expect(
      rejected(
        judge({
          slug: "legal/cases/m2",
          current: archived,
          actor: admin,
          frontmatter: { notes: "x" },
        })
      )?.error
    ).toBe("case_archived");
    expect(
      rejected(
        judge({
          slug: "legal/cases/m2",
          current: archived,
          actor: admin,
          mode: "array",
          field: "documents",
        })
      )?.error
    ).toBe("case_archived");
    expect(
      rejected(
        judge({
          slug: "legal/cases/m2",
          current: archived,
          actor: admin,
          frontmatter: { status: "active", restored_at: "2026-09-25" },
          restore: true,
        })
      )
    ).toBeNull();
  });

  it("array ops on protected fields are rejected", () => {
    expect(
      rejected(
        judge({
          slug: "legal/cases/m1",
          current: matter,
          mode: "array",
          field: "mandate_acceptance",
        })
      )?.status
    ).toBe(403);
    expect(
      rejected(
        judge({ slug: "legal/cases/m1", current: matter, mode: "array", field: "time_entries" })
      )
    ).toBeNull();
  });

  it("a full replace that would drop a stored hold is rejected", () => {
    const r = judge({
      slug: "legal/cases/m1",
      current: matter,
      mode: "replace",
      frontmatter: { conflict_status: "conflict_detected" },
    });
    expect(rejected(r)?.status).toBe(403);
  });
});

describe("checkProtectedArrayWrite", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails closed when the page cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 }))
    );
    const r = await checkProtectedArrayWrite("http://e", {}, "legal/cases/m1", "documents", admin);
    expect(r?.status).toBe(503);
  });

  it("rejects an array op on an archived matter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          slug: "legal/cases/m1",
          type: "legal_case",
          frontmatter: { status: "archived" },
        })
      )
    );
    const r = await checkProtectedArrayWrite("http://e", {}, "legal/cases/m1", "deadlines", admin);
    expect(r?.error).toBe("case_archived");
  });

  it("lets an ordinary array op through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          slug: "legal/cases/m1",
          type: "legal_case",
          frontmatter: { status: "active" },
        })
      )
    );
    expect(
      await checkProtectedArrayWrite("http://e", {}, "legal/cases/m1", "time_entries", assistant)
    ).toBeNull();
  });
});
