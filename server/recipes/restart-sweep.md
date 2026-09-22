---
id: restart-sweep
name: Restart Sweep
version: 1.0.0
description: Detects dropped messages after agent restart by comparing session state before and after
category: reflex
requires: []
secrets:
  - name: OPENCLAW_TELEGRAM_GROUP
    description: Telegram group ID for alerts
    where: https://core.telegram.org/bots/api#chat
  - name: OPENCLAW_ALERT_TOPIC
    description: Telegram topic/thread ID for alerts
    where: https://core.telegram.org/bots/api#message
health_checks:
  - type: env_exists
    var: OPENCLAW_TELEGRAM_GROUP
setup_time: 10 min
---

# Restart Sweep

Detects dropped messages after an agent restart by comparing session state
before and after the restart event.

## How it works

1. On startup, the detector reads the previous session list from state
2. Compares with current sessions to find any that were active before restart
3. Alerts via Telegram (or stdout) about sessions that may have dropped messages

<!-- restart-sweep:script -->

```javascript
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export default class RestartSweepDetector {
  constructor(opts = {}) {
    const env = process.env;
    this._execFile = opts.execFile || ((cmd, argv, cb) => cb(null, "", ""));

    // Alert mode resolution (constructor-time, C2)
    const hasGroup = !!env.OPENCLAW_TELEGRAM_GROUP;
    const hasTopic = !!env.OPENCLAW_ALERT_TOPIC;
    if (hasGroup && hasTopic) {
      this.alertMode = "telegram";
    } else if (hasGroup) {
      this.alertMode = "telegram_stdout";
    } else {
      this.alertMode = "stdout";
    }

    this.telegramGroup = env.OPENCLAW_TELEGRAM_GROUP || null;
    this.alertTopic = env.OPENCLAW_ALERT_TOPIC || null;
    this.aggressive = env.OPENCLAW_RESTART_SWEEP_AGGRESSIVE === "1";

    // State paths (D2: GBRAIN_HOME override)
    const home = env.GBRAIN_HOME || join(homedir(), ".gbrain");
    this.STATE_DIR = join(home, "integrations", "restart-sweep");
    this.ALERTED_PATH = join(this.STATE_DIR, "alerted.json");
    this.LOG_PATH = join(this.STATE_DIR, "sweep.log.jsonl");

    this.restartTime = Date.now();
    this.alerted = new Map();
  }

  filterTelegramSessions(sessions) {
    if (!this.telegramGroup) return [];
    return sessions.filter((s) => {
      return s.key && s.key.includes(`telegram:group:${this.telegramGroup}`);
    });
  }

  async detectDroppedMessages(sessions) {
    const dropped = [];

    for (const session of sessions) {
      // Check abortedLastRun flag on ALL sessions (not just telegram-filtered)
      if (session.abortedLastRun) {
        const topic = this._extractTopic(session.key);
        const sessionKey = session.key;
        if (this.isInCooldown(sessionKey)) continue;
        dropped.push({
          sessionKey,
          topic,
          sessionId: session.sessionId,
          abortedLastRun: true,
          reason: "Session aborted on last run",
          lastUpdate: session.updatedAt ? new Date(session.updatedAt).toISOString() : undefined,
        });
        continue;
      }

      // AGGRESSIVE: suspicious-gap heuristic (only for telegram group sessions)
      if (this.aggressive && this.restartTime && session.updatedAt) {
        const tgSessions = this.filterTelegramSessions([session]);
        if (tgSessions.length === 0) continue;

        const fiveMinBeforeRestart = this.restartTime - 5 * 60 * 1000;
        const fifteenMinAfterRestart = this.restartTime + 15 * 60 * 1000;
        const now = Date.now();

        // Session was active within 5 min before restart AND silent for 15 min after
        if (
          session.updatedAt >= fiveMinBeforeRestart &&
          session.updatedAt <= this.restartTime &&
          now >= fifteenMinAfterRestart
        ) {
          const topic = this._extractTopic(session.key);
          const sessionKey = session.key;
          if (this.isInCooldown(sessionKey)) continue;
          dropped.push({
            sessionKey,
            topic,
            sessionId: session.sessionId,
            suspiciousGap: true,
            reason: "Active before restart, silent after",
            lastUpdate: new Date(session.updatedAt).toISOString(),
          });
        }
      }
    }

    return dropped;
  }

  _extractTopic(key) {
    const match = key && key.match(/topic:(\d+)/);
    return match ? match[1] : "unknown";
  }

  async loadAlerted() {
    if (!existsSync(this.ALERTED_PATH)) {
      return new Map();
    }
    try {
      const raw = readFileSync(this.ALERTED_PATH, "utf-8");
      const data = JSON.parse(raw);
      const map = new Map();
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      for (const [k, v] of Object.entries(data)) {
        const lastAlertedAt = new Date(v.lastAlertedAt).getTime();
        if (now - lastAlertedAt < thirtyDaysMs) {
          map.set(k, v);
        }
      }
      return map;
    } catch (e) {
      console.warn(`Failed to load alerted.json: ${e.message || e}`);
      return new Map();
    }
  }

  async saveAlerted() {
    if (!existsSync(this.STATE_DIR)) {
      mkdirSync(this.STATE_DIR, { recursive: true });
    }
    const obj = {};
    for (const [k, v] of this.alerted) {
      obj[k] = v;
    }
    const tmpPath = this.ALERTED_PATH + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(obj, null, 2));
    renameSync(tmpPath, this.ALERTED_PATH);
  }

  isInCooldown(sessionKey) {
    if (!this.alerted || !this.alerted.has(sessionKey)) return false;
    const entry = this.alerted.get(sessionKey);
    const lastAlertedAt = new Date(entry.lastAlertedAt).getTime();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return Date.now() - lastAlertedAt < sixHoursMs;
  }

  async sendTelegramAlert(message) {
    return new Promise((resolve) => {
      const argv = ["message", "send", "--channel", "telegram", "--target", this.telegramGroup];
      if (this.alertTopic) {
        argv.push("--thread-id", this.alertTopic);
      }
      argv.push("--message", message);
      this._execFile("openclaw", argv, (err, stdout, stderr) => {
        resolve({ err, stdout, stderr });
      });
    });
  }

  async alertOnDroppedMessages(dropped) {
    if (!dropped || dropped.length === 0) return;
    const lines = dropped.map((d) => {
      return `Session: ${d.sessionKey}\nTopic: ${d.topic}\nReason: ${d.reason}\nLast update: ${d.lastUpdate || "unknown"}`;
    });
    const message = `Restart sweep detected ${dropped.length} dropped session(s):\n\n${lines.join("\n\n")}`;

    if (this.alertMode === "telegram" || this.alertMode === "telegram_stdout") {
      await this.sendTelegramAlert(message);
    }
    if (this.alertMode === "stdout" || this.alertMode === "telegram_stdout") {
      console.log(message);
    }
  }
}
```
