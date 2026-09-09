import { test, expect } from "./app-fixture.js";

test("profile popover exposes account actions and Activity, with native dismissal", async ({ page }) => {
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Profile", exact: true });
  const menu = page.locator(".jm-header__profile-menu");
  await expect(menu).not.toBeVisible();
  await trigger.click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(menu.getByRole("button", { name: "Add passkey" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(menu).not.toBeVisible();
  await expect(page.locator("main").getByRole("button", { name: /Add passkey|Sign out/ })).toHaveCount(0);
  await trigger.click();
  await page.getByRole("heading", { name: "Profile", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await trigger.click();
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});

test("account action failures are shown in the popover and controls recover", async ({ page }) => {
  await page.route("**/api/auth/registration/options", (route) =>
    route.fulfill({ status: 503, json: { error: "Passkey unavailable" } }),
  );
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const menu = page.locator(".jm-header__profile-menu");
  await menu.getByRole("button", { name: "Add passkey" }).click();
  await expect(menu.getByRole("status")).toHaveText("Passkey unavailable");
  await expect(menu.getByRole("button", { name: "Add passkey" })).toBeEnabled();
  await page.route("**/api/auth/session", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 503, json: { error: "Sign out unavailable" } })
      : route.fallback(),
  );
  await menu.getByRole("button", { name: "Sign out" }).click();
  await expect(menu.getByRole("status")).toHaveText("Sign out unavailable");
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeEnabled();
  await expect(page).toHaveURL(/\/work$/);
});
