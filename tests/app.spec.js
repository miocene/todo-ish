import { advisory, test, expect, appDataByPage } from "./app-fixture.js";
import { CARD_COLORS } from "../src/app/card-colors.js";

test("anonymous visitors see passkey setup before application data", async ({ page }) => {
  appDataByPage.get(page).setSession({
    authenticated: false,
    bootstrapRequired: true,
    user: null,
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Create your passkey" })).toBeVisible();
  await expect(page.getByLabel("One-time setup code")).toBeVisible();
  await expect(page.getByLabel("One-time setup code")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Create passkey" })).toBeVisible();
  await expect(page.locator(".jm-header")).toHaveCount(0);
});

test("startup waits for saved data before loading the application", async ({ page }) => {
  const data = appDataByPage.get(page);
  data.set("work-tasks", [{ id: "saved-task", title: "Saved task", date: "2026-09-06" }]);
  data.set("work-statuses", { "2026-09-05": "pto" });
  await page.clock.install({ time: new Date(2026, 8, 5, 12) });

  let releaseData;
  const dataReady = new Promise((resolve) => {
    releaseData = resolve;
  });
  await page.route("**/api/data", async (route) => {
    await dataReady;
    await route.fallback();
  });
  await page.goto("/work?date=2026-09-06");
  await expect(page.getByRole("status")).toHaveText("Opening Done-ish…");
  await expect(page.locator(".jm-header")).toHaveCount(0);

  releaseData();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue("Saved task");
  await expect(page.getByRole("link", { name: "Work", exact: true }).locator("use")).toHaveAttribute(
    "href",
    /#icon-pto$/,
  );
  await expect(page).toHaveURL(/\/work\?date=2026-09-06$/);
  await expect(page).toHaveTitle("Work — Done-ish");
});

for (const resource of ["auth/session", "data"]) {
  test(`startup retries a failed ${resource} request without reloading`, async ({ page }) => {
    await page.route(
      `**/api/${resource}`,
      (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Offline" }) }),
      { times: 1 },
    );
    await page.goto("/shopping");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".jm-header")).toHaveCount(0);

    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Shopping cart", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(/\/shopping$/);
  });
}

test("passkey sign-in opens the requested page after loading data", async ({ page }) => {
  appDataByPage.get(page).setSession({ authenticated: false, bootstrapRequired: false, user: null });
  let dataRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/data") dataRequests += 1;
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.credentials, "get", {
      value: async () => ({ toJSON: () => ({ id: "test-passkey" }) }),
    });
  });
  await page.route("**/api/auth/authentication/*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        route.request().url().endsWith("/options")
          ? { challenge: "dGVzdA", rpId: "todo-ish.today" }
          : { user: { id: "owner", username: "owner", displayName: "Owner" } },
      ),
    }),
  );
  await page.goto("/shopping");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  expect(dataRequests).toBe(0);

  await page.getByRole("button", { name: "Sign in with passkey", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shopping cart", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/shopping$/);
  expect(dataRequests).toBe(1);
});

function localIsoDate(dayOffset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localFullDateLabel(dayOffset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

test("development mocks colors locally when the API has no color storage", async ({ page }) => {
  const data = appDataByPage.get(page);
  data.setColorSupport(false);
  data.set("todos", {
    lists: [{ id: "general", title: "General", tasks: [{ id: "task-1", title: "Original task", completed: false }] }],
  });
  data.set("printing", {
    projects: [{ id: "existing-project", title: "Existing project", color: "#123456", description: "", tasks: [] }],
  });
  const colorRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/data/colors") colorRequests.push(request.url());
  });
  const colorOf = (locator) => locator.evaluate((element) => element.style.getPropertyValue("--color"));

  await page.goto("/work");
  const todayColor = await colorOf(page.locator(".jm-card:not(.work-backlog)"));
  const backlogColor = await colorOf(page.locator(".work-backlog"));
  expect(CARD_COLORS).toContain(todayColor);
  expect(backlogColor).toBe("");
  await page.reload();
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(todayColor);
  expect(await colorOf(page.locator(".work-backlog"))).toBe(backlogColor);

  await page.goto("/todos");
  const listColor = await colorOf(page.locator(".todo-list-card").first());
  expect(CARD_COLORS).toContain(listColor);
  expect(data.get("todos").lists[0]).not.toHaveProperty("color");
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Still saved to the API");
  await expect.poll(() => data.get("todos").lists[0].tasks[0].title).toBe("Still saved to the API");
  await page.reload();
  expect(await colorOf(page.locator(".todo-list-card").first())).toBe(listColor);
  await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveValue("Still saved to the API");
  expect(data.get("todos").lists[0]).not.toHaveProperty("color");

  await page.goto("/printing");
  const projectColor = await colorOf(page.locator(".project-card"));
  expect(CARD_COLORS).toContain(projectColor);
  expect(data.get("printing").projects[0].color).toBe("#123456");
  await page.reload();
  expect(await colorOf(page.locator(".project-card"))).toBe(projectColor);
  await page.goto("/chores");
  await expect(page.locator(".jm-card")).toHaveCount(2);
  const choreColors = await page
    .locator(".jm-card")
    .evaluateAll((cards) => cards.map((card) => card.style.getPropertyValue("--color")));
  expect(choreColors).toEqual(["", ""]);
  await page.reload();
  await expect(page.locator(".jm-card")).toHaveCount(2);
  expect(
    await page.locator(".jm-card").evaluateAll((cards) => cards.map((card) => card.style.getPropertyValue("--color"))),
  ).toEqual(choreColors);
  expect(colorRequests).toEqual([]);
});

