#!/usr/bin/env bun
/**
 * Local SMTP email catcher for dev — captures all incoming emails
 * and stores them in .data/mailbox.json (no external provider needed).
 *
 * Usage:
 *   bun tools/email-catcher.ts          # SMTP on 1025, HTTP viewer on 8025
 *   bun tools/email-catcher.ts --smtp-port 2525 --http-port 8080
 *
 * Then point Supabase or any mailer to localhost:1025.
 * View caught emails at http://localhost:8025 or /admin/mailbox in the app.
 */

import { createServer, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createServer as createHttpServer } from "node:http";

const DATA_DIR = path.join(process.cwd(), ".data");
const MAILBOX_FILE = path.join(DATA_DIR, "mailbox.json");

interface CaughtEmail {
  id: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  text: string | null;
  html: string | null;
  rawSmtp: string;
  createdAt: string;
}

async function persist(email: Record<string, unknown>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let messages: Record<string, unknown>[] = [];
  try {
    const raw = await fs.readFile(MAILBOX_FILE, "utf8");
    messages = JSON.parse(raw);
  } catch {
    // fresh start
  }
  if (!Array.isArray(messages)) messages = [];
  messages.unshift(email);
  const tmp = `${MAILBOX_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(messages, null, 2), "utf8");
  await fs.rename(tmp, MAILBOX_FILE);
}

function parseAddress(line: string): { email: string; name: string | null } {
  const raw = line.trim();
  const angle = raw.match(/^(.*?)<([^>]+)>$/);
  if (angle)
    return {
      name: angle[1].trim().replace(/^"|"$/g, "") || null,
      email: angle[2].trim().toLowerCase(),
    };
  return { email: raw.toLowerCase(), name: null };
}

function parseSmtpData(data: string): Omit<CaughtEmail, "id" | "createdAt"> {
  const lines = data.split(/\r?\n/);
  let fromEmail = "unknown";
  let fromName: string | null = null;
  const toEmails: string[] = [];
  let subject = "";
  let inBody = false;
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (!inBody) {
      if (line === "") {
        inBody = true;
        continue;
      }
      const lower = line.toLowerCase();
      if (lower.startsWith("from:")) {
        const parsed = parseAddress(line.slice(5));
        fromEmail = parsed.email;
        fromName = parsed.name;
      } else if (lower.startsWith("to:")) {
        const addrs = line
          .slice(3)
          .split(",")
          .map((s) => parseAddress(s).email)
          .filter(Boolean);
        toEmails.push(...addrs);
      } else if (lower.startsWith("subject:")) {
        subject = line.slice(8).trim();
      }
    } else {
      bodyLines.push(line);
    }
  }

  const body = bodyLines.join("\n").trim();
  const isHtml =
    body.toLowerCase().includes("<html") || body.toLowerCase().includes("<!doctype html");

  return {
    fromEmail,
    fromName,
    toEmails,
    subject,
    text: isHtml ? null : body,
    html: isHtml ? body : null,
    rawSmtp: data,
  };
}

function startSmtp(port: number) {
  const server = createServer((socket: Socket) => {
    let buffer = "";
    let state: "greet" | "mail" | "rcpt" | "data" | "done" = "greet";
    let mailData = "";

    socket.write("220 localhost ESMTP dev-catcher\r\n");

    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      buffer += text;

      // Simple line-by-line parser
      while (buffer.includes("\n")) {
        const idx = buffer.indexOf("\n");
        const line = buffer.slice(0, idx + 1).trimEnd();
        buffer = buffer.slice(idx + 1);

        if (state === "data") {
          mailData += line + "\n";
          if (line === ".") {
            state = "done";
            const parsed = parseSmtpData(mailData);
            const now = new Date().toISOString();
            // Full MailMessage shape (matches src/lib/email/mailbox.ts) so the
            // /admin/mailbox UI + API render caught dev emails correctly.
            const email = {
              id: randomUUID(),
              providerId: null,
              direction: "inbound" as const,
              status: "received" as const,
              fromEmail: parsed.fromEmail,
              fromName: parsed.fromName,
              toEmails: parsed.toEmails,
              ccEmails: [] as string[],
              bccEmails: [] as string[],
              subject: parsed.subject,
              text: parsed.text,
              html: parsed.html,
              messageId: null,
              inReplyTo: null,
              userId: null,
              brainId: null,
              raw: { source: "smtp-catcher", rawSmtp: parsed.rawSmtp },
              createdAt: now,
              updatedAt: now,
            };
            persist(email).then(() => {
              console.log(
                `[smtp] caught: ${email.subject} from ${email.fromEmail} to ${email.toEmails.join(", ")}`
              );
            });
            socket.write("250 OK\r\n");
            mailData = "";
            state = "greet";
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO ") || upper.startsWith("HELO ")) {
          socket.write("250-localhost\r\n250-SIZE 10485760\r\n250 OK\r\n");
        } else if (upper.startsWith("MAIL FROM:")) {
          state = "mail";
          socket.write("250 OK\r\n");
        } else if (upper.startsWith("RCPT TO:")) {
          state = "rcpt";
          socket.write("250 OK\r\n");
        } else if (upper.startsWith("DATA")) {
          state = "data";
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (upper.startsWith("QUIT")) {
          socket.write("221 Bye\r\n");
          socket.end();
        } else if (upper.startsWith("RSET")) {
          state = "greet";
          mailData = "";
          socket.write("250 OK\r\n");
        } else if (upper.startsWith("NOOP")) {
          socket.write("250 OK\r\n");
        } else {
          socket.write("500 Command not recognized\r\n");
        }
      }
    });

    socket.on("error", () => {
      // ignore client disconnects
    });
  });

  server.listen(port, () => {
    console.log(`[smtp] catcher listening on port ${port}`);
  });

  return server;
}

function startViewer(port: number) {
  const server = createHttpServer(async (req, res) => {
    if (req.url === "/" || req.url === "/emails") {
      let emails: CaughtEmail[] = [];
      try {
        const raw = await fs.readFile(MAILBOX_FILE, "utf8");
        emails = JSON.parse(raw);
      } catch {
        // fresh
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(emails, null, 2));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(`[http] viewer at http://localhost:${port}/emails`);
  });

  return server;
}

// Parse args
const args = process.argv.slice(2);
let smtpPort = 1025;
let httpPort = 8025;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--smtp-port" && args[i + 1]) smtpPort = parseInt(args[i + 1], 10);
  if (args[i] === "--http-port" && args[i + 1]) httpPort = parseInt(args[i + 1], 10);
}

console.log("═══════════════════════════════════════════");
console.log("  Local Email Catcher (Dev Mode)");
console.log("═══════════════════════════════════════════");
startSmtp(smtpPort);
startViewer(httpPort);
console.log("");
console.log(`To test: telnet localhost ${smtpPort}`);
console.log(`Or configure Supabase SMTP to localhost:${smtpPort}`);
