import { test, expect } from "../../../tests/app-fixture.js";

test("navigation tabs follow query changes, browser history, and reloads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 1000 });
  const currentYear = new Date().getFullYear();
  const cases = [
    {
      path: "/catalog",
      name: "Catalog",
      first: "3D printing filament",
      next: "DMC embroidery floss",
      query: "catalog",
      value: "floss",
    },
    {
      path: "/profile",
      name: "Activity years",
      first: String(currentYear),
      next: String(currentYear - 1),
      query: "year",
      value: String(currentYear - 1),
    },
  ];

  for (const tabs of cases) {
    await page.goto(tabs.path);
    const navigation = page.getByRole("navigation", {
      name: tabs.name,
      exact: true,
    });
    const active = navigation.locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(tabs.first);
    const next = navigation.getByRole("link", { name: tabs.next, exact: true });
    await expect(next).toHaveAttribute(
      "href",
      `${tabs.path}?${tabs.query}=${tabs.value}`,
    );
    await next.focus();
    await next.press("Enter");
    await expect
      .poll(() => new URL(page.url()).searchParams.get(tabs.query))
      .toBe(tabs.value);
    await expect(active).toHaveText(tabs.next);
    await page.goBack();
    await expect(active).toHaveText(tabs.first);
    await page.goForward();
    await expect(active).toHaveText(tabs.next);
    await page.reload();
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(tabs.next);
    await page.goto(`${tabs.path}?${tabs.query}=unknown`);
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(tabs.first);
  }
});
