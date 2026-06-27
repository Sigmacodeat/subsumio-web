#!/usr/bin/env bun
/**
 * Poll the temporary mail.tm inbox (creds in .data/tempmail.json) for incoming
 * mail — e.g. a Supabase signup confirmation. Prints senders/subjects and
 * extracts any confirmation/verification links from the newest message.
 *
 * Usage:
 *   bun tools/tempmail-poll.ts            # one-shot: list + show newest body/links
 *   bun tools/tempmail-poll.ts --watch    # poll every 5s until a new mail lands
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const CREDS = path.join(process.cwd(), ".data", "tempmail.json");
const API = "https://api.mail.tm";

interface Creds {
  address: string;
  password: string;
  token: string;
}

async function loadCreds(): Promise<Creds> {
  const raw = await fs.readFile(CREDS, "utf8");
  return JSON.parse(raw) as Creds;
}

async function reauth(c: Creds): Promise<string> {
  const res = await fetch(`${API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address: c.address, password: c.password }),
  });
  const j = (await res.json()) as { token?: string };
  if (!j.token) throw new Error("reauth_failed");
  await fs.writeFile(CREDS, JSON.stringify({ ...c, token: j.token }, null, 2));
  return j.token;
}

async function listMessages(token: string) {
  const res = await fetch(`${API}/messages`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401) return null; // token expired
  const j = (await res.json()) as {
    "hydra:member"?: Array<{
      id: string;
      from?: { address?: string };
      subject?: string;
      createdAt?: string;
    }>;
  };
  return j["hydra:member"] ?? [];
}

async function getMessage(token: string, id: string) {
  const res = await fetch(`${API}/messages/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return (await res.json()) as {
    subject?: string;
    from?: { address?: string };
    text?: string;
    html?: string[];
  };
}

function extractLinks(text: string): string[] {
  const urls = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) urls.add(m[0]);
  return [...urls];
}

async function main() {
  const watch = process.argv.includes("--watch");
  let creds = await loadCreds();
  console.log(`📬 Postfach: ${creds.address}\n`);

  let seen = 0;
  for (;;) {
    let msgs = await listMessages(creds.token);
    if (msgs === null) {
      creds = { ...creds, token: await reauth(creds) };
      msgs = (await listMessages(creds.token)) ?? [];
    }
    if (msgs.length > seen) {
      console.log(`\n── ${msgs.length} Nachricht(en) ──`);
      for (const m of msgs)
        console.log(`• ${m.from?.address ?? "?"} — ${m.subject ?? "(kein Betreff)"}`);
      const newest = msgs[0];
      const full = await getMessage(creds.token, newest.id);
      const body = full.text || (full.html ?? []).join("\n").replace(/<[^>]+>/g, " ");
      const links = extractLinks(body);
      console.log(`\n📨 Neueste: "${full.subject}" von ${full.from?.address}`);
      if (links.length) {
        console.log("\n🔗 Gefundene Links:");
        for (const l of links) console.log(`   ${l}`);
      } else {
        console.log("\n(keine Links gefunden — Body:)\n" + body.slice(0, 800));
      }
      seen = msgs.length;
      if (watch) break; // got something new while watching → stop
    }
    if (!watch) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((e) => {
  console.error("Fehler:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
