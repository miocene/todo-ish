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
    await expect(swatch).toHaveCSS(
      "background-color",
      kind === "floss" ? "rgb(0, 0, 0)" : "rgb(216, 214, 208)",
    );
  });
}

test("Filament selects and previews distinguish solid swatches from images", async ({
  page,
  appData,
}) => {
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
            filaments: [
              {
                id: "usage",
                catalogId: "bambu-pps-cf",
                label: "PPS",
                weightGrams: 100,
              },
            ],
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
  const select = page
    .getByRole("dialog")
    .getByLabel("Filament 1", { exact: true });
  await expect(select.locator(".selection .jm-swatch")).not.toHaveAttribute(
    "src",
  );
  await select.selectOption("bambu-pla-basic-filament-10101");
  await expect(select.locator(".selection .jm-swatch")).toHaveAttribute(
    "src",
    /^https:/,
  );
});

test(
  "Catalog submit records filters and browser history restores the query",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/catalog?q=10101");
    const search = page.getByRole("searchbox", { name: "Search filaments" });
    await expect(search).toHaveValue("10101");
    await expect(
      page.locator("header.jm-header").getByRole("button", { name: "Search" }),
    ).toHaveCount(0);
    await search.fill("10601");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/q=10601/);
    await page.goBack();
    await expect(search).toHaveValue("10101");
    await expect(page.locator(".jm-catalog-item h2")).toContainText("Black");
    await page.goForward();
    await expect(search).toHaveValue("10601");
  },
);

for (const [kind, id, label, resource, quantity, shortage] of [
  [
    "filament",
    "bambu-pla-basic-filament-10601",
    "Spools owned",
    "filament-inventory",
    "2",
    /PLA Basic · Blue filament/,
  ],
  [
    "floss",
    "dmc3853",
    "Skeins owned",
    "floss-inventory",
    "1",
    /DMC 3853.*floss/,
  ],
]) {
  test(`${kind}: editing owned stock clears the shopping shortage after reload`, async ({
    page,
    appData,
  }) => {
    await page.goto("/shopping");
    await expect(page.getByRole("link", { name: shortage })).toBeVisible();
    await page.goto(`/catalog?catalog=${kind}&q=${id}`);
    const owned = page.getByLabel(label);
    await owned.fill(quantity);
    await owned.blur();
    await expect.poll(() => appData.get(resource)?.[id]).toBe(Number(quantity));
    await page.reload();
    await expect(owned).toHaveValue(quantity);
    await page.goto("/shopping");
    await expect(page.getByRole("link", { name: shortage })).toHaveCount(0);
  });
}
