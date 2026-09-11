import { CARD_COLORS } from "../src/app/card-colors.js";
import { advisory, test, expect, appDataByPage } from "./app-fixture.js";

const TODAY = "2026-09-14"; // Monday: Friday is exactly three calendar days ago.
const FRIDAY = "2026-09-11";
const selectedCard = (page) => page.getByRole("region").filter({ has: page.locator("time[datetime]") });
const backlogCard = (page) => page.getByRole("region", { name: "Backlog", exact: true });
const title = (card) => card.getByRole("textbox", { name: "Task title", exact: true });
const task = (id, date = null, checkedAt) => ({ id, title: id, date, ...(checkedAt ? { checkedAt } : {}) });

async function openWork(page, tasks = [], date = TODAY) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00Z`));
  const data = appDataByPage.get(page);
  data.set("work-tasks", tasks);
  await page.goto(`/work${date === TODAY ? "" : `?date=${date}`}`);
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  return data;
}

async function selectDay(page, day) {
  const label = new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00`));
  await page.getByRole("button", { name: new RegExp(`^${label}\\.`) }).click();
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", day);
}

test("Work: rolled-over tasks can be corrected to Friday and persist as completed", async ({ page }) => {
  const data = await openWork(page, [task("Friday work", FRIDAY)]);
  await expect(title(selectedCard(page))).toHaveValue("Friday work");
  await selectedCard(page).getByRole("button", { name: "Move Friday work to backlog" }).click();
  await advisory((expect) => expect(title(backlogCard(page))).toBeFocused());
  await selectDay(page, FRIDAY);
  await advisory((expect) => expect(page.getByRole("combobox", { name: /^Change day type/ })).toBeFocused());
  await backlogCard(page)
    .getByRole("button", { name: `Move Friday work to ${FRIDAY}` })
    .click();
  await advisory((expect) => expect(title(selectedCard(page))).toBeFocused());
  await expect(page.getByRole("checkbox", { name: "Complete Friday work" })).toBeChecked();
  await expect.poll(() => data.get("work-tasks")[0]).toMatchObject({ date: FRIDAY, checkedAt: expect.any(String) });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Complete Friday work" })).toBeChecked();
  await expect(title(selectedCard(page))).toHaveValue("Friday work");
  await expect(page.getByRole("combobox", { name: /^Change day type/ })).toHaveAttribute("data-level", "1");
  await page.goto("/profile");
  await expect(page.locator(`#activity-${FRIDAY}`)).toContainText("Friday work");
  await expect(page.locator(`#activity-${TODAY}`)).toHaveCount(0);
  await expect(page.locator(`a[href="#activity-${FRIDAY}"]`)).toHaveAttribute("data-level", "1");
  await page.locator(`#activity-${FRIDAY}`).getByRole("link", { name: "Work", exact: true }).click();
  await expect(page).toHaveURL(/date=2026-09-11$/);
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", FRIDAY);
});

test("Work: history is viewable but assignments and title edits stop after three days", async ({ page }) => {
  const data = await openWork(
    page,
    [task("Old work", "2026-09-10", "2026-09-10T12:00:00Z"), task("Backlog")],
    "2026-09-10",
  );
  await expect(selectedCard(page)).toContainText("Old work");
  await expect(title(selectedCard(page))).toHaveCount(0);
  await expect(selectedCard(page).getByRole("button", { name: "Add task", exact: true })).toHaveCount(0);
  await expect(backlogCard(page).getByRole("button", { name: /^Move Backlog/ })).toHaveCount(0);
  await selectedCard(page).getByRole("button", { name: "Delete Old work" }).click();
  await expect.poll(() => data.get("work-tasks").find((item) => item.id === "Old work")?.archived).toBe(true);
  await advisory((expect) => expect(page.getByRole("combobox", { name: /Change day type/ })).toBeFocused());
});

