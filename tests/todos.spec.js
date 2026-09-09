import { advisory, test, expect } from "./app-fixture.js";

async function listAction(page, list, name) {
  const menu = page.getByLabel(`Actions for ${list}`, { exact: true });
  await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

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

test("cards use the shared kebab menu and General has one direct action", async ({ page }) => {
  const cards = page.locator(".todo-list-card");
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Todo lists" })).toHaveCount(0);
  await expect(page.locator(".page-header").getByRole("button")).toHaveText(["New list"]);
  const general = page.locator("#todo-list-general");
  await expect(general.getByRole("button")).toHaveCount(2);
  await expect(general.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  const home = page.locator("#todo-list-home");
  await expect(home.getByLabel("Actions for Home", { exact: true })).toBeVisible();
  await expect(home.getByRole("button", { name: "Delete Home list", exact: true })).toBeHidden();
  await home.getByRole("button", { name: "Collapse Home", exact: true }).click();
  await expect(home.getByRole("textbox").first()).toBeHidden();
  await listAction(page, "Home", "Add task to Home");
  await advisory((expect) => expect(home.getByRole("textbox").nth(1)).toBeFocused());
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
  await listAction(page, "Travel", "Add task to Travel");
  await travel.getByRole("textbox").last().fill("Pack bag");
  await travel.getByRole("textbox").last().press("Enter");
  await advisory((expect) => expect(travel.getByRole("textbox").last()).toBeFocused());
  await travel.getByRole("textbox").last().fill("Book train");
  await expect.poll(() => appData.get("todos").lists.find((list) => list.title === "Travel")?.tasks.length).toBe(2);
  await page.reload();
  await expect(travel.getByRole("textbox")).toHaveCount(2);
  expect(appData.validationErrors).toEqual([]);
});

test("deleting a list retains only completed activity without its list name", async ({ page, appData }) => {
  await listAction(page, "Home", "Delete Home list");
  await advisory((expect) => expect(page.getByRole("button", { name: "New list", exact: true })).toBeFocused());
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
  await listAction(page, "Home", "Delete Home list");
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
  await advisory((expect) => expect(page.locator("#todo-list-general").getByRole("textbox")).toBeFocused());
  await advisory(async (expect) =>
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    ),
  );
  await page.screenshot({ path: "test-results/todos-mobile.png", fullPage: true });
});

test("individual task deletion persists, restores focus, and preserves only completed activity", async ({
  page,
  appData,
}) => {
  await page.getByRole("button", { name: "Delete Unfinished task", exact: true }).click();
  await advisory((expect) => expect(page.locator("#todo-list-home").getByRole("textbox")).toBeFocused());
  await page.getByRole("button", { name: "Delete Finished task", exact: true }).click();
  await advisory((expect) => expect(page.getByLabel("Actions for Home", { exact: true })).toBeFocused());
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
  await advisory((expect) =>
    expect(general.getByRole("button", { name: "Add task to General", exact: true })).toBeFocused(),
  );
});

test("titles restore on blank blur and valid edits survive failed saves", async ({ page, appData }) => {
  const title = page.locator("#todo-title-unfinished");
  await expect(title).toHaveAttribute("maxlength", "500");
  await title.fill("x".repeat(501));
  await expect(title).toHaveValue("x".repeat(500));
  await title.fill("Valid title");
  await title.fill("   ");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(title).toHaveValue("Valid title");
  appData.setWriteFailure("todos", 503);
  await title.fill("Recover title");
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  appData.setWriteFailure("todos", 0);
  await page.reload();
  await expect(title).toHaveValue("Recover title");
  expect(appData.validationErrors).toEqual([]);
});

test("new tasks and Enter stay before completed tasks; blank drafts cannot complete", async ({ page, appData }) => {
  const home = page.locator("#todo-list-home");
  await page.locator("#todo-title-unfinished").press("Enter");
  const titles = home.getByRole("textbox");
  await advisory((expect) => expect(titles.nth(1)).toBeFocused());
  await expect(titles.last()).toHaveValue("Finished task");
  await expect(home.getByRole("checkbox", { name: "Complete untitled task" })).toBeDisabled();
  await titles.nth(1).fill("Another task");
  await titles.nth(1).press("Enter");
  await advisory((expect) => expect(titles.nth(2)).toBeFocused());
  await page.getByRole("heading", { level: 1 }).click();
  await expect(titles).toHaveCount(3);
  await expect
    .poll(() =>
      appData
        .get("todos")
        .lists.find((list) => list.id === "home")
        .tasks.map((task) => task.title),
    )
    .toEqual(["Unfinished task", "Another task", "Finished task"]);
  await page.reload();
  await expect(titles.nth(1)).toHaveValue("Another task");
  await page.locator("#todo-title-unfinished").dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(titles).toHaveCount(3);
});

for (const removeList of [false, true]) {
  for (const offline of [false, true]) {
    test(`uncheck then delete ${removeList ? "list" : "item"} removes activity ${offline ? "offline" : "before save"}`, async ({
      page,
      appData,
    }) => {
      if (offline) appData.setWriteFailure("todos", 503);
      await page.clock.pauseAt(new Date("2026-02-02T14:01:00"));
      await page.getByRole("checkbox", { name: "Complete Finished task", exact: true }).uncheck();
      if (removeList) await listAction(page, "Home", "Delete Home list");
      else await page.getByRole("button", { name: "Delete Finished task", exact: true }).click();
      await page.clock.runFor(600);
      if (offline) {
        await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
        appData.setWriteFailure("todos", 0);
      }
      await page.reload();
      await expect.poll(() => appData.get("todos").history ?? []).toEqual([]);
      await page.goto("/profile");
      await expect(page.getByText("Finished task", { exact: true })).toHaveCount(0);
      expect(appData.validationErrors).toEqual([]);
    });
  }
}

test("editing then deleting a completed task retains its newest title once", async ({ page, appData }) => {
  await page.clock.pauseAt(new Date("2026-02-02T14:01:00"));
  await page.locator("#todo-title-done").fill("Updated completion");
  await page.getByRole("button", { name: "Delete Updated completion", exact: true }).click();
  await page.clock.runFor(600);
  await expect.poll(() => appData.get("todos").history?.map((task) => task.title)).toEqual(["Updated completion"]);
  await page.reload();
  await page.goto("/profile");
  await expect(page.getByText("Updated completion", { exact: true })).toHaveCount(1);
});

test("new list modal supports cancellation and focuses the new Add action", async ({ page }) => {
  const open = page.getByRole("button", { name: "New list", exact: true });
  const dialog = page.getByRole("dialog", { name: "New list", exact: true });
  await open.click();
  const name = dialog.getByRole("textbox", { name: "List name" });
  await advisory((expect) => expect(name).toBeFocused());
  await name.fill("   ");
  await expect(dialog.getByRole("button", { name: "Create list" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await advisory((expect) => expect(open).toBeFocused());
  await open.click();
  await expect(name).toHaveValue("");
  await name.fill("Cancelled");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await advisory((expect) => expect(open).toBeFocused());
  await open.click();
  await page.mouse.click(1, 1);
  await expect(dialog).toBeHidden();
  await advisory((expect) => expect(open).toBeFocused());
  await open.click();
  await name.fill("Travel");
  await name.press("Enter");
  await advisory((expect) => expect(page.getByLabel("Actions for Travel", { exact: true })).toBeFocused());
});

test("list and task limits prevent unsavable additions", async ({ page, appData }) => {
  appData.set("todos", {
    lists: Array.from({ length: 100 }, (_, i) => ({
      id: i ? `list-${i}` : "general",
      title: i ? `List ${i}` : "General",
      color: "#287271",
      tasks: [],
    })),
    history: [],
  });
  await page.reload();
  await page.getByRole("button", { name: "New list", exact: true }).click();
  await expect(page.getByText("You can have up to 100 lists. Delete a list before adding another.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  appData.set("todos", {
    lists: [
      {
        id: "general",
        title: "General",
        color: "#287271",
        tasks: Array.from({ length: 2000 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}`, completed: false })),
      },
    ],
    history: [],
  });
  await page.reload();
  await page.getByRole("button", { name: "Add task to General", exact: true }).click();
  await expect(
    page.getByText("A list can contain up to 2,000 tasks. Delete a task before adding another."),
  ).toBeVisible();
  await expect(page.locator(".task-item")).toHaveCount(2000);
  expect(appData.validationErrors).toEqual([]);
});

test("populated mobile cards wrap long names and retain checkbox focus after reordering", async ({ page, appData }) => {
  const longTitle = "A".repeat(500);
  appData.set("todos", {
    lists: [
      {
        id: "general",
        title: longTitle,
        color: "#287271",
        tasks: [
          { id: "long", title: longTitle, completed: false },
          { id: "short", title: "Short task", completed: false },
        ],
      },
    ],
    history: [],
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  const checkbox = page.locator("#task-item-complete-long");
  await checkbox.focus();
  await page.keyboard.press("Space");
  await page.clock.runFor(500);
  await advisory((expect) => expect(checkbox).toBeFocused());
  await expect(page.locator(".task-item").last().getByRole("textbox")).toHaveValue(longTitle);
  await page.keyboard.press("Space");
  await page.clock.runFor(500);
  await advisory((expect) => expect(checkbox).toBeFocused());
  await expect(page.locator(".task-item").first().getByRole("textbox")).toHaveValue(longTitle);
  await advisory(async (expect) =>
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    ),
  );
  await page.screenshot({ path: "test-results/todos-populated-mobile.png", fullPage: true });
});