test("card colors migrate into the palette and persist without visible color controls", async ({ page }) => {
  const data = appDataByPage.get(page);
  const savedWorkColor = CARD_COLORS[0];
  const savedListColor = CARD_COLORS[7];
  data.set("todos", {
    lists: [
      { id: "general", title: "General", tasks: [] },
      { id: "home", title: "Home", color: savedListColor.toLowerCase(), tasks: [] },
    ],
  });
  data.set("printing", {
    projects: [{ id: "legacy-project", title: "Existing project", color: "#633533", description: "", tasks: [] }],
  });
  data.set("colors", { [`work-day:${localIsoDate(-1)}`]: savedWorkColor });

  const colorOf = (locator) => locator.evaluate((element) => element.style.getPropertyValue("--color"));
  await page.goto("/work");
  const todayColor = await colorOf(page.locator(".jm-card:not(.work-backlog)"));
  const backlogColor = await colorOf(page.locator(".work-backlog"));
  expect(CARD_COLORS).toContain(todayColor);
  expect(backlogColor).toBe("");
  await expect
    .poll(() => data.get("colors"))
    .toMatchObject({
      [`work-day:${localIsoDate()}`]: todayColor,
      [`work-day:${localIsoDate(-1)}`]: savedWorkColor,
    });
  expect(data.get("colors")).not.toHaveProperty("today");
  await page.getByRole("button", { name: `${localFullDateLabel(-1)}. No completed tasks`, exact: true }).click();
  await expect(page.locator(".jm-card:not(.work-backlog) time")).toHaveAttribute("datetime", localIsoDate(-1));
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(savedWorkColor);
  await page.getByRole("button", { name: `${localFullDateLabel(-2)}. No completed tasks`, exact: true }).click();
  await expect(page.locator(".jm-card:not(.work-backlog) time")).toHaveAttribute("datetime", localIsoDate(-2));
  const pastDayColor = await colorOf(page.locator(".jm-card:not(.work-backlog)"));
  expect(CARD_COLORS).toContain(pastDayColor);
  await expect.poll(() => data.get("colors")[`work-day:${localIsoDate(-2)}`]).toBe(pastDayColor);
  await page.reload();
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(pastDayColor);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".jm-card:not(.work-backlog) time")).toHaveAttribute("datetime", localIsoDate());
  await page.reload();
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(todayColor);
  expect(await colorOf(page.locator(".work-backlog"))).toBe(backlogColor);

  await page.goto("/todos");
  const listColor = await colorOf(page.locator(".todo-list-card").first());
  expect(CARD_COLORS).toContain(listColor);
  await expect.poll(() => data.get("todos").lists[0].color).toBe(listColor);
  expect(await colorOf(page.locator("#todo-list-home"))).toBe(savedListColor);
  await page.reload();
  expect(await colorOf(page.locator("#todo-list-home"))).toBe(savedListColor);
  expect(await colorOf(page.locator(".todo-list-card").first())).toBe(listColor);

  // List creation uses the same save boundary, including callers without a color field.
  await page.evaluate(async () => {
    const { loadPageTasks, savePageTasks } = await import("/src/app/page-tasks.js");
    const todos = loadPageTasks("todos");
    todos.lists.push({ id: "new-list", title: "New list", tasks: [] });
    savePageTasks("todos", todos);
  });
  await expect.poll(() => data.get("todos").lists.length).toBe(3);
  const newListColor = data.get("todos").lists.at(-1).color;
  expect(CARD_COLORS).toContain(newListColor);
  await page.reload();
  expect(await colorOf(page.locator("#todo-list-new-list"))).toBe(newListColor);

  await page.goto("/printing");
  const projectColor = await colorOf(page.locator(".project-card"));
  expect(CARD_COLORS).toContain(projectColor);
  await expect.poll(() => data.get("printing").projects[0].color).toBe(projectColor);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  const projectRgb = projectColor
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16))
    .join(", ");
  await expect(page.locator(".project-card")).toHaveCSS("background-color", `rgb(${projectRgb})`);
  await page.reload();
  expect(await colorOf(page.locator(".project-card"))).toBe(projectColor);

  await page.goto("/cross-stitch");
  await page.getByRole("button", { name: "Add project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New project" });
  await projectDialog.getByRole("textbox", { name: "Project name" }).fill("New cross stitch project");
  await projectDialog.getByRole("combobox", { name: "Thread color" }).selectOption("dmc310");
  await projectDialog.getByRole("spinbutton", { name: "Crosses total" }).fill("100");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  const newProjectColor = await colorOf(page.locator(".project-card").last());
  expect(CARD_COLORS).toContain(newProjectColor);
  await expect.poll(() => data.get("cross-stitch")?.projects.at(-1).color).toBe(newProjectColor);
  await page.reload();
  expect(await colorOf(page.locator(".project-card").last())).toBe(newProjectColor);
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
    await expect(page.getByRole("heading", { level: path === "/shopping" ? 2 : 1, name: label })).toBeVisible();
    await advisory((expect) => expect(link).toHaveAttribute("aria-current", "page"));
  }

  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/profile");
  await expect(page).toHaveTitle("Profile — Done-ish");
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
});

