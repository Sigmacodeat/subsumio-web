// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  WIDGET_REGISTRY,
  DEFAULT_WIDGET_PREFS,
  getWidgetMeta,
  mergeWithDefaults,
  type WidgetId,
  type WidgetPref,
} from "./widget-registry";

describe("WIDGET_REGISTRY", () => {
  test("contains all expected widgets", () => {
    expect(WIDGET_REGISTRY.length).toBeGreaterThan(10);
    const ids = WIDGET_REGISTRY.map((w) => w.id);
    expect(ids).toContain("rundown");
    expect(ids).toContain("heute-panel");
    expect(ids).toContain("recent-queries");
  });

  test("every widget has required metadata", () => {
    for (const w of WIDGET_REGISTRY) {
      expect(w.id).toBeTruthy();
      expect(w.type).toBeTruthy();
      expect(w.icon).toBeDefined();
      expect(w.labelKey).toMatch(/^widget\./);
      expect(w.descKey).toMatch(/^widget\..*_desc$/);
      expect(typeof w.defaultVisible).toBe("boolean");
      expect(typeof w.defaultOrder).toBe("number");
      expect(typeof w.fullWidth).toBe("boolean");
    }
  });

  test("default orders are unique", () => {
    const orders = WIDGET_REGISTRY.map((w) => w.defaultOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe("DEFAULT_WIDGET_PREFS", () => {
  test("matches registry defaults", () => {
    expect(DEFAULT_WIDGET_PREFS).toHaveLength(WIDGET_REGISTRY.length);
    for (const pref of DEFAULT_WIDGET_PREFS) {
      const meta = getWidgetMeta(pref.id);
      expect(meta).toBeDefined();
      expect(pref.visible).toBe(meta!.defaultVisible);
      expect(pref.order).toBe(meta!.defaultOrder);
    }
  });
});

describe("getWidgetMeta", () => {
  test("returns meta for known widgets", () => {
    expect(getWidgetMeta("rundown")?.id).toBe("rundown");
    expect(getWidgetMeta("deadlines")?.type).toBe("deadlines");
  });

  test("returns undefined for unknown widget", () => {
    expect(getWidgetMeta("unknown" as WidgetId)).toBeUndefined();
  });
});

describe("mergeWithDefaults", () => {
  test("returns defaults when saved is empty", () => {
    const merged = mergeWithDefaults([]);
    expect(merged).toHaveLength(WIDGET_REGISTRY.length);
    expect(merged[0].id).toBe("rundown");
  });

  test("overrides saved preferences", () => {
    const saved: Partial<WidgetPref>[] = [{ id: "deadlines", visible: false, order: 99 }];
    const merged = mergeWithDefaults(saved);
    const deadlines = merged.find((w) => w.id === "deadlines");
    expect(deadlines).toEqual({ id: "deadlines", visible: false, order: 99 });
  });

  test("ignores unknown widgets and duplicates", () => {
    const saved: Partial<WidgetPref>[] = [
      { id: "deadlines", visible: false },
      { id: "deadlines", visible: true },
      { id: "unknown" as WidgetId, visible: true },
    ];
    const merged = mergeWithDefaults(saved);
    const deadlines = merged.find((w) => w.id === "deadlines");
    expect(deadlines?.visible).toBe(false);
  });

  test("result is sorted by order", () => {
    const saved: Partial<WidgetPref>[] = [{ id: "deadlines", order: 1 }];
    const merged = mergeWithDefaults(saved);
    const orders = merged.map((w) => w.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
