import { expect, test, type Page } from "@playwright/test";
import { seedPocketBaseSession, type TestRecord } from "./pb-session";

// The staff console (/dash) talks to PocketBase directly:
//  - session: the PB JS SDK's authStore ({token, record} under the
//    localStorage key "pocketbase_auth"), validated on load with
//    POST /api/collections/users/auth-refresh
//  - bootstrap: POST /api/gamfix/access → { ok, role, institution }
//  - queue feed: GET /api/collections/complaints/records?page=…&filter=(institution = '<id>')
//    (realtime updates ride on GET /api/realtime, an SSE stream)
//  - aggregates + actions: POST /api/gamfix/staff/stats|map|complaint|accept|status|resolution
//  - evidence photos: protected file URLs signed with POST /api/files/token

const productionBaseURL = process.env.BASE_URL;
const dashboardBaseURL = productionBaseURL
  ? new URL("/dash/", productionBaseURL).toString()
  : "http://127.0.0.1:4175/dash/";
const dashboardOrigin = new URL(dashboardBaseURL).origin;
const institutionId = "00000000-0000-4000-8000-000000000111";
const officerId = "00000000-0000-4000-8000-000000000222";

const stats = {
  institution: { id: institutionId, code: "NAWEC", name: "NAWEC" },
  total: 3,
  today: 1,
  open: 2,
  resolved_week: 1,
  overdue: 1,
  avg_resolution_hours: 18.5,
  by_status: [
    { status: "in_progress", count: 2 },
    { status: "closed", count: 1 },
  ],
  by_category: [
    { category: "Water Supply", count: 2 },
    { category: "Power", count: 1 },
  ],
  by_channel: [
    { channel: "whatsapp", count: 2 },
    { channel: "web", count: 1 },
  ],
  by_urgency: [
    { urgency: "normal", count: 2 },
    { urgency: "high", count: 1 },
  ],
  daily: [
    { date: "2026-10-18", received: 1, resolved: 0 },
    { date: "2026-10-19", received: 1, resolved: 1 },
  ],
};

const OFFICER_RECORD: TestRecord = {
  id: officerId,
  email: "officer@example.invalid",
  verified: true,
  role: "officer",
  institution: institutionId,
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};

