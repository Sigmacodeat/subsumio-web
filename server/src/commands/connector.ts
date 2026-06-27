/**
 * connector — CLI command for managing external system connectors.
 *
 * Subcommands:
 *   list                Show all connectors and their status
 *   add <service>       Add a new connector (interactive or --flags)
 *   auth <service>      Authenticate via OAuth2 (Google Drive, Gmail)
 *   remove <service>    Remove a connector and delete its state
 *   sync <service>      Trigger one-shot sync for a connector
 *   status <service>    Show connector health
 *   enable <service>    Enable a disabled connector
 *   disable <service>   Disable a connector (keeps state)
 *
 * Usage:
 *   gbrain connector list
 *   gbrain connector add google-drive --client-id XXX --client-secret YYY
 *   gbrain connector add notion --api-key secret_XXX
 *   gbrain connector sync google-drive
 *   gbrain connector remove github
 */

import { ConnectorManager, SUPPORTED_CONNECTORS } from "../core/ingestion/connectors/index.ts";
import type { ConnectorConfig } from "../core/ingestion/connectors/base.ts";
import { generateAuthUrl, exchangeCode } from "../core/ingestion/connectors/google-oauth.ts";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function printUsage(): void {
  console.log(`
Usage: gbrain connector <subcommand> [args]

Subcommands:
  list                              Show all connectors
  add <service> [options]          Add a connector
  auth <service>                   OAuth2 web flow (Google Drive / Gmail)
  remove <service>                 Remove a connector
  sync <service> [options]         Trigger one-shot sync
  status [service]                 Show connector health
  enable <service>                 Enable a connector
  disable <service>                Disable a connector

Services: ${SUPPORTED_CONNECTORS.join(", ")}

Add options (per service):
  Google Drive / Gmail (OAuth2):
    --client-id <id>
    --client-secret <secret>
    --redirect-uri <uri>            (default: http://localhost:3000/oauth/callback)

  Notion / GitHub (API Key):
    --api-key <key>

  Universal filters:
    --filters <json>               e.g. '{"labels":["INBOX"]}'
    --poll-interval <ms>           Polling interval in ms (default: 300000)
    --mode <trickle|migration>     Sync mode (default: trickle)
`);
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2).replace(/-/g, "_");
      const value = args[i + 1] ?? "";
      if (!value.startsWith("--")) {
        flags[key] = value;
        i++;
      }
    }
  }
  return flags;
}

function flagsToConfig(flags: Record<string, string>): ConnectorConfig {
  const config: ConnectorConfig = {};
  if (flags.client_id) config.client_id = flags.client_id;
  if (flags.client_secret) config.client_secret = flags.client_secret;
  if (flags.api_key) config.api_key = flags.api_key;
  if (flags.redirect_uri) config.redirect_uri = flags.redirect_uri;
  if (flags.poll_interval) config.poll_interval_ms = parseInt(flags.poll_interval, 10);
  if (flags.mode) config.mode = flags.mode as "trickle" | "migration";
  if (flags.filters) {
    try {
      config.filters = JSON.parse(flags.filters);
    } catch {
      console.error("Invalid --filters JSON");
      process.exit(1);
    }
  }
  return config;
}

