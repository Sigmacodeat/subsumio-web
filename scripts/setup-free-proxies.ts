#!/usr/bin/env bun
/**
 * Automated proxy account setup — logs into Webshare, Oxylabs, FrontProxy
 * and extracts proxy credentials from their dashboards.
 *
 * Usage: bun scripts/setup-free-proxies.ts
 */

import { chromium } from "playwright";

const EMAIL = "mesic.sigmacode@gmail.com";
const PASSWORD = "Primimte01.,?!-";

interface ProxyResult {
  provider: string;
  proxyUrl?: string;
  error?: string;
  screenshot?: string;
}

async function setupWebshare(): Promise<ProxyResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("[webshare] Navigating to login...");
    await page.goto("https://dashboard.webshare.io/", { waitUntil: "networkidle", timeout: 30000 });

    // Take screenshot to see what we're working with
    await page.screenshot({ path: "/tmp/webshare-01-login.png" });

    // Check if we need to login
    const loginForm = await page.$(
      'input[type="email"], input[name="username"], input[placeholder*="mail" i]'
    );
    if (loginForm) {
      console.log("[webshare] Login form found, filling in credentials...");
      await page.fill(
        'input[type="email"], input[name="username"], input[placeholder*="mail" i]',
        EMAIL
      );

      const pwField = await page.$('input[type="password"]');
      if (pwField) {
        await page.fill('input[type="password"]', PASSWORD);
      }

      // Find and click login button
      const loginBtn = await page.$(
        'button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")'
      );
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(5000);
      }

      await page.screenshot({ path: "/tmp/webshare-02-after-login.png" });
      console.log("[webshare] After login URL:", page.url());
    }

    // Navigate to proxy list page
    console.log("[webshare] Navigating to proxy list...");
    await page.goto("https://dashboard.webshare.io/proxy/list", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/webshare-03-proxy-list.png" });

    // Try to extract proxy credentials from the page
    const pageText = await page.textContent("body");
    if (pageText) {
      // Look for proxy host:port patterns
      const proxyMatch = pageText.match(/(\d+\.\d+\.\d+\.\d+:\d+)/g);
      if (proxyMatch) {
        console.log("[webshare] Found proxy addresses:", proxyMatch.slice(0, 5));
      }

      // Look for credentials
      const credMatch = pageText.match(/username[:\s]+(\S+)/i);
      const passMatch = pageText.match(/password[:\s]+(\S+)/i);
      if (credMatch && passMatch) {
        const proxyUrl = `http://${credMatch[1]}:${passMatch[1]}@${proxyMatch?.[0] || "p.webshare.io:80"}`;
        console.log("[webshare] Extracted proxy URL:", proxyUrl.replace(/:[^:@]+@/, ":****@"));
        return { provider: "webshare", proxyUrl };
      }
    }

    // Try to find proxy configuration in the page
    const proxyEntries = await page.$$eval(
      "table tr, [class*='proxy'], [class*='credential']",
      (rows) => {
        return rows
          .map((r) => r.textContent?.trim().substring(0, 200))
          .filter(Boolean)
          .slice(0, 10);
      }
    );

    if (proxyEntries.length > 0) {
      console.log("[webshare] Proxy entries found:", proxyEntries);
    }

    // Check for "Get Started" or "Activate" buttons
    const activateBtn = await page.$(
      'button:has-text("Activate"), button:has-text("Get Started"), button:has-text("Claim"), button:has-text("Free")'
    );
    if (activateBtn) {
      console.log("[webshare] Found activate button, clicking...");
      await activateBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "/tmp/webshare-04-after-activate.png" });
    }

    return {
      provider: "webshare",
      error: "Could not extract proxy credentials. Check screenshots in /tmp/",
      screenshot: "/tmp/webshare-*.png",
    };
  } catch (err) {
    await page.screenshot({ path: "/tmp/webshare-error.png" }).catch(() => {});
    return { provider: "webshare", error: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser.close();
  }
}

