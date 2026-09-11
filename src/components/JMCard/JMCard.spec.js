import { advisory, test, expect } from "../../../tests/app-fixture.js";

test("native anchors flip menus away from viewport edges", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto("/printing");
  const card = page.locator(".project-card").first();
  const trigger = card.getByRole("button", { name: /^Actions for/ });
  await card.evaluate((element) => {
    // Keep the relocated trigger above sibling card stacking contexts.
    element.style.zIndex = "10";
  });
  await trigger.evaluate((button) => {
    Object.assign(button.style, {
      position: "fixed",
      bottom: "90px",
      left: "8px",
      zIndex: "10",
    });
  });
  await trigger.click();
  const menu = card.locator(".jm-popover");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const triggerBox = await trigger.boundingBox();
  await advisory((expect) =>
    expect(box.y + box.height).toBeLessThanOrEqual(triggerBox.y),
  );
  await advisory((expect) => expect(box.x).toBeGreaterThanOrEqual(0));
  await advisory((expect) =>
    expect(box.x + box.width).toBeLessThanOrEqual(360),
  );
  await advisory((expect) =>
    expect(menu).not.toHaveAttribute(
      "style",
      /top|right|bottom|max-block-size/,
    ),
  );
});
