/**
 * Create or reset a demo/test account in the production auth database.
 *
 * This is a manual admin/ops script. It inserts a fully functional demo user
 * with admin privileges and enterprise plan so the dashboard can be exercised
 * end-to-end without touching real client data.
 *
 * Required env:
 *   SUBSUMIO_AUTH_DATABASE_URL - Postgres connection string for the auth store
 *   SUBSUMIO_DEMO_EMAIL        - Email address for the demo account
 *   SUBSUMIO_DEMO_PASSWORD     - Password for the demo account (min 12 chars)
 *
 * Optional env:
 *   SUBSUMIO_DEMO_NAME         - Display name (default: "Demo Kanzlei")
 *   SUBSUMIO_DEMO_PLAN         - Plan: free|pro|team|enterprise (default: enterprise)
 *   SUBSUMIO_DEMO_ROLE         - Role: admin|lawyer|assistant|client_viewer (default: admin)
 *   SUBSUMIO_DEMO_INDUSTRY     - Industry: legal|tax|null (default: legal)
 *   SUBSUMIO_API_URL           - Engine URL to pre-warm the demo brain
 *   SUBSUMIO_WEB_API_KEY       - Engine API key for brain provisioning
 *
 * Usage:
 *   bun run scripts/create-demo-account.ts
 *
 * Idempotency: if the email already exists, the script updates the password,
 * plan, role, industry, and verification timestamp instead of failing.
 */

import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { Pool } from "pg";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars

function generateReferralCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) return reject(err);
      resolve("s2:" + salt.toString("hex") + ":" + key.toString("hex"));
    });
  });
}

function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [scheme, saltHex, hashHex] = stored.split(":");
    if (scheme !== "s2" || !saltHex || !hashHex) return resolve(false);
    scrypt(password, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) return reject(err);
      const expected = Buffer.from(hashHex, "hex");
      resolve(key.length === expected.length && key.equals(expected));
    });
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function validPlan(value: string): "free" | "pro" | "team" | "enterprise" {
  const plans: Array<"free" | "pro" | "team" | "enterprise"> = [
    "free",
    "pro",
    "team",
    "enterprise",
  ];
  if (plans.includes(value as "free" | "pro" | "team" | "enterprise"))
    return value as "free" | "pro" | "team" | "enterprise";
  console.error(`Invalid plan: ${value}. Must be one of: ${plans.join(", ")}`);
  process.exit(1);
}

function validRole(value: string): "admin" | "lawyer" | "assistant" | "client_viewer" {
  const roles: Array<"admin" | "lawyer" | "assistant" | "client_viewer"> = [
    "admin",
    "lawyer",
    "assistant",
    "client_viewer",
  ];
  if (roles.includes(value as "admin" | "lawyer" | "assistant" | "client_viewer"))
    return value as "admin" | "lawyer" | "assistant" | "client_viewer";
  console.error(`Invalid role: ${value}. Must be one of: ${roles.join(", ")}`);
  process.exit(1);
}

function validIndustry(value: string): string | null {
  if (value === "legal" || value === "tax") return value;
  if (value === "" || value === "null") return null;
  console.error(`Invalid industry: ${value}. Must be "legal" or "tax"`);
  process.exit(1);
}

interface UserData {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "lawyer" | "assistant" | "client_viewer";
  plan: "free" | "pro" | "team" | "enterprise";
  locale: "en" | "de";
  referralCode: string;
  referredBy: string | null;
  brainId: string;
  stripeCustomerId: null;
  emailVerifiedAt: string | null;
  orgId: null;
  industry: string | null;
  twoFactorSecret: null;
  twoFactorEnabled: boolean;
  pendingTwoFactorSecret: null;
  pendingTwoFactorExpiresAt: null;
  twoFactorBackupCodes: null;
  docusignAccessToken: null;
  docusignRefreshToken: null;
  docusignTokenExpiresAt: null;
  openaiKey: null;
  anthropicKey: null;
  zeroEntropyKey: null;
  preferredModel: null;
  onboardingCompletedAt: null;
  createdAt: string;
}

