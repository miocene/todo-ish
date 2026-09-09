import { test, expect } from "./app-fixture.js";

const manual = (id, title, completedAt) => ({
  id,
  title,
  completed: Boolean(completedAt),
  ...(completedAt && { completedAt }),
});

test("navigation choices save to the account and another account ignores its pending drafts", async ({
  page,
  appData,
}) => {
  appData.set("preferences", { hiddenNavigation: ["printing"] });
  await page.goto("/work");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link", { name: "3D printing" })).toHaveCount(0);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("switch", { name: "Chores", exact: true }).click();
  await expect.poll(() => appData.get("preferences").hiddenNavigation).toEqual(["chores", "printing"]);
  await page.reload();
  await expect(navigation.getByRole("link", { name: "Chores", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem(
      "done-ish.pending-write.v2:owner:private-draft",
      JSON.stringify({
        id: "private-draft",
        resource: "work-tasks",
        revision: 0,
        value: [{ id: "private", title: "Other user's private draft", date: null }],
      }),
    );
    localStorage.setItem("done-ish.hidden-navigation.v1", JSON.stringify(["work"]));
  });
  appData.setSession({
    authenticated: true,
    bootstrapRequired: false,
    user: { id: "second", username: "second", displayName: "Second" },
  });
  appData.set("preferences", { hiddenNavigation: [] });
  appData.set("work-tasks", []);
  await page.reload();
  await expect(navigation.getByRole("link", { name: "3D printing" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByText("Other user's private draft", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("done-ish.pending-write.v2:owner:private-draft")),
  ).not.toBeNull();
});

test("shared shopping changes refresh while the page stays open", async ({ page, appData }) => {
  appData.set("shopping", { tasks: [manual("milk", "Milk")] });
  appData.set("printing", { projects: [] });
  appData.set("cross-stitch", { projects: [] });
  await page.goto("/shopping");
  await expect(page.locator("#shopping-title-milk")).toHaveValue("Milk");
  appData.update("shopping", {
    tasks: [manual("milk", "Oat milk", "2026-09-09T12:00:00.000Z"), manual("bread", "Bread")],
  });
  await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  await expect(page.locator("#shopping-title-milk")).toHaveValue("Oat milk");
  await expect(page.locator("#task-item-complete-milk")).toBeChecked();
  await expect(page.locator("#shopping-title-bread")).toHaveValue("Bread");
  await page.locator("#shopping-title-bread").fill("Rye bread");
  await expect.poll(() => appData.get("shopping").tasks.find((item) => item.id === "bread").title).toBe("Rye bread");
  expect(appData.validationErrors).toEqual([]);
});

test("a pre-created second account can enter its one-time setup code", async ({ page, appData }) => {
  appData.setSession({ authenticated: false, bootstrapRequired: false, user: null });
  let received;
  await page.route("**/api/auth/registration/options", async (route) => {
    received = route.request().postDataJSON();
    await route.fulfill({ status: 401, json: { error: "The setup code is invalid, expired, or already used" } });
  });
  await page.goto("/work");
  await page.getByRole("button", { name: "I have a setup code" }).click();
  await page.getByLabel("One-time setup code").fill("second-user-code");
  await page.getByRole("button", { name: "Create passkey", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("The setup code is invalid, expired, or already used");
  expect(received).toEqual({ token: "second-user-code" });
});

for (const resource of ["work-tasks", "todos", "printing", "cross-stitch"]) {
  test(`${resource} receives remote replacements before a later edit`, async ({ page, appData }) => {
    const snapshot = (title) =>
      resource === "work-tasks"
        ? [{ id: "remote", title, date: null }]
        : resource === "todos"
          ? { lists: [{ id: "general", title: "General", color: "#2765EC", tasks: [manual("remote", title)] }] }
          : { projects: [{ id: "remote", title, description: "", color: "#2765EC", tasks: [] }] };
    appData.set(resource, snapshot("Original"));
    await page.goto(resource === "work-tasks" ? "/work" : `/${resource}`);
    const item =
      resource === "work-tasks"
        ? page.locator("#work-task-remote")
        : resource === "todos"
          ? page.locator("#todo-title-remote")
          : page.locator(".project-card h2");
    await expect(item).toBeVisible();
    appData.update(resource, snapshot("Changed remotely"));
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    if (resource === "work-tasks" || resource === "todos") {
      await expect(item).toHaveValue("Changed remotely");
      await item.fill("Edited locally");
      await expect.poll(() => JSON.stringify(appData.get(resource))).toContain("Edited locally");
    } else {
      await expect(item).toContainText("Changed remotely");
    }
    appData.update(
      resource,
      resource === "work-tasks"
        ? []
        : resource === "todos"
          ? { lists: [{ id: "general", title: "General", color: "#2765EC", tasks: [] }] }
          : { projects: [] },
    );
    await page.locator("h1").click();
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    await expect(item).toHaveCount(0);
  });
}

const suppliesProject = (weight) => ({
  projects: [
    {
      id: "print",
      title: "Print",
      color: "#2765EC",
      description: "",
      tasks: [
        {
          id: "piece",
          title: "Piece",
          completed: false,
          filaments: [
            {
              id: "usage",
              catalogId: "bambu-pla-basic-filament-10101",
              label: "PLA Basic · Black",
              weightGrams: weight,
            },
          ],
        },
      ],
    },
  ],
});

test("Catalog and Shopping recalculate remote project shortages without navigation", async ({ page, appData }) => {
  appData.set("printing", suppliesProject(1000));
  appData.set("cross-stitch", { projects: [] });
  appData.set("filament-inventory", {});
  appData.set("floss-inventory", {});
  appData.set("shopping", { tasks: [] });
  await page.goto("/catalog?q=10101");
  await expect(page.locator(".jm-catalog-item__required")).toHaveText("/ 1");
  appData.update("printing", suppliesProject(2000));
  await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  await expect(page.locator(".jm-catalog-item__required")).toHaveText("/ 2");
  await page.goto("/shopping");
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(1);
  appData.update("printing", { projects: [] });
  await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(0);
});

test("Project shortages respond to shared stock while Activity responds to remote completions", async ({
  page,
  appData,
}) => {
  appData.set("printing", suppliesProject(1000));
  appData.set("filament-inventory", {});
  await page.goto("/printing");
  await expect(page.locator(".missing")).toContainText("Missing 1 spool");
  appData.update("filament-inventory", { "bambu-pla-basic-filament-10101": 1 });
  await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  await expect(page.locator(".missing")).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  appData.update("todos", { lists: [], history: [manual("done", "Completed elsewhere", new Date().toISOString())] });
  await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  await expect(page.locator(".activity-day p", { hasText: "Completed elsewhere" })).toBeVisible();
});
