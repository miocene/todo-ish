import { advisory, test, expect } from "./app-fixture.js";

const filamentId = "bambu-pla-basic-filament-10101";
const flossId = "dmc310";
const color = "#18A76B";
test.beforeEach(async ({ page, appData }) => {
  appData.set("shopping", { tasks: [{ id: "manual", title: "Milk", completed: false }], history: [] });
  appData.set("printing", {
    projects: [
      {
        id: "print",
        title: "Print project",
        description: "",
        color,
        tasks: [
          {
            id: "print-item",
            title: "Part",
            completed: false,
            filaments: [{ id: "usage", catalogId: filamentId, label: "Black", weightGrams: 2500 }],
          },
        ],
      },
    ],
  });
  appData.set("cross-stitch", {
    projects: [
      {
        id: "stitch",
        title: "Stitch project",
        description: "",
        color,
        tasks: [
          {
            id: "thread",
            title: "Black thread",
            flossId,
            requiredSkeins: 3,
            crosses: 100,
            crossesDone: 0,
            completed: false,
          },
        ],
      },
    ],
  });
  appData.set("filament-inventory", { [filamentId]: 1 });
  appData.set("floss-inventory", { [flossId]: 1 });
  await page.clock.install({ time: new Date("2026-09-09T12:00:00") });
  await page.goto("/shopping");
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(3);
});

const materialRow = (page, material) =>
  page.locator(".shopping-card .task-item").filter({
    has: page.getByRole("link", { name: new RegExp(material) }),
  });

for (const [material, resource, id] of [
  ["filament", "filament-inventory", filamentId],
  ["floss", "floss-inventory", flossId],
]) {
  test(`${material} purchase adds displayed quantity once and unchecking reverses after reload`, async ({
    page,
    appData,
  }) => {
    const row = materialRow(page, material);
    await expect(row.getByRole("button", { name: /Remove/ })).toHaveCount(0);
    await expect(row).toContainText("2");
    await row.getByRole("checkbox").check();
    await expect(page).toHaveURL(/\/shopping$/);
    await expect.poll(() => appData.get(resource)[id]).toBe(3);
    await expect.poll(() => appData.get("shopping").tasks.filter((task) => task.source).length).toBe(1);
    await page.reload();
    await expect(row.getByRole("checkbox")).toBeChecked();
    await expect(row.getByRole("button", { name: /Remove/ })).toBeVisible();
    await row.getByRole("checkbox").uncheck();
    await expect.poll(() => appData.get(resource)[id]).toBe(1);
    await expect(row.getByRole("button", { name: /Remove/ })).toHaveCount(0);
    expect(appData.validationErrors).toEqual([]);
  });
}

test("purchase deletion preserves stock and activity; inventory failures recover without double counting", async ({
  page,
  appData,
}) => {
  appData.setWriteFailure("filament-inventory", 503);
  const row = materialRow(page, "filament");
  await row.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  await row.getByRole("button", { name: /Remove/ }).click();
  expect(appData.get("shopping").history).toEqual([]);
  expect(appData.get("filament-inventory")[filamentId]).toBe(1);
  appData.setWriteFailure("filament-inventory", 0);
  await page.reload();
  await expect.poll(() => appData.get("filament-inventory")[filamentId]).toBe(3);
  await expect(materialRow(page, "filament")).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByText(appData.get("shopping").history[0].title, { exact: true })).toHaveCount(1);
  expect(appData.validationErrors).toEqual([]);
});

