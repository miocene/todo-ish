import { test, expect, appDataByPage } from "./app-fixture.js";
import { CARD_COLORS } from "../src/app/card-colors.js";
import { localIsoDate, localFullDateLabel } from "./date-helpers.js";

test("all numbered card backgrounds resolve through CSS", async ({
  page,
  appData,
}) => {
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
      const hex = globalThis
        .getComputedStyle(element)
        .getPropertyValue(token)
        .trim();
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
});

test("development mocks colors locally when the API has no color storage", async ({
  page,
}) => {
  const data = appDataByPage.get(page);
  data.setColorSupport(false);
  data.set("todos", {
    lists: [
      {
        id: "general",
        title: "General",
        tasks: [{ id: "task-1", title: "Original task", completed: false }],
      },
    ],
  });
  data.set("printing", {
    projects: [
      {
        id: "existing-project",
        title: "Existing project",
        color: "#123456",
        description: "",
        tasks: [],
      },
    ],
  });
  const colorRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/data/colors")
      colorRequests.push(request.url());
  });
  const colorOf = (locator) =>
    locator.evaluate(
      (element) =>
        Number(
          element.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
        ) || "",
    );

  await page.goto("/work");
  const todayColor = await colorOf(page.locator(".jm-card:not(.work-backlog)"));
  const backlogColor = await colorOf(page.locator(".work-backlog"));
  expect(CARD_COLORS).toContain(todayColor);
  expect(backlogColor).toBe("");
  await page.reload();
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(
    todayColor,
  );
  expect(await colorOf(page.locator(".work-backlog"))).toBe(backlogColor);

  await page.goto("/todos");
  const listColor = await colorOf(page.locator(".todo-list-card").first());
  expect(CARD_COLORS).toContain(listColor);
  expect(data.get("todos").lists[0]).not.toHaveProperty("color");
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Still saved to the API");
  await expect
    .poll(() => data.get("todos").lists[0].tasks[0].title)
    .toBe("Still saved to the API");
  await page.reload();
  expect(await colorOf(page.locator(".todo-list-card").first())).toBe(
    listColor,
  );
  await expect(
    page.getByRole("textbox", { name: "Task title", exact: true }),
  ).toHaveValue("Still saved to the API");
  expect(data.get("todos").lists[0]).not.toHaveProperty("color");

  await page.goto("/printing");
  const projectColor = await colorOf(page.locator(".project-card"));
  expect(CARD_COLORS).toContain(projectColor);
  expect(data.get("printing").projects[0].color).toBe("#123456");
  await page.reload();
  expect(await colorOf(page.locator(".project-card"))).toBe(projectColor);
  await page.goto("/chores");
  await expect(page.locator(".jm-card")).toHaveCount(2);
  const choreColors = await page
    .locator(".jm-card")
    .evaluateAll((cards) =>
      cards.map(
        (card) =>
          Number(
            card.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
          ) || "",
      ),
    );
  expect(choreColors).toEqual(["", ""]);
  await page.reload();
  await expect(page.locator(".jm-card")).toHaveCount(2);
  expect(
    await page
      .locator(".jm-card")
      .evaluateAll((cards) =>
        cards.map(
          (card) =>
            Number(
              card.style
                .getPropertyValue("--color")
                .match(/--color-(\d+)/)?.[1],
            ) || "",
        ),
      ),
  ).toEqual(choreColors);
  expect(colorRequests).toEqual([]);
});

