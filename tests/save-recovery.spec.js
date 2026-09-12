import { test, expect, appDataByPage } from "./app-fixture.js";

test(
  "failed saves survive reload and clear the error after recovery",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/work");
    const data = appDataByPage.get(page);
    await expect.poll(() => data.get("work-tasks")?.length).toBeGreaterThan(0);
    data.setWriteFailure("work-tasks", 503);
    await page
      .locator(".jm-card:not(.work-backlog) textarea")
      .first()
      .fill("Recover this edit");
    await expect(
      page.getByRole("button", { name: "Download local edits" }),
    ).toBeVisible();
    data.setWriteFailure("work-tasks", 0);
    await page.reload();
    await expect
      .poll(() =>
        data
          .get("work-tasks")
          ?.some((task) => task.title === "Recover this edit"),
      )
      .toBe(true);
    await expect(page.locator(".app-sync-error")).toHaveCount(0);
  },
);

test("pending todo edits recover against the older API while colors remain mocked", async ({
  page,
}) => {
  const data = appDataByPage.get(page);
  data.setColorSupport(false);
  data.set("todos", {
    lists: [
      {
        id: "general",
        title: "General",
        tasks: [{ id: "todo-1", title: "Before", completed: false }],
      },
    ],
  });
  await page.goto("/todos");
  data.setWriteFailure("todos", 503);
  await page
    .getByRole("textbox", { name: "Task title" })
    .fill("Recover this edit");
  await expect(
    page.getByRole("button", { name: "Download local edits" }),
  ).toBeVisible();
  data.setWriteFailure("todos", 0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue(
    "Recover this edit",
  );
  await expect
    .poll(() => data.get("todos").lists[0].tasks[0].title)
    .toBe("Recover this edit");
  await expect(page.locator(".app-sync-error")).toHaveCount(0);
  expect(data.get("todos").lists[0].color).toBeUndefined();
});