test("manual editing restores titles and Enter skips generated rows", async ({ page, appData }) => {
  const title = page.locator("#shopping-title-manual");
  await expect(title).toHaveAttribute("maxlength", "500");
  await title.fill("Bread");
  await title.fill(" ");
  await page.getByRole("heading", { name: "Shopping cart", exact: true }).click();
  await expect(title).toHaveValue("Bread");
  await title.press("Enter");
  const titles = page.locator(".shopping-card textarea");
  await advisory((expect) => expect(titles.last()).toBeFocused());
  await expect(page.getByRole("checkbox", { name: "Complete untitled task" })).toBeDisabled();
  await titles.last().fill("Eggs");
  await page.getByRole("button", { name: "Add item", exact: true }).focus();
  await expect
    .poll(() =>
      appData
        .get("shopping")
        .tasks.filter((task) => !task.source)
        .map((task) => task.title),
    )
    .toEqual(["Bread", "Eggs"]);
  expect(appData.validationErrors).toEqual([]);
});

test("manual completion deletion retains activity and uncheck deletion removes it", async ({ page, appData }) => {
  await page.getByRole("checkbox", { name: "Complete Milk", exact: true }).check();
  await page.getByRole("button", { name: "Remove Milk from shopping list", exact: true }).click();
  await expect.poll(() => appData.get("shopping").history?.map((item) => item.title)).toEqual(["Milk"]);
  await page.reload();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.locator(".shopping-card textarea").fill("Bread");
  const check = page.getByRole("checkbox", { name: "Complete Bread", exact: true });
  await check.check();
  await check.uncheck();
  await page.getByRole("button", { name: "Remove Bread from shopping list", exact: true }).click();
  await page.reload();
  await expect.poll(() => appData.get("shopping").history?.map((item) => item.title)).toEqual(["Milk"]);
});

test("new shortages do not overwrite the quantity of earlier purchases", async ({ page, appData }) => {
  await materialRow(page, "filament").getByRole("checkbox").check();
  await expect.poll(() => appData.get("filament-inventory")[filamentId]).toBe(3);
  await page.goto("/catalog");
  appData.set("filament-inventory", { [filamentId]: 0 });
  await page.goto("/shopping");
  const rows = materialRow(page, "filament");
  await expect(rows).toHaveCount(2);
  const checked = rows.filter({ has: page.locator("input:checked") });
  await expect(checked).toContainText("2 spools");
  await checked.getByRole("checkbox").uncheck();
  await expect.poll(() => appData.get("filament-inventory")[filamentId]).toBe(0);
  await expect(page.getByRole("status").filter({ hasText: "Inventory is now zero" })).toBeVisible();
});

test("Work and project deletion keep completed activity after reload", async ({ page, appData }) => {
  const completedAt = "2026-09-09T10:00:00.000Z";
  appData.set("work-tasks", [
    { id: "finished-work", title: "Finished work", date: "2026-09-09", checkedAt: completedAt },
  ]);
  await page.goto("/work");
  await page.getByRole("button", { name: /Remove Finished work|Delete Finished work/ }).click();
  await expect.poll(() => appData.get("work-tasks")[0]?.archived).toBe(true);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Complete Finished work" })).toHaveCount(0);
  appData.set("printing", {
    projects: [
      {
        id: "print",
        title: "Print project",
        description: "",
        color,
        tasks: [{ id: "done-print", title: "Finished part", completed: true, completedAt, filaments: [] }],
      },
    ],
  });
  await page.goto("/printing");
  await page.getByLabel("Actions for Print project", { exact: true }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => appData.get("printing").history?.length).toBe(1);
  await page.goto("/profile");
  await expect(page.getByText("Finished work", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Finished part", { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByText("Finished work", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Finished part", { exact: true })).toHaveCount(1);
});

test("cross-stitch item deletion retains completed activity", async ({ page, appData }) => {
  const project = appData.get("cross-stitch").projects[0];
  project.tasks[0] = { ...project.tasks[0], completed: true, completedAt: "2026-09-09T10:00:00Z", crossesDone: 100 };
  appData.set("cross-stitch", { projects: [project] });
  await page.goto("/cross-stitch");
  await page.getByRole("button", { name: "Expand Stitch project", exact: true }).click();
  await page.getByRole("button", { name: "Remove Black thread from Stitch project", exact: true }).click();
  await expect.poll(() => appData.get("cross-stitch").history?.length).toBe(1);
  await page.goto("/profile");
  await expect(page.getByText("Black thread", { exact: true })).toHaveCount(1);
});