async function installOfficerMocks(
  page: Page,
  failDashboardData = false,
  initialStatus = "in_progress",
  delayedCitizenPhoto = false,
) {
  let complaintQueryWasInstitutionScoped = false;
  let detailCalls = 0;
  let complaintStatus = initialStatus;
  let resolutionPhotoPath: string | null = null;
  let resolutionNote: string | null = null;
  let resolutionPhotoParamWasNull = false;
  let reopenedReportWasRestarted = false;

  await seedPocketBaseSession(page, OFFICER_RECORD);

  await page.route("**/api/collections/users/records/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(OFFICER_RECORD),
    });
  });

  // Bootstrap: who is signed in, and for which institution?
  await page.route("**/api/gamfix/access", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        role: "officer",
        institution: { id: institutionId, code: "NAWEC", name: "NAWEC", logo_url: null },
      }),
    });
  });

  // Queue feed (PB getList page shape; realtime rides on /api/realtime below).
  await page.route("**/api/collections/complaints/records**", async (route) => {
    if (failDashboardData) {
      await route.abort("internetdisconnected");
      return;
    }
    const url = new URL(route.request().url());
    complaintQueryWasInstitutionScoped =
      (url.searchParams.get("filter") ?? "").includes(institutionId);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: 1,
        perPage: 200,
        totalItems: 1,
        totalPages: 1,
        items: [
          {
            id: "00000000-0000-4000-8000-000000000333",
            institution: institutionId,
            citizen: "00000000-0000-4000-8000-000000000444",
            tracking_no: "GC-NAWEC-001",
            title: "Low water pressure",
            description: "Water pressure is low across the neighbourhood.",
            status: complaintStatus,
            urgency: "normal",
            is_anonymous: !delayedCitizenPhoto,
            created: "2026-10-19T10:00:00.000Z",
            updated: "2026-10-19T11:00:00.000Z",
            collectionId: "_pb_collections_meta_",
            collectionName: "complaints",
          },
        ],
      }),
    });
  });

  // PocketBase realtime (SSE). No events are delivered in the test.
  await page.route("**/api/realtime**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "",
    });
  });

  await page.route("**/api/gamfix/staff/stats", async (route) => {
    if (failDashboardData) {
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(stats),
    });
  });

  await page.route("**/api/gamfix/staff/map", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, complaints: [], total: 0, scope: "institution" }),
    });
  });

  await page.route("**/api/gamfix/staff/accept", async (route) => {
    complaintStatus = "assigned";
    await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
  });

  await page.route("**/api/gamfix/staff/status", async (route) => {
    const body = route.request().postDataJSON() as { p_status?: string };
    if (body.p_status === "in_progress" && ["assigned", "waiting_info", "reopened"].includes(complaintStatus)) {
      if (complaintStatus === "reopened") reopenedReportWasRestarted = true;
      complaintStatus = "in_progress";
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(complaintStatus === "in_progress"),
    });
  });

  await page.route("**/api/gamfix/staff/resolution", async (route) => {
    const body = route.request().postDataJSON() as {
      p_citizen_message?: string;
      p_resolution_photo_url?: string | null;
    };
    complaintStatus = "citizen_confirmation";
    resolutionNote = body.p_citizen_message ?? null;
    resolutionPhotoParamWasNull = body.p_resolution_photo_url === null;
    resolutionPhotoPath = body.p_resolution_photo_url ?? null;
    await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
  });

  await page.route("**/api/gamfix/staff/complaint", async (route) => {
    detailCalls += 1;
    // A photo attached to the PB record after the dialog first opened is
    // picked up by the dialog's follow-up detail call.
    const photoPath = delayedCitizenPhoto && detailCalls > 1
      ? `/api/files/complaints/00000000-0000-4000-8000-000000000333/photo.png`
      : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        complaint: {
          id: "00000000-0000-4000-8000-000000000333",
          tracking_no: "GC-NAWEC-001",
          title: "Low water pressure",
          description: "Water pressure is low across the neighbourhood.",
          status: complaintStatus,
          urgency: "normal",
          category: "Water supply",
          lat: 13.45,
          lng: -16.67,
          region: "Kanifing",
          council_area: "Kanifing Municipal Council",
          ward: "Kanifing",
          created_at: delayedCitizenPhoto
            ? new Date(Date.now() - 30_000).toISOString()
            : "2026-10-19T10:00:00.000Z",
          updated_at: "2026-10-19T11:00:00.000Z",
          is_anonymous: !delayedCitizenPhoto,
          photo_url: photoPath,
          resolution_photo_url: resolutionPhotoPath,
          resolution_note: resolutionNote,
          contact: null,
        },
      }),
    });
  });

  // Protected-file signing: the dialog mints a short-lived file token.
  await page.route("**/api/files/token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "test-file-token" }),
    });
  });

  return {
    complaintQueryWasInstitutionScoped: () => complaintQueryWasInstitutionScoped,
    detailCalls: () => detailCalls,
    resolutionPhotoParamWasNull: () => resolutionPhotoParamWasNull,
    reopenedReportWasRestarted: () => reopenedReportWasRestarted,
  };
}

test("signed-out visitors cannot open the institution dashboard", async ({ page }) => {
  await page.goto(new URL("/dash/", dashboardOrigin).toString());
  await expect(page).toHaveURL(/\/login\/?$/);
  if (productionBaseURL) {
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  }
});

