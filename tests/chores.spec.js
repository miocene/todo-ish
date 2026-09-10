import { advisory, test, expect } from "./app-fixture.js";

test.beforeEach(async ({ page, appData }) => {
  appData.set("chores", { tasks: [], occurrenceOrder: [] });
  await page.clock.install({ time: new Date("2026-02-02T12:00:00") });
  await page.goto("/chores");
});

async function add(page, title) {
  await page.getByRole("button", { name: "Add chore", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await advisory((expect) => expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toBeFocused());
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  return dialog;
}

test("add and edit weekly schedules in a modal, applying only on submit", async ({ page, appData }) => {
  const dialog = await add(page, "Water plants");
  await dialog.getByRole("spinbutton", { name: "Every" }).fill("2");
  await dialog.getByRole("checkbox", { name: "Wednesday" }).check();
  await dialog.getByRole("checkbox", { name: "Friday" }).check();
  expect(appData.get("chores").tasks).toEqual([]);
  await expect(dialog.locator(".chore-preview time")).toHaveAttribute("datetime", "2026-02-02");
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => appData.get("chores").tasks[0]?.schedule.weekdays).toEqual([0, 2, 4]);
  await page.reload();
  await expect(page.locator(".chores-all").getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Water plants", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("2");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Water all plants");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await advisory((expect) =>
    expect(page.getByRole("button", { name: "Edit Water all plants", exact: true })).toBeFocused(),
  );
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
  await advisory((expect) => expect(page.getByRole("button", { name: "Edit Sweep", exact: true })).toBeFocused());
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
  await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("0");
  await expect(dialog.getByRole("alert")).toHaveText("Enter a whole interval between 1 and 999.");
  await expect(dialog.getByRole("button", { name: "Add chore", exact: true })).toBeDisabled();
  await dialog.getByRole("spinbutton", { name: "Every" }).fill("1");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await advisory(async (expect) =>
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true),
  );
  await expect(dialog.locator(".chore-preview time")).toHaveAttribute("datetime", "2026-02-28");
  await page.screenshot({ path: "test-results/chore-modal-mobile.png" });
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  await expect.poll(() => appData.get("chores").tasks[0]?.nextDue).toBe("2026-02-28");
  await expect(page.locator(".chores-due .task-item")).toHaveCount(0);
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
  await expect.poll(() => appData.get("chores").tasks).toEqual([]);
  expect(appData.get("chores").history).toHaveLength(1);
  await page.goto("/profile");
  await expect(page.locator("#activity-2026-02-02").getByText("Sweep", { exact: true })).toHaveCount(1);
  await page.goto("/chores");
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
  await expect(page.locator(".chores-due").getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("button", { name: "Edit past chore", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Frequency" })).toHaveValue("day");
  await expect(dialog.locator(".chore-preview")).toContainText("Outstanding overdue occurrence");
  await expect(dialog.locator(".chore-preview time")).toHaveAttribute("datetime", "2026-02-01");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Overdue chore");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).press("Enter");
  await expect.poll(() => appData.get("chores").tasks[0]?.title).toBe("Overdue chore");
  expect(appData.get("chores").tasks[0].nextDue).toBe("2026-02-01");
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(page.getByRole("checkbox", { name: "Complete future chore", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("overdue recurrence edits retain the due date and no-op submits do not write", async ({ page, appData }) => {
  appData.set("chores", {
    occurrenceOrder: ["one"],
    tasks: [{ id: "one", title: "Overdue", details: "Daily", nextDue: "2026-01-30", completed: false }],
  });
  await page.reload();
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().endsWith("/chores")) writes++;
  });
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Edit Overdue", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Frequency" }).selectOption("month");
  await dialog.getByRole("checkbox", { name: "Day 15", exact: true }).check();
  await dialog.getByRole("combobox", { name: "Frequency" }).selectOption("day");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.clock.runFor(600);
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Edit Overdue", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Every" }).fill("2");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => appData.get("chores").tasks[0].schedule?.interval).toBe(2);
  expect(appData.get("chores").tasks[0].nextDue).toBe("2026-01-30");
  await page.getByRole("checkbox", { name: "Complete Overdue", exact: true }).check();
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect.poll(() => appData.get("chores").tasks[0].nextDue).toBe("2026-02-03");
});

