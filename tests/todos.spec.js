import { test, expect } from "./app-fixture.js";

const done = { id: "done", title: "Finished task", completed: true, completedAt: "2026-02-02T12:00:00Z" };
test.beforeEach(async ({ page, appData }) => {
  appData.set("todos", {
    lists: [
      { id: "general", title: "General", color: "#633533", tasks: [] },
      {
        id: "home",
        title: "Home",
        color: "#287271",
        tasks: [done, { id: "unfinished", title: "Unfinished task", completed: false }],
      },
    ],
  });
  await page.clock.install({ time: new Date("2026-02-02T14:00:00") });
  await page.goto("/todos");
});

test("all lists are cards with direct actions and General cannot be deleted", async ({ page }) => {
  const cards = page.locator(".todo-list-card");
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Todo lists" })).toHaveCount(0);
  await expect(page.locator(".page-header").getByRole("button")).toHaveText(["New list"]);
  const general = page.locator("#todo-list-general");
  await expect(general.getByRole("button")).toHaveCount(2);
  await expect(general.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  const home = page.locator("#todo-list-home");
  await expect(home.locator("header").getByRole("button")).toHaveCount(3);
  await expect(home.getByRole("button", { name: "Delete Home list", exact: true })).toBeVisible();
  await home.getByRole("button", { name: "Collapse Home", exact: true }).click();
  await expect(home.getByRole("textbox").first()).toBeHidden();
  await home.getByRole("button", { name: "Add task to Home", exact: true }).click();
  await expect(home.getByRole("textbox").last()).toBeFocused();
  await expect(page.locator(".todo-list-card li li")).toHaveCount(0);
});

test("new list and per-card task entry persist and Enter stays in its list", async ({ page, appData }) => {
  await page.getByRole("button", { name: "New list", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New list", exact: true });
  await dialog.getByRole("textbox", { name: "List name", exact: true }).fill("Travel");
  await dialog.getByRole("button", { name: "Create list", exact: true }).click();
  const travel = page
    .locator(".todo-list-card")
    .filter({ has: page.getByRole("heading", { name: "Travel", exact: true }) });
  await travel.getByRole("button", { name: "Add task to Travel", exact: true }).click();
  await travel.getByRole("textbox").last().fill("Pack bag");
  await travel.getByRole("textbox").last().press("Enter");
  await expect(travel.getByRole("textbox").last()).toBeFocused();
  await travel.getByRole("textbox").last().fill("Book train");
  await expect.poll(() => appData.get("todos").lists.find((list) => list.title === "Travel")?.tasks.length).toBe(2);
  await page.reload();
  await expect(travel.getByRole("textbox")).toHaveCount(2);
  expect(appData.validationErrors).toEqual([]);
});

test("deleting a list retains only completed activity without its list name", async ({ page, appData }) => {
  await page.getByRole("button", { name: "Delete Home list", exact: true }).click();
  await expect(page.getByRole("button", { name: "New list", exact: true })).toBeFocused();
  await expect.poll(() => appData.get("todos").lists.length).toBe(1);
  expect(appData.get("todos").history.map((task) => task.title)).toEqual(["Finished task"]);
  await page.reload();
  await page.goto("/profile");
  const day = page.locator("#activity-2026-02-02");
  await expect(day.getByText("Finished task", { exact: true })).toHaveCount(1);
  await expect(day.getByText("Home", { exact: true })).toHaveCount(0);
  await expect(day.getByText("Unfinished task", { exact: true })).toHaveCount(0);
});

test("completion followed by list deletion survives a failed save and reload", async ({ page, appData }) => {
  appData.setWriteFailure("todos", 503);
  await page.getByRole("checkbox", { name: "Complete Unfinished task", exact: true }).check();
  await page.getByRole("button", { name: "Delete Home list", exact: true }).click();
  await page.clock.runFor(600);
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  appData.setWriteFailure("todos", 0);
  await page.reload();
  await expect.poll(() => appData.get("todos").lists.length).toBe(1);
  expect(appData.get("todos").history).toHaveLength(2);
  await page.goto("/profile");
  await expect(page.locator("#activity-2026-02-02").getByText("Unfinished task", { exact: true })).toHaveCount(1);
  expect(appData.validationErrors).toEqual([]);
});

test("empty data gets General and cards fit mobile", async ({ page, appData }) => {
  appData.set("todos", { lists: [] });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
  await expect.poll(() => appData.get("todos").lists[0]?.id).toBe("general");
  await page.getByRole("button", { name: "Collapse General", exact: true }).click();
  await expect(page.getByText("No tasks yet", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Add task to General", exact: true }).click();
  await expect(page.locator("#todo-list-general").getByRole("textbox")).toBeFocused();
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/todos-mobile.png", fullPage: true });
});

test("individual task deletion persists, restores focus, and preserves only completed activity", async ({
  page,
  appData,
}) => {
  await page.getByRole("button", { name: "Delete Unfinished task", exact: true }).click();
  await expect(page.locator("#todo-list-home").getByRole("textbox")).toBeFocused();
  await page.getByRole("button", { name: "Delete Finished task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add task to Home", exact: true })).toBeFocused();
  await expect.poll(() => appData.get("todos").lists.find((list) => list.id === "home").tasks).toEqual([]);
  expect(appData.get("todos").history.map((task) => task.title)).toEqual(["Finished task"]);
  await page.reload();
  await expect(page.locator("#todo-list-home .task-item")).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.locator("#activity-2026-02-02").getByText("Finished task", { exact: true })).toHaveCount(1);
  expect(appData.validationErrors).toEqual([]);
});

test("items in General can be removed, including during pending completion reordering", async ({ page, appData }) => {
  const general = page.locator("#todo-list-general");
  await general.getByRole("button", { name: "Add task to General", exact: true }).click();
  await general.getByRole("textbox").fill("General task");
  await general.getByRole("checkbox", { name: "Complete General task", exact: true }).check();
  await general.getByRole("button", { name: "Delete General task", exact: true }).click();
  await page.clock.runFor(600);
  await expect.poll(() => appData.get("todos").lists.find((list) => list.id === "general").tasks).toEqual([]);
  await expect.poll(() => appData.get("todos").history?.some((task) => task.title === "General task")).toBe(true);
  await expect(general.getByRole("button", { name: "Add task to General", exact: true })).toBeFocused();
});
