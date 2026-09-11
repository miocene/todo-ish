import { advisory, test, expect, appDataByPage } from "./app-fixture.js";
import { CARD_COLORS } from "../src/app/card-colors.js";

test("task pages save inline changes and project dialogs save on submit", async ({
  page,
}) => {
  await page.goto("/todos");
  await expect(page.locator(".todo-list-card > header h2")).toHaveText([
    "General",
    "Home",
    "Travel",
  ]);
  const homeTasks = page.locator("#todo-list-home textarea");
  await homeTasks.last().press("Enter");
  await expect(homeTasks).toHaveCount(3);
  await advisory((expect) => expect(homeTasks.nth(1)).toBeFocused());
  await page.getByRole("button", { name: "New list", exact: true }).focus();
  await expect(homeTasks).toHaveCount(2);

  await page.goto("/shopping");
  await expect(
    page.getByRole("button", { name: /^Remove .* from shopping list$/ }),
  ).toHaveCount(3);
  expect(
    await page
      .getByLabel("Task title")
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["Oat milk", "Apples", "Dish soap"]);
  const petgShoppingLink = page.getByRole("link", {
    name: /PETG Basic · Charcoal filament · 1 spool/,
  });
  const blueShoppingLink = page.getByRole("link", {
    name: /PLA Basic · Blue filament · 1 spool/,
  });
  await expect(petgShoppingLink).toHaveAttribute(
    "href",
    /eu\.store\.bambulab\.com\/search\?q=PETG/,
  );
  await expect(blueShoppingLink).toHaveAttribute(
    "href",
    "https://eu.store.bambulab.com/products/pla-basic-filament",
  );
  await expect(blueShoppingLink).toHaveAttribute("target", "_blank");
  await expect(blueShoppingLink).toHaveAttribute("rel", "noopener noreferrer");
  // Purchase/inventory effects are covered independently in shopping.spec.js.
  await expect(
    page
      .getByRole("button", { name: "Remove Oat milk from shopping list" })
      .locator("use"),
  ).toHaveAttribute("href", /#icon-remove$/);
  await page
    .getByRole("button", { name: "Remove Oat milk from shopping list" })
    .click();
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(6);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(7);
  await page.getByRole("button", { name: "Add item" }).focus();
  await expect(page.locator(".shopping-card .task-item")).toHaveCount(6);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveCount(
    2,
  );
  await expect(
    page.locator(".task-item__drag-handle, .task-item__pin"),
  ).toHaveCount(0);

  await page.goto("/printing");
  const projects = page.locator(".project-card");
  await expect(projects).toHaveCount(2);
  await expect(projects.getByRole("heading", { level: 2 })).toHaveText([
    "Desk cable clips",
    "Miniature planter",
  ]);
  await expect(
    page.locator(
      ".task-item__drag-handle, .task-item__pin, .task-item__remove",
    ),
  ).toHaveCount(0);
  await expect(projects.first().getByLabel("Project color")).toHaveCount(0);
  expect(CARD_COLORS).toContain(
    await projects
      .first()
      .evaluate(
        (card) =>
          Number(
            card.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
          ) || "",
      ),
  );
  await expect(projects.first().locator("textarea, select")).toHaveCount(0);
  await expect(projects.first().locator(".filament > span")).toHaveText([
    "12 g",
    "1002 g",
    "2 g",
    "8 g",
  ]);
  await expect(projects.first().locator(".missing")).toHaveCount(2);
  await expect(
    projects.first().getByText("Not in catalog · Need 1 spool"),
  ).toBeVisible();
  await expect(
    projects.first().getByText("Missing 1 spool · 1 owned"),
  ).toBeVisible();
  await projects
    .first()
    .getByLabel(/^Actions for/)
    .click();
  await projects.first().getByRole("button", { name: "Add item" }).click();
  const editDialog = page.getByRole("dialog", {
    name: "Edit project",
    exact: true,
  });
  await expect(
    editDialog.getByRole("textbox", { name: "Item name" }),
  ).toHaveCount(4);
  await advisory((expect) =>
    expect(
      editDialog.getByRole("textbox", { name: "Item name" }).last(),
    ).toBeFocused(),
  );
  await expect(projects.first().locator(".task-item")).toHaveCount(3);
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Add project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New project" });
  await projectDialog
    .getByRole("textbox", { name: "Project name" })
    .fill("New 3D project");
  await projectDialog
    .getByRole("textbox", { name: "Item name" })
    .fill("Weighted base");
  await projectDialog
    .getByLabel("Filament 1", { exact: true })
    .selectOption("bambu-pla-basic-filament-10101");
  await projectDialog.getByLabel("Weight 1 (g)", { exact: true }).fill("35");
  await projectDialog.getByRole("button", { name: "Add filament" }).click();
  await advisory((expect) =>
    expect(
      projectDialog.getByLabel("Filament 2", { exact: true }),
    ).toBeFocused(),
  );
  await projectDialog
    .getByLabel("Filament 2", { exact: true })
    .selectOption("bambu-pla-basic-filament-10501");
  await projectDialog.getByLabel("Weight 2 (g)", { exact: true }).fill("7.5");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projects).toHaveCount(3);
  const newProject = projects.filter({
    has: page.getByRole("heading", { name: "New 3D project" }),
  });
  await expect(
    newProject.getByRole("heading", { name: "New 3D project" }),
  ).toBeVisible();
  const projectColor = await newProject.evaluate(
    (card) =>
      Number(
        card.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
      ) || "",
  );
  expect(CARD_COLORS).toContain(projectColor);
  await page.reload();
  const savedProject = newProject;
  await expect(
    savedProject.getByRole("heading", { name: "New 3D project" }),
  ).toBeVisible();
  expect(
    await savedProject.evaluate(
      (card) =>
        Number(
          card.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
        ) || "",
    ),
  ).toBe(projectColor);
  await expect(savedProject.locator(".task-item .title")).toHaveText(
    "Weighted base",
  );
  await savedProject.getByLabel(/^Actions for/).click();
  await savedProject.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editDialog.getByLabel("Item name")).toHaveValue("Weighted base");
  expect(
    await editDialog
      .getByLabel(/^Filament \d+$/)
      .evaluateAll((selects) => selects.map((select) => select.value)),
  ).toEqual([
    "bambu-pla-basic-filament-10101",
    "bambu-pla-basic-filament-10501",
  ]);
  expect(
    await editDialog
      .getByLabel(/^Weight \d+ \(g\)$/)
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["35", "7.5"]);
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/cross-stitch");
  await expect(
    page.getByRole("heading", { level: 1, name: "Cross stitch" }),
  ).toBeVisible();
  await expect(
    page.locator(".project-card").getByRole("heading", { level: 2 }),
  ).toHaveText(["Botanical sampler", "Amsterdam canal house"]);
  const stitchProject = page.locator(".project-card").first();
  await expect(
    stitchProject.getByRole("heading", { name: "Botanical sampler" }),
  ).toBeVisible();
  await expect(stitchProject.getByLabel("Project color")).toHaveCount(0);
  expect(CARD_COLORS).toContain(
    await stitchProject.evaluate(
      (card) =>
        Number(
          card.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
        ) || "",
    ),
  );
  await expect(stitchProject.getByRole("checkbox")).toHaveCount(3);
  await expect(stitchProject.locator("select")).toHaveCount(0);
  await expect(stitchProject.locator(".stitch-color__missing")).toHaveCount(2);
  const stitchProgress = stitchProject.getByRole("progressbar", {
    name: "Progress for Botanical sampler",
  });
  await expect(stitchProgress).toHaveAttribute("value", "971");
  await expect(stitchProgress).toHaveAttribute("max", "2400");
  await stitchProject.getByLabel(/^Actions for/).click();
  await stitchProject
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await editDialog.getByLabel("Crosses done").first().fill("1200");
  await editDialog
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(
    stitchProject.getByRole("checkbox", { checked: true }),
  ).toHaveCount(2);
  await expect(stitchProgress).toHaveAttribute("value", "1600");
  await stitchProject.getByLabel(/^Actions for/).click();
  await stitchProject.getByRole("button", { name: "Add color" }).click();
  const stitchColors = editDialog.locator('select[name="stitch-floss"]');
  await expect(stitchColors).toHaveCount(4);
  await advisory((expect) => expect(stitchColors.last()).toBeFocused());
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/catalog");
  await expect(
    page.getByRole("navigation", { name: "Catalog" }).getByRole("link"),
  ).toHaveText(["3D printing filament", "DMC embroidery floss"]);
  await advisory((expect) =>
    expect(
      page.getByRole("link", { name: "3D printing filament" }),
    ).toHaveAttribute("aria-current", "page"),
  );
  await page.getByRole("link", { name: "DMC embroidery floss" }).click();
  await advisory((expect) =>
    expect(
      page.getByRole("link", { name: "DMC embroidery floss" }),
    ).toHaveAttribute("aria-current", "page"),
  );
  await expect(page.getByLabel("Search floss")).toBeVisible();
  await page.getByRole("link", { name: "3D printing filament" }).click();
  await expect(page.getByLabel("Search filaments")).toBeVisible();
  await expect(page.locator(".jm-catalog-item")).toHaveCount(265);
  await expect(page.getByLabel("Filament type")).toHaveValue("");
  const catalogGroups = await page
    .locator(".jm-catalog-item")
    .evaluateAll((cards) => cards.map((card) => card.dataset.catalogGroup));
  expect(catalogGroups).toEqual(
    [...catalogGroups].sort(
      (first, second) =>
        ["owned", "needed", "other"].indexOf(first) -
        ["owned", "needed", "other"].indexOf(second),
    ),
  );
  await page.getByLabel("Filament type").selectOption("PLA Basic");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(30);
  await page.getByLabel("Filament type").selectOption("");
  await page
    .getByLabel("Search filaments")
    .fill("bambu-pla-basic-filament-10601");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 2, name: "PLA Basic · Blue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /PLA Basic · Blue/ }),
  ).toHaveAttribute(
    "href",
    "https://eu.store.bambulab.com/products/pla-basic-filament",
  );
  await expect(page.locator(".jm-catalog-item__required")).toHaveText("/ 2");
  await advisory((expect) =>
    expect(page.getByLabel("Spools owned")).toHaveAccessibleDescription(
      "Required spools: 2",
    ),
  );
  await expect(page.getByLabel("Spools owned")).toHaveValue("1");
  await page.getByLabel("Spools owned").fill("2");
  await expect(page.locator(".jm-catalog-item--missing")).toHaveCount(0);
  await expect
    .poll(
      () =>
        appDataByPage.get(page).get("filament-inventory")?.[
          "bambu-pla-basic-filament-10601"
        ],
    )
    .toBe(2);

  await page.goto("/printing");
  await expect(page.locator(".project-card .missing")).toHaveCount(1);
  await expect(page.getByText("Missing 1 spool · 1 owned")).toHaveCount(0);

  await page.goto("/catalog?catalog=floss&q=dmc3853");
  await advisory((expect) =>
    expect(
      page.getByRole("link", { name: "DMC embroidery floss" }),
    ).toHaveAttribute("aria-current", "page"),
  );
  await expect(page.getByLabel("Search floss")).toHaveValue("dmc3853");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 2, name: "DMC 3853 · Autumn Gold Dk" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /DMC 3853 · Autumn Gold Dk/ }),
  ).toHaveAttribute("href", "https://www.breibrink.nl/dmc-3853.html");
  await expect(page.locator(".jm-catalog-item__required")).toHaveText("/ 1");
  await advisory((expect) =>
    expect(page.getByLabel("Skeins owned")).toHaveAccessibleDescription(
      "Required skeins: 1",
    ),
  );
  await page.getByLabel("Skeins owned").fill("1");
  await expect(page.locator(".jm-catalog-item--missing")).toHaveCount(0);
  await expect
    .poll(() => appDataByPage.get(page).get("floss-inventory")?.dmc3853)
    .toBe(1);

  await page.goto("/shopping");
  await expect(page.getByLabel("Task title")).toHaveCount(2);
  expect(
    await page
      .getByLabel("Task title")
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["Apples", "Dish soap"]);
  await expect(
    page.getByRole("link", {
      name: /PETG Basic · Charcoal filament · 1 spool/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /PLA Basic · Blue filament/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /DMC .* floss/ })).toHaveCount(0);

  await page.goto("/catalog");
  await page.getByLabel("Search filaments").fill("discontinued-petg-charcoal");
  await expect(page.locator(".jm-catalog-item")).toHaveCount(0);
  await expect(
    page.getByText("No catalog filaments match this search."),
  ).toBeVisible();
});