async function main() {
  const authDatabaseUrl = requireEnv("SUBSUMIO_AUTH_DATABASE_URL");
  const email = requireEnv("SUBSUMIO_DEMO_EMAIL").trim().toLowerCase();
  const password = requireEnv("SUBSUMIO_DEMO_PASSWORD");

  if (password.length < 12) {
    console.error("Password must be at least 12 characters long");
    process.exit(1);
  }

  const name = (process.env.SUBSUMIO_DEMO_NAME || "Demo Kanzlei").trim();
  const plan = validPlan(process.env.SUBSUMIO_DEMO_PLAN || "enterprise");
  const role = validRole(process.env.SUBSUMIO_DEMO_ROLE || "admin");
  const industry = validIndustry(process.env.SUBSUMIO_DEMO_INDUSTRY || "legal");
  const locale: "en" | "de" = process.env.SUBSUMIO_DEMO_LOCALE === "en" ? "en" : "de";

  const passwordHash = await hashPassword(password);
  const pool = new Pool({ connectionString: authDatabaseUrl });

  try {
    // Check for existing user
    const { rows: existingRows } = await pool.query<{ id: string; data: UserData }>(
      "SELECT id, data FROM subsumio_users WHERE email = $1",
      [email]
    );

    const existing = existingRows[0];
    let userId: string;
    let brainId: string;
    let referralCode: string;
    let createdAt: string;

    if (existing) {
      userId = existing.id;
      const data = existing.data;
      brainId = data.brainId || `brain_${randomUUID().slice(0, 8)}`;
      referralCode = data.referralCode || generateReferralCode();
      createdAt = data.createdAt || new Date().toISOString();

      console.log(`Account ${email} already exists. Updating password and settings...`);

      const updatedData: UserData = {
        ...data,
        passwordHash,
        role,
        plan,
        industry,
        locale,
        emailVerifiedAt: new Date().toISOString(),
      };

      await pool.query(
        `UPDATE subsumio_users
            SET password_hash = $1,
                referral_code = $2,
                data = $3::jsonb,
                updated_at = now()
          WHERE id = $4`,
        [passwordHash, referralCode, JSON.stringify(updatedData), userId]
      );
    } else {
      userId = randomUUID();
      brainId = `brain_${randomUUID().slice(0, 8)}`;
      referralCode = generateReferralCode();
      createdAt = new Date().toISOString();

      // Collision check for referral code
      let collision = true;
      while (collision) {
        const { rows } = await pool.query("SELECT 1 FROM subsumio_users WHERE referral_code = $1", [
          referralCode,
        ]);
        collision = rows.length > 0;
        if (collision) referralCode = generateReferralCode();
      }

      const userData: UserData = {
        id: userId,
        email,
        name,
        passwordHash,
        role,
        plan,
        locale,
        referralCode,
        referredBy: null,
        brainId,
        stripeCustomerId: null,
        emailVerifiedAt: new Date().toISOString(),
        orgId: null,
        industry,
        twoFactorSecret: null,
        twoFactorEnabled: false,
        pendingTwoFactorSecret: null,
        pendingTwoFactorExpiresAt: null,
        twoFactorBackupCodes: null,
        docusignAccessToken: null,
        docusignRefreshToken: null,
        docusignTokenExpiresAt: null,
        openaiKey: null,
        anthropicKey: null,
        zeroEntropyKey: null,
        preferredModel: null,
        onboardingCompletedAt: null,
        createdAt,
      };

      await pool.query(
        `INSERT INTO subsumio_users (id, email, referral_code, password_hash, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())`,
        [userId, email, referralCode, passwordHash, JSON.stringify(userData), createdAt]
      );
    }

    // Verify the password works
    const { rows: verifyRows } = await pool.query<{ data: UserData }>(
      "SELECT data FROM subsumio_users WHERE email = $1",
      [email]
    );
    const storedHash = verifyRows[0]?.data?.passwordHash;
    if (!storedHash) {
      console.error("User created but password hash not found");
      process.exit(1);
    }
    const ok = await verifyPassword(password, storedHash);
    if (!ok) {
      console.error("Password verification failed after insert");
      process.exit(1);
    }

    // Optional brain pre-warming
    const engineUrl = process.env.SUBSUMIO_API_URL;
    const apiKey = process.env.SUBSUMIO_WEB_API_KEY;
    if (engineUrl && apiKey) {
      try {
        const res = await fetch(`${engineUrl}/api/stats`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Brain-Id": brainId,
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok && res.status !== 404) {
          console.warn(`[provision] engine stats returned ${res.status}`);
        } else {
          console.log(`[provision] brain ${brainId} pre-warmed`);
        }
      } catch (err) {
        console.warn(
          "[provision] brain pre-warming failed (lazy provisioning will still work on login):",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    console.log("\n✅ Demo account ready");
    console.log("   Email:    ", email);
    console.log("   Password: ", password);
    console.log("   Name:     ", name);
    console.log("   Role:     ", role);
    console.log("   Plan:     ", plan);
    console.log("   Industry: ", industry);
    console.log("   Brain:    ", brainId);
    console.log("   User ID:  ", userId);
    console.log("   Login:    https://subsum.io/login");
  } catch (err) {
    console.error("DB Error:", err instanceof Error ? err.message : String(err));
    await pool.end();
    process.exit(1);
  }

  await pool.end();
}

main();
