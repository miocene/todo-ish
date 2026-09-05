import { expect, test } from "@playwright/test";
import { APP_DATA_RESOURCES, validateAppDataResource } from "../backend/api/src/app-data-validation.mjs";
import { CARD_COLORS } from "../src/app/card-colors.js";
import filamentCatalog from "../backend/catalogs/bambu-filaments.snapshot.json" with { type: "json" };
import flossCatalog from "../backend/catalogs/dmc-floss.snapshot.json" with { type: "json" };

const appDataByPage = new WeakMap();

function emptyAppData(values, revisions) {
  return {
    initializedResources: Object.keys(values),
    revisions,
    workTasks: values["work-tasks"] ?? [],
    workStatuses: values["work-statuses"] ?? {},
    colors: values["colors"] ?? {},
    pages: {
      chores: values.chores ?? { occurrenceOrder: [], tasks: [] },
      todos: values.todos ?? { lists: [] },
      shopping: values.shopping ?? { tasks: [] },
      printing: values.printing ?? { projects: [] },
      crossStitch: values["cross-stitch"] ?? { projects: [] },
    },
    inventories: {
      filament: values["filament-inventory"] ?? {},
      floss: values["floss-inventory"] ?? {},
    },
  };
}

test.beforeEach(async ({ page }) => {
  const values = {};
  const revisions = Object.fromEntries(APP_DATA_RESOURCES.map((resource) => [resource, 0]));
  let supportsColors = true;
  const writeFailures = new Map();
  const validationErrors = [];
  let session = {
    authenticated: true,
    bootstrapRequired: false,
    user: { username: "owner", displayName: "Owner" },
  };
  const controller = {
    get: (resource) => values[resource],
    validationErrors,
    setWriteFailure: (resource, status) => writeFailures.set(resource, status),
    set: (resource, value) => {
      values[resource] = value;
    },
    setSession: (value) => {
      session = value;
    },
    setColorSupport: (value) => {
      supportsColors = value;
    },
  };
  appDataByPage.set(page, controller);

  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200, headers = {}) =>
      route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });

    if (request.method() === "GET" && url.pathname === "/api/auth/session") {
      await json(session);
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/data") {
      const data = emptyAppData(values, { ...revisions });
      if (!supportsColors) {
        delete data.colors;
        delete data.revisions.colors;
        data.initializedResources = data.initializedResources.filter((resource) => resource !== "colors");
      }
      await json(data);
      return;
    }

    const resourceMatch = /^\/api\/data\/([a-z-]+)$/.exec(url.pathname);
    if (request.method() === "PUT" && resourceMatch) {
      const resource = resourceMatch[1];
      if (writeFailures.get(resource)) {
        await json({ error: "Simulated save failure" }, writeFailures.get(resource));
        return;
      }
      if (!supportsColors && resource === "colors") {
        await json({ error: "Not Found" }, 404);
        return;
      }
      const expectedRevision = Number(/^"(\d+)"$/.exec(request.headers()["if-match"] || "")?.[1]);
      if (expectedRevision !== revisions[resource]) {
        await json({ error: "Revision conflict", currentRevision: revisions[resource] }, 409);
        return;
      }
      const submittedValue = request.postDataJSON();
      try {
        validateAppDataResource(resource, submittedValue);
      } catch (error) {
        validationErrors.push(error.message);
        await json({ error: error.message }, 400);
        return;
      }
      if (!supportsColors && resource === "todos") {
        for (const list of submittedValue.lists) delete list.color;
      }
      values[resource] =
        resource === "shopping" ? { tasks: submittedValue.tasks.filter((task) => !task.source) } : submittedValue;
      revisions[resource] += 1;
      await json({ resource, revision: revisions[resource] }, 200, { etag: `"${revisions[resource]}"` });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/catalogs/filaments") {
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 100);
      await json({
        total: filamentCatalog.entries.length,
        items: filamentCatalog.entries.slice(offset, offset + limit),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/catalogs/floss") {
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 100);
      const entries = flossCatalog.entries.map((thread) => ({
        ...thread,
        id: `dmc${thread.number.toLocaleLowerCase()}`,
      }));
      await json({ total: entries.length, items: entries.slice(offset, offset + limit) });
      return;
    }

    await json({ error: "Not found" }, 404);
  });
});

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
          : { user: { username: "owner", displayName: "Owner" } },
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

