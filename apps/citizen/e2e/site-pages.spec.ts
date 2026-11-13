import { expect, test, type Page } from "@playwright/test";
import { seedPocketBaseSession, type TestRecord } from "./pb-session";

// The site is served by one web container on the VPS: the landing page at "/",
// the citizen app at root paths (/login, /track), and the staff console at
// /dash/. Tracker data comes from the app's own server routes via pb.send:
//  POST /api/gamfix/track       { p_tracking_no }            → TrackResult
//  POST /api/gamfix/can-confirm { p_tracking_no }            → true
//  POST /api/gamfix/confirm     { p_tracking_no, p_phone }   → true
//  POST /api/gamfix/reopen      { p_tracking_no, p_reason, p_phone } → true
// Sessions are the real PocketBase authStore: {token, record} under the
// localStorage key "pocketbase_auth", validated on mount via
// POST /api/collections/users/auth-refresh.

const productionBaseURL = process.env.BASE_URL;
const landingURL = productionBaseURL
  ? new URL("/", productionBaseURL).toString()
  : "http://127.0.0.1:4174/";
const sharedLoginURL = productionBaseURL
  ? new URL("/login", productionBaseURL).toString()
  : "http://127.0.0.1:4173/login";
const dashboardLoginURL = productionBaseURL
  ? new URL("/dash/login", productionBaseURL).toString()
  : "http://127.0.0.1:4175/dash/login";
const trackURL = productionBaseURL
  ? new URL("/track", productionBaseURL).toString()
  : "http://127.0.0.1:4173/track";

async function expectPageAndAssetsToRender(
  page: Page,
  url: string,
  heading: string,
) {
  const runtimeErrors: string[] = [];
  const assetFailures: string[] = [];
  const loadedAssetTypes = new Set<string>();

  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.includes("/assets/") || !/\.(js|css)$/.test(pathname)) {
      return;
    }
    if (response.status() >= 400) {
      assetFailures.push(`${response.status()} ${pathname}`);
    } else {
      loadedAssetTypes.add(pathname.endsWith(".js") ? "js" : "css");
    }
  });

  await page.goto(url, { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: heading, exact: true }))
    .toBeVisible();
  await expect(page.locator("#root")).not.toBeEmpty();
  expect([...loadedAssetTypes].sort()).toEqual(["css", "js"]);
  expect(assetFailures).toEqual([]);
  expect(runtimeErrors).toEqual([]);
}

const CITIZEN_RECORD: TestRecord = {
  id: "00000000-0000-4000-8000-000000000101",
  email: "citizen@example.invalid",
  verified: true,
  role: "citizen",
  full_name: "Test Citizen",
  phone_verified: true,
  created: "2026-10-20T00:00:00.000Z",
  updated: "2026-10-20T00:00:00.000Z",
};

/** PocketBase session + auth-refresh + the tracker's gamfix routes. */
async function installCitizenTrackerMocks(page: Page, initialStatus = "citizen_confirmation") {
  let status = initialStatus;
  let citizenAction: Record<string, unknown> | null = null;

  await seedPocketBaseSession(page, CITIZEN_RECORD);

  // The shell's verification gate re-reads the record via getProfile().
  await page.route("**/api/collections/users/records/" + CITIZEN_RECORD.id, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CITIZEN_RECORD),
    });
  });

  const trackResult = () => ({
    tracking_no: "GC-TEST-001",
    status,
    urgency: "high",
    title: "Street light is out",
    description: "The street light has been out for several nights.",
    institution: "NAWEC",
    department: null,
    expected_response_at: null,
    resolved_at: ["citizen_confirmation", "closed"].includes(status)
      ? "2026-10-20T12:00:00.000Z"
      : null,
    closed_at: status === "closed" ? "2026-10-20T13:00:00.000Z" : null,
    timeline: [
      { status: "received", message: "Report received.", at: "2026-10-20T08:00:00.000Z" },
      { status: "assigned", message: "Report assigned to an officer.", at: "2026-10-20T09:00:00.000Z" },
      { status: "in_progress", message: "An officer has started work.", at: "2026-10-20T10:00:00.000Z" },
      ...(status === "citizen_confirmation" || status === "closed"
        ? [{ status: "citizen_confirmation", message: "Fix reported: the street light was replaced.", at: "2026-10-20T12:00:00.000Z" }]
        : []),
    ],
  });

  await page.route("**/api/gamfix/track", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(trackResult()),
    });
  });
  await page.route("**/api/gamfix/can-confirm", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
  });
  await page.route("**/api/gamfix/confirm", async (route) => {
    citizenAction = route.request().postDataJSON() as Record<string, unknown>;
    status = "closed";
    await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
  });
  await page.route("**/api/gamfix/reopen", async (route) => {
    citizenAction = route.request().postDataJSON() as Record<string, unknown>;
    status = "reopened";
    await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
  });

  return { citizenAction: () => citizenAction };
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(`${viewport.name} site pages`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("landing page renders with its assets", async ({ page }) => {
      await expectPageAndAssetsToRender(
        page,
        landingURL,
        "What can you report",
      );
    });

    test("shared citizen and staff sign-in renders with its assets", async ({ page }) => {
      await expectPageAndAssetsToRender(page, sharedLoginURL, "Welcome back");
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
    });
  });
}

test("dashboard login route redirects to the shared sign-in page", async ({ page }) => {
  await page.goto(dashboardLoginURL);
  await expect(page).toHaveURL(/\/login\/?$/);
  if (productionBaseURL) {
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  }
});

test("citizen tracker shows six readable stages on mobile and labels the reported fix consistently", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCitizenTrackerMocks(page);

  await page.goto(`${trackURL}?ref=GC-TEST-001`);
  await expect(page.getByRole("heading", { name: "Street light is out" })).toBeVisible();

  const progress = page.getByRole("region", { name: "Report progress, six stages" });
  await expect(progress.locator("li")).toHaveCount(6);
  await expect(progress.getByText("Fix reported", { exact: true })).toBeVisible();
  await expect(progress.getByText("Closed", { exact: true })).toBeVisible();
  const columnCount = await progress.locator("ol").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length,
  );
  expect(columnCount).toBe(1);
  await expect(progress).toContainText("Step 5 of 6");
});

test("the reporting citizen can confirm a fix and close the report", async ({ page }) => {
  const mocks = await installCitizenTrackerMocks(page);
  await page.goto(`${trackURL}?ref=GC-TEST-001`);

  const progress = page.getByRole("region", { name: "Report progress, six stages" });
  await page.getByRole("button", { name: "Confirm fix and close report" }).click();
  await expect(progress).toContainText("Step 6 of 6");
  await expect(progress.getByText("Closed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your response is needed" })).toHaveCount(0);
  expect(mocks.citizenAction()).toMatchObject({ p_tracking_no: "GC-TEST-001", p_phone: null });
});

test("the reporting citizen can reopen a fix that did not solve the problem", async ({ page }) => {
  const mocks = await installCitizenTrackerMocks(page);
  await page.goto(`${trackURL}?ref=GC-TEST-001`);

  await page.getByLabel("If it is not fixed, explain what still needs attention").fill("The light is still out.");
  await page.getByRole("button", { name: "Reopen report" }).click();
  const progress = page.getByRole("region", { name: "Report progress, six stages" });
  await expect(progress).toContainText("Step 3 of 6");
  await expect(progress).toContainText("Reopened");
  expect(mocks.citizenAction()).toMatchObject({
    p_tracking_no: "GC-TEST-001",
    p_reason: "The light is still out.",
    p_phone: null,
  });
});
