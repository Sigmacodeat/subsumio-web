/**
 * Reset a user's password hash directly in the auth database.
 *
 * This is a manual admin/ops script. It expects the target email and the
 * new password to be supplied via environment variables so no secrets are
 * committed to the repository.
 *
 * Required env:
 *   SUBSUMIO_AUTH_DATABASE_URL - Postgres connection string for the auth store
 *   SUBSUMIO_RESET_EMAIL        - Email of the user to update
 *   SUBSUMIO_RESET_PASSWORD     - New password to hash and store
 *
 * Usage:
 *   bun run scripts/reset-password.ts
 */
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

const authDatabaseUrl = process.env.SUBSUMIO_AUTH_DATABASE_URL;
const email = process.env.SUBSUMIO_RESET_EMAIL;
const password = process.env.SUBSUMIO_RESET_PASSWORD;

if (!authDatabaseUrl || !email || !password) {
  console.error(
    "Missing required environment variables: SUBSUMIO_AUTH_DATABASE_URL, SUBSUMIO_RESET_EMAIL, SUBSUMIO_RESET_PASSWORD"
  );
  process.exit(1);
}

const salt = randomBytes(16);

scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, async (err, key) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const hash = "s2:" + salt.toString("hex") + ":" + key.toString("hex");

  const pool = new Pool({ connectionString: authDatabaseUrl });

  try {
    await pool.query(
      "UPDATE subsumio_users SET password_hash = $1, data = jsonb_set(data, '{passwordHash}', to_jsonb($1::text)) WHERE email = $2",
      [hash, email]
    );

    const res2 = await pool.query(
      "SELECT data->>'passwordHash' as pw FROM subsumio_users WHERE email = $1",
      [email]
    );
    const stored = res2.rows[0]?.pw;
    if (!stored) {
      console.error("User not found or no password hash stored");
      process.exit(1);
    }
    console.log("Hash length:", stored.length);
    console.log("Hash starts with s2:", stored.startsWith("s2:"));

    // Verify the password works
    const [scheme, saltHex, hashHex] = stored.split(":");
    if (scheme !== "s2") {
      console.log("INVALID SCHEME");
      process.exit(1);
    }
    scrypt(
      password,
      Buffer.from(saltHex, "hex"),
      64,
      { N: 16384, r: 8, p: 1 },
      (err2, key2) => {
        if (err2) {
          console.error(err2);
          process.exit(1);
        }
        const expected = Buffer.from(hashHex, "hex");
        const ok = key2.length === expected.length && timingSafeEqual(key2, expected);
        console.log("Password verify:", ok ? "SUCCESS" : "FAILED");
        pool.end();
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("DB Error:", message);
    await pool.end();
    process.exit(1);
  }
});