test("card color numbers persist and missing colors initialize without visible controls", async ({
  page,
}) => {
  const data = appDataByPage.get(page);
  const savedWorkColor = CARD_COLORS[0];
  const savedListColor = CARD_COLORS[7];
  data.set("todos", {
    lists: [
      { id: "general", title: "General", tasks: [] },
      { id: "home", title: "Home", color: savedListColor, tasks: [] },
    ],
  });
  data.set("printing", {
    projects: [
      {
        id: "legacy-project",
        title: "Existing project",
        color: CARD_COLORS.at(-1),
        description: "",
        tasks: [],
      },
    ],
  });
  data.set("colors", { [`work-day:${localIsoDate(-1)}`]: savedWorkColor });

  const colorOf = (locator) =>
    locator.evaluate(
      (element) =>
        Number(
          element.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
        ) || "",
    );
  await page.goto("/work");
  const todayColor = await colorOf(page.locator(".jm-card:not(.work-backlog)"));
  const backlogColor = await colorOf(page.locator(".work-backlog"));
  expect(CARD_COLORS).toContain(todayColor);
  expect(backlogColor).toBe("");
  await expect
    .poll(() => data.get("colors"))
    .toMatchObject({
      [`work-day:${localIsoDate()}`]: todayColor,
      [`work-day:${localIsoDate(-1)}`]: savedWorkColor,
    });
  expect(data.get("colors")).not.toHaveProperty("today");
  await page
    .getByRole("button", {
      name: `${localFullDateLabel(-1)}. No completed tasks`,
      exact: true,
    })
    .click();
  await expect(
    page.locator(".jm-card:not(.work-backlog) time"),
  ).toHaveAttribute("datetime", localIsoDate(-1));
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(
    savedWorkColor,
  );
  const previousDay = page.getByRole("button", {
    name: `${localFullDateLabel(-2)}. No completed tasks`,
    exact: true,
  });
  if (!(await previousDay.count()))
    await page.getByRole("button", { name: /^Previous \d+ days$/ }).click();
  await previousDay.click();
  await expect(
    page.locator(".jm-card:not(.work-backlog) time"),
  ).toHaveAttribute("datetime", localIsoDate(-2));
  const pastDayColor = await colorOf(
    page.locator(".jm-card:not(.work-backlog)"),
  );
  expect(CARD_COLORS).toContain(pastDayColor);
  await expect
    .poll(() => data.get("colors")[`work-day:${localIsoDate(-2)}`])
    .toBe(pastDayColor);
  await page.reload();
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(
    pastDayColor,
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.locator(".jm-card:not(.work-backlog) time"),
  ).toHaveAttribute("datetime", localIsoDate());
  await page.reload();
  expect(await colorOf(page.locator(".jm-card:not(.work-backlog)"))).toBe(
    todayColor,
  );
  expect(await colorOf(page.locator(".work-backlog"))).toBe(backlogColor);

  await page.goto("/todos");
  const listColor = await colorOf(page.locator(".todo-list-card").first());
  expect(CARD_COLORS).toContain(listColor);
  await expect.poll(() => data.get("todos").lists[0].color).toBe(listColor);
  expect(await colorOf(page.locator("#todo-list-home"))).toBe(savedListColor);
  await page.reload();
  expect(await colorOf(page.locator("#todo-list-home"))).toBe(savedListColor);
  expect(await colorOf(page.locator(".todo-list-card").first())).toBe(
    listColor,
  );

  // List creation uses the same save boundary, including callers without a color field.
  await page.evaluate(async () => {
    const { loadPageTasks, savePageTasks } =
      await import("/src/app/page-tasks.js");
    const todos = loadPageTasks("todos");
    todos.lists.push({ id: "new-list", title: "New list", tasks: [] });
    savePageTasks("todos", todos);
  });
  await expect.poll(() => data.get("todos").lists.length).toBe(3);
  const newListColor = data.get("todos").lists.at(-1).color;
  expect(CARD_COLORS).toContain(newListColor);
  await page.reload();
  expect(await colorOf(page.locator("#todo-list-new-list"))).toBe(newListColor);

  await page.goto("/printing");
  const projectColor = await colorOf(page.locator(".project-card"));
  expect(CARD_COLORS).toContain(projectColor);
  await expect
    .poll(() => data.get("printing").projects[0].color)
    .toBe(projectColor);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  const projectHex = await page.evaluate(
    (number) =>
      globalThis
        .getComputedStyle(globalThis.document.documentElement)
        .getPropertyValue(`--color-${number}`)
        .trim(),
    projectColor,
  );
  const projectRgb = projectHex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16))
    .join(", ");
  await expect(page.locator(".project-card")).toHaveCSS(
    "background-color",
    `rgb(${projectRgb})`,
  );
  await page.reload();
  expect(await colorOf(page.locator(".project-card"))).toBe(projectColor);

  await page.goto("/cross-stitch");
  await page.getByRole("button", { name: "Add project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New project" });
  await projectDialog
    .getByRole("textbox", { name: "Project name" })
    .fill("New cross stitch project");
  await projectDialog
    .getByRole("combobox", { name: "Thread color" })
    .selectOption("dmc310");
  await projectDialog
    .getByRole("spinbutton", { name: "Crosses total" })
    .fill("100");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  const newProjectColor = await colorOf(page.locator(".project-card").last());
  expect(CARD_COLORS).toContain(newProjectColor);
  await expect
    .poll(() => data.get("cross-stitch")?.projects.at(-1).color)
    .toBe(newProjectColor);
  await page.reload();
  expect(await colorOf(page.locator(".project-card").last())).toBe(
    newProjectColor,
  );
});
