import { createSession } from "@/lib/auth/session";
const res = await createSession("1aa993f7-ec5f-4c20-9b35-33ff2f4ce712", "msc@subsum.io", "admin");
console.log(res.token);
