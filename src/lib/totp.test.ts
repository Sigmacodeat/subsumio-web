import { describe, it, expect } from "vitest";
import { generateSecret, generateTOTP, verifyTOTP, otpAuthURL } from "./totp";

describe("TOTP", () => {
  it("generateSecret() returns a 32-char Base32 string", () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("generateTOTP() returns a 6-digit code", async () => {
    const secret = generateSecret();
    const code = await generateTOTP(secret);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifyTOTP() returns true for the current code", async () => {
    const secret = generateSecret();
    const code = await generateTOTP(secret);
    expect(await verifyTOTP(code, secret)).toBe(true);
  });

  it("verifyTOTP() returns false for a wrong code", async () => {
    const secret = generateSecret();
    // Generate a code and then modify it to be wrong
    const code = await generateTOTP(secret);
    const wrongCode = (Number(code) + 111111) % 1000000;
    const wrongStr = wrongCode.toString().padStart(6, "0");
    // If the wrong code happens to be within ±1 step, retry with another
    const result = await verifyTOTP(wrongStr, secret);
    // There's a tiny chance the modified code falls within tolerance, but
    // statistically it should be false. We accept either but prefer false.
    if (result) {
      // Retry with a clearly wrong code
      const clearlyWrong = "000000";
      const code2 = await generateTOTP(secret);
      if (code2 !== clearlyWrong) {
        expect(await verifyTOTP(clearlyWrong, secret)).toBe(false);
      }
    } else {
      expect(result).toBe(false);
    }
  });

  it("verifyTOTP() returns true for code within ±1 time window", async () => {
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000);

    // Code from 30s ago (−1 step)
    const pastCode = await generateTOTP(secret, { time: now - 30 });
    expect(await verifyTOTP(pastCode, secret)).toBe(true);

    // Code from 30s in the future (+1 step)
    const futureCode = await generateTOTP(secret, { time: now + 30 });
    expect(await verifyTOTP(futureCode, secret)).toBe(true);
  });

  it("verifyTOTP() returns false for code outside ±1 tolerance (−60s)", async () => {
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000);
    const oldCode = await generateTOTP(secret, { time: now - 60 });
    const result = await verifyTOTP(oldCode, secret);
    // Should be false (−2 steps is outside ±1 tolerance)
    expect(result).toBe(false);
  });

  it("generateTOTP() with digits=8 returns 8-digit code", async () => {
    const secret = generateSecret();
    const code = await generateTOTP(secret, { digits: 8 });
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^\d{8}$/);
  });

  it("generateTOTP() with step=60 produces same code within 60s window", async () => {
    const secret = generateSecret();
    // Align to a 60s boundary so now and now+30 are in the same step
    const now = Math.floor(Date.now() / 1000 / 60) * 60;
    const code1 = await generateTOTP(secret, { time: now, step: 60 });
    const code2 = await generateTOTP(secret, { time: now + 30, step: 60 });
    expect(code1).toBe(code2);
  });

  it("otpAuthURL() generates a valid otpauth:// URL", () => {
    const secret = generateSecret();
    const url = otpAuthURL(secret, "user@example.com", "Subsumio");
    expect(url).toMatch(/^otpauth:\/\/totp\/user%40example\.com\?/);
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain("issuer=Subsumio");
  });
});
