import { expect, test } from "@playwright/test";

test("the root page is the empty three-day calendar", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Calendar — Done-ish");
  await expect(page).toHaveURL(/\/#date=\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator(".week-day")).toHaveCount(3);
  await expect(page.locator(".week-day--today")).toHaveCount(1);
  await expect(page.locator(".week-task")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  const hashedVueAttributes = await page
    .locator("*")
    .evaluateAll((elements) =>
      elements.flatMap((element) => element.getAttributeNames()).filter((name) => /^data-v-[\da-f]+$/i.test(name)),
    );
  expect(hashedVueAttributes).toEqual([]);
});

test("the calendar navigates in three-day ranges", async ({ page }) => {
  await page.goto("/#date=2026-08-27");

  await expect(page.locator(".week-day__heading")).toHaveCount(3);
  expect(await page.locator(".week-day__heading").evaluateAll((days) => days.map((day) => day.dateTime))).toEqual([
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
  ]);

  await page.getByRole("button", { name: "Next three days" }).click();
  await expect(page).toHaveURL(/\/#date=2026-08-30$/);
  await expect(page.locator(".week-day__heading").first()).toHaveAttribute("datetime", "2026-08-29");

  await page.getByRole("button", { name: "Previous three days" }).click();
  await expect(page).toHaveURL(/\/#date=2026-08-27$/);
});

test("removed application routes return to the calendar", async ({ page }) => {
  await page.goto("/todos");

  await expect(page).toHaveURL(/\/#date=\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator(".calendar-experiment")).toBeVisible();
});
