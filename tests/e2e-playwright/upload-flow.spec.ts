import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "UploadTest123!",
  name: "Upload Tester",
};

function getTestEmail() {
  testCounter++;
  return `upload-e2e-${Date.now()}-${testCounter}@subsumio.local`;
}

test.describe("Upload Flow", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/at/signup", { waitUntil: "networkidle" });
    // Wait for React hydration
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => window.location.pathname === "/dashboard", {
      timeout: 45_000,
    });
    await page.waitForLoadState("domcontentloaded");
    // Complete onboarding via API so dashboard pages don't redirect
    const csrf = (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
    await page.context().request.post("/api/onboarding", {
      data: { industry: null },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    // Set tour-completed to avoid guided tour overlay interfering
    await page.evaluate(() => {
      try {
        localStorage.setItem("subsumio-tour-completed", "true");
      } catch {}
    });
  });

  test("navigates to upload page", async ({ page }) => {
    await page.goto("/dashboard/upload");
    await expect(page.locator("text=Dokument hochladen")).toBeVisible();
    await expect(page.locator("text=Markdown, PDF oder Text")).toBeVisible();
  });

  test("shows validation for unsupported file type", async ({ page }) => {
    await page.goto("/dashboard/upload");
    // A real file through the file input — the dropzone must refuse it and say why.
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "programm.exe",
        mimeType: "application/x-msdownload",
        buffer: Buffer.from("MZ\x90\x00 not a document"),
      });
    await expect(page.getByText("Dateityp wird nicht unterstützt.").first()).toBeVisible();
  });

  test("server refuses an executable and files a PDF into the matter", async ({ page }) => {
    const api = page.context().request;
    const csrf = (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value ?? "";
    const caseSlug = `legal/cases/e2e-upload-${Date.now()}`;
    const caseRes = await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: caseSlug,
        title: "E2E Upload-Akte",
        type: "legal_case",
        content: "",
        frontmatter: { type: "legal_case", case_number: `E2E-UP-${Date.now()}`, status: "open" },
      },
    });
    expect(caseRes.status()).toBe(200);

    const exe = await api.post("/api/upload", {
      headers: { "x-csrf-token": csrf },
      multipart: {
        case_slug: caseSlug,
        file: {
          name: "programm.exe",
          mimeType: "application/x-msdownload",
          buffer: Buffer.from("MZ\x90\x00 executable"),
        },
      },
    });
    expect(exe.status()).toBeGreaterThanOrEqual(400);
    expect(exe.status()).toBeLessThan(500);

    const pdf = await api.post("/api/upload", {
      headers: { "x-csrf-token": csrf },
      multipart: {
        case_slug: caseSlug,
        file: {
          name: "schriftsatz.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1"),
        },
      },
    });
    expect(pdf.status()).toBeLessThan(300);
    const uploaded = await pdf.json();
    const docSlug = uploaded.slug ?? uploaded.data?.slug;
    expect(typeof docSlug).toBe("string");

    // The document is filed in the matter.
    const matter = await (await api.get(`/api/pages/${caseSlug}`)).json();
    const docs = (matter.frontmatter?.documents ?? []) as Array<{ slug?: string }>;
    expect(docs.some((d) => d.slug === docSlug)).toBe(true);
  });

  test("upload page has offline indicator", async ({ page }) => {
    await page.goto("/dashboard/upload");
    // The page uses isOnline() — we just verify the UI loads
    await expect(page.locator("text=Dateien hierher ziehen")).toBeVisible();
  });
});
