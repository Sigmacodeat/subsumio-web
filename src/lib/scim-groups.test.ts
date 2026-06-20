import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { groups } from "./scim-groups";
import type { SCIMGroup } from "@/lib/scim";

describe("scim-groups", () => {
  beforeEach(() => {
    groups.clear();
  });

  afterEach(() => {
    groups.clear();
  });

  test("groups is a Map", () => {
    expect(groups).toBeInstanceOf(Map);
  });

  test("starts empty", () => {
    expect(groups.size).toBe(0);
  });

  test("can set and get a group", () => {
    const group: SCIMGroup = {
      id: "group-1",
      displayName: "Lawyers",
      members: [{ value: "user-1", display: "Max" }],
    };
    groups.set("group-1", group);
    expect(groups.get("group-1")).toEqual(group);
  });

  test("can delete a group", () => {
    groups.set("group-1", { id: "group-1", displayName: "Test", members: [] });
    groups.delete("group-1");
    expect(groups.has("group-1")).toBe(false);
  });

  test("can store multiple groups", () => {
    groups.set("g1", { id: "g1", displayName: "A", members: [] });
    groups.set("g2", { id: "g2", displayName: "B", members: [] });
    expect(groups.size).toBe(2);
  });

  test("overwrites group with same key", () => {
    groups.set("g1", { id: "g1", displayName: "Old", members: [] });
    groups.set("g1", { id: "g1", displayName: "New", members: [] });
    expect(groups.get("g1")?.displayName).toBe("New");
    expect(groups.size).toBe(1);
  });

  test("clears all groups", () => {
    groups.set("g1", { id: "g1", displayName: "A", members: [] });
    groups.set("g2", { id: "g2", displayName: "B", members: [] });
    groups.clear();
    expect(groups.size).toBe(0);
  });

  test("iterates with entries", () => {
    groups.set("g1", { id: "g1", displayName: "A", members: [] });
    groups.set("g2", { id: "g2", displayName: "B", members: [] });
    const entries = Array.from(groups.entries());
    expect(entries).toHaveLength(2);
  });
});