test("profile shows yearly task activity and newly checked items", async ({ page }) => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  await page.goto("/todos");
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("link", { name: "Activity", exact: true }).click();

  await expect(page.getByRole("navigation", { name: "Activity years" }).getByRole("link")).toHaveCount(5);
  await advisory((expect) =>
    expect(page.getByRole("link", { name: String(currentYear), exact: true })).toHaveAttribute("aria-current", "page"),
  );
  await expect(page.locator(".jm-activity-graph__days > :not(.jm-activity-graph__cell--outside)")).toHaveCount(
    currentYear % 4 === 0 ? 366 : 365,
  );
  await expect(page.getByRole("heading", { level: 2, name: /checked items? in/ })).toContainText(String(currentYear));
  await expect(page.getByText("Renew passport", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: String(previousYear), exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("year")).toBe(String(previousYear));
  await expect(page.getByText(`No checked items in ${previousYear}.`)).toBeVisible();
});

test("navigation tabs follow query changes, browser history, and reloads", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 1000 });
  const currentYear = new Date().getFullYear();
  const cases = [
    {
      path: "/catalog",
      name: "Catalog",
      first: "3D printing filament",
      next: "DMC embroidery floss",
      query: "catalog",
      value: "floss",
    },
    {
      path: "/profile",
      name: "Activity years",
      first: String(currentYear),
      next: String(currentYear - 1),
      query: "year",
      value: String(currentYear - 1),
    },
  ];

  for (const tabs of cases) {
    await page.goto(tabs.path);
    const navigation = page.getByRole("navigation", { name: tabs.name, exact: true });
    const active = navigation.locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(tabs.first);
    const next = navigation.getByRole("link", { name: tabs.next, exact: true });
    await expect(next).toHaveAttribute("href", `${tabs.path}?${tabs.query}=${tabs.value}`);
    await next.focus();
    await next.press("Enter");
    await expect.poll(() => new URL(page.url()).searchParams.get(tabs.query)).toBe(tabs.value);
    await expect(active).toHaveText(tabs.next);
    await page.goBack();
    await expect(active).toHaveText(tabs.first);
    await page.goForward();
    await expect(active).toHaveText(tabs.next);
    await page.reload();
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(tabs.next);
    await page.goto(`${tabs.path}?${tabs.query}=unknown`);
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(tabs.first);
  }
});

