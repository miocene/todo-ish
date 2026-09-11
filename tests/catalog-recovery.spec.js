import { test, expect } from "./app-fixture.js";

test("catalog failures stay local and retry independently without blocking task pages", async ({
  page,
}) => {
  let filamentRequests = 0;
  let fail = true;
  await page.route("**/api/catalogs/filaments?*", (route) => {
    filamentRequests++;
    return fail
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.fallback();
  });
  await page.goto("/work");
  await expect(page.locator(".jm-card:not(.work-backlog)")).toBeVisible();
  expect(filamentRequests).toBe(0);
  await page.getByRole("link", { name: "Catalog", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry filament catalog" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "DMC embroidery floss" }).click();
  await expect(page.locator(".jm-catalog-item").first()).toBeVisible();
  await page.getByRole("link", { name: "3D printing filament" }).click();
  await expect(
    page.getByRole("button", { name: "Retry filament catalog" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry filament catalog" }).click();
  await expect(page.locator(".jm-catalog-item").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry filament catalog" }),
  ).toHaveCount(0);
  const requestsAfterLoad = filamentRequests;
  await page.getByRole("link", { name: "Work", exact: true }).click();
  await page.getByRole("link", { name: "Catalog", exact: true }).click();
  await expect(page.locator(".jm-catalog-item").first()).toBeVisible();
  expect(filamentRequests).toBe(requestsAfterLoad);
});
