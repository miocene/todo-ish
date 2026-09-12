import { test, expect, appDataByPage } from "./app-fixture.js";

for (const route of ["printing", "cross-stitch"]) {
  test(`${route}: removing a project persists after reload`, async ({
    page,
    appData,
  }) => {
    await page.goto(`/${route}`);
    const project = page.locator(".project-card").first();
    const title = (await project.getByRole("heading").textContent()).trim();
    await project.getByLabel(/^Actions for/).click();
    await project.getByRole("button", { name: "Remove", exact: true }).click();
    await expect.poll(() => appData.get(route)?.projects.length).toBe(1);
    await page.reload();
    await expect(page.locator(".project-card")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(0);
  });
}

test("items move down when checked and back up when unchecked after the completion delay", async ({
  page,
}) => {
  const testTime = Date.now();
  await page.clock.install({ time: testTime });
  await page.goto("/todos");
  const todoTitles = page.locator("#todo-list-general textarea");
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.clock.pauseAt(testTime + 60_000);
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.clock.runFor(600);
  await expect(todoTitles.last()).toHaveValue("Renew passport");

  await page.reload();
  await expect(todoTitles.last()).toHaveValue("Renew passport");
  await expect(
    page.getByRole("checkbox", { name: "Complete Renew passport" }),
  ).toBeChecked();

  await page
    .getByRole("checkbox", { name: "Complete Renew passport" })
    .uncheck();
  await page.clock.runFor(600);
  await expect(todoTitles.first()).toHaveValue("Renew passport");

  const data = appDataByPage.get(page);
  data.set("chores", {
    tasks: ["Water the plants", "Clean the kitchen"].map((title, index) => ({
      id: `chore-${index}`,
      title,
      details: "Every day",
      nextDue: "2026-01-01",
      completed: false,
      schedule: {
        frequency: "day",
        interval: 1,
        weekdays: [0],
        monthDays: [1],
        startDate: "2026-01-01",
      },
    })),
    occurrenceOrder: ["chore-0", "chore-1"],
  });

  await page.goto("/chores");
  await page.reload();
  const choreTitles = page.locator(".chores-due .task-item .title");
  await expect(choreTitles.first()).toHaveText("Water the plants");
  await page
    .getByRole("checkbox", { name: "Complete Water the plants" })
    .check();
  await page.clock.runFor(600);
  await expect(choreTitles.last()).toHaveText("Water the plants");

  await page
    .getByRole("checkbox", { name: "Complete Water the plants" })
    .uncheck();
  await page.clock.runFor(600);
  await expect(choreTitles.first()).toHaveText("Water the plants");

  await page.goto("/shopping");
  const shoppingTitles = page.locator(".shopping-card textarea");
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.getByRole("checkbox", { name: "Complete Oat milk" }).check();
  await page.clock.runFor(600);
  await expect(shoppingTitles.last()).toHaveValue("Oat milk");

  await page.getByRole("checkbox", { name: "Complete Oat milk" }).uncheck();
  await page.clock.runFor(600);
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");

  await page.goto("/printing");
  const printingTitles = page
    .locator(".project-card")
    .first()
    .locator(".task-item .title");
  await expect(printingTitles.first()).toHaveText("Large cable clip");
  await page
    .getByRole("checkbox", { name: "Complete Large cable clip" })
    .check();
  await page.clock.runFor(600);
  await expect(printingTitles.last()).toHaveText("Large cable clip");

  await page
    .getByRole("checkbox", { name: "Complete Large cable clip" })
    .uncheck();
  await page.clock.runFor(600);
  await expect(printingTitles.first()).toHaveText("Large cable clip");

  await page.goto("/cross-stitch");
  const stitch = page.locator(".project-card").first();
  const checkboxes = stitch.getByRole("checkbox");
  const firstId = await checkboxes.first().getAttribute("id");
  const checkbox = page.locator(`#${firstId}`);
  await checkbox.check();
  await page.clock.runFor(600);
  await expect(checkboxes.last()).toHaveAttribute("id", firstId);
  await checkbox.uncheck();
  await page.clock.runFor(600);
  await expect(checkboxes.first()).toHaveAttribute("id", firstId);
});
