import { advisory, test, expect, appDataByPage } from "./app-fixture.js";

test("chores render schedules and save modal changes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-02-07T12:00:00") });
  appDataByPage.get(page).set("chores", {
    occurrenceOrder: ["chore-1", "chore-2", "chore-3"],
    tasks: ["Every Saturday", "Every 2 weeks on Sunday", "Every Wednesday"].map(
      (details, index) => ({
        id: `chore-${index + 1}`,
        title: `Chore ${index + 1}`,
        details,
        nextDue: "2026-02-07",
        completed: false,
      }),
    ),
  });
  await page.goto("/chores");

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Today and overdue",
    "All chores",
  ]);
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
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue(
      interval,
    );
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await allChores
    .first()
    .getByRole("button", { name: "Edit Chore 1", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Water all the plants");
  await dialog.getByRole("spinbutton", { name: "Every" }).fill("2");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await upcomingChores
    .getByRole("checkbox", { name: "Complete Water all the plants" })
    .check();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Complete Water all the plants" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Edit Water all the plants", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Water all the plants");
  await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue(
    "2",
  );
});

test("new blank chores preserve a valid occurrence order", async ({ page }) => {
  await page.goto("/chores");
  await page.getByRole("button", { name: "Add chore" }).click();
  const title = page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Title", exact: true });
  await advisory((expect) => expect(title).toBeFocused());
  await title.fill("Clean the desk");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add chore", exact: true })
    .click();
  const data = appDataByPage.get(page);
  await expect
    .poll(() =>
      data.get("chores")?.tasks.some((task) => task.title === "Clean the desk"),
    )
    .toBe(true);
  expect(data.validationErrors).toEqual([]);
});
