import type { Page } from "@playwright/test";

/**
 * A JWT-shaped PocketBase auth token with a far-future `exp`. The SDK's
 * authStore.isValid = !isTokenExpired(token), so the mocked token must
 * actually parse as a JWT — a plain string reads as an expired session.
 */
export const TEST_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDMwMSIsInR5cGUiOiJhdXRoIiwiY29sbGVjdGlvbklkIjoiX3BiX3VzZXJzX2F1dGhfIiwiZXhwIjo5OTk5OTk5OTk5fQ.test-signature";

export type TestRecord = {
  id: string;
  email: string;
  verified?: boolean;
  role?: "citizen" | "officer" | "admin";
  full_name?: string;
  phone_verified?: boolean;
  institution?: string;
  created?: string;
  updated?: string;
};

/**
 * Seed the real PocketBase session ({token, record} under "pocketbase_auth")
 * before any app script runs, and answer the SDK's native auth-refresh call
 * (POST /api/collections/users/auth-refresh) that useSession makes on mount
 * — an unanswered refresh clears the store and drops the user at /login.
 */
export async function seedPocketBaseSession(page: Page, record: TestRecord): Promise<void> {
  await page.addInitScript(
    ({ token, rec }) => {
      window.localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record: rec }));
    },
    { token: TEST_TOKEN, rec: record },
  );
  await page.route("**/api/collections/users/auth-refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: TEST_TOKEN, record }),
    });
  });
}
