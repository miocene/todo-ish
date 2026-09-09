import { advisory, test, expect } from "./app-fixture.js";

for (const [path, resource] of [
  ["printing", "printing"],
  ["cross-stitch", "cross-stitch"],
]) {
  test(`${path}: project modal requires a nested item and saves only on creation`, async ({ page, appData }) => {
    appData.set(resource, { projects: [], history: [] });
    await page.goto(`/${path}`);
    const add = page.getByRole("button", { name: "Add project", exact: true });
    await add.click();
    const dialog = page.getByRole("dialog", { name: "New project", exact: true });
    const create = dialog.getByRole("button", { name: "Create project", exact: true });
    await advisory((expect) => expect(dialog.getByRole("textbox", { name: "Project name" })).toBeFocused());
    await dialog.getByRole("textbox", { name: "Project name" }).fill("New build");
    await expect(create).toBeDisabled();
    expect(appData.get(resource).projects).toEqual([]);
    await dialog.getByRole("button", { name: /^Remove (item|color) 1$/ }).click();
    await expect(create).toBeDisabled();
    await dialog.getByRole("button", { name: /^Add (item|color)$/ }).click();
    if (path === "printing") await dialog.getByRole("textbox", { name: "Item name" }).fill("Base");
    else {
      await dialog.getByRole("combobox", { name: "Thread color" }).selectOption("dmc310");
      await dialog.getByRole("spinbutton", { name: "Crosses total" }).fill("100");
    }
    await create.click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => appData.get(resource).projects.length).toBe(1);
    expect(appData.get(resource).projects[0].tasks).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole("heading", { name: /^New build/ })).toBeVisible();
    await add.click();
    await dialog.getByRole("textbox", { name: "Project name" }).fill("Discard this");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await advisory((expect) => expect(add).toBeFocused());
    expect(appData.get(resource).projects).toHaveLength(1);
    await add.click();
    await expect(dialog.getByRole("textbox", { name: "Project name" })).toHaveValue("");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(appData.validationErrors).toEqual([]);
  });
}

for (const [path, resource] of [
  ["printing", "printing"],
  ["cross-stitch", "cross-stitch"],
]) {
  test(`${path}: page is readonly and edits and additions stay in the modal until saved`, async ({ page, appData }) => {
    appData.set(resource, {
      projects: [
        {
          id: "p",
          title: "Project",
          description: "",
          color: "#287271",
          tasks: [
            path === "printing"
              ? { id: "t", title: "Part", completed: false, filaments: [] }
              : {
                  id: "t",
                  title: "Black",
                  flossId: "dmc310",
                  requiredSkeins: 1,
                  crosses: 100,
                  crossesDone: 0,
                  completed: false,
                },
          ],
        },
      ],
      history: [],
    });
    await page.goto(`/${path}`);
    const card = page.locator(".project-card").first();
    await expect(card.locator('textarea, select, input:not([type="checkbox"])')).toHaveCount(0);
    await card.getByLabel("Actions for Project", { exact: true }).click();
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Edit project", exact: true });
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox", { name: "Project name" }).fill("Renamed");
    if (path === "printing") await modal.getByRole("textbox", { name: "Item name" }).fill("Edited part");
    else await modal.getByRole("spinbutton", { name: "Crosses done" }).fill("25");
    expect(appData.get(resource).projects[0].title).toBe("Project");
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(appData.get(resource).projects[0].title).toBe("Project");
    await card.getByLabel("Actions for Project", { exact: true }).click();
    await card.getByRole("button", { name: /^Add (item|color)$/ }).click();
    await expect(modal.locator("fieldset").first()).toBeVisible();
    if (path === "printing") await modal.getByRole("textbox", { name: "Item name" }).last().fill("Second part");
    else {
      await modal.getByRole("combobox", { name: "Thread color" }).last().selectOption("dmc321");
      await modal.getByRole("spinbutton", { name: "Crosses total" }).last().fill("50");
    }
    await modal.getByRole("textbox", { name: "Project name" }).fill("Renamed");
    await modal.getByRole("button", { name: "Save project", exact: true }).click();
    await expect.poll(() => appData.get(resource).projects[0].tasks.length).toBe(2);
    await page.reload();
    await expect(card.getByRole("heading", { name: /^Renamed/ })).toBeVisible();
    const checkbox = card.getByRole("checkbox").first();
    await checkbox.check();
    await expect.poll(() => appData.get(resource).projects[0].tasks.some((task) => task.completed)).toBe(true);
    await checkbox.uncheck();
    await expect.poll(() => appData.get(resource).projects[0].tasks.every((task) => !task.completed)).toBe(true);
    await card.getByRole("checkbox").first().check();
    await card
      .getByRole("button", { name: /^Remove .* from Renamed$/ })
      .first()
      .click();
    await expect.poll(() => appData.get(resource).history?.length).toBe(1);
    expect(appData.validationErrors).toEqual([]);
  });
}

for (const path of ["printing", "cross-stitch"]) {
  test(`${path}: newly completed projects collapse ahead of older completions`, async ({ page, appData }) => {
    const project = (id, completed) => ({
      id,
      title: id,
      color: "#287271",
      description: "",
      tasks: [
        {
          id: `${id}-task`,
          title: `${id} task`,
          completed,
          ...(completed ? { completedAt: "2026-09-01T12:00:00Z" } : {}),
          ...(path === "printing"
            ? { filaments: [] }
            : { flossId: "dmc310", requiredSkeins: 1, crosses: 10, crossesDone: completed ? 10 : 0 }),
        },
      ],
    });
    appData.set(path, {
      projects: [project("Target", false), project("Active", false), project("Old", true)],
      history: [],
    });
    await page.clock.install();
    await page.goto(`/${path}`);
    await expect(page.getByRole("button", { name: "Expand Old", exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Complete Target task", exact: true }).check();
    await page.clock.runFor(600);
    await expect(page.getByRole("button", { name: "Expand Target", exact: true })).toBeVisible();
    await expect.poll(() => appData.get(path).projects.map((item) => item.id)).toEqual(["Active", "Target", "Old"]);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand Target", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expand Target", exact: true }).click();
    await page.getByRole("checkbox", { name: "Complete Target task", exact: true }).uncheck();
    await page.clock.runFor(600);
    await expect(page.getByRole("button", { name: "Collapse Target", exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Complete Active task", exact: true }).check();
    await page.clock.runFor(600);
    await expect.poll(() => appData.get(path).projects.map((item) => item.id)).toEqual(["Target", "Active", "Old"]);
  });
}
