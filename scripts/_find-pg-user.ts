import { getStore } from "@/lib/auth/store";
const s = getStore();
const anyS = s as unknown as { getByEmail?: (e: string) => Promise<unknown> };
const u = anyS.getByEmail ? await anyS.getByEmail("msc@subsum.io") : null;
console.log(JSON.stringify(u));
process.exit(0);
