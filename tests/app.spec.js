import { expect, test } from "@playwright/test";

function localIsoDate(dayOffset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test("the root page is the three-day work calendar", async ({ page }) => {
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
  const taskTitles = page.locator(".week-day .task-item__title");
  await expect(taskTitles).toHaveCount(7);
  expect(
    await taskTitles.evaluateAll((elements) =>
      elements.map((element) => (element.localName === "textarea" ? element.value : element.textContent)),
    ),
  ).toEqual([
    "Triage inbox",
    "Prepare the quarterly planning notes",
    "Daily stand-up",
    "Review pull requests",
    "Pair on calendar navigation",
    "Update the team roadmap",
    "Document the release process and share it with the team",
  ]);
  await expect(page.locator(".week-day").first().locator(".task-item")).toHaveCount(0);
  await expect(page.locator(".week-day--today .task-item")).toHaveCount(6);
  await expect(page.getByRole("checkbox", { name: /^Complete / })).toHaveCount(7);
  expect(await page.evaluate(() => localStorage.getItem("done-ish.work-statuses.v1"))).toBeNull();

  const hashedVueAttributes = await page
    .locator("*")
    .evaluateAll((elements) =>
      elements.flatMap((element) => element.getAttributeNames()).filter((name) => /^data-v-[\da-f]+$/i.test(name)),
    );
  expect(hashedVueAttributes).toEqual([]);
});

test("editable work tasks create and focus the next item with Enter", async ({ page }) => {
  await page.goto("/");

  const today = page.locator(".week-day--today");
  const todayTitles = today.locator("textarea.task-item__title");
  const lastTitle = todayTitles.last();

  await lastTitle.fill("Updated roadmap");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("done-ish.work-tasks.v1")).some((task) => task.title === "Updated roadmap"),
    ),
  ).toBe(true);
  await lastTitle.press("Enter");
  await expect(todayTitles).toHaveCount(7);
  await expect(todayTitles.last()).toBeFocused();

  await todayTitles.last().fill("Plan tomorrow");
  await todayTitles.last().press("Enter");
  await expect(todayTitles).toHaveCount(8);
  await expect(todayTitles.last()).toBeFocused();

  const firstTitle = todayTitles.first();
  await firstTitle.press("Enter");
  await expect(todayTitles.nth(1)).toBeFocused();

  const futureTitles = page.locator(".week-day").last().locator("textarea.task-item__title");
  await futureTitles.last().press("Enter");
  await expect(futureTitles).toHaveCount(2);
  await expect(futureTitles.last()).toBeFocused();

  await today.locator(".task-item__pin").first().click();
  const backlogTitles = page.locator(".backlog textarea.task-item__title");
  await expect(backlogTitles).toHaveCount(1);
  await backlogTitles.last().press("Enter");
  await expect(backlogTitles).toHaveCount(2);
  await expect(backlogTitles.last()).toBeFocused();

  await page.reload();
  await expect(page.locator(".week-day--today textarea.task-item__title")).toHaveCount(6);
  await expect(page.locator(".week-day").last().locator("textarea.task-item__title")).toHaveCount(1);
  await expect(page.locator(".backlog textarea.task-item__title")).toHaveCount(1);
});

test("the backlog add button creates, focuses, and saves a task", async ({ page }) => {
  await page.goto("/");

  const addBacklogTask = page.getByRole("button", { name: "Add backlog task" });
  await addBacklogTask.click();
  const backlogTitle = page.locator(".backlog textarea.task-item__title");
  await expect(backlogTitle).toHaveCount(1);
  await expect(backlogTitle).toBeFocused();
  await page.getByRole("button", { name: "Today", exact: true }).focus();
  await expect(backlogTitle).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("done-ish.work-tasks.v1")).every((task) => task.title.trim()),
    ),
  ).toBe(true);

  await addBacklogTask.click();
  await backlogTitle.fill("Plan the next sprint");

  await page.reload();
  await expect(page.locator(".backlog textarea.task-item__title")).toHaveValue("Plan the next sprint");
});

