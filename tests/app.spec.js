import { expect, test } from "@playwright/test";
import { createDemoState } from "../src/data/demo-state.js";
import { LEGACY_STORAGE_KEYS } from "../src/persistence/state-storage.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), {
    key: LEGACY_STORAGE_KEYS[0],
    state: createDemoState(),
  });
});

test("root navigation opens the first page in each section", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[class*="router-link"]')).toHaveCount(0);

  await page.getByRole("link", { name: "Do", exact: true }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole("link", { name: "Work", exact: true })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Make", exact: true }).click();
  await expect(page).toHaveURL(/\/make\/printing$/);
  await expect(page.getByRole("link", { name: "Printing", exact: true })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Catalogues", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogues\/filaments$/);
  await expect(page.getByRole("link", { name: "Filaments", exact: true })).toHaveAttribute("aria-current", "page");

  await page.reload();
  await expect(page).toHaveURL(/\/catalogues\/filaments$/);
  await expect(page.getByRole("heading", { name: "Bambu Lab filament catalogue" })).toBeAttached();
});

test("hovering a root item closes another section's shortcuts and moves the highlight", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main" });
  const make = navigation.getByRole("link", { name: "Make", exact: true });
  const home = navigation.getByRole("link", { name: "Home", exact: true });
  const makeShortcuts = page.getByLabel("Make shortcuts");
  const highlightAnchor = () =>
    navigation.evaluate((nav) =>
      nav.ownerDocument.defaultView.getComputedStyle(nav, "::before").getPropertyValue("position-anchor").trim(),
    );

  await make.hover();
  await expect(makeShortcuts).toBeVisible();
  await expect(make).toHaveAttribute("aria-expanded", "true");
  expect(await highlightAnchor()).toBe("--done-nav-make");

  await home.hover();
  await expect(makeShortcuts).toBeHidden();
  await expect(make).toHaveAttribute("aria-expanded", "false");
  expect(await highlightAnchor()).toBe("--done-nav-home");
});

test("project pages have direct URLs and return to their collection", async ({ page }) => {
  await page.goto("/make/printing/p1");

  await expect(page.locator("h1")).toHaveText("Desk organiser");
  await page.getByRole("link", { name: "Back", exact: false }).click();
  await expect(page).toHaveURL(/\/make\/printing$/);
  await expect(page.getByRole("heading", { name: "3D printing projects" })).toBeAttached();
});