function localDateLabel(dayOffset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(date);
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
  const todayColor = await colorOf(page.locator(".work-day"));
  const backlogColor = await colorOf(page.locator(".work-backlog"));
  expect(CARD_COLORS).toContain(todayColor);
  expect(CARD_COLORS).toContain(backlogColor);
  await page.reload();
  expect(await colorOf(page.locator(".work-day"))).toBe(todayColor);
  expect(await colorOf(page.locator(".work-backlog"))).toBe(backlogColor);

  await page.goto("/todos");
  const listColor = await colorOf(page.locator(".task-page__section"));
  expect(CARD_COLORS).toContain(listColor);
  expect(data.get("todos").lists[0]).not.toHaveProperty("color");
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Still saved to the API");
  await expect.poll(() => data.get("todos").lists[0].tasks[0].title).toBe("Still saved to the API");
  await page.reload();
  expect(await colorOf(page.locator(".task-page__section"))).toBe(listColor);
  await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveValue("Still saved to the API");
  expect(data.get("todos").lists[0]).not.toHaveProperty("color");

  await page.goto("/printing");
  const projectColor = await colorOf(page.locator(".project-card"));
  expect(CARD_COLORS).toContain(projectColor);
  expect(data.get("printing").projects[0].color).toBe("#123456");
  await page.reload();
  expect(await colorOf(page.locator(".project-card"))).toBe(projectColor);
  expect(colorRequests).toEqual([]);
});

test("card colors migrate into the palette and persist without visible color controls", async ({ page }) => {
  const data = appDataByPage.get(page);
  data.set("todos", {
    lists: [
      { id: "general", title: "General", tasks: [] },
      { id: "home", title: "Home", color: "#e9c46a", tasks: [] },
    ],
  });
  data.set("printing", {
    projects: [{ id: "legacy-project", title: "Existing project", color: "#123456", description: "", tasks: [] }],
  });
  data.set("colors", { [`work-day:${localIsoDate(-1)}`]: "#633533" });

  const colorOf = (locator) => locator.evaluate((element) => element.style.getPropertyValue("--color"));
  await page.goto("/work");
  const todayColor = await colorOf(page.locator(".work-day"));
  const backlogColor = await colorOf(page.locator(".work-backlog"));
  expect(CARD_COLORS).toContain(todayColor);
  expect(CARD_COLORS).toContain(backlogColor);
  await expect
    .poll(() => data.get("colors"))
    .toMatchObject({
      [`work-day:${localIsoDate()}`]: todayColor,
      [`work-day:${localIsoDate(-1)}`]: "#633533",
      backlog: backlogColor,
    });
  expect(data.get("colors")).not.toHaveProperty("today");
  await page.getByRole("button", { name: `${localFullDateLabel(-1)}. No completed tasks`, exact: true }).click();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(-1));
  expect(await colorOf(page.locator(".work-day"))).toBe("#633533");
  await page.getByRole("button", { name: `${localFullDateLabel(-2)}. No completed tasks`, exact: true }).click();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(-2));
  const pastDayColor = await colorOf(page.locator(".work-day"));
  expect(CARD_COLORS).toContain(pastDayColor);
  await expect.poll(() => data.get("colors")[`work-day:${localIsoDate(-2)}`]).toBe(pastDayColor);
  await page.reload();
  expect(await colorOf(page.locator(".work-day"))).toBe(pastDayColor);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate());
  await page.reload();
  expect(await colorOf(page.locator(".work-day"))).toBe(todayColor);
  expect(await colorOf(page.locator(".work-backlog"))).toBe(backlogColor);

  await page.goto("/todos");
  const listColor = await colorOf(page.locator(".task-page__section"));
  expect(CARD_COLORS).toContain(listColor);
  await expect.poll(() => data.get("todos").lists[0].color).toBe(listColor);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  expect(await colorOf(page.locator(".task-page__section"))).toBe("#E9C46A");
  await page.reload();
  expect(await colorOf(page.locator(".task-page__section"))).toBe("#E9C46A");
  await page.getByRole("link", { name: "General", exact: true }).click();
  expect(await colorOf(page.locator(".task-page__section"))).toBe(listColor);

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
  await page.getByRole("link", { name: "New list", exact: true }).click();
  expect(await colorOf(page.locator(".task-page__section"))).toBe(newListColor);

  await page.goto("/printing");
  const projectColor = await colorOf(page.locator(".project-card"));
  expect(CARD_COLORS).toContain(projectColor);
  await expect.poll(() => data.get("printing").projects[0].color).toBe(projectColor);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await expect(page.locator(".project-card")).toHaveCSS("border-top-width", "1px");
  await page.reload();
  expect(await colorOf(page.locator(".project-card"))).toBe(projectColor);

  await page.goto("/cross-stitch");
  await page.getByRole("button", { name: "Add project" }).click();
  const newProjectColor = await colorOf(page.locator(".project-card").last());
  expect(CARD_COLORS).toContain(newProjectColor);
  await expect.poll(() => data.get("cross-stitch")?.projects.at(-1).color).toBe(newProjectColor);
  await page.reload();
  expect(await colorOf(page.locator(".project-card").last())).toBe(newProjectColor);
});