test("task completion persists and unfinished tasks roll into today", async ({ page }) => {
  const testTime = Date.now();
  await page.clock.install({ time: testTime });
  await page.goto("/");
  await page.clock.pauseAt(testTime + 60_000);

  const today = page.locator(".week-day--today");
  await expect(today.locator(".task-item")).toHaveCount(6);
  await expect(page.locator(".week-day").first().locator(".task-item")).toHaveCount(0);

  await today.getByRole("button", { name: "Move Triage inbox to backlog" }).click();
  const backlogCheckbox = page.locator(".backlog").getByRole("checkbox", { name: "Complete Triage inbox" });
  await backlogCheckbox.click();
  await expect(backlogCheckbox).toHaveCount(0);

  const todayCheckbox = today.getByRole("checkbox", { name: "Complete Triage inbox" });
  await expect(todayCheckbox).toBeChecked();
  const completedTask = todayCheckbox.locator("xpath=..");
  await expect(completedTask).toHaveClass(/task-item--completed/);
  await expect(today.getByRole("button", { name: "Move Triage inbox to backlog" })).toHaveCount(0);
  await completedTask.locator(".task-item__drag-handle").dragTo(page.locator(".backlog"));
  await expect(page.locator(".backlog").getByRole("checkbox", { name: "Complete Triage inbox" })).toHaveCount(0);
  await expect(todayCheckbox).toBeChecked();
  const todayTitles = today.locator(".task-item__title");
  await expect(todayTitles.first()).toHaveValue("Triage inbox");
  await page.clock.runFor(499);
  await expect(todayTitles.first()).toHaveValue("Triage inbox");
  await page.clock.runFor(1);
  await expect(todayTitles.last()).toHaveValue("Triage inbox");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("done-ish.work-tasks.v1")).some(
        (task) => task.title === "Triage inbox" && Boolean(task.checkedAt),
      ),
    ),
  ).toBe(true);

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Complete Triage inbox" })).toBeChecked();
});

