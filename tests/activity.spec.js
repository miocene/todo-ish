import { advisory, test, expect } from "./app-fixture.js";

test(
  "Activity opens from the dropdown with a full year of history and remains responsive",
  { tag: "@smoke" },
  async ({ page, appData }) => {
    const year = new Date().getFullYear();
    const history = Array.from({ length: 2000 }, (_, index) => ({
      id: `history-${index}`,
      title: `Completed item ${index}`,
      completedAt: new Date(
        Date.UTC(year, 0, 1 + (index % 365), 12),
      ).toISOString(),
    }));
    appData.set("todos", {
      lists: [{ id: "general", title: "General", color: 1, tasks: [] }],
      history,
    });
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
    await page.goto("/todos");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const menu = page.locator(".jm-header__profile-menu");
    await menu.getByRole("link", { name: "Activity", exact: true }).click();
    // Rendering the 2,000-entry fixture can exceed the default wait on CI WebKit.
    await expect(page).toHaveURL(/\/profile$/, { timeout: 15_000 });
    await expect(menu).not.toBeVisible();
    const cards = page.locator("article.jm-card.activity-day");
    await expect(cards).toHaveCount(365);
    await expect(cards.locator("header time")).toHaveCount(365);
    await expect(cards.locator("li")).toHaveCount(2000);
    await expect(cards.locator('use[href$="#icon-todo"]')).toHaveCount(2000);
    await expect(cards.getByRole("link")).toHaveCount(0);
    expect(writes).toEqual([]);
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.last().locator("li").last()).toBeVisible();
    const years = page.getByRole("navigation", { name: "Activity years" });
    await years
      .getByRole("link", { name: String(year - 1), exact: true })
      .click();
    await expect(page.getByText(`No activity in ${year - 1}.`)).toBeVisible();
    await years.getByRole("link", { name: String(year), exact: true }).click();
    await expect(cards).toHaveCount(365);
  },
);

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
  await expect(page.locator(".activity-day").getByRole("button")).toHaveCount(
    0,
  );
  await expect(page.getByText("Renew passport", { exact: true })).toBeVisible();

  await page
    .getByRole("link", { name: String(previousYear), exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("year"))
    .toBe(String(previousYear));
  await expect(page.getByText(`No activity in ${previousYear}.`)).toBeVisible();
});

test("saved partial stitching appears as daily project totals after reload", async ({
  page,
  appData,
}) => {
  appData.set("todos", { lists: [] });
  appData.set("work-tasks", []);
  appData.set("chores", { tasks: [], occurrenceOrder: [] });
  appData.set("shopping", { tasks: [] });
  appData.set("printing", { projects: [] });
  appData.set("cross-stitch", {
    projects: [
      {
        id: "p",
        title: "Flowers",
        color: 1,
        description: "",
        tasks: [
          {
            id: "red",
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
  await page.goto("/cross-stitch");
  for (const amount of [20, 35]) {
    const input = page.getByRole("spinbutton", {
      name: "Stitches done for Black",
      exact: true,
    });
    await input.fill(String(amount));
    await input.blur();
    await expect
      .poll(() => appData.get("cross-stitch").projects[0].tasks[0].crossesDone)
      .toBe(amount);
  }
  await page.goto("/profile");
  await page.reload();
  await expect(
    page.getByText("Flowers - 35 stitches", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".activity-day .title").filter({ hasText: "35 stitches" }),
  ).toHaveCount(1);
  await expect(
    page.locator('.activity-day use[href$="#icon-yarn"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(".activity-day li").filter({ hasText: "Black" }),
  ).toHaveCount(0);
  const day = await page
    .locator(".activity-day header time")
    .getAttribute("datetime");
  await expect(
    page.locator(`.jm-activity-graph time[datetime="${day}"]`),
  ).toHaveAttribute("data-level", "1");
});
