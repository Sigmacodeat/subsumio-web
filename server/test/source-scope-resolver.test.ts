/**
 * Source-isolation trust+grant resolver (#1924, #1371, #1393).
 *
 * The cross-source leak class: a remote OAuth client scoped to one source could
 * pass `source_id: "__all__"` (or an explicit out-of-grant source_id) to read
 * sources it was never granted. Every source-scoped read op now routes through
 * ONE resolver. These tests pin the trust+grant matrix at the unit level so a
 * future per-handler "optimization" that re-inlines the `__all__` branch fails
 * loudly here.
 */
import { describe, test, expect } from "bun:test";
import {
  resolveRequestedScope,
  resolveCodeIntelScope,
  OperationError,
  type OperationContext,
} from "../src/core/operations.ts";

function ctxOf(overrides: Partial<OperationContext> = {}): OperationContext {
  return {
    engine: {} as any,
    config: {} as any,
    logger: console as any,
    dryRun: false,
    remote: true,
    sourceId: "default",
    ...overrides,
  };
}

describe("resolveRequestedScope — __all__ / all_sources", () => {
  test("trusted local + __all__ spans every source (empty scope)", () => {
    const scope = resolveRequestedScope(ctxOf({ remote: false, sourceId: "a" }), "__all__");
    expect(scope).toEqual({});
  });

  test("remote + __all__ collapses to the caller grant, NOT the whole brain", () => {
    const ctx = ctxOf({
      remote: true,
      sourceId: "a",
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["a", "b"] } as any,
    });
    const scope = resolveRequestedScope(ctx, "__all__");
    expect(scope).toEqual({ sourceIds: ["a", "b"] });
  });

  test("remote + __all__ with single-source grant scopes to that one source", () => {
    const ctx = ctxOf({
      remote: true,
      sourceId: "a",
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["a"] } as any,
    });
    expect(resolveRequestedScope(ctx, "__all__")).toEqual({ sourceIds: ["a"] });
  });

  test("remote + __all__ with no federated grant falls back to scalar sourceId (never empty)", () => {
    const ctx = ctxOf({ remote: true, sourceId: "a" });
    expect(resolveRequestedScope(ctx, "__all__")).toEqual({ sourceId: "a" });
  });

  test("all_sources=true is treated identically to __all__", () => {
    const ctx = ctxOf({
      remote: true,
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["x"] } as any,
    });
    expect(resolveRequestedScope(ctx, undefined, true)).toEqual({ sourceIds: ["x"] });
  });
});