test("work and chore cards expose only their supported actions", async ({
  page,
}) => {
  await page.goto("/work");
  const workCards = page.locator(".jm-card");
  await expect(workCards).toHaveCount(2);
  await expect(
    workCards.getByRole("button", { name: /^Actions for|^Collapse|^Expand/ }),
  ).toHaveCount(0);
  await expect(workCards.getByRole("progressbar")).toHaveCount(0);
  await page
    .locator(".work-backlog")
    .getByRole("button", { name: "Add backlog task" })
    .click();
  await advisory((expect) =>
    expect(page.locator(".work-backlog textarea").last()).toBeFocused(),
  );

  await page.goto("/chores");
  const today = page.locator(".chores-due");
  const all = page.locator(".chores-all");
  await expect(today.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".jm-card").getByRole("progressbar")).toHaveCount(
    0,
  );
  await expect(all.locator(":scope > header").getByRole("button")).toHaveCount(
    2,
  );
  await expect(
    all.getByRole("button", { name: "Add chore", exact: true }),
  ).toBeVisible();
  const colors = await page
    .locator(".jm-card")
    .evaluateAll((cards) =>
      cards.map(
        (card) =>
          Number(
            card.style.getPropertyValue("--color").match(/--color-(\d+)/)?.[1],
          ) || "",
      ),
    );
  expect(colors).toEqual(["", ""]);
  expect(appDataByPage.get(page).get("colors") ?? {}).not.toHaveProperty(
    "chores-today",
  );
  expect(appDataByPage.get(page).get("colors") ?? {}).not.toHaveProperty(
    "chores-all",
  );
  const dueCount = await today.getByRole("checkbox").count();
  await all.getByRole("button", { name: "Collapse All chores" }).click();
  await expect(
    all.getByRole("textbox", { name: "Task title", exact: true }).first(),
  ).toBeHidden();
  await expect(today.getByRole("checkbox")).toHaveCount(dueCount);
  await all.getByRole("button", { name: "Add chore" }).click();
  await advisory((expect) =>
    expect(
      all.getByRole("button", { name: "Collapse All chores" }),
    ).toHaveAttribute("aria-expanded", "true"),
  );
  await expect(all.getByRole("textbox")).toHaveCount(0);
  await advisory((expect) =>
    expect(
      page
        .getByRole("dialog")
        .getByRole("textbox", { name: "Title", exact: true }),
    ).toBeFocused(),
  );
});