for (const date of [FRIDAY, "2026-09-15"]) {
  test(`Work: checking a backlog task while viewing ${date} completes it today`, async ({ page }) => {
    const data = await openWork(page, [task("Finish now")], date);
    await backlogCard(page).getByRole("checkbox", { name: "Complete Finish now" }).click();
    await expect.poll(() => data.get("work-tasks")[0]).toMatchObject({ date: TODAY, checkedAt: expect.any(String) });
    await expect(title(selectedCard(page))).toHaveCount(0);
    await advisory((expect) =>
      expect(backlogCard(page).getByRole("button", { name: "Add backlog task" })).toBeFocused(),
    );
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Complete Finish now" })).toBeChecked();
  });
}

for (const date of [TODAY, "2026-09-15"]) {
  test(`Work: pinning to ${date} schedules an unchecked task and unpinning returns it`, async ({ page }) => {
    const data = await openWork(page, [task("Plan")], date);
    await backlogCard(page)
      .getByRole("button", { name: /^Move Plan to/ })
      .click();
    await advisory((expect) => expect(title(selectedCard(page))).toBeFocused());
    await expect(selectedCard(page).getByRole("checkbox")).not.toBeChecked();
    await expect.poll(() => data.get("work-tasks")[0].date).toBe(date);
    await page.reload();
    await selectedCard(page).getByRole("button", { name: "Move Plan to backlog" }).click();
    await advisory((expect) => expect(title(backlogCard(page))).toBeFocused());
    await expect.poll(() => data.get("work-tasks")[0].date).toBe(null);
  });
}

test("Work: drafts, Enter, completed deletion, and focus work in both lists", async ({ page }) => {
  const data = await openWork(page);
  const day = selectedCard(page);
  await day.getByRole("button", { name: "Add task", exact: true }).click();
  await advisory((expect) => expect(title(day)).toBeFocused());
  await title(day).fill("First");
  await title(day).press("Enter");
  await advisory((expect) => expect(title(day).last()).toBeFocused());
  await title(day).last().fill("Second");
  await title(day).first().press("Enter");
  await advisory((expect) => expect(title(day).last()).toBeFocused());
  await title(day).last().press("Enter");
  await expect(title(day)).toHaveCount(3);
  await page.getByRole("heading", { name: "Work", exact: true }).click();
  await expect(title(day)).toHaveCount(2);
  await day.getByRole("checkbox", { name: "Complete First" }).check();
  await day.getByRole("button", { name: "Delete First" }).click();
  await expect(title(day)).toHaveValue("Second");
  await advisory((expect) => expect(title(day)).toBeFocused());
  await day.getByRole("button", { name: "Delete Second" }).click();
  await advisory((expect) => expect(day.getByRole("button", { name: "Add task", exact: true })).toBeFocused());
  const backlog = backlogCard(page);
  await backlog.getByRole("button", { name: "Add backlog task" }).click();
  await advisory((expect) => expect(title(backlog)).toBeFocused());
  await title(backlog).fill("Saved backlog");
  await expect
    .poll(() =>
      data
        .get("work-tasks")
        .filter((item) => !item.archived)
        .map((item) => item.title),
    )
    .toEqual(["Saved backlog"]);
  await page.reload();
  await expect(title(backlog)).toHaveValue("Saved backlog");
  await backlog.getByRole("button", { name: "Delete Saved backlog" }).click();
  await advisory((expect) => expect(backlog.getByRole("button", { name: "Add backlog task" })).toBeFocused());
});

test("Work: past-day creation starts completed and title edits persist", async ({ page }) => {
  const data = await openWork(page, [], FRIDAY);
  await selectedCard(page).getByRole("button", { name: "Add task", exact: true }).click();
  await advisory((expect) => expect(title(selectedCard(page))).toBeFocused());
  await title(selectedCard(page)).fill("Forgot to record this");
  await expect(selectedCard(page).getByRole("checkbox")).toBeChecked();
  await expect.poll(() => data.get("work-tasks")[0]).toMatchObject({ date: FRIDAY, checkedAt: expect.any(String) });
  await page.reload();
  await title(selectedCard(page)).fill("Corrected title");
  await expect.poll(() => data.get("work-tasks")[0].title).toBe("Corrected title");
});

