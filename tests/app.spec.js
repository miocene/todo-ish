import { expect, test } from "@playwright/test";

test("the root page is the empty three-day work calendar", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Work — Done-ish");
  await expect(page).toHaveURL(/\/#date=\d{4}-\d{2}-\d{2}$/);
  const header = page.locator("#app > .jm-header");
  await expect(header).toBeVisible();
  await expect(header.getByRole("link", { name: "ToDo-ish, Work" })).toBeVisible();
  const searchButton = header.getByRole("button", { name: "Search" });
  const profileButton = header.getByRole("button", { name: "Profile" });
  await expect(searchButton).toBeVisible();
  await expect(searchButton.locator("use")).toHaveAttribute("href", /#icon-search$/);
  await expect(profileButton).toBeVisible();
  await expect(profileButton.locator("use")).toHaveAttribute("href", /#icon-user$/);
  const navigation = page.locator("#app > .jm-navigation");
  await expect(navigation).toBeVisible();
  await expect(navigation.locator(".jm-navigation__item")).toHaveText([
    "Work",
    "Chores",
    "Todo lists",
    "Shopping cart",
    "3D printing",
    "Cross stitch",
    "Catalog",
  ]);
  await expect(navigation.locator(".jm-navigation__label")).toHaveCount(7);
  expect(await navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(
    await navigation
      .locator("use")
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute("href").split("#").at(-1))),
  ).toEqual(["icon-work", "icon-chores", "icon-todo", "icon-shopping", "icon-printer", "icon-yarn", "icon-catalog"]);
  await expect(navigation.getByRole("link", { name: "Work" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-disabled="true"]')).toHaveCount(6);
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

test("the work page navigates in three-day ranges", async ({ page }) => {
  await page.goto("/#date=2026-08-27");

  await expect(page.locator(".week-day__heading")).toHaveCount(3);
  expect(await page.locator(".week-day__heading").evaluateAll((days) => days.map((day) => day.dateTime))).toEqual([
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
  ]);

  const nextButton = page.getByRole("button", { name: "Next three days" });
  const previousButton = page.getByRole("button", { name: "Previous three days" });
  await expect(nextButton.locator("use")).toHaveAttribute("href", /#icon-arrow-right$/);
  await expect(previousButton.locator("use")).toHaveAttribute("href", /#icon-arrow-left$/);

  await nextButton.click();
  await expect(page).toHaveURL(/\/#date=2026-08-30$/);
  await expect(page.locator(".week-day__heading").first()).toHaveAttribute("datetime", "2026-08-29");

  await previousButton.click();
  await expect(page).toHaveURL(/\/#date=2026-08-27$/);
});

test("removed application routes return to work", async ({ page }) => {
  await page.goto("/todos");

  await expect(page).toHaveURL(/\/#date=\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator(".calendar-experiment")).toBeVisible();
});