test("uncertain legacy rules require confirmation and title limits match the API", async ({ page, appData }) => {
  appData.set("chores", {
    occurrenceOrder: ["one"],
    tasks: [{ id: "one", title: "Old chore", details: "Whenever needed", nextDue: "2026-02-02", completed: false }],
  });
  await page.reload();
  await expect(page.locator(".chores-all").getByText("Whenever needed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Old chore", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Previous rule: Whenever needed/)).toBeVisible();
  const title = dialog.getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toHaveAttribute("maxlength", "500");
  await title.fill("x".repeat(501));
  await expect(title).toHaveValue("x".repeat(500));
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(appData.get("chores").tasks[0].schedule).toBeUndefined();
});

test("failed chore saves recover after reload and deletion cancels a pending reorder", async ({ page, appData }) => {
  const dialog = await add(page, "Recover chore");
  appData.setWriteFailure("chores", 503);
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  appData.setWriteFailure("chores", 0);
  await page.reload();
  await expect.poll(() => appData.get("chores").tasks[0]?.title).toBe("Recover chore");
  await page.getByRole("checkbox", { name: "Complete Recover chore", exact: true }).check();
  await page.getByRole("button", { name: "Delete Recover chore", exact: true }).click();
  await page.clock.runFor(600);
  await expect.poll(() => appData.get("chores").tasks).toEqual([]);
  expect(appData.get("chores").occurrenceOrder).toEqual([]);
  expect(appData.get("chores").history).toHaveLength(1);
  await page.reload();
  await page.goto("/profile");
  await expect(page.locator("#activity-2026-02-02").getByText("Recover chore", { exact: true })).toHaveCount(1);
  expect(appData.validationErrors).toEqual([]);
});

test("multiple completions survive reload without resending unchanged history", async ({ page, appData }) => {
  const dialog = await add(page, "Sweep twice");
  await dialog.getByRole("combobox", { name: "Frequency" }).selectOption("day");
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  await page.getByRole("checkbox", { name: "Complete Sweep twice", exact: true }).check();
  await expect.poll(() => appData.get("chores").tasks[0]?.completed).toBe(true);
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(page.getByRole("checkbox", { name: "Complete Sweep twice", exact: true })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Complete Sweep twice", exact: true }).check();
  await expect.poll(() => appData.get("chores").tasks[0]?.completed).toBe(true);
  await page.getByRole("button", { name: "Delete Sweep twice", exact: true }).click();
  await expect.poll(() => appData.get("chores").history?.length).toBe(2);
  await page.reload();
  const requestPromise = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().endsWith("/chores"),
  );
  await add(page, "New chore");
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  const request = await requestPromise;
  expect(request.postDataJSON().history).toEqual({ upsert: [], remove: [] });
  expect(request.headers()["x-history-mode"]).toBe("patch-v1");
  expect(appData.get("chores").history).toHaveLength(2);
  await expect.poll(() => appData.get("chores").tasks.length).toBe(1);
  await page.reload();
  await page.goto("/profile");
  for (const date of ["2026-02-02", "2026-02-03"]) {
    await expect(page.locator(`#activity-${date}`).getByText("Sweep twice", { exact: true })).toHaveCount(1);
  }
});

test("long chore titles keep mobile actions reachable", async ({ page, appData }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const title = "LongChoreTitle".repeat(35);
  appData.set("chores", {
    occurrenceOrder: ["one"],
    tasks: [{ id: "one", title, details: "Daily", nextDue: "2026-02-02", completed: false }],
  });
  await page.reload();
  for (const action of ["Edit", "Delete"]) {
    const button = page.getByRole("button", { name: `${action} ${title}`, exact: true });
    const bounds = await button.boundingBox();
    await advisory((expect) => expect(bounds.x + bounds.width).toBeLessThanOrEqual(360));
    await expect(button).toBeVisible();
  }
  await page.screenshot({ path: "test-results/chores-long-title.png", fullPage: true });
});

test("unchecking and immediately deleting a chore undoes its completion", async ({ page, appData }) => {
  const dialog = await add(page, "Sweep");
  await dialog.getByRole("button", { name: "Add chore", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Complete Sweep", exact: true });
  await checkbox.check();
  await expect.poll(() => appData.get("chores").tasks[0]?.completed).toBe(true);
  await checkbox.uncheck();
  await page.getByRole("button", { name: "Delete Sweep", exact: true }).click();
  await expect.poll(() => appData.get("chores").tasks).toEqual([]);
  expect(appData.get("chores").history ?? []).toEqual([]);
  await page.goto("/profile");
  await expect(page.getByText("Sweep", { exact: true })).toHaveCount(0);
});
