import { test, expect } from "./app-fixture.js";

async function editFirst(page) {
  const card = page.locator(".project-card").first();
  await card.getByLabel(/^Actions for/).click();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
}
async function save(page) {
  await page.getByRole("dialog", { name: "Edit project" }).getByRole("button", { name: "Save project" }).click();
}

test("project weights use native number controls with 10g steps", async ({ page, appData }) => {
  await page.goto("/printing");
  await editFirst(page);
  const weight = page.locator('input[name="item-weight"]').first();
  await expect(weight.locator("..").getByRole("button")).toHaveCount(0);
  await expect(weight).toHaveAttribute("step", "10");
  await weight.fill("0");
  await weight.press("ArrowDown");
  await expect(weight).toHaveValue("0");
  await weight.press("ArrowUp");
  await expect(weight).toHaveValue("10");
  await weight.press("ArrowUp");
  await expect(weight).toHaveValue("20");
  await weight.press("ArrowDown");
  await expect(weight).toHaveValue("10");
  await save(page);
  await expect.poll(() => appData.get("printing")?.projects[0].tasks[0].filaments[0].weightGrams).toBe(10);
  await page.reload();
  await editFirst(page);
  await expect(weight).toHaveValue("10");
});

test("cross stitch uses shared progress and number inputs respect completion limits", async ({ page, appData }) => {
  await page.goto("/cross-stitch");
  await editFirst(page);
  const done = page.getByRole("spinbutton", { name: "Crosses done", exact: true }).first();
  const total = page.getByRole("spinbutton", { name: "Crosses total", exact: true }).first();
  await done.fill("0");
  await total.fill("2");
  await expect(done.locator("..").getByRole("button")).toHaveCount(0);
  await done.press("ArrowUp");
  await done.press("ArrowUp");
  await expect(done).toHaveValue("2");
  await done.press("ArrowUp");
  await expect(done).toHaveValue("2");

  await done.press("ArrowDown");
  await expect(done).toHaveValue("1");

  await expect(page.locator(".stitch-color__progress progress").first()).toHaveAttribute("value", "1");
  await expect(page.locator(".stitch-color__progress progress").first()).toHaveAttribute("max", "2");
  await save(page);
  await expect.poll(() => appData.get("cross-stitch")?.projects[0].tasks[0].completed).toBe(false);
  expect(appData.validationErrors).toEqual([]);
});

test("filament selects show catalog swatches in options and selected values", async ({ page }) => {
  await page.goto("/printing");
  await editFirst(page);
  const select = page.locator('select[name="item-filament"]').first();
  const blue = "bambu-pla-basic-filament-10601";
  const option = select.locator(`option[value="${blue}"]`);
  await expect(option.locator("img.swatch")).toHaveAttribute("src", /^https:\/\//);
  const src = await option.locator("img.swatch").getAttribute("src");
  await select.selectOption(blue);
  await expect(select.locator(".button .selection img.swatch")).toBeVisible();
  await expect(select.locator(".button .selection img.swatch")).toHaveAttribute("src", src);
  await expect(select.locator(".button .selection")).toContainText("Blue");
  await save(page);
  await page.reload();
  await editFirst(page);
  await expect(select.locator(".button .selection img.swatch")).toBeVisible();
  await expect(select.locator(".button .selection img.swatch")).toHaveAttribute("src", src);
  await select.selectOption("");
  await expect(select.locator(".button .selection img.swatch")).toHaveCount(0);
});

test("opening an editor settles pending completion moves without creating a conflict", async ({ page, appData }) => {
  await page.clock.install();
  await page.goto("/printing");
  const card = page.locator(".project-card").first();
  await card.getByRole("checkbox", { name: "Complete Large cable clip", exact: true }).check();
  await editFirst(page);
  await page.clock.runFor(600);
  const dialog = page.getByRole("dialog", { name: "Edit project" });
  await dialog.getByRole("textbox", { name: "Project name" }).fill("Edited after completion");
  await save(page);
  await expect(dialog).not.toBeVisible();
  await expect(card.getByRole("heading")).toContainText("Edited after completion");
  await page.clock.runFor(300);
  await expect.poll(() => appData.get("printing").projects[0].title).toBe("Edited after completion");
  const completed = appData.get("printing").projects[0].tasks.find((task) => task.title === "Large cable clip");
  expect(completed.completed).toBe(true);
});