test("chores render schedules and save modal changes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-02-07T12:00:00") });
  appDataByPage.get(page).set("chores", {
    occurrenceOrder: ["chore-1", "chore-2", "chore-3"],
    tasks: ["Every Saturday", "Every 2 weeks on Sunday", "Every Wednesday"].map((details, index) => ({
      id: `chore-${index + 1}`,
      title: `Chore ${index + 1}`,
      details,
      nextDue: "2026-02-07",
      completed: false,
    })),
  });
  await page.goto("/chores");

  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Today and overdue", "All chores"]);
  const upcomingChores = page.locator(".chores-due .task-item");
  const allChores = page.locator(".chores-all .task-item");
  await expect(upcomingChores).toHaveCount(3);
  await expect(allChores).toHaveCount(3);
  await expect(upcomingChores.getByRole("checkbox")).toHaveCount(3);
  await expect(allChores.getByRole("combobox")).toHaveCount(0);
  const dialog = page.getByRole("dialog");
  for (const [index, day, interval] of [
    [0, "Saturday", "1"],
    [1, "Sunday", "2"],
    [2, "Wednesday", "1"],
  ]) {
    await allChores
      .nth(index)
      .getByRole("button", { name: `Edit Chore ${index + 1}`, exact: true })
      .click();
    await expect(dialog.getByRole("checkbox", { name: day })).toBeChecked();
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue(interval);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await allChores.first().getByRole("button", { name: "Edit Chore 1", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Water all the plants");
  await dialog.getByRole("spinbutton", { name: "Every" }).fill("2");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await upcomingChores.getByRole("checkbox", { name: "Complete Water all the plants" }).check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Complete Water all the plants" })).toBeChecked();
  await page.getByRole("button", { name: "Edit Water all the plants", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Water all the plants");
  await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("2");
});

test("task pages save inline changes and project dialogs save on submit", async ({ page }) => {
  await page.goto("/todos");
  await expect(page.locator(".todo-list-card > header h2")).toHaveText(["General", "Home", "Travel"]);
  const homeTasks = page.locator("#todo-list-home textarea");
  await homeTasks.last().press("Enter");
  await expect(homeTasks).toHaveCount(3);
  await advisory((expect) => expect(homeTasks.nth(1)).toBeFocused());
  await page.getByRole("button", { name: "New list", exact: true }).focus();
  await expect(homeTasks).toHaveCount(2);

  await page.goto("/shopping");
  await expect(page.getByRole("button", { name: /^Remove .* from shopping list$/ })).toHaveCount(3);
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
  // Purchase/inventory effects are covered independently in shopping.spec.js.
  await expect(page.getByRole("button", { name: "Remove Oat milk from shopping list" }).locator("use")).toHaveAttribute(
    "href",
    /#icon-remove$/,
  );
  await page.getByRole("button", { name: "Remove Oat milk from shopping list" }).click();
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(6);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(7);
  await page.getByRole("button", { name: "Add item" }).focus();
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(6);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveCount(2);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin")).toHaveCount(0);

  await page.goto("/printing");
  const projects = page.locator(".project-card");
  await expect(projects).toHaveCount(2);
  await expect(projects.getByRole("heading", { level: 2 })).toHaveText(["Desk cable clips", "Miniature planter"]);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin, .task-item__remove")).toHaveCount(0);
  await expect(projects.first().getByLabel("Project color")).toHaveCount(0);
  expect(CARD_COLORS).toContain(await projects.first().evaluate((card) => card.style.getPropertyValue("--color")));
  await expect(projects.first().locator("textarea, select")).toHaveCount(0);
  await expect(projects.first().locator(".filament > span")).toHaveText(["12 g", "1002 g", "2 g", "8 g"]);
  await expect(projects.first().locator(".missing")).toHaveCount(2);
  await expect(projects.first().getByText("Not in catalog · Need 1 spool")).toBeVisible();
  await expect(projects.first().getByText("Missing 1 spool · 1 owned")).toBeVisible();
  await projects
    .first()
    .getByLabel(/^Actions for/)
    .click();
  await projects.first().getByRole("button", { name: "Add item" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit project", exact: true });
  await expect(editDialog.getByRole("textbox", { name: "Item name" })).toHaveCount(4);
  await advisory((expect) => expect(editDialog.getByRole("textbox", { name: "Item name" }).last()).toBeFocused());
  await expect(projects.first().locator(".task-item")).toHaveCount(3);
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Add project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New project" });
  await projectDialog.getByRole("textbox", { name: "Project name" }).fill("New 3D project");
  await projectDialog.getByRole("textbox", { name: "Item name" }).fill("Weighted base");
  await projectDialog.getByLabel("Filament 1", { exact: true }).selectOption("bambu-pla-basic-filament-10101");
  await projectDialog.getByLabel("Weight 1 (g)", { exact: true }).fill("35");
  await projectDialog.getByRole("button", { name: "Add filament" }).click();
  await advisory((expect) => expect(projectDialog.getByLabel("Filament 2", { exact: true })).toBeFocused());
  await projectDialog.getByLabel("Filament 2", { exact: true }).selectOption("bambu-pla-basic-filament-10501");
  await projectDialog.getByLabel("Weight 2 (g)", { exact: true }).fill("7.5");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projects).toHaveCount(3);
  const newProject = projects.filter({ has: page.getByRole("heading", { name: "New 3D project" }) });
  await expect(newProject.getByRole("heading", { name: "New 3D project" })).toBeVisible();
  const projectColor = await newProject.evaluate((card) => card.style.getPropertyValue("--color"));
  expect(CARD_COLORS).toContain(projectColor);
  await page.reload();
  const savedProject = newProject;
  await expect(savedProject.getByRole("heading", { name: "New 3D project" })).toBeVisible();
  expect(await savedProject.evaluate((card) => card.style.getPropertyValue("--color"))).toBe(projectColor);
  await expect(savedProject.locator(".task-item .title")).toHaveText("Weighted base");
  await savedProject.getByLabel(/^Actions for/).click();
  await savedProject.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editDialog.getByLabel("Item name")).toHaveValue("Weighted base");
  expect(
    await editDialog.getByLabel(/^Filament \d+$/).evaluateAll((selects) => selects.map((select) => select.value)),
  ).toEqual(["bambu-pla-basic-filament-10101", "bambu-pla-basic-filament-10501"]);
  expect(
    await editDialog.getByLabel(/^Weight \d+ \(g\)$/).evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["35", "7.5"]);
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/cross-stitch");
  await expect(page.getByRole("heading", { level: 1, name: "Cross stitch" })).toBeVisible();
  await expect(page.locator(".project-card").getByRole("heading", { level: 2 })).toHaveText([
    "Botanical sampler",
    "Amsterdam canal house",
  ]);
  const stitchProject = page.locator(".project-card").first();
  await expect(stitchProject.getByRole("heading", { name: "Botanical sampler" })).toBeVisible();
  await expect(stitchProject.getByLabel("Project color")).toHaveCount(0);
  expect(CARD_COLORS).toContain(await stitchProject.evaluate((card) => card.style.getPropertyValue("--color")));
  await expect(stitchProject.getByRole("checkbox")).toHaveCount(3);
  await expect(stitchProject.locator("select")).toHaveCount(0);
  await expect(stitchProject.locator(".stitch-color__missing")).toHaveCount(2);
  const stitchProgress = stitchProject.getByRole("progressbar", { name: "Progress for Botanical sampler" });
  await expect(stitchProgress).toHaveAttribute("value", "971");
  await expect(stitchProgress).toHaveAttribute("max", "2400");
  await stitchProject.getByLabel(/^Actions for/).click();
  await stitchProject.getByRole("button", { name: "Edit", exact: true }).click();
  await editDialog.getByLabel("Crosses done").first().fill("1200");
  await editDialog.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(stitchProject.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await expect(stitchProgress).toHaveAttribute("value", "1600");
  await stitchProject.getByLabel(/^Actions for/).click();
  await stitchProject.getByRole("button", { name: "Add color" }).click();
  const stitchColors = editDialog.locator('select[name="stitch-floss"]');
  await expect(stitchColors).toHaveCount(4);
  await advisory((expect) => expect(stitchColors.last()).toBeFocused());
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/catalog");
  await expect(page.getByRole("navigation", { name: "Catalog" }).getByRole("link")).toHaveText([
    "3D printing filament",
    "DMC embroidery floss",
  ]);
  await advisory((expect) =>
    expect(page.getByRole("link", { name: "3D printing filament" })).toHaveAttribute("aria-current", "page"),
  );
  await page.getByRole("link", { name: "DMC embroidery floss" }).click();
  await advisory((expect) =>
    expect(page.getByRole("link", { name: "DMC embroidery floss" })).toHaveAttribute("aria-current", "page"),
  );
  await expect(page.getByLabel("Search floss")).toBeVisible();
  await page.getByRole("link", { name: "3D printing filament" }).click();
  await expect(page.getByLabel("Search filaments")).toBeVisible();
  await expect(page.locator(".jm-catalog-item")).toHaveCount(265);
  await expect(page.getByLabel("Filament type")).toHaveValue("");
  const catalogGroups = await page
    .locator(".jm-catalog-item")
    .evaluateAll((cards) => cards.map((card) => card.dataset.catalogGroup));
  expect(catalogGroups).toEqual(
    [...catalogGroups].sort(
      (first, second) => ["owned", "needed", "other"].indexOf(first) - ["owned", "needed", "other"].indexOf(second),
    ),
  );
  await page.getByLabel("Filament type").selectOption("PLA Basic");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(30);
  await page.getByLabel("Filament type").selectOption("");
  await page.getByLabel("Search filaments").fill("bambu-pla-basic-filament-10601");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "PLA Basic · Blue" })).toBeVisible();
  await expect(page.getByRole("link", { name: /PLA Basic · Blue/ })).toHaveAttribute(
    "href",
    "https://eu.store.bambulab.com/products/pla-basic-filament",
  );
  await expect(page.locator(".jm-catalog-item__required")).toHaveText("/ 2");
  await advisory((expect) => expect(page.getByLabel("Spools owned")).toHaveAccessibleDescription("Required spools: 2"));
  await expect(page.getByLabel("Spools owned")).toHaveValue("1");
  await page.getByLabel("Spools owned").fill("2");
  await expect(page.locator(".jm-catalog-item--missing")).toHaveCount(0);
  await expect
    .poll(() => appDataByPage.get(page).get("filament-inventory")?.["bambu-pla-basic-filament-10601"])
    .toBe(2);

  await page.goto("/printing");
  await expect(page.locator(".project-card .missing")).toHaveCount(1);
  await expect(page.getByText("Missing 1 spool · 1 owned")).toHaveCount(0);

  await page.goto("/catalog?catalog=floss&q=dmc3853");
  await advisory((expect) =>
    expect(page.getByRole("link", { name: "DMC embroidery floss" })).toHaveAttribute("aria-current", "page"),
  );
  await expect(page.getByLabel("Search floss")).toHaveValue("dmc3853");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "DMC 3853 · Autumn Gold Dk" })).toBeVisible();
  await expect(page.getByRole("link", { name: /DMC 3853 · Autumn Gold Dk/ })).toHaveAttribute(
    "href",
    "https://www.breibrink.nl/dmc-3853.html",
  );
  await expect(page.locator(".jm-catalog-item__required")).toHaveText("/ 1");
  await advisory((expect) => expect(page.getByLabel("Skeins owned")).toHaveAccessibleDescription("Required skeins: 1"));
  await page.getByLabel("Skeins owned").fill("1");
  await expect(page.locator(".jm-catalog-item--missing")).toHaveCount(0);
  await expect.poll(() => appDataByPage.get(page).get("floss-inventory")?.dmc3853).toBe(1);

  await page.goto("/shopping");
  await expect(page.getByLabel("Task title")).toHaveCount(2);
  expect(await page.getByLabel("Task title").evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual([
    "Apples",
    "Dish soap",
  ]);
  await expect(page.getByRole("link", { name: /PETG Basic · Charcoal filament · 1 spool/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /PLA Basic · Blue filament/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /DMC .* floss/ })).toHaveCount(0);

  await page.goto("/catalog");
  await page.getByLabel("Search filaments").fill("discontinued-petg-charcoal");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(0);
  await expect(page.getByText("No catalog filaments match this search.")).toBeVisible();
});