test("the root redirects to the single-day work calendar", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Work — Done-ish");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/work");
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
  await expect(page.locator(".jm-calendar__day")).toHaveCount(7);
  await expect(page.locator(".jm-calendar__activity")).toHaveCount(0);
  await expect(page.locator(".jm-calendar__day .jm-day-type__icon")).toHaveCount(7);
  await expect(page.locator(".jm-calendar__day")).toHaveCount(7);
  await expect(page.locator(".jm-calendar__day--selected")).toHaveAttribute("aria-current", "date");
  await expect(page.locator(".work-day")).toHaveCount(1);
  await expect(page.locator(".work-day--today")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Work" })).toHaveCount(1);
  const taskTitles = page.locator(".work-day .task-item__title");
  await expect(taskTitles).toHaveCount(6);
  expect(
    await taskTitles.evaluateAll((elements) =>
      elements.map((element) => element.querySelector("textarea")?.value ?? element.textContent),
    ),
  ).toEqual([
    "Triage inbox",
    "Prepare the quarterly planning notes",
    "Daily stand-up",
    "Review pull requests",
    "Pair on calendar navigation",
    "Update the team roadmap",
  ]);
  await expect(page.locator(".work-day--today .task-item")).toHaveCount(6);
  await expect(page.locator(".work-day .task-item__remove")).toHaveCount(6);
  expect(
    await page
      .locator(".work-day .task-item")
      .first()
      .locator(".task-item__actions button")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
  ).toEqual(["Delete Triage inbox", "Move Triage inbox to backlog"]);
  await expect(page.getByRole("checkbox", { name: /^Complete / })).toHaveCount(6);
  await expect.poll(() => appDataByPage.get(page).get("work-statuses")).toEqual({});

  const hashedVueAttributes = await page
    .locator("*")
    .evaluateAll((elements) =>
      elements.flatMap((element) => element.getAttributeNames()).filter((name) => /^data-v-[\da-f]+$/i.test(name)),
    );
  expect(hashedVueAttributes).toEqual([]);
});

test("editable work tasks create and focus the next item with Enter", async ({ page }) => {
  await page.goto("/");

  const today = page.locator(".work-day--today");
  const todayTitles = today.locator(".task-item__title textarea");
  const lastTitle = todayTitles.last();

  await lastTitle.focus();
  await lastTitle.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(todayTitles).toHaveCount(6);
  await expect(lastTitle).toBeFocused();

  await lastTitle.fill("Updated roadmap");
  await expect
    .poll(() =>
      appDataByPage
        .get(page)
        .get("work-tasks")
        ?.some((task) => task.title === "Updated roadmap"),
    )
    .toBe(true);
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

  await page.getByRole("button", { name: `${localFullDateLabel(1)}. No completed tasks`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(1));
  const futureTitles = page.locator(".work-day .task-item__title textarea");
  await futureTitles.last().press("Enter");
  await expect(futureTitles).toHaveCount(2);
  await expect(futureTitles.last()).toBeFocused();

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await today.locator(".task-item__pin").first().click();
  const backlogTitles = page.locator(".work-backlog .task-item__title textarea");
  await expect(backlogTitles).toHaveCount(1);
  await backlogTitles.last().press("Enter");
  await expect(backlogTitles).toHaveCount(2);
  await expect(backlogTitles.last()).toBeFocused();

  await page.reload();
  await expect(page.locator(".work-day--today .task-item__title textarea")).toHaveCount(6);
  await expect(page.locator(".work-backlog .task-item__title textarea")).toHaveCount(1);

  await page.getByRole("button", { name: `${localFullDateLabel(1)}. No completed tasks`, exact: true }).click();
  await expect(page.locator(".work-day .task-item__title textarea")).toHaveCount(1);
});

test("work date navigation keeps one selected day and preserves empty dates", async ({ page }) => {
  await page.goto("/work");

  await page.getByRole("button", { name: `${localFullDateLabel(1)}. No completed tasks`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(1));
  await expect(page.locator(".work-day .task-item")).toHaveCount(1);
  await expect(page.locator(".work-day")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: localDateLabel(1) })).toBeVisible();

  await page.getByRole("button", { name: `${localFullDateLabel(2)}. No completed tasks`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(2));
  await expect(page.getByText("Nothing recorded for this day.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Today", exact: true })).toBeEnabled();

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(1));
  await expect(page.locator(".work-day .task-item")).toHaveCount(1);
});

test("work date navigation shows fewer nearby days on small screens", async ({ page }) => {
  for (const [width, count] of [
    [430, 3],
    [600, 5],
  ]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/work");

    await expect(page.locator(".jm-calendar__day")).toHaveCount(count);
    await expect(page.locator(".jm-calendar__day--selected")).toHaveCount(1);
    await page.getByRole("button", { name: `Next ${count} days` }).click();
    await expect(page.locator(".jm-calendar__day").first()).toHaveAttribute(
      "aria-label",
      `${localFullDateLabel(count - Math.floor(count / 2))}. No completed tasks`,
    );
    await expect(page.locator(".jm-calendar__day--selected")).toHaveCount(0);
    await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate());
    expect(new URL(page.url()).searchParams.get("date")).toBeNull();
    await page.getByRole("button", { name: `Previous ${count} days` }).click();
    await expect(page.locator(".jm-calendar__day--selected")).toHaveCount(1);
    await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate());

    await page.getByRole("button", { name: `Next ${count} days` }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.locator(".jm-calendar__day--selected")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Today", exact: true })).toBeDisabled();
    await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate());
  }
});

