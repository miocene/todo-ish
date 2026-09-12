import { advisory, test, expect, appDataByPage } from "./app-fixture.js";

test("anonymous visitors see passkey setup before application data", async ({
  page,
}) => {
  appDataByPage.get(page).setSession({
    authenticated: false,
    bootstrapRequired: true,
    user: null,
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Create your passkey" }),
  ).toBeVisible();
  await expect(page.getByLabel("One-time setup code")).toBeVisible();
  await expect(page.getByLabel("One-time setup code")).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("button", { name: "Create passkey" }),
  ).toBeVisible();
  await expect(page.locator(".jm-header")).toHaveCount(0);
});

test("startup waits for saved data before loading the application", async ({
  page,
}) => {
  const data = appDataByPage.get(page);
  data.set("work-tasks", [
    { id: "saved-task", title: "Saved task", date: "2026-09-06" },
  ]);
  data.set("work-statuses", { "2026-09-05": "pto" });
  await page.clock.install({ time: new Date(2026, 8, 5, 12) });

  let releaseData;
  const dataReady = new Promise((resolve) => {
    releaseData = resolve;
  });
  await page.route(
    (url) => url.pathname === "/api/data",
    async (route) => {
      await dataReady;
      await route.fallback();
    },
  );
  await page.goto("/work?date=2026-09-06");
  await expect(page.getByRole("status")).toHaveText("Opening Done-ish…");
  await expect(page.locator(".jm-header")).toHaveCount(0);

  releaseData();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue(
    "Saved task",
  );
  await expect(
    page.getByRole("link", { name: "Work", exact: true }).locator("use"),
  ).toHaveAttribute("href", /#icon-pto$/);
  await expect(page).toHaveURL(/\/work\?date=2026-09-06$/);
  await expect(page).toHaveTitle("Work — Done-ish");
});

for (const resource of ["auth/session", "data"]) {
  test(`startup retries a failed ${resource} request without reloading`, async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === `/api/${resource}`,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Offline" }),
        }),
      { times: 1 },
    );
    await page.goto("/shopping");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".jm-header")).toHaveCount(0);

    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Shopping cart", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(/\/shopping$/);
  });
}

test("passkey sign-in opens the requested page after loading data", async ({
  page,
}) => {
  appDataByPage
    .get(page)
    .setSession({ authenticated: false, bootstrapRequired: false, user: null });
  let dataRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/data") dataRequests += 1;
  });
  await page.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator.credentials), "get", {
      value: async () => ({ toJSON: () => ({ id: "test-passkey" }) }),
    });
  });
  await page.route("**/api/auth/authentication/*", (route) => {
    const options = route.request().url().endsWith("/options");
    const user = { id: "owner", username: "owner", displayName: "Owner" };
    if (!options)
      appDataByPage
        .get(page)
        .setSession({ authenticated: true, bootstrapRequired: false, user });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        options ? { challenge: "dGVzdA", rpId: "todo-ish.today" } : { user },
      ),
    });
  });
  await page.goto("/shopping");
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  expect(dataRequests).toBe(0);

  await page
    .getByRole("button", { name: "Sign in with passkey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Shopping cart", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/shopping$/);
  expect(dataRequests).toBe(1);
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
    await expect(
      page.getByRole("heading", {
        level: path === "/shopping" ? 2 : 1,
        name: label,
      }),
    ).toBeVisible();
    await advisory((expect) =>
      expect(link).toHaveAttribute("aria-current", "page"),
    );
  }

  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/profile");
  await expect(page).toHaveTitle("Profile — Done-ish");
  await expect(
    page.getByRole("heading", { level: 1, name: "Activity" }),
  ).toBeVisible();
});

test("unknown application routes return to work", async ({ page }) => {
  await page.goto("/unknown-page");

  await expect(page).toHaveURL(/\/work$/);
  expect(new URL(page.url()).hash).toBe("");
  await expect(
    page.getByRole("heading", { name: "Work", exact: true }),
  ).toBeVisible();
});

test("today updates across midnight without reloading the application", async ({
  page,
}) => {
  const data = appDataByPage.get(page);
  data.set("work-tasks", [
    { id: "midnight-task", title: "Carry into tomorrow", date: "2026-12-31" },
  ]);
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
  await expect(
    page.locator(".jm-card:not(.work-backlog) time"),
  ).toHaveAttribute("datetime", "2026-12-31");
  await page.clock.runFor(10200);
  await expect(
    page.locator(".jm-card:not(.work-backlog) time"),
  ).toHaveAttribute("datetime", "2027-01-01");
  await advisory((expect) =>
    expect(page.locator(".jm-calendar .day.today")).toHaveAttribute(
      "aria-current",
      "date",
    ),
  );
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue(
    "Carry into tomorrow",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Work", exact: true })
      .locator("use"),
  ).toHaveAttribute("href", /#icon-pto$/);
  await page.getByRole("link", { name: "Chores", exact: true }).click();
  await expect(
    page.locator(".chores-due").getByText("Today", { exact: true }),
  ).toBeVisible();
});
