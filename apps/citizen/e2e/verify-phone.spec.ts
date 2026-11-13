import { expect, test } from "@playwright/test";
import { seedPocketBaseSession, type TestRecord } from "./pb-session";

// Phone verification against the app's own server routes (phone-otp.pb.js):
//  POST /api/gamfix/phone-otp/send   { phone }  → { sent: true, ... }
//  POST /api/gamfix/phone-otp/verify { phone, code }
// The session is the real PocketBase authStore shape (see pb-session.ts);
// getProfile() then reads the record via GET /api/collections/users/records/{id}.

const USER_ID = "00000000-0000-4000-8000-000000000301";

const userRecord: TestRecord = {
  id: USER_ID,
  email: "citizen@example.invalid",
  verified: true,
  role: "citizen",
  full_name: "Test Citizen",
  phone_verified: false,
  created: "2026-10-20T00:00:00.000Z",
  updated: "2026-10-20T00:00:00.000Z",
};

test("requesting a new WhatsApp code clears the previously entered code", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await seedPocketBaseSession(page, userRecord);

  await page.route("**/api/collections/users/records/" + USER_ID, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(userRecord),
    });
  });

  const sendPhones: string[] = [];
  await page.route("**/api/gamfix/phone-otp/send", async (route) => {
    const body = route.request().postDataJSON() as { phone?: string };
    sendPhones.push(body.phone ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sent: true, message: "We sent a verification code to your WhatsApp." }),
    });
  });

  await page.goto("/verify/phone");
  await expect(page.getByText("Verify your phone", { exact: true })).toBeVisible();
  await page.getByLabel("Phone number").fill("7123456");
  const sendButton = page.getByRole("button", { name: "Send code on WhatsApp" });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  const codeInput = page.getByLabel("6-digit WhatsApp code");
  await expect(codeInput).toBeVisible();
  await codeInput.fill("123456");
  const resendButton = page.getByRole("button", { name: "Resend code", exact: true });
  await expect(resendButton).toBeEnabled({ timeout: 70_000 });
  await resendButton.click();

  await expect(codeInput).toHaveValue("");
  expect(sendPhones).toEqual(["2207123456", "2207123456"]);
});

test("the send route's rejection is surfaced as a readable message", async ({ page }) => {
  await seedPocketBaseSession(page, userRecord);

  await page.route("**/api/collections/users/records/" + USER_ID, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(userRecord),
    });
  });
  await page.route("**/api/gamfix/phone-otp/send", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "Too many codes requested. Please wait before trying again." }),
    });
  });

  await page.goto("/verify/phone");
  await page.getByLabel("Phone number").fill("7123456");
  await page.getByRole("button", { name: "Send code on WhatsApp" }).click();

  await expect(page.getByRole("alert")).toContainText(/too many/i);
  await expect(page.getByLabel("6-digit WhatsApp code")).toHaveCount(0);
});
