import { verifySession } from "@/lib/auth/session";
import { verifySessionCore } from "@/lib/auth/session-core";
const token = process.argv[2];
const core = await verifySessionCore(token);
console.log("core (no revocation):", JSON.stringify(core));
const full = await verifySession(token);
console.log("full (with revocation):", JSON.stringify(full));