export async function runConnector(args: string[]): Promise<number> {
  const [sub, service, ...rest] = args;
  const flags = parseFlags(rest);
  const manager = new ConnectorManager();

  switch (sub) {
    case "list": {
      const list = await manager.list();
      if (list.length === 0) {
        console.log("No connectors configured.");
        console.log(
          `Run: gbrain connector add <service> (supported: ${SUPPORTED_CONNECTORS.join(", ")})`
        );
        return 0;
      }
      console.log("Connector          Enabled    Connected");
      console.log("─────────────────────────────────────────");
      for (const c of list) {
        const name = c.service.padEnd(18);
        const en = c.enabled ? "yes" : "no";
        const conn = c.connected ? "yes" : "no";
        console.log(`${name} ${en.padEnd(10)} ${conn}`);
      }
      return 0;
    }

    case "add": {
      if (!service) {
        console.error("Error: missing service. Usage: gbrain connector add <service>");
        return 1;
      }
      if (!SUPPORTED_CONNECTORS.includes(service)) {
        console.error(`Error: unsupported service "${service}".`);
        console.error(`Supported: ${SUPPORTED_CONNECTORS.join(", ")}`);
        return 1;
      }
      const config = flagsToConfig(flags);
      await manager.add(service, config);
      console.log(`Connector added: ${service}`);
      console.log(
        `Run "gbrain connector sync ${service}" to start syncing, or restart the daemon.`
      );
      return 0;
    }

    case "auth": {
      if (!service) {
        console.error("Error: missing service. Usage: gbrain connector auth <service>");
        return 1;
      }
      if (!["google-drive", "gmail"].includes(service)) {
        console.error(`Error: OAuth2 web flow is only supported for google-drive and gmail.`);
        console.error(`For Notion/GitHub, use: gbrain connector add ${service} --api-key KEY`);
        return 1;
      }

      // Load saved state (client_id, client_secret from prior `add`).
      const statePath = join(homedir(), ".gbrain", "connectors", `${service}.json`);
      let state: Record<string, unknown>;
      try {
        state = JSON.parse(readFileSync(statePath, "utf-8"));
      } catch {
        console.error(`Error: no saved config for ${service}. Run first:`);
        console.error(`  gbrain connector add ${service} --client-id XXX --client-secret YYY`);
        return 1;
      }

      const cfg = (state.config ?? {}) as Record<string, unknown>;
      const clientId = (state.client_id ?? cfg.client_id) as string | undefined;
      const clientSecret = (state.client_secret ?? cfg.client_secret) as string | undefined;
      const redirectUri = (cfg.redirect_uri as string) ?? "http://localhost:3000/oauth/callback";

      if (!clientId || !clientSecret) {
        console.error(`Error: client_id and client_secret required. Run:`);
        console.error(`  gbrain connector add ${service} --client-id XXX --client-secret YYY`);
        return 1;
      }

      const scopes =
        service === "gmail"
          ? "https://www.googleapis.com/auth/gmail.readonly"
          : "https://www.googleapis.com/auth/drive.readonly";

      const auth = generateAuthUrl(clientId, redirectUri, scopes);

      // Persist PKCE data for the callback server to pick up.
      const pkcePath = join(homedir(), ".gbrain", "connectors", `.${service}-pkce.tmp.json`);
      writeFileSync(
        pkcePath,
        JSON.stringify({
          verifier: auth.codeVerifier,
          state: auth.state,
          clientId,
          clientSecret,
          redirectUri,
        })
      );

      // Open browser (best-effort; fall back to printing URL).
      console.log(`\nOpening browser for ${service} authentication...`);
      console.log(`If the browser doesn't open, visit this URL:\n  ${auth.url}\n`);
      try {
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        const { execSync } = await import("node:child_process");
        execSync(`${openCmd} "${auth.url}"`, { stdio: "ignore" });
      } catch {
        /* ignore — URL already printed */
      }

      // Start a temporary callback server.
      const callbackUrl = new URL(redirectUri);
      const callbackPort = parseInt(callbackUrl.port || "80", 10);

      return new Promise<number>((resolve) => {
        const server = createServer((req, res) => {
          const url = new URL(req.url ?? "/", `http://localhost:${callbackPort}`);
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          const error = url.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h2>Authentication Failed</h2><p>${error}</p><p>You can close this tab.</p></body></html>`
            );
            server.close();
            console.error(`OAuth error: ${error}`);
            resolve(1);
            return;
          }

          if (!code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<html><body><h2>Waiting for authorization...</h2></body></html>");
            return;
          }

          // Read PKCE data back.
          let pkce: {
            verifier: string;
            state: string;
            clientId: string;
            clientSecret: string;
            redirectUri: string;
          };
          try {
            pkce = JSON.parse(readFileSync(pkcePath, "utf-8"));
          } catch {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end("<html><body><h2>Error</h2><p>PKCE data missing. Try again.</p></body></html>");
            server.close();
            resolve(1);
            return;
          }

          if (returnedState !== pkce.state) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<html><body><h2>Error</h2><p>State mismatch. Try again.</p></body></html>");
            server.close();
            console.error("OAuth error: state mismatch");
            resolve(1);
            return;
          }

          // Exchange code for tokens.
          exchangeCode(code, pkce.verifier, pkce.clientId, pkce.clientSecret, pkce.redirectUri)
            .then((tokens) => {
              // Save tokens to state file.
              const newState = { ...state, access_token: tokens.access_token };
              if (tokens.refresh_token) {
                (newState as Record<string, unknown>).refresh_token = tokens.refresh_token;
              }
              (newState as Record<string, unknown>).token_expires_at =
                Date.now() + tokens.expires_in * 1000;
              writeFileSync(statePath, JSON.stringify(newState, null, 2));
              try {
                require("node:fs").unlinkSync(pkcePath);
              } catch {
                /* ignore */
              }

              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(
                "<html><body><h2>Success!</h2><p>You can close this tab and return to the terminal.</p></body></html>"
              );
              server.close();
              console.log(`\n✅ ${service} authenticated successfully.`);
              console.log(`   Access token saved. Run "gbrain connector sync ${service}" to test.`);
              resolve(0);
            })
            .catch((err) => {
              res.writeHead(500, { "Content-Type": "text/html" });
              res.end(
                `<html><body><h2>Error</h2><p>${err instanceof Error ? err.message : String(err)}</p></body></html>`
              );
              server.close();
              console.error(
                `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`
              );
              resolve(1);
            });
        });

        server.listen(callbackPort, () => {
          console.log(`Waiting for callback on ${redirectUri} ...`);
        });

        // 5-minute timeout.
        setTimeout(
          () => {
            server.close();
            console.error("Error: OAuth callback timed out after 5 minutes.");
            resolve(1);
          },
          5 * 60 * 1000
        );
      });
    }

    case "remove": {
      if (!service) {
        console.error("Error: missing service. Usage: gbrain connector remove <service>");
        return 1;
      }
      await manager.remove(service);
      console.log(`Connector removed: ${service}`);
      return 0;
    }

    case "sync": {
      if (!service) {
        console.error("Error: missing service. Usage: gbrain connector sync <service>");
        return 1;
      }
      console.log(`Triggering sync for ${service}...`);
      // Load enabled connectors and find the target.
      const sources = await manager.loadEnabled();
      const target = sources.find((s) => s.id === service || s.id.startsWith(service));
      if (!target) {
        console.error(`Error: connector "${service}" not found or not enabled.`);
        console.error(`Run "gbrain connector list" to see configured connectors.`);
        return 1;
      }
      // Start the connector (loads state, validates token) then run one sync.
      try {
        await target.start({
          emit: () => {},
          engine: {} as any,
          logger: { info: () => {}, warn: () => {}, error: () => {} } as any,
          abortSignal: new AbortController().signal,
          config: {},
        });
        await target.sync();
        await target.stop();
        console.log(`Sync complete for ${service}.`);
        return 0;
      } catch (err) {
        console.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
    }

    case "status": {
      if (!service) {
        // Show all connector statuses.
        const list = await manager.list();
        if (list.length === 0) {
          console.log("No connectors configured.");
          return 0;
        }
        for (const c of list) {
          const status = c.connected ? "connected" : c.enabled ? "disconnected" : "disabled";
          console.log(`${c.service}: ${status}`);
        }
        return 0;
      }
      // TODO: Per-connector health check via connector.healthCheck()
      console.log(`${service}: status check not yet implemented (requires daemon connection)`);
      return 0;
    }

    case "enable": {
      if (!service) {
        console.error("Error: missing service. Usage: gbrain connector enable <service>");
        return 1;
      }
      await manager.setEnabled(service, true);
      console.log(`Connector enabled: ${service}`);
      return 0;
    }

    case "disable": {
      if (!service) {
        console.error("Error: missing service. Usage: gbrain connector disable <service>");
        return 1;
      }
      await manager.setEnabled(service, false);
      console.log(`Connector disabled: ${service}`);
      return 0;
    }

    default:
      printUsage();
      return sub ? 1 : 0;
  }
}
