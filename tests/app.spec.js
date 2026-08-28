import { expect, test } from "@playwright/test";

test("the root page is the empty three-day work calendar", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Work — Done-ish");
  expect(new URL(page.url()).hash).toBe("");
  expect(new URL(page.url()).search).toBe("");
  const header = page.locator("#app > .jm-header");
  await expect(header).toBeVisible();
  await expect(header.getByRole("link", { name: "ToDo-ish, Work" })).toBeVisible();
  const searchButton = header.getByRole("button", { name: "Search" });
  const profileButton = header.getByRole("button", { name: "Profile" });
  await expect(header.locator(".jm-button")).toHaveCount(2);
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
  await expect(navigation.getByRole("link")).toHaveCount(7);
  await expect(navigation.locator('[aria-disabled="true"], .jm-navigation__link--disabled')).toHaveCount(0);
  await expect(page.locator(".week-day")).toHaveCount(3);
  await expect(page.locator(".week-day--today")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Work" })).toHaveCount(1);
  await expect(page.locator(".week-task")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  const hashedVueAttributes = await page
    .locator("*")
    .evaluateAll((elements) =>
      elements.flatMap((element) => element.getAttributeNames()).filter((name) => /^data-v-[\da-f]+$/i.test(name)),
    );
  expect(hashedVueAttributes).toEqual([]);
});

test("navigation and profile open placeholder pages", async ({ page }) => {
  const destinations = [
    { label: "Chores", path: "/chores" },
    { label: "Todo lists", path: "/todos" },
    { label: "Shopping cart", path: "/shopping" },
    { label: "3D printing", path: "/printing" },
    { label: "Cross stitch", path: "/cross-stitch" },
    { label: "Catalog", path: "/catalog" },
  ];

  await page.goto("/");

  for (const { label, path } of destinations) {
    const link = page.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    await expect(page).toHaveTitle(`${label} — Done-ish`);
    await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: "Profile" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/profile");
  await expect(page).toHaveTitle("Profile — Done-ish");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
});

test("the work page navigates in three-day ranges", async ({ page }) => {
  await page.goto("/?date=2000-01-02");

  await expect(page.locator(".week-day__heading")).toHaveCount(3);
  expect(await page.locator(".week-day__heading").evaluateAll((days) => days.map((day) => day.dateTime))).toEqual([
    "2000-01-01",
    "2000-01-02",
    "2000-01-03",
  ]);

  const nextButton = page.getByRole("button", { name: "Next three days" });
  const previousButton = page.getByRole("button", { name: "Previous three days" });
  await expect(page.getByRole("button", { name: "Today" })).toHaveClass(/jm-button/);
  await expect(nextButton).toHaveClass(/jm-button/);
  await expect(previousButton).toHaveClass(/jm-button/);
  await expect(nextButton.locator("use")).toHaveAttribute("href", /#icon-arrow-right$/);
  await expect(previousButton.locator("use")).toHaveAttribute("href", /#icon-arrow-left$/);

  await nextButton.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe("2000-01-05");
  await expect(page.locator(".week-day__heading").first()).toHaveAttribute("datetime", "2000-01-04");

  await previousButton.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe("2000-01-02");

  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).searchParams.get("date")).toBe("2000-01-02");
  expect(new URL(page.url()).hash).toBe("#main-content");
  await expect(page.locator(".week-day__heading").first()).toHaveAttribute("datetime", "2000-01-01");
});

test("work statuses are saved by date and update today's navigation icon", async ({ page }) => {
  await page.goto("/");

  const statusSelect = page.getByRole("combobox", { name: /^Status for / });
  const workNavigationIcon = page.getByRole("link", { name: "Work" }).locator("use");

  await statusSelect.selectOption("pto");
  await expect(workNavigationIcon).toHaveAttribute("href", /#icon-pto$/);

  await page.reload();
  await expect(statusSelect).toHaveValue("pto");
  await expect(workNavigationIcon).toHaveAttribute("href", /#icon-pto$/);

  await page.goto("/?date=2000-01-03");
  await statusSelect.selectOption("conference");
  await expect(workNavigationIcon).toHaveAttribute("href", /#icon-pto$/);

  await page.reload();
  await expect(statusSelect).toHaveValue("conference");

  await page.getByRole("button", { name: "Today" }).click();
  await expect(statusSelect).toHaveValue("pto");
});

test("work entry points return the calendar to today without a date query", async ({ page }) => {
  const expectTodayWithoutDateQuery = async () => {
    await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBeNull();
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect(page.locator(".week-day--today")).toHaveCount(1);
  };

  await page.goto("/?date=2000-01-02");
  await page.getByRole("button", { name: "Today" }).click();
  await expectTodayWithoutDateQuery();

  await page.goto("/?date=2000-01-02");
  await page.getByRole("link", { name: "ToDo-ish, Work" }).click();
  await expectTodayWithoutDateQuery();

  await page.goto("/?date=2000-01-02");
  await page.getByRole("link", { name: "Work", exact: true }).click();
  await expectTodayWithoutDateQuery();

  await page.goto("/?date=not-a-date");
  await expectTodayWithoutDateQuery();
});

test("unknown application routes return to work", async ({ page }) => {
  await page.goto("/unknown-page");

  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator(".calendar")).toBeVisible();
});
