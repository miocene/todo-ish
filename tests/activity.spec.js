import { test, expect } from "./app-fixture.js";

test("Activity renders a full year of history without initializing resources", async ({
  page,
  appData,
}) => {
  const year = new Date().getFullYear();
  const history = Array.from({ length: 2000 }, (_, index) => ({
    id: `history-${index}`,
    title: `Completed item ${index}`,
    completedAt: new Date(
      Date.UTC(year, 0, 1 + (index % 365), 12),
    ).toISOString(),
  }));
  appData.set("todos", { lists: [], history });
  appData.set("work-tasks", []);
  appData.set("work-statuses", {});
  appData.set("chores", { tasks: [], occurrenceOrder: [] });
  appData.set("shopping", { tasks: [] });
  appData.set("printing", { projects: [] });
  appData.set("cross-stitch", { projects: [] });
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "PUT") writes.push(request.url());
  });
  const started = Date.now();
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: `2000 checked items in ${year}` }),
  ).toBeVisible();
  await expect(page.locator(".activity-day li")).toHaveCount(2000);
  console.log(
    `Activity: 2000 rows across one year ready in ${Date.now() - started} ms (including navigation).`,
  );
  expect(writes).toEqual([]);
});