test("the backlog add button creates, focuses, and saves a task", async ({ page }) => {
  await page.goto("/");

  const addBacklogTask = page.getByRole("button", { name: "Add backlog task" });
  await addBacklogTask.click();
  const backlogTitle = page.locator(".work-backlog .task-item__title textarea");
  await expect(backlogTitle).toHaveCount(1);
  await expect(backlogTitle).toBeFocused();
  await page.getByRole("button", { name: "Search" }).focus();
  await expect(backlogTitle).toHaveCount(0);
  await expect
    .poll(() =>
      appDataByPage
        .get(page)
        .get("work-tasks")
        ?.every((task) => task.title.trim()),
    )
    .toBe(true);

  await addBacklogTask.click();
  await backlogTitle.fill("Plan the next sprint");

  await page.reload();
  await expect(page.locator(".work-backlog .task-item__title textarea")).toHaveValue("Plan the next sprint");
});

test("work tasks can be deleted from the selected day and backlog", async ({ page }) => {
  await page.goto("/work");

  await page.getByRole("button", { name: "Delete Triage inbox" }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Triage inbox" })).toHaveCount(0);

  await page.getByRole("button", { name: "Add backlog task" }).click();
  const backlogTitle = page.locator(".work-backlog .task-item__title textarea");
  await backlogTitle.fill("Remove this backlog task");
  await page.getByRole("button", { name: "Delete Remove this backlog task" }).click();
  await expect(backlogTitle).toHaveCount(0);
  await expect
    .poll(() =>
      appDataByPage
        .get(page)
        .get("work-tasks")
        ?.every((task) => task.title !== "Triage inbox" && task.title !== "Remove this backlog task"),
    )
    .toBe(true);
});

test("task completion persists and unfinished tasks roll into today", async ({ page }) => {
  const testTime = Date.now();
  await page.clock.install({ time: testTime });
  await page.goto("/");
  await page.clock.pauseAt(testTime + 60_000);

  const today = page.locator(".work-day--today");
  await expect(today.locator(".task-item")).toHaveCount(6);

  await today.getByRole("button", { name: "Move Triage inbox to backlog" }).click();
  const backlogCheckbox = page.locator(".work-backlog").getByRole("checkbox", { name: "Complete Triage inbox" });
  await backlogCheckbox.click();
  await expect(backlogCheckbox).toHaveCount(0);

  const todayCheckbox = today.getByRole("checkbox", { name: "Complete Triage inbox" });
  await expect(todayCheckbox).toBeChecked();
  await expect(page.locator(".jm-calendar__day--selected .jm-day-type__icon")).toHaveAttribute("data-level", "1");
  await expect(page.locator(".jm-calendar__day--selected")).toHaveAttribute("aria-label", /1 completed task$/);
  const completedTask = todayCheckbox.locator("xpath=..");
  await expect(completedTask).toHaveClass(/task-item--completed/);
  await expect(today.getByRole("button", { name: "Move Triage inbox to backlog" })).toHaveCount(0);
  await expect(
    page.locator('.task-item__drag-handle, .task-item__drag-handle-placeholder, [draggable="true"]'),
  ).toHaveCount(0);
  await expect(page.locator(".work-backlog").getByRole("checkbox", { name: "Complete Triage inbox" })).toHaveCount(0);
  await expect(todayCheckbox).toBeChecked();
  const todayTitles = today.getByRole("textbox", { name: "Task title", exact: true });
  await expect(todayTitles.first()).toHaveValue("Triage inbox");
  await page.clock.runFor(499);
  await expect(todayTitles.first()).toHaveValue("Triage inbox");
  await page.clock.runFor(1);
  await expect(todayTitles.last()).toHaveValue("Triage inbox");
  await expect
    .poll(() =>
      appDataByPage
        .get(page)
        .get("work-tasks")
        ?.some((task) => task.title === "Triage inbox" && Boolean(task.checkedAt)),
    )
    .toBe(true);

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Complete Triage inbox" })).toBeChecked();
});

test("work activity is grouped by the task's assigned date", async ({ page }) => {
  const assignedDayOffset = -1;
  const completionDayOffset = 0;
  appDataByPage.get(page).set("work-tasks", [
    {
      id: "completed-assigned-work",
      date: localIsoDate(assignedDayOffset),
      title: "Completed assigned work",
      checkedAt: `${localIsoDate(completionDayOffset)}T12:00:00.000Z`,
    },
  ]);

  await page.goto(`/work?date=${localIsoDate(assignedDayOffset)}`);

  const assignedDay = page.locator(".jm-calendar__day--selected");
  const completionDay = page.getByRole("button", {
    name: `${localFullDateLabel(completionDayOffset)}. No completed tasks`,
  });
  await expect(assignedDay).toHaveAttribute("aria-label", `${localFullDateLabel(assignedDayOffset)}. 1 completed task`);
  await expect(assignedDay.locator(".jm-day-type__icon")).toHaveAttribute("data-level", "1");
  await expect(completionDay.locator(".jm-day-type__icon")).toHaveAttribute("data-level", "0");
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

test("profile shows yearly task activity and newly checked items", async ({ page }) => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  await page.goto("/todos");
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.getByRole("button", { name: "Profile" }).click();

  await expect(page.getByRole("navigation", { name: "Activity years" }).getByRole("link")).toHaveCount(5);
  await expect(page.getByRole("link", { name: String(currentYear), exact: true })).toHaveAttribute(
    "aria-current",
    "page",
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
    { path: "/todos", name: "Todo lists", first: "General", next: "Home", query: "list", value: "home" },
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

test("task pages render their variants and save changes immediately", async ({ page }) => {
  await page.goto("/chores");

  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Today and upcoming", "All chores"]);
  const upcomingChores = page.locator(".chores-upcoming .task-item");
  const allChores = page.locator(".chores-all .task-item");
  await expect(upcomingChores).toHaveCount(3);
  await expect(allChores).toHaveCount(3);
  await expect(upcomingChores.getByRole("checkbox")).toHaveCount(3);
  await expect(allChores.getByRole("checkbox")).toHaveCount(0);
  expect(
    await allChores
      .locator("input[name='chore-repeat-rule']")
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["Every Saturday", "Every 2 weeks on Sunday", "Every Wednesday"]);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin, .task-item__remove")).toHaveCount(0);
  await page.getByRole("button", { name: "Add chore" }).click();
  await expect(allChores).toHaveCount(4);
  await expect(upcomingChores).toHaveCount(3);
  await page.getByRole("button", { name: "Add chore" }).focus();
  await expect(allChores).toHaveCount(3);
  await allChores.first().locator("textarea").fill("Water all the plants");
  await allChores.first().locator("input[name='chore-repeat-rule']").fill("Every other Saturday");
  await upcomingChores.getByRole("checkbox", { name: "Complete Water all the plants" }).check();
  await page.reload();
  await expect(page.locator(".chores-all textarea").first()).toHaveValue("Water all the plants");
  await expect(page.locator(".chores-all input[name='chore-repeat-rule']").first()).toHaveValue("Every other Saturday");
  await expect(page.getByRole("checkbox", { name: "Complete Water all the plants" })).toBeChecked();

  await page.goto("/todos");
  const listTabs = page.getByRole("navigation", { name: "Todo lists" }).getByRole("link");
  await expect(listTabs).toHaveText(["General", "Home", "Travel"]);
  await expect(listTabs.first()).toHaveAttribute("aria-current", "page");
  await listTabs.getByText("Home", { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("list")).toBe("home");
  await expect(page.getByRole("heading", { level: 2, name: "Home" })).toBeVisible();
  const homeTasks = page.locator(".task-page__section .task-item__title textarea");
  await homeTasks.last().press("Enter");
  await expect(homeTasks).toHaveCount(3);
  await expect(homeTasks.last()).toBeFocused();
  await page.getByRole("navigation", { name: "Todo lists" }).locator('[aria-current="page"]').focus();
  await expect(homeTasks).toHaveCount(2);
  await expect(page.locator(".task-item__drag-handle, .task-item__pin")).toHaveCount(0);

  await page.goto("/shopping");
  await expect(page.locator(".task-item__remove")).toHaveCount(7);
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
  await page.getByRole("checkbox", { name: "Complete DMC 3853 · Autumn Gold Dk floss · 1 skein" }).check();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/catalog");
  await expect.poll(() => new URL(page.url()).searchParams.get("catalog")).toBe("floss");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("dmc3853");
  await expect(page.getByLabel("Search floss")).toHaveValue("dmc3853");

  await page.goto("/shopping");
  await expect(page.locator(".task-item__remove").first().locator("use")).toHaveAttribute("href", /#icon-remove$/);
  await page.getByRole("button", { name: "Remove Oat milk from shopping list" }).click();
  await expect(page.locator(".task-page__tasks .task-item")).toHaveCount(6);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator(".task-page__tasks .task-item")).toHaveCount(7);
  await page.getByRole("button", { name: "Add item" }).focus();
  await expect(page.locator(".task-page__tasks .task-item")).toHaveCount(6);
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
  await expect(projects.first().locator(".task-item__title textarea")).toHaveCount(4);
  await expect(projects.first().locator(".task-item__title textarea").last()).toBeFocused();
  await projects.first().getByRole("button", { name: "Add item" }).focus();
  await expect(projects.first().locator(".task-item__title textarea")).toHaveCount(3);

  await page.getByRole("button", { name: "Add project" }).click();
  await expect(projects).toHaveCount(3);
  const newProject = projects.last();
  await expect(newProject.getByLabel("Project title")).toBeFocused();
  await newProject.getByLabel("Project title").fill("Headphone stand");
  const projectColor = await newProject.evaluate((card) => card.style.getPropertyValue("--color"));
  expect(CARD_COLORS).toContain(projectColor);
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
  expect(await savedProject.evaluate((card) => card.style.getPropertyValue("--color"))).toBe(projectColor);
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
  const stitchProject = page.locator(".project-card").first();
  await expect(stitchProject.getByLabel("Project title")).toHaveValue("Botanical sampler");
  await expect(stitchProject.getByLabel("Project color")).toHaveCount(0);
  expect(CARD_COLORS).toContain(await stitchProject.evaluate((card) => card.style.getPropertyValue("--color")));
  await expect(stitchProject.getByText("2,400 total crosses", { exact: true })).toBeVisible();
  await expect(stitchProject.getByRole("checkbox")).toHaveCount(0);
  const stitchColors = stitchProject.locator('select[name="stitch-floss"]');
  await expect(stitchColors).toHaveCount(3);
  await expect(stitchProject.locator(".stitch-color__fields--missing")).toHaveCount(2);
  await expect(stitchProject.getByText("971 / 2,400 crosses · 40%", { exact: true })).toBeVisible();
  await stitchProject.getByLabel("Crosses done").first().fill("1200");
  await expect(stitchProject.locator(".task-item--completed")).toHaveCount(2);
  await expect(stitchProject.getByText("1,600 / 2,400 crosses · 67%", { exact: true })).toBeVisible();
  await stitchProject.getByRole("button", { name: "Add color" }).click();
  await expect(stitchColors).toHaveCount(4);
  await expect(stitchColors.last()).toBeFocused();

  await page.goto("/catalog");
  await expect(page.getByRole("navigation", { name: "Catalog" }).getByRole("link")).toHaveText([
    "3D printing filament",
    "DMC embroidery floss",
  ]);
  await expect(page.getByRole("link", { name: "3D printing filament" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "DMC embroidery floss" }).click();
  await expect(page.getByRole("link", { name: "DMC embroidery floss" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Search floss")).toBeVisible();
  await page.getByRole("link", { name: "3D printing filament" }).click();
  await expect(page.getByLabel("Search filaments")).toBeVisible();
  await expect(page.locator(".jm-catalog-item")).toHaveCount(265);
  await expect(page.getByText("265 filaments", { exact: true })).toBeVisible();
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
  await expect(page.getByLabel("Spools owned")).toHaveAccessibleDescription("Required spools: 2");
  await expect(page.getByLabel("Spools owned")).toHaveValue("1");
  await page.getByLabel("Spools owned").fill("2");
  await expect(page.locator(".jm-catalog-item--missing")).toHaveCount(0);
  await expect
    .poll(() => appDataByPage.get(page).get("filament-inventory")?.["bambu-pla-basic-filament-10601"])
    .toBe(2);

  await page.goto("/printing");
  await expect(page.locator(".printing-filament--missing")).toHaveCount(1);
  await expect(page.getByText("Missing 1 spool · 1 owned")).toHaveCount(0);

  await page.goto("/catalog?catalog=floss&q=dmc3853");
  await expect(page.getByRole("link", { name: "DMC embroidery floss" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Search floss")).toHaveValue("dmc3853");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "DMC 3853 · Autumn Gold Dk" })).toBeVisible();
  await expect(page.getByRole("link", { name: /DMC 3853 · Autumn Gold Dk/ })).toHaveAttribute(
    "href",
    "https://www.breibrink.nl/dmc-3853.html",
  );
  await expect(page.locator(".jm-catalog-item__required")).toHaveText("/ 1");
  await expect(page.getByLabel("Skeins owned")).toHaveAccessibleDescription("Required skeins: 1");
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

test("completed items move to the bottom after 500 milliseconds on every task page", async ({ page }) => {
  const testTime = Date.now();
  await page.clock.install({ time: testTime });
  await page.goto("/todos");
  await page.clock.pauseAt(testTime + 60_000);

  const todoTitles = page.locator(".task-page__section .task-item__title textarea");
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.clock.runFor(499);
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.clock.runFor(1);
  await expect(todoTitles.last()).toHaveValue("Renew passport");

  await page.reload();
  await expect(page.locator(".task-page__section .task-item__title textarea").last()).toHaveValue("Renew passport");
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
  const shoppingTitles = page.locator(".task-page__tasks .task-item__title textarea");
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.getByRole("checkbox", { name: "Complete Oat milk" }).check();
  await page.clock.runFor(499);
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.clock.runFor(1);
  await expect(shoppingTitles.last()).toHaveValue("Oat milk");

  await page.goto("/printing");
  const printingTitles = page.locator(".project-card").first().locator(".task-item__title textarea");
  await expect(printingTitles.first()).toHaveValue("Large cable clip");
  await page.getByRole("checkbox", { name: "Complete Large cable clip" }).check();
  await page.clock.runFor(499);
  await expect(printingTitles.first()).toHaveValue("Large cable clip");
  await page.clock.runFor(1);
  await expect(printingTitles.last()).toHaveValue("Large cable clip");
});

test("the work page browses full rows without changing the selected date", async ({ page }) => {
  await page.goto(`/work?date=${localIsoDate(-2)}`);

  await expect(page.locator(".jm-calendar__day")).toHaveCount(7);
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(-2));
  await expect(page.locator(".work-day .task-item")).toHaveCount(0);

  const nextButton = page.getByRole("button", { name: "Next 7 days" });
  const previousButton = page.getByRole("button", { name: "Previous 7 days" });
  await expect(page.getByRole("button", { name: "Today" })).toHaveClass(/jm-button/);
  await expect(nextButton).toHaveClass(/jm-button/);
  await expect(previousButton).toHaveClass(/jm-button/);
  await expect(nextButton.locator("use")).toHaveAttribute("href", /#icon-chevron-right$/);
  await expect(previousButton.locator("use")).toHaveAttribute("href", /#icon-chevron-left$/);

  const rowLabels = (startOffset) => Array.from({ length: 7 }, (_, index) => localFullDateLabel(startOffset + index));
  const visibleRowLabels = () =>
    page
      .locator(".jm-calendar__day")
      .evaluateAll((days) => days.map((day) => day.getAttribute("aria-label").split(".")[0]));
  await expect.poll(visibleRowLabels).toEqual(rowLabels(-5));

  // Choosing another date in the row must not change the next page's starting date.
  await page.getByRole("button", { name: `${localFullDateLabel(-1)}. No completed tasks`, exact: true }).click();
  await expect.poll(visibleRowLabels).toEqual(rowLabels(-5));

  await nextButton.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(-1));
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(-1));
  await expect(page.locator(".jm-calendar__day--selected")).toHaveCount(0);
  await expect(page.locator(".work-day")).toHaveCount(1);
  await expect.poll(visibleRowLabels).toEqual(rowLabels(2));

  await previousButton.click();
  await expect.poll(visibleRowLabels).toEqual(rowLabels(-5));
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(-1));
  await expect(page.locator(".jm-calendar__day--selected")).toHaveCount(1);

  await nextButton.click();
  await page.getByRole("button", { name: `${localFullDateLabel(5)}. No completed tasks`, exact: true }).click();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(5));
  await expect.poll(visibleRowLabels).toEqual(rowLabels(2));
  await previousButton.click();
  await expect.poll(visibleRowLabels).toEqual(rowLabels(-5));
  await expect(page.locator(".jm-calendar__day--selected")).toHaveCount(0);

  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(5));
  expect(new URL(page.url()).hash).toBe("#main-content");
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(5));
});

test("work history stops at the first checked task", async ({ page }) => {
  await page.goto(`/work?date=${localIsoDate(-3)}`);

  const previousButton = page.getByRole("button", { name: "Previous 7 days" });
  await previousButton.click();

  await expect(previousButton).toBeDisabled();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(-3));
  await expect(page.locator(".jm-calendar__day:disabled")).toHaveCount(6);
  await page.getByRole("button", { name: `${localFullDateLabel(-7)}. 1 completed task`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(-7));
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(-7));
  await expect(page.locator(".work-day .task-item__title")).toHaveText("Set up the work calendar");
  await expect(previousButton).toBeDisabled();
  await page.getByRole("button", { name: "Next 7 days" }).click();
  await expect(previousButton).toBeEnabled();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(-7));
});

test("future work is limited to fourteen days from today", async ({ page }) => {
  await page.goto(`/work?date=${localIsoDate(9)}`);

  const nextButton = page.getByRole("button", { name: "Next 7 days" });
  await nextButton.click();

  await expect(nextButton).toBeDisabled();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(9));
  await expect(page.locator(".jm-calendar__day:disabled")).toHaveCount(5);
  await page.getByRole("button", { name: `${localFullDateLabel(14)}. No completed tasks`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(localIsoDate(14));
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(14));
  await expect(nextButton).toBeDisabled();
  await page.getByRole("button", { name: "Previous 7 days" }).click();
  await expect(nextButton).toBeEnabled();
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", localIsoDate(14));
});

test("work day types are saved by date and update today's navigation icon", async ({ page }) => {
  await page.goto("/");

  const dayTypeTrigger = page.getByRole("combobox", { name: /^Change day type for / });
  const workNavigationIcon = page.getByRole("link", { name: "Work" }).locator("use");

  await expect(
    page.locator(".jm-calendar__day--selected").getByRole("combobox", { name: /^Change day type for / }),
  ).toBeVisible();
  await expect(page.locator(".work-day").getByRole("combobox", { name: /^Change day type for / })).toHaveCount(0);

  await dayTypeTrigger.click();
  await page.getByRole("option", { name: "PTO", exact: true }).click();
  await expect(workNavigationIcon).toHaveAttribute("href", /#icon-pto$/);

  await page.reload();
  await dayTypeTrigger.click();
  await expect(dayTypeTrigger).toHaveValue("pto");
  await expect(workNavigationIcon).toHaveAttribute("href", /#icon-pto$/);
  await page.keyboard.press("Escape");
  await expect(dayTypeTrigger).toBeFocused();

  await page.goto("/work?date=2000-01-03");
  await dayTypeTrigger.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(dayTypeTrigger).toHaveValue("conference");
  await expect(workNavigationIcon).toHaveAttribute("href", /#icon-pto$/);

  await page.reload();
  await dayTypeTrigger.click();
  await expect(dayTypeTrigger).toHaveValue("conference");

  await page.getByRole("button", { name: "Today" }).click();
  await dayTypeTrigger.click();
  await expect(dayTypeTrigger).toHaveValue("pto");
});

test("work entry points return the calendar to today without a date query", async ({ page }) => {
  const expectTodayWithoutDateQuery = async () => {
    await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBeNull();
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect(page.locator(".work-day--today")).toHaveCount(1);
  };

  await page.goto("/work?date=2000-01-02");
  await page.getByRole("button", { name: "Today" }).click();
  await expectTodayWithoutDateQuery();

  await page.goto("/work?date=2000-01-02");
  await page.getByRole("link", { name: "ToDo-ish, Work" }).click();
  await expectTodayWithoutDateQuery();

  await page.goto("/work?date=2000-01-02");
  await page.getByRole("link", { name: "Work", exact: true }).click();
  await expectTodayWithoutDateQuery();

  await page.goto("/work?date=not-a-date");
  await expectTodayWithoutDateQuery();
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
  const title = page.locator(".chores-all textarea").last();
  await expect(title).toBeFocused();
  await title.fill("Clean the desk");
  const data = appDataByPage.get(page);
  await expect.poll(() => data.get("chores")?.tasks.some((task) => task.title === "Clean the desk")).toBe(true);
  expect(data.validationErrors).toEqual([]);
});

test("failed saves survive reload and clear the error after recovery", async ({ page }) => {
  await page.goto("/work");
  const data = appDataByPage.get(page);
  await expect.poll(() => data.get("work-tasks")?.length).toBeGreaterThan(0);
  data.setWriteFailure("work-tasks", 503);
  await page.locator(".work-day textarea").first().fill("Recover this edit");
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  data.setWriteFailure("work-tasks", 0);
  await page.reload();
  await expect.poll(() => data.get("work-tasks")?.some((task) => task.title === "Recover this edit")).toBe(true);
  await expect(page.locator(".app-sync-error")).toHaveCount(0);
});

test("an empty todo collection can create its first list and save a task", async ({ page }) => {
  const data = appDataByPage.get(page);
  data.set("todos", { lists: [] });
  await page.goto("/todos?list=missing");
  await expect(page.getByText("No lists yet. Add a list to get started.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add list", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New list" })).toBeVisible();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("First task");
  await expect.poll(() => data.get("todos").lists[0]?.tasks[0]?.title).toBe("First task");
  expect(CARD_COLORS).toContain(data.get("todos").lists[0].color);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue("First task");
  await page.getByRole("button", { name: "Add list", exact: true }).click();
  await expect.poll(() => data.get("todos").lists.length).toBe(2);
  expect(new Set(data.get("todos").lists.map((list) => list.id)).size).toBe(2);
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
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", "2026-12-31");
  await page.clock.runFor(10200);
  await expect(page.locator(".work-day time")).toHaveAttribute("datetime", "2027-01-01");
  await expect(page.locator(".jm-calendar__day--today")).toHaveAttribute("aria-current", "date");
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue("Carry into tomorrow");
  await expect(page.locator(".jm-navigation__link").first().locator("use")).toHaveAttribute("href", /#icon-pto$/);
  await page.getByRole("link", { name: "Chores", exact: true }).click();
  await expect(page.locator(".chores-upcoming").getByText("Today", { exact: true })).toBeVisible();
});

test("catalog failures stay local and retry independently without blocking task pages", async ({ page }) => {
  let filamentRequests = 0;
  let fail = true;
  await page.route("**/api/catalogs/filaments?*", (route) => {
    filamentRequests++;
    return fail ? route.fulfill({ status: 503, body: "unavailable" }) : route.fallback();
  });
  await page.goto("/work");
  await expect(page.locator(".work-day")).toBeVisible();
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
