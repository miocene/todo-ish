import { test, expect } from "./app-fixture.js";

async function editFirst(page) {
  const card = page.locator(".project-card").first();
  await card.getByLabel(/^Actions for/).click();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
}
async function save(page) {
  await page
    .getByRole("dialog", { name: "Edit project" })
    .getByRole("button", { name: "Save project" })
    .click();
}

test("project weight edits persist after reload", async ({ page, appData }) => {
  await page.goto("/printing");
  await editFirst(page);
  const weight = page.locator('input[name="item-weight"]').first();
  await weight.fill("10");
  await save(page);
  await expect
    .poll(
      () =>
        appData.get("printing")?.projects[0].tasks[0].filaments[0].weightGrams,
    )
    .toBe(10);
  await page.reload();
  await editFirst(page);
  await expect(weight).toHaveValue("10");
});

test("partial stitch edits update progress without completing the item", async ({
  page,
  appData,
}) => {
  await page.goto("/cross-stitch");
  await editFirst(page);
  const done = page
    .getByRole("spinbutton", { name: "Crosses done", exact: true })
    .first();
  const total = page
    .getByRole("spinbutton", { name: "Crosses total", exact: true })
    .first();
  await done.fill("0");
  await total.fill("2");
  await done.fill("1");

  await expect(
    page.locator(".stitch-color__progress progress").first(),
  ).toHaveAttribute("value", "1");
  await expect(
    page.locator(".stitch-color__progress progress").first(),
  ).toHaveAttribute("max", "2");
  await save(page);
  await expect
    .poll(() => appData.get("cross-stitch")?.projects[0].tasks[0].crossesDone)
    .toBe(1);
  expect(appData.get("cross-stitch").projects[0].tasks[0].completed).toBe(
    false,
  );
  expect(appData.validationErrors).toEqual([]);
});

test("filament selects show catalog swatches in options and selected values", async ({
  page,
}) => {
  await page.goto("/printing");
  await editFirst(page);
  const select = page.locator('select[name="item-filament"]').first();
  const blue = "bambu-pla-basic-filament-10601";
  const option = select.locator(`option[value="${blue}"]`);
  await expect(option.locator("img.swatch")).toHaveAttribute(
    "src",
    /^https:\/\//,
  );
  const src = await option.locator("img.swatch").getAttribute("src");
  await select.selectOption(blue);
  await expect(select.locator(".button .selection img.swatch")).toBeVisible();
  await expect(select.locator(".button .selection img.swatch")).toHaveAttribute(
    "src",
    src,
  );
  await expect(select.locator(".button .selection")).toContainText("Blue");
  await save(page);
  await page.reload();
  await editFirst(page);
  await expect(select.locator(".button .selection img.swatch")).toBeVisible();
  await expect(select.locator(".button .selection img.swatch")).toHaveAttribute(
    "src",
    src,
  );
  await select.selectOption("");
  await expect(select.locator(".button .selection img.swatch")).toHaveCount(0);
});

test("opening an editor settles pending completion moves and preserves task order", async ({
  page,
  appData,
}) => {
  await page.clock.install();
  await page.goto("/printing");
  const card = page.locator(".project-card").first();
  await card
    .getByRole("checkbox", { name: "Complete Large cable clip", exact: true })
    .check();
  await editFirst(page);
  await page.clock.runFor(600);
  const dialog = page.getByRole("dialog", { name: "Edit project" });
  await dialog
    .getByRole("textbox", { name: "Project name" })
    .fill("Edited after completion");
  await save(page);
  await expect(dialog).not.toBeVisible();
  await expect(card.getByRole("heading")).toContainText(
    "Edited after completion",
  );
  await page.clock.runFor(300);
  await expect
    .poll(() => appData.get("printing").projects[0].title)
    .toBe("Edited after completion");
  const completed = appData
    .get("printing")
    .projects[0].tasks.find((task) => task.title === "Large cable clip");
  expect(completed.completed).toBe(true);
});

test("projects retain multiple filaments and fractional weights after reload", async ({
  page,
}) => {
  await page.goto("/printing");
  const projects = page.locator(".project-card");
  await page.getByRole("button", { name: "Add project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New project" });
  await projectDialog
    .getByRole("textbox", { name: "Project name" })
    .fill("New 3D project");
  await projectDialog
    .getByRole("textbox", { name: "Item name" })
    .fill("Weighted base");
  await projectDialog
    .getByLabel("Filament 1", { exact: true })
    .selectOption("bambu-pla-basic-filament-10101");
  await projectDialog.getByLabel("Weight 1 (g)", { exact: true }).fill("35");
  await projectDialog.getByRole("button", { name: "Add filament" }).click();
  await projectDialog
    .getByLabel("Filament 2", { exact: true })
    .selectOption("bambu-pla-basic-filament-10501");
  await projectDialog.getByLabel("Weight 2 (g)", { exact: true }).fill("7.5");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projects).toHaveCount(3);
  const newProject = projects.filter({
    has: page.getByRole("heading", { name: "New 3D project" }),
  });
  await expect(
    newProject.getByRole("heading", { name: "New 3D project" }),
  ).toBeVisible();
  await page.reload();
  const savedProject = newProject;
  const editDialog = page.getByRole("dialog", {
    name: "Edit project",
    exact: true,
  });
  await expect(savedProject.locator(".task-item .title")).toHaveText(
    "Weighted base",
  );
  await savedProject.getByLabel(/^Actions for/).click();
  await savedProject.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editDialog.getByLabel("Item name")).toHaveValue("Weighted base");
  expect(
    await editDialog
      .getByLabel(/^Filament \d+$/)
      .evaluateAll((selects) => selects.map((select) => select.value)),
  ).toEqual([
    "bambu-pla-basic-filament-10101",
    "bambu-pla-basic-filament-10501",
  ]);
  expect(
    await editDialog
      .getByLabel(/^Weight \d+ \(g\)$/)
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["35", "7.5"]);
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();
});
