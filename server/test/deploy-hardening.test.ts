/**
 * Static guards for the production stack (server/deploy/netcup). They read
 * the committed compose file, Dockerfile and deploy script — no Docker needed.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const SERVER = join(import.meta.dir, "..");
const NETCUP = join(SERVER, "deploy", "netcup");

type Service = Record<string, unknown> & {
  networks?: string[] | Record<string, unknown>;
};
const compose = yaml.load(readFileSync(join(NETCUP, "docker-compose.yml"), "utf8")) as {
  services: Record<string, Service>;
  networks?: Record<string, { external?: boolean; name?: string }>;
};
const deployScript = readFileSync(join(NETCUP, "deploy-code.sh"), "utf8");

function networksOf(svc: Service): string[] {
  if (!svc.networks) return ["default"];
  return Array.isArray(svc.networks) ? svc.networks : Object.keys(svc.networks);
}

describe("edge network: web and engine are reachable only via the proxy", () => {
  test("no service joins the shared foreign network", () => {
    for (const [name, svc] of Object.entries(compose.services)) {
      expect({ name, nets: networksOf(svc) }).toEqual({
        name,
        nets: expect.not.arrayContaining(["hetzner_default"]),
      });
    }
    expect(Object.keys(compose.networks ?? {})).not.toContain("hetzner_default");
  });

  test("web and engine share only the stack network and subsumio-edge", () => {
    for (const name of ["web", "engine"]) {
      expect(networksOf(compose.services[name]).sort()).toEqual(["default", "subsumio-edge"]);
    }
    expect(compose.networks?.["subsumio-edge"]).toEqual({ external: true, name: "subsumio-edge" });
  });

  test("the legacy proxy service never starts without an explicit profile", () => {
    expect(compose.services.caddy.profiles).toEqual(["standalone-proxy"]);
  });

  test("the reference proxy config overwrites X-Real-IP for the web app", () => {
    const caddyfile = readFileSync(join(NETCUP, "Caddyfile"), "utf8");
    expect(caddyfile).toContain("header_up X-Real-IP {remote_host}");
  });

  test("deploy attaches the proxy to the edge network and refuses a proxy without the X-Real-IP rule", () => {
    expect(deployScript).toContain("docker network create subsumio-edge");
    expect(deployScript).toContain("docker network connect subsumio-edge");
    expect(deployScript).toMatch(/grep -q 'X-Real-IP \{remote_host\}'/);
    // The check sits before the switch, so a drifted proxy stops the deploy.
    expect(deployScript.indexOf("X-Real-IP {remote_host}")).toBeLessThan(
      deployScript.indexOf('echo "[deploy] umschalten')
    );
  });
});
