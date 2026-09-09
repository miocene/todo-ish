import { test, expect } from "./app-fixture.js";

for (const [query, kind] of [
  ["bambu-pla-cmyk-lithophane", "filament"],
  ["bambu-pps-cf", "filament"],
  ["dmc310", "floss"],
]) {
  test(`Catalog renders ${query} as a solid swatch`, async ({ page }) => {
    await page.goto(`/catalog?catalog=${kind}&q=${query}`);
    const swatch = page.locator(".jm-catalog-item .jm-swatch");
    await expect(swatch).toHaveCount(1);
    await expect(swatch).not.toHaveAttribute("src");
    await expect(swatch).toHaveCSS("background-color", kind === "floss" ? "rgb(0, 0, 0)" : "rgb(216, 214, 208)");
    await expect(swatch).toHaveCSS("width", "48px");
  });
}

test("Filament selects and previews distinguish solid swatches from images", async ({ page, appData }) => {
  appData.set("printing", {
    projects: [
      {
        id: "project",
        title: "Print",
        color: "#2765EC",
        description: "",
        tasks: [
          {
            id: "task",
            title: "Piece",
            completed: false,
            filaments: [{ id: "usage", catalogId: "bambu-pps-cf", label: "PPS", weightGrams: 100 }],
          },
        ],
      },
    ],
  });
  await page.goto("/printing");
  const swatch = page.locator(".project-card .jm-swatch");
  await expect(swatch).toHaveCSS("background-color", "rgb(216, 214, 208)");
  await page.getByRole("button", { name: "Actions for Print" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const select = page.getByRole("dialog").getByLabel("Filament 1", { exact: true });
  await expect(select.locator(".selection .jm-swatch")).not.toHaveAttribute("src");
  await select.selectOption("bambu-pla-basic-filament-10101");
  await expect(select.locator(".selection .jm-swatch")).toHaveAttribute("src", /^https:/);
});
