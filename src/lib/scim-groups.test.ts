import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyGroupPatch,
  changedMembers,
  FileScimGroupStore,
  lowerRole,
  roleFromGroups,
  type StoredScimGroup,
} from "./scim-groups";
import { SCIM_SCHEMA_GROUP, type SCIMGroup } from "@/lib/scim";

function group(orgId: string, id: string, displayName: string, members: string[] = []) {
  return {
    schemas: [SCIM_SCHEMA_GROUP],
    id,
    displayName,
    members: members.map((value) => ({ value })),
    _orgId: orgId,
  } as StoredScimGroup;
}

describe("FileScimGroupStore — persistent, per firm", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "scim-groups-"));
    file = path.join(dir, "scim-groups.json");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("groups survive a restart (a new store instance reads them back)", async () => {
    await new FileScimGroupStore(file).put(group("org-1", "g1", "Anwälte", ["u1"]));
    const reloaded = new FileScimGroupStore(file);
    expect(await reloaded.get("org-1", "g1")).toMatchObject({
      displayName: "Anwälte",
      members: [{ value: "u1" }],
    });
  });

  test("the same group id in two firms never collides", async () => {
    const store = new FileScimGroupStore(file);
    await store.put(group("org-1", "same", "A"));
    await store.put(group("org-2", "same", "B"));
    expect((await store.get("org-1", "same"))?.displayName).toBe("A");
    expect((await store.get("org-2", "same"))?.displayName).toBe("B");
    expect(await store.list("org-1")).toHaveLength(1);
    expect(await store.get("org-3", "same")).toBeNull();
  });

  test("update is scoped to the firm and returns before/after", async () => {
    const store = new FileScimGroupStore(file);
    await store.put(group("org-1", "g1", "Sekretariat", ["u1", "u2"]));
    expect(await store.update("org-2", "g1", (g) => g)).toBeNull();
    const res = await store.update("org-1", "g1", (g) => {
      applyGroupPatch(g, { op: "remove", path: "members", value: [{ value: "u1" }] });
      return g;
    });
    expect(res?.before.members?.map((m) => m.value)).toEqual(["u1", "u2"]);
    expect(res?.after.members?.map((m) => m.value)).toEqual(["u2"]);
    expect((await new FileScimGroupStore(file).get("org-1", "g1"))?.members).toEqual([
      { value: "u2" },
    ]);
  });

  test("concurrent updates do not lose members", async () => {
    const store = new FileScimGroupStore(file);
    await store.put(group("org-1", "g1", "Team"));
    await Promise.all(
      ["a", "b", "c", "d"].map((u) =>
        store.update("org-1", "g1", (g) => {
          applyGroupPatch(g, { op: "add", path: "members", value: [{ value: u }] });
          return g;
        })
      )
    );
    expect((await store.get("org-1", "g1"))?.members?.map((m) => m.value).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  test("delete removes only that firm's group", async () => {
    const store = new FileScimGroupStore(file);
    await store.put(group("org-1", "g1", "A"));
    await store.put(group("org-2", "g1", "B"));
    expect(await store.delete("org-1", "g1")).toMatchObject({ displayName: "A" });
    expect(await store.get("org-1", "g1")).toBeNull();
    expect(await store.get("org-2", "g1")).not.toBeNull();
  });
});

describe("group → role helpers", () => {
  const groups = [
    group("o", "g1", "Anwälte", ["u1"]),
    group("o", "g2", "Sekretariat", ["u1", "u2"]),
    group("o", "g3", "Unmapped", ["u3"]),
  ];
  const mapping = { anwälte: "lawyer", sekretariat: "assistant", unmapped: "admin" };

  test("highest mapped role wins; admin is never produced", () => {
    expect(roleFromGroups("u1", groups, mapping)).toBe("lawyer");
    expect(roleFromGroups("u2", groups, mapping)).toBe("assistant");
    expect(roleFromGroups("u3", groups, mapping)).toBeNull();
    expect(roleFromGroups("nobody", groups, mapping)).toBeNull();
  });

  test("lowerRole never goes up", () => {
    expect(lowerRole("lawyer", "assistant")).toBe("assistant");
    expect(lowerRole("client_viewer", "assistant")).toBe("client_viewer");
  });

  test("changedMembers lists added and removed people", () => {
    expect(
      changedMembers(group("o", "g", "x", ["a", "b"]), group("o", "g", "x", ["b", "c"])).sort()
    ).toEqual(["a", "c"]);
  });
});

describe("applyGroupPatch — removing members", () => {
  const base = (): SCIMGroup => ({
    schemas: [SCIM_SCHEMA_GROUP],
    id: "g1",
    displayName: "Sekretariat",
    members: [{ value: "u1" }, { value: "u2" }, { value: "u3" }],
  });

  test("a value list removes only the named members", () => {
    const g = base();
    applyGroupPatch(g, { op: "remove", path: "members", value: [{ value: "u1" }] });
    expect(g.members?.map((m) => m.value)).toEqual(["u2", "u3"]);
  });

  test("a members[value eq] filter removes only that member", () => {
    const g = base();
    applyGroupPatch(g, { op: "remove", path: 'members[value eq "u2"]' });
    expect(g.members?.map((m) => m.value)).toEqual(["u1", "u3"]);
  });

  test("a bare remove clears the list", () => {
    const g = base();
    applyGroupPatch(g, { op: "remove", path: "members" });
    expect(g.members).toEqual([]);
  });

  test("a path-less replace applies each attribute", () => {
    const g = base();
    applyGroupPatch(g, { op: "replace", value: { displayName: "Assistenz" } });
    expect(g.displayName).toBe("Assistenz");
  });
});
