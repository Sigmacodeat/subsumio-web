import { createSession } from "@/lib/auth/session";
const res = await createSession("35232772-39d7-4fcc-ad9a-f72a59a34fe3", "msc@subsum.io", "admin");
console.log(res.token);
