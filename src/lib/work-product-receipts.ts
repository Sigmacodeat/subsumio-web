/**
 * Verification receipts live in the engine (server/src/core/legal) because the
 * engine builds them too and its Docker image contains only server/. The web
 * app keeps importing from here.
 */
export * from "../../server/src/core/legal/work-product-receipts";