test("officers see only their institution and are redirected away from admin secrets", async ({ page }) => {
  const mocks = await installOfficerMocks(page);
  await page.goto(new URL("/dash/settings", dashboardOrigin).toString());

  await expect(page).toHaveURL(/\/dash\/?$/);
  await expect(page.getByRole("heading", { name: "NAWEC operations overview" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Officer navigation" })).toBeVisible();
  await expect(page.locator("#overview")).toBeVisible();
  await expect(page.locator("#complaints")).toHaveCount(0);
  const sidebar = page.getByRole("complementary", { name: "Officer workspace sidebar" });
  await sidebar.getByRole("navigation").getByRole("button", { name: "Complaint map" }).click();
  await expect(page.getByRole("heading", { name: "NAWEC report map" })).toBeVisible();
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.locator("#overview")).toHaveCount(0);
  await expect(page.locator("#complaints")).toHaveCount(0);
  await sidebar.getByRole("navigation").getByRole("button", { name: "Complaint queue" }).click();
  await expect(page.getByRole("heading", { name: "NAWEC complaint queue" })).toBeVisible();
  await expect(page.locator("#complaints")).toBeVisible();
  await expect(page.locator("#complaints").getByText("Low water pressure", { exact: true })).toBeVisible();
  const queueRow = page.locator("#complaints tbody tr").filter({ hasText: "GC-NAWEC-001" });
  await queueRow.locator("td").nth(1).click();
  const details = page.getByRole("dialog", { name: "Report details" });
  await expect(details).toBeVisible();
  await expect(details.getByRole("heading", { name: "Low water pressure" })).toBeVisible();
  await expect(details).toContainText("GC-NAWEC-001");
  await details.getByRole("button", { name: "Close details" }).click();
  await expect(details).toHaveCount(0);
  await expect(page.getByText("API keys and secrets", { exact: true })).toHaveCount(0);
  await expect(page.getByText("TELEGRAM_BOT_TOKEN", { exact: true })).toHaveCount(0);
  expect(mocks.complaintQueryWasInstitutionScoped()).toBe(true);
  await sidebar.getByRole("navigation").getByRole("button", { name: "Service trends" }).click();
  await expect(page.getByRole("heading", { name: "NAWEC service trends" })).toBeVisible();
  const timeRange = page.getByRole("group", { name: "Trend time range" });
  await timeRange.getByRole("button", { name: "7 days" }).click();
  await expect(timeRange.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Complaint trend for the last 7 days" })).toBeVisible();
  await page.getByRole("button", { name: "Hide resolved reports" }).click();
  await expect(page.getByRole("button", { name: "Show resolved reports" })).toHaveAttribute("aria-pressed", "false");
  await expect(sidebar).toBeVisible();
  if (process.env.GAMCIV_DASHBOARD_SCREENSHOT === "1") {
    await page.screenshot({ path: "/tmp/gamciv-officer-sidebar-expanded.png" });
  }
  await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await sidebar.getByRole("navigation", { name: "Officer navigation" }).getByRole("button", { name: "Complaint queue" }).click();
  await expect(page.getByRole("heading", { name: "NAWEC complaint queue" })).toBeVisible();
  await expect(sidebar.getByRole("navigation").getByRole("button", { name: "Complaint queue" })).toHaveAttribute("aria-current", "location");
  if (process.env.GAMCIV_DASHBOARD_SCREENSHOT === "1") {
    await page.screenshot({ path: "/tmp/gamciv-institution-dashboard.png", fullPage: true });
  }
});

test("report details pick up a citizen photo attached after the dialog first opens", async ({ page }) => {
  const mocks = await installOfficerMocks(page, false, "in_progress", true);
  await page.goto(new URL("/dash/", dashboardOrigin).toString());
  await page.getByRole("navigation", { name: "Officer navigation" }).getByRole("button", { name: "Complaint queue" }).click();

  const queueRow = page.locator("#complaints tbody tr").filter({ hasText: "GC-NAWEC-001" });
  await queueRow.locator("td").nth(1).click();
  const details = page.getByRole("dialog", { name: "Report details" });
  await expect(details.getByText("Checking for a recently uploaded photo...")).toBeVisible();
  const photo = details.getByRole("img", { name: "Photo submitted with report GC-NAWEC-001" });
  await expect(photo).toBeVisible({ timeout: 10_000 });
  // Protected file: the URL is a PB /api/files/… URL signed with a file token.
  await expect(photo).toHaveAttribute("src", /api\/files\/complaints\/.*token=/);
  expect(mocks.detailCalls()).toBeGreaterThanOrEqual(2);
});

test("officers can accept a report, start work, and report a fix without uploading a photo", async ({ page }) => {
  const mocks = await installOfficerMocks(page, false, "received");
  await page.goto(new URL("/dash/", dashboardOrigin).toString());
  await page.getByRole("navigation", { name: "Officer navigation" }).getByRole("button", { name: "Complaint queue" }).click();

  const queueRow = page.locator("#complaints tbody tr").filter({ hasText: "GC-NAWEC-001" });
  await queueRow.locator("td").nth(1).click();
  const details = page.getByRole("dialog", { name: "Report details" });
  await expect(details.getByRole("button", { name: "Accept report" })).toBeVisible();
  await expect(details.getByLabel("Resolution photo (optional)")).toHaveCount(0);

  await details.getByRole("button", { name: "Accept report" }).click();
  await expect(details.getByRole("button", { name: "Mark in progress" })).toBeVisible();
  await expect(details.getByLabel("Resolution photo (optional)")).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Send fix for confirmation" })).toHaveCount(0);

  await details.getByRole("button", { name: "Mark in progress" }).click();
  await expect(details.getByText("In Progress", { exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Send fix for confirmation" })).toBeVisible();
  await details.getByLabel("Resolution note").fill("Power restored and service checked.");
  await details.getByRole("button", { name: "Send fix for confirmation" }).click();

  await expect(details.getByText("Fix reported", { exact: true })).toBeVisible();
  await expect(details.getByText("No resolution photo has been added.", { exact: true })).toBeVisible();
  expect(mocks.resolutionPhotoParamWasNull()).toBe(true);
});

test("officers can restart work after a citizen reopens a report", async ({ page }) => {
  const mocks = await installOfficerMocks(page, false, "reopened");
  await page.goto(new URL("/dash/", dashboardOrigin).toString());
  await page.getByRole("navigation", { name: "Officer navigation" }).getByRole("button", { name: "Complaint queue" }).click();

  const queueRow = page.locator("#complaints tbody tr").filter({ hasText: "GC-NAWEC-001" });
  await queueRow.locator("td").nth(1).click();
  const details = page.getByRole("dialog", { name: "Report details" });
  await expect(details.getByRole("button", { name: "Mark in progress" })).toBeVisible();
  await expect(details.getByRole("button", { name: "Accept report" })).toHaveCount(0);
  await details.getByRole("button", { name: "Mark in progress" }).click();

  await expect(details.getByText("In Progress", { exact: true })).toBeVisible();
  expect(mocks.reopenedReportWasRestarted()).toBe(true);
});

test("a lost connection produces a clear retry message instead of an unhandled error", async ({ page }) => {
  test.setTimeout(20_000);
  await installOfficerMocks(page, true);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(new URL("/dash/", dashboardOrigin).toString());

  const connectionAlert = page.getByRole("alert").filter({ hasText: /connection/i });
  await expect(connectionAlert).toContainText(/connection/i, { timeout: 12_000 });
  await expect(connectionAlert.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("the institution dashboard remains usable at a mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installOfficerMocks(page);
  await page.goto(new URL("/dash/", dashboardOrigin).toString());

  await expect(page.getByRole("heading", { name: "NAWEC operations overview" })).toBeVisible();
  const menuButton = page.getByRole("button", { name: "Open navigation" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  const drawer = page.getByRole("dialog", { name: "Officer navigation" });
  await expect(drawer).toBeVisible();
  if (process.env.GAMCIV_DASHBOARD_SCREENSHOT === "1") {
    await page.waitForTimeout(250);
    await page.screenshot({ path: "/tmp/gamciv-officer-drawer-mobile.png" });
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await menuButton.click();
  await expect(drawer).toBeVisible();
  const mobileNav = drawer.getByRole("navigation", { name: "Officer navigation" });
  await expect(mobileNav.getByRole("button", { name: "Dashboard" })).toBeVisible();
  await mobileNav.getByRole("button", { name: "Service trends" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "NAWEC service trends" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Complaint trend for the last 14 days" })).toBeVisible();
  await expect(page.locator("#complaints")).toHaveCount(0);
  const timeRange = page.getByRole("group", { name: "Trend time range" });
  await expect(timeRange.getByRole("button", { name: "7 days" })).toBeVisible();
  await timeRange.getByRole("button", { name: "7 days" }).click();
  await expect(timeRange.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  if (process.env.GAMCIV_DASHBOARD_SCREENSHOT === "1") {
    await page.screenshot({ path: "/tmp/gamciv-institution-dashboard-mobile.png", fullPage: true });
  }
});
