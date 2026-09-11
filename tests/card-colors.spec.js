import { test, expect } from "./app-fixture.js";
import { CARD_COLORS } from "../src/app/card-colors.js";

test("all numbered card backgrounds resolve through CSS", async ({ page, appData }, testInfo) => {
  appData.set("todos", {
    lists: CARD_COLORS.map((color) => ({
      id: color === 1 ? "general" : `palette-${color}`,
      title: `Color ${color}`,
      color,
      tasks: [],
    })),
  });
  await page.goto("/todos");
  const cards = page.locator(".todo-list-card");
  await expect(cards).toHaveCount(CARD_COLORS.length);
  const rendered = await cards.evaluateAll((elements) =>
    elements.map((element, index) => {
      const token = `--color-${index + 1}`;
      const hex = globalThis.getComputedStyle(element).getPropertyValue(token).trim();
      const rgb = hex
        .slice(1)
        .match(/../g)
        .map((channel) => parseInt(channel, 16))
        .join(", ");
      return {
        reference: element.style.getPropertyValue("--color"),
        background: globalThis.getComputedStyle(element).backgroundColor,
        expected: `rgb(${rgb})`,
      };
    }),
  );
  for (const [index, card] of rendered.entries()) {
    expect(card.reference).toBe(`var(--color-${index + 1})`);
    expect(card.background).toBe(card.expected);
  }
  await page.screenshot({ path: testInfo.outputPath("card-palette.png"), fullPage: true });
});
