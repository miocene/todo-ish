import { test, expect } from "./app-fixture.js";

test("Work bounds new tasks and titles before saving", async ({
  page,
  appData,
}) => {
  appData.set(
    "work-tasks",
    Array.from({ length: 2000 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      date: null,
    })),
  );
  await page.goto("/work");
  await page
    .getByRole("button", { name: "Add backlog task", exact: true })
    .click();
  await expect(
    page.getByText(
      "Work can contain up to 2,000 active tasks. Delete a task before adding another.",
    ),
  ).toBeVisible();
  await expect(page.locator(".work-backlog textarea")).toHaveCount(2000);
  await expect(page.locator(".work-backlog textarea").first()).toHaveAttribute(
    "maxlength",
    "500",
  );
  expect(appData.validationErrors).toEqual([]);
});

test("invalid stock stays editable without entering the save queue", async ({
  page,
  appData,
}) => {
  appData.set("filament-inventory", {});
  appData.set("printing", { projects: [] });
  await page.goto("/catalog");
  const quantity = page
    .locator('.jm-catalog-item input[type="number"]')
    .first();
  await quantity.fill("10000001");
  await expect(page.getByRole("alert")).toContainText("Enter a whole number");
  expect(appData.get("filament-inventory")).toEqual({});
  await quantity.fill("2");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() => Object.values(appData.get("filament-inventory")))
    .toEqual([2]);
  expect(appData.validationErrors).toEqual([]);
});

test("cross-stitch rejects excess skeins while preserving the draft", async ({
  page,
  appData,
}) => {
  appData.set("cross-stitch", { projects: [] });
  await page.goto("/cross-stitch");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.getByLabel("Skeins needed").fill("10001");
  await expect(page.getByRole("alert")).toContainText("between 0 and 10,000");
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Skeins needed")).toHaveValue("10001");
  expect(appData.get("cross-stitch")).toEqual({ projects: [] });
});
