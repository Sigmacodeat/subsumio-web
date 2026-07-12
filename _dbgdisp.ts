import { PGLiteEngine } from "./server/src/core/pglite-engine.ts";
import { dispatchToolCall } from "./server/src/mcp/dispatch.ts";
import type { ChunkInput } from "./server/src/core/types.ts";
const eng=new PGLiteEngine(); await eng.connect({}); await eng.initSchema();
const db=(eng as any).db;
const dim=(await db.query(`SELECT atttypmod FROM pg_attribute WHERE attrelid='content_chunks'::regclass AND attname='embedding'`)).rows[0].atttypmod;
function be(slug:string){let h=0;for(let i=0;i<slug.length;i++)h=(h*31+slug.charCodeAt(i))>>>0;const e=new Float32Array(dim);e[h%dim]=1;return e;}
async function seed(slug:string,body:string){await eng.putPage(slug,{type:"law" as never,title:slug,compiled_truth:body,timeline:""});await eng.upsertChunks(slug,[{chunk_index:0,chunk_text:body,chunk_source:"compiled_truth",embedding:be(slug),token_count:10}] as ChunkInput[]);}
await seed("legal/statutes/at/abgb/p-1489","Verjährung. Der Anspruch verjährt in drei Jahren.");
await seed("legal/statutes/de/bgb/p-195","Verjährung. Der Anspruch verjährt in drei Jahren.");
await eng.setConfig("legal.jurisdiction","at");
console.log("config read:", await eng.getConfig("legal.jurisdiction"));
const res=await dispatchToolCall(eng,"query",{query:"Verjährung drei Jahren",limit:10},{remote:true});
console.log("isError:", res.isError);
console.log("raw text:", res.content[0].text.slice(0,600));
await eng.disconnect();
