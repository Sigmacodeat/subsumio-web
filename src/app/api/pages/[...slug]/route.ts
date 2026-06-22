import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiNotFound } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";

function buildPath(slug: string[]): string | null {
  if (slug.some((s) => s.includes(".."))) return null;
  return slug.map(encodeURIComponent).join("/");
}

const patchSchema = z
  .object({})
  .passthrough()
  .refine((data) => Object.keys(data).length > 0, { message: "nothing_to_update" });

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, req) => {
    const path = buildPath(
      (await (req as unknown as { params: Promise<{ slug: string[] }> }).params).slug
    );
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: ctx.headers,
      });
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      console.error(
        "[pages/...slug] get failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiNotFound("not_found");
    }
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (ctx, body) => {
      const slug = (ctx as unknown as { __slug?: string }).__slug;
      return {
        action: "case.update" as const,
        entityType: "page",
        entityId: slug,
        details: { fields: Object.keys(body) },
      };
    },
  },
  async (ctx, body, _query, req) => {
    const path = buildPath(
      (await (req as unknown as { params: Promise<{ slug: string[] }> }).params).slug
    );
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);

    // Optimistic locking: if client sends If-Match header, verify version
    const ifMatch = req.headers.get("if-match");
    if (ifMatch) {
      try {
        const getRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
          headers: ctx.headers,
        });
        if (getRes.ok) {
          const currentPage = (await getRes.json()) as { frontmatter?: { version?: number } };
          const currentVersion = currentPage.frontmatter?.version ?? 0;
          const expectedVersion = parseInt(ifMatch, 10);
          if (currentVersion !== expectedVersion) {
            return Response.json(
              {
                error: "version_conflict",
                message: "Die Seite wurde zwischenzeitlich von einem anderen Nutzer bearbeitet.",
                currentVersion,
                expectedVersion,
              },
              { status: 409 }
            );
          }
        }
      } catch {
        // If we can't check the version, proceed without locking (fail-open)
      }
    }

    // Increment version on update
    const patchBody: Record<string, unknown> = { ...body, slug: path };

    // Server-side guard: block modifications to archived cases unless it's a restore
    if (patchBody.frontmatter) {
      const fm = patchBody.frontmatter as Record<string, unknown>;
      const isRestore = !!fm.restored_at && fm.status !== "archived";
      if (!isRestore) {
        try {
          const checkRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
            headers: ctx.headers,
          });
          if (checkRes.ok) {
            const currentPage = (await checkRes.json()) as { frontmatter?: { status?: string } };
            if (currentPage.frontmatter?.status === "archived") {
              return Response.json(
                {
                  error: "case_archived",
                  message:
                    "Akte ist archiviert — zuerst wiederherstellen, um Änderungen zu speichern.",
                },
                { status: 403 }
              );
            }
          }
        } catch {
          // If we can't check, proceed (fail-open)
        }
      }
    }

    if (patchBody.frontmatter) {
      const fm = patchBody.frontmatter as Record<string, unknown>;
      const currentVersion = ifMatch ? parseInt(ifMatch, 10) : (fm.version as number | undefined);
      fm.version = (typeof currentVersion === "number" ? currentVersion : 0) + 1;

      // Restore: append timeline event
      if (fm.restored_at && fm.status && fm.status !== "archived") {
        const existingTimeline = (fm.timeline_events as Array<Record<string, unknown>>) || [];
        fm.timeline_events = [
          ...existingTimeline,
          {
            id: `tl-restore-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "status_change",
            title: "Akte wiederhergestellt",
            description: `Wiederhergestellt von ${ctx.user.email}`,
            actor: ctx.user.email,
          },
        ];
      }
    } else if (ifMatch) {
      patchBody.frontmatter = { version: parseInt(ifMatch, 10) + 1 };
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(patchBody),
      });
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: `Engine returned ${res.status}` }, {
          status: res.status,
        });
      }
      const result = await res.json();

      // Restore cascade: if the PATCH sets status to a non-archived value
      // and includes restored_at, un-tombstone all linked documents.
      const patchedFm = (patchBody.frontmatter ?? {}) as Record<string, unknown>;
      if (patchedFm.restored_at && patchedFm.status && patchedFm.status !== "archived") {
        try {
          const docsRes = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=1000`, {
            headers: ctx.headers,
          });
          if (docsRes.ok) {
            const raw = await docsRes.json();
            const allDocs: Array<{ slug: string; frontmatter?: Record<string, unknown> }> =
              Array.isArray(raw)
                ? raw
                : Array.isArray(raw?.pages)
                  ? raw.pages
                  : Array.isArray(raw?.items)
                    ? raw.items
                    : [];
            const caseSlugForms = new Set([path, decodeURIComponent(path)]);
            const tombstoned = allDocs.filter(
              (d) =>
                caseSlugForms.has((d.frontmatter ?? {}).case_slug as string) &&
                (d.frontmatter ?? {}).status === "tombstoned"
            );
            await Promise.all(
              tombstoned.map((doc) =>
                fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(doc.slug)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", ...ctx.headers },
                  body: JSON.stringify({
                    frontmatter: {
                      status: "active",
                      tombstoned_at: null,
                      tombstone_reason: null,
                    },
                    merge: true,
                  }),
                }).catch((err) => {
                  console.error(
                    `[pages/...slug] untombstone failed for ${doc.slug}:`,
                    err instanceof Error ? err.message : String(err)
                  );
                })
              )
            );
          }
        } catch (err) {
          console.error(
            "[pages/...slug] restore cascade failed:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // B3: Server-side conflict check when client_name or opponent_name is
      // explicitly included in the PATCH body. Using body.frontmatter (not
      // patchBody.frontmatter) avoids running the check on every auto-save
      // that happens to include these fields in the merged frontmatter.
      let conflictWarning:
        | { checked: boolean; matches?: Array<{ name: string; slug: string; type: string }> }
        | undefined;
      const bodyFm = (body.frontmatter ?? {}) as Record<string, unknown>;
      const namesToCheck = [bodyFm.client_name, bodyFm.opponent_name].filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0
      );
      if (namesToCheck.length > 0) {
        try {
          const conflicts: Array<{ name: string; slug: string; type: string }> = [];
          const decodedPath = decodeURIComponent(path);
          for (const name of namesToCheck) {
            const checkRes = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...ctx.headers },
              body: JSON.stringify({ name }),
            });
            if (checkRes.ok) {
              const checkData = (await checkRes.json()) as {
                matches?: Array<{ name: string; slug: string; type: string }>;
              };
              if (checkData.matches?.length) {
                // B3 FIX: Exclude self-match — the case being patched
                // shouldn't trigger a conflict warning against itself.
                conflicts.push(
                  ...checkData.matches
                    .filter((m) => m.slug !== path && m.slug !== decodedPath)
                    .map((m) => ({ name: m.name, slug: m.slug, type: m.type }))
                );
              }
            }
          }
          conflictWarning = {
            checked: true,
            matches: conflicts.length > 0 ? conflicts : undefined,
          };
        } catch {
          conflictWarning = { checked: false };
        }
      }

      // Audit log + SSE for restore operations
      if (patchedFm.restored_at && patchedFm.status && patchedFm.status !== "archived") {
        void logAudit("case.restore", "page", {
          entityId: path,
          details: {
            userId: ctx.user.id,
            userEmail: ctx.user.email,
            restoredAt: patchedFm.restored_at,
          },
        });
        broadcastSseEvent(ctx.brainId, "case.restored", {
          slug: path,
          by: ctx.user.email,
          at: new Date().toISOString(),
        });
      } else {
        broadcastSseEvent(ctx.brainId, "case.updated", {
          slug: path,
          by: ctx.user.email,
          at: new Date().toISOString(),
        });
      }
      return Response.json({ ...result, conflictWarning });
    } catch (err) {
      console.error(
        "[pages/...slug] patch failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Seite nicht aktualisierbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
    audit: (ctx) => {
      const slug = (ctx as unknown as { __slug?: string }).__slug;
      return {
        action: "case.delete" as const,
        entityType: "page",
        entityId: slug,
        details: { method: "soft_delete" },
      };
    },
  },
  async (ctx, _body, _query, req) => {
    const slugArr = (await (req as unknown as { params: Promise<{ slug: string[] }> }).params).slug;
    const path = buildPath(slugArr);
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);
    // Engine stamps the raw (decoded) slug as case_slug on documents; path is URL-encoded.
    const decodedSlug = slugArr.join("/");

    try {
      // B1: Soft-delete (archive) instead of hard DELETE — GoBD compliance
      // 1. Fetch the case page to check if it's a legal_case
      const getRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: ctx.headers,
      });
      if (getRes.status === 404) return apiNotFound("not_found");
      if (!getRes.ok) throw new Error(`HTTP ${getRes.status}`);
      const casePage = (await getRes.json()) as {
        slug?: string;
        type?: string;
        frontmatter?: Record<string, unknown>;
      };
      const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
      // `type` is a top-level page field (set on POST), not frontmatter.
      // Fall back to fm.type for engine versions that mirror it into frontmatter.
      const pageType = casePage.type ?? (fm.type as string | undefined);
      const currentVersion = (fm.version as number) || 0;
      // Set of slug forms that documents may reference as their case_slug.
      const caseSlugForms = new Set(
        [casePage.slug, decodedSlug, path].filter((s): s is string => !!s)
      );

      if (pageType === "legal_case") {
        // Build timeline event for archive
        const existingTimeline = (fm.timeline_events as Array<Record<string, unknown>>) || [];
        const archiveTimeline = [
          ...existingTimeline,
          {
            id: `tl-archive-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "status_change",
            title: "Akte archiviert",
            description: `Archiviert von ${ctx.user.email}`,
            actor: ctx.user.email,
          },
        ];

        // 2. Archive the case (soft-delete)
        const archiveRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "If-Match": String(currentVersion),
            ...ctx.headers,
          },
          body: JSON.stringify({
            frontmatter: {
              status: "archived",
              archived_at: new Date().toISOString(),
              archived_by: ctx.user.email,
              portal_enabled: false,
              timeline_events: archiveTimeline,
            },
            merge: true,
          }),
        });
        if (!archiveRes.ok) throw new Error(`Archive PATCH failed: HTTP ${archiveRes.status}`);

        // 3. Tombstone all documents whose frontmatter case_slug matches this case.
        //    NOTE: the engine does NOT filter by case_slug query param — it returns
        //    all pages of the given type. We must filter client-side (same pattern
        //    as fetchCaseDocumentsBySlug in matter-context.ts). The response may be
        //    a bare array, { pages }, or { items } depending on engine version.
        try {
          const docsRes = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=1000`, {
            headers: ctx.headers,
          });
          if (docsRes.ok) {
            const raw = await docsRes.json();
            const allDocs: Array<{ slug: string; frontmatter?: Record<string, unknown> }> =
              Array.isArray(raw)
                ? raw
                : Array.isArray(raw?.pages)
                  ? raw.pages
                  : Array.isArray(raw?.items)
                    ? raw.items
                    : [];
            const matched = allDocs.filter((d) =>
              caseSlugForms.has((d.frontmatter ?? {}).case_slug as string)
            );
            await Promise.all(
              matched.map((doc) =>
                fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(doc.slug)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", ...ctx.headers },
                  body: JSON.stringify({
                    frontmatter: {
                      status: "tombstoned",
                      tombstoned_at: new Date().toISOString(),
                      tombstone_reason: "case_archived",
                    },
                    merge: true,
                  }),
                }).catch((err) => {
                  console.error(
                    `[pages/...slug] tombstone failed for ${doc.slug}:`,
                    err instanceof Error ? err.message : String(err)
                  );
                })
              )
            );
          }
        } catch (err) {
          console.error(
            "[pages/...slug] cascade tombstone failed:",
            err instanceof Error ? err.message : String(err)
          );
        }
      } else {
        // Non-case pages: hard delete as before
        const delRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
          method: "DELETE",
          headers: ctx.headers,
        });
        if (delRes.status === 404) return apiNotFound("not_found");
        if (!delRes.ok) throw new Error(`HTTP ${delRes.status}`);
      }

      void logAudit("document.delete", "page", {
        entityId: path,
        details: {
          userId: ctx.user.id,
          method: pageType === "legal_case" ? "soft_delete" : "hard_delete",
        },
      });
      broadcastSseEvent(ctx.brainId, "case.deleted", {
        slug: path,
        by: ctx.user.email,
        at: new Date().toISOString(),
        method: pageType === "legal_case" ? "archived" : "deleted",
      });
      return Response.json({
        ok: true,
        method: pageType === "legal_case" ? "archived" : "deleted",
      });
    } catch (e) {
      console.error("[pages/...slug] delete failed:", e instanceof Error ? e.message : String(e));
      return apiError("engine_unreachable", "Seite nicht löschbar", 503);
    }
  }
);
