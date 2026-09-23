// @vitest-environment node

/**
 * Integrationstest fuer den Mutation-Queue-Teil des Offline-Stores —
 * laeuft gegen fake-indexeddb, damit die Persistenz des conflicted-
 * Flags und die Sortierung der Queue wirklich geprueft werden
 * (offline-store.test.ts deckt nur die No-IDB-Fehlerpfade ab).
 */

import { indexedDB } from "fake-indexeddb";
import { describe, test, expect, beforeAll } from "vitest";

beforeAll(() => {
  Object.defineProperty(globalThis, "indexedDB", {
    value: indexedDB,
    configurable: true,
  });
});

import {
  enqueueMutation,
  getPendingMutations,
  setMutationConflicted,
  incrementMutationRetries,
  removeMutation,
  clearMutations,
} from "./offline-store";

describe("offline-store mutation queue (fake-indexeddb)", () => {
  test("enqueue + getPendingMutations sortiert nach createdAt", async () => {
    await clearMutations();
    await enqueueMutation({ type: "deletePage", payload: { slug: "b" } });
    // zweite Mutation bekommt spaeteres createdAt
    await new Promise((r) => setTimeout(r, 5));
    await enqueueMutation({ type: "updatePage", payload: { slug: "a" } });

    const pending = await getPendingMutations();
    expect(pending).toHaveLength(2);
    expect(pending[0].payload.slug).toBe("b");
    expect(pending[1].payload.slug).toBe("a");
    expect(pending[0].id).toBeTruthy();
  });

  test("setMutationConflicted setzt Flag + conflictAt und liest es wieder", async () => {
    await clearMutations();
    await enqueueMutation({ type: "updatePage", payload: { slug: "cases/x" } });
    const [mut] = await getPendingMutations();
    expect(mut.conflicted).toBeUndefined();

    await setMutationConflicted(mut.id, true);
    const [flagged] = await getPendingMutations();
    expect(flagged.conflicted).toBe(true);
    expect(typeof flagged.conflictAt).toBe("string");
    expect(Date.parse(flagged.conflictAt!)).not.toBeNaN();

    await setMutationConflicted(mut.id, false);
    const [cleared] = await getPendingMutations();
    expect(cleared.conflicted).toBe(false);
    expect(cleared.conflictAt).toBeUndefined();
  });

  test("incrementMutationRetries erhoeht retries persistent", async () => {
    await clearMutations();
    await enqueueMutation({ type: "createPage", payload: { slug: "c" } });
    const [mut] = await getPendingMutations();
    await incrementMutationRetries(mut.id);
    await incrementMutationRetries(mut.id);
    const [after] = await getPendingMutations();
    expect(after.retries).toBe(2);
  });

  test("removeMutation entfernt den Eintrag", async () => {
    await clearMutations();
    await enqueueMutation({ type: "createPage", payload: { slug: "d" } });
    const [mut] = await getPendingMutations();
    await removeMutation(mut.id);
    expect(await getPendingMutations()).toHaveLength(0);
  });
});