test("work and chore cards expose only their supported actions", async ({ page }) => {
  await page.goto("/work");
  const workCards = page.locator(".jm-card");
  await expect(workCards).toHaveCount(2);
  await expect(workCards.getByRole("button", { name: /^Actions for|^Collapse|^Expand/ })).toHaveCount(0);
  await expect(workCards.getByRole("progressbar")).toHaveCount(0);
  await page.locator(".work-backlog").getByRole("button", { name: "Add backlog task" }).click();
  await advisory((expect) => expect(page.locator(".work-backlog textarea").last()).toBeFocused());

  await page.goto("/chores");
  const today = page.locator(".chores-due");
  const all = page.locator(".chores-all");
  await expect(today.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".jm-card").getByRole("progressbar")).toHaveCount(0);
  await expect(all.locator(":scope > header").getByRole("button")).toHaveCount(2);
  await expect(all.getByRole("button", { name: "Add chore", exact: true })).toBeVisible();
  const colors = await page
    .locator(".jm-card")
    .evaluateAll((cards) => cards.map((card) => card.style.getPropertyValue("--color")));
  expect(colors).toEqual(["", ""]);
  expect(appDataByPage.get(page).get("colors") ?? {}).not.toHaveProperty("chores-today");
  expect(appDataByPage.get(page).get("colors") ?? {}).not.toHaveProperty("chores-all");
  const dueCount = await today.getByRole("checkbox").count();
  await all.getByRole("button", { name: "Collapse All chores" }).click();
  await expect(all.getByRole("textbox", { name: "Task title", exact: true }).first()).toBeHidden();
  await expect(today.getByRole("checkbox")).toHaveCount(dueCount);
  await all.getByRole("button", { name: "Add chore" }).click();
  await advisory((expect) =>
    expect(all.getByRole("button", { name: "Collapse All chores" })).toHaveAttribute("aria-expanded", "true"),
  );
  await expect(all.getByRole("textbox")).toHaveCount(0);
  await advisory((expect) =>
    expect(page.getByRole("dialog").getByRole("textbox", { name: "Title", exact: true })).toBeFocused(),
  );
});

