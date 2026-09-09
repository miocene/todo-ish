import { test, expect } from "./app-fixture.js";

const manual = (id, title, completedAt) => ({
  id,
  title,
  completed: Boolean(completedAt),
  ...(completedAt && { completedAt }),
});

test("navigation choices save to the account and another account ignores its pending drafts", async ({
  page,
  appData,
}) => {
  appData.set("preferences", { hiddenNavigation: ["printing"] });
  await page.goto("/work");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link", { name: "3D printing" })).toHaveCount(0);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("switch", { name: "Chores", exact: true }).click();
  await expect.poll(() => appData.get("preferences").hiddenNavigation).toEqual(["chores", "printing"]);
  await page.reload();
  await expect(navigation.getByRole("link", { name: "Chores", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem(
      "done-ish.pending-write.v2:owner:private-draft",
      JSON.stringify({
        id: "private-draft",
        resource: "work-tasks",
        revision: 0,
        value: [{ id: "private", title: "Other user's private draft", date: null }],
      }),
    );
    localStorage.setItem("done-ish.hidden-navigation.v1", JSON.stringify(["work"]));
  });
  appData.setSession({
    authenticated: true,
    bootstrapRequired: false,
    user: { id: "second", username: "second", displayName: "Second" },
  });
  appData.set("preferences", { hiddenNavigation: [] });
  appData.set("work-tasks", []);
  await page.reload();
  await expect(navigation.getByRole("link", { name: "3D printing" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByText("Other user's private draft", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("done-ish.pending-write.v2:owner:private-draft")),
  ).not.toBeNull();
});

test("shared shopping changes refresh while the page stays open", async ({ page, appData }) => {
  appData.set("shopping", { tasks: [manual("milk", "Milk")] });
  appData.set("printing", { projects: [] });
  appData.set("cross-stitch", { projects: [] });
  await page.goto("/shopping");
  await expect(page.locator("#shopping-title-milk")).toHaveValue("Milk");
  appData.update("shopping", {
    tasks: [manual("milk", "Oat milk", "2026-09-09T12:00:00.000Z"), manual("bread", "Bread")],
  });
  await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  await expect(page.locator("#shopping-title-milk")).toHaveValue("Oat milk");
  await expect(page.locator("#task-item-complete-milk")).toBeChecked();
  await expect(page.locator("#shopping-title-bread")).toHaveValue("Bread");
  await page.locator("#shopping-title-bread").fill("Rye bread");
  await expect.poll(() => appData.get("shopping").tasks.find((item) => item.id === "bread").title).toBe("Rye bread");
  expect(appData.validationErrors).toEqual([]);
});

test("a pre-created second account can enter its one-time setup code", async ({ page, appData }) => {
  appData.setSession({ authenticated: false, bootstrapRequired: false, user: null });
  let received;
  await page.route("**/api/auth/registration/options", async (route) => {
    received = route.request().postDataJSON();
    await route.fulfill({ status: 401, json: { error: "The setup code is invalid, expired, or already used" } });
  });
  await page.goto("/work");
  await page.getByRole("button", { name: "I have a setup code" }).click();
  await page.getByLabel("One-time setup code").fill("second-user-code");
  await page.getByRole("button", { name: "Create passkey", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("The setup code is invalid, expired, or already used");
  expect(received).toEqual({ token: "second-user-code" });
});