test("shopping is usable with unavailable catalogs and unknown material links are readonly", async ({ page }) => {
  await page.route("**/api/catalogs/**", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.reload();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const title = page.locator(".shopping-card textarea").last();
  await advisory((expect) => expect(title).toBeFocused());
  await title.fill("Independent manual item");
  await expect(page.locator(".shopping-card textarea")).toHaveCount(2);
});

test("long manual titles persist and fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const title = page.locator(".shopping-card textarea").last();
  await title.fill("A".repeat(500));
  await expect(title).toHaveValue("A".repeat(500));
  await page.getByRole("button", { name: "Add item", exact: true }).focus();
  await page.reload();
  await expect(page.locator(".shopping-card textarea").last()).toHaveValue("A".repeat(500));
  await advisory(async (expect) =>
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    ),
  );
  await page.screenshot({ path: "test-results/shopping-mobile.png", fullPage: true });
});

test("manual item limit leaves the existing list intact", async ({ page, appData }) => {
  appData.set("shopping", {
    tasks: Array.from({ length: 2000 }, (_, index) => ({
      id: `manual-${index}`,
      title: `Manual ${index}`,
      completed: false,
    })),
  });
  await page.reload();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(
    page.getByText("The shopping list can contain up to 2,000 manual items. Remove an item before adding another."),
  ).toBeVisible();
  await expect(page.locator(".shopping-card textarea")).toHaveCount(2000);
  expect(appData.validationErrors).toEqual([]);
});

test("catalog refresh preserves a manual draft and a pending completion move", async ({ page }) => {
  const pending = [];
  await page.route("**/api/catalogs/**", (route) => {
    pending.push(route);
  });
  await page.reload();
  await expect.poll(() => pending.length).toBe(2);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const draft = page.locator(".shopping-card textarea").last();
  await draft.fill("During loading");
  await page.getByRole("checkbox", { name: "Complete Milk", exact: true }).check();
  await Promise.all(pending.map((route) => route.fallback()));
  await expect(materialRow(page, "floss")).toBeVisible();
  await page.clock.runFor(600);
  await expect(page.locator(".shopping-card .task-item").last().getByRole("checkbox")).toBeChecked();
  await expect(page.locator(".shopping-card textarea").first()).toHaveValue("During loading");
});

test("rapid purchase toggles and a failed shopping save recover without duplicate stock", async ({ page, appData }) => {
  appData.setWriteFailure("shopping", 503);
  const checkbox = materialRow(page, "filament").getByRole("checkbox");
  await checkbox.check();
  await checkbox.uncheck();
  await checkbox.check();
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  expect(appData.get("filament-inventory")[filamentId]).toBe(1);
  await page.reload();
  await expect(materialRow(page, "filament")).toHaveCount(1);
  await expect(checkbox).toBeChecked();
  appData.setWriteFailure("shopping", null);
  await page.reload();
  await expect(checkbox).toBeChecked();
  await expect.poll(() => appData.get("shopping").tasks.filter((item) => item.source).length).toBe(1);
  expect(appData.get("filament-inventory")[filamentId]).toBe(3);
});

test("removing the last item focuses Add and blank drafts leave an empty card", async ({ page, appData }) => {
  appData.set("printing", { projects: [] });
  appData.set("cross-stitch", { projects: [] });
  await page.reload();
  await page.getByRole("button", { name: "Remove Milk from shopping list", exact: true }).click();
  const add = page.getByRole("button", { name: "Add item", exact: true });
  await advisory((expect) => expect(add).toBeFocused());
  await expect(page.getByText("The shopping list is empty.")).toBeVisible();
  await add.click();
  await advisory((expect) => expect(page.locator(".shopping-card textarea")).toBeFocused());
  await add.focus();
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(0);
});
