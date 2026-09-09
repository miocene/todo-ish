import { test, expect } from "./app-fixture.js";

test.beforeEach(async ({ page, appData }) => {
  appData.set("chores", { tasks: [], occurrenceOrder: [] });
  await page.clock.install({ time: new Date("2026-02-02T12:00:00") });
  await page.goto("/chores");
});

async function add(page, title) {
  await page.getByRole("button", { name: "Add chore", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  return dialog;
}

test("add and edit weekly schedules in a modal, applying only on submit", async ({ page, appData }) => {
  const dialog = await add(page, "Water plants");
  await dialog.getByRole("spinbutton", { name: "Every" }).fill("2");
  await dialog.getByRole("checkbox", { name: "Wednesday" }).check();
  await dialog.getByRole("checkbox", { name: "Friday" }).check();
  expect(appData.get("chores").tasks).toEqual([]);
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => appData.get("chores").tasks[0]?.schedule.weekdays).toEqual([0, 2, 4]);
  await page.reload();
  await expect(page.locator(".chores-all").getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Water plants", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("2");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Water all plants");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Water all plants", exact: true })).toBeFocused();
  await expect.poll(() => appData.get("chores").tasks[0]?.title).toBe("Water all plants");
  expect(appData.validationErrors).toEqual([]);
});

test("cancel, Escape and backdrop dismiss drafts without changing chores", async ({ page, appData }) => {
  let dialog = await add(page, "Discard me");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(appData.get("chores").tasks).toEqual([]);
  dialog = await add(page, "Sweep");
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  await expect.poll(() => appData.get("chores").tasks.length).toBe(1);
  const saved = structuredClone(appData.get("chores"));
  await page.getByRole("button", { name: "Edit Sweep", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Sweep", exact: true })).toBeFocused();
  expect(appData.get("chores")).toEqual(saved);
  await page.getByRole("button", { name: "Edit Sweep", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Sweep");
  await page.mouse.click(1, 1);
  await expect(dialog).not.toBeVisible();
  expect(appData.get("chores")).toEqual(saved);
});

test("monthly picker fits mobile and clamps dates to month-end", async ({ page, appData }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const dialog = await add(page, "Replace filter");
  await dialog.getByRole("combobox", { name: "Frequency" }).selectOption("month");
  await dialog.getByRole("checkbox", { name: "Day 31", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Day 2", exact: true }).uncheck();
  await expect(dialog.getByRole("checkbox", { name: "Day 31", exact: true })).toBeDisabled();
  await dialog.getByRole("spinbutton", { name: "Every" }).fill("0");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).focus();
  await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("1");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/chore-modal-mobile.png" });
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  await expect.poll(() => appData.get("chores").tasks[0]?.nextDue).toBe("2026-02-28");
  await expect(page.locator(".chores-upcoming .task-item")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Edit Replace filter", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Day 31", exact: true })).toBeChecked();
  expect(appData.validationErrors).toEqual([]);
});

test("daily completion repeats after midnight and deletion removes both cards", async ({ page, appData }) => {
  const dialog = await add(page, "Sweep");
  await dialog.getByRole("combobox", { name: "Frequency" }).selectOption("day");
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Complete Sweep", exact: true });
  await checkbox.check();
  await expect.poll(() => appData.get("chores").tasks[0]?.completed).toBe(true);
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(checkbox).not.toBeChecked();
  await expect.poll(() => appData.get("chores").tasks[0]?.nextDue).toBe("2026-02-03");
  await page.getByRole("button", { name: "Delete Sweep", exact: true }).click();
  await expect.poll(() => appData.get("chores")).toEqual({ tasks: [], occurrenceOrder: [] });
  await expect(page.getByRole("button", { name: "Add chore", exact: true })).toBeFocused();
  await expect(checkbox).toHaveCount(0);
});

test("legacy chores render, future chores stay hidden, and title-only edits preserve overdue dates", async ({
  page,
  appData,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  appData.set("chores", {
    occurrenceOrder: ["past", "today", "future"],
    tasks: [
      ["past", "2026-02-01"],
      ["today", "2026-02-02"],
      ["future", "2026-02-03"],
    ].map(([id, nextDue]) => ({
      id,
      title: `${id} chore`,
      details: "Daily",
      nextDue,
      completed: false,
    })),
  });
  await page.reload();
  await expect(page.locator(".chores-all .task-item")).toHaveCount(3);
  await expect(page.locator(".chores-upcoming").getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("button", { name: "Edit past chore", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Frequency" })).toHaveValue("day");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Overdue chore");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).press("Enter");
  await expect.poll(() => appData.get("chores").tasks[0]?.title).toBe("Overdue chore");
  expect(appData.get("chores").tasks[0].nextDue).toBe("2026-02-01");
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(page.getByRole("checkbox", { name: "Complete future chore", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