describe("resolveRequestedScope — explicit source_id", () => {
  test("remote + explicit source_id OUTSIDE the grant is rejected", () => {
    const ctx = ctxOf({
      remote: true,
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["a"] } as any,
    });
    expect(() => resolveRequestedScope(ctx, "b")).toThrow(OperationError);
    try {
      resolveRequestedScope(ctx, "b");
    } catch (e) {
      expect((e as OperationError).code).toBe("permission_denied");
    }
  });

  test("remote + explicit source_id INSIDE the grant is allowed", () => {
    const ctx = ctxOf({
      remote: true,
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["a", "b"] } as any,
    });
    expect(resolveRequestedScope(ctx, "b")).toEqual({ sourceId: "b" });
  });

  test("trusted local + explicit source_id is allowed even with no grant", () => {
    expect(resolveRequestedScope(ctxOf({ remote: false }), "anything")).toEqual({
      sourceId: "anything",
    });
  });

  test("remote with no federated grant is bound to its own source (multi-firm database)", () => {
    // allowedSources undefined or [] → the scalar sourceId is the whole grant.
    // Several firms share one database: naming another firm's source must fail.
    const expectDenied = (ctx: OperationContext, sid: string) => {
      try {
        resolveRequestedScope(ctx, sid);
        throw new Error("expected permission_denied");
      } catch (e) {
        expect(e).toBeInstanceOf(OperationError);
        expect((e as OperationError).code).toBe("permission_denied");
      }
    };
    expectDenied(ctxOf({ remote: true, sourceId: "brain_a" }), "brain_b");
    expect(resolveRequestedScope(ctxOf({ remote: true, sourceId: "brain_a" }), "brain_a")).toEqual({
      sourceId: "brain_a",
    });
    const emptyGrant = ctxOf({
      remote: true,
      sourceId: "brain_a",
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: [] } as any,
    });
    expectDenied(emptyGrant, "brain_b");
    expect(resolveRequestedScope(emptyGrant, "brain_a")).toEqual({ sourceId: "brain_a" });
  });

  test("remote with no source at all cannot name any source (fail-closed)", () => {
    expect(() => resolveRequestedScope(ctxOf({ remote: true, sourceId: "" }), "z")).toThrow(
      OperationError
    );
    expect(() =>
      resolveRequestedScope(ctxOf({ remote: undefined as unknown as boolean, sourceId: "" }), "z")
    ).toThrow(OperationError);
  });

  test("explicitly shared read sources (law corpus) may be named, nothing else", () => {
    const ctx = ctxOf({
      remote: true,
      sourceId: "brain_a",
      auth: {
        token: "t",
        clientId: "c",
        scopes: [],
        allowedSources: ["brain_a"],
        sharedReadSources: ["law-at-normen", "law-eu"],
      } as any,
    });
    expect(resolveRequestedScope(ctx, "law-at-normen")).toEqual({ sourceId: "law-at-normen" });
    expect(resolveRequestedScope(ctx, "brain_a")).toEqual({ sourceId: "brain_a" });
    expect(() => resolveRequestedScope(ctx, "brain_b")).toThrow(OperationError);
    expect(() => resolveRequestedScope(ctx, "law-de")).toThrow(OperationError);
    // Shared sources never widen the default scope.
    expect(resolveRequestedScope(ctx, undefined)).toEqual({ sourceIds: ["brain_a"] });
    expect(resolveRequestedScope(ctx, "__all__")).toEqual({ sourceIds: ["brain_a"] });
  });
});

describe("resolveRequestedScope — default (no param)", () => {
  test("falls back to the canonical sourceScopeOpts ladder (federated array wins)", () => {
    const ctx = ctxOf({
      remote: true,
      sourceId: "a",
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["a", "b"] } as any,
    });
    expect(resolveRequestedScope(ctx, undefined)).toEqual({ sourceIds: ["a", "b"] });
  });

  test("falls back to scalar sourceId when no federated grant", () => {
    expect(resolveRequestedScope(ctxOf({ remote: true, sourceId: "a" }), undefined)).toEqual({
      sourceId: "a",
    });
  });
});

describe("resolveCodeIntelScope — single-source code traversal", () => {
  test("scalar sourceId → that source, allSources false", () => {
    expect(resolveCodeIntelScope(ctxOf({ remote: true, sourceId: "a" }), undefined)).toEqual({
      allSources: false,
      sourceId: "a",
    });
  });

  test("single-element federated grant → that one source", () => {
    const ctx = ctxOf({
      remote: true,
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["only"] } as any,
    });
    expect(resolveCodeIntelScope(ctx, "__all__")).toEqual({ allSources: false, sourceId: "only" });
  });

  test("multi-source federated grant → rejected (must specify one)", () => {
    const ctx = ctxOf({
      remote: true,
      sourceId: "a",
      auth: { token: "t", clientId: "c", scopes: [], allowedSources: ["a", "b"] } as any,
    });
    expect(() => resolveCodeIntelScope(ctx, "__all__")).toThrow(OperationError);
  });

  test("trusted local + all → allSources true (spans the brain)", () => {
    // ctx.sourceId is empty so the resolver yields {} → trusted-local allSources.
    expect(resolveCodeIntelScope(ctxOf({ remote: false, sourceId: "" }), "__all__")).toEqual({
      allSources: true,
      sourceId: undefined,
    });
  });

  test("remote with no source in scope is denied, never widened to all", () => {
    const ctx = ctxOf({ remote: true, sourceId: "" });
    expect(() => resolveCodeIntelScope(ctx, "__all__")).toThrow(OperationError);
  });
});
