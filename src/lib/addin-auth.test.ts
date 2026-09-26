// @vitest-environment jsdom
/**
 * Office add-in sign-in (Word + Outlook task panes): the token from the Office
 * dialog is accepted only from the Subsumio origin and in the agreed shape,
 * lives in memory/sessionStorage only (never localStorage), and is renewed
 * before it expires.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ADDIN_DIALOG_MESSAGE_TYPE as PANE_TYPE,
  LEGACY_STORAGE_KEY,
  RENEW_LEAD_MS,
  SESSION_STORAGE_KEY,
  clearStoredSession,
  msUntilRenewal,
  openSignInDialog,
  parseDialogMessage,
  readStoredSession,
  storeSession,
  type OfficeDialogHost,
} from "../../word-addin/src/addin-auth";
import { ADDIN_DIALOG_MESSAGE_TYPE, buildAddinDialogMessage } from "./addin-dialog";

const ORIGIN = "https://subsum.io";
const NOW = Date.UTC(2099, 0, 1, 8, 0, 0);
const EXPIRES = new Date(NOW + 24 * 3600_000).toISOString();

function message(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: ADDIN_DIALOG_MESSAGE_TYPE,
    client: "word",
    token: "sk_addin_abc",
    expires_at: EXPIRES,
    ...overrides,
  });
}

const expected = { origin: ORIGIN, client: "word", originRequired: true };

describe("add-in sign-in dialog message", () => {
  it("both task panes carry the same sign-in module, matching the dialog page", () => {
    const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
    expect(read("outlook-addin/src/addin-auth.ts")).toBe(read("word-addin/src/addin-auth.ts"));
    expect(PANE_TYPE).toBe(ADDIN_DIALOG_MESSAGE_TYPE);
    const fromPage = buildAddinDialogMessage("word", {
      token: "sk_addin_abc",
      expires_at: EXPIRES,
    });
    expect(parseDialogMessage({ message: fromPage, origin: ORIGIN }, expected, NOW)).toEqual({
      token: "sk_addin_abc",
      expiresAt: Date.parse(EXPIRES),
    });
  });

  it("rejects a message from another origin, or without origin where the host reports one", () => {
    expect(() =>
      parseDialogMessage({ message: message(), origin: "https://evil.example" }, expected, NOW)
    ).toThrow(/Herkunft/);
    expect(() => parseDialogMessage({ message: message() }, expected, NOW)).toThrow(/Herkunft/);
    // Hosts without DialogApi 1.2 report no origin (same-domain delivery only).
    expect(
      parseDialogMessage({ message: message() }, { ...expected, originRequired: false }, NOW).token
    ).toBe("sk_addin_abc");
  });

  it("rejects wrong shapes, other add-ins, permanent keys and expired tokens", () => {
    const bad = [
      "not json",
      message({ type: "other" }),
      message({ client: "outlook" }),
      message({ token: "sk_live_permanent" }),
      message({ expires_at: new Date(NOW - 1000).toISOString() }),
      message({ expires_at: "kaputt" }),
    ];
    for (const m of bad) {
      expect(() => parseDialogMessage({ message: m, origin: ORIGIN }, expected, NOW)).toThrow();
    }
  });

  it("the dialog page refuses to pass on anything but an add-in token", () => {
    expect(() =>
      buildAddinDialogMessage("word", { token: "sk_live_x", expires_at: EXPIRES })
    ).toThrow();
    expect(() => buildAddinDialogMessage("word", { token: "sk_addin_x" })).toThrow();
  });
});

describe("add-in session storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("keeps the session in sessionStorage only and never in localStorage", () => {
    storeSession(sessionStorage, { token: "sk_addin_abc", expiresAt: NOW + 1000 });
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toContain("sk_addin_abc");
    expect(JSON.stringify({ ...localStorage })).not.toContain("sk_addin_abc");
    expect(readStoredSession(sessionStorage, NOW)?.token).toBe("sk_addin_abc");
  });

  it("drops an expired or foreign stored session", () => {
    storeSession(sessionStorage, { token: "sk_addin_abc", expiresAt: NOW - 1 });
    expect(readStoredSession(sessionStorage, NOW)).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ token: "sk_live_x", expiresAt: NOW + 1000 })
    );
    expect(readStoredSession(sessionStorage, NOW)).toBeNull();
  });

  it("sign-out clears the session and a permanent key left by older versions", () => {
    storeSession(sessionStorage, { token: "sk_addin_abc", expiresAt: NOW + 1000 });
    localStorage.setItem(LEGACY_STORAGE_KEY, "sk_live_old");
    clearStoredSession(sessionStorage);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("asks for renewal before expiry", () => {
    const s = { token: "sk_addin_abc", expiresAt: NOW + 24 * 3600_000 };
    expect(msUntilRenewal(s, NOW)).toBe(24 * 3600_000 - RENEW_LEAD_MS);
    expect(msUntilRenewal(s, s.expiresAt - 1000)).toBe(0);
  });
});

describe("openSignInDialog", () => {
  function fakeOffice(onOpen: (url: string, fire: (event: string, arg: object) => void) => void) {
    const closed: boolean[] = [];
    const office: OfficeDialogHost = {
      context: {
        requirements: { isSetSupported: () => true },
        ui: {
          displayDialogAsync(url, _opts, cb) {
            const handlers: Record<string, (arg: object) => void> = {};
            cb({
              status: "succeeded",
              value: {
                addEventHandler: (type, h) => {
                  handlers[type] = h as (arg: object) => void;
                },
                close: () => closed.push(true),
              },
            });
            onOpen(url, (event, arg) => handlers[event]?.(arg));
          },
        },
      },
    };
    return { office, closed };
  }

  it("opens the Subsumio dialog page for the add-in and returns the checked token", async () => {
    let opened = "";
    const { office, closed } = fakeOffice((url, fire) => {
      opened = url;
      fire("dialogMessageReceived", {
        message: message({ expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        origin: ORIGIN,
      });
    });
    const s = await openSignInDialog(office, { apiBase: ORIGIN, client: "word" });
    expect(opened).toBe("https://subsum.io/addin-connect?client=word");
    expect(s.token).toBe("sk_addin_abc");
    expect(closed).toEqual([true]);
  });

  it("rejects a token from a foreign origin and a closed dialog", async () => {
    const foreign = fakeOffice((_u, fire) =>
      fire("dialogMessageReceived", { message: message(), origin: "https://evil.example" })
    );
    await expect(
      openSignInDialog(foreign.office, { apiBase: ORIGIN, client: "word" })
    ).rejects.toThrow(/Herkunft/);
    const cancelled = fakeOffice((_u, fire) => fire("dialogEventReceived", { error: 12006 }));
    await expect(
      openSignInDialog(cancelled.office, { apiBase: ORIGIN, client: "word" })
    ).rejects.toThrow(/abgebrochen/);
  });
});