test("Work: direct URLs obey history and future bounds and malformed dates return today", async ({ page }) => {
  await openWork(page, [task("Older history", "2026-08-01", "2026-08-01T12:00:00Z")], "2026-07-01");
  await expect(page).toHaveURL(/date=2026-08-01$/);
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", "2026-08-01");
  await page.goto("/work?date=2026-12-01");
  await expect(page).toHaveURL(/date=2026-09-28$/);
  await expect(page.getByRole("button", { name: /Next \d days/ })).toBeDisabled();
  await page.goto("/work?date=2026-02-30");
  await expect(page).toHaveURL(/\/work$/);
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", TODAY);
});

test("Work: future completions do not hide today or the three-day backdating window", async ({ page }) => {
  await openWork(page, [task("Future work", "2026-09-15", "2026-09-14T12:00:00Z")]);
  await selectDay(page, FRIDAY);
  await expect(selectedCard(page).getByRole("button", { name: "Add task", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", TODAY);
});

test("Work: row navigation preserves selection and Today restores the visible range", async ({ page }) => {
  await openWork(page);
  await expect(page.locator(".app-sync-status")).toHaveText("");
  await page.screenshot({ path: "test-results/work-desktop.png" });
  const calendar = page.getByRole("navigation", { name: "Work dates" });
  await calendar.getByRole("button", { name: "Next 7 days" }).focus();
  await advisory((expect) => expect(calendar.getByRole("button", { name: "Next 7 days" })).toHaveCSS("opacity", "1"));
  await calendar.getByRole("button", { name: "Next 7 days" }).press("Enter");
  await expect(page).toHaveURL(/\/work$/);
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", TODAY);
  await expect(calendar.getByRole("combobox")).toHaveCount(0);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(calendar.getByRole("combobox")).toHaveCount(1);
  await selectDay(page, "2026-09-17");
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(calendar.getByRole("combobox")).toHaveCount(1);
  await advisory((expect) => expect(calendar.getByRole("button", { name: "Next 3 days" })).toHaveCSS("opacity", "1"));
  const bounds = await calendar.getByRole("button", { name: "Next 3 days" }).boundingBox();
  await advisory((expect) => expect(bounds.x).toBeGreaterThanOrEqual(0));
  await advisory((expect) => expect(bounds.x + bounds.width).toBeLessThanOrEqual(360));
  await expect(page.locator(".app-sync-status")).toHaveText("");
  await page.screenshot({ path: "test-results/work-mobile.png" });
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(calendar.getByRole("button", { name: "Next 5 days" })).toBeVisible();
});

test("Work: day type changes persist without changing task assignment", async ({ page }) => {
  const data = await openWork(page, [task("Plan", TODAY)]);
  await page.getByRole("combobox", { name: /^Change day type/ }).selectOption("pto");
  await expect.poll(() => data.get("work-statuses")?.[TODAY]).toBe("pto");
  await page.reload();
  await expect(page.getByRole("combobox", { name: /^Change day type/ })).toHaveValue("pto");
  await expect(title(selectedCard(page))).toHaveValue("Plan");
});

test("Work: completion reorders after a delay and unchecking cancels the move", async ({ page }) => {
  await openWork(page, [task("First", TODAY), task("Second", TODAY)]);
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00Z`) });
  await page.clock.pauseAt(new Date(`${TODAY}T12:00:01Z`));
  const day = selectedCard(page);
  await day.getByRole("checkbox", { name: "Complete First" }).check();
  await page.clock.runFor(499);
  await expect(title(day).first()).toHaveValue("First");
  await day.getByRole("checkbox", { name: "Complete First" }).uncheck();
  await page.clock.runFor(1);
  await expect(title(day).first()).toHaveValue("First");
  await day.getByRole("checkbox", { name: "Complete First" }).check();
  await page.clock.runFor(500);
  await expect(title(day).last()).toHaveValue("First");
  await day.getByRole("checkbox", { name: "Complete First" }).uncheck();
  await page.clock.runFor(499);
  await expect(title(day).last()).toHaveValue("First");
  await page.clock.runFor(1);
  await expect(title(day).first()).toHaveValue("First");
});

test("Work: colors are created only for displayed cards and persist", async ({ page }) => {
  const data = await openWork(page, [task("History", "2026-08-01", "2026-08-01T12:00:00Z")]);
  await expect.poll(() => Object.keys(data.get("colors") ?? {}).sort()).toEqual([`work-day:${TODAY}`]);
  const color = await selectedCard(page).evaluate((element) => element.style.getPropertyValue("--color"));
  await selectDay(page, FRIDAY);
  await expect.poll(() => CARD_COLORS.includes(data.get("colors")?.[`work-day:${FRIDAY}`])).toBe(true);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  expect(await selectedCard(page).evaluate((element) => element.style.getPropertyValue("--color"))).toBe(color);
  await page.reload();
  expect(await selectedCard(page).evaluate((element) => element.style.getPropertyValue("--color"))).toBe(color);
});

test("Work: root and browser history preserve date selection and Today removes the query", async ({ page }) => {
  await openWork(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/work$/);
  await selectDay(page, FRIDAY);
  await selectDay(page, "2026-09-12");
  await page.goBack();
  await expect(page).toHaveURL(/date=2026-09-11$/);
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", FRIDAY);
  await page.goForward();
  await expect(page).toHaveURL(/date=2026-09-12$/);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", TODAY);
});

test.describe("Work touch and local dates", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId: "Europe/Amsterdam" });

  test("Work: touch arrows navigate rows without changing the selected day", async ({ page }) => {
    await openWork(page, [task("Touch task", TODAY)]);
    const next = page.getByRole("button", { name: "Next 3 days" });
    await advisory((expect) => expect(next).toHaveCSS("opacity", "1"));
    await next.tap();
    await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", TODAY);
    await page.getByRole("button", { name: "Previous 3 days" }).tap();
    await expect(page.getByRole("combobox", { name: /^Change day type/ })).toBeVisible();
    await advisory(async (expect) =>
      expect(await page.locator("html").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(390),
    );
    await expect(page.locator(".app-sync-status")).toHaveText("");
    await page.screenshot({ path: "test-results/work-touch.png" });
  });

  test("Work: local midnight preserves backdated completions and rolls only unfinished work", async ({ page }) => {
    const data = appDataByPage.get(page);
    data.set("work-tasks", [task("Friday done", FRIDAY, `${TODAY}T12:00:00Z`), task("Carry forward", TODAY)]);
    await page.clock.install({ time: new Date("2026-09-14T21:59:50Z") });
    await page.goto(`/work?date=${FRIDAY}`);
    await expect(selectedCard(page).getByRole("checkbox", { name: "Complete Friday done" })).toBeChecked();
    await page.clock.runFor(11000);
    await expect(selectedCard(page).locator("time")).toHaveAttribute("datetime", FRIDAY);
    await expect(selectedCard(page).getByRole("checkbox", { name: "Complete Friday done" })).toBeChecked();
    await expect(title(selectedCard(page))).toHaveCount(0);
    await expect.poll(() => data.get("work-tasks").find((item) => item.id === "Carry forward").date).toBe("2026-09-15");
    expect(data.get("work-tasks").find((item) => item.id === "Friday done").date).toBe(FRIDAY);
    await page.reload();
    await expect(selectedCard(page).getByRole("checkbox", { name: "Complete Friday done" })).toBeChecked();
  });
});

test("Work: stale duplicate drafts clear on startup without changing saved tasks", async ({ page }) => {
  const tasks = [task("Already saved", TODAY)];
  await page.addInitScript((value) => {
    for (const id of ["old-tab-a", "old-tab-b"]) {
      globalThis.localStorage.setItem(
        `done-ish.pending-write.v1:${id}`,
        JSON.stringify({
          id,
          resource: "work-tasks",
          revision: 0,
          base: "[]",
          value,
        }),
      );
    }
  }, tasks);
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().endsWith("/api/data/work-tasks")) writes.push(request);
  });
  await openWork(page, tasks);
  await expect(title(selectedCard(page))).toHaveValue("Already saved");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(globalThis.localStorage).filter((key) => key.startsWith("done-ish.pending-write.v1:")).length,
      ),
    )
    .toBe(0);
  expect(writes).toHaveLength(0);
});
