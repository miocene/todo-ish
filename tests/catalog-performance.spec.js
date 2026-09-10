import { test, expect } from "./app-fixture.js";
test("catalog typing and a ten-task project editor retain catalog choices", async ({ page, appData }) => {
  appData.set("printing", {
    projects: [
      {
        id: "bench",
        title: "Benchmark project",
        description: "",
        color: "#2765EC",
        tasks: Array.from({ length: 10 }, (_, i) => ({
          id: `task-${i}`,
          title: `Part ${i}`,
          completed: false,
          filaments: [{ id: `usage-${i}`, catalogId: "", label: "", weightGrams: "" }],
        })),
      },
    ],
  });
  await page.goto("/printing");
  await page.getByLabel("Actions for Benchmark project", { exact: true }).click();
  const started = performance.now();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit project", exact: true });
  await expect(dialog.locator("select")).toHaveCount(10);
  await expect(dialog.locator("select").first().locator("option")).toHaveCount(266);
  const modalMilliseconds = performance.now() - started;
  await page.goto("/catalog?catalog=floss");
  await expect(page.locator(".catalog-list > li")).toHaveCount(454);
  const typingMilliseconds = await page.evaluate(async () => {
    const input = globalThis.document.querySelector("#catalog-query");
    const started = performance.now();
    for (const query of ["r", "re", "red", "b", "bl", "blue", "", "3", "31", "310"]) {
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)));
    }
    return (performance.now() - started) / 10;
  });
  await expect(page.locator(".catalog-list > li")).toHaveCount(1);
  console.log("Catalog measurement:", JSON.stringify({ modalMilliseconds, typingMilliseconds }));
});