for (const route of ["printing", "cross-stitch"]) {
  test(`${route} cards open an edit modal and support project actions`, async ({
    page,
  }) => {
    await page.goto(`/${route}`);
    const projects = page.locator(".project-card");
    const project = projects.first();
    const menu = project.getByLabel(/^Actions for/);
    const originalTitle = (
      await project.getByRole("heading").textContent()
    ).trim();
    const progress = project.getByRole("progressbar", {
      name: `Progress for ${originalTitle}`,
      exact: true,
    });
    const addLabel = route === "printing" ? "Add item" : "Add color";

    await menu.focus();
    await menu.press("Enter");
    await expect(
      project.locator(".jm-card__menu-actions").getByRole("button"),
    ).toHaveText(["Edit", "Remove", addLabel]);
    await page.keyboard.press("Tab");
    await advisory((expect) =>
      expect(
        project.getByRole("button", { name: "Edit", exact: true }),
      ).toBeFocused(),
    );
    await page.keyboard.press("Escape");
    await advisory((expect) => expect(menu).toBeFocused());
    await expect(
      project.getByRole("button", { name: "Edit", exact: true }),
    ).toBeHidden();
    await menu.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(
      project.getByRole("button", { name: "Edit", exact: true }),
    ).toBeHidden();

    await menu.click();
    await project.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Edit project",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
      true,
    );
    const projectName = dialog.getByRole("textbox", { name: "Project name" });
    await advisory((expect) => expect(projectName).toBeFocused());
    await expect(projectName).toHaveValue(originalTitle);
    await projectName.fill("Discard this edit");
    await expect(project.locator('input[name="card-title"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await advisory((expect) => expect(menu).toBeFocused());
    await expect(project.getByRole("heading")).toHaveText(originalTitle);

    await menu.click();
    await project.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(dialog).toBeVisible();
    await projectName.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(1, 1);
    await expect(dialog).toBeHidden();
    await advisory((expect) => expect(menu).toBeFocused());
    await expect
      .poll(() => appDataByPage.get(page).get(route).projects[0].title)
      .toBe(originalTitle);

    if (route === "printing") {
      await expect(progress).toHaveAttribute("value", "1");
      await expect(progress).toHaveAttribute("max", "3");
      await project
        .getByRole("checkbox", { name: "Complete Large cable clip" })
        .check();
      await expect(progress).toHaveAttribute("value", "2");
    }
    const count = await project.locator(".task-item").count();
    await project
      .getByRole("button", { name: `Collapse ${originalTitle}` })
      .click();
    await expect(project.locator(".task-list")).toBeHidden();
    await expect(progress).toBeVisible();
    await menu.click();
    await project.getByRole("button", { name: addLabel, exact: true }).click();
    await expect(project.locator(".task-list")).toBeVisible();
    await expect(project.locator(".task-item")).toHaveCount(count);
    await advisory((expect) =>
      expect(
        project.getByRole("button", { name: `Collapse ${originalTitle}` }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    if (route === "printing") {
      const itemName = dialog
        .getByRole("textbox", { name: "Item name" })
        .last();
      await advisory((expect) => expect(itemName).toBeFocused());
      await expect(itemName).toHaveValue("");
      await itemName.fill("Added item");
    } else {
      const thread = dialog
        .getByRole("combobox", { name: "Thread color" })
        .last();
      await advisory((expect) => expect(thread).toBeFocused());
      await thread.selectOption("dmc321");
      await dialog
        .getByRole("spinbutton", { name: "Crosses total" })
        .last()
        .fill("100");
    }
    await dialog
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(project.locator(".task-item")).toHaveCount(count + 1);

    await menu.click();
    await project.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(projects).toHaveCount(1);
    await advisory((expect) =>
      expect(page.getByRole("button", { name: "Add project" })).toBeFocused(),
    );
    await expect
      .poll(() => appDataByPage.get(page).get(route).projects.length)
      .toBe(1);
    await page.reload();
    await expect(projects).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: originalTitle }),
    ).toHaveCount(0);
  });
}

test("items move down when checked and back up when unchecked after 500 milliseconds", async ({
  page,
}) => {
  const testTime = Date.now();
  await page.clock.install({ time: testTime });
  await page.goto("/todos");
  const todoTitles = page.locator("#todo-list-general textarea");
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.clock.pauseAt(testTime + 60_000);
  await page.getByRole("checkbox", { name: "Complete Renew passport" }).check();
  await page.clock.runFor(499);
  await expect(todoTitles.first()).toHaveValue("Renew passport");
  await page.clock.runFor(1);
  await expect(todoTitles.last()).toHaveValue("Renew passport");

  await page.reload();
  await expect(todoTitles.last()).toHaveValue("Renew passport");
  await expect(
    page.getByRole("checkbox", { name: "Complete Renew passport" }),
  ).toBeChecked();

  await page
    .getByRole("checkbox", { name: "Complete Renew passport" })
    .uncheck();
  await page.clock.runFor(499);
  await expect(todoTitles.last()).toHaveValue("Renew passport");
  await page.clock.runFor(1);
  await expect(todoTitles.first()).toHaveValue("Renew passport");

  const data = appDataByPage.get(page);
  data.set("chores", {
    tasks: ["Water the plants", "Clean the kitchen"].map((title, index) => ({
      id: `chore-${index}`,
      title,
      details: "Every day",
      nextDue: "2026-01-01",
      completed: false,
      schedule: {
        frequency: "day",
        interval: 1,
        weekdays: [0],
        monthDays: [1],
        startDate: "2026-01-01",
      },
    })),
    occurrenceOrder: ["chore-0", "chore-1"],
  });

  await page.goto("/chores");
  await page.reload();
  const choreTitles = page.locator(".chores-due .task-item .title");
  await expect(choreTitles.first()).toHaveText("Water the plants");
  await page
    .getByRole("checkbox", { name: "Complete Water the plants" })
    .check();
  await page.clock.runFor(499);
  await expect(choreTitles.first()).toHaveText("Water the plants");
  await page.clock.runFor(1);
  await expect(choreTitles.last()).toHaveText("Water the plants");

  await page
    .getByRole("checkbox", { name: "Complete Water the plants" })
    .uncheck();
  await page.clock.runFor(499);
  await expect(choreTitles.last()).toHaveText("Water the plants");
  await page.clock.runFor(1);
  await expect(choreTitles.first()).toHaveText("Water the plants");

  await page.goto("/shopping");
  const shoppingTitles = page.locator(".shopping-card textarea");
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.getByRole("checkbox", { name: "Complete Oat milk" }).check();
  await page.clock.runFor(499);
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");
  await page.clock.runFor(1);
  await expect(shoppingTitles.last()).toHaveValue("Oat milk");

  await page.getByRole("checkbox", { name: "Complete Oat milk" }).uncheck();
  await page.clock.runFor(499);
  await expect(shoppingTitles.last()).toHaveValue("Oat milk");
  await page.clock.runFor(1);
  await expect(shoppingTitles.first()).toHaveValue("Oat milk");

  await page.goto("/printing");
  const printingTitles = page
    .locator(".project-card")
    .first()
    .locator(".task-item .title");
  await expect(printingTitles.first()).toHaveText("Large cable clip");
  await page
    .getByRole("checkbox", { name: "Complete Large cable clip" })
    .check();
  await page.clock.runFor(499);
  await expect(printingTitles.first()).toHaveText("Large cable clip");
  await page.clock.runFor(1);
  await expect(printingTitles.last()).toHaveText("Large cable clip");

  await page
    .getByRole("checkbox", { name: "Complete Large cable clip" })
    .uncheck();
  await page.clock.runFor(499);
  await expect(printingTitles.last()).toHaveText("Large cable clip");
  await page.clock.runFor(1);
  await expect(printingTitles.first()).toHaveText("Large cable clip");

  await page.goto("/cross-stitch");
  const stitch = page.locator(".project-card").first();
  const checkboxes = stitch.getByRole("checkbox");
  const firstId = await checkboxes.first().getAttribute("id");
  const checkbox = page.locator(`#${firstId}`);
  await checkbox.check();
  await page.clock.runFor(499);
  await expect(checkboxes.first()).toHaveAttribute("id", firstId);
  await page.clock.runFor(1);
  await expect(checkboxes.last()).toHaveAttribute("id", firstId);
  await checkbox.uncheck();
  await page.clock.runFor(499);
  await expect(checkboxes.last()).toHaveAttribute("id", firstId);
  await page.clock.runFor(1);
  await expect(checkboxes.first()).toHaveAttribute("id", firstId);
});