test("navigation opens application pages", async ({ page }) => {
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

test("task pages render their variants and save changes immediately", async ({ page }) => {
  await page.goto("/chores");

  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Today and upcoming", "All chores"]);
  const upcomingChores = page.locator(".chores-upcoming .task-item");
  const allChores = page.locator(".chores-all .task-item");
  await expect(upcomingChores).toHaveCount(3);
  await expect(allChores).toHaveCount(3);
  await expect(upcomingChores.getByRole("checkbox")).toHaveCount(3);
  await expect(allChores.getByRole("checkbox")).toHaveCount(0);
  expect(await allChores.locator(".chore-rule").evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual([
    "Every Saturday",
    "Every 2 weeks on Sunday",
    "Every Wednesday",
  ]);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin, .task-item__remove")).toHaveCount(0);
  await page.getByRole("button", { name: "Add chore" }).click();
  await expect(allChores).toHaveCount(4);
  await expect(upcomingChores).toHaveCount(3);
  await page.getByRole("button", { name: "Add chore" }).focus();
  await expect(allChores).toHaveCount(3);
  await allChores.first().locator("textarea").fill("Water all the plants");
  await allChores.first().locator(".chore-rule").fill("Every other Saturday");
  await upcomingChores.getByRole("checkbox", { name: "Complete Water all the plants" }).check();
  await page.reload();
  await expect(page.locator(".chores-all textarea").first()).toHaveValue("Water all the plants");
  await expect(page.locator(".chores-all .chore-rule").first()).toHaveValue("Every other Saturday");
  await expect(page.getByRole("checkbox", { name: "Complete Water all the plants" })).toBeChecked();

  await page.goto("/todos");
  const listTabs = page.locator(".task-tabs__link");
  await expect(listTabs).toHaveText(["General", "Home", "Travel"]);
  await expect(listTabs.first()).toHaveAttribute("aria-current", "page");
  await listTabs.getByText("Home", { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("list")).toBe("home");
  await expect(page.getByRole("heading", { level: 2, name: "Home" })).toBeVisible();
  const homeTasks = page.locator(".task-page__section textarea.task-item__title");
  await homeTasks.last().press("Enter");
  await expect(homeTasks).toHaveCount(3);
  await expect(homeTasks.last()).toBeFocused();
  await page.locator(".task-tabs__link--active").focus();
  await expect(homeTasks).toHaveCount(2);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin")).toHaveCount(0);

  await page.goto("/shopping");
  await expect(page.locator(".task-item__remove")).toHaveCount(5);
  expect(await page.getByLabel("Task title").evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual([
    "Oat milk",
    "Apples",
    "Dish soap",
  ]);
  const petgShoppingLink = page.getByRole("link", { name: /PETG Basic · Charcoal filament · 1 spool/ });
  const blueShoppingLink = page.getByRole("link", { name: /PLA Basic · Blue filament · 1 spool/ });
  await expect(petgShoppingLink).toHaveAttribute("href", /eu\.store\.bambulab\.com\/search\?q=PETG/);
  await expect(blueShoppingLink).toHaveAttribute("href", "https://eu.store.bambulab.com/products/pla-basic-filament");
  await expect(blueShoppingLink).toHaveAttribute("target", "_blank");
  await expect(blueShoppingLink).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("checkbox", { name: "Complete PLA Basic · Blue filament · 1 spool" }).check();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/catalog");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("bambu-pla-basic-filament-10601");
  await expect(page.getByLabel("Search filaments")).toHaveValue("bambu-pla-basic-filament-10601");
  await expect(page.getByLabel("Filament type")).toHaveValue("");

  await page.goto("/shopping");
  await expect(page.locator(".task-item__remove").first().locator("use")).toHaveAttribute("href", /#icon-remove$/);
  await page.getByRole("button", { name: "Remove Oat milk from shopping list" }).click();
  await expect(page.locator(".task-page__tasks .task-item")).toHaveCount(4);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator(".task-page__tasks .task-item")).toHaveCount(5);
  await page.getByRole("button", { name: "Add item" }).focus();
  await expect(page.locator(".task-page__tasks .task-item")).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveCount(2);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin")).toHaveCount(0);

  await page.goto("/printing");
  const projects = page.locator(".project-card");
  await expect(projects).toHaveCount(2);
  await expect(projects.getByRole("heading", { level: 2 })).toHaveText(["Desk cable clips", "Miniature planter"]);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin, .task-item__remove")).toHaveCount(0);
  await expect(projects.first().getByLabel("Project color")).toHaveValue("#446e5c");
  await expect(projects.first().getByLabel(/^Filament \d+$/)).toHaveCount(4);
  expect(
    await projects
      .first()
      .getByLabel(/^Weight \d+$/)
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["12", "1002", "2", "8"]);
  await expect(projects.first().locator(".printing-filament--missing")).toHaveCount(2);
  await expect(projects.first().getByText("Not in catalog · Need 1 spool")).toBeVisible();
  await expect(projects.first().getByText("Missing 1 spool · 1 owned")).toBeVisible();
  await projects.first().getByRole("button", { name: "Add item" }).click();
  await expect(projects.first().locator("textarea.task-item__title")).toHaveCount(4);
  await expect(projects.first().locator("textarea.task-item__title").last()).toBeFocused();
  await projects.first().getByRole("button", { name: "Add item" }).focus();
  await expect(projects.first().locator("textarea.task-item__title")).toHaveCount(3);

  await page.getByRole("button", { name: "Add project" }).click();
  await expect(projects).toHaveCount(3);
  const newProject = projects.last();
  await expect(newProject.getByLabel("Project title")).toBeFocused();
  await newProject.getByLabel("Project title").fill("Headphone stand");
  await newProject.getByLabel("Project color").fill("#704f8a");
  await newProject.getByRole("button", { name: "Add item" }).click();
  await newProject.getByLabel("Item name").fill("Weighted base");
  await newProject.getByLabel("Filament 1", { exact: true }).selectOption("bambu-pla-basic-filament-10101");
  await newProject.getByLabel("Weight 1", { exact: true }).fill("35");
  await newProject.getByRole("button", { name: "Add filament" }).click();
  await expect(newProject.getByLabel("Filament 2", { exact: true })).toBeFocused();
  await newProject.getByLabel("Filament 2", { exact: true }).selectOption("bambu-pla-basic-filament-10501");
  await newProject.getByLabel("Weight 2", { exact: true }).fill("7.5");
  await page.reload();
  const savedProject = page.locator(".project-card").last();
  await expect(savedProject.getByLabel("Project title")).toHaveValue("Headphone stand");
  await expect(savedProject.getByLabel("Project color")).toHaveValue("#704f8a");
  await expect(savedProject.getByLabel("Item name")).toHaveValue("Weighted base");
  expect(
    await savedProject.getByLabel(/^Filament \d+$/).evaluateAll((selects) => selects.map((select) => select.value)),
  ).toEqual(["bambu-pla-basic-filament-10101", "bambu-pla-basic-filament-10501"]);
  expect(
    await savedProject.getByLabel(/^Weight \d+$/).evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["35", "7.5"]);

  await page.goto("/cross-stitch");
  await expect(page.getByRole("heading", { level: 1, name: "Cross stitch" })).toBeVisible();
  await expect(page.locator(".project-card").getByRole("heading", { level: 2 })).toHaveText([
    "Botanical sampler",
    "Amsterdam canal house",
  ]);

  await page.goto("/catalog");
  await expect(page.locator(".filament-card")).toHaveCount(265);
  await expect(page.getByText("265 filaments", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Filament type")).toHaveValue("");
  const catalogGroups = await page
    .locator(".filament-card")
    .evaluateAll((cards) => cards.map((card) => card.dataset.catalogGroup));
  expect(catalogGroups).toEqual(
    [...catalogGroups].sort(
      (first, second) => ["owned", "needed", "other"].indexOf(first) - ["owned", "needed", "other"].indexOf(second),
    ),
  );
  await page.getByLabel("Filament type").selectOption("PLA Basic");
  await expect(page.locator(".filament-card")).toHaveCount(30);
  await page.getByLabel("Filament type").selectOption("");
  await page.getByLabel("Search filaments").fill("bambu-pla-basic-filament-10601");
  await expect(page.locator(".filament-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "PLA Basic · Blue" })).toBeVisible();
  await expect(page.getByRole("link", { name: /PLA Basic · Blue/ })).toHaveAttribute(
    "href",
    "https://eu.store.bambulab.com/products/pla-basic-filament",
  );
  await expect(page.getByText("Required 1002 g · 2 spools")).toBeVisible();
  await expect(page.getByText("Missing 1 spool", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Spools owned")).toHaveValue("1");
  await page.getByLabel("Spools owned").fill("2");
  await expect(page.locator(".filament-card--missing")).toHaveCount(0);

  await page.goto("/printing");
  await expect(page.locator(".printing-filament--missing")).toHaveCount(1);
  await expect(page.getByText("Missing 1 spool · 1 owned")).toHaveCount(0);
  await page.goto("/shopping");
  expect(await page.getByLabel("Task title").evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual([
    "Apples",
    "Dish soap",
  ]);
  await expect(page.getByRole("link", { name: /PETG Basic · Charcoal filament · 1 spool/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /PLA Basic · Blue filament/ })).toHaveCount(0);

  await page.goto("/catalog");
  await page.getByLabel("Search filaments").fill("discontinued-petg-charcoal");
  await expect(page.locator(".filament-card")).toHaveCount(0);
  await expect(page.getByText("No catalog filaments match this search.")).toBeVisible();
});

test("completed items move to the bottom after 500 milliseconds on every task page", async ({ page }) => {
  const testTime = Date.now();
  await page.clock.install({ time: testTime });
  await page.goto("/todos");
  await page.clock.pauseAt(testTime + 60_000);

  const todoTitles = page.locator(".task-page__section textarea.task-item__title");
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.clock.runFor(499);
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.clock.runFor(1);
  await expect(todoTitles.last()).toHaveValue("Renew passport");

  await page.reload();
  await expect(page.locator(".task-page__section textarea.task-item__title").last()).toHaveValue("Renew passport");
  await expect(page.getByRole("checkbox", { name: "Complete Renew passport" })).toBeChecked();

  await page.goto("/chores");
  const choreTitles = page.locator(".chores-upcoming .task-item__title");
  await expect(choreTitles.first()).toHaveText("Water the plants");
  await page.getByRole("checkbox", { name: "Complete Water the plants" }).check();
  await page.clock.runFor(499);
  await expect(choreTitles.first()).toHaveText("Water the plants");
  await page.clock.runFor(1);
  await expect(choreTitles.last()).toHaveText("Water the plants");

  await page.goto("/shopping");
  const shoppingTitles = page.locator(".task-page__tasks textarea.task-item__title");
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.getByRole("checkbox", { name: "Complete Oat milk" }).check();
  await page.clock.runFor(499);
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.clock.runFor(1);
  await expect(shoppingTitles.last()).toHaveValue("Oat milk");

  await page.goto("/printing");
  const printingTitles = page.locator(".project-card").first().locator("textarea.task-item__title");
  await expect(printingTitles.first()).toHaveValue("Large cable clip");
  await page.getByRole("checkbox", { name: "Complete Large cable clip" }).check();
  await page.clock.runFor(499);
  await expect(printingTitles.first()).toHaveValue("Large cable clip");
  await page.clock.runFor(1);
  await expect(printingTitles.last()).toHaveValue("Large cable clip");

  await page.goto("/cross-stitch");
  const stitchTitles = page.locator(".project-card").first().locator("textarea.task-item__title");
  await expect(stitchTitles.first()).toHaveValue("Finish the rosemary border");
  await page.getByRole("checkbox", { name: "Complete Finish the rosemary border" }).check();
  await page.clock.runFor(499);
  await expect(stitchTitles.first()).toHaveValue("Finish the rosemary border");
  await page.clock.runFor(1);
  await expect(stitchTitles.last()).toHaveValue("Finish the rosemary border");
});

test("the work page navigates in three-day ranges", async ({ page }) => {
  await page.goto(`/?date=${localIsoDate(-2)}`);

  await expect(page.locator(".week-day__heading")).toHaveCount(3);
  expect(await page.locator(".week-day__heading").evaluateAll((days) => days.map((day) => day.dateTime))).toEqual([
    localIsoDate(-3),
    localIsoDate(-2),
    localIsoDate(-1),
  ]);
  await expect(page.locator(".week-day > .task-item")).toHaveCount(0);

  const nextButton = page.getByRole("button", { name: "Next three days" });
  const previousButton = page.getByRole("button", { name: "Previous three days" });
  await expect(page.getByRole("button", { name: "Today" })).toHaveClass(/jm-button/);
  await expect(nextButton).toHaveClass(/jm-button/);
  await expect(previousButton).toHaveClass(/jm-button/);
  await expect(nextButton.locator("use")).toHaveAttribute("href", /#icon-arrow-right$/);
  await expect(previousButton.locator("use")).toHaveAttribute("href", /#icon-arrow-left$/);

  await nextButton.click();
  await expect(page.locator(".week-grid")).toHaveClass(/week-grid--next/);
  await expect(page.locator(".week-day__heading")).toHaveCount(6);
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(1));
  await expect(page.locator(".week-day__heading").first()).toHaveAttribute("datetime", localIsoDate(0));
  await expect(page.locator(".week-day__heading")).toHaveCount(3);

  await previousButton.click();
  await expect(page.locator(".week-grid")).toHaveClass(/week-grid--previous/);
  await expect(page.locator(".week-day__heading")).toHaveCount(6);
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(-2));

  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(-2));
  expect(new URL(page.url()).hash).toBe("#main-content");
  await expect(page.locator(".week-day__heading").first()).toHaveAttribute("datetime", localIsoDate(-3));
  await expect(page.locator(".week-day__heading")).toHaveCount(3);
});

test("work history stops at the first checked task", async ({ page }) => {
  await page.goto(`/?date=${localIsoDate(-3)}`);

  const previousButton = page.getByRole("button", { name: "Previous three days" });
  await previousButton.click();

  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(-6));
  await expect(page.locator(".week-day__heading").first()).toHaveAttribute("datetime", localIsoDate(-7));
  await expect(page.locator(".week-day").first().locator(".task-item__title")).toHaveText("Set up the work calendar");
  await expect(previousButton).toBeDisabled();
});

test("future work is limited to fourteen days from today", async ({ page }) => {
  await page.goto(`/?date=${localIsoDate(11)}`);

  const nextButton = page.getByRole("button", { name: "Next three days" });
  await nextButton.click();

  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(13));
  await expect(page.locator(".week-day__heading").last()).toHaveAttribute("datetime", localIsoDate(14));
  await expect(nextButton).toBeDisabled();
});

test("work statuses are saved by date and update today's navigation icon", async ({ page }) => {
  await page.goto("/");

  const statusSelect = page.getByRole("combobox", { name: /^Status for / }).nth(1);
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
