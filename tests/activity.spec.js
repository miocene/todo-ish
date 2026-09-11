import { advisory, test, expect } from "./app-fixture.js";

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
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Checked activity" }),
  ).toBeVisible();
  await expect(page.locator(".activity-day li")).toHaveCount(2000);
  expect(writes).toEqual([]);
});

test("profile shows yearly task activity and newly checked items", async ({
  page,
}) => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  await page.goto("/todos");
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("link", { name: "Activity", exact: true }).click();

  await expect(
    page.getByRole("navigation", { name: "Activity years" }).getByRole("link"),
  ).toHaveCount(5);
  await advisory((expect) =>
    expect(
      page.getByRole("link", { name: String(currentYear), exact: true }),
    ).toHaveAttribute("aria-current", "page"),
  );
  await expect(page.locator(".jm-activity-graph .days > time")).toHaveCount(
    currentYear % 4 === 0 ? 366 : 365,
  );
  await expect(page.locator(".jm-activity-graph a")).toHaveCount(0);
  await expect(page.getByText("Renew passport", { exact: true })).toBeVisible();

  await page
    .getByRole("link", { name: String(previousYear), exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("year"))
    .toBe(String(previousYear));
  await expect(
    page.getByText(`No checked items in ${previousYear}.`),
  ).toBeVisible();
});
