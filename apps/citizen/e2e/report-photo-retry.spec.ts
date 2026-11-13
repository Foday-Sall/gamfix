import { expect, test } from "@playwright/test";
import { seedPocketBaseSession, type TestRecord } from "./pb-session";

// Photo retry after a failed attachment. Native flow:
//  1. The report itself goes through POST /api/gamfix/complaints (JSON).
//  2. The photo is a PocketBase file field on the complaints record — the SDK
//     PATCHes /api/collections/complaints/records/{id} with multipart form data.
//  3. Retry re-checks the session via POST /api/gamfix/access, then PATCHes again.
// Session: real PocketBase authStore ({token, record} under "pocketbase_auth"),
// validated on mount with POST /api/collections/users/auth-refresh.

const USER_ID = "00000000-0000-4000-8000-000000000401";
const NAWEC_ID = "00000000-0000-4000-8000-000000000402";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000403";
const COMPLAINT_ID = "00000000-0000-4000-8000-000000000404";

test("photo retry is visible and works after a fetch failure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const userRecord: TestRecord = {
    id: USER_ID,
    email: "citizen@example.invalid",
    verified: true,
    role: "citizen",
    full_name: "Test Citizen",
    phone_verified: true,
    created: "2026-10-20T00:00:00.000Z",
    updated: "2026-10-20T00:00:00.000Z",
  };
  await seedPocketBaseSession(page, userRecord);

  // The shell's verification gate re-reads the record via getProfile().
  await page.route("**/api/collections/users/records/" + USER_ID, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(userRecord),
    });
  });

  // Report catalogue: institutions + categories (getFullList pages until
  // totalItems is reached, so return page-shaped bodies).
  await page.route("**/api/collections/institutions/records**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: 1,
        perPage: 200,
        totalItems: 1,
        totalPages: 1,
        items: [{
          id: NAWEC_ID,
          code: "NAWEC",
          name: "National Water and Electricity Company",
          active: true,
          collectionId: "_pb_collections_meta_",
          collectionName: "institutions",
        }],
      }),
    });
  });
  await page.route("**/api/collections/categories/records**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: 1,
        perPage: 200,
        totalItems: 1,
        totalPages: 1,
        items: [{
          id: CATEGORY_ID,
          slug: "water_supply",
          name: "Water supply",
          default_institution_id: NAWEC_ID,
          is_sensitive: false,
          is_emergency: false,
          deadline_hours: 24,
        }],
      }),
    });
  });

  // Session role check used by the retry path.
  await page.route("**/api/gamfix/access", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, role: "citizen" }),
    });
  });

  // The report intake route.
  await page.route("**/api/gamfix/complaints", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        complaint_id: COMPLAINT_ID,
        tracking_no: "GC-TEST-RETRY",
        institution: "NAWEC",
        institution_name: "National Water and Electricity Company",
      }),
    });
  });

  // The photo itself: first PATCH fails like a dropped connection, the retry
  // succeeds and returns the updated record (photos set).
  let uploadAttempts = 0;
  await page.route(`**/api/collections/complaints/records/${COMPLAINT_ID}`, async (route) => {
    uploadAttempts += 1;
    if (uploadAttempts === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...{ id: COMPLAINT_ID },
        photos: ["report.png"],
      }),
    });
  });

  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Who should handle it?" })).toBeVisible();
  await page.getByRole("button", { name: /National Water and Electricity Company/ }).click();
  await page.getByRole("button", { name: "Water supply" }).click();
  await page.getByLabel("Title").fill("Water is unavailable at the clinic");
  await page.getByLabel("What happened?").fill("Water supply has been unavailable since this morning.");
  await page.locator('input[type="file"]').setInputFiles({
    name: "report.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await page.getByRole("button", { name: "Yes, submit report", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Report submitted" })).toBeVisible();
  const failureNotice = page.getByRole("alert").filter({ hasText: "We could not confirm the photo attachment" });
  // An aborted upload surfaces as ClientResponseError with status 0.
  await expect(failureNotice).toContainText("photo_upload_0");
  const retryButton = page.getByRole("button", { name: "Retry photo upload", exact: true });
  await expect(retryButton).toBeVisible();
  await expect(retryButton).toBeInViewport();
  await retryButton.click();

  await expect(failureNotice).toHaveCount(0);
  await expect(page.getByText("Photo attached to your report.", { exact: true })).toBeVisible();
  expect(uploadAttempts).toBe(2);
});
