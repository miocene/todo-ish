import { test, expect } from "./app-fixture.js";
import flossSnapshot from "../backend/catalogs/dmc-floss.snapshot.json" with { type: "json" };
import filamentSnapshot from "../backend/catalogs/bambu-filaments.snapshot.json" with { type: "json" };

test("catalog typing and a ten-task project editor retain catalog choices", async ({
  page,
  appData,
}) => {
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
          filaments: [
            { id: `usage-${i}`, catalogId: "", label: "", weightGrams: "" },
          ],
        })),
      },
    ],
  });
  await page.goto("/printing");
  await page
    .getByLabel("Actions for Benchmark project", { exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit project",
    exact: true,
  });
  await expect(dialog.locator("select")).toHaveCount(10);
  await expect(dialog.locator("select").first().locator("option")).toHaveCount(
    filamentSnapshot.entries.length + 1,
  );
  await page.goto("/catalog?catalog=floss");
  await expect(page.locator(".catalog-list > li")).toHaveCount(
    flossSnapshot.entries.length,
  );
  await page.locator("#catalog-query").fill("310");
  await expect(page.locator(".catalog-list > li")).toHaveCount(1);
});
