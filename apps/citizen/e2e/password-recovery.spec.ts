import { expect, test } from "@playwright/test";

// PocketBase's NATIVE password reset (docs: Authentication → Sending emails):
//  1. /forgot-password calls pb.collection('users').requestPasswordReset(email)
//     → POST /api/collections/users/request-password-reset (204, empty body).
//     PocketBase emails the collection's default reset template, whose link
//     points at /reset-password?token=….
//  2. That page calls confirmPasswordReset(token, password, passwordConfirm)
//     → POST /api/collections/users/confirm-password-reset (204).
// No custom OTP routes are involved anymore.

const testEmail = "reset-test@example.com";
const resetToken = "e2e-reset-token";

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(`${viewport.name} password recovery`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("forgot-password page starts with an email field", async ({ page }) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));

      await page.goto("/forgot-password", { waitUntil: "load" });
      await expect(page.getByRole("heading", { name: "Forgot your password?" }))
        .toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByRole("button", { name: "Send reset link" }))
        .toBeVisible();
      await expect(page.locator("input[type=password]")).toHaveCount(0);
      expect(runtimeErrors).toEqual([]);
    });

    test("reset-password without a token goes back to the request step", async ({ page }) => {
      await page.goto("/reset-password", { waitUntil: "load" });
      await expect(page).toHaveURL(/\/forgot-password$/);
      await expect(
        page.getByRole("heading", { name: "Forgot your password?" }),
      ).toBeVisible();
    });
  });
}

test("requesting a reset calls the native request-password-reset endpoint", async ({ page }) => {
  let resetRequest: Record<string, unknown> | null = null;
  await page.route("**/api/collections/users/request-password-reset", async (route) => {
    resetRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(testEmail);
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(
    page.getByText(`We sent a password reset link to ${testEmail}`),
  ).toBeVisible();
  expect(resetRequest).toMatchObject({ email: testEmail });

  // PocketBase enforces a 2-minute cooldown between reset emails; the page
  // mirrors it by disabling the resend button while it counts down.
  const resend = page.getByRole("button", { name: /Resend email available in/ });
  await expect(resend).toBeDisabled();
});

test("the emailed reset link token unlocks the new-password step", async ({ page }) => {
  let confirmRequest: Record<string, unknown> | null = null;
  await page.route("**/api/collections/users/confirm-password-reset", async (route) => {
    confirmRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto(`/reset-password?token=${resetToken}`);
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("NewPassword123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("NewPassword123");
  await page.getByRole("button", { name: "Update password" }).click();

  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  await expect(
    page.getByText("Your password has been changed. Sign in with your new password."),
  ).toBeVisible();
  expect(confirmRequest).toMatchObject({
    token: resetToken,
    password: "NewPassword123",
    passwordConfirm: "NewPassword123",
  });
});

test("a rejected reset token surfaces the server's message", async ({ page }) => {
  await page.route("**/api/collections/users/confirm-password-reset", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        status: 400,
        message: "Invalid or expired token.",
        data: {},
      }),
    });
  });

  await page.goto(`/reset-password?token=${resetToken}`);
  await page.getByLabel("New password", { exact: true }).fill("NewPassword123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("NewPassword123");
  await page.getByRole("button", { name: "Update password" }).click();

  await expect(page.getByRole("alert")).toContainText(/invalid or expired/i);
  await expect(
    page.getByRole("heading", { name: "Password updated" }),
  ).toHaveCount(0);
});