for (const route of ["printing", "cross-stitch"]) {
  test(`${route} cards open an edit modal and support project actions`, async ({ page }) => {
    await page.goto(`/${route}`);
    const projects = page.locator(".project-card");
    const project = projects.first();
    const menu = project.getByLabel(/^Actions for/);
    const originalTitle = (await project.getByRole("heading").textContent()).trim();
    const progress = project.getByRole("progressbar", { name: `Progress for ${originalTitle}`, exact: true });
    const addLabel = route === "printing" ? "Add item" : "Add color";

    await menu.focus();
    await menu.press("Enter");
    await expect(project.locator(".jm-card__menu-actions").getByRole("button")).toHaveText([
      "Edit",
      "Remove",
      addLabel,
    ]);
    await page.keyboard.press("Tab");
    await advisory((expect) => expect(project.getByRole("button", { name: "Edit", exact: true })).toBeFocused());
    await page.keyboard.press("Escape");
    await advisory((expect) => expect(menu).toBeFocused());
    await expect(project.getByRole("button", { name: "Edit", exact: true })).toBeHidden();
    await menu.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(project.getByRole("button", { name: "Edit", exact: true })).toBeHidden();

    await menu.click();
    await project.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit project", exact: true });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    const projectName = dialog.getByRole("textbox", { name: "Project name" });
    await advisory((expect) => expect(projectName).toBeFocused());
    await expect(projectName).toHaveValue(originalTitle);
    await projectName.fill("Discard this edit");
    await expect(project.locator('input[name="card-title"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await advisory((expect) => expect(menu).toBeFocused());
    await expect(project.getByRole("heading")).toHaveText(originalTitle);

    await menu.click();
    await project.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(dialog).toBeVisible();
    await projectName.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(1, 1);
    await expect(dialog).toBeHidden();
    await advisory((expect) => expect(menu).toBeFocused());
    await expect.poll(() => appDataByPage.get(page).get(route).projects[0].title).toBe(originalTitle);

    if (route === "printing") {
      await expect(progress).toHaveAttribute("value", "1");
      await expect(progress).toHaveAttribute("max", "3");
      await project.getByRole("checkbox", { name: "Complete Large cable clip" }).check();
      await expect(progress).toHaveAttribute("value", "2");
    }
    const count = await project.locator(".task-item").count();
    await project.getByRole("button", { name: `Collapse ${originalTitle}` }).click();
    await expect(project.locator(".task-list")).toBeHidden();
    await expect(progress).toBeVisible();
    await menu.click();
    await project.getByRole("button", { name: addLabel, exact: true }).click();
    await expect(project.locator(".task-list")).toBeVisible();
    await expect(project.locator(".task-item")).toHaveCount(count);
    await advisory((expect) =>
      expect(project.getByRole("button", { name: `Collapse ${originalTitle}` })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    if (route === "printing") {
      const itemName = dialog.getByRole("textbox", { name: "Item name" }).last();
      await advisory((expect) => expect(itemName).toBeFocused());
      await expect(itemName).toHaveValue("");
      await itemName.fill("Added item");
    } else {
      const thread = dialog.getByRole("combobox", { name: "Thread color" }).last();
      await advisory((expect) => expect(thread).toBeFocused());
      await thread.selectOption("dmc321");
      await dialog.getByRole("spinbutton", { name: "Crosses total" }).last().fill("100");
    }
    await dialog.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(project.locator(".task-item")).toHaveCount(count + 1);

    await menu.click();
    await project.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(projects).toHaveCount(1);
    await advisory((expect) => expect(page.getByRole("button", { name: "Add project" })).toBeFocused());
    await expect.poll(() => appDataByPage.get(page).get(route).projects.length).toBe(1);
    await page.reload();
    await expect(projects).toHaveCount(1);
    await expect(page.getByRole("heading", { name: originalTitle })).toHaveCount(0);
  });
}

test("items move down when checked and back up when unchecked after 500 milliseconds", async ({ page }) => {
  const testTime = Date.now();
  await page.clock.install({ time: testTime });
  await page.goto("/todos");
  await page.clock.pauseAt(testTime + 60_000);

  const todoTitles = page.locator("#todo-list-general textarea");
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.clock.runFor(499);
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.clock.runFor(1);
  await expect(todoTitles.last()).toHaveValue("Renew passport");

  await page.reload();
  await expect(todoTitles.last()).toHaveValue("Renew passport");
  await expect(page.getByRole("checkbox", { name: "Complete Renew passport" })).toBeChecked();

  await page.getByRole("checkbox", { name: "Complete Renew passport" }).uncheck();
  await page.clock.runFor(499);
  await expect(todoTitles.last()).toHaveValue("Renew passport");
  await page.clock.runFor(1);
  await expect(todoTitles.first()).toHaveValue("Renew passport");

  const data = appDataByPage.get(page);
  data.set("chores", {
    tasks: ["Water the plants", "Clean the kitchen"].map((title, index) => ({
      id: `chore-${index}`,
      title,
      details: "Every day",
      nextDue: "2026-01-01",
      completed: false,
      schedule: { frequency: "day", interval: 1, weekdays: [0], monthDays: [1], startDate: "2026-01-01" },
    })),
    occurrenceOrder: ["chore-0", "chore-1"],
  });

  await page.goto("/chores");
  await page.reload();
  const choreTitles = page.locator(".chores-due .task-item .title");
  await expect(choreTitles.first()).toHaveText("Water the plants");
  await page.getByRole("checkbox", { name: "Complete Water the plants" }).check();
  await page.clock.runFor(499);
  await expect(choreTitles.first()).toHaveText("Water the plants");
  await page.clock.runFor(1);
  await expect(choreTitles.last()).toHaveText("Water the plants");

  await page.getByRole("checkbox", { name: "Complete Water the plants" }).uncheck();
  await page.clock.runFor(499);
  await expect(choreTitles.last()).toHaveText("Water the plants");
  await page.clock.runFor(1);
  await expect(choreTitles.first()).toHaveText("Water the plants");

  await page.goto("/shopping");
  const shoppingTitles = page.locator(".shopping-card textarea");
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.getByRole("checkbox", { name: "Complete Oat milk" }).check();
  await page.clock.runFor(499);
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.clock.runFor(1);
  await expect(shoppingTitles.last()).toHaveValue("Oat milk");

  await page.getByRole("checkbox", { name: "Complete Oat milk" }).uncheck();
  await page.clock.runFor(499);
  await expect(shoppingTitles.last()).toHaveValue("Oat milk");
  await page.clock.runFor(1);
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");

  await page.goto("/printing");
  const printingTitles = page.locator(".project-card").first().locator(".task-item .title");
  await expect(printingTitles.first()).toHaveText("Large cable clip");
  await page.getByRole("checkbox", { name: "Complete Large cable clip" }).check();
  await page.clock.runFor(499);
  await expect(printingTitles.first()).toHaveText("Large cable clip");
  await page.clock.runFor(1);
  await expect(printingTitles.last()).toHaveText("Large cable clip");

  await page.getByRole("checkbox", { name: "Complete Large cable clip" }).uncheck();
  await page.clock.runFor(499);
  await expect(printingTitles.last()).toHaveText("Large cable clip");
  await page.clock.runFor(1);
  await expect(printingTitles.first()).toHaveText("Large cable clip");

  await page.goto("/cross-stitch");
  const stitch = page.locator(".project-card").first();
  const checkboxes = stitch.getByRole("checkbox");
  const firstId = await checkboxes.first().getAttribute("id");
  const checkbox = page.locator(`#${firstId}`);
  await checkbox.check();
  await page.clock.runFor(499);
  await expect(checkboxes.first()).toHaveAttribute("id", firstId);
  await page.clock.runFor(1);
  await expect(checkboxes.last()).toHaveAttribute("id", firstId);
  await checkbox.uncheck();
  await page.clock.runFor(499);
  await expect(checkboxes.last()).toHaveAttribute("id", firstId);
  await page.clock.runFor(1);
  await expect(checkboxes.first()).toHaveAttribute("id", firstId);
});

test("unknown application routes return to work", async ({ page }) => {
  await page.goto("/unknown-page");

  await expect(page).toHaveURL(/\/work$/);
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
});

test("new blank chores preserve a valid occurrence order", async ({ page }) => {
  await page.goto("/chores");
  await page.getByRole("button", { name: "Add chore" }).click();
  const title = page.getByRole("dialog").getByRole("textbox", { name: "Title", exact: true });
  await advisory((expect) => expect(title).toBeFocused());
  await title.fill("Clean the desk");
  await page.getByRole("dialog").getByRole("button", { name: "Add chore", exact: true }).click();
  const data = appDataByPage.get(page);
  await expect.poll(() => data.get("chores")?.tasks.some((task) => task.title === "Clean the desk")).toBe(true);
  expect(data.validationErrors).toEqual([]);
});

test("failed saves survive reload and clear the error after recovery", async ({ page }) => {
  await page.goto("/work");
  const data = appDataByPage.get(page);
  await expect.poll(() => data.get("work-tasks")?.length).toBeGreaterThan(0);
  data.setWriteFailure("work-tasks", 503);
  await page.locator(".jm-card:not(.work-backlog) textarea").first().fill("Recover this edit");
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  data.setWriteFailure("work-tasks", 0);
  await page.reload();
  await expect.poll(() => data.get("work-tasks")?.some((task) => task.title === "Recover this edit")).toBe(true);
  await expect(page.locator(".app-sync-error")).toHaveCount(0);
});

test("today updates across midnight without reloading the application", async ({ page }) => {
  const data = appDataByPage.get(page);
  data.set("work-tasks", [{ id: "midnight-task", title: "Carry into tomorrow", date: "2026-12-31" }]);
  data.set("work-statuses", { "2027-01-01": "pto" });
  data.set("chores", {
    occurrenceOrder: ["midnight-chore"],
    tasks: [
      {
        id: "midnight-chore",
        title: "New year chore",
        details: "Yearly",
        nextDue: "2027-01-01",
        completed: false,
      },
    ],
  });
  await page.clock.install({ time: new Date(2026, 11, 31, 23, 59, 50) });
  await page.goto("/work");
  await expect(page.locator(".jm-card:not(.work-backlog) time")).toHaveAttribute("datetime", "2026-12-31");
  await page.clock.runFor(10200);
  await expect(page.locator(".jm-card:not(.work-backlog) time")).toHaveAttribute("datetime", "2027-01-01");
  await advisory((expect) => expect(page.locator(".jm-calendar .day.today")).toHaveAttribute("aria-current", "date"));
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue("Carry into tomorrow");
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Work", exact: true }).locator("use"),
  ).toHaveAttribute("href", /#icon-pto$/);
  await page.getByRole("link", { name: "Chores", exact: true }).click();
  await expect(page.locator(".chores-due").getByText("Today", { exact: true })).toBeVisible();
});

test("catalog failures stay local and retry independently without blocking task pages", async ({ page }) => {
  let filamentRequests = 0;
  let fail = true;
  await page.route("**/api/catalogs/filaments?*", (route) => {
    filamentRequests++;
    return fail ? route.fulfill({ status: 503, body: "unavailable" }) : route.fallback();
  });
  await page.goto("/work");
  await expect(page.locator(".jm-card:not(.work-backlog)")).toBeVisible();
  expect(filamentRequests).toBe(0);
  await page.getByRole("link", { name: "Catalog", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry filament catalog" })).toBeVisible();
  await page.getByRole("link", { name: "DMC embroidery floss" }).click();
  await expect(page.locator(".jm-catalog-item").first()).toBeVisible();
  await page.getByRole("link", { name: "3D printing filament" }).click();
  await expect(page.getByRole("button", { name: "Retry filament catalog" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry filament catalog" }).click();
  await expect(page.locator(".jm-catalog-item").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry filament catalog" })).toHaveCount(0);
  const requestsAfterLoad = filamentRequests;
  await page.getByRole("link", { name: "Work", exact: true }).click();
  await page.getByRole("link", { name: "Catalog", exact: true }).click();
  await expect(page.locator(".jm-catalog-item").first()).toBeVisible();
  expect(filamentRequests).toBe(requestsAfterLoad);
});

test("pending todo edits recover against the older API while colors remain mocked", async ({ page }) => {
  const data = appDataByPage.get(page);
  data.setColorSupport(false);
  data.set("todos", {
    lists: [{ id: "general", title: "General", tasks: [{ id: "todo-1", title: "Before", completed: false }] }],
  });
  await page.goto("/todos");
  data.setWriteFailure("todos", 503);
  await page.getByRole("textbox", { name: "Task title" }).fill("Recover this edit");
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  data.setWriteFailure("todos", 0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue("Recover this edit");
  await expect.poll(() => data.get("todos").lists[0].tasks[0].title).toBe("Recover this edit");
  await expect(page.locator(".app-sync-error")).toHaveCount(0);
  expect(data.get("todos").lists[0].color).toBeUndefined();
});