test("calendar navigates dates without home-specific component naming", async ({ page }) => {
  await page.goto("/?date=2026-08-26");
  await page.evaluate(() => {
    const startViewTransition = globalThis.document.startViewTransition.bind(globalThis.document);
    globalThis.__homeDashboardTransitionCount = 0;
    globalThis.document.startViewTransition = (callback) => {
      globalThis.__homeDashboardTransitionCount += 1;
      globalThis.__homeDashboardChildrenAreGrouped = [
        ...globalThis.document.querySelectorAll(".home-dashboard *"),
      ].every((element) => globalThis.getComputedStyle(element).viewTransitionName === "none");
      return startViewTransition(callback);
    };
  });
  const calendar = page.getByRole("navigation", { name: "Calendar" });

  await expect(calendar).toHaveClass("calendar");
  await expect(page.locator(".home-dashboard")).toHaveCSS("view-transition-name", "home-dashboard");
  await expect(calendar.locator('[class*="home-calendar"]')).toHaveCount(0);
  await expect(calendar.locator("button.button.button__ghost")).toHaveCount(2);
  await expect(calendar.locator("button.calendar__day:not(.button)")).toHaveCount(7);
  const calendarDays = calendar.locator(".calendar__days");
  const highlightStart = () =>
    calendarDays.evaluate((days) =>
      Number.parseFloat(
        days.ownerDocument.defaultView.getComputedStyle(days, "::before").getPropertyValue("inset-inline-start"),
      ),
    );
  const initialHighlightStart = await highlightStart();
  await expect(calendar.getByRole("button", { name: "Previous day" }).locator("svg use")).toHaveAttribute(
    "href",
    /#icon-chevron-left$/,
  );
  const nextDay = calendar.getByRole("button", { name: "Next day" });
  await expect(nextDay.locator("svg use")).toHaveAttribute("href", /#icon-chevron-right$/);
  await nextDay.click();

  await expect(page).toHaveURL(/\?date=2026-08-27$/);
  await expect(calendar.locator(".calendar__day--selected")).toHaveAttribute("aria-pressed", "true");
  await expect(calendar.locator(".calendar__day--selected strong")).toHaveText("27");
  await expect.poll(highlightStart).toBeGreaterThan(initialHighlightStart);
  expect(await page.evaluate(() => globalThis.__homeDashboardTransitionCount)).toBe(1);
  expect(await page.evaluate(() => globalThis.__homeDashboardChildrenAreGrouped)).toBe(true);
  await expect(page.locator(".home-dashboard")).not.toHaveClass(/home-dashboard--date-transitioning/);

  await calendar.locator(".calendar__day").first().hover();
  await expect.poll(highlightStart).toBeLessThan(initialHighlightStart);
});

test("search uses a native modal and includes shopping items", async ({ page }) => {
  await page.goto("/");

  const searchButton = page.getByRole("button", { name: "Search" });
  await expect(searchButton.locator("kbd")).toHaveText("/");
  await expect(searchButton.locator("svg use")).toHaveAttribute("href", /#icon-search$/);
  const iconBounds = await searchButton.locator("svg").evaluate((icon) => {
    const { width, height } = icon.getBBox();
    return { width, height };
  });
  expect(iconBounds.width).toBeGreaterThan(0);
  expect(iconBounds.height).toBeGreaterThan(0);
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Search and commands" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await searchButton.click();
  await dialog.getByRole("searchbox").fill("Oat milk");
  await dialog.getByRole("button", { name: /Oat milk/ }).click();
  await expect(page).toHaveURL(/\/buy$/);
  await expect(dialog).toBeHidden();
});

test("slash remains available while typing in an editable field", async ({ page }) => {
  await page.goto("/catalogues/filaments");
  const catalogueSearch = page.getByRole("searchbox", { name: "Search" });

  await catalogueSearch.focus();
  await page.keyboard.press("/");

  await expect(catalogueSearch).toHaveValue("/");
  await expect(page.getByRole("dialog", { name: "Search and commands" })).toBeHidden();
});

test("home tasks remain visible, move to the end, and strike through when checked", async ({ page }) => {
  await page.goto("/");
  const workCard = page.locator(".home-task-card").filter({ has: page.getByRole("heading", { name: "Work" }) });
  const task = workCard.getByRole("button", { name: "Review browser API proposal" });

  await task.click();

  await expect(task).toHaveAttribute("aria-pressed", "true");
  await expect(task.locator("strong")).toHaveCSS("text-decoration-line", "line-through");
  await expect(workCard.locator(".home-task-row").last()).toContainText("Review browser API proposal");
});

test("pressing Enter in a work task creates one disposable blank row", async ({ page }) => {
  await page.goto("/work");
  const titles = page.getByRole("textbox", { name: "Work task title" });
  const initialCount = await titles.count();

  await page.getByRole("button", { name: /New work task/ }).click();
  const focusedTitle = page.locator('input[aria-label="Work task title"]:focus');
  await expect(focusedTitle).toBeVisible();
  await focusedTitle.fill("Write regression tests");
  await focusedTitle.press("Enter");

  await expect(titles).toHaveCount(initialCount + 2);
  await expect(page.locator('input[aria-label="Work task title"]:focus')).toHaveValue("");
  await page.locator(".section-label h2").first().click();
  await expect(titles).toHaveCount(initialCount + 1);
  expect(await titles.evaluateAll((inputs) => inputs.map((input) => input.value))).toContain("Write regression tests");
});

test("catalogue search filters rows and stock is editable in place", async ({ page }) => {
  await page.goto("/catalogues/filaments");
  await page.getByRole("searchbox", { name: "Search" }).fill("PA6-CF");

  const rows = page.locator(".catalog-palette article");
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  expect((await rows.allTextContents()).every((text) => text.includes("PA6-CF"))).toBe(true);

  const firstRow = rows.first();
  const stock = firstRow.getByRole("spinbutton");
  await expect(stock).toHaveValue("0");
  await firstRow.getByRole("button", { name: /Add one spools/ }).click();
  await expect(stock).toHaveValue("1");
});
