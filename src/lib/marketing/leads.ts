import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sendMail } from "@/lib/mail";
import { getSharedPgPool } from "@/lib/auth/store";

export type LeadScore = "low" | "medium" | "high" | "enterprise";

export interface MarketingLeadInput {
  email: string;
  lang: "en" | "de";
  path: string;
  industry: string | null;
  product: string;
  plan: string;
  leadScore: LeadScore;
  fields: Record<string, string>;
  transcript: { role: "user" | "assistant"; content: string }[];
  summary: string;
  consent: true;
}

export interface MarketingLead extends MarketingLeadInput {
  id: string;
  createdAt: string;
  notified: {
    email: boolean;
    slack: boolean;
  };
}

const DATA_DIR = process.env.SIGMABRAIN_DATA_DIR || path.join(process.cwd(), ".data");
const LEADS_FILE = path.join(DATA_DIR, "marketing-leads.json");

let cache: MarketingLead[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let pgSchemaReady: Promise<void> | null = null;

async function pgReady() {
  const pool = getSharedPgPool();
  if (!pool) return null;
  if (!pgSchemaReady) {
    pgSchemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sigmabrain_marketing_leads (
          id text PRIMARY KEY,
          email text NOT NULL,
          lead_score text NOT NULL,
          product text NOT NULL,
          plan text NOT NULL,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await pool.query("CREATE INDEX IF NOT EXISTS sigmabrain_marketing_leads_created_idx ON sigmabrain_marketing_leads (created_at DESC)");
      await pool.query("CREATE INDEX IF NOT EXISTS sigmabrain_marketing_leads_email_idx ON sigmabrain_marketing_leads (email)");
      await pool.query("CREATE INDEX IF NOT EXISTS sigmabrain_marketing_leads_score_idx ON sigmabrain_marketing_leads (lead_score)");
    })();
  }
  await pgSchemaReady;
  return pool;
}

function rowToLead(row: { data: MarketingLead | string }): MarketingLead {
  return typeof row.data === "string" ? JSON.parse(row.data) as MarketingLead : row.data;
}

async function load(): Promise<MarketingLead[]> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(LEADS_FILE, "utf8")) as MarketingLead[];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(): Promise<void> {
  const leads = cache ?? [];
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${LEADS_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(leads, null, 2), "utf8");
    await fs.rename(tmp, LEADS_FILE);
  });
  return writeQueue;
}

export async function listMarketingLeads(): Promise<MarketingLead[]> {
  const pool = await pgReady();
  if (pool) {
    const { rows } = await pool.query<{ data: MarketingLead }>(
      "SELECT data FROM sigmabrain_marketing_leads ORDER BY created_at DESC LIMIT 500",
    );
    return rows.map(rowToLead);
  }
  return [...(await load())].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createMarketingLead(input: MarketingLeadInput): Promise<MarketingLead> {
  const lead: MarketingLead = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    notified: { email: false, slack: false },
  };
  const notified = await notifyMarketingLead(lead);
  lead.notified = notified;

  const pool = await pgReady();
  if (pool) {
    await pool.query(
      `INSERT INTO sigmabrain_marketing_leads (id, email, lead_score, product, plan, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [lead.id, lead.email, lead.leadScore, lead.product, lead.plan, JSON.stringify(lead), lead.createdAt],
    );
  } else {
    const leads = await load();
    leads.unshift(lead);
    await persist();
  }
  return lead;
}

export function summarizeLead(input: Omit<MarketingLeadInput, "summary" | "consent">): string {
  const fields = Object.entries(input.fields)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  const lastUser = [...input.transcript].reverse().find((m) => m.role === "user")?.content ?? "";
  return [
    `${input.product} · ${input.plan} · ${input.leadScore}`,
    fields ? `Qualification: ${fields}` : "Qualification: not complete",
    lastUser ? `Latest ask: ${lastUser.slice(0, 240)}` : "",
  ].filter(Boolean).join("\n");
}

async function notifyMarketingLead(lead: MarketingLead): Promise<MarketingLead["notified"]> {
  const text = [
    `New Sigmabrain marketing lead`,
    ``,
    `Email: ${lead.email}`,
    `Product: ${lead.product}`,
    `Plan: ${lead.plan}`,
    `Lead score: ${lead.leadScore}`,
    `Path: ${lead.path}`,
    `Industry: ${lead.industry ?? "unknown"}`,
    ``,
    lead.summary,
    ``,
    `Fields: ${JSON.stringify(lead.fields, null, 2)}`,
  ].join("\n");

  const to = process.env.SALES_NOTIFY_EMAIL || process.env.MAIL_FROM?.match(/<([^>]+)>/)?.[1] || "hello@sigmabrain.com";
  const mail = await sendMail({ to, subject: `New ${lead.leadScore} lead: ${lead.product}`, text });

  let slack = false;
  if (process.env.SALES_SLACK_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.SALES_SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New ${lead.leadScore} Sigmabrain lead: ${lead.product} / ${lead.plan}\n${lead.email}\n${lead.summary}`,
        }),
      });
      slack = res.ok;
    } catch {
      slack = false;
    }
  }

  return { email: mail.sent, slack };
}
