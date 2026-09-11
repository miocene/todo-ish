import { advisory, test, expect } from "./app-fixture.js";

test("kebab and profile menus share native dismissal and panel styling", async ({
  page,
}) => {
  await page.goto("/printing");
  const card = page.locator(".project-card").first();
  const trigger = card.getByRole("button", { name: /^Actions for/ });
  const menu = card.locator(".jm-popover");
  await trigger.click();
  await expect(menu).toBeVisible();
  const style = await menu.evaluate((element) => {
    const css = globalThis.getComputedStyle(element);
    return {
      background: css.backgroundColor,
      radius: css.borderRadius,
      padding: css.padding,
      shadow: css.boxShadow,
    };
  });
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await advisory((expect) => expect(trigger).toBeFocused());
  await trigger.click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(menu).not.toBeVisible();
  const profile = page.locator(".jm-header__profile-menu");
  await expect(profile).toBeVisible();
  expect(
    await profile.evaluate((element) => {
      const css = globalThis.getComputedStyle(element);
      return {
        background: css.backgroundColor,
        radius: css.borderRadius,
        padding: css.padding,
        shadow: css.boxShadow,
      };
    }),
  ).toEqual(style);
  await page.keyboard.press("Escape");
  await trigger.click();
  await menu.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Edit project" }),
  ).toBeVisible();
});