async function setupOxylabs(): Promise<ProxyResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("[oxylabs] Navigating to login...");
    await page.goto("https://dashboard.oxylabs.io/", { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: "/tmp/oxylabs-01-login.png" });

    // Check if we need to login
    const loginForm = await page.$(
      'input[type="email"], input[name="username"], input[placeholder*="mail" i]'
    );
    if (loginForm) {
      console.log("[oxylabs] Login form found...");
      await page.fill(
        'input[type="email"], input[name="username"], input[placeholder*="mail" i]',
        EMAIL
      );

      const pwField = await page.$('input[type="password"]');
      if (pwField) {
        await page.fill('input[type="password"]', PASSWORD);
      }

      const loginBtn = await page.$(
        'button[type="submit"], button:has-text("Login"), button:has-text("Sign in")'
      );
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(5000);
      }

      await page.screenshot({ path: "/tmp/oxylabs-02-after-login.png" });
      console.log("[oxylabs] After login URL:", page.url());
    }

    // Try to find free proxies page
    console.log("[oxylabs] Looking for free proxies...");
    await page.goto("https://dashboard.oxylabs.io/en/free-proxies", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/oxylabs-03-free-proxies.png" });

    // Extract proxy info
    const pageText = await page.textContent("body");
    if (pageText) {
      const proxyMatch = pageText.match(/(\d+\.\d+\.\d+\.\d+:\d+)/g);
      if (proxyMatch) {
        console.log("[oxylabs] Found proxy addresses:", proxyMatch.slice(0, 5));
      }
    }

    return {
      provider: "oxylabs",
      error: "Check screenshots in /tmp/",
      screenshot: "/tmp/oxylabs-*.png",
    };
  } catch (err) {
    await page.screenshot({ path: "/tmp/oxylabs-error.png" }).catch(() => {});
    return { provider: "oxylabs", error: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser.close();
  }
}

async function setupFrontproxy(): Promise<ProxyResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("[frontproxy] Navigating to signup...");
    await page.goto("https://frontproxy.com/signup/", { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: "/tmp/frontproxy-01-signup.png" });

    // Check if there's a signup form
    const emailField = await page.$(
      'input[type="email"], input[name="email"], input[placeholder*="mail" i]'
    );
    if (emailField) {
      console.log("[frontproxy] Signup form found, filling in...");
      await page.fill(
        'input[type="email"], input[name="email"], input[placeholder*="mail" i]',
        EMAIL
      );

      const pwField = await page.$('input[type="password"]');
      if (pwField) {
        await page.fill('input[type="password"]', PASSWORD);
      }

      const signupBtn = await page.$(
        'button[type="submit"], button:has-text("Sign up"), button:has-text("Get Started"), button:has-text("Create")'
      );
      if (signupBtn) {
        await signupBtn.click();
        await page.waitForTimeout(5000);
      }

      await page.screenshot({ path: "/tmp/frontproxy-02-after-signup.png" });
      console.log("[frontproxy] After signup URL:", page.url());
    }

    // Try to find proxy credentials
    const pageText = await page.textContent("body");
    if (pageText) {
      // Look for proxy host:port
      const proxyMatch = pageText.match(/([a-z0-9.-]+:\d+)/gi);
      if (proxyMatch) {
        console.log("[frontproxy] Found proxy addresses:", proxyMatch.slice(0, 5));
      }
    }

    return {
      provider: "frontproxy",
      error: "Check screenshots in /tmp/",
      screenshot: "/tmp/frontproxy-*.png",
    };
  } catch (err) {
    await page.screenshot({ path: "/tmp/frontproxy-error.png" }).catch(() => {});
    return { provider: "frontproxy", error: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Free Proxy Setup — Automated Dashboard Login");
  console.log("═══════════════════════════════════════════════════════════\n");

  const results: ProxyResult[] = [];

  // Run all three in sequence
  console.log("\n--- 1/3: Webshare ---");
  results.push(await setupWebshare());

  console.log("\n--- 2/3: Oxylabs ---");
  results.push(await setupOxylabs());

  console.log("\n--- 3/3: FrontProxy ---");
  results.push(await setupFrontproxy());

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");

  const working = results.filter((r) => r.proxyUrl);
  for (const r of results) {
    const status = r.proxyUrl ? "✅" : "❌";
    console.log(`  ${status} ${r.provider}: ${r.proxyUrl || r.error}`);
  }

  if (working.length > 0) {
    const urls = working.map((r) => `${r.proxyUrl}|${r.provider}`).join(",");
    console.log(`\n  RIS_PROXY_URLS=${urls}`);
  } else {
    console.log("\n  ❌ No working proxies yet. Check screenshots in /tmp/ for next steps.");
    console.log("     Screenshots: /tmp/webshare-*.png, /tmp/oxylabs-*.png, /tmp/frontproxy-*.png");
  }
}

main().catch(console.error);
